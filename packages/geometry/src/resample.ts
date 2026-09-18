/**
 * Place points at a spacing of `step` (spec §5). Corners sharper than 30 degrees
 * survive when `keepCorners` is set: the path is split at those corners and each
 * piece is divided evenly on its own. That way a corner never falls between two
 * stitches — and no remnant stitch is left over (spec §6.2).
 */
import type { Polyline } from "./types.js";
import { cumulativeLengths, pointAt } from "./measure.js";
import { angleBetweenDeg, dist, sub } from "./vec.js";

export const CORNER_ANGLE_DEG = 30;

/** Indices of points where the direction turns by more than `minAngleDeg`. */
export function cornerIndices(poly: Polyline, minAngleDeg = CORNER_ANGLE_DEG): number[] {
  const out: number[] = [];
  for (let i = 1; i < poly.length - 1; i++) {
    const inDir = sub(poly[i]!, poly[i - 1]!);
    const outDir = sub(poly[i + 1]!, poly[i]!);
    if (angleBetweenDeg(inDir, outDir) > minAngleDeg) out.push(i);
  }
  return out;
}

/**
 * Even division of one piece: n = round(L / step), at least 1. The actual step
 * is L / n, close to what was asked for and without a stub left at the end.
 */
function resamplePiece(piece: Polyline, step: number): Polyline {
  const cum = cumulativeLengths(piece);
  const total = cum[cum.length - 1]!;
  if (total < 1e-9) return [{ ...piece[0]! }];
  const n = Math.max(1, Math.round(total / step));
  const actual = total / n;
  const out: Polyline = [{ ...piece[0]! }];
  for (let i = 1; i < n; i++) out.push(pointAt(piece, i * actual, cum));
  out.push({ ...piece[piece.length - 1]! });
  return out;
}

export function resample(poly: Polyline, step: number, keepCorners = true): Polyline {
  if (poly.length < 2 || step <= 0) return poly.map((p) => ({ ...p }));

  const splits = keepCorners ? cornerIndices(poly) : [];
  const bounds = [0, ...splits, poly.length - 1];

  const out: Polyline = [];
  for (let b = 0; b < bounds.length - 1; b++) {
    const from = bounds[b]!;
    const to = bounds[b + 1]!;
    if (to <= from) continue;
    const piece = poly.slice(from, to + 1);
    const sampled = resamplePiece(piece, step);
    // Do not duplicate the seam point.
    for (let i = out.length === 0 ? 0 : 1; i < sampled.length; i++) out.push(sampled[i]!);
  }
  return out;
}

/** Merge points that lie closer together than `minDist`. */
export function dedupe(poly: Polyline, minDist = 1e-6): Polyline {
  if (poly.length === 0) return [];
  const out: Polyline = [{ ...poly[0]! }];
  for (let i = 1; i < poly.length; i++) {
    if (dist(out[out.length - 1]!, poly[i]!) > minDist) out.push({ ...poly[i]! });
  }
  return out;
}
