declare module "mproj" {
  function proj(src: string, dst: string, coords: number[]): number[];
  function proj(
    src: string,
    dst: string
  ): { forward(coords: number[]): number[]; inverse(coords: number[]): number[] };
  export = proj;
}
