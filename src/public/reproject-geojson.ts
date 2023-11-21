import { FeatureCollection } from "geojson";
import proj4 from "proj4";

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
  keepOriginalGeometryAsFeatureProperty: boolean = true
) => {
  const transformCoordinates = (coordinates: any[], sourceProjection: string, targetProjection: string) => {
    if (Array.isArray(coordinates[0])) {
      coordinates = coordinates.map((subCoordinates) =>
        transformCoordinates(subCoordinates, sourceProjection, targetProjection)
      );
    } else {
      coordinates = proj4(sourceProjection, targetProjection, coordinates);
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
          targetProjection
        );
      }
    }
  });

  return geojson;
};

export default reprojectGeoJson;
