import { beforeAll, describe, expect, it } from "vitest";
import type { Point, Polygon } from "@texma-stitch/geometry";
import { initGeometry } from "@texma-stitch/geometry";
import { polygonOf, pt, rect } from "../../test/fixtures/shapes.js";
import { PRESETS } from "../presets.js";
import type { SatinColumnPlan } from "./columns.js";
import { satinColumns } from "./columns.js";
import {
  FABRIC_GAP_MAX_MM,
  FABRIC_GAP_MIN_MM,
  formIndex,
  gapAlong,
  railPull,
  satinPullCompMm,
} from "./rail-pull.js";

beforeAll(async () => {
  await initGeometry();
});

const cap = PRESETS.cap;
const bar = (x: number, y: number, w: number, h: number): Polygon => polygonOf(rect(x, y, w, h));
const columnOf = (shape: Polygon): SatinColumnPlan => {
  const plan = satinColumns(shape, { underlapMm: cap.underlapMm, idPrefix: "c" });
  expect(plan.ok, plan.reason).toBe(true);
  expect(plan.columns).toHaveLength(1);
  return plan.columns[0]!;
};
/** Which rail (0 = A, 1 = B) of a horizontal column lies lower on the page, at the larger y. */
const lowerRail = (c: SatinColumnPlan): 0 | 1 => {
  const mean = (r: Point[]): number => r.reduce((s, p) => s + p.y, 0) / r.length;
  return mean(c.railA) > mean(c.railB) ? 0 : 1;
};
const DOWN = pt(0, 1);

// The Hofbräu motif in miniature (spec §7.8.3): a red letter stroke of 2.4 mm, a gold shadow line of
// 0.75 mm 0.53 mm below it.
const red = bar(0, 0, 30, 2.4);
const gold = (gap: number, x = 0, w = 30): Polygon => bar(x, 2.4 + gap, w, 0.75);

describe("gapAlong (the fabric between a rail and the next other form)", () => {
  const own = { shapeId: "red", polygon: red };

  it("measures the fabric from the rail to the next other form", () => {
    const forms = formIndex([{ shapeId: "gold", polygon: gold(0.53) }]);
    expect(gapAlong(pt(15, 2.4), DOWN, forms, own)).toBeCloseTo(0.53, 6);
  });

  it("finds nothing where the next form is a fabric gap of 1.0 mm or more away", () => {
    const at = (gap: number) =>
      gapAlong(pt(15, 2.4), DOWN, formIndex([{ shapeId: "gold", polygon: gold(gap) }]), own);
    expect(at(FABRIC_GAP_MAX_MM - 0.05)).toBeCloseTo(FABRIC_GAP_MAX_MM - 0.05, 6);
    expect(at(FABRIC_GAP_MAX_MM)).toBe(Infinity);
    expect(at(2)).toBe(Infinity);
  });

  it("says 0 where the other form touches or overlaps: there is no fabric to keep open", () => {
    const at = (gap: number) =>
      gapAlong(pt(15, 2.4), DOWN, formIndex([{ shapeId: "gold", polygon: gold(gap) }]), own);
    expect(at(0)).toBe(0);
    // Overlapping: the other form starts above the rail.
    const under = formIndex([{ shapeId: "gold", polygon: bar(0, 1.5, 30, 3) }]);
    expect(gapAlong(pt(15, 2.4), DOWN, under, own)).toBe(0);
  });

  it("does not count a hairline under the DST resolution as a gap (spec §5.2 rule 3)", () => {
    expect(FABRIC_GAP_MIN_MM).toBe(0.1);
    const at = (gap: number) =>
      gapAlong(pt(15, 2.4), DOWN, formIndex([{ shapeId: "gold", polygon: gold(gap) }]), own);
    expect(at(0.05)).toBe(0);
    expect(at(0.1)).toBeCloseTo(0.1, 6);
  });

  it("ignores forms of its own shape: not another form", () => {
    const forms = formIndex([
      { shapeId: "red", polygon: bar(0, 2.9, 30, 1) },
      { shapeId: "gold", polygon: gold(0.8) },
    ]);
    expect(gapAlong(pt(15, 2.4), DOWN, forms, own)).toBeCloseTo(0.8, 6);
  });

  it("does not look through the shape's own material to a form behind it", () => {
    // A slot in the shape itself: its other arm (own material) comes at 0.3 mm, the other form behind
    // it at 0.7 mm — between the rail and that form lies the arm, not fabric.
    const arm = { shapeId: "red", polygon: bar(0, 2.7, 30, 0.3) };
    const forms = formIndex([{ shapeId: "gold", polygon: bar(0, 3.1, 30, 0.75) }]);
    expect(gapAlong(pt(15, 2.4), DOWN, forms, arm)).toBe(Infinity);
    // The other form in front of the arm is the gap.
    const front = formIndex([{ shapeId: "gold", polygon: bar(0, 2.5, 30, 0.1) }]);
    expect(gapAlong(pt(15, 2.4), DOWN, front, arm)).toBeCloseTo(0.1, 6);
  });

  it("measures from the outline where the rail lies inside the shape", () => {
    // The rail 0.1 mm inside the shape: its material ends first, the fabric is what follows.
    const forms = formIndex([{ shapeId: "gold", polygon: gold(0.53) }]);
    expect(gapAlong(pt(15, 2.3), DOWN, forms, own)).toBeCloseTo(0.53, 6);
  });

  it("finds a form up to the reach and no further, and none where there is none", () => {
    expect(gapAlong(pt(15, 2.4), DOWN, formIndex([]), own)).toBe(Infinity);
    const away = formIndex([{ shapeId: "gold", polygon: bar(100, 100, 5, 5) }]);
    expect(gapAlong(pt(15, 2.4), DOWN, away, own)).toBe(Infinity);
  });
});

describe("railPull (spec §7.8.3: pull compensation per rail)", () => {
  const full = satinPullCompMm(2.4, cap); // 12 % of 2.4 mm: 0.288, the "0.29 mm" of the spec

  it("gives the rail at a fabric gap under 1.0 mm no compensation, the other its full amount", () => {
    const c = columnOf(red);
    const forms = formIndex([{ shapeId: "gold", polygon: gold(0.53) }]);
    const r = railPull(c, { shapeId: "red", polygon: red }, forms, cap);
    const low = lowerRail(c);
    expect(r.narrow).toBe(false);
    expect(r.pull[low]).toBe(0);
    expect(r.pull[low === 0 ? 1 : 0]).toBeCloseTo(full, 6);
    expect(r.gapMm[low]).toBeCloseTo(0.53, 2);
    expect(r.gapMm[low === 0 ? 1 : 0]).toBe(Infinity);
  });

  it("keeps the full compensation on both rails where nothing lies at a gap", () => {
    const c = columnOf(red);
    const none = railPull(c, { shapeId: "red", polygon: red }, formIndex([]), cap);
    expect(none.pull[0]).toBeCloseTo(full, 6);
    expect(none.pull[1]).toBeCloseTo(full, 6);
    // A neighbour 1.5 mm away is no gap under 1.0 mm; one that touches is no fabric.
    for (const gap of [1.5, 0]) {
      const forms = formIndex([{ shapeId: "gold", polygon: gold(gap) }]);
      const r = railPull(c, { shapeId: "red", polygon: red }, forms, cap);
      expect(r.pull[0]).toBeCloseTo(full, 6);
      expect(r.pull[1]).toBeCloseTo(full, 6);
    }
  });

  it("gives a column under 1.0 mm no compensation at all, gap or not", () => {
    const thin = bar(0, 0, 30, 0.9);
    const c = columnOf(thin);
    const r = railPull(c, { shapeId: "thin", polygon: thin }, formIndex([]), cap);
    expect(r.narrow).toBe(true);
    expect(r.pull).toEqual([0, 0]);
    // The gold shadow line itself: 0.75 mm.
    const line = gold(0.53);
    const lc = columnOf(line);
    expect(railPull(lc, { shapeId: "gold", polygon: line }, formIndex([]), cap)).toMatchObject({
      narrow: true,
      pull: [0, 0],
    });
  });

  it("goes by the median over the column: a neighbour along a third of it is no gap, along most of it is", () => {
    const c = columnOf(red);
    const own = { shapeId: "red", polygon: red };
    const third = formIndex([{ shapeId: "gold", polygon: gold(0.53, 20, 10) }]);
    const most = formIndex([{ shapeId: "gold", polygon: gold(0.53, 0, 22) }]);
    const low = lowerRail(c);
    expect(railPull(c, own, third, cap).pull[low]).toBeCloseTo(full, 6);
    expect(railPull(c, own, most, cap).pull[low]).toBe(0);
  });

  it("measures the gap to any form, whatever its colour, and to the nearest", () => {
    const c = columnOf(red);
    const own = { shapeId: "red", polygon: red };
    const forms = formIndex([
      { shapeId: "far", polygon: gold(0.9) },
      { shapeId: "near", polygon: gold(0.35) },
    ]);
    const r = railPull(c, own, forms, cap);
    expect(r.gapMm[lowerRail(c)]).toBeCloseTo(0.35, 2);
    expect(r.pull[lowerRail(c)]).toBe(0);
  });

  it("has nothing to measure from a column without rungs: the compensation stays", () => {
    const c: SatinColumnPlan = { ...columnOf(red), rungs: [] };
    const forms = formIndex([{ shapeId: "gold", polygon: gold(0.53) }]);
    const r = railPull(c, { shapeId: "red", polygon: red }, forms, cap);
    expect(r.pull[0]).toBeCloseTo(full, 6);
    expect(r.pull[1]).toBeCloseTo(full, 6);
  });
});
