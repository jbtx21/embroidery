/**
 * Lokale Typdeklaration fuer clipper2-wasm.
 *
 * Das Paket zeigt mit "types" auf dist/es/clipper2z.d.ts — diese Datei liefert es
 * aber nicht aus (sie liegt eine Ebene hoeher). Statt den Import auf `any` fallen
 * zu lassen, deklarieren wir hier genau die Oberflaeche, die wir benutzen.
 */
declare module "clipper2-wasm/dist/es/clipper2z.js" {
  export interface Point64 {
    x: bigint;
    y: bigint;
    delete(): void;
  }
  export interface Path64 {
    size(): number;
    view(): BigInt64Array;
    delete(): void;
  }
  export interface Paths64 {
    push_back(path: Path64): void;
    size(): number;
    get(index: number): Path64;
    delete(): void;
  }
  export interface EnumValue<T extends number> {
    value: T;
  }
  export interface Clipper2Module {
    FillRule: {
      EvenOdd: EnumValue<0>;
      NonZero: EnumValue<1>;
      Positive: EnumValue<2>;
      Negative: EnumValue<3>;
    };
    JoinType: { Square: EnumValue<0>; Round: EnumValue<2>; Miter: EnumValue<3> };
    EndType: {
      Polygon: EnumValue<0>;
      Joined: EnumValue<1>;
      Butt: EnumValue<2>;
      Square: EnumValue<3>;
      Round: EnumValue<4>;
    };
    Paths64: { new (): Paths64 };
    MakePath64(coords: number[]): Path64;
    Union64(subjects: Paths64, clips: Paths64, fillRule: EnumValue<number>): Paths64;
    UnionSelf64(subjects: Paths64, fillRule: EnumValue<number>): Paths64;
    Difference64(subjects: Paths64, clips: Paths64, fillRule: EnumValue<number>): Paths64;
    Intersect64(subjects: Paths64, clips: Paths64, fillRule: EnumValue<number>): Paths64;
    InflatePaths64(
      paths: Paths64,
      delta: number,
      joinType: EnumValue<number>,
      endType: EnumValue<number>,
      miterLimit: number,
      arcTolerance: number,
    ): Paths64;
  }
  const factory: () => Promise<Clipper2Module>;
  export default factory;
}
