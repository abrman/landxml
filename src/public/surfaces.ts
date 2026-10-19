import type { FeatureCollection, LineString } from "geojson";
import filterBySurfaceId from "../private/filter-by-surfaceId";
import parseXML, { type ParsedSurface } from "../private/parse-xml";
import getContours from "../private/get-contours";
import getGlb, { findXYAxisMedians } from "../private/get-glb";
import getOutline from "../private/get-outline";

/**
 * A parsed TIN surface: metadata plus its points (x, y, z per point) and faces
 * (three point indices per face) as typed arrays.
 */
export type LandXmlSurface = ParsedSurface;

export type GlbCenter = "auto" | "origin" | [x: number, y: number];

/**
 * Parse the surfaces of a LandXML string.
 *
 * @param options.surfaceId  Surface name or 0-based index to keep just one; -1 (default) keeps all
 * @param options.onProgress Called as the file is read, with the fraction (0–1) done
 */
export const parseSurfaces = async (
  landXmlString: string,
  options: { surfaceId?: string | number; onProgress?: (fraction: number) => void } = {},
): Promise<LandXmlSurface[]> =>
  filterBySurfaceId(await parseXML(landXmlString, { onProgress: options.onProgress }), options.surfaceId ?? -1);

/**
 * The XY origin for GLBs: "auto" is the median of every point across `surfaces`
 * (one shared center keeps several surfaces positioned relative to each other).
 */
export const findCenter = (surfaces: LandXmlSurface[], center: GlbCenter = "auto"): [x: number, y: number] =>
  center === "origin" ? [0, 0] : center === "auto" ? findXYAxisMedians(surfaces) : center;

/** A GLB of the surface, positions relative to `center` (see findCenter) with GLTF's y-up axes: [x, z, -y]. */
export const surfaceToGlb = async (surface: LandXmlSurface, center: [x: number, y: number]): Promise<Uint8Array> =>
  (await getGlb(surface, center)).glb;

/**
 * Contour lines of the surface, plus its outline as a `z = 0` feature when
 * `generateOutline` is set.
 *
 * @param onProgress Called as contour levels finish, with the fraction (0–1) done
 */
export const surfaceToContours = async (
  surface: LandXmlSurface,
  contourInterval: number = 2,
  generateOutline: boolean = true,
  onProgress?: (fraction: number) => void,
): Promise<FeatureCollection<LineString, { z: number }>> => {
  const geojson = await getContours(surface, contourInterval, onProgress);
  if (generateOutline) geojson.features = [...geojson.features, ...getOutline(surface).features];
  return geojson;
};

/** A surface's metadata, without its geometry. */
export const surfaceInfo = ({ surfaceDefinition: _, ...info }: LandXmlSurface) => info;
