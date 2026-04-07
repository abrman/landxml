declare module "mproj" {
  function proj(src: string, dst: string, coords: number[]): number[];
  function proj(
    src: string,
    dst: string
  ): { forward(coords: number[]): number[]; inverse(coords: number[]): number[] };
  namespace proj {
    const internal: {
      wkt_to_proj4(wkt: string): string;
      [key: string]: unknown;
    };
  }
  export = proj;
}
