/**
 * Shortest path from a to b that stays inside the polygon (spec §5,
 * `insideTravel`).
 *
 * Visibility graph over the outline and its holes plus Dijkstra. The common case
 * — a sees b directly — is caught first, otherwise the fill would build a graph
 * on every section change (spec §8.5).
 *
 * Two things keep this inside the performance budget of rule 9 on real outlines:
 * the graph over a shape is built once and cached, since it does not depend on a
 * and b; and only REFLEX corners become nodes, because a shortest path inside a
 * polygon bends nowhere else. Both are bookkeeping — the path itself is the same
 * one the plain construction would find.
 */
import type { Point, Polygon, Polyline } from "./types.js";
import type { EdgeIndex } from "./edge-index.js";
import { buildEdgeIndex } from "./edge-index.js";
import { rings } from "./polygon.js";
import { simplify } from "./simplify.js";
import { dist } from "./vec.js";

/** Coarser simplification for the graph: 0.1 mm does not change the travel path. */
const GRAPH_SIMPLIFY_MM = 0.1;
/** How far off the corner the reflex probe sits (mm). */
const CORNER_PROBE_MM = 1e-3;
/**
 * Below this, an intersection counts as touching an endpoint rather than
 * crossing (mm). Far under any embroidery geometry, far over the rounding noise
 * of a double at millimetre scale.
 */
const TOUCH_MM = 1e-7;

type VisGraph = { nodes: Point[]; adj: number[][]; cost: number[][] };

/**
 * Per-shape caches. Polygons are values here — nothing in the engine mutates one
 * after it is built — so keying on the object is safe, and a shape that goes out
 * of scope takes its graph with it.
 */
const indexCache = new WeakMap<Polygon, EdgeIndex>();
const graphCache = new WeakMap<Polygon, VisGraph>();

function indexFor(poly: Polygon): EdgeIndex {
  let idx = indexCache.get(poly);
  if (!idx) {
    idx = buildEdgeIndex(poly);
    indexCache.set(poly, idx);
  }
  return idx;
}

const cross2 = (ax: number, ay: number, bx: number, by: number): number => ax * by - ay * bx;

/**
 * Does the segment a-b lie entirely inside the polygon?
 *
 * Two passes. A transversal crossing of the outline settles it — the segment
 * leaves the shape right there — and that is the answer for almost every pair
 * the visibility graph asks about, so it has to be the cheap one. Only if none
 * is found does the exact walk run: collect every touch point and check the
 * midpoint of each stretch in between. That second pass catches the segment that
 * runs exactly through a reflex vertex and continues outside, which no crossing
 * test sees.
 */
export function segmentInside(poly: Polygon, a: Point, b: Point, index?: EdgeIndex): boolean {
  const idx = index ?? indexFor(poly);
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abLen = Math.hypot(abx, aby);
  if (abLen < 1e-9) return idx.contains(a);

  const eps = 1e-9;
  const ts: number[] = [0, 1];
  for (const ei of idx.near(a, b)) {
    const e = idx.edges[ei]!;
    const cdx = e.b.x - e.a.x;
    const cdy = e.b.y - e.a.y;
    const denom = cross2(abx, aby, cdx, cdy);
    const acx = e.a.x - a.x;
    const acy = e.a.y - a.y;
    if (Math.abs(denom) > eps) {
      const t = cross2(acx, acy, cdx, cdy) / denom;
      const u = cross2(acx, acy, abx, aby) / denom;
      if (t < -eps || t > 1 + eps || u < -eps || u > 1 + eps) continue;
      // Clear of all four endpoints: a real crossing, not a touch.
      const edgeLen = Math.hypot(cdx, cdy);
      if (
        t * abLen > TOUCH_MM &&
        (1 - t) * abLen > TOUCH_MM &&
        u * edgeLen > TOUCH_MM &&
        (1 - u) * edgeLen > TOUCH_MM
      ) {
        return false;
      }
      ts.push(Math.min(1, Math.max(0, t)));
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
    if (!idx.contains({ x: a.x + abx * m, y: a.y + aby * m })) return false;
  }
  return true;
}

/**
 * Is the corner p-v-q reflex as seen from the free space?
 *
 * The probe sits on the bisector of the two edges, a hair away from v. On a
 * convex corner the bisector points into the shape, on a reflex one into the
 * material — so one point test decides it, whichever way the ring is wound.
 */
function isReflexCorner(idx: EdgeIndex, p: Point, v: Point, q: Point): boolean {
  const l1 = dist(p, v);
  const l2 = dist(q, v);
  if (l1 < 1e-12 || l2 < 1e-12) return false;
  const ux = (p.x - v.x) / l1 + (q.x - v.x) / l2;
  const uy = (p.y - v.y) / l1 + (q.y - v.y) / l2;
  const ul = Math.hypot(ux, uy);
  // Straight through: not a corner, so never a bend point of a shortest path.
  if (ul < 1e-9) return false;
  const step = Math.min(CORNER_PROBE_MM, 0.25 * Math.min(l1, l2));
  return !idx.contains({ x: v.x + (ux / ul) * step, y: v.y + (uy / ul) * step });
}

/** Reflex corners of the simplified rings — the only places a geodesic bends. */
function graphNodes(poly: Polygon, idx: EdgeIndex): Point[] {
  const out: Point[] = [];
  for (const ring of rings(poly)) {
    if (ring.length < 3) continue;
    const pts = simplify([...ring, ring[0]!], GRAPH_SIMPLIFY_MM).slice(0, -1);
    const n = pts.length;
    if (n < 3) continue;
    for (let i = 0; i < n; i++) {
      const v = pts[i]!;
      if (isReflexCorner(idx, pts[(i + n - 1) % n]!, v, pts[(i + 1) % n]!)) out.push({ ...v });
    }
  }
  return out;
}

function graphFor(poly: Polygon, idx: EdgeIndex): VisGraph {
  const cached = graphCache.get(poly);
  if (cached) return cached;

  const nodes = graphNodes(poly, idx);
  const n = nodes.length;
  const adj: number[][] = Array.from({ length: n }, () => []);
  const cost: number[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (!segmentInside(poly, nodes[i]!, nodes[j]!, idx)) continue;
      const d = dist(nodes[i]!, nodes[j]!);
      adj[i]!.push(j);
      cost[i]!.push(d);
      adj[j]!.push(i);
      cost[j]!.push(d);
    }
  }
  const graph = { nodes, adj, cost };
  graphCache.set(poly, graph);
  return graph;
}

/**
 * Travel path inside the polygon. Always returns at least [a, b]: when no
 * interior path exists (a or b lie outside, or the shape falls apart), the
 * straight line is the honest answer — the caller notices that the path does not
 * lie inside and turns it into a jump.
 */
export function insideTravel(poly: Polygon, a: Point, b: Point): Polyline {
  const idx = indexFor(poly);
  if (segmentInside(poly, a, b, idx)) return [{ ...a }, { ...b }];

  const graph = graphFor(poly, idx);
  const n = graph.nodes.length;
  // Node numbering: 0..n-1 the shape's corners, n the start, n+1 the target.
  const start = n;
  const target = n + 1;
  const total = n + 2;

  const visStart: number[] = [];
  const seesTarget = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (segmentInside(poly, a, graph.nodes[i]!, idx)) visStart.push(i);
    if (segmentInside(poly, b, graph.nodes[i]!, idx)) seesTarget[i] = 1;
  }

  // Dijkstra with linear selection — the visibility graph is dense, so a heap
  // would not pay off.
  const dists = new Float64Array(total).fill(Infinity);
  const prev = new Int32Array(total).fill(-1);
  const done = new Uint8Array(total);
  dists[start] = 0;
  for (;;) {
    let u = -1;
    let best = Infinity;
    for (let i = 0; i < total; i++) {
      if (!done[i] && dists[i]! < best) {
        best = dists[i]!;
        u = i;
      }
    }
    if (u === -1 || u === target) break;
    done[u] = 1;

    const base = dists[u]!;
    const relax = (v: number, d: number): void => {
      if (base + d < dists[v]!) {
        dists[v] = base + d;
        prev[v] = u;
      }
    };
    if (u === start) {
      for (const v of visStart) relax(v, dist(a, graph.nodes[v]!));
    } else {
      const neighbours = graph.adj[u]!;
      const costs = graph.cost[u]!;
      for (let k = 0; k < neighbours.length; k++) relax(neighbours[k]!, costs[k]!);
      if (seesTarget[u]) relax(target, dist(b, graph.nodes[u]!));
    }
  }

  if (!Number.isFinite(dists[target]!)) return [{ ...a }, { ...b }];

  const path: Polyline = [];
  for (let at = target; at !== -1; at = prev[at]!) {
    path.push(at === start ? { ...a } : at === target ? { ...b } : { ...graph.nodes[at]! });
    if (at === start) break;
  }
  path.reverse();
  return path;
}
