import { beforeAll, describe, expect, it } from "vitest";
import type { Polyline } from "@texma-stitch/geometry";
import { initGeometry, rings } from "@texma-stitch/geometry";
import { annulus, polygonOf, pt, rect } from "../test/fixtures/shapes.js";
import { scanlines } from "./fill.js";
import {
  buildFillGraph,
  eulerize,
  eulerPath,
  nodeDegrees,
  ringSegment,
  type FillGraph,
} from "./fill-graph.js";

beforeAll(async () => {
  await initGeometry();
});

/** Rows of a shape, as the graph wants them: y and the two ends. */
const rowsOf = (poly: Parameters<typeof scanlines>[0], spacing: number) =>
  scanlines(poly, spacing).flatMap((row) => row.map((s) => ({ y: s.y, x0: s.x0, x1: s.x1 })));

const square = polygonOf(rect(0, 0, 20, 10));
const ring = annulus(0, 0, 12, 6);

const rowEdges = (g: FillGraph): number[] =>
  g.edges.flatMap((e, i) => (e.kind === "row" ? [i] : []));

describe("buildFillGraph (spec §8.3, 26.09.2026)", () => {
  it("makes a node of every row end and an edge of every row", () => {
    const rows = rowsOf(square, 1);
    const g = buildFillGraph(rows, rings(square));
    expect(rows.length).toBeGreaterThan(8);
    expect(rowEdges(g)).toHaveLength(rows.length);
    expect(g.nodes).toHaveLength(rows.length * 2);
  });

  it("connects the row ends along the outline they sit on", () => {
    const g = buildFillGraph(rowsOf(square, 1), rings(square));
    const outline = g.edges.filter((e) => e.kind === "outline");
    expect(outline.length).toBeGreaterThan(0);
    // Every outline edge joins two nodes of the same ring.
    for (const e of outline) expect(g.nodes[e.a]!.ring).toBe(g.nodes[e.b]!.ring);
  });

  it("puts a node on the ring it is nearest to", () => {
    // The ring has two: outer and inner. Row ends sit on both.
    const g = buildFillGraph(rowsOf(ring, 1), rings(ring));
    const used = new Set(g.nodes.map((n) => n.ring));
    expect(used.size).toBe(2);
  });
});

describe("eulerize (spec §8.3, 26.09.2026)", () => {
  it("leaves every node with an even degree", () => {
    for (const [poly, spacing] of [
      [square, 1],
      [ring, 1],
      [square, 0.4],
    ] as const) {
      const g = eulerize(buildFillGraph(rowsOf(poly, spacing), rings(poly)));
      for (const d of nodeDegrees(g)) expect(d % 2).toBe(0);
    }
  });

  it("keeps every row edge — it only ever adds", () => {
    const before = buildFillGraph(rowsOf(square, 1), rings(square));
    const after = eulerize(before);
    expect(rowEdges(after).length).toBe(rowEdges(before).length);
    expect(after.edges.length).toBeGreaterThanOrEqual(before.edges.length);
  });
});

describe("eulerPath (spec §8.3, 26.09.2026)", () => {
  const pathOf = (poly: typeof square, spacing: number) => {
    const g = eulerize(buildFillGraph(rowsOf(poly, spacing), rings(poly)));
    return { g, path: eulerPath(g) };
  };

  it("stitches every row exactly once", () => {
    for (const [poly, spacing] of [
      [square, 1],
      [ring, 1],
      [square, 0.4],
    ] as const) {
      const { g, path } = pathOf(poly, spacing);
      const rowsInPath = path.filter((s) => g.edges[s.edge]!.kind === "row");
      expect(rowsInPath).toHaveLength(rowEdges(g).length);
      expect(new Set(rowsInPath.map((s) => s.edge)).size).toBe(rowEdges(g).length);
    }
  });

  it("hands the needle from one step to the next without a gap", () => {
    const { path } = pathOf(ring, 1);
    for (let i = 1; i < path.length; i++) expect(path[i]!.from).toBe(path[i - 1]!.to);
  });

  it("uses every edge of the graph, each exactly once", () => {
    const { g, path } = pathOf(square, 1);
    expect(path).toHaveLength(g.edges.length);
  });

  it("gives the same answer twice (rule 3)", () => {
    const g = eulerize(buildFillGraph(rowsOf(ring, 1), rings(ring)));
    expect(eulerPath(g)).toEqual(eulerPath(g));
  });

  it("starts where it is told to", () => {
    const g = eulerize(buildFillGraph(rowsOf(square, 1), rings(square)));
    expect(eulerPath(g, 3)[0]!.from).toBe(3);
  });

  it("answers an empty graph with an empty path", () => {
    expect(eulerPath({ nodes: [], edges: [] })).toEqual([]);
    expect(eulerPath(eulerize(buildFillGraph([], [[pt(0, 0), pt(1, 0), pt(1, 1)]])))).toEqual([]);
  });
});

describe("ringSegment (spec §8.3, 26.09.2026)", () => {
  const box: Polyline = [pt(0, 0), pt(10, 0), pt(10, 10), pt(0, 10)];

  it("walks the shorter way round", () => {
    // Perimeter 40: from 1 to 9 the short way is forwards (8), backwards is 32.
    const forward = ringSegment(box, 1, 9);
    expect(forward[0]!).toEqual({ x: 1, y: 0 });
    expect(forward[forward.length - 1]!).toEqual({ x: 9, y: 0 });
    // From 1 to 35 the short way is backwards, over the seam at 0.
    const back = ringSegment(box, 1, 35);
    expect(back[back.length - 1]!.x).toBe(0);
    expect(back.length).toBeGreaterThan(1);
  });

  it("keeps the corners it passes", () => {
    // From 5 (on the bottom edge) to 15 (on the right edge) — the corner at
    // (10, 0) lies between and has to stay, or the way cuts across the shape.
    const way = ringSegment(box, 5, 15);
    expect(way.some((p) => p.x === 10 && p.y === 0)).toBe(true);
  });

  it("answers an empty way when there is nothing to walk", () => {
    expect(ringSegment(box, 4, 4)).toHaveLength(2);
    expect(ringSegment([], 0, 1)).toEqual([]);
  });

  it("gives the same answer twice (rule 3)", () => {
    expect(ringSegment(box, 3, 22)).toEqual(ringSegment(box, 3, 22));
  });
});
