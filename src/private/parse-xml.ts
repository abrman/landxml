import { createEasyWebWorker } from "easy-web-worker";
import convert from "xml-js";

export type ParsedSurface = {
  sourceFile: string;
  timeStamp: string;
  name: string;
  description: string;
  wktString?: string;
  surfaceDefinition: {
    points: [x: number, y: number, z: number][];
    faces: [vertIndexA: number, vertIndexB: number, vertIndexC: number][];
    faceNeighbors: [faceIndex: number, faceIndex: number, faceIndex: number][];
  };
};

const surfaceDefWorker = createEasyWebWorker<
  | {
      task: "parse-surface-points";
      points: SurfacePoint[];
    }
  | {
      task: "parse-surface-faces";
      faces: SurfaceFace[];
      idMap?: string[];
    }
  | {
      task: "find-neighboring-faces";
      faces: [vertIndex: number, vertIndex: number, vertIndex: number][];
      range: { start: number; end: number };
    },
  | [id: string, [x: number, y: number, z: number]][]
  | [vertIndex: number, vertIndex: number, vertIndex: number][]
  | [faceIndex: number, faceIndex: number, faceIndex: number][]
>(
  ({ onMessage }) => {
    onMessage((message) => {
      try {
        const { task } = message.payload;
        if (task === "parse-surface-points") {
          const { points } = message.payload;
          message.resolve(
            points
              .map((pt) => [pt.attr.id, pt.content.split(" ").map(Number) as [number, number, number]] as const)
              .map((v) => [v[0] as string, [v[1][1], v[1][0], v[1][2]] as [number, number, number]])
          );
        } else if (task === "parse-surface-faces") {
          const { faces, idMap } = message.payload;
          message.resolve(
            faces.flatMap((f) => {
              if (typeof f === "string")
                return [f.split(" ").map((id) => idMap?.indexOf(id)) as [number, number, number]];
              if (f?.attr?.i === "1") return [];
              return [f.content.split(" ").map((id) => idMap?.indexOf(id)) as [number, number, number]];
            })
          );
        } else if (task === "find-neighboring-faces") {
          //prettier-ignore
          const { faces, range: {start, end} } = message.payload;
          const faceNeighbors: [faceIndex: number, faceIndex: number, faceIndex: number][] = [];
          for (let i = start; i < end; i++) {
            const sourceFace = faces[i] as [vertIndex: number, vertIndex: number, vertIndex: number];
            // prettier-ignore
            const neighborA = faces.findIndex((f,j) => f.findIndex((v) => v === sourceFace[0]) >= 0 && f.findIndex((v) => v === sourceFace[1]) >= 0 && j !== i);
            // prettier-ignore
            const neighborB = faces.findIndex((f,j) => f.findIndex((v) => v === sourceFace[1]) >= 0 && f.findIndex((v) => v === sourceFace[2]) >= 0 && j !== i);
            // prettier-ignore
            const neighborC = faces.findIndex((f,j) => f.findIndex((v) => v === sourceFace[0]) >= 0 && f.findIndex((v) => v === sourceFace[2]) >= 0 && j !== i);
            faceNeighbors.push([neighborA, neighborB, neighborC]);
          }
          message.resolve(faceNeighbors);
        }
      } catch (e) {
        message.reject(e);
      }
    });
  },
  { maxWorkers: 16 }
);

const parseXML = async (xmlString: string): Promise<ParsedSurface[]> =>
  new Promise(async (resolve, reject) => {
    const parsed = convert.xml2js(xmlString, {
      compact: true,
      attributesKey: "attr",
      textKey: "content",
    }) as LandXML;

    if (typeof parsed.LandXML?.Surfaces?.Surface === "undefined") {
      throw new Error("LandXML doesn't contain any surfaces");
      return;
    }

    if (!Array.isArray(parsed.LandXML.Surfaces.Surface)) {
      parsed.LandXML.Surfaces.Surface = [parsed.LandXML.Surfaces.Surface];
    }

    let sourceFile = parsed.LandXML.Project.attr.name || "Undefined source";
    let timeStamp = parsed.LandXML.Application.attr.timeStamp || "";
    let wktString = parsed.LandXML?.CoordinateSystem?.attr?.ogcWktCode || undefined;

    const surfaces = (parsed.LandXML.Surfaces.Surface as Surface[]).map(
      async (surface) =>
        new Promise<ParsedSurface>(async (resolve, reject) => {
          const { name, desc } = surface.attr;
          const Pnts = surface.Definition.Pnts.P;
          const Faces = surface.Definition.Faces.F;

          let ptsIdArray: [id: string, [x: number, y: number, z: number]][] = [];
          let faces: [vertIndex: number, vertIndex: number, vertIndex: number][] = [];
          let faceNeighbors: [faceIndex: number, faceIndex: number, faceIndex: number][] = [];
          if (Pnts.length > 10000) {
            const sliceIndexes = [...Array(20).keys()].map((i) => Math.round((Pnts.length / 20) * i));
            ptsIdArray = (
              (await Promise.all(
                sliceIndexes.map(
                  (v, i, a) =>
                    new Promise(async (resolve, reject) => {
                      const pts = await surfaceDefWorker.send({
                        task: "parse-surface-points",
                        points: Pnts.slice(a[i] as number, a[i + 1] || Pnts.length),
                      });
                      resolve(pts);
                    })
                )
              )) as [id: string, [x: number, y: number, z: number]][][]
            ).reduce((prev, curr) => [...prev, ...curr], []);
          } else {
            ptsIdArray = (await surfaceDefWorker.send({ task: "parse-surface-points", points: Pnts })) as [
              id: string,
              [x: number, y: number, z: number]
            ][];
          }
          const points = ptsIdArray.map((v) => v[1]);
          const pointsIdMap = ptsIdArray.map((v) => v[0]);

          if (Faces.length > 10000) {
            const sliceIndexes = [...Array(20).keys()].map((i) => Math.round((Faces.length / 20) * i));
            faces = (
              (await Promise.all(
                sliceIndexes.map(
                  (v, i, a) =>
                    new Promise(async (resolve, reject) => {
                      const fcs = await surfaceDefWorker.send({
                        task: "parse-surface-faces",
                        faces: Faces.slice(a[i] as number, a[i + 1] || Faces.length),
                        idMap: pointsIdMap,
                      });
                      resolve(fcs);
                    })
                )
              )) as [number, number, number][][]
            ).reduce((prev, curr) => [...prev, ...curr], [] as [number, number, number][]);
          } else {
            faces = (await surfaceDefWorker.send({
              task: "parse-surface-faces",
              faces: Faces,
              idMap: pointsIdMap,
            })) as [number, number, number][];
          }

          if (Faces.length > 10000) {
            const sliceIndexes = [...Array(20).keys()].map((i) => Math.round(((faces.length - 1) / 20) * i));
            faceNeighbors = (
              (await Promise.all(
                sliceIndexes.map(
                  (v, i, a) =>
                    new Promise(async (resolve, reject) => {
                      const fcs = await surfaceDefWorker.send({
                        task: "find-neighboring-faces",
                        faces,
                        range: {
                          start: a[i] as number,
                          end: a[i + 1] || faces.length,
                        },
                      });
                      resolve(fcs);
                    })
                )
              )) as [number, number, number][][]
            ).reduce((prev, curr) => [...prev, ...curr], [] as [number, number, number][]);
          } else {
            faceNeighbors = (await surfaceDefWorker.send({
              task: "find-neighboring-faces",
              faces,
              range: {
                start: 0,
                end: faces.length - 1,
              },
            })) as [number, number, number][];
          }

          resolve({
            sourceFile,
            timeStamp: timeStamp || "",
            name,
            description: desc || "",
            wktString,
            surfaceDefinition: {
              points,
              faces,
              faceNeighbors,
            },
          } as ParsedSurface);
        })
    );
    resolve(await Promise.all(surfaces));
  });

export default parseXML;
