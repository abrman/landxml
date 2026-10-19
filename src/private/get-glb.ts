import { Document, WebIO } from "@gltf-transform/core";
import type { ParsedSurface } from "./parse-xml";

/** The value at the middle (index ⌊n/2⌋) once sorted. */
const median = (values: Float64Array) => values.sort()[Math.floor(values.length / 2)]!;

/**
 * The median x and y over every point of `surfaces` — the GLB origin, since 3D
 * models lose precision far from [0, 0, 0]. One center for all surfaces keeps
 * them positioned relative to each other.
 */
export const findXYAxisMedians = (surfaces: ParsedSurface[]): [x: number, y: number] => {
  const count = surfaces.reduce((n, s) => n + s.surfaceDefinition.points.length / 3, 0);
  const xs = new Float64Array(count);
  const ys = new Float64Array(count);
  let i = 0;
  for (const { surfaceDefinition } of surfaces) {
    const pts = surfaceDefinition.points;
    for (let p = 0; p < pts.length; p += 3, i++) {
      xs[i] = pts[p]!;
      ys[i] = pts[p + 1]!;
    }
  }
  return [median(xs), median(ys)];
};

/** A GLB of the surface's TIN: positions relative to `customCenter` (default: the surface's own median). */
const getGlb = async (data: ParsedSurface, customCenter?: [x: number, y: number]) => {
  const center = customCenter || findXYAxisMedians([data]);
  const pts = data.surfaceDefinition.points;

  const vertexBuffer = new Float32Array(pts.length);
  for (let i = 0; i < pts.length; i += 3) {
    // Axis remap: LandXML top-down [x,y,z] → GLTF front-back [x,z,-y]
    vertexBuffer[i] = pts[i]! - center[0];
    vertexBuffer[i + 1] = pts[i + 2]!;
    vertexBuffer[i + 2] = -(pts[i + 1]! - center[1]);
  }

  const doc = new Document();
  const buffer = doc.createBuffer();
  const position = doc.createAccessor().setType("VEC3").setArray(vertexBuffer).setBuffer(buffer);
  const indices = doc.createAccessor().setType("SCALAR").setArray(data.surfaceDefinition.faces).setBuffer(buffer);
  const prim = doc.createPrimitive().setAttribute("POSITION", position).setIndices(indices);

  const mesh = doc.createMesh().addPrimitive(prim);
  const node = doc.createNode().setMesh(mesh);
  doc.createScene().addChild(node);

  const glb = await new WebIO().writeBinary(doc);

  return { glb, center };
};

export default getGlb;
