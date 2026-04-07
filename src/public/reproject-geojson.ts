import { FeatureCollection } from "geojson";
import proj from "mproj";

// mproj only accepts proj4 strings — resolve named aliases and convert WKT as needed
const NAMED_PROJECTIONS: Record<string, string> = {
  WGS84: "+proj=longlat +datum=WGS84 +no_defs",
};

const toProj4String = (projection: string): string => {
  if (NAMED_PROJECTIONS[projection]) return NAMED_PROJECTIONS[projection]!;
  if (/^(PROJCS|GEOGCS|COMPD_CS|GEOCCS|VERT_CS|LOCAL_CS)\s*\[/i.test(projection.trim()))
    return proj.internal.wkt_to_proj4(projection);
  return projection;
};

/**
 * @param geojson
 * @param sourceProjection can be a proj4 string or WKT string, you will likely have a wkt string available with your LandXML if you used Civil 3D exporter and had your drawing geo-referenced
 * @param targetProjection you will most likely want to use WGS84 for online viewing, however any other projection you might need can be used as long as it's valid
 * @param keepOriginalGeometryAsFeatureProperty if you intend to repurpose the original geometry, it can be added to geojson feature properties
 * @returns {FeatureCollection} Geojson FeatureCollection with updated geometry coordinates
 */
const reprojectGeoJson = (
  geojson: FeatureCollection,
  sourceProjection: string,
  targetProjection: string = "WGS84",
  keepOriginalGeometryAsFeatureProperty: boolean = true,
) => {
  const transformCoordinates = (coordinates: any[], sourceProjection: string, targetProjection: string) => {
    if (Array.isArray(coordinates[0])) {
      coordinates = coordinates.map((subCoordinates) =>
        transformCoordinates(subCoordinates, sourceProjection, targetProjection),
      );
    } else {
      coordinates = proj(toProj4String(sourceProjection), toProj4String(targetProjection), coordinates);
    }
    return coordinates;
  };

  if (!geojson || !geojson.features || !Array.isArray(geojson.features) || !sourceProjection) {
    throw new Error("Invalid GeoJSON or source projection.");
  }

  geojson.features.forEach((feature) => {
    if (keepOriginalGeometryAsFeatureProperty) feature.properties = feature.properties || {};

    if (feature.geometry) {
      if (keepOriginalGeometryAsFeatureProperty && feature.properties)
        feature.properties._rawGeometry = { ...feature.geometry };

      if (sourceProjection !== targetProjection) {
        (feature.geometry as any).coordinates = transformCoordinates(
          (feature.geometry as any).coordinates,
          sourceProjection,
          targetProjection,
        );
      }
    }
  });

  return geojson;
};

export default reprojectGeoJson;
