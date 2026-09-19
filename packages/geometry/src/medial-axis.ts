/**
 * Medial axis of a polygon — the skeleton auto-satin needs (spec §5, §7.7).
 *
 * "Voronoi of the outline, branches cut", as spec §5 puts it:
 *
 * 1. Sample the outline (and the holes) at a regular spacing.
 * 2. Triangulate the samples (Delaunay). The Voronoi diagram is its dual, so the
 *    Voronoi vertices are the circumcentres of the triangles.
 * 3. Keep the Voronoi edges that stay inside the polygon — those approximate the
 *    medial axis. The circumradius at a vertex is its clearance, the distance to
 *    the nearest boundary.
 * 4. Cut the spurs: a leaf branch shorter than the clearance at the junction it
 *    hangs off is an artefact of the sampling, not a feature of the shape.
 * 5. Split what is left at the junctions into branches.
 *
 * The result is an approximation whose accuracy follows the sampling distance.
 * That is what §7.7 needs: the editor shows it as a proposal and the user
 * corrects the rails.
 */
import type { Point, Polygon, Polyline } from "./types.js";
import { arcLength, cumulativeLengths, pointAt } from "./measure.js";
import { closeRing, pointInPolygon, polygonBbox, rings } from "./polygon.js";
import { circumcircle, delaunay, triangleNeighbours } from "./delaunay.js";
import { segmentInside } from "./travel.js";
import { dist } from "./vec.js";

/** One branch of the skeleton: the polyline plus the clearance at each point. */
export type MedialBranch = { points: Polyline; radii: number[] };

export type MedialAxis = { branches: MedialBranch[] };

export type MedialAxisOptions = {
  /** Boundary sampling distance in mm. Default: perimeter / 300, clamped to 0.3 … 2. */
  sampleMm?: number;
  /**
   * Cut a leaf branch when it is shorter than this multiple of the clearance at
   * its junction. 1.0 keeps the real branches of a rectangle (its diagonals to
   * the corners run further than the inscribed circle) and drops the stubs that
   * only exist because the outline was sampled.
   */
  pruneFactor?: number;
};

/** Points along the outline and every hole, at a regular spacing. */
export function samplePolygonBoundary(poly: Polygon, spacingMm: number): Point[] {
  const out: Point[] = [];
  const step = Math.max(spacingMm, 1e-3);
  for (const ring of rings(poly)) {
    if (ring.length < 3) continue;
    const closed = closeRing(ring);
    const cum = cumulativeLengths(closed);
    const total = cum[cum.length - 1]!;
    if (total < step) continue;
    const n = Math.max(3, Math.round(total / step));
    for (let i = 0; i < n; i++) out.push(pointAt(closed, (i * total) / n, cum));
  }
  return out;
}

/**
 * Sampling distance when the caller does not name one. Exported so auto-satin
 * can sample the same outline the skeleton was built from — rails taken from a
 * differently sampled boundary would not line up with the axis.
 */
export function boundarySampleMm(poly: Polygon): number {
  const perimeter = rings(poly).reduce((sum, r) => sum + arcLength(closeRing(r)), 0);
  return Math.min(2, Math.max(0.3, perimeter / 300));
}

type Graph = {
  nodes: Point[];
  radii: number[];
  /** adj[i] holds the indices of the nodes connected to i. */
  adj: number[][];
};

const nodeKey = (p: Point): string => `${Math.round(p.x * 1e4)}:${Math.round(p.y * 1e4)}`;

/** Voronoi edges of the sampled boundary that stay inside the polygon. */
function buildGraph(poly: Polygon, boundary: Point[]): Graph {
  const triangles = delaunay(boundary);
  const centers: (Point | undefined)[] = [];
  const radii: number[] = [];
  for (const t of triangles) {
    const cc = circumcircle(boundary[t[0]]!, boundary[t[1]]!, boundary[t[2]]!);
    if (cc && pointInPolygon(poly, cc.center)) {
      centers.push(cc.center);
      radii.push(cc.radius);
    } else {
      centers.push(undefined);
      radii.push(0);
    }
  }

  const nodes: Point[] = [];
  const nodeRadii: number[] = [];
  const index = new Map<string, number>();
  const nodeOf = (p: Point, r: number): number => {
    const key = nodeKey(p);
    const found = index.get(key);
    if (found !== undefined) {
      // Keep the larger clearance: the same point can come from two triangles.
      if (r > nodeRadii[found]!) nodeRadii[found] = r;
      return found;
    }
    nodes.push({ ...p });
    nodeRadii.push(r);
    index.set(key, nodes.length - 1);
    return nodes.length - 1;
  };

  const adj: number[][] = [];
  const seen = new Set<string>();
  for (const [, tris] of triangleNeighbours(triangles)) {
    if (tris.length !== 2) continue; // outer edge: no Voronoi edge inside
    const [ta, tb] = tris as [number, number];
    const ca = centers[ta];
    const cb = centers[tb];
    if (!ca || !cb) continue;
    if (dist(ca, cb) < 1e-9) continue;
    if (!segmentInside(poly, ca, cb)) continue;

    const ia = nodeOf(ca, radii[ta]!);
    const ib = nodeOf(cb, radii[tb]!);
    if (ia === ib) continue;
    const key = ia < ib ? `${ia}:${ib}` : `${ib}:${ia}`;
    if (seen.has(key)) continue;
    seen.add(key);
    while (adj.length < nodes.length) adj.push([]);
    adj[ia]!.push(ib);
    adj[ib]!.push(ia);
  }
  while (adj.length < nodes.length) adj.push([]);

  return { nodes, radii: nodeRadii, adj };
}

const removeEdge = (adj: number[][], a: number, b: number): void => {
  adj[a] = adj[a]!.filter((x) => x !== b);
  adj[b] = adj[b]!.filter((x) => x !== a);
};

/**
 * Walks from `start` along nodes of degree 2 until something else turns up.
 * Returns the chain of node indices, `start` included.
 *
 * A ring skeleton has no ends at all — every node has degree 2 — so the walk
 * also stops when it comes back to where it began. The length cap is the belt
 * to that braces: a malformed graph must not spin forever.
 */
function walkChain(adj: number[][], start: number, first: number): number[] {
  const chain = [start, first];
  let prev = start;
  let cur = first;
  while (cur !== start && chain.length <= adj.length + 1) {
    if (adj[cur]!.length !== 2) break;
    const next = adj[cur]!.find((x) => x !== prev);
    if (next === undefined) break;
    chain.push(next);
    prev = cur;
    cur = next;
  }
  return chain;
}

const chainLength = (nodes: Point[], chain: number[]): number =>
  chain.slice(1).reduce((sum, idx, i) => sum + dist(nodes[chain[i]!]!, nodes[idx]!), 0);

/** Cut leaf branches that do not reach past the clearance at their junction. */
function prune(graph: Graph, factor: number): void {
  const { nodes, radii, adj } = graph;
  for (;;) {
    let cut = false;
    for (let i = 0; i < nodes.length; i++) {
      if (adj[i]!.length !== 1) continue;
      const chain = walkChain(adj, i, adj[i]![0]!);
      const end = chain[chain.length - 1]!;
      // Only a branch hanging off a junction is a candidate. A skeleton that is
      // one single chain has two leaves and no junction — it stays.
      if (adj[end]!.length < 3) continue;
      if (chainLength(nodes, chain) >= factor * radii[end]!) continue;
      for (let k = 0; k + 1 < chain.length; k++) removeEdge(adj, chain[k]!, chain[k + 1]!);
      cut = true;
    }
    if (!cut) return;
  }
}

/** Splits the pruned graph into branches between junctions and leaves. */
function toBranches(graph: Graph): MedialBranch[] {
  const { nodes, radii, adj } = graph;
  const branches: MedialBranch[] = [];
  const done = new Set<string>();
  const edgeSeen = (a: number, b: number): string => (a < b ? `${a}:${b}` : `${b}:${a}`);

  const emit = (chain: number[]): void => {
    if (chain.length < 2) return;
    branches.push({
      points: chain.map((i) => ({ ...nodes[i]! })),
      radii: chain.map((i) => radii[i]!),
    });
  };

  // Chains that start at a leaf or a junction.
  for (let i = 0; i < nodes.length; i++) {
    const degree = adj[i]!.length;
    if (degree === 0 || degree === 2) continue;
    for (const first of adj[i]!) {
      if (done.has(edgeSeen(i, first))) continue;
      const chain = walkChain(adj, i, first);
      for (let k = 0; k + 1 < chain.length; k++) done.add(edgeSeen(chain[k]!, chain[k + 1]!));
      emit(chain);
    }
  }

  // Whatever is left is a closed loop — a ring shape has one (spec §5 calls the
  // skeleton a tree, but an annulus simply has no ends).
  for (let i = 0; i < nodes.length; i++) {
    if (adj[i]!.length !== 2) continue;
    if (adj[i]!.some((j) => done.has(edgeSeen(i, j)))) continue;
    const chain = walkChain(adj, i, adj[i]![0]!);
    if (chain.length < 2) continue;
    for (let k = 0; k + 1 < chain.length; k++) done.add(edgeSeen(chain[k]!, chain[k + 1]!));
    emit(chain);
  }

  return branches;
}

/**
 * A shape whose whole skeleton does not reach past its own inscribed circle has
 * no meaningful axis — a disc is the extreme case, its medial axis is a single
 * point. Sampling the outline turns that point into a short, wandering chain,
 * because the circumcentres of near-degenerate triangles scatter. Rather than
 * hand out an axis that is an artefact of the sampling, say there is none.
 *
 * Only a single open chain qualifies. A ring has no ends and is a genuine loop,
 * and anything with a junction has a real structure to report.
 */
function dropBlob(branches: MedialBranch[]): MedialBranch[] {
  if (branches.length !== 1) return branches;
  const only = branches[0]!;
  const first = only.points[0]!;
  const last = only.points[only.points.length - 1]!;
  if (dist(first, last) < 1e-6) return branches; // closed loop
  const maxRadius = Math.max(...only.radii);
  return arcLength(only.points) < 2 * maxRadius ? [] : branches;
}

export function medialAxis(poly: Polygon, opts: MedialAxisOptions = {}): MedialAxis {
  const box = polygonBbox(poly);
  if (box.maxX - box.minX < 1e-6 || box.maxY - box.minY < 1e-6) return { branches: [] };

  const boundary = samplePolygonBoundary(poly, opts.sampleMm ?? boundarySampleMm(poly));
  if (boundary.length < 4) return { branches: [] };

  const graph = buildGraph(poly, boundary);
  prune(graph, opts.pruneFactor ?? 1.0);
  return { branches: dropBlob(toBranches(graph)) };
}

/** Total length of the skeleton — handy for tests and for the editor. */
export const medialAxisLength = (axis: MedialAxis): number =>
  axis.branches.reduce((sum, b) => sum + arcLength(b.points), 0);
