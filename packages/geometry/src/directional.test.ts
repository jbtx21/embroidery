import { beforeAll, describe, expect, it } from "vitest";
import { polygonOf, pt, rect } from "../../engine/test/fixtures/shapes.js";
import { initGeometry } from "./clipper.js";
import { offsetDirectional } from "./offset.js";
import { bbox, polygonArea } from "./polygon.js";
import { curvatureRadii, resampleAdaptive } from "./resample.js";
import { arcLength } from "./measure.js";
import { circle } from "../../engine/test/fixtures/shapes.js";

beforeAll(async () => {
  await initGeometry();
});

const square = polygonOf(rect(0, 0, 20, 20));

describe("offsetDirectional (spec §8.1.1)", () => {
  it("grows along the thread direction and shrinks across it", () => {
    // angleDeg 0 means the thread runs along x.
    const [out] = offsetDirectional(square, 0.5, 0.3, 0);
    const b = bbox(out!.outer);
    expect(b.maxX - b.minX).toBeCloseTo(21, 1); // 20 + 2 x 0,5
    expect(b.maxY - b.minY).toBeCloseTo(19.4, 1); // 20 - 2 x 0,3
  });

  it("turns with the angle", () => {
    const [out] = offsetDirectional(square, 0.5, 0.3, 90);
    const b = bbox(out!.outer);
    expect(b.maxX - b.minX).toBeCloseTo(19.4, 1);
    expect(b.maxY - b.minY).toBeCloseTo(21, 1);
  });

  it("leaves the shape alone when both are zero", () => {
    const [out] = offsetDirectional(square, 0, 0, 0);
    expect(polygonArea(out!)).toBeCloseTo(400, 6);
  });

  it("keeps the cross direction almost untouched with pull alone", () => {
    const [out] = offsetDirectional(square, 1, 0, 0);
    const b = bbox(out!.outer);
    expect(b.maxX - b.minX).toBeCloseTo(22, 1);
    // K = 40, so the leftover on the other axis is 1/40 mm per side.
    expect(b.maxY - b.minY).toBeGreaterThan(20);
    expect(b.maxY - b.minY).toBeLessThan(20.1);
  });

  it("reports nothing when push eats the shape", () => {
    expect(offsetDirectional(polygonOf(rect(0, 0, 20, 0.5)), 0, 5, 0)).toHaveLength(0);
  });
});

describe("curvatureRadii (spec §6.1)", () => {
  it("gives an infinite radius on a straight line", () => {
    const r = curvatureRadii([pt(0, 0), pt(1, 0), pt(2, 0), pt(3, 0)]);
    expect(r.every((x) => x === Infinity)).toBe(true);
  });

  it("finds the radius of a circle", () => {
    const r = curvatureRadii(circle(0, 0, 5, 64));
    const inner = r.slice(1, -1);
    for (const x of inner) expect(x).toBeGreaterThan(4.9);
    for (const x of inner) expect(x).toBeLessThan(5.1);
  });

  it("handles paths too short to have a curvature", () => {
    expect(curvatureRadii([pt(0, 0), pt(1, 0)])).toEqual([Infinity, Infinity]);
    expect(curvatureRadii([])).toEqual([]);
  });
});

describe("resampleAdaptive (spec §6.1)", () => {
  const stepsOf = (line: ReturnType<typeof resampleAdaptive>): number[] => {
    const out: number[] = [];
    for (let i = 1; i < line.length; i++) {
      out.push(Math.hypot(line[i]!.x - line[i - 1]!.x, line[i]!.y - line[i - 1]!.y));
    }
    return out;
  };

  it("uses the full stitch length on a straight line", () => {
    const line = resampleAdaptive([pt(0, 0), pt(25, 0)], 2.5);
    for (const s of stepsOf(line)) expect(s).toBeCloseTo(2.5, 6);
  });

  it("shortens the stitch in a tight curve", () => {
    const tight = stepsOf(resampleAdaptive(circle(0, 0, 2, 128), 2.5, { closed: true }));
    const wide = stepsOf(resampleAdaptive(circle(0, 0, 40, 256), 2.5, { closed: true }));
    expect(Math.max(...tight)).toBeLessThan(Math.max(...wide));
    expect(Math.max(...wide)).toBeCloseTo(2.5, 1);
  });

  it("never goes below the floor of 0,8 mm", () => {
    for (const r of [0.5, 1, 2]) {
      const steps = stepsOf(resampleAdaptive(circle(0, 0, r, 256), 2.5, { closed: true }));
      expect(Math.min(...steps)).toBeGreaterThan(0.79);
    }
  });

  it("keeps the ends and the length of the path", () => {
    const path = [pt(0, 0), pt(10, 0), pt(10, 10)];
    const line = resampleAdaptive(path, 2.5);
    expect(line[0]).toEqual(pt(0, 0));
    expect(line[line.length - 1]).toEqual(pt(10, 10));
    expect(arcLength(line)).toBeCloseTo(20, 6);
  });

  it("is deterministic", () => {
    const a = resampleAdaptive(circle(0, 0, 3, 64), 2.5, { closed: true });
    const b = resampleAdaptive(circle(0, 0, 3, 64), 2.5, { closed: true });
    expect(a).toEqual(b);
  });

  it("returns the path unchanged when there is nothing to sample", () => {
    expect(resampleAdaptive([pt(1, 1)], 2.5)).toEqual([pt(1, 1)]);
    expect(resampleAdaptive([], 2.5)).toEqual([]);
  });
});
