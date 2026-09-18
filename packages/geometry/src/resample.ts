/**
 * Punkte im Abstand `step` setzen (Kap. 5). Ecken ueber 30 Grad bleiben erhalten,
 * wenn `keepCorners` gesetzt ist: der Pfad wird an den Ecken geteilt und jedes
 * Stueck fuer sich gleichmaessig aufgeteilt. So faellt die Ecke nie zwischen zwei
 * Stiche — und es entsteht kein Reststich (Kap. 6.2).
 */
import type { Polyline } from "./types.js";
import { cumulativeLengths, pointAt } from "./measure.js";
import { angleBetweenDeg, dist, sub } from "./vec.js";

export const CORNER_ANGLE_DEG = 30;

/** Indizes der Punkte, an denen die Richtung um mehr als `minAngleDeg` knickt. */
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
 * Gleichmaessige Aufteilung eines Stuecks: n = round(L / step), mindestens 1.
 * Der tatsaechliche Schritt ist L / n und liegt damit nahe am Wunsch, ohne dass
 * am Ende ein Stummel uebrig bleibt.
 */
function resampleStraight(piece: Polyline, step: number): Polyline {
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
    const sampled = resampleStraight(piece, step);
    // Nahtstelle nicht doppeln.
    for (let i = out.length === 0 ? 0 : 1; i < sampled.length; i++) out.push(sampled[i]!);
  }
  return out;
}

/** Punkte, die dichter als `minDist` beieinander liegen, zusammenfassen. */
export function dedupe(poly: Polyline, minDist = 1e-6): Polyline {
  if (poly.length === 0) return [];
  const out: Polyline = [{ ...poly[0]! }];
  for (let i = 1; i < poly.length; i++) {
    if (dist(out[out.length - 1]!, poly[i]!) > minDist) out.push({ ...poly[i]! });
  }
  return out;
}
