import { beforeAll, describe, expect, it } from "vitest";
import { initGeometry, polygonArea, pointInPolygon } from "@texma-stitch/geometry";
import { polygonOf, pt, rect } from "../../test/fixtures/shapes.js";
import { KNOCKDOWN_MIN_MM2, KNOCKDOWN_UNDERLAP_MM } from "../resolve-overlaps.js";
import { cutOutSatin, knockdownAreas } from "./knockdown.js";
import type { KnockdownItem } from "./knockdown.js";

beforeAll(async () => {
  await initGeometry();
});

const item = (id: string, x: number, y: number, w: number, h: number): KnockdownItem => ({
  id,
  polygon: polygonOf(rect(x, y, w, h)),
});
const areaOf = (parts: { outer: unknown }[] | undefined): number =>
  (parts ?? []).reduce((sum, p) => sum + polygonArea(p as Parameters<typeof polygonArea>[0]), 0);

describe("knockdownAreas (spec §4.1 on the tatami areas of the template)", () => {
  it("cuts the earlier area where the later one covers it, leaving 0.8 mm underneath", () => {
    const r = knockdownAreas([item("below", 0, 0, 40, 40), item("above", 10, 10, 20, 20)]);
    // What is taken out is the upper square shrunk by 0.8 mm on every side.
    const cut = 40 * 40 - areaOf(r.areas.get("below"));
    expect(cut).toBeCloseTo((20 - 2 * KNOCKDOWN_UNDERLAP_MM) ** 2, 0);
    // The upper one is untouched.
    expect(areaOf(r.areas.get("above"))).toBeCloseTo(400, 6);
    // The lower area still runs under the upper one's edge, the middle is empty.
    const below = r.areas.get("below")!;
    expect(below).toHaveLength(1);
    expect(pointInPolygon(below[0]!, pt(10.4, 20))).toBe(true);
    expect(pointInPolygon(below[0]!, pt(20, 20))).toBe(false);
  });

  it("goes by the order, not the colour: the later area cuts, the earlier one is cut", () => {
    const early = knockdownAreas([item("a", 0, 0, 40, 40), item("b", 10, 10, 20, 20)]);
    const late = knockdownAreas([item("b", 10, 10, 20, 20), item("a", 0, 0, 40, 40)]);
    expect(areaOf(early.areas.get("a"))).toBeLessThan(1600);
    expect(areaOf(early.areas.get("b"))).toBeCloseTo(400, 6);
    // Turned round, the big area lies on top and swallows the small one whole.
    expect(early.covered).toEqual([]);
    expect(late.covered).toEqual(["b"]);
    expect(late.areas.has("b")).toBe(false);
    expect(areaOf(late.areas.get("a"))).toBeCloseTo(1600, 6);
  });

  it("does not cut where less than the threshold is covered", () => {
    // 3 x 3 mm of overlap, well under 20 mm².
    const r = knockdownAreas([item("below", 0, 0, 20, 20), item("above", 17, 17, 3, 3)]);
    expect(areaOf(r.areas.get("below"))).toBeGreaterThanOrEqual(400 - 1e-6);
    expect(KNOCKDOWN_MIN_MM2).toBe(20);
  });

  it("extends the earlier area under a later one it only touches", () => {
    const r = knockdownAreas([item("below", 0, 0, 20, 20), item("above", 20, 0, 20, 20)]);
    // 20 mm of shared edge times 0.8 mm of underlap.
    expect(areaOf(r.areas.get("below")) - 400).toBeCloseTo(20 * KNOCKDOWN_UNDERLAP_MM, 0);
    expect(areaOf(r.areas.get("above"))).toBeCloseTo(400, 6);
  });

  it("says so when an area is covered completely — and does not stitch it", () => {
    const r = knockdownAreas([item("hidden", 5, 5, 10, 10), item("cover", 0, 0, 20, 20)]);
    expect(r.covered).toEqual(["hidden"]);
    expect(r.areas.has("hidden")).toBe(false);
    expect(r.warnings).toMatchObject([
      { code: "FILL_COVERED", severity: "info", objectId: "hidden" },
    ]);
  });

  it("hands every part of an area the cut splits, and says it split", () => {
    // A bar 30 x 10, a post 10 wide across the middle of it: a left and a right part.
    const r = knockdownAreas([item("bar", 0, 0, 30, 10), item("post", 10, -5, 10, 20)]);
    expect(r.areas.get("bar")).toHaveLength(2);
    expect(r.warnings.some((w) => w.code === "SHAPE_SPLIT" && w.objectId === "bar")).toBe(true);
  });

  it("leaves areas that do not meet alone, as the very same polygon", () => {
    const a = item("a", 0, 0, 10, 10);
    const b = item("b", 100, 100, 10, 10);
    const r = knockdownAreas([a, b]);
    expect(r.areas.get("a")).toEqual([a.polygon]);
    expect(r.areas.get("b")).toEqual([b.polygon]);
    expect(r.warnings).toEqual([]);
    expect(r.covered).toEqual([]);
  });

  it("gives back an empty result for no areas", () => {
    expect(knockdownAreas([])).toEqual({ areas: new Map(), covered: [], warnings: [] });
  });
});

describe("knockdownAreas with a shorter reach for touching areas (spec §4.2 rule 2, rejected — an option)", () => {
  it("extends the earlier area by the reach it is given, under a later one it only touches", () => {
    const items = [item("below", 0, 0, 20, 20), item("above", 20, 0, 20, 20)];
    const short = knockdownAreas(items, { touchUnderlapMm: 0.3 });
    // 20 mm of shared edge times 0.3 mm of underlap.
    expect(areaOf(short.areas.get("below")) - 400).toBeCloseTo(20 * 0.3, 0);
    expect(areaOf(short.areas.get("above"))).toBeCloseTo(400, 6);
    // Without the option it is the 0.8 mm of §4.1.
    const plain = knockdownAreas(items);
    expect(areaOf(plain.areas.get("below")) - 400).toBeCloseTo(20 * KNOCKDOWN_UNDERLAP_MM, 0);
  });

  it("leaves the cut of an overlap at 0.8 mm whatever the reach", () => {
    const r = knockdownAreas([item("below", 0, 0, 40, 40), item("above", 10, 10, 20, 20)], {
      touchUnderlapMm: 0.3,
    });
    const cut = 40 * 40 - areaOf(r.areas.get("below"));
    expect(cut).toBeCloseTo((20 - 2 * KNOCKDOWN_UNDERLAP_MM) ** 2, 0);
  });
});

describe("cutOutSatin (spec §4.2 rule 1: satin spares the tatami beneath it)", () => {
  const ground = [polygonOf(rect(0, 0, 40, 30))];
  const shape = (x: number, y: number, w: number, h: number) => polygonOf(rect(x, y, w, h));
  const UNDERLAP = 0.2;

  it("takes the place of a later satin shape out of the area, 0.2 mm short of its edge", () => {
    const r = cutOutSatin(ground, [shape(10, 5, 20, 10)], UNDERLAP);
    // The satin shape shrunk by 0.2 mm on every side: 19.6 x 9.6.
    expect(r.coveredMm2).toBeCloseTo(200, 6);
    expect(r.cutMm2).toBeCloseTo(19.6 * 9.6, 1);
    expect(r.parts).toHaveLength(1);
    expect(areaOf(r.parts)).toBeCloseTo(1200 - 19.6 * 9.6, 1);
    // 0.1 mm inside the satin's edge the tatami still runs, 0.3 mm inside it is cut.
    expect(pointInPolygon(r.parts[0]!, pt(10.1, 10))).toBe(true);
    expect(pointInPolygon(r.parts[0]!, pt(10.3, 10))).toBe(false);
  });

  it("does not cut where the satin covers less than 20 mm² of the area — and hands back the same list", () => {
    const r = cutOutSatin(ground, [shape(10, 5, 2, 8)], UNDERLAP);
    expect(r.coveredMm2).toBeCloseTo(16, 6);
    expect(r.cutMm2).toBe(0);
    expect(r.parts).toBe(ground);
  });

  it("measures the threshold on all satin shapes together, not on each", () => {
    const one = shape(10, 5, 2, 8);
    const two = shape(20, 5, 2, 8);
    expect(cutOutSatin(ground, [one], UNDERLAP).parts).toBe(ground);
    const both = cutOutSatin(ground, [one, two], UNDERLAP);
    expect(both.coveredMm2).toBeCloseTo(32, 6);
    // Each is cut: 1.6 x 7.6 mm.
    expect(both.cutMm2).toBeCloseTo(2 * 1.6 * 7.6, 1);
    expect(both.parts).not.toBe(ground);
  });

  it("does not count a satin shape that lies elsewhere", () => {
    const r = cutOutSatin(ground, [shape(100, 100, 30, 30)], UNDERLAP);
    expect(r).toEqual({ parts: ground, coveredMm2: 0, cutMm2: 0 });
    expect(r.parts).toBe(ground);
  });

  it("cuts flush where the preset has no underlap", () => {
    const r = cutOutSatin(ground, [shape(10, 5, 20, 10)], 0);
    expect(r.cutMm2).toBeCloseTo(200, 1);
  });

  it("leaves nothing of an area that satin covers completely", () => {
    const r = cutOutSatin([polygonOf(rect(12, 6, 6, 6))], [shape(10, 4, 10, 10)], UNDERLAP);
    expect(r.parts).toEqual([]);
    expect(r.cutMm2).toBeCloseTo(36, 1);
  });

  it("hands every part when a satin bar cuts the area in two", () => {
    const r = cutOutSatin(ground, [shape(18, -5, 4, 40)], UNDERLAP);
    expect(r.parts).toHaveLength(2);
  });

  it("cuts out of every part of an area that is already in pieces", () => {
    const parts = [polygonOf(rect(0, 0, 20, 30)), polygonOf(rect(25, 0, 15, 30))];
    // 9 mm² over the left part, 12 over the right one: 21 together, over the threshold.
    const r = cutOutSatin(parts, [shape(16, 5, 3, 3), shape(26, 5, 3, 4)], UNDERLAP);
    expect(r.coveredMm2).toBeCloseTo(21, 6);
    expect(r.cutMm2).toBeCloseTo(2.6 * 2.6 + 2.6 * 3.6, 1);
    expect(r.parts).toHaveLength(2);
  });

  it("does nothing for no satin and for no area", () => {
    expect(cutOutSatin(ground, [], UNDERLAP).parts).toBe(ground);
    expect(cutOutSatin([], [shape(0, 0, 10, 10)], UNDERLAP)).toEqual({
      parts: [],
      coveredMm2: 0,
      cutMm2: 0,
    });
  });
});
