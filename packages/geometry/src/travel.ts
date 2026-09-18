/**
 * Shortest path from a to b that stays inside the polygon (spec §5,
 * `insideTravel`).
 *
 * Visibility graph over the outline and its holes plus Dijkstra. The common case
 * — a sees b directly — is caught first, otherwise the fill would build a graph
 * on every section change (spec §8.5).
 */
import type { Point, Polygon, Polyline } from "./types.js";
import { pointInPolygon, rings } from "./polygon.js";
import { simplify } from "./simplify.js";
import { dist } from "./vec.js";

/** Coarser simplification for the graph: 0.1 mm does not change the travel path. */
const GRAPH_SIMPLIFY_MM = 0.1;

type Edge = { a: Point; b: Point };

function polygonEdges(poly: Polygon): Edge[] {
  const out: Edge[] = [];
  for (const ring of rings(poly)) {
    for (let i = 0; i < ring.length; i++) {
      out.push({ a: ring[i]!, b: ring[(i + 1) % ring.length]! });
    }
  }
  return out;
}

const cross2 = (ax: number, ay: number, bx: number, by: number): number => ax * by - ay * bx;

/**
 * Does the segment a-b lie entirely inside the polygon?
 *
 * First collect every touch point with the outline, then check the midpoint of
 * each stretch in between. That also catches the case where the segment runs
 * exactly through a reflex vertex and continues outside — a plain crossing test
 * does not see that.
 */
export function segmentInside(poly: Polygon, a: Point, b: Point, edges?: Edge[]): boolean {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abLen = Math.hypot(abx, aby);
  if (abLen < 1e-9) return pointInPolygon(poly, a);

  const eps = 1e-9;
  const ts: number[] = [0, 1];
  for (const e of edges ?? polygonEdges(poly)) {
    const cdx = e.b.x - e.a.x;
    const cdy = e.b.y - e.a.y;
    const denom = cross2(abx, aby, cdx, cdy);
    const acx = e.a.x - a.x;
    const acy = e.a.y - a.y;
    if (Math.abs(denom) > eps) {
      const t = cross2(acx, acy, cdx, cdy) / denom;
      const u = cross2(acx, acy, abx, aby) / denom;
      if (t >= -eps && t <= 1 + eps && u >= -eps && u <= 1 + eps) {
        ts.push(Math.min(1, Math.max(0, t)));
      }
    } else if (Math.abs(cross2(acx, acy, abx, aby)) <= eps * Math.max(1, abLen)) {
      // Collinear: project the edge endpoints onto ab.
      for (const p of [e.a, e.b]) {
        const t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / (abLen * abLen);
        if (t > -eps && t < 1 + eps) ts.push(Math.min(1, Math.max(0, t)));
      }
    }
  }

  ts.sort((p, q) => p - q);
  for (let i = 0; i + 1 < ts.length; i++) {
    const t0 = ts[i]!;
    const t1 = ts[i + 1]!;
    if (t1 - t0 < 1e-7) continue;
    const m = (t0 + t1) / 2;
    if (!pointInPolygon(poly, { x: a.x + abx * m, y: a.y + aby * m })) return false;
  }
  return true;
}

/**
 * Travel path inside the polygon. Always returns at least [a, b]: when no
 * interior path exists (a or b lie outside, or the shape falls apart), the
 * straight line is the honest answer — the caller notices that the path does not
 * lie inside and turns it into a jump.
 */
export function insideTravel(poly: Polygon, a: Point, b: Point): Polyline {
  const edges = polygonEdges(poly);
  if (segmentInside(poly, a, b, edges)) return [{ ...a }, { ...b }];

  // Build the graph: a, b and every (simplified) outline point.
  const nodes: Point[] = [{ ...a }, { ...b }];
  for (const ring of rings(poly)) {
    for (const p of simplify([...ring, ring[0]!], GRAPH_SIMPLIFY_MM).slice(0, -1)) {
      nodes.push({ ...p });
    }
  }

  const n = nodes.length;
  const adj: number[][] = Array.from({ length: n }, () => []);
  const cost: number[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (!segmentInside(poly, nodes[i]!, nodes[j]!, edges)) continue;
      const d = dist(nodes[i]!, nodes[j]!);
      adj[i]!.push(j);
      cost[i]!.push(d);
      adj[j]!.push(i);
      cost[j]!.push(d);
    }
  }

  // Dijkstra with linear selection — n is the vertex count of one shape.
  const dists = new Array<number>(n).fill(Infinity);
  const prev = new Array<number>(n).fill(-1);
  const done = new Array<boolean>(n).fill(false);
  dists[0] = 0;
  for (;;) {
    let u = -1;
    let best = Infinity;
    for (let i = 0; i < n; i++) {
      if (!done[i] && dists[i]! < best) {
        best = dists[i]!;
        u = i;
      }
    }
    if (u === -1 || u === 1) break;
    done[u] = true;
    const neighbours = adj[u]!;
    for (let k = 0; k < neighbours.length; k++) {
      const v = neighbours[k]!;
      const nd = dists[u]! + cost[u]![k]!;
      if (nd < dists[v]!) {
        dists[v] = nd;
        prev[v] = u;
      }
    }
  }

  if (!Number.isFinite(dists[1]!)) return [{ ...a }, { ...b }];

  const path: Polyline = [];
  for (let at = 1; at !== -1; at = prev[at]!) {
    path.push({ ...nodes[at]! });
    if (at === 0) break;
  }
  path.reverse();
  return path;
}
