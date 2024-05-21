interface LandXML {
  LandXML: {
    attr: {
      xmlns: string;
      "xmlns:xsi": string;
      "xsi:schemaLocation": string;
      date: string;
      time: string;
      version: string;
      language: string;
      readOnly: string;
    };
    Units:
      | {
          Imperial: {
            attr: {
              areaUnit: string;
              linearUnit: string;
              volumeUnit: string;
              temperatureUnit: string;
              pressureUnit: string;
              diameterUnit: string;
              angularUnit: string;
              directionUnit: string;
            };
          };
        }
      | {
          Metric: {
            attr: {
              areaUnit: string;
              linearUnit: string;
              volumeUnit: string;
              temperatureUnit: string;
              pressureUnit: string;
              diameterUnit: string;
              angularUnit: string;
              directionUnit: string;
            };
          };
        };
    Project: {
      attr: {
        name: string;
      };
    };
    CoordinateSystem: {
      attr: {
        desc: string;
        ogcWktCode: string;
      };
    };
    Application: {
      attr: {
        name: string;
        desc: string;
        manufacturer: string;
        version: string;
        timeStamp: string;
      };
    };
    Surfaces: {
      Surface: Surface | Surface[];
    };
  };
}

interface Surface {
  attr: {
    name: string;
    desc: string;
  };
  SourceData?: any;
  Definition: {
    attr: {
      surfType: string;
    };
    Pnts: {
      P: SurfacePoint[];
    };
    Faces: {
      F: SurfaceFace[];
    };
  };
}

type SurfacePoint = {
  attr: {
    id: string;
  };
  content: string;
};

type SurfaceFace =
  | {
      attr: {
        i?: string;
      };
      content: string;
    }
  | string;
