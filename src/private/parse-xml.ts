import fs from "fs";
import xml2json from "xml2json";

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

const parseXML = async (xmlString: string): Promise<ParsedSurface[]> => {
  const { LandXML }: any = await xml2json.toJson(xmlString, { object: true, coerce: true, arrayNotation: true });

  return LandXML[0].Surfaces[0].Surface.map((surface: any) => {
    let points: [number, number, number][] = [];
    let faces: [number, number, number][] = [];

    let pointIdMap: { [key: string]: number } = {};

    surface.Definition[0].Pnts[0].P.forEach((pt: any) => {
      const { id, $t } = pt;
      const [y, x, z] = $t.split(" ").map((v: string) => parseFloat(v));
      points.push([x, y, z]);
      pointIdMap[id] = points.length - 1;
    }, []);

    faces = surface.Definition[0].Faces[0].F.map((face: any) => {
      const { $t } = face;
      const [a, b, c] = $t.split(" ").map((v: string) => pointIdMap[v]);
      if ([a, b, c].filter((v) => typeof v === "undefined").length > 0) {
        throw `Invalid LandXML. A face is referencing a point that doesn't exist. Face is referencing points: ${$t}`;
      }
      return [a, b, c];
    });

    return {
      sourceFile: LandXML[0].Project[0].name,
      timeStamp: LandXML[0].Application[0].timeStamp,
      name: surface.name,
      description: surface.desc,
      wktString: LandXML[0]?.CoordinateSystem?.[0]?.ogcWktCode || undefined,
      surfaceDefinition: {
        points,
        faces,
      },
    };
  });
};

export default parseXML;
