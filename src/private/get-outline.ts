import { linesToPolyLines, constructGeojson } from "./get-contours";
import { ParsedSurface } from "./parse-xml";

const getOutline = (surface: ParsedSurface) => {
  const vertexIndexPairEdges: [number, number][] = [];
  surface.surfaceDefinition.faces.forEach((f, i) => {
    const neighbors = surface.surfaceDefinition.faceNeighbors[i] as [
      faceIndex: number,
      faceIndex: number,
      faceIndex: number
    ];
    if (neighbors[0] === -1) vertexIndexPairEdges.push([f[0], f[1]]);
    if (neighbors[1] === -1) vertexIndexPairEdges.push([f[1], f[2]]);
    if (neighbors[2] === -1) vertexIndexPairEdges.push([f[0], f[2]]);
  });

  const edges: [[number, number], [number, number]][] = [];
  vertexIndexPairEdges.map((pair) => {
    const [v1, v2] = pair.map((vertexIndex) => surface.surfaceDefinition.points[vertexIndex]);
    if (typeof v1 !== "undefined" && typeof v2 !== "undefined")
      edges.push([v1.slice(0, 2) as [number, number], v2.slice(0, 2) as [number, number]]);
  });
  return constructGeojson([{ elevation: 0, polylines: linesToPolyLines(edges) }]);
};

export default getOutline;
