export { default as toGlb } from "./public/to-glb";
export { default as toGeojsonContours } from "./public/to-geojson-contours";
export { default as reprojectGeoJson } from "./public/reproject-geojson";
export { default as toGlbAndContours } from "./public/to-glb-and-contours";
export type { GlbAndContoursResult } from "./public/to-glb-and-contours";

// Lower-level building blocks — parse once, then build only what you need (with progress)
export { parseSurfaces, findCenter, surfaceToGlb, surfaceToContours } from "./public/surfaces";
export type { LandXmlSurface, GlbCenter } from "./public/surfaces";
