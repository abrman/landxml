import { Document, WebIO } from "@gltf-transform/core";
import type { ParsedSurface } from "./parse-xml";

export const findXYAxisMedians = (vertices: [number, number, number][]) => {
  vertices = vertices.slice().filter(Boolean);
  const middleIndex = Math.floor(vertices.length / 2);
  const medianX = vertices.slice().sort((a, b) => a[0] - b[0])[middleIndex]?.[0];
  const medianY = vertices.slice().sort((a, b) => a[1] - b[1])[middleIndex]?.[1];
  return [medianX, medianY] as [x: number, y: number];
};

const getGlb = async (data: ParsedSurface, customCenter?: [x: number, y: number]) => {
  const center = customCenter || findXYAxisMedians(data.surfaceDefinition.points);
  const pts = data.surfaceDefinition.points;
  const facesFlat = data.surfaceDefinition.faces;

  // OPTIMIZATION: pre-allocate typed arrays instead of building intermediate
  // JS arrays with chained .map().reduce().concat().
  // This avoids O(n) GC pressure from throwaway arrays and gives the GPU
  // upload path a single contiguous buffer from the start.
  const vertexBuffer = new Float32Array(pts.length * 3);
  for (let i = 0; i < pts.length; i++) {
    const [x, y, z] = pts[i] as [number, number, number];
    // Axis remap: LandXML top-down [x,y,z] → GLTF front-back [x,z,-y]
    vertexBuffer[i * 3] = x - center[0];
    vertexBuffer[i * 3 + 1] = z;
    vertexBuffer[i * 3 + 2] = -(y - center[1]);
  }

  const indexBuffer = new Uint32Array(facesFlat.length * 3);
  for (let i = 0; i < facesFlat.length; i++) {
    const [a, b, c] = facesFlat[i] as [number, number, number];
    indexBuffer[i * 3] = a;
    indexBuffer[i * 3 + 1] = b;
    indexBuffer[i * 3 + 2] = c;
  }

  const doc = new Document();
  const buffer = doc.createBuffer();
  const position = doc.createAccessor().setType("VEC3").setArray(vertexBuffer).setBuffer(buffer);
  const indices = doc.createAccessor().setType("SCALAR").setArray(indexBuffer).setBuffer(buffer);
  const prim = doc.createPrimitive().setAttribute("POSITION", position).setIndices(indices);

  const mesh = doc.createMesh().addPrimitive(prim);
  const node = doc.createNode().setMesh(mesh);
  doc.createScene().addChild(node);

  const glb = await new WebIO().writeBinary(doc);

  return { glb, center };
};

export default getGlb;
