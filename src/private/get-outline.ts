import { linesToPolyLines, constructGeojson } from "./get-contours";
import { ParsedSurface } from "./parse-xml";

/**
 * The surface's boundary as a `z = 0` GeoJSON feature: the edges only one face
 * uses. Edge keys are numbers sorted in a typed array rather than a Map of
 * strings, so a surface with millions of faces stays cheap.
 */
const getOutline = (surface: ParsedSurface) => {
  const { points, faces } = surface.surfaceDefinition;
  const pointCount = points.length / 3;
  /** The same key whichever way round the edge is walked. */
  const edgeKey = (a: number, b: number) => (a < b ? a * pointCount + b : b * pointCount + a);

  // Each face's edges, in the order [v0,v1], [v1,v2], [v0,v2].
  const ends = (f: number, e: number): [number, number] => {
    const v0 = faces[f]!;
    const v1 = faces[f + 1]!;
    const v2 = faces[f + 2]!;
    return e === 0 ? [v0, v1] : e === 1 ? [v1, v2] : [v0, v2];
  };

  const keys = new Float64Array(faces.length);
  for (let f = 0; f < faces.length; f += 3) {
    for (let e = 0; e < 3; e++) keys[f + e] = edgeKey(...ends(f, e));
  }
  keys.sort();
  const boundary = new Set<number>();
  for (let i = 0; i < keys.length; ) {
    let j = i + 1;
    while (j < keys.length && keys[j] === keys[i]) j++;
    if (j - i === 1) boundary.add(keys[i]!);
    i = j;
  }

  const edges: [[number, number], [number, number]][] = [];
  for (let f = 0; f < faces.length; f += 3) {
    for (let e = 0; e < 3; e++) {
      const [a, b] = ends(f, e);
      if (!boundary.has(edgeKey(a, b))) continue;
      edges.push([
        [points[a * 3]!, points[a * 3 + 1]!],
        [points[b * 3]!, points[b * 3 + 1]!],
      ]);
    }
  }
  return constructGeojson([{ elevation: 0, polylines: linesToPolyLines(edges) }]);
};

export default getOutline;
