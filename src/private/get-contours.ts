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
    // Packed as x, y, z for each of a triangle's three vertices (9 numbers per
    // triangle) — a typed array copies to the worker far cheaper than nested arrays.
    triangles: Float64Array;
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
      const { triangles: t, elevation } = message.payload;
      const linesAtElevation: [[number, number], [number, number]][] = [];
      for (let i = 0; i + 8 < t.length; i += 9) {
        const face: [number, number, number][] = [
          [t[i]!, t[i + 1]!, t[i + 2]!],
          [t[i + 3]!, t[i + 4]!, t[i + 5]!],
          [t[i + 6]!, t[i + 7]!, t[i + 8]!],
        ];
        const line = contourLineOnFace(face, elevation);
        if (line) linesAtElevation.push(line);
      }

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** The lowest and highest point elevation (points without a numeric z are ignored). */
export const elevationRange = (data: ParsedSurface): { minElevation: number; maxElevation: number } => {
  const { points } = data.surfaceDefinition;
  let minElevation = Infinity;
  let maxElevation = -Infinity;
  for (let i = 2; i < points.length; i += 3) {
    const z = points[i]!;
    if (z < minElevation) minElevation = z;
    if (z > maxElevation) maxElevation = z;
  }
  return { minElevation, maxElevation };
};

/** The contour levels a triangle spans, as integer steps of `interval` (integer steps avoid float drift). */
const stepsOf = (points: Float64Array, faces: Uint32Array, f: number, interval: number) => {
  const za = points[faces[f]! * 3 + 2]!;
  const zb = points[faces[f + 1]! * 3 + 2]!;
  const zc = points[faces[f + 2]! * 3 + 2]!;
  return [Math.ceil(Math.min(za, zb, zc) / interval), Math.floor(Math.max(za, zb, zc) / interval)] as const;
};

/**
 * Groups triangles by the elevation levels they span, each level's triangles
 * packed in face order as 9 numbers (x, y, z × 3 vertices). Two passes — count,
 * then fill — so every level gets one exactly sized typed array.
 */
export const bucketTrianglesByElevation = (
  data: ParsedSurface,
  elevations: number[],
  interval: number,
): Map<number, Float64Array> => {
  const { points, faces } = data.surfaceDefinition;
  const firstLevel = Math.round((elevations[0] ?? 0) / interval);
  const counts = new Uint32Array(elevations.length);
  const levelIndex = (step: number) => {
    const i = step - firstLevel;
    return i >= 0 && i < elevations.length ? i : -1;
  };

  for (let f = 0; f < faces.length; f += 3) {
    const [first, last] = stepsOf(points, faces, f, interval);
    for (let step = first; step <= last; step++) {
      const i = levelIndex(step);
      if (i >= 0) counts[i]!++;
    }
  }

  const buckets = elevations.map((_, i) => new Float64Array(counts[i]! * 9));
  const filled = new Uint32Array(elevations.length);
  for (let f = 0; f < faces.length; f += 3) {
    const [first, last] = stepsOf(points, faces, f, interval);
    for (let step = first; step <= last; step++) {
      const i = levelIndex(step);
      if (i < 0) continue;
      const bucket = buckets[i]!;
      let o = filled[i]! * 9;
      filled[i]!++;
      for (let v = 0; v < 3; v++) {
        const p = faces[f + v]! * 3;
        bucket[o++] = points[p]!;
        bucket[o++] = points[p + 1]!;
        bucket[o++] = points[p + 2]!;
      }
    }
  }

  return new Map(elevations.map((e, i) => [e, buckets[i]!]));
};

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Generate contour GeoJSON.
 *
 * @param onProgress Called as contour levels finish, with the fraction (0–1) done.
 */
const getContours = async (
  data: ParsedSurface,
  interval: number = 2,
  onProgress?: (fraction: number) => void,
): Promise<FeatureCollection<LineString, { z: number }>> => {
  const { minElevation, maxElevation } = elevationRange(data);

  const elevations = contourElevations(minElevation, maxElevation, interval);
  if (elevations.length === 0) return constructGeojson([]);
  const trianglesByElevation = bucketTrianglesByElevation(data, elevations, interval);

  let done = 0;
  const elevationPolylines = await Promise.all(
    elevations.map(async (elevation) => {
      const result = await (contoursWorker.send as any)({
        triangles: trianglesByElevation.get(elevation) ?? new Float64Array(0),
        elevation,
      });
      onProgress?.(++done / elevations.length);
      return result;
    }),
  );

  return constructGeojson(elevationPolylines as { elevation: number; polylines: [number, number][][] }[]);
};

export default getContours;
