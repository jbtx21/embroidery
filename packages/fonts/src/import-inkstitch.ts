/**
 * Converter from Ink/Stitch SVG fonts to our font JSON (spec §9).
 *
 * NOT IMPLEMENTED YET. The format on our side is fixed (see `types.ts`), so the
 * engine can lay out text today; what is missing is the source data — the
 * Ink/Stitch SVG fonts, most of them under OFL.
 *
 * TODO: read the SVG, take one group per glyph, recognise the satin columns
 * (two rails plus rungs, the way Ink/Stitch marks them), normalise to a cap
 * height of 1.0, read `advance` from the glyph width and kerning from the
 * horiz-adv pairs, and write the JSON.
 */
import type { Font } from "./types.js";

export function importInkstitchFont(_svg: string): Font {
  throw new Error("importInkstitchFont is not implemented yet (spec §9).");
}
