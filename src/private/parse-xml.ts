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
  };
};

const surfaceDefWorker = createEasyWebWorker<
  {
    isPoint: boolean;
    arr: SurfacePoint[] | SurfaceFace[];
    idMap?: string[];
  },
  [vertIndex: number, vertIndex: number, vertIndex: number][] | [id: string, [x: number, y: number, z: number]][]
>(
  ({ onMessage }) => {
    onMessage((message) => {
      const { isPoint, arr, idMap } = message.payload;
      if (isPoint) {
        message.resolve(
          (arr as SurfacePoint[])
            .map((pt) => [pt.attr.id, pt.content.split(" ").map(Number) as [number, number, number]] as const)
            .map((v) => [v[0] as string, [v[1][1], v[1][0], v[1][2]] as [number, number, number]])
        );
      } else {
        message.resolve(
          (arr as SurfaceFace[]).flatMap((f) => {
            if (typeof f === "string")
              return [f.split(" ").map((id) => idMap?.indexOf(id)) as [number, number, number]];
            if (f?.attr?.i === "1") return [];
            return [f.content.split(" ").map((id) => idMap?.indexOf(id)) as [number, number, number]];
          })
        );
      }
    });
  },
  { maxWorkers: 10 }
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
          if (Pnts.length > 10000) {
            const sliceIndexes = [...Array(20).keys()].map((i) => Math.round((Pnts.length / 20) * i));
            ptsIdArray = (
              (await Promise.all(
                sliceIndexes.map(
                  (v, i, a) =>
                    new Promise(async (resolve, reject) => {
                      const pts = await surfaceDefWorker.send({
                        isPoint: true,
                        arr: Pnts.slice(a[i] as number, a[i + 1] || Pnts.length),
                      });
                      resolve(pts);
                    })
                )
              )) as [id: string, [x: number, y: number, z: number]][][]
            ).reduce((prev, curr) => [...prev, ...curr], []);
          } else {
            ptsIdArray = (await surfaceDefWorker.send({ arr: Pnts, isPoint: true })) as [
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
                        isPoint: false,
                        arr: Faces.slice(a[i] as number, a[i + 1] || Faces.length),
                        idMap: pointsIdMap,
                      });
                      resolve(fcs);
                    })
                )
              )) as [number, number, number][][]
            ).reduce((prev, curr) => [...prev, ...curr], [] as [number, number, number][]);
          } else {
            faces = (await surfaceDefWorker.send({ arr: Faces, isPoint: false, idMap: pointsIdMap })) as [
              number,
              number,
              number
            ][];
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
            },
          } as ParsedSurface);
        })
    );
    resolve(await Promise.all(surfaces));
  });

export default parseXML;
