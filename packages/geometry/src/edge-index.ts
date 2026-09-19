/**
 * Uniform grid over the edges of a polygon (spec §5, serving `insideTravel`).
 *
 * The visibility tests behind `insideTravel` ask the same two questions
 * thousands of times for one shape: which edges could this segment cross, and
 * does this point lie inside. Answered by walking every edge, both are O(E) — on
 * a real logo outline (2000+ edges after import) that is what pushes a fill past
 * the performance budget of rule 9. The grid answers both from the few cells the
 * query actually touches.
 *
 * The index is a lookup, not a decision: it never says whether something
 * intersects, only which edges are worth testing. The exact tests stay in
 * `travel.ts`.
 */
import type { Point, Polygon } from "./types.js";
import { rings } from "./polygon.js";

export type Edge = { a: Point; b: Point };

/** Cells per axis. sqrt(E) keeps the average bucket at a handful of edges. */
const MIN_CELLS = 1;
const MAX_CELLS = 256;
/** Bucket padding against floating point noise on cell borders (mm). */
const PAD = 1e-6;

export interface EdgeIndex {
  /** Every edge of the polygon, outer ring first. */
  readonly edges: readonly Edge[];
  /**
   * Indices of the edges that the segment a-b could cross — a superset, in the
   * deterministic order the grid walk produces (not sorted; callers test all of
   * them anyway).
   */
  near(a: Point, b: Point): number[];
  /**
   * Even-odd test with a ray towards +x, identical in result to
   * `pointInPolygon` (outer minus holes) for properly nested rings.
   */
  contains(p: Point): boolean;
}

function edgesOf(poly: Polygon): Edge[] {
  const out: Edge[] = [];
  for (const ring of rings(poly)) {
    for (let i = 0; i < ring.length; i++) {
      out.push({ a: ring[i]!, b: ring[(i + 1) % ring.length]! });
    }
  }
  return out;
}

export function buildEdgeIndex(poly: Polygon): EdgeIndex {
  const edges = edgesOf(poly);

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const e of edges) {
    minX = Math.min(minX, e.a.x, e.b.x);
    minY = Math.min(minY, e.a.y, e.b.y);
    maxX = Math.max(maxX, e.a.x, e.b.x);
    maxY = Math.max(maxY, e.a.y, e.b.y);
  }
  if (edges.length === 0) {
    minX = minY = 0;
    maxX = maxY = 0;
  }

  const cells = Math.min(MAX_CELLS, Math.max(MIN_CELLS, Math.ceil(Math.sqrt(edges.length))));
  const width = Math.max(maxX - minX, 1e-9);
  const height = Math.max(maxY - minY, 1e-9);
  const cellW = width / cells;
  const cellH = height / cells;

  const col = (x: number): number =>
    Math.min(cells - 1, Math.max(0, Math.floor((x - minX) / cellW)));
  const row = (y: number): number =>
    Math.min(cells - 1, Math.max(0, Math.floor((y - minY) / cellH)));

  const buckets: number[][] = Array.from({ length: cells * cells }, () => []);
  for (const [i, e] of edges.entries()) {
    const c0 = col(Math.min(e.a.x, e.b.x) - PAD);
    const c1 = col(Math.max(e.a.x, e.b.x) + PAD);
    const r0 = row(Math.min(e.a.y, e.b.y) - PAD);
    const r1 = row(Math.max(e.a.y, e.b.y) + PAD);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) buckets[r * cells + c]!.push(i);
    }
  }

  // Generation stamps: an edge sits in several cells and must be collected once
  // per query, without clearing an array of length E every time.
  const stamp = new Int32Array(edges.length);
  let generation = 0;

  const collect = (cell: number, out: number[]): void => {
    for (const i of buckets[cell]!) {
      if (stamp[i] === generation) continue;
      stamp[i] = generation;
      out.push(i);
    }
  };

  /** Liang-Barsky against the grid box; returns the visible piece of a-b. */
  const clip = (a: Point, b: Point): [Point, Point] | undefined => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    let t0 = 0;
    let t1 = 1;
    const box: [number, number][] = [
      [-dx, a.x - (minX - PAD)],
      [dx, maxX + PAD - a.x],
      [-dy, a.y - (minY - PAD)],
      [dy, maxY + PAD - a.y],
    ];
    for (const [p, q] of box) {
      if (Math.abs(p) < 1e-12) {
        if (q < 0) return undefined;
        continue;
      }
      const t = q / p;
      if (p < 0) {
        if (t > t1) return undefined;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return undefined;
        if (t < t1) t1 = t;
      }
    }
    return [
      { x: a.x + dx * t0, y: a.y + dy * t0 },
      { x: a.x + dx * t1, y: a.y + dy * t1 },
    ];
  };

  const near = (a: Point, b: Point): number[] => {
    const out: number[] = [];
    if (edges.length === 0) return out;
    generation++;

    const piece = clip(a, b);
    if (!piece) return out;
    const [s, e] = piece;

    // Amanatides/Woo: step from cell to cell along the segment.
    let c = col(s.x);
    let r = row(s.y);
    const cEnd = col(e.x);
    const rEnd = row(e.y);
    const dx = e.x - s.x;
    const dy = e.y - s.y;
    const stepC = dx > 0 ? 1 : dx < 0 ? -1 : 0;
    const stepR = dy > 0 ? 1 : dy < 0 ? -1 : 0;
    const tDeltaC = stepC === 0 ? Infinity : cellW / Math.abs(dx);
    const tDeltaR = stepR === 0 ? Infinity : cellH / Math.abs(dy);
    let tMaxC = stepC === 0 ? Infinity : (minX + (c + (stepC > 0 ? 1 : 0)) * cellW - s.x) / dx;
    let tMaxR = stepR === 0 ? Infinity : (minY + (r + (stepR > 0 ? 1 : 0)) * cellH - s.y) / dy;

    // At most one step per cell on each axis, plus slack for rounding.
    for (let guard = 0; guard <= 2 * cells + 2; guard++) {
      collect(r * cells + c, out);
      if (c === cEnd && r === rEnd) break;
      if (tMaxC < tMaxR) {
        c += stepC;
        tMaxC += tDeltaC;
      } else {
        r += stepR;
        tMaxR += tDeltaR;
      }
      if (c < 0 || c >= cells || r < 0 || r >= cells) break;
    }
    return out;
  };

  const contains = (p: Point): boolean => {
    if (edges.length === 0) return false;
    if (p.y < minY || p.y > maxY || p.x < minX || p.x > maxX) return false;
    generation++;

    const r = row(p.y);
    const c0 = col(p.x);
    // Shoot the ray towards the nearer side — the far half of the row costs the
    // same as the near half, and on a wide shape that is most of the work.
    const rightwards = maxX - p.x <= p.x - minX;
    let inside = false;
    for (let c = c0; c >= 0 && c < cells; c += rightwards ? 1 : -1) {
      for (const i of buckets[r * cells + c]!) {
        if (stamp[i] === generation) continue;
        stamp[i] = generation;
        const { a, b } = edges[i]!;
        if (a.y > p.y !== b.y > p.y) {
          const x = ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x;
          if (rightwards ? p.x < x : p.x > x) inside = !inside;
        }
      }
    }
    return inside;
  };

  return { edges, near, contains };
}
