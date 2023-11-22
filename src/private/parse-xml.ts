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

const parseXML = async (xmlString: string): Promise<ParsedSurface[]> => {
  const { LandXML } = convert.xml2js(xmlString, {
    compact: true,
    attributesKey: "attr",
    textKey: "content",
  }) as any;

  const landXML_surfaces = Array.isArray(LandXML.Surfaces.Surface)
    ? LandXML.Surfaces.Surface
    : [LandXML.Surfaces.Surface];

  return landXML_surfaces.map((surface: any) => {
    let points: [number, number, number][] = [];
    let faces: [number, number, number][] = [];

    let pointIdMap: { [key: string]: number } = {};

    surface.Definition.Pnts.P.forEach((pt: any) => {
      const { attr, content } = pt;
      const [y, x, z] = content.split(" ").map((v: string) => parseFloat(v));
      points.push([x, y, z]);
      pointIdMap[attr.id] = points.length - 1;
    }, []);

    faces = surface.Definition.Faces.F.map((face: any) => {
      const { content } = face;
      const [a, b, c] = content.split(" ").map((v: string) => pointIdMap[v]);
      if ([a, b, c].filter((v) => typeof v === "undefined").length > 0) {
        throw `Invalid LandXML. A face is referencing a point that doesn't exist. Face is referencing points: ${content}`;
      }
      return [a, b, c];
    });

    return {
      sourceFile: LandXML.Project.attr.name,
      timeStamp: LandXML.Application.attr.timeStamp,
      name: surface.attr.name,
      description: surface.attr.desc,
      wktString: LandXML.CoordinateSystem?.attr?.ogcWktCode,
      surfaceDefinition: {
        points,
        faces,
      },
    };
  });
};

export default parseXML;
