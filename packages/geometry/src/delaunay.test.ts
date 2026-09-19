import { describe, expect, it } from "vitest";
import { circumcircle, delaunay, triangleNeighbours } from "./delaunay.js";
import type { Point } from "./types.js";
import { dist } from "./vec.js";

const pt = (x: number, y: number): Point => ({ x, y });

/**
 * The defining property: no point lies strictly inside the circumcircle of any
 * triangle. Checking that is a real test — it does not depend on how the
 * triangulation was built.
 */
function isDelaunay(points: Point[], triangles: [number, number, number][]): boolean {
  for (const t of triangles) {
    const cc = circumcircle(points[t[0]]!, points[t[1]]!, points[t[2]]!);
    if (!cc) return false;
    for (let i = 0; i < points.length; i++) {
      if (t.includes(i)) continue;
      if (dist(cc.center, points[i]!) < cc.radius - 1e-6) return false;
    }
  }
  return true;
}

describe("circumcircle", () => {
  it("puts the centre of a right triangle on the hypotenuse midpoint", () => {
    const cc = circumcircle(pt(0, 0), pt(4, 0), pt(0, 3))!;
    expect(cc.center.x).toBeCloseTo(2, 9);
    expect(cc.center.y).toBeCloseTo(1.5, 9);
    expect(cc.radius).toBeCloseTo(2.5, 9);
  });

  it("is equidistant from all three corners", () => {
    const a = pt(1, 2);
    const b = pt(7, 3);
    const c = pt(3, 9);
    const cc = circumcircle(a, b, c)!;
    expect(dist(cc.center, a)).toBeCloseTo(cc.radius, 9);
    expect(dist(cc.center, b)).toBeCloseTo(cc.radius, 9);
    expect(dist(cc.center, c)).toBeCloseTo(cc.radius, 9);
  });

  it("has none for collinear points", () => {
    expect(circumcircle(pt(0, 0), pt(1, 0), pt(2, 0))).toBeUndefined();
    expect(circumcircle(pt(0, 0), pt(0, 0), pt(2, 0))).toBeUndefined();
  });
});

describe("delaunay", () => {
  it("makes one triangle from three points", () => {
    expect(delaunay([pt(0, 0), pt(10, 0), pt(0, 10)])).toHaveLength(1);
  });

  it("needs at least three points", () => {
    expect(delaunay([])).toHaveLength(0);
    expect(delaunay([pt(0, 0), pt(1, 1)])).toHaveLength(0);
  });

  it("makes two triangles from a square and keeps the Delaunay property", () => {
    const square = [pt(0, 0), pt(10, 0), pt(10, 10), pt(0, 10)];
    const tris = delaunay(square);
    expect(tris).toHaveLength(2);
    expect(isDelaunay(square, tris)).toBe(true);
  });

  it("keeps the property on a grid", () => {
    const grid: Point[] = [];
    for (let x = 0; x < 6; x++) {
      for (let y = 0; y < 5; y++) {
        // Slight, fixed jitter so the grid is not degenerate — deterministic,
        // no Math.random (CLAUDE.md rule 3).
        grid.push(pt(x * 3 + ((x * 7 + y * 3) % 5) * 0.01, y * 3 + ((x * 11 + y * 5) % 7) * 0.01));
      }
    }
    const tris = delaunay(grid);
    expect(tris.length).toBeGreaterThan(30);
    expect(isDelaunay(grid, tris)).toBe(true);
  });

  it("covers the convex hull area of a convex point set", () => {
    const square = [pt(0, 0), pt(10, 0), pt(10, 10), pt(0, 10)];
    const tris = delaunay(square);
    const area = tris.reduce((sum, t) => {
      const [a, b, c] = [square[t[0]]!, square[t[1]]!, square[t[2]]!];
      return sum + Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2;
    }, 0);
    expect(area).toBeCloseTo(100, 6);
  });

  it("gives nothing for collinear points", () => {
    expect(delaunay([pt(0, 0), pt(1, 0), pt(2, 0), pt(3, 0)])).toHaveLength(0);
  });

  it("survives duplicate points", () => {
    const tris = delaunay([pt(0, 0), pt(10, 0), pt(0, 10), pt(10, 0)]);
    expect(isDelaunay([pt(0, 0), pt(10, 0), pt(0, 10), pt(10, 0)], tris)).toBe(true);
  });

  it("is deterministic", () => {
    const points = [pt(0, 0), pt(10, 1), pt(9, 9), pt(1, 8), pt(5, 4)];
    expect(delaunay(points)).toEqual(delaunay(points));
  });
});

describe("triangleNeighbours", () => {
  it("finds the shared edge of two triangles", () => {
    const square = [pt(0, 0), pt(10, 0), pt(10, 10), pt(0, 10)];
    const tris = delaunay(square);
    const shared = [...triangleNeighbours(tris).values()].filter((v) => v.length === 2);
    expect(shared).toHaveLength(1);
    expect(shared[0]).toHaveLength(2);
  });

  it("lists every outer edge once", () => {
    const tris = delaunay([pt(0, 0), pt(10, 0), pt(0, 10)]);
    const map = triangleNeighbours(tris);
    expect(map.size).toBe(3);
    for (const v of map.values()) expect(v).toHaveLength(1);
  });
});
