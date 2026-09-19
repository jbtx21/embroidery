import { beforeAll, describe, expect, it } from "vitest";
import { annulus, polygonOf, pt, rect, uShape } from "../../engine/test/fixtures/shapes.js";
import { initGeometry } from "./clipper.js";
import { buildEdgeIndex } from "./edge-index.js";
import { pointInPolygon } from "./polygon.js";
import type { Point, Polygon } from "./types.js";

beforeAll(async () => {
  await initGeometry();
});

/** Every edge the naive way — the index must never return less than this. */
function crossingEdges(poly: Polygon, a: Point, b: Point): number {
  const idx = buildEdgeIndex(poly);
  let hits = 0;
  for (const e of idx.edges) {
    const d1 = (b.x - a.x) * (e.a.y - a.y) - (b.y - a.y) * (e.a.x - a.x);
    const d2 = (b.x - a.x) * (e.b.y - a.y) - (b.y - a.y) * (e.b.x - a.x);
    const d3 = (e.b.x - e.a.x) * (a.y - e.a.y) - (e.b.y - e.a.y) * (a.x - e.a.x);
    const d4 = (e.b.x - e.a.x) * (b.y - e.a.y) - (e.b.y - e.a.y) * (b.x - e.a.x);
    if (d1 * d2 < 0 && d3 * d4 < 0) hits++;
  }
  return hits;
}

describe("buildEdgeIndex", () => {
  it("lists one edge per ring segment, outer ring first", () => {
    const idx = buildEdgeIndex(polygonOf(rect(0, 0, 10, 5)));
    expect(idx.edges).toHaveLength(4);
    const ring = annulus(0, 0, 10, 5);
    expect(buildEdgeIndex(ring).edges).toHaveLength(ring.outer.length + ring.holes[0]!.length);
  });

  it("agrees with pointInPolygon", () => {
    for (const poly of [polygonOf(rect(0, 0, 10, 5)), annulus(0, 0, 10, 5), uShape()]) {
      const idx = buildEdgeIndex(poly);
      for (let x = -12; x <= 22; x += 0.7) {
        for (let y = -12; y <= 22; y += 0.7) {
          const p = pt(+x.toFixed(3), +y.toFixed(3));
          expect(idx.contains(p)).toBe(pointInPolygon(poly, p));
        }
      }
    }
  });

  it("never misses an edge a segment really crosses", () => {
    const poly = uShape();
    const idx = buildEdgeIndex(poly);
    for (let i = 0; i < 40; i++) {
      // Deterministic sweep, no Math.random (rule 3).
      const a = pt(-5 + i * 0.7, -5 + ((i * 3) % 30));
      const b = pt(25 - i * 0.6, 25 - ((i * 7) % 30));
      const candidates = idx.near(a, b);
      expect(candidates.length).toBeGreaterThanOrEqual(crossingEdges(poly, a, b));
      // A superset, but a small one — otherwise the index buys nothing.
      expect(candidates.length).toBeLessThanOrEqual(idx.edges.length);
      expect(new Set(candidates).size).toBe(candidates.length);
    }
  });

  it("returns nothing for a segment that misses the shape entirely", () => {
    const idx = buildEdgeIndex(polygonOf(rect(0, 0, 10, 10)));
    expect(idx.near(pt(-50, -50), pt(-40, -50))).toEqual([]);
    expect(idx.contains(pt(-50, -50))).toBe(false);
  });

  it("survives an empty polygon", () => {
    const idx = buildEdgeIndex({ outer: [], holes: [] });
    expect(idx.edges).toEqual([]);
    expect(idx.near(pt(0, 0), pt(1, 1))).toEqual([]);
    expect(idx.contains(pt(0, 0))).toBe(false);
  });
});
