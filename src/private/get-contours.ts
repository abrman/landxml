import type { Feature, FeatureCollection, LineString, Position } from "geojson";
import type { ParsedSurface } from "./parse-xml";

const contourLineOnFace = (face: [x: number, y: number, z: number][], z: number) => {
  let line: [x: number, z: number][] = [];
  for (let i = 0; i < face.length; i++) {
    let vertex1 = face[i] as [x: number, y: number, z: number];
    let vertex2 = face[(i + 1) % face.length] as [x: number, y: number, z: number];

    if ((vertex1[2] <= z && vertex2[2] >= z) || (vertex1[2] >= z && vertex2[2] <= z)) {
      let t = (z - vertex1[2]) / (vertex2[2] - vertex1[2]);
      line.push([vertex1[0] + t * (vertex2[0] - vertex1[0]), vertex1[1] + t * (vertex2[1] - vertex1[1])]);
    }
  }
  return line.length > 0 ? (line as [[x: number, z: number], [x: number, z: number]]) : undefined;
};

const linesToPolyLines = (lineSegments: [[number, number], [number, number]][]) => {
  if (!Array.isArray(lineSegments) || lineSegments.length === 0) {
    throw new Error("Invalid input: Please provide a non-empty array of line segments.");
  }

  const segmentsMap = new Map();
  const polylines: [number, number][][] = [];

  lineSegments.forEach(([start, end]) => {
    const startKey = start.join(",");
    const endKey = end.join(",");

    segmentsMap.set(startKey, segmentsMap.get(startKey) || []);
    segmentsMap.set(endKey, segmentsMap.get(endKey) || []);

    segmentsMap.get(startKey).push(end);
    segmentsMap.get(endKey).push(start);
  });

  const constructPolyline = (start: [number, number], polyline: [number, number][]) => {
    let current = start;
    while (segmentsMap.has(current.join(",")) && segmentsMap.get(current.join(",")).length > 0) {
      const next = segmentsMap.get(current.join(",")).pop();
      polyline.push(current);
      if (next) {
        const nextKey = next.join(",");
        segmentsMap.delete(current.join(","));
        current = next;
        if (segmentsMap.has(nextKey)) {
          segmentsMap.set(
            nextKey,
            (segmentsMap.get(nextKey) || []).filter((point: [number, number]) => point.join(",") !== current.join(","))
          );
        }
      }
    }
    polyline.push(current);
    return polyline;
  };

  const traverseSegmentsMap = (endpoints: [number, number][], startKey: string) => {
    let start = startKey.split(",").map(Number) as [number, number];
    while (endpoints.length > 0) {
      const newPolyline = constructPolyline(start, []);
      polylines.push(newPolyline);
      start = endpoints.pop() as [number, number];
    }
  };

  for (const [startKey, endpoints] of segmentsMap.entries()) {
    if (endpoints && endpoints.length === 0) {
      continue;
    }
    traverseSegmentsMap(endpoints || [], startKey);
  }

  return polylines;
};

const contourElevations = (minElevation: number, maxElevation: number, increment: number) => {
  const elevations: number[] = [];
  const start = Math.ceil(minElevation * 2) / 2;
  const end = Math.floor(maxElevation * 2) / 2;
  for (let elevation = start; elevation <= end; elevation += increment) {
    elevations.push(elevation);
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

  const elevationPolylines = elevations.map((e) => ({
    elevation: e,
    polylines: linesToPolyLines(
      triangles.reduce((prev, curr) => {
        const line = contourLineOnFace(curr, e);
        if (line) prev.push(line);
        return prev;
      }, [] as [[x: number, z: number], [x: number, z: number]][])
    ),
  }));

  return constructGeojson(elevationPolylines);
};

export default getContours;
