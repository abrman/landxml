/**
 * Streaming LandXML surface parser.
 *
 * Scans the XML text for the few elements a TIN surface needs (`<P>` points and
 * `<F>` faces) straight into typed arrays, without building a DOM / object tree
 * of the whole document — a large LandXML (tens of MB) would otherwise take
 * gigabytes of memory. Point ids resolve through a Map, so parsing is linear in
 * the size of the file.
 */

export type ParsedSurface = {
  sourceFile: string;
  timeStamp: string;
  name: string;
  description: string;
  /** The file's `<CoordinateSystem ogcWktCode>`, when it declares one. */
  wktString?: string;
  /** The file's `<Units>` linear unit (e.g. "USSurveyFoot", "foot", "meter"), when it declares one. */
  linearUnit?: string;
  surfaceDefinition: {
    /** x, y, z per point (x = easting, y = northing — LandXML lists northing first). */
    points: Float64Array;
    /** Three point indices per visible face (`<F i="1">` faces are left out). */
    faces: Uint32Array;
  };
};

export type ParseOptions = {
  /** Called as parsing advances through the file, with the fraction (0–1) read so far. */
  onProgress?: (fraction: number) => void;
};

const NAMED_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const ENTITY = /&(?:#(\d+)|#x([0-9a-fA-F]+)|(amp|lt|gt|quot|apos));/g;

export const decodeXmlEntities = (s: string) =>
  s.indexOf("&") < 0
    ? s
    : s.replace(ENTITY, (_, dec?: string, hex?: string, named?: string) =>
        dec ? String.fromCodePoint(Number(dec)) : hex ? String.fromCodePoint(parseInt(hex, 16)) : NAMED_ENTITIES[named!]!,
      );

/** An attribute's (decoded) value from a tag's attribute text, or undefined. */
const attrOf = (attrs: string, name: string): string | undefined => {
  const m = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(attrs);
  return m ? decodeXmlEntities(m[1] ?? m[2] ?? "") : undefined;
};

type Tag = { attrs: string; start: number; end: number; selfClosing: boolean };

/** The first `<tag …>` opening in xml[from, to), not matching longer names (`<Surface` skips `<Surfaces>`). */
const findTag = (xml: string, tag: string, from: number, to: number): Tag | undefined => {
  const re = new RegExp(`<${tag}(?=[\\s/>])([^>]*)>`, "g");
  re.lastIndex = from;
  const m = re.exec(xml);
  if (!m || m.index >= to) return undefined;
  const raw = m[1] ?? "";
  const selfClosing = raw.endsWith("/");
  return { attrs: selfClosing ? raw.slice(0, -1) : raw, start: m.index, end: re.lastIndex, selfClosing };
};

/** Where `</tag>` starts in xml[from, to), or -1. */
const findClose = (xml: string, tag: string, from: number, to: number) => {
  const i = xml.indexOf(`</${tag}>`, from);
  return i >= 0 && i < to ? i : -1;
};

/** Let the event loop run (keeps a page responsive and progress repainting during a long parse). */
const yieldToEventLoop = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const YIELD_EVERY = 20_000;

const ID_ATTR = /(?:^|\s)id\s*=\s*(?:"([^"]*)"|'([^']*)')/;
const INVISIBLE_ATTR = /(?:^|\s)i\s*=\s*["']1["']/;
const WHITESPACE = /\s+/;

const parseXML = async (xml: string, options: ParseOptions = {}): Promise<ParsedSurface[]> => {
  const { onProgress } = options;
  const total = xml.length || 1;
  let sinceYield = 0;
  /** True once every YIELD_EVERY elements — then report progress and `await pause(…)`. */
  const due = () => ++sinceYield >= YIELD_EVERY;
  const pause = (at: number) => {
    sinceYield = 0;
    onProgress?.(at / total);
    return yieldToEventLoop();
  };

  const surfacesTag = findTag(xml, "Surfaces", 0, xml.length);
  if (!surfacesTag || surfacesTag.selfClosing) throw new Error("LandXML doesn't contain any surfaces");
  const surfacesEnd = Math.max(findClose(xml, "Surfaces", surfacesTag.end, xml.length), surfacesTag.end);

  // File-level details live before <Surfaces>.
  const head = surfacesTag.start;
  const sourceFile = attrOf(findTag(xml, "Project", 0, head)?.attrs ?? "", "name") || "Undefined source";
  const timeStamp = attrOf(findTag(xml, "Application", 0, head)?.attrs ?? "", "timeStamp") || "";
  const wktString = attrOf(findTag(xml, "CoordinateSystem", 0, head)?.attrs ?? "", "ogcWktCode") || undefined;
  const unitsTag = findTag(xml, "Units", 0, head);
  const unitTag = unitsTag && (findTag(xml, "Imperial", unitsTag.end, head) ?? findTag(xml, "Metric", unitsTag.end, head));
  const linearUnit = (unitTag && attrOf(unitTag.attrs, "linearUnit")) || undefined;

  const surfaces: ParsedSurface[] = [];
  let cursor = surfacesTag.end;
  for (;;) {
    const surfaceTag = findTag(xml, "Surface", cursor, surfacesEnd);
    if (!surfaceTag) break;
    if (surfaceTag.selfClosing) {
      cursor = surfaceTag.end;
      continue;
    }
    const surfaceEnd = findClose(xml, "Surface", surfaceTag.end, surfacesEnd);
    if (surfaceEnd < 0) break;
    cursor = surfaceEnd;

    const name = attrOf(surfaceTag.attrs, "name") ?? "";
    const description = attrOf(surfaceTag.attrs, "desc") || "";

    // Only the TIN definition — <SourceData> (breaklines etc.) is skipped.
    const definition = findTag(xml, "Definition", surfaceTag.end, surfaceEnd);
    const pntsTag = definition && findTag(xml, "Pnts", definition.end, surfaceEnd);
    const pntsEnd = pntsTag ? findClose(xml, "Pnts", pntsTag.end, surfaceEnd) : -1;
    if (!pntsTag || pntsEnd < 0) {
      console.warn(`LandXML surface "${name}" has no points — skipped.`);
      continue;
    }

    // ── Points ───────────────────────────────────────────────────────────────
    const coords: number[] = [];
    const indexById = new Map<string, number>();
    const pointRe = /<P(?=[\s>])([^>]*)>([^<]*)<\/P>/g;
    pointRe.lastIndex = pntsTag.end;
    for (let m = pointRe.exec(xml); m && m.index < pntsEnd; m = pointRe.exec(xml)) {
      const index = coords.length / 3;
      const idMatch = ID_ATTR.exec(m[1] ?? "");
      indexById.set(idMatch ? (idMatch[1] ?? idMatch[2] ?? "") : String(index + 1), index);
      // LandXML lists northing, easting, elevation.
      const [n, e, z] = (m[2] ?? "").trim().split(WHITESPACE);
      coords.push(Number(e), Number(n), Number(z));
      if (due()) await pause(pointRe.lastIndex);
    }

    // ── Faces ────────────────────────────────────────────────────────────────
    const faceIndices: number[] = [];
    const facesTag = findTag(xml, "Faces", pntsEnd, surfaceEnd);
    const facesEnd = facesTag ? findClose(xml, "Faces", facesTag.end, surfaceEnd) : -1;
    let unresolved = 0;
    if (facesTag && facesEnd >= 0) {
      const faceRe = /<F(?=[\s>])([^>]*)>([^<]*)<\/F>/g;
      faceRe.lastIndex = facesTag.end;
      for (let m = faceRe.exec(xml); m && m.index < facesEnd; m = faceRe.exec(xml)) {
        if (due()) await pause(faceRe.lastIndex);
        if (INVISIBLE_ATTR.test(m[1] ?? "")) continue;
        const [a, b, c] = (m[2] ?? "").trim().split(WHITESPACE).map((id) => indexById.get(id));
        if (a === undefined || b === undefined || c === undefined) {
          unresolved++;
          continue;
        }
        faceIndices.push(a, b, c);
      }
    }
    if (unresolved > 0) console.warn(`LandXML surface "${name}": ${unresolved} faces reference missing points — skipped.`);

    surfaces.push({
      sourceFile,
      timeStamp,
      name,
      description,
      wktString,
      linearUnit,
      surfaceDefinition: { points: Float64Array.from(coords), faces: Uint32Array.from(faceIndices) },
    });
  }

  if (surfaces.length === 0) throw new Error("LandXML doesn't contain any surfaces");
  onProgress?.(1);
  return surfaces;
};

export default parseXML;
