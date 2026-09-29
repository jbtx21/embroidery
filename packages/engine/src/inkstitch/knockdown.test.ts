import { beforeAll, describe, expect, it } from "vitest";
import { initGeometry, polygonArea, pointInPolygon } from "@texma-stitch/geometry";
import { polygonOf, pt, rect } from "../../test/fixtures/shapes.js";
import { KNOCKDOWN_MIN_MM2, KNOCKDOWN_UNDERLAP_MM } from "../resolve-overlaps.js";
import { knockdownAreas } from "./knockdown.js";
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
