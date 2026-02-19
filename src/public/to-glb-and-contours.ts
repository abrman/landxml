import { FeatureCollection, LineString } from "geojson";
import filterBySurfaceId from "../private/filter-by-surfaceId";
import parseXML, { ParsedSurface } from "../private/parse-xml";
import getContours, { precomputeSurfaceData } from "../private/get-contours";
import getGlb from "../private/get-glb";
import getOutline from "../private/get-outline";
import downloadGlb from "../private/download-glb";

export type GlbAndContoursResult = {
  name: string;
  description: string;
  sourceFile: string;
  timeStamp: string;
  wktString?: string;
  /** Binary GLB data */
  glb: Uint8Array;
  /** XY center used to offset the GLB model from origin */
  center: [x: number, y: number];
  /** Convenience download trigger (browser only) */
  download: () => void;
  /** Contour lines + optional outline as a GeoJSON FeatureCollection */
  geojson: FeatureCollection<LineString, { z: number }>;
};

/**
 * Converts a LandXML string into **both** a GLB 3-D model and GeoJSON contour
 * lines in a single pass — the XML is parsed once and the triangle/elevation
 * data computed once and shared between both outputs.
 *
 * Use this instead of calling `toGlb` + `toGeojsonContours` separately when
 * you need both outputs, as it eliminates all redundant work.
 *
 * @param landXmlString   Raw LandXML string
 * @param contourInterval Vertical interval between contour lines (default 2)
 * @param generateOutline When true, the outline of each surface is appended to
 *                        the GeoJSON as a z=0 feature (default true)
 * @param center          GLB origin strategy: "auto" (median XY), "origin" ([0,0]),
 *                        or an explicit [x, y] pair (default "auto")
 * @param surfaceId       Surface name or 0-based index to process a single
 *                        surface; -1 processes all surfaces (default -1)
 */
const toGlbAndContours = async (
  landXmlString: string,
  contourInterval: number = 2,
  generateOutline: boolean = true,
  center: "auto" | "origin" | [x: number, y: number] = "auto",
  surfaceId: string | number = -1,
): Promise<GlbAndContoursResult[]> => {
  const requestedCenter = center === "origin" ? ([0, 0] as [number, number]) : center === "auto" ? undefined : center;

  const requestedParsedSurfaces = filterBySurfaceId(await parseXML(landXmlString), surfaceId);

  const results = await Promise.all(
    requestedParsedSurfaces.map(async (surface): Promise<GlbAndContoursResult> => {
      // OPTIMIZATION: precompute triangles + elevation range once; both
      // getContours() and getGlb() reuse this data without re-traversing faces/points.
      const precomputed = precomputeSurfaceData(surface);

      // Run GLB generation and contour generation concurrently — they are
      // independent once the precomputed data is available.
      const [{ glb, center: resolvedCenter }, geojson] = await Promise.all([
        getGlb(surface, requestedCenter),
        getContours(surface, contourInterval, precomputed),
      ]);

      if (generateOutline) {
        const outlineGeojson = getOutline(surface);
        geojson.features = [...geojson.features, ...outlineGeojson.features];
      }

      const { surfaceDefinition, ...rest } = surface;

      return {
        ...rest,
        glb,
        center: resolvedCenter,
        download: () => {
          downloadGlb(glb, surface.name.replace(/\.xml$/, `${JSON.stringify(resolvedCenter)}.glb`));
        },
        geojson,
      };
    }),
  );

  return results;
};

export default toGlbAndContours;
