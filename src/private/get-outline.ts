import { linesToPolyLines, constructGeojson } from "./get-contours";
import { ParsedSurface } from "./parse-xml";

const getOutline = (surface: ParsedSurface) => {
  const triangleVertexIdEdgePairs: string[] = [];
  let i: number = -1;
  let pairs: string[] = [];
  surface.surfaceDefinition.faces.forEach((f) => {
    pairs = [];
    (
      [
        [f[0], f[1]],
        [f[1], f[2]],
        [f[2], f[0]],
      ] as [number, number][]
    ).forEach(([a, b]) => {
      if (a < b) {
        pairs.push(`${a};${b}`);
      } else {
        pairs.push(`${b};${a}`);
      }
    });
    pairs.forEach((pair) => {
      i = triangleVertexIdEdgePairs.indexOf(pair);
      if (i >= 0) {
        triangleVertexIdEdgePairs.splice(i, 1);
      } else {
        triangleVertexIdEdgePairs.push(pair);
      }
    });
  });
  const edges: [[number, number], [number, number]][] = [];
  triangleVertexIdEdgePairs.map((pair) => {
    const [v1, v2] = pair
      .split(";")
      .map((v) => surface.surfaceDefinition.points[parseInt(v, 10)]?.slice(0, 2) as [number, number]);
    if (v1 && v2) edges.push([v1, v2]);
  });
  return constructGeojson([{ elevation: 0, polylines: linesToPolyLines(edges) }]);
};

export default getOutline;
