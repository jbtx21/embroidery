import { beforeAll, describe, expect, it } from "vitest";
import {
  annulus,
  circle,
  lShape,
  polygonOf,
  pt,
  rect,
  uShape,
} from "../../engine/test/fixtures/shapes.js";
import { initGeometry } from "./clipper.js";
import { medialAxis, medialAxisLength, samplePolygonBoundary } from "./medial-axis.js";
import type { MedialAxis } from "./medial-axis.js";
import { closeRing, pointInPolygon, rings } from "./polygon.js";
import { nearestPoint } from "./measure.js";
import { arcLength } from "./measure.js";
import type { Point, Polygon } from "./types.js";
import { dist } from "./vec.js";

beforeAll(async () => {
  await initGeometry();
});

/** True clearance: distance from p to the nearest point on any ring. */
function clearance(poly: Polygon, p: Point): number {
  return Math.min(...rings(poly).map((r) => nearestPoint(closeRing(r), p).distance));
}

const allPoints = (axis: MedialAxis): Point[] => axis.branches.flatMap((b) => b.points);
const allRadii = (axis: MedialAxis): number[] => axis.branches.flatMap((b) => b.radii);

describe("samplePolygonBoundary", () => {
  it("puts points on the outline at roughly the asked spacing", () => {
    const square = polygonOf(rect(0, 0, 20, 10));
    const points = samplePolygonBoundary(square, 1);
    expect(points.length).toBeCloseTo(60, -1); // perimeter 60
    for (const p of points) expect(clearance(square, p)).toBeLessThan(1e-6);
  });

  it("samples the holes as well", () => {
    const ring = annulus(0, 0, 10, 6);
    const points = samplePolygonBoundary(ring, 1);
    const onOuter = points.filter((p) => Math.abs(Math.hypot(p.x, p.y) - 10) < 0.1);
    const onHole = points.filter((p) => Math.abs(Math.hypot(p.x, p.y) - 6) < 0.1);
    expect(onOuter.length).toBeGreaterThan(50);
    expect(onHole.length).toBeGreaterThan(30);
  });

  it("skips rings that are too short or degenerate", () => {
    expect(samplePolygonBoundary(polygonOf([pt(0, 0), pt(1, 0)]), 1)).toHaveLength(0);
    expect(samplePolygonBoundary(polygonOf(rect(0, 0, 0.1, 0.1)), 5)).toHaveLength(0);
  });
});

describe("medialAxis (spec §5)", () => {
  it("keeps every skeleton point inside the shape", () => {
    for (const shape of [polygonOf(rect(0, 0, 20, 10)), uShape(), lShape(), annulus(0, 0, 10, 6)]) {
      const points = allPoints(medialAxis(shape));
      expect(points.length).toBeGreaterThan(0);
      for (const p of points) expect(pointInPolygon(shape, p)).toBe(true);
    }
  });

  it("reports the clearance at each point", () => {
    const shape = polygonOf(rect(0, 0, 20, 10));
    for (const branch of medialAxis(shape).branches) {
      branch.points.forEach((p, i) => {
        // The skeleton is an approximation of the sampled outline, so allow
        // roughly one sampling step of slack.
        expect(Math.abs(branch.radii[i]! - clearance(shape, p))).toBeLessThan(0.35);
      });
    }
  });

  it("finds the inscribed circle of a rectangle", () => {
    // Medial axis of 20 x 10: the central segment plus four diagonals to the
    // corners. Largest clearance is half the short side.
    const axis = medialAxis(polygonOf(rect(0, 0, 20, 10)));
    expect(Math.max(...allRadii(axis))).toBeCloseTo(5, 1);
    expect(axis.branches.length).toBeGreaterThanOrEqual(3); // it has junctions
    const xs = allPoints(axis).map((p) => p.x);
    expect(Math.min(...xs)).toBeLessThan(1);
    expect(Math.max(...xs)).toBeGreaterThan(19);
  });

  it("runs the length of a long thin rectangle", () => {
    const axis = medialAxis(polygonOf(rect(0, 0, 40, 4)));
    expect(Math.max(...allRadii(axis))).toBeCloseTo(2, 1);
    expect(medialAxisLength(axis)).toBeGreaterThan(40);
  });

  it("makes a ring out of an annulus", () => {
    const axis = medialAxis(annulus(0, 0, 10, 6));
    expect(axis.branches).toHaveLength(1);
    const branch = axis.branches[0]!;
    // Closed loop: it comes back to where it started.
    expect(dist(branch.points[0]!, branch.points[branch.points.length - 1]!)).toBeLessThan(1e-6);
    expect(arcLength(branch.points)).toBeCloseTo(2 * Math.PI * 8, 0);
    for (const p of branch.points) expect(Math.hypot(p.x, p.y)).toBeCloseTo(8, 0);
    for (const r of branch.radii) expect(r).toBeCloseTo(2, 1);
  });

  it("gives a disc no axis — its medial axis is a single point", () => {
    expect(medialAxis(polygonOf(circle(0, 0, 10))).branches).toHaveLength(0);
    expect(medialAxisLength(medialAxis(polygonOf(circle(0, 0, 10))))).toBe(0);
  });

  it("puts the largest clearance of an L at its reflex corner", () => {
    const axis = medialAxis(lShape(30, 8));
    // The biggest inscribed circle sits at (c, c), touches x = 0 and y = 0, and
    // just reaches the reflex vertex at (8, 8):
    //   sqrt(2) * (8 - c) = c  =>  c = 8 * (2 - sqrt(2)) ~ 4.686
    const expected = 8 * (2 - Math.SQRT2);
    expect(Math.max(...allRadii(axis))).toBeCloseTo(expected, 1);
    expect(axis.branches.length).toBeGreaterThan(1);
  });

  it("follows the arms of a U", () => {
    const axis = medialAxis(uShape(20, 20, 8));
    const points = allPoints(axis);
    expect(points.length).toBeGreaterThan(10);
    // The skeleton spans the full width of the U
    const xs = points.map((p) => p.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(10);
  });

  it("returns nothing for a degenerate shape", () => {
    expect(medialAxis(polygonOf([pt(0, 0), pt(10, 0), pt(20, 0)])).branches).toHaveLength(0);
    expect(medialAxis(polygonOf(rect(0, 0, 0, 10))).branches).toHaveLength(0);
  });

  it("cuts more branches with a larger prune factor", () => {
    const shape = polygonOf(rect(0, 0, 20, 10));
    const keepAll = medialAxisLength(medialAxis(shape, { pruneFactor: 0 }));
    const cutHard = medialAxisLength(medialAxis(shape, { pruneFactor: 3 }));
    expect(cutHard).toBeLessThan(keepAll);
  });

  it("is deterministic", () => {
    const shape = lShape();
    expect(JSON.stringify(medialAxis(shape))).toBe(JSON.stringify(medialAxis(shape)));
  });

  it("gets finer with a smaller sampling distance", () => {
    const shape = polygonOf(rect(0, 0, 40, 4));
    const coarse = allPoints(medialAxis(shape, { sampleMm: 2 })).length;
    const fine = allPoints(medialAxis(shape, { sampleMm: 0.5 })).length;
    expect(fine).toBeGreaterThan(coarse);
  });
});
