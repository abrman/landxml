import filterBySurfaceId from "../private/filter-by-surfaceId";
import getGlb from "../private/get-glb";
import downloadGlb from "../private/download-glb";
import parseXML, { ParsedSurface } from "../private/parse-xml";

/**
 * @param landXmlString
 * @param center 3D models don't work well when they're far from origin (coordinate `[0,0,0]`), therefore by default your center is moved to the median of x and y axis of your surface
 * @param surfaceId Surface name or index if your LandXML contains multiple surfaces. By default all surfaces are converted and returns an array of glb Uint8Array
 * @returns {Object[]} glbs - Array of processed glbs (will also return an array when just one surface has been processed)
 * @returns {string} glbs[].name - Name of surface as defined in LandXML
 * @returns {string} glbs[].description - Description of surface as defined in LandXML
 * @returns {string} glbs[].sourceFile - Source file of where the LandXML was generated from.
 * @returns {string} glbs[].timeStamp - Timestamp of when the surface was exported into LandXML
 * @returns {Uint8Array} glbs[].glb - Uint8Array binary data of glb
 * @returns {[number, number]} glbs[].center - Offset center of the processed glb
 * @returns {function(): void} glbs[].download - Convenient way to download the GLB, within the filename the new center will be appended.
 */

const toGlb = async (
  landXmlString: string,
  center: "auto" | "origin" | [x: number, y: number] = "auto",
  surfaceId: string | number = -1
): Promise<
  {
    name: string;
    description: string;
    sourceFile: string;
    timeStamp: string;
    glb: Uint8Array;
    center: [x: number, y: number];
    download: () => void;
  }[]
> => {
  const requestedCenter = center == "origin" ? ([0, 0] as [number, number]) : center === "auto" ? undefined : center;

  let requestedParsedSurfaces = filterBySurfaceId(await parseXML(landXmlString), surfaceId);

  const glbs = await Promise.all(
    requestedParsedSurfaces.map(
      (surface) =>
        new Promise<{
          name: string;
          description: string;
          sourceFile: string;
          timeStamp: string;
          glb: Uint8Array;
          center: [x: number, y: number];
          download: () => void;
        }>(async (resolve, reject) => {
          try {
            const { glb, center } = await getGlb(surface, requestedCenter);
            const { surfaceDefinition, ...rest } = surface;
            resolve({
              ...rest,
              glb,
              center,
              download: () => {
                downloadGlb(glb, surface.name.replace(/\.xml$/, `${JSON.stringify(center)}.glb`));
              },
            });
          } catch (e) {
            reject(e);
          }
        })
    )
  );
  return glbs;
};

export default toGlb;
