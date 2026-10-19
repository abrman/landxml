import { FeatureCollection, LineString } from "geojson";
import { parseSurfaces, surfaceInfo, surfaceToContours } from "./surfaces";

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
 * @returns {string} surfaceContours[].linearUnit - Linear unit declared in the LandXML's `<Units>`
 * @returns {Object} surfaceContours[].geojson - Geojson feature collection of contour lines
 */
const toGeojsonContours = async (
  landXmlString: string,
  contourInterval: number = 2,
  generateOutline: boolean = true,
  surfaceId: string | number = -1,
): Promise<
  {
    name: string;
    description: string;
    sourceFile: string;
    timeStamp: string;
    wktString?: string;
    linearUnit?: string;
    geojson: FeatureCollection<LineString, { z: number }>;
  }[]
> => {
  const surfaces = await parseSurfaces(landXmlString, { surfaceId });
  return Promise.all(
    surfaces.map(async (surface) => ({
      ...surfaceInfo(surface),
      geojson: await surfaceToContours(surface, contourInterval, generateOutline),
    })),
  );
};

export default toGeojsonContours;
