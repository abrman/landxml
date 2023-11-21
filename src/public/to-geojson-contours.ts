import { FeatureCollection, LineString } from "geojson";
import filterBySurfaceId from "../private/filter-by-surfaceId";
import parseXML from "../private/parse-xml";
import getContours from "../private/get-contours";

/**
 * @param landXmlString
 * @param contourInterval Interval at which you would like to generate contour lines
 * @param surfaceId Surface name or index if your LandXML contains multiple surfaces. By default all surfaces are converted and returns an array of glb Uint8Array
 * @returns {Object[]} surfaceContours - Array of processed surface contours (will also return an array when just one surface has been processed)
 * @returns {string} surfaceContours[].name - Name of surface as defined in LandXML
 * @returns {string} surfaceContours[].description - Description of surface as defined in LandXML
 * @returns {string} surfaceContours[].sourceFile - Source file of where the LandXML was generated from.
 * @returns {string} surfaceContours[].timeStamp - Timestamp of when the surface was exported into LandXML
 * @returns {string} surfaceContours[].wktString - WKT string of LandXML coordinate system projection
 * @returns {Object} surfaceContours[].geojson - Geojson feature collection of contour lines
 */
const toGeojsonContours = async (
  landXmlString: string,
  contourInterval: number = 2,
  surfaceId: string | number = -1
) => {
  let requestedParsedSurfaces = filterBySurfaceId(await parseXML(landXmlString), surfaceId);

  const contours = await Promise.all(
    requestedParsedSurfaces.map(
      (surface) =>
        new Promise<{
          name: string;
          description: string;
          sourceFile: string;
          timeStamp: string;
          geojson: FeatureCollection<LineString, { z: number }>;
        }>(async (resolve, reject) => {
          try {
            const geojson = await getContours(surface, contourInterval);
            const { surfaceDefinition, ...rest } = surface;
            resolve({
              ...rest,
              geojson,
            });
          } catch (e) {
            reject(e);
          }
        })
    )
  );
  return contours;
};

export default toGeojsonContours;
