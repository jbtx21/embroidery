/**
 * Intersection of a straight line with a polygon including its holes (spec §5).
 *
 * Half-open counting rule at the vertices: an edge counts as a crossing when its
 * endpoints sit on opposite sides of the line, with "on the line" consistently
 * counted as the negative side. A vertex lying exactly on the scanline therefore
 * produces no double crossing — the usual source of holes in filled areas.
 */
import type { Point, Polygon } from "./types.js";
import { rings } from "./polygon.js";

export type LineHit = {
  a: Point;
  b: Point;
  /** Parameter along `dir` from `origin` — sorted ascending, ta < tb. */
  ta: number;
  tb: number;
};

/**
 * @param origin reference point of the line
 * @param dir    direction (need not be normalised; t refers to a unit-length dir)
 */
export function clipLine(origin: Point, dir: Point, poly: Polygon): LineHit[] {
  const dl = Math.hypot(dir.x, dir.y);
  if (dl < 1e-12) return [];
  const ux = dir.x / dl;
  const uy = dir.y / dl;
  // Line normal: f(p) = (p - origin) . n
  const nx = -uy;
  const ny = ux;

  const ts: number[] = [];
  for (const ring of rings(poly)) {
    if (ring.length < 3) continue;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!;
      const b = ring[(i + 1) % ring.length]!;
      const fa = (a.x - origin.x) * nx + (a.y - origin.y) * ny;
      const fb = (b.x - origin.x) * nx + (b.y - origin.y) * ny;
      if (fa <= 0 === fb <= 0) continue; // no crossing (half-open)
      const t = fa / (fa - fb); // fraction along the edge
      const px = a.x + (b.x - a.x) * t;
      const py = a.y + (b.y - a.y) * t;
      ts.push((px - origin.x) * ux + (py - origin.y) * uy);
    }
  }
  if (ts.length < 2) return [];
  ts.sort((p, q) => p - q);

  const out: LineHit[] = [];
  for (let i = 0; i + 1 < ts.length; i += 2) {
    const ta = ts[i]!;
    const tb = ts[i + 1]!;
    if (tb - ta < 1e-9) continue; // touch, not a segment
    out.push({
      a: { x: origin.x + ux * ta, y: origin.y + uy * ta },
      b: { x: origin.x + ux * tb, y: origin.y + uy * tb },
      ta,
      tb,
    });
  }
  return out;
}

/** Horizontal scanline at y — the case the fill needs after rotating. */
export function clipHorizontal(y: number, poly: Polygon): LineHit[] {
  return clipLine({ x: 0, y }, { x: 1, y: 0 }, poly);
}
