import { createEasyWebWorker } from "easy-web-worker";
import convert from "xml-js";

export type ParsedSurface = {
  sourceFile: string;
  timeStamp: string;
  name: string;
  description: string;
  wktString?: string;
  surfaceDefinition: {
    points: [x: number, y: number, z: number][];
    faces: [vertIndexA: number, vertIndexB: number, vertIndexC: number][];
    faceNeighbors: [faceIndex: number, faceIndex: number, faceIndex: number][];
  };
};

const surfaceDefWorker = createEasyWebWorker<
  | {
      task: "parse-surface-points";
      points: SurfacePoint[];
    }
  | {
      task: "parse-surface-faces";
      faces: SurfaceFace[];
      idMap?: string[];
    }
  | {
      task: "find-neighboring-faces";
      faces: [vertIndex: number, vertIndex: number, vertIndex: number][];
      // range is no longer needed — the whole face list is processed in one O(n) pass
    },
  | [id: string, [x: number, y: number, z: number]][]
  | [vertIndex: number, vertIndex: number, vertIndex: number][]
  | [faceIndex: number, faceIndex: number, faceIndex: number][]
>(
  ({ onMessage }) => {
    onMessage((message) => {
      try {
        const { task } = message.payload;

        // ─── parse-surface-points ────────────────────────────────────────────
        if (task === "parse-surface-points") {
          const { points } = message.payload;
          message.resolve(
            points
              .map((pt) => [pt.attr.id, pt.content.split(" ").map(Number) as [number, number, number]] as const)
              .map((v) => [v[0] as string, [v[1][1], v[1][0], v[1][2]] as [number, number, number]]),
          );

          // ─── parse-surface-faces ────────────────────────────────────────────
        } else if (task === "parse-surface-faces") {
          const { faces, idMap } = message.payload;
          message.resolve(
            faces.flatMap((f) => {
              if (typeof f === "string")
                return [f.split(" ").map((id) => idMap?.indexOf(id)) as [number, number, number]];
              if (f?.attr?.i === "1") return [];
              return [f.content.split(" ").map((id) => idMap?.indexOf(id)) as [number, number, number]];
            }),
          );

          // ─── find-neighboring-faces ──────────────────────────────────────────
          // OPTIMIZATION: was O(n²) — three linear scans of `faces` per face.
          // Now O(n) using an edge-to-face hash map.
          // For every face we store its index under the two canonical edge keys
          // that bound it. A neighbour lookup is then a single Map.get() call.
        } else if (task === "find-neighboring-faces") {
          const { faces } = message.payload;

          // Build: edgeKey → [faceIndexA, faceIndexB?]
          // Edge key is "minVert,maxVert" so orientation doesn't matter.
          const edgeMap = new Map<string, [number, number?]>();

          const edgeKey = (a: number, b: number) => (a < b ? `${a},${b}` : `${b},${a}`);

          for (let i = 0; i < faces.length; i++) {
            const [v0, v1, v2] = faces[i] as [number, number, number];
            for (const key of [edgeKey(v0, v1), edgeKey(v1, v2), edgeKey(v0, v2)]) {
              const existing = edgeMap.get(key);
              if (!existing) {
                edgeMap.set(key, [i]);
              } else if (existing.length === 1) {
                existing.push(i);
              }
              // More than 2 faces sharing an edge = non-manifold; ignore extras.
            }
          }

          // Now resolve neighbours in a second O(n) pass.
          const faceNeighbors: [number, number, number][] = new Array(faces.length);
          for (let i = 0; i < faces.length; i++) {
            const [v0, v1, v2] = faces[i] as [number, number, number];
            const resolve = (key: string): number => {
              const pair = edgeMap.get(key);
              if (!pair || pair.length < 2) return -1;
              return pair[0] === i ? (pair[1] as number) : pair[0];
            };
            faceNeighbors[i] = [resolve(edgeKey(v0, v1)), resolve(edgeKey(v1, v2)), resolve(edgeKey(v0, v2))];
          }

          message.resolve(faceNeighbors);
        }
      } catch (e) {
        message.reject(e);
      }
    });
  },
  { maxWorkers: 16 },
);

// ─── helpers ────────────────────────────────────────────────────────────────

/**
 * Split an array into `count` roughly equal chunks and dispatch each chunk to
 * the worker pool in parallel, then concatenate the results.
 */
async function parallelChunks<T, R>(
  items: T[],
  count: number,
  makePayload: (chunk: T[], start: number, end: number) => Parameters<typeof surfaceDefWorker.send>[0],
): Promise<R[]> {
  const sliceIndexes = [...Array(count).keys()].map((i) => Math.round((items.length / count) * i));
  const chunks = await Promise.all(
    sliceIndexes.map((start, i, arr) => {
      const end = arr[i + 1] ?? items.length;
      return surfaceDefWorker.send(makePayload(items.slice(start, end), start, end));
    }),
  );
  return (chunks as R[][]).reduce((acc, c) => acc.concat(c), []);
}

const CHUNK_THRESHOLD = 10_000;
const CHUNK_COUNT = 20;

// ─── main export ────────────────────────────────────────────────────────────

const parseXML = async (xmlString: string): Promise<ParsedSurface[]> => {
  const parsed = convert.xml2js(xmlString, {
    compact: true,
    attributesKey: "attr",
    textKey: "content",
  }) as LandXML;

  if (typeof parsed.LandXML?.Surfaces?.Surface === "undefined") {
    throw new Error("LandXML doesn't contain any surfaces");
  }

  if (!Array.isArray(parsed.LandXML.Surfaces.Surface)) {
    parsed.LandXML.Surfaces.Surface = [parsed.LandXML.Surfaces.Surface];
  }

  const sourceFile = parsed.LandXML.Project.attr.name || "Undefined source";
  const timeStamp = parsed.LandXML.Application.attr.timeStamp || "";
  const wktString = parsed.LandXML?.CoordinateSystem?.attr?.ogcWktCode || undefined;

  const surfaces = (parsed.LandXML.Surfaces.Surface as Surface[]).map(async (surface): Promise<ParsedSurface> => {
    const { name, desc } = surface.attr;
    const Pnts = surface.Definition.Pnts.P;
    const Faces = surface.Definition.Faces.F;

    // ── Points ────────────────────────────────────────────────────────────
    const ptsIdArray: [id: string, [x: number, y: number, z: number]][] =
      Pnts.length > CHUNK_THRESHOLD
        ? await parallelChunks<SurfacePoint, [string, [number, number, number]]>(Pnts, CHUNK_COUNT, (chunk) => ({
            task: "parse-surface-points",
            points: chunk,
          }))
        : ((await surfaceDefWorker.send({
            task: "parse-surface-points",
            points: Pnts,
          })) as [string, [number, number, number]][]);

    const points = ptsIdArray.map((v) => v[1]);
    const pointsIdMap = ptsIdArray.map((v) => v[0]);

    // ── Faces ─────────────────────────────────────────────────────────────
    const faces: [number, number, number][] =
      Faces.length > CHUNK_THRESHOLD
        ? await parallelChunks<SurfaceFace, [number, number, number]>(Faces, CHUNK_COUNT, (chunk) => ({
            task: "parse-surface-faces",
            faces: chunk,
            idMap: pointsIdMap,
          }))
        : ((await surfaceDefWorker.send({
            task: "parse-surface-faces",
            faces: Faces,
            idMap: pointsIdMap,
          })) as [number, number, number][]);

    // ── Neighbors ─────────────────────────────────────────────────────────
    // OPTIMIZATION: neighbor finding is now a single O(n) pass inside one
    // worker call. Chunking was only needed to work around the old O(n²)
    // cost; the new edge-map algorithm makes splitting unnecessary and
    // actually harmful (split chunks can't see cross-chunk edges).
    const faceNeighbors = (await surfaceDefWorker.send({
      task: "find-neighboring-faces",
      faces,
    })) as [number, number, number][];

    return {
      sourceFile,
      timeStamp,
      name,
      description: desc || "",
      wktString,
      surfaceDefinition: { points, faces, faceNeighbors },
    };
  });

  return Promise.all(surfaces);
};

export default parseXML;
