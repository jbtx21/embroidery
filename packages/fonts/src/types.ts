/**
 * Embroidery fonts (spec §9).
 *
 * A glyph is a list of satin columns (rails plus rungs) in units of a cap height
 * of 1.0, together with `advance` and optional kerning. Laying out scales to
 * `heightMm`; the satin parameters come from the font where it states them and
 * from the preset otherwise (spec §9.2).
 */
import type { Point, Polyline } from "@texma-stitch/geometry";

export type GlyphColumn = {
  railA: Polyline;
  railB: Polyline;
  rungs: [Point, Point][];
  /**
   * What the font says about this column (spec §9.2). The glyph was drawn with
   * these values and its side bearings are cut to match, so they beat the
   * preset. Absent where the font says nothing.
   */
  spacingMm?: number;
  pullCompMm?: number;
  shortStitchMm?: number;
};

/** A thin part stitched as a running stitch — a dot, an accent, a connector. */
export type GlyphStroke = { kind: "stroke"; path: Polyline };

/** One piece of a glyph. */
export type GlyphPart = ({ kind: "column" } & GlyphColumn) | GlyphStroke;

export type Glyph = {
  /**
   * The pieces of the letter IN STITCH ORDER (spec §9.3).
   *
   * Columns and connectors alternate in a real font — column, way to the next
   * column, column. Two separate lists would lose exactly that, and the
   * connectors would end up stitched over the finished letter.
   */
  parts: GlyphPart[];
  /** Advance to the next letter, in cap heights. */
  advance: number;
};

/** The satin columns of a glyph, in order. */
export const columnsOf = (g: Glyph): GlyphColumn[] =>
  g.parts.filter((p): p is { kind: "column" } & GlyphColumn => p.kind === "column");

/** The running-stitch pieces of a glyph, in order. */
export const strokesOf = (g: Glyph): Polyline[] =>
  g.parts.filter((p): p is GlyphStroke => p.kind === "stroke").map((p) => p.path);

export type Font = {
  id: string;
  name: string;
  /** Below this height the engine warns (spec §9, typically 5 mm). */
  minHeightMm: number;
  /** Above this height too — what the font itself declares (spec §9.4). */
  maxHeightMm?: number;
  glyphs: Record<string, Glyph>;
  /** Pairwise kerning, key "AV", in cap heights. */
  kerning?: Record<string, number>;
};

export type FontRegistry = { get(id: string): Font | undefined };

export function fontRegistry(fonts: Font[]): FontRegistry {
  const map = new Map(fonts.map((f) => [f.id, f]));
  return { get: (id) => map.get(id) };
}

export function kerningOf(font: Font, left: string, right: string): number {
  return font.kerning?.[`${left}${right}`] ?? 0;
}
