/**
 * Adaptive Flachung von Bezierkurven zu Polylines (Kap. 5, Toleranz 0,05 mm).
 *
 * Rekursive Unterteilung mit Flachheitstest ueber den Abstand der Kontrollpunkte
 * zur Sehne. Deterministisch: gleiche Eingabe, gleiche Punktfolge.
 */
import type { Point, Polyline } from "./types.js";
import { lerp } from "./vec.js";

export const FLATTEN_TOLERANCE_MM = 0.05;

/** Abstand von p zur Geraden durch a und b (nicht zum Segment). */
function distToLine(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l = Math.hypot(dx, dy);
  if (l < 1e-12) return Math.hypot(p.x - a.x, p.y - a.y);
  return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / l;
}

/**
 * Kubische Bezier zu Polyline. Der Startpunkt p0 ist enthalten, der Endpunkt p3
 * ebenfalls — beim Aneinanderhaengen mehrerer Segmente also den ersten Punkt des
 * Folgesegments verwerfen (siehe flattenPath).
 */
export function flattenCubic(
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  tolerance = FLATTEN_TOLERANCE_MM,
): Polyline {
  const out: Polyline = [p0];
  subdivideCubic(p0, p1, p2, p3, tolerance, 0, out);
  out.push(p3);
  return out;
}

const MAX_DEPTH = 18;

function subdivideCubic(
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  tol: number,
  depth: number,
  out: Polyline,
): void {
  if (depth >= MAX_DEPTH || (distToLine(p1, p0, p3) <= tol && distToLine(p2, p0, p3) <= tol)) {
    return; // flach genug — die Sehne p0->p3 genuegt, p3 haengt der Aufrufer an
  }
  // de Casteljau bei t = 0,5
  const p01 = lerp(p0, p1, 0.5);
  const p12 = lerp(p1, p2, 0.5);
  const p23 = lerp(p2, p3, 0.5);
  const p012 = lerp(p01, p12, 0.5);
  const p123 = lerp(p12, p23, 0.5);
  const mid = lerp(p012, p123, 0.5);

  subdivideCubic(p0, p01, p012, mid, tol, depth + 1, out);
  out.push(mid);
  subdivideCubic(mid, p123, p23, p3, tol, depth + 1, out);
}

/** Quadratische Bezier — als kubische mit angehobenem Grad. */
export function flattenQuadratic(
  p0: Point,
  p1: Point,
  p2: Point,
  tolerance = FLATTEN_TOLERANCE_MM,
): Polyline {
  const c1: Point = { x: p0.x + (2 / 3) * (p1.x - p0.x), y: p0.y + (2 / 3) * (p1.y - p0.y) };
  const c2: Point = { x: p2.x + (2 / 3) * (p1.x - p2.x), y: p2.y + (2 / 3) * (p1.y - p2.y) };
  return flattenCubic(p0, c1, c2, p2, tolerance);
}

export type PathSegment =
  | { kind: "line"; to: Point }
  | { kind: "cubic"; c1: Point; c2: Point; to: Point }
  | { kind: "quadratic"; c: Point; to: Point };

/**
 * Ganzen Pfad flachen: Startpunkt plus Segmentfolge. Aufeinanderfolgende
 * Duplikate werden verworfen, damit spaetere Stufen keine Nullsegmente sehen.
 */
export function flattenPath(
  start: Point,
  segments: PathSegment[],
  tolerance = FLATTEN_TOLERANCE_MM,
): Polyline {
  const out: Polyline = [start];
  let cur = start;
  for (const seg of segments) {
    let piece: Polyline;
    switch (seg.kind) {
      case "line":
        piece = [cur, seg.to];
        break;
      case "cubic":
        piece = flattenCubic(cur, seg.c1, seg.c2, seg.to, tolerance);
        break;
      case "quadratic":
        piece = flattenQuadratic(cur, seg.c, seg.to, tolerance);
        break;
    }
    for (let i = 1; i < piece.length; i++) {
      const p = piece[i]!;
      const last = out[out.length - 1]!;
      if (Math.abs(p.x - last.x) > 1e-12 || Math.abs(p.y - last.y) > 1e-12) out.push(p);
    }
    cur = seg.to;
  }
  return out;
}
