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

// ---------------------------------------------------------------------------
// Curvature-adaptive sampling (spec §6.1)
// ---------------------------------------------------------------------------

/** Shortest stitch the adaptive step may produce (spec §6.1). */
export const MIN_ADAPTIVE_MM = 0.8;
/** Largest chord deviation accepted, half the DST resolution (spec §6.1). */
export const CURVE_TOLERANCE_MM = 0.05;

/**
 * Local radius at every point: the circumradius of the point and its two
 * neighbours. Collinear neighbours give `Infinity` — a straight path has no
 * curvature and needs no shorter stitch. The ends have only one neighbour, so
 * they are `Infinity` too unless the path closes back on itself.
 */
export function curvatureRadii(poly: Polyline, closed = false): number[] {
  const n = poly.length;
  const out = new Array<number>(n).fill(Infinity);
  if (n < 3) return out;

  for (let i = 0; i < n; i++) {
    const prev = i === 0 ? (closed ? poly[n - 1]! : undefined) : poly[i - 1]!;
    const next = i === n - 1 ? (closed ? poly[0]! : undefined) : poly[i + 1]!;
    if (!prev || !next) continue;
    const cur = poly[i]!;
    const a = dist(prev, cur);
    const b = dist(cur, next);
    const c = dist(prev, next);
    // Twice the triangle area, via the cross product.
    const area2 = Math.abs(
      (cur.x - prev.x) * (next.y - prev.y) - (cur.y - prev.y) * (next.x - prev.x),
    );
    if (area2 < 1e-12) continue; // collinear
    out[i] = (a * b * c) / (2 * area2);
  }
  return out;
}

export type AdaptiveOptions = {
  minStep?: number;
  toleranceMm?: number;
  keepCorners?: boolean;
  /** The path returns to its start, so the curvature at the ends wraps around. */
  closed?: boolean;
};

/** Step allowed at radius R so the chord stays within `tol` of the arc. */
const stepForRadius = (r: number, tol: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Math.sqrt(8 * r * tol)));

function adaptivePiece(
  piece: Polyline,
  radii: number[],
  maxStep: number,
  minStep: number,
  tol: number,
): Polyline {
  const cum = cumulativeLengths(piece);
  const total = cum[cum.length - 1]!;
  if (total < 1e-9) return [{ ...piece[0]! }];

  // The tighter of the two radii around the current position decides — a curve
  // must not be cut short because the step started on its gentler side.
  const radiusAt = (s: number): number => {
    let i = 0;
    while (i + 2 < cum.length && cum[i + 1]! < s) i++;
    return Math.min(radii[i] ?? Infinity, radii[i + 1] ?? Infinity);
  };

  const end = piece[piece.length - 1]!;
  const out: Polyline = [{ ...piece[0]! }];
  let s = 0;
  let here = piece[0]!;
  for (;;) {
    // The step is walked along the path, but a stitch IS the chord — on a tight
    // curve the chord is much shorter than the arc, so the floor has to be
    // checked on it. Grow the arc until the chord clears the floor.
    let step = stepForRadius(radiusAt(s), tol, minStep, maxStep);
    let candidate = pointAt(piece, Math.min(total, s + step), cum);
    for (let i = 0; i < 8 && s + step < total; i++) {
      const chord = dist(here, candidate);
      if (chord >= minStep - 1e-9) break;
      step += minStep - chord;
      candidate = pointAt(piece, Math.min(total, s + step), cum);
    }
    if (s + step >= total || dist(candidate, end) < minStep) break; // stub ahead
    out.push(candidate);
    s += step;
    here = candidate;
  }
  // Split the remainder if it grew past a full stitch; both halves stay above
  // the floor, because the whole is more than twice it.
  if (dist(here, end) > maxStep) out.push(pointAt(piece, (s + total) / 2, cum));
  out.push({ ...end });
  return out;
}

/**
 * Like `resample`, but the step follows the curvature (spec §6.1): full stitch
 * length on a straight run, shorter in a tight curve, never below `minStep`.
 */
export function resampleAdaptive(
  poly: Polyline,
  maxStep: number,
  opts: AdaptiveOptions = {},
): Polyline {
  const minStep = opts.minStep ?? MIN_ADAPTIVE_MM;
  const tol = opts.toleranceMm ?? CURVE_TOLERANCE_MM;
  if (poly.length < 2 || maxStep <= 0) return poly.map((p) => ({ ...p }));

  const radii = curvatureRadii(poly, opts.closed ?? false);
  const splits = (opts.keepCorners ?? true) ? cornerIndices(poly) : [];
  const bounds = [0, ...splits, poly.length - 1];

  const out: Polyline = [];
  for (let b = 0; b < bounds.length - 1; b++) {
    const from = bounds[b]!;
    const to = bounds[b + 1]!;
    if (to <= from) continue;
    const sampled = adaptivePiece(
      poly.slice(from, to + 1),
      radii.slice(from, to + 1),
      maxStep,
      Math.min(minStep, maxStep),
      tol,
    );
    // Do not duplicate the seam point.
    for (let i = out.length === 0 ? 0 : 1; i < sampled.length; i++) out.push(sampled[i]!);
  }
  return out;
}
