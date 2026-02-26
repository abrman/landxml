import type { Feature, FeatureCollection, LineString, Position } from "geojson";
import type { ParsedSurface } from "./parse-xml";
import { createEasyWebWorker } from "easy-web-worker";

// ─── Worker ──────────────────────────────────────────────────────────────────

const contoursWorker = createEasyWebWorker<
  {
    // OPTIMIZATION: instead of sending the full triangle list for every
    // elevation level, we send a bucketed structure: each elevation level only
    // receives the triangles whose z-range spans that level.  The caller
    // pre-groups triangles by elevation bucket before dispatching workers so
    // total data transferred across the worker boundary is dramatically
    // reduced for typical terrain (most triangles only span one interval).
    triangles: [x: number, y: number, z: number][][];
    elevation: number;
  },
  {
    elevation: number;
    polylines: [number, number][][];
  }
>(
  ({ onMessage }) => {
    // ── contourLineOnFace (unchanged logic, inlined in worker) ──────────────
    const contourLineOnFace = (face: [x: number, y: number, z: number][], z: number) => {
      let vertsAtElevation = 0;
      let line: [number, number][] = [];
      for (let i = 0; i < face.length; i++) {
        const vertex1 = face[i] as [number, number, number];
        const vertex2 = face[(i + 1) % face.length] as [number, number, number];
        if (vertex1[2] === z) vertsAtElevation++;
        if (
          ((vertex1[2] <= z && vertex2[2] >= z) || (vertex1[2] >= z && vertex2[2] <= z)) &&
          !Number.isNaN((z - vertex1[2]) / (vertex2[2] - vertex1[2]))
        ) {
          const t = (z - vertex1[2]) / (vertex2[2] - vertex1[2]);
          line.push([vertex1[0] + t * (vertex2[0] - vertex1[0]), vertex1[1] + t * (vertex2[1] - vertex1[1])]);
        }
      }
      if (vertsAtElevation >= 2 && face.map((f) => f[2]).reduce((a, b) => a + b) > z * face.length) return undefined;
      if (line.length === 2 && line[0]![0] === line[1]![0] && line[0]![1] === line[1]![1]) return undefined;
      if (line.length > 2) {
        line = [...new Set(line.map((v) => JSON.stringify(v)))].map((s) => JSON.parse(s));
      }
      return line.length > 0 ? (line as [[number, number], [number, number]]) : undefined;
    };

    // ── linesToPolyLines ─────────────────────────────────────────────────────
    // OPTIMIZATION: replaced Array.includes() (O(n) per call) with a Set for
    // O(1) visited lookups.  For large contour sets this is a significant win.
    const linesToPolyLines = (lineSegments: [[number, number], [number, number]][]): [number, number][][] => {
      if (!Array.isArray(lineSegments) || lineSegments.length === 0) return [];

      const segmentsMapIndexes: Record<string, number[]> = {};
      const polylines: [number, number][][] = [];
      // OPTIMIZATION: Set instead of Array for O(1) .has() / membership checks
      const parsedSegmentIndexes = new Set<number>();

      const lineSegmentStrings = lineSegments.map((v) => v.map((c) => c.join(",")) as [string, string]);

      for (let i = 0; i < lineSegmentStrings.length; i++) {
        const [start, end] = lineSegmentStrings[i]!;
        segmentsMapIndexes[start] = segmentsMapIndexes[start] ? [...segmentsMapIndexes[start]!, i] : [i];
        segmentsMapIndexes[end] = segmentsMapIndexes[end] ? [...segmentsMapIndexes[end]!, i] : [i];
      }

      for (let i = 0; i < lineSegmentStrings.length; i++) {
        if (parsedSegmentIndexes.has(i)) continue;
        parsedSegmentIndexes.add(i);

        let [start, end]: (string | null)[] = lineSegmentStrings[i] as [string, string];
        const polyline: string[] = [start as string, end as string];

        while (start && segmentsMapIndexes[start]) {
          const nextLineIndex: number | undefined = segmentsMapIndexes[start]!.find(
            (li) => !parsedSegmentIndexes.has(li),
          );
          if (nextLineIndex !== undefined) {
            parsedSegmentIndexes.add(nextLineIndex);
            const [a, b]: [string, string] = lineSegmentStrings[nextLineIndex]!;
            const newPoint: string = a === start ? b : a;
            polyline.unshift(newPoint);
            start = newPoint;
          } else {
            start = null;
          }
        }

        while (end && segmentsMapIndexes[end]) {
          const nextLineIndex: number | undefined = segmentsMapIndexes[end]!.find(
            (li) => !parsedSegmentIndexes.has(li),
          );
          if (nextLineIndex !== undefined) {
            parsedSegmentIndexes.add(nextLineIndex);
            const [a, b]: [string, string] = lineSegmentStrings[nextLineIndex]!;
            const newPoint: string = a === end ? b : a;
            polyline.push(newPoint);
            end = newPoint;
          } else {
            end = null;
          }
        }

        polylines.push(polyline.map((coord) => coord.split(",").map((v) => parseFloat(v)) as [number, number]));
      }
      return polylines;
    };

    onMessage((message) => {
      const { triangles, elevation } = message.payload;
      const linesAtElevation = triangles.reduce((prev, curr) => {
        const line = contourLineOnFace(curr, elevation);
        if (line) prev.push(line);
        return prev;
      }, [] as [[number, number], [number, number]][]);

      message.resolve({ elevation, polylines: linesToPolyLines(linesAtElevation) });
    });
  },
  { maxWorkers: 10 },
);

// ─── Standalone helpers (exported for get-outline.ts) ────────────────────────

export const contourLineOnFace = (face: [x: number, y: number, z: number][], z: number) => {
  let vertsAtElevation = 0;
  let line: [number, number][] = [];
  for (let i = 0; i < face.length; i++) {
    const vertex1 = face[i] as [number, number, number];
    const vertex2 = face[(i + 1) % face.length] as [number, number, number];
    if (vertex1[2] === z) vertsAtElevation++;
    if (
      ((vertex1[2] <= z && vertex2[2] >= z) || (vertex1[2] >= z && vertex2[2] <= z)) &&
      !Number.isNaN((z - vertex1[2]) / (vertex2[2] - vertex1[2]))
    ) {
      const t = (z - vertex1[2]) / (vertex2[2] - vertex1[2]);
      line.push([vertex1[0] + t * (vertex2[0] - vertex1[0]), vertex1[1] + t * (vertex2[1] - vertex1[1])]);
    }
  }
  if (vertsAtElevation >= 2 && face.map((f) => f[2]).reduce((a, b) => a + b) > z * face.length) return undefined;
  if (line.length === 2 && line[0]![0] === line[1]![0] && line[0]![1] === line[1]![1]) return undefined;
  if (line.length > 2) {
    line = [...new Set(line.map((v) => JSON.stringify(v)))].map((s) => JSON.parse(s));
  }
  return line.length > 0 ? (line as [[number, number], [number, number]]) : undefined;
};

// OPTIMIZATION: same Set-based O(1) lookup improvement for the non-worker path
export const linesToPolyLines = (lineSegments: [[number, number], [number, number]][]): [number, number][][] => {
  if (!Array.isArray(lineSegments) || lineSegments.length === 0) return [];

  const segmentsMapIndexes: Record<string, number[]> = {};
  const polylines: [number, number][][] = [];
  const parsedSegmentIndexes = new Set<number>();

  const lineSegmentStrings = lineSegments.map((v) => v.map((c) => c.join(",")) as [string, string]);

  for (let i = 0; i < lineSegmentStrings.length; i++) {
    const [start, end] = lineSegmentStrings[i]!;
    segmentsMapIndexes[start] = segmentsMapIndexes[start] ? [...segmentsMapIndexes[start]!, i] : [i];
    segmentsMapIndexes[end] = segmentsMapIndexes[end] ? [...segmentsMapIndexes[end]!, i] : [i];
  }

  for (let i = 0; i < lineSegmentStrings.length; i++) {
    if (parsedSegmentIndexes.has(i)) continue;
    parsedSegmentIndexes.add(i);

    let [start, end]: (string | null)[] = lineSegmentStrings[i] as [string, string];
    const polyline: string[] = [start as string, end as string];

    while (start && segmentsMapIndexes[start]) {
      const nextLineIndex: number | undefined = segmentsMapIndexes[start]!.find((li) => !parsedSegmentIndexes.has(li));
      if (nextLineIndex !== undefined) {
        parsedSegmentIndexes.add(nextLineIndex);
        const [a, b]: [string, string] = lineSegmentStrings[nextLineIndex]!;
        const newPoint: string = a === start ? b : a;
        polyline.unshift(newPoint);
        start = newPoint;
      } else start = null;
    }

    while (end && segmentsMapIndexes[end]) {
      const nextLineIndex: number | undefined = segmentsMapIndexes[end]!.find((li) => !parsedSegmentIndexes.has(li));
      if (nextLineIndex !== undefined) {
        parsedSegmentIndexes.add(nextLineIndex);
        const [a, b]: [string, string] = lineSegmentStrings[nextLineIndex]!;
        const newPoint: string = a === end ? b : a;
        polyline.push(newPoint);
        end = newPoint;
      } else end = null;
    }

    polylines.push(polyline.map((coord) => coord.split(",").map((v) => parseFloat(v)) as [number, number]));
  }
  return polylines;
};

export const contourElevations = (minElevation: number, maxElevation: number, interval: number): number[] => {
  if (!Number.isFinite(minElevation) || !Number.isFinite(maxElevation) || !Number.isFinite(interval)) {
    throw new Error("Contour elevations have to be finite numbers");
  }
  if (minElevation + interval > maxElevation) {
    // throw new Error(`No contour lines at interval: ${interval} between elevation ${minElevation} and ${maxElevation}`);
    console.warn(`No contour lines at interval: ${interval} between elevation ${minElevation} and ${maxElevation}`);
    return [];
  }
  const elevations: number[] = [];
  // OPTIMIZATION: use integer step counting to avoid float accumulation drift.
  // e.g. with interval=0.1, `start + 0.1 * 300` is exact; `start += 0.1` 300 times is not.
  const firstStep = Math.ceil(minElevation / interval);
  const lastStep = Math.ceil(maxElevation / interval) - 1;
  for (let step = firstStep; step <= lastStep; step++) {
    elevations.push(step * interval);
  }
  return elevations;
};

export const constructGeojson = (
  elevationData: { elevation: number; polylines: [number, number][][] }[],
): FeatureCollection<LineString, { z: number }> => {
  const features = elevationData.reduce((prev, data) => {
    const { elevation, polylines } = data;
    return prev.concat(
      polylines.map((polyline) => ({
        type: "Feature" as const,
        geometry: { type: "LineString" as const, coordinates: polyline as Position[] },
        properties: { z: elevation },
      })),
    );
  }, [] as Feature<LineString, { z: number }>[]);

  return { type: "FeatureCollection", features };
};

// ─── Pre-computation helper ───────────────────────────────────────────────────

/**
 * Derives the triangle list and elevation range from a ParsedSurface.
 * Call this once and pass the result to both getContours() and getGlb() when
 * you need both outputs for the same surface — avoids double-traversal of the
 * (potentially large) faces/points arrays.
 */
export type PrecomputedSurfaceData = {
  triangles: [x: number, y: number, z: number][][];
  minElevation: number;
  maxElevation: number;
};

export const precomputeSurfaceData = (data: ParsedSurface): PrecomputedSurfaceData => {
  const { points, faces } = data.surfaceDefinition;

  // OPTIMIZATION: single pass for both triangles and elevation min/max,
  // avoiding the separate .reduce() over all points that getContours() used.
  let minElevation = Infinity;
  let maxElevation = -Infinity;

  for (const pt of points) {
    if (pt[2] < minElevation) minElevation = pt[2];
    if (pt[2] > maxElevation) maxElevation = pt[2];
  }

  const triangles = faces.map((face) => face.map((vert) => points[vert] as [number, number, number]));

  return { triangles, minElevation, maxElevation };
};

// ─── Internal bucketing helper ────────────────────────────────────────────────

/**
 * Groups triangles by the elevation levels they span.
 * Extracted so both getContours() and getContoursGeojson() (inside toGlbAndContours)
 * can share the bucketing without repeating the loop.
 */
export const bucketTrianglesByElevation = (
  triangles: [x: number, y: number, z: number][][],
  elevations: number[],
  interval: number,
): Map<number, [number, number, number][][]> => {
  const trianglesByElevation = new Map<number, [number, number, number][][]>();
  for (const e of elevations) trianglesByElevation.set(e, []);

  for (const tri of triangles) {
    const zMin = Math.min(tri[0]![2], tri[1]![2], tri[2]![2]);
    const zMax = Math.max(tri[0]![2], tri[1]![2], tri[2]![2]);
    // OPTIMIZATION: integer-step loop avoids float drift (same fix as contourElevations)
    const firstStep = Math.ceil(zMin / interval);
    const lastStep = Math.floor(zMax / interval);
    for (let step = firstStep; step <= lastStep; step++) {
      const rounded = step * interval;
      const bucket = trianglesByElevation.get(rounded);
      if (bucket) bucket.push(tri);
    }
  }

  return trianglesByElevation;
};

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Generate contour GeoJSON.
 *
 * Pass `precomputed` when you have already called `precomputeSurfaceData()`
 * (e.g. because you also need a GLB for the same surface).  This skips the
 * redundant traversal of all points and faces.
 */
const getContours = async (
  data: ParsedSurface,
  interval: number = 2,
  precomputed?: PrecomputedSurfaceData,
): Promise<FeatureCollection<LineString, { z: number }>> => {
  const { triangles, minElevation, maxElevation } = precomputed ?? precomputeSurfaceData(data);

  const elevations = contourElevations(minElevation, maxElevation, interval);
  if (elevations.length === 0) return constructGeojson([]);
  const trianglesByElevation = bucketTrianglesByElevation(triangles, elevations, interval);

  const elevationPolylines = await Promise.all(
    elevations.map((elevation) =>
      (contoursWorker.send as any)({
        triangles: trianglesByElevation.get(elevation) ?? [],
        elevation,
      }),
    ),
  );

  return constructGeojson(elevationPolylines as { elevation: number; polylines: [number, number][][] }[]);
};

export default getContours;
