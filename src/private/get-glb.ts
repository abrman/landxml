import { Document, WebIO } from "@gltf-transform/core";
import type { ParsedSurface } from "./parse-xml";

const findXYAxisMedians = (vertices: [number, number, number][]) => {
  vertices = vertices.slice().filter(Boolean);
  const middleIndex = Math.floor(vertices.length / 2);
  const medianX = vertices.slice().sort((a, b) => a[0] - b[0])[middleIndex]?.[0];
  const medianY = vertices.slice().sort((a, b) => a[1] - b[1])[middleIndex]?.[1];
  return [medianX, medianY] as [x: number, y: number];
};

const getGlb = async (data: ParsedSurface, customCenter?: [x: number, y: number]) => {
  const center = customCenter || findXYAxisMedians(data.surfaceDefinition.points);

  const vertices = [...data.surfaceDefinition.points]
    .map((p) => p.slice() as [x: number, y: number, z: number])
    .map(([x, y, z]) => {
      // Reorder axis as LandXML has a top-down view approach to assigning X-Y-Z axis
      // GLTF has a front-back view approach. Therefore [x,y,z] => [x,z,-y]
      return [x - center[0], z, -(y - center[1])];
    })
    .reduce((prev, curr) => prev.concat(curr), []);

  const triangles = data.surfaceDefinition.faces.reduce((prev, curr) => prev.concat(curr), [] as number[]);

  const doc = new Document();
  const buffer = doc.createBuffer();
  const position = doc.createAccessor().setType("VEC3").setArray(new Float32Array(vertices)).setBuffer(buffer);
  const indices = doc.createAccessor().setType("SCALAR").setArray(new Uint32Array(triangles)).setBuffer(buffer);
  const prim = doc.createPrimitive().setAttribute("POSITION", position).setIndices(indices);

  const mesh = doc.createMesh().addPrimitive(prim);
  const node = doc.createNode().setMesh(mesh);
  const scene = doc.createScene().addChild(node);

  const glb = await new WebIO().writeBinary(doc); // → Uint8Array (.glb)

  return { glb, center };
};

export default getGlb;
