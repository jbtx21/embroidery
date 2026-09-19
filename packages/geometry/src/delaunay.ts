/**
 * Delaunay triangulation (Bowyer-Watson) — the basis for the medial axis.
 *
 * Spec §5 wants the skeleton as "Voronoi of the outline". The Voronoi diagram is
 * the dual of the Delaunay triangulation, so this is where it starts. Written
 * out rather than pulled in: spec §2 allows the engine exactly one dependency,
 * `clipper2-wasm`, and nothing else.
 *
 * Deterministic by construction — points are inserted in the order given, and
 * every map is iterated in insertion order.
 */
import type { Point } from "./types.js";
import { bbox } from "./polygon.js";
import { dist } from "./vec.js";

/** Indices into the point array handed to `delaunay`. */
export type Triangle = [number, number, number];

export type Circumcircle = { center: Point; radius: number };

/**
 * Circumcircle of a triangle. `undefined` for collinear or degenerate points —
 * those have no finite circumcentre.
 */
export function circumcircle(a: Point, b: Point, c: Point): Circumcircle | undefined {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-12) return undefined;
  const a2 = a.x * a.x + a.y * a.y;
  const b2 = b.x * b.x + b.y * b.y;
  const c2 = c.x * c.x + c.y * c.y;
  const center: Point = {
    x: (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d,
    y: (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d,
  };
  return { center, radius: dist(center, a) };
}

const edgeKey = (i: number, j: number): string => (i < j ? `${i}:${j}` : `${j}:${i}`);

/**
 * Triangulates the points. Returns index triples; duplicate and collinear-only
 * inputs yield an empty list rather than a guess.
 */
export function delaunay(points: Point[]): Triangle[] {
  const n = points.length;
  if (n < 3) return [];

  // A super-triangle far enough out that it contains every point. It is removed
  // again at the end, together with every triangle still touching it.
  const b = bbox(points);
  const spanX = b.maxX - b.minX;
  const spanY = b.maxY - b.minY;
  const span = Math.max(spanX, spanY, 1e-6) * 10;
  const midX = (b.minX + b.maxX) / 2;
  const midY = (b.minY + b.maxY) / 2;
  const pts: Point[] = [
    ...points,
    { x: midX - span, y: midY - span },
    { x: midX + span, y: midY - span },
    { x: midX, y: midY + span },
  ];

  let triangles: Triangle[] = [[n, n + 1, n + 2]];

  for (let i = 0; i < n; i++) {
    const p = pts[i]!;
    const kept: Triangle[] = [];
    const bad: Triangle[] = [];
    for (const t of triangles) {
      const cc = circumcircle(pts[t[0]]!, pts[t[1]]!, pts[t[2]]!);
      if (cc && dist(cc.center, p) <= cc.radius + 1e-9) bad.push(t);
      else kept.push(t);
    }
    if (bad.length === 0) continue; // duplicate point: nothing to re-triangulate

    // The cavity boundary is made of the edges that belong to exactly one bad
    // triangle; shared edges are interior and disappear with the cavity.
    const counts = new Map<string, number>();
    const ends = new Map<string, [number, number]>();
    for (const t of bad) {
      for (const [x, y] of [
        [t[0], t[1]],
        [t[1], t[2]],
        [t[2], t[0]],
      ] as [number, number][]) {
        const key = edgeKey(x, y);
        counts.set(key, (counts.get(key) ?? 0) + 1);
        ends.set(key, [x, y]);
      }
    }

    triangles = kept;
    for (const [key, count] of counts) {
      if (count !== 1) continue;
      const [x, y] = ends.get(key)!;
      triangles.push([x, y, i]);
    }
  }

  return triangles.filter((t) => t[0] < n && t[1] < n && t[2] < n);
}

/** Every unordered Delaunay edge with the triangles it belongs to. */
export function triangleNeighbours(triangles: Triangle[]): Map<string, number[]> {
  const out = new Map<string, number[]>();
  triangles.forEach((t, ti) => {
    for (const [x, y] of [
      [t[0], t[1]],
      [t[1], t[2]],
      [t[2], t[0]],
    ] as [number, number][]) {
      const key = edgeKey(x, y);
      const list = out.get(key);
      if (list) list.push(ti);
      else out.set(key, [ti]);
    }
  });
  return out;
}
