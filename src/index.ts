export { default as toGlb } from "./public/to-glb";
export { default as toGeojsonContours } from "./public/to-geojson-contours";
export { default as reprojectGeoJson } from "./public/reproject-geojson";
export { default as toGlbAndContours } from "./public/to-glb-and-contours";
export type { GlbAndContoursResult } from "./public/to-glb-and-contours";

// Lower-level building blocks — useful when callers want fine-grained control
export { precomputeSurfaceData } from "./private/get-contours";
export type { PrecomputedSurfaceData } from "./private/get-contours";
