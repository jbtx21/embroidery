/** Bogenlaenge, Punkt bei Laenge, naechster Punkt (Kap. 5). */
import type { Point, Polyline } from "./types.js";
import { dist, lerp } from "./vec.js";

/** Kumulierte Laengen: cum[i] = Laenge von Punkt 0 bis Punkt i. cum[0] = 0. */
export function cumulativeLengths(poly: Polyline): number[] {
  const cum = new Array<number>(poly.length);
  cum[0] = 0;
  for (let i = 1; i < poly.length; i++) cum[i] = cum[i - 1]! + dist(poly[i - 1]!, poly[i]!);
  return cum;
}

export function arcLength(poly: Polyline): number {
  let sum = 0;
  for (let i = 1; i < poly.length; i++) sum += dist(poly[i - 1]!, poly[i]!);
  return sum;
}

/**
 * Punkt bei Bogenlaenge s. Ausserhalb wird geklemmt, damit Aufrufer keine
 * Sonderfaelle bauen muessen.
 */
export function pointAt(poly: Polyline, s: number, cum?: number[]): Point {
  if (poly.length === 0) return { x: 0, y: 0 };
  if (poly.length === 1) return { ...poly[0]! };
  const c = cum ?? cumulativeLengths(poly);
  const total = c[c.length - 1]!;
  if (s <= 0) return { ...poly[0]! };
  if (s >= total) return { ...poly[poly.length - 1]! };

  // Binaersuche auf die kumulierten Laengen.
  let lo = 0;
  let hi = c.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (c[mid]! <= s) lo = mid;
    else hi = mid;
  }
  const segLen = c[hi]! - c[lo]!;
  const t = segLen < 1e-12 ? 0 : (s - c[lo]!) / segLen;
  return lerp(poly[lo]!, poly[hi]!, t);
}

/** Punkt bei Bogenlaengen-Anteil t in [0,1] — Grundlage der Satin-Paarung (Kap. 7.1). */
export function pointAtFraction(poly: Polyline, t: number, cum?: number[]): Point {
  const c = cum ?? cumulativeLengths(poly);
  return pointAt(poly, t * c[c.length - 1]!, c);
}

/** Tangentenrichtung bei Bogenlaenge s (normiert). */
export function tangentAt(poly: Polyline, s: number, cum?: number[]): Point {
  if (poly.length < 2) return { x: 1, y: 0 };
  const c = cum ?? cumulativeLengths(poly);
  const total = c[c.length - 1]!;
  const clamped = Math.min(Math.max(s, 0), total);
  let i = 0;
  while (i < c.length - 2 && c[i + 1]! <= clamped) i++;
  const a = poly[i]!;
  const b = poly[i + 1]!;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l = Math.hypot(dx, dy);
  return l < 1e-12 ? { x: 1, y: 0 } : { x: dx / l, y: dy / l };
}

export type NearestResult = {
  /** Der naechstgelegene Punkt auf der Polyline. */
  point: Point;
  /** Abstand zu p. */
  distance: number;
  /** Index des Segments, auf dem der Punkt liegt (Segment i geht von i nach i+1). */
  index: number;
  /** Parameter 0..1 innerhalb des Segments. */
  t: number;
  /** Bogenlaenge vom Anfang bis zum Punkt. */
  length: number;
};

export function nearestPoint(poly: Polyline, p: Point, cum?: number[]): NearestResult {
  if (poly.length === 0) {
    return { point: { x: 0, y: 0 }, distance: Infinity, index: 0, t: 0, length: 0 };
  }
  if (poly.length === 1) {
    return { point: { ...poly[0]! }, distance: dist(poly[0]!, p), index: 0, t: 0, length: 0 };
  }
  const c = cum ?? cumulativeLengths(poly);
  let best: NearestResult = {
    point: { ...poly[0]! },
    distance: Infinity,
    index: 0,
    t: 0,
    length: 0,
  };
  for (let i = 0; i < poly.length - 1; i++) {
    const a = poly[i]!;
    const b = poly[i + 1]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    let t = 0;
    if (lenSq > 1e-24) {
      t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
      t = Math.min(1, Math.max(0, t));
    }
    const q: Point = { x: a.x + dx * t, y: a.y + dy * t };
    const d = dist(q, p);
    if (d < best.distance) {
      best = { point: q, distance: d, index: i, t, length: c[i]! + t * Math.sqrt(lenSq) };
    }
  }
  return best;
}
