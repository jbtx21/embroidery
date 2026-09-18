/**
 * Embroidery fonts (spec §9).
 *
 * A glyph is a list of satin columns (rails plus rungs) in units of a cap height
 * of 1.0, together with `advance` and optional kerning. Laying out scales to
 * `heightMm`; the satin parameters come from the preset.
 */
import type { Point, Polyline } from "@texma-stitch/geometry";

export type GlyphColumn = {
  railA: Polyline;
  railB: Polyline;
  rungs: [Point, Point][];
};

export type Glyph = {
  /** Satin columns of the letter. */
  columns: GlyphColumn[];
  /** Thin parts stitched as a running stitch (dots, accents). */
  strokes?: Polyline[];
  /** Advance to the next letter, in cap heights. */
  advance: number;
};

export type Font = {
  id: string;
  name: string;
  /** Below this height the engine warns (spec §9, typically 5 mm). */
  minHeightMm: number;
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
