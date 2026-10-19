import { FeatureCollection, LineString } from "geojson";
import downloadGlb from "../private/download-glb";
import { findCenter, parseSurfaces, surfaceInfo, surfaceToContours, surfaceToGlb, type GlbCenter } from "./surfaces";

export type GlbAndContoursResult = {
  name: string;
  description: string;
  sourceFile: string;
  timeStamp: string;
  wktString?: string;
  /** Linear unit declared in the LandXML's `<Units>` (e.g. "USSurveyFoot", "meter") */
  linearUnit?: string;
  /** Binary GLB data */
  glb: Uint8Array;
  /** Shared XY center used to offset all GLB models from origin */
  center: [x: number, y: number];
  /** Convenience download trigger (browser only) */
  download: () => void;
  /** Contour lines + optional outline as a GeoJSON FeatureCollection */
  geojson: FeatureCollection<LineString, { z: number }>;
};

/**
 * Converts a LandXML string into **both** a GLB 3-D model and GeoJSON contour
 * lines in a single pass — the XML is parsed once and shared between both outputs.
 *
 * Use this instead of calling `toGlb` + `toGeojsonContours` separately when
 * you need both outputs, as it eliminates all redundant work.
 *
 * When processing multiple surfaces with `center: "auto"`, a **single shared
 * center** is computed from all surfaces combined, so every GLB is offset by
 * the same origin and surfaces remain correctly positioned relative to each other.
 *
 * @param landXmlString   Raw LandXML string
 * @param contourInterval Vertical interval between contour lines (default 2)
 * @param generateOutline When true, the outline of each surface is appended to
 *                        the GeoJSON as a z=0 feature (default true)
 * @param center          GLB origin strategy: "auto" (combined median XY of all surfaces),
 *                        "origin" ([0,0]), or an explicit [x, y] pair (default "auto")
 * @param surfaceId       Surface name or 0-based index to process a single
 *                        surface; -1 processes all surfaces (default -1)
 */
const toGlbAndContours = async (
  landXmlString: string,
  contourInterval: number = 2,
  generateOutline: boolean = true,
  center: GlbCenter = "auto",
  surfaceId: string | number = -1,
): Promise<GlbAndContoursResult[]> => {
  const surfaces = await parseSurfaces(landXmlString, { surfaceId });
  const resolvedCenter = findCenter(surfaces, center);

  return Promise.all(
    surfaces.map(async (surface): Promise<GlbAndContoursResult> => {
      // GLB and contours are independent once parsed — build them concurrently.
      const [glb, geojson] = await Promise.all([
        surfaceToGlb(surface, resolvedCenter),
        surfaceToContours(surface, contourInterval, generateOutline),
      ]);
      return {
        ...surfaceInfo(surface),
        glb,
        center: resolvedCenter,
        download: () => downloadGlb(glb, surface.name.replace(/\.xml$/, `${JSON.stringify(resolvedCenter)}.glb`)),
        geojson,
      };
    }),
  );
};

export default toGlbAndContours;
