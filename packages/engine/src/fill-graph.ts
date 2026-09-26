/**
 * The rows of a fill as a graph, walked in one Eulerian path (spec §8.3,
 * 26.09.2026).
 *
 * Until now the rows were grouped into sections and the sections were walked
 * nearest-first. On a shape that a knockdown has cut up, that falls apart: the
 * grey shield of the STUTTGART logo gave 96 sections in the top stitching and 79
 * in the underlay — 175 travel paths inside ONE object, all of them crossing the
 * same few webs.
 *
 * The way out is not a better heuristic but a different structure. Nodes are the
 * ends of the rows, edges are of two kinds: the rows themselves, and the pieces
 * of outline between neighbouring row ends. A path that uses every edge exactly
 * once stitches every row exactly once and travels along the outline in between
 * — and it exists as soon as every node has an even degree, which `eulerize`
 * arranges.
 *
 * Abgeleitet aus Ink/Stitch (GPL-3.0), `lib/stitches/tatami_fill.py` — das
 * Verfahren, nicht der Code (siehe docs/verfahren-aus-inkstitch.md).
 *
 * **Stand 26.09.2026: gebaut, gemessen, noch nicht im Stichweg.** An `fillRegion`
 * verdrahtet bringt der Pfad allein weniger Sprünge (−13 bis −37 je Motiv) und
 * weniger Trims, kostet aber 27 bis 63 % Rechenzeit und hebt die Nadelhäufung bei
 * drei von sechs Läufen. Der Grund ist, dass die REIHENFOLGE hier nur die halbe
 * Sache ist: Ink/Stitch sucht die Wege dazwischen über einen zweiten Graphen —
 * ein Gitter im Inneren der Fläche, dessen Kanten teurer werden, je näher sie der
 * Kontur kommen. Ohne den läuft der Weg weiter über den Sichtbarkeitsgraphen, und
 * der Gewinn bleibt aus. Zahlen in docs/messung-echte-logos.md.
 *
 * Die outline-Kanten als Laufstich zu sticken — der naheliegende Kurzschluss —
 * ist gemessen und viel schlechter: jede zweite ist doppelt, und eine doppelte
 * Bahn liegt exakt auf ihrer eigenen Spur (Eislingen: Dichte 23 → 205).
 */
import type { Point, Polyline } from "@texma-stitch/geometry";
import { dist } from "@texma-stitch/geometry";

/** A row of the grating: its height and its two ends. */
export type RowSegment = { y: number; x0: number; x1: number };

/** A row end, placed on the outline ring it belongs to. */
export type GraphNode = {
  point: Point;
  /** Which ring of the shape it sits on — 0 is the outer one. */
  ring: number;
  /** How far along that ring, in millimetres of arc length. */
  along: number;
};

export type GraphEdge = {
  kind: "row" | "outline";
  a: number;
  b: number;
  /** For a row edge: which row of the input it stands for. */
  row?: number;
};

export type FillGraph = { nodes: GraphNode[]; edges: GraphEdge[] };

/** One step of the walk: which edge, and in which direction it is taken. */
export type PathStep = { edge: number; from: number; to: number };

/**
 * Where a point sits on the rings of a shape: the nearest ring, and the arc
 * length up to the projection onto it.
 */
export function projectToRings(
  ringList: Polyline[],
  p: Point,
): { ring: number; along: number; distMm: number } {
  let best = { ring: 0, along: 0, distMm: Infinity };
  for (const [ring, points] of ringList.entries()) {
    let along = 0;
    for (let i = 0; i < points.length; i++) {
      const a = points[i]!;
      const b = points[(i + 1) % points.length]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len2 = dx * dx + dy * dy;
      const t =
        len2 < 1e-12 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
      const q = { x: a.x + dx * t, y: a.y + dy * t };
      const d = dist(p, q);
      if (d < best.distMm) best = { ring, along: along + Math.sqrt(len2) * t, distMm: d };
      along += Math.sqrt(len2);
    }
  }
  return best;
}

/**
 * The graph over rows and outline (spec §8.3).
 *
 * Every second outline edge goes in twice. That is what keeps the count of
 * odd-degree nodes down: a node carries one row edge and two outline edges, so
 * it would be odd everywhere, and `eulerize` would have to pair up half the
 * shape. The doubled edge is a real second pass along the same piece of outline,
 * which is what a digitiser does anyway when the way there and back is short.
 */
export function buildFillGraph(rows: RowSegment[], ringList: Polyline[]): FillGraph {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  for (const [index, row] of rows.entries()) {
    const left = { x: row.x0, y: row.y };
    const right = { x: row.x1, y: row.y };
    const a = nodes.length;
    const pa = projectToRings(ringList, left);
    nodes.push({ point: left, ring: pa.ring, along: pa.along });
    const b = nodes.length;
    const pb = projectToRings(ringList, right);
    nodes.push({ point: right, ring: pb.ring, along: pb.along });
    edges.push({ kind: "row", a, b, row: index });
  }

  // Neighbours on a ring, in the order the needle would meet them walking it.
  const byRing = new Map<number, number[]>();
  for (const [i, n] of nodes.entries()) {
    if (!byRing.has(n.ring)) byRing.set(n.ring, []);
    byRing.get(n.ring)!.push(i);
  }
  for (const ring of [...byRing.keys()].sort((x, y) => x - y)) {
    const order = byRing
      .get(ring)!
      .slice()
      .sort((x, y) => nodes[x]!.along - nodes[y]!.along || x - y);
    if (order.length < 2) continue;
    for (let i = 0; i < order.length; i++) {
      const a = order[i]!;
      const b = order[(i + 1) % order.length]!;
      if (a === b) continue;
      edges.push({ kind: "outline", a, b });
      if (i % 2 === 0) edges.push({ kind: "outline", a, b });
    }
  }

  return { nodes, edges };
}

/** How many edges each node carries. */
export function nodeDegrees(graph: FillGraph): number[] {
  const deg = new Array<number>(graph.nodes.length).fill(0);
  for (const e of graph.edges) {
    deg[e.a]!++;
    deg[e.b]!++;
  }
  return deg;
}

const adjacency = (graph: FillGraph): number[][] => {
  const adj: number[][] = graph.nodes.map(() => []);
  for (const [i, e] of graph.edges.entries()) {
    adj[e.a]!.push(i);
    adj[e.b]!.push(i);
  }
  return adj;
};

/**
 * Doubles as few edges as it takes to give every node an even degree — the
 * condition for an Eulerian path to exist (spec §8.3).
 *
 * Odd nodes are paired in the order they lie on their ring, and the way between
 * each pair is doubled. Pairing neighbours keeps the extra stitching short; the
 * way itself is the shortest one in the graph, so it follows the outline rather
 * than crossing the shape.
 */
export function eulerize(graph: FillGraph): FillGraph {
  const edges = graph.edges.slice();
  const out: FillGraph = { nodes: graph.nodes, edges };
  const deg = nodeDegrees(out);
  const odd = deg.flatMap((d, i) => (d % 2 === 1 ? [i] : []));
  if (odd.length === 0) return out;

  odd.sort((x, y) => {
    const a = graph.nodes[x]!;
    const b = graph.nodes[y]!;
    return a.ring - b.ring || a.along - b.along || x - y;
  });

  for (let i = 0; i + 1 < odd.length; i += 2) {
    const path = shortestEdgePath(out, odd[i]!, odd[i + 1]!);
    if (path.length === 0) continue;
    for (const e of path) edges.push({ ...edges[e]! });
  }
  return out;
}

/** Breadth-first way between two nodes, as the edges it uses. */
function shortestEdgePath(graph: FillGraph, from: number, to: number): number[] {
  if (from === to) return [];
  const adj = adjacency(graph);
  const cameFrom = new Map<number, { node: number; edge: number }>();
  const seen = new Set<number>([from]);
  const queue = [from];
  for (let head = 0; head < queue.length; head++) {
    const node = queue[head]!;
    if (node === to) break;
    for (const e of adj[node]!) {
      const edge = graph.edges[e]!;
      const next = edge.a === node ? edge.b : edge.a;
      if (seen.has(next)) continue;
      seen.add(next);
      cameFrom.set(next, { node, edge: e });
      queue.push(next);
    }
  }
  if (!seen.has(to)) return [];
  const path: number[] = [];
  for (let node = to; node !== from;) {
    const step = cameFrom.get(node)!;
    path.push(step.edge);
    node = step.node;
  }
  return path.reverse();
}

/**
 * Hierholzer's walk: every edge exactly once (spec §8.3).
 *
 * Deterministic by construction — where several edges are open at a node, the
 * one with the lowest index is taken (rule 3). A graph whose nodes all have an
 * even degree gives a closed circuit; `start` says where it begins.
 */
export function eulerPath(graph: FillGraph, start = 0): PathStep[] {
  if (graph.edges.length === 0) return [];
  const adj = adjacency(graph);
  for (const list of adj) list.sort((a, b) => a - b);
  const used = new Array<boolean>(graph.edges.length).fill(false);
  const next = new Array<number>(graph.nodes.length).fill(0);

  const stack: PathStep[] = [];
  const circuit: PathStep[] = [];
  let node = Math.min(Math.max(start, 0), graph.nodes.length - 1);
  // A node with no edges cannot start anything — take the first one that has.
  if (adj[node]!.length === 0) {
    const first = adj.findIndex((list) => list.length > 0);
    if (first < 0) return [];
    node = first;
  }

  for (;;) {
    while (next[node]! < adj[node]!.length && used[adj[node]![next[node]!]!]) next[node]!++;
    if (next[node]! === adj[node]!.length) {
      const step = stack.pop();
      if (!step) break;
      circuit.push(step);
      node = step.from;
      continue;
    }
    const edgeIndex = adj[node]![next[node]!]!;
    used[edgeIndex] = true;
    const edge = graph.edges[edgeIndex]!;
    const to = edge.a === node ? edge.b : edge.a;
    stack.push({ edge: edgeIndex, from: node, to });
    node = to;
  }

  return circuit.reverse();
}

/**
 * The piece of a ring between two arc lengths, as a point list (spec §8.3).
 *
 * This is the way from one row end to the next when the graph says they are
 * neighbours on the outline: short, already inside the shape, and under the top
 * stitching that follows. The shorter of the two directions round the ring wins,
 * and every corner in between is kept — a chord across a corner would leave the
 * shape, which is exactly what §8.7.1 guards against.
 */
export function ringSegment(ring: Polyline, fromAlong: number, toAlong: number): Point[] {
  if (ring.length < 2) return [];
  const lengths: number[] = [];
  let total = 0;
  for (let i = 0; i < ring.length; i++) {
    const d = dist(ring[i]!, ring[(i + 1) % ring.length]!);
    lengths.push(d);
    total += d;
  }
  if (total < 1e-9) return [];

  const at = (along: number): Point => {
    let rest = ((along % total) + total) % total;
    for (const [i, len] of lengths.entries()) {
      if (rest <= len || i === lengths.length - 1) {
        const a = ring[i]!;
        const b = ring[(i + 1) % ring.length]!;
        const t = len < 1e-12 ? 0 : Math.min(1, rest / len);
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      }
      rest -= len;
    }
    return { ...ring[0]! };
  };

  const forward = (((toAlong - fromAlong) % total) + total) % total;
  const step = forward <= total - forward ? 1 : -1;
  const out: Point[] = [at(fromAlong)];

  // Walk corner by corner in the chosen direction until the target is passed.
  let travelled = 0;
  const span = step === 1 ? forward : total - forward;
  let cursor = ((fromAlong % total) + total) % total;
  // Index of the ring point just ahead in the walking direction.
  let index = 0;
  let acc = 0;
  for (const [i, len] of lengths.entries()) {
    if (cursor <= acc + len) {
      index = step === 1 ? (i + 1) % ring.length : i;
      break;
    }
    acc += len;
  }
  for (let guard = 0; guard <= ring.length; guard++) {
    const corner = ring[index]!;
    const cornerAlong = ringAlong(lengths, index);
    const delta = step === 1 ? mod(cornerAlong - cursor, total) : mod(cursor - cornerAlong, total);
    if (travelled + delta >= span - 1e-9) break;
    out.push({ ...corner });
    travelled += delta;
    cursor = cornerAlong;
    index = step === 1 ? (index + 1) % ring.length : (index - 1 + ring.length) % ring.length;
  }
  out.push(at(toAlong));
  return out;
}

const mod = (v: number, m: number): number => ((v % m) + m) % m;

/** Arc length from the ring's start up to point `index`. */
function ringAlong(lengths: number[], index: number): number {
  let sum = 0;
  for (let i = 0; i < index; i++) sum += lengths[i]!;
  return sum;
}
