import type { Feature, FeatureCollection, LineString, Position } from "geojson";
import type { ParsedSurface } from "./parse-xml";
import { createEasyWebWorker } from "easy-web-worker";

const contoursWorker = createEasyWebWorker<
  {
    triangles: [x: number, y: number, z: number][][];
    elevation: number;
  },
  {
    elevation: number;
    polylines: [number, number][][];
  }
>(
  ({ onMessage }) => {
    const contourLineOnFace = (face: [x: number, y: number, z: number][], z: number) => {
      let vertsAtElevation = 0;
      let line: [x: number, z: number][] = [];
      for (let i = 0; i < face.length; i++) {
        let vertex1 = face[i] as [x: number, y: number, z: number];
        let vertex2 = face[(i + 1) % face.length] as [x: number, y: number, z: number];
        if (vertex1[2] === z) vertsAtElevation++;

        if (
          ((vertex1[2] <= z && vertex2[2] >= z) || (vertex1[2] >= z && vertex2[2] <= z)) &&
          !Number.isNaN((z - vertex1[2]) / (vertex2[2] - vertex1[2]))
        ) {
          let t = (z - vertex1[2]) / (vertex2[2] - vertex1[2]);
          line.push([vertex1[0] + t * (vertex2[0] - vertex1[0]), vertex1[1] + t * (vertex2[1] - vertex1[1])]);
        }
      }

      // If an edge is going to be detected by two triangles, prioritize the triangle with 3rd vertex at lower elevation
      if (vertsAtElevation >= 2 && face.map((f) => f[2]).reduce((a, b) => a + b) > z * face.length) return undefined;

      // Prevent zero length lines
      if (
        line.length === 2 &&
        (line[0] as any)[0] === (line[1] as any)[0] &&
        (line[0] as any)[1] === (line[1] as any)[1]
      )
        return undefined;

      if (line.length > 2) {
        line = [...new Set(line.map((v) => JSON.stringify(v)))].map((s) => JSON.parse(s));
      }
      return line.length > 0 ? (line as [[x: number, z: number], [x: number, z: number]]) : undefined;
    };

    const linesToPolyLines = (lineSegments: [[number, number], [number, number]][]) => {
      if (!Array.isArray(lineSegments) || lineSegments?.length === 0) {
        return [];
        // throw new Error("Invalid input: Please provide a non-empty array of line segments.");
      }

      const segmentsMapIndexes: { [coordinateKey: string]: number[] } = {};
      const polylines: [number, number][][] = [];
      const parsedSegmentIndexes: number[] = [];

      const lineSegmentStrings = lineSegments.map((v) => v.map((c) => c.join(","))) as [string, string][];

      lineSegmentStrings.forEach(([start, end], i) => {
        segmentsMapIndexes[start] = segmentsMapIndexes[start] ? [...(segmentsMapIndexes[start] || []), i] : [i];
        segmentsMapIndexes[end] = segmentsMapIndexes[end] ? [...(segmentsMapIndexes[end] || []), i] : [i];
      });

      for (let i = 0; i < lineSegmentStrings.length; i++) {
        if (parsedSegmentIndexes.includes(i)) continue;

        parsedSegmentIndexes.push(i);

        let [start, end]: (string | null)[] = lineSegmentStrings[i] as [string, string];
        let polyline = [start, end];

        while (start && segmentsMapIndexes[start]) {
          const nextLineIndex: number | undefined = segmentsMapIndexes[start]?.find(
            (lineIndex) => !parsedSegmentIndexes.includes(lineIndex)
          );
          if (nextLineIndex) {
            parsedSegmentIndexes.push(nextLineIndex);
            const nextLineSegment = lineSegmentStrings[nextLineIndex] as [string, string];
            const nextLineSegmentPointIndex: number = nextLineSegment[0] === start ? 1 : 0;
            const newPoint = nextLineSegment[nextLineSegmentPointIndex] as string;
            polyline.unshift(newPoint);
            start = newPoint;
          } else {
            start = null;
          }
        }

        while (end && segmentsMapIndexes[end]) {
          const nextLineIndex: number | undefined = segmentsMapIndexes[end]?.find(
            (lineIndex) => !parsedSegmentIndexes.includes(lineIndex)
          );
          if (nextLineIndex) {
            parsedSegmentIndexes.push(nextLineIndex);
            const nextLineSegment = lineSegmentStrings[nextLineIndex] as [string, string];
            const nextLineSegmentPointIndex: number = nextLineSegment[0] === end ? 1 : 0;
            const newPoint = nextLineSegment[nextLineSegmentPointIndex] as string;
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
      const linesAtElevationE = triangles.reduce((prev, curr) => {
        const line = contourLineOnFace(curr, elevation);
        if (line) prev.push(line);
        return prev;
      }, [] as [[x: number, z: number], [x: number, z: number]][]);

      message.resolve({
        elevation,
        polylines: linesToPolyLines(linesAtElevationE),
      });
    });
  },
  { maxWorkers: 10 }
);

const contourLineOnFace = (face: [x: number, y: number, z: number][], z: number) => {
  let vertsAtElevation = 0;
  let line: [x: number, z: number][] = [];
  for (let i = 0; i < face.length; i++) {
    let vertex1 = face[i] as [x: number, y: number, z: number];
    let vertex2 = face[(i + 1) % face.length] as [x: number, y: number, z: number];
    if (vertex1[2] === z) vertsAtElevation++;

    if (
      ((vertex1[2] <= z && vertex2[2] >= z) || (vertex1[2] >= z && vertex2[2] <= z)) &&
      !Number.isNaN((z - vertex1[2]) / (vertex2[2] - vertex1[2]))
    ) {
      let t = (z - vertex1[2]) / (vertex2[2] - vertex1[2]);
      line.push([vertex1[0] + t * (vertex2[0] - vertex1[0]), vertex1[1] + t * (vertex2[1] - vertex1[1])]);
    }
  }

  // If an edge is going to be detected by two triangles, prioritize the triangle with 3rd vertex at lower elevation
  if (vertsAtElevation >= 2 && face.map((f) => f[2]).reduce((a, b) => a + b) > z * face.length) return undefined;

  // Prevent zero length lines
  if (line.length === 2 && (line[0] as any)[0] === (line[1] as any)[0] && (line[0] as any)[1] === (line[1] as any)[1])
    return undefined;

  if (line.length > 2) {
    line = [...new Set(line.map((v) => JSON.stringify(v)))].map((s) => JSON.parse(s));
  }
  return line.length > 0 ? (line as [[x: number, z: number], [x: number, z: number]]) : undefined;
};

const linesToPolyLines = (lineSegments: [[number, number], [number, number]][]) => {
  if (!Array.isArray(lineSegments) || lineSegments?.length === 0) {
    return [];
    // throw new Error("Invalid input: Please provide a non-empty array of line segments.");
  }

  const segmentsMapIndexes: { [coordinateKey: string]: number[] } = {};
  const polylines: [number, number][][] = [];
  const parsedSegmentIndexes: number[] = [];

  const lineSegmentStrings = lineSegments.map((v) => v.map((c) => c.join(","))) as [string, string][];

  lineSegmentStrings.forEach(([start, end], i) => {
    segmentsMapIndexes[start] = segmentsMapIndexes[start] ? [...(segmentsMapIndexes[start] || []), i] : [i];
    segmentsMapIndexes[end] = segmentsMapIndexes[end] ? [...(segmentsMapIndexes[end] || []), i] : [i];
  });

  for (let i = 0; i < lineSegmentStrings.length; i++) {
    if (parsedSegmentIndexes.includes(i)) continue;

    parsedSegmentIndexes.push(i);

    let [start, end]: (string | null)[] = lineSegmentStrings[i] as [string, string];
    let polyline = [start, end];

    while (start && segmentsMapIndexes[start]) {
      const nextLineIndex: number | undefined = segmentsMapIndexes[start]?.find(
        (lineIndex) => !parsedSegmentIndexes.includes(lineIndex)
      );
      if (nextLineIndex) {
        parsedSegmentIndexes.push(nextLineIndex);
        const nextLineSegment = lineSegmentStrings[nextLineIndex] as [string, string];
        const nextLineSegmentPointIndex: number = nextLineSegment[0] === start ? 1 : 0;
        const newPoint = nextLineSegment[nextLineSegmentPointIndex] as string;
        polyline.unshift(newPoint);
        start = newPoint;
      } else {
        start = null;
      }
    }

    while (end && segmentsMapIndexes[end]) {
      const nextLineIndex: number | undefined = segmentsMapIndexes[end]?.find(
        (lineIndex) => !parsedSegmentIndexes.includes(lineIndex)
      );
      if (nextLineIndex) {
        parsedSegmentIndexes.push(nextLineIndex);
        const nextLineSegment = lineSegmentStrings[nextLineIndex] as [string, string];
        const nextLineSegmentPointIndex: number = nextLineSegment[0] === end ? 1 : 0;
        const newPoint = nextLineSegment[nextLineSegmentPointIndex] as string;
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

const contourElevations = (minElevation: number, maxElevation: number, interval: number) => {
  if (!Number.isFinite(minElevation) || !Number.isFinite(maxElevation) || !Number.isFinite(interval)) {
    throw new Error("Contour elevations have to be finite numbers");
  }
  if (minElevation + interval > maxElevation) {
    throw new Error(`No contour lines at interval: ${interval} between elevation ${minElevation} and ${maxElevation}`);
  }

  const elevations: number[] = [];
  let elevation = Math.ceil(minElevation / interval) * interval;

  while (elevation < maxElevation) {
    elevations.push(elevation);
    elevation += interval;
  }

  return elevations;
};

const constructGeojson = (
  elevationData: {
    elevation: number;
    polylines: [number, number][][];
  }[]
) => {
  const features = elevationData.reduce((prev, data) => {
    const { elevation, polylines } = data;
    return prev.concat(
      polylines.map((polyline) => ({
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: polyline as Position[],
        },
        properties: {
          z: elevation,
        },
      }))
    );
  }, [] as Feature<LineString, { z: number }>[]);

  return {
    type: "FeatureCollection",
    features,
  } as FeatureCollection<LineString, { z: number }>;
};

const getContours = async (data: ParsedSurface, interval: number = 2) => {
  const triangles = data.surfaceDefinition.faces.map((face) =>
    face.map((vert) => data.surfaceDefinition.points[vert] as [x: number, y: number, z: number])
  );

  const [minElevation, maxElevation] = data.surfaceDefinition.points.reduce(
    ([prevMin, prevMax], curr) => [Math.min(prevMin, curr[2]), Math.max(prevMax, curr[2])] as [number, number],
    [Infinity, -Infinity] as [number, number]
  );

  const elevations = contourElevations(minElevation, maxElevation, interval);

  const elevationPolylines: {
    elevation: number;
    polylines: [number, number][][];
  }[] = await Promise.all(elevations.map((elevation) => (contoursWorker.send as any)({ triangles, elevation })));

  return constructGeojson(elevationPolylines);
};

export default getContours;
export { contourLineOnFace, linesToPolyLines, contourElevations, constructGeojson };
