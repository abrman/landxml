import downloadGlb from "../private/download-glb";
import { findCenter, parseSurfaces, surfaceInfo, surfaceToGlb, type GlbCenter } from "./surfaces";

/**
 * @param landXmlString
 * @param center 3D models don't work well when they're far from origin (coordinate `[0,0,0]`), therefore by default your center is moved to the median of x and y axis of your surface.
 *   When processing multiple surfaces with `"auto"`, a **single shared center** is computed
 *   from all surfaces combined so they remain correctly positioned relative to each other.
 * @param surfaceId Surface name or index if your LandXML contains multiple surfaces. By default all surfaces are converted and returns an array of glb Uint8Array
 * @returns {Object[]} glbs - Array of processed glbs (will also return an array when just one surface has been processed)
 * @returns {string} glbs[].name - Name of surface as defined in LandXML
 * @returns {string} glbs[].description - Description of surface as defined in LandXML
 * @returns {string} glbs[].sourceFile - Source file of where the LandXML was generated from.
 * @returns {string} glbs[].timeStamp - Timestamp of when the surface was exported into LandXML
 * @returns {string} glbs[].wktString - WKT string of LandXML coordinate system projection
 * @returns {string} glbs[].linearUnit - Linear unit declared in the LandXML's `<Units>`
 * @returns {Uint8Array} glbs[].glb - Uint8Array binary data of glb
 * @returns {[number, number]} glbs[].center - Shared offset center applied to all GLBs
 * @returns {function(): void} glbs[].download - Convenient way to download the GLB, within the filename the new center will be appended.
 */
const toGlb = async (
  landXmlString: string,
  center: GlbCenter = "auto",
  surfaceId: string | number = -1,
): Promise<
  {
    name: string;
    description: string;
    sourceFile: string;
    timeStamp: string;
    wktString?: string;
    linearUnit?: string;
    glb: Uint8Array;
    center: [x: number, y: number];
    download: () => void;
  }[]
> => {
  const surfaces = await parseSurfaces(landXmlString, { surfaceId });
  const resolvedCenter = findCenter(surfaces, center);

  return Promise.all(
    surfaces.map(async (surface) => {
      const glb = await surfaceToGlb(surface, resolvedCenter);
      return {
        ...surfaceInfo(surface),
        glb,
        center: resolvedCenter,
        download: () => downloadGlb(glb, surface.name.replace(/\.xml$/, `${JSON.stringify(resolvedCenter)}.glb`)),
      };
    }),
  );
};

export default toGlb;
