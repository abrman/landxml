import { ParsedSurface } from "./parse-xml";

const filterBySurfaceId = (parsedSurfaces: ParsedSurface[], surfaceId: string | number) => {
  let filtered = [...parsedSurfaces];
  if (typeof surfaceId === "string") {
    filtered = filtered.filter((s) => s.name === surfaceId);
    if (filtered.length === 0) throw "Provided SurfaceId doesn't exist within provided LandXML";
  }
  if (typeof surfaceId === "number" && surfaceId > 0) {
    if (!filtered[surfaceId])
      throw `Provided SurfaceId index is out of range. Provided LandXML has ${filtered.length} surfaces.`;
    filtered = [filtered[surfaceId] as ParsedSurface];
  }
  return filtered;
};

export default filterBySurfaceId;
