/**
 * The outline a puncher would set satin along — rough brush lettering (the
 * "SEGEN SEIN" of the Eislingen logo) smoothed first (ADR 0001).
 *
 * A distressed outline has a bump or a notch every few tenths of a millimetre
 * and holes the size of a needle's reach in it. Its medial axis branches at
 * every one of them, and no stroke plan survives that. Closing (outwards, then
 * back in) fills notches and holes narrower than twice the radius; opening
 * (inwards, then back out) takes off bumps and hairlines as narrow. What is
 * left are the strokes, which is what the satin is set along — the texture is
 * stitched over, and how much of the letter that costs is measured by the
 * caller against the original outline, never assumed.
 *
 * Only a rough outline is texture. A clean outline whose holes smoothing would
 * close has holes that are drawn on purpose — the crowns cut out of the red
 * band in the Köln coat of arms (`isTextureSmoothing`).
 */
import type { Polygon } from "@texma-stitch/geometry";
import { difference, offsetAll, polygonArea } from "@texma-stitch/geometry";

/** Pieces smaller than this (mm²) are crumbs the opening broke off, not strokes. */
const PIECE_MIN_AREA_MM2 = 0.05;

/**
 * Closing then opening by `radiusMm` (module doc). The result may be several
 * pieces — a hairline between two strokes does not survive the opening — or
 * none at all, for a shape no wider than twice the radius anywhere.
 */
export function smoothOutline(shape: Polygon, radiusMm: number): Polygon[] {
  if (radiusMm <= 0) return [shape];
  const closed = offsetAll(offsetAll([shape], radiusMm), -radiusMm);
  const opened = offsetAll(offsetAll(closed, -radiusMm), radiusMm);
  return opened.filter((p) => Math.abs(polygonArea(p)) >= PIECE_MIN_AREA_MM2);
}

/**
 * A rough outline loses at least this share of its area to the opening — its
 * bumps and hairlines. Measured: the pieces of "SEGEN SEIN" 0.9–3.3 %, the
 * clean crown band of the Köln logo 0.3 %.
 */
export const TEXTURE_EDGE_MIN = 0.005;
/**
 * A clean outline may gain at most this share of its area from the closing.
 * Measured: the varsity letters of the STUTTGART logos 0.1–3.3 %, the crown
 * band 20 % — its crowns.
 */
export const CLEAN_FILL_MAX = 0.05;

export type SmoothingChange = {
  /** Share of the shape's area the smoothing added: holes, notches, gaps closed. */
  added: number;
  /** Share it took away: bumps and hairlines opened off. */
  taken: number;
};

const areaOf = (polys: Polygon[]): number =>
  polys.reduce((sum, p) => sum + Math.abs(polygonArea(p)), 0);

/** What smoothing changed, as shares of the shape as drawn. */
export function smoothingChange(shape: Polygon, pieces: Polygon[]): SmoothingChange {
  const total = areaOf([shape]);
  if (total <= 0) return { added: 0, taken: 0 };
  return {
    added: areaOf(difference(pieces, [shape])) / total,
    taken: areaOf(difference([shape], pieces)) / total,
  };
}

/**
 * Is it texture that smoothing takes away (module doc)? Rough outlines may be
 * smoothed; a clean one only as long as it does not fill in drawn holes.
 */
export function isTextureSmoothing(change: SmoothingChange): boolean {
  return change.taken >= TEXTURE_EDGE_MIN || change.added <= CLEAN_FILL_MAX;
}
