import { beforeAll, describe, expect, it } from "vitest";
import { initGeometry, polygonArea } from "@texma-stitch/geometry";
import { polygonOf, pt, rect } from "../test/fixtures/shapes.js";
import { fillObject, runningObject, satinObject } from "../test/fixtures/designs.js";
import {
  edgeGapRisks,
  KNOCKDOWN_MIN_MM2,
  KNOCKDOWN_UNDERLAP_MM,
  resolveOverlaps,
} from "./resolve-overlaps.js";
import type { FillObject } from "./types.js";

beforeAll(async () => {
  await initGeometry();
});

const areaOf = (o: unknown): number => polygonArea((o as FillObject).shape);

describe("resolveOverlaps (spec §4.1)", () => {
  it("cuts the earlier fill where the later one covers it", () => {
    // 20 x 20 below, a 10 x 10 square on top of its corner: 100 mm² covered.
    const below = fillObject("below", polygonOf(rect(0, 0, 20, 20)));
    const above = fillObject("above", polygonOf(rect(15, 15, 10, 10)));
    const r = resolveOverlaps([below, above]);
    expect(r.objects).toHaveLength(2);
    // 400 minus the 25 mm² inside, less the 0,8 mm that stays underneath.
    expect(areaOf(r.objects[0])).toBeGreaterThan(375);
    expect(areaOf(r.objects[0])).toBeLessThan(392);
    // The upper one is untouched.
    expect(areaOf(r.objects[1])).toBeCloseTo(100, 6);
  });

  it("leaves 0,8 mm of the lower fill under the upper one", () => {
    const below = fillObject("below", polygonOf(rect(0, 0, 40, 40)));
    const above = fillObject("above", polygonOf(rect(10, 10, 20, 20)));
    const r = resolveOverlaps([below, above]);
    // The hole left behind is the upper square shrunk by 0,8 mm on every side.
    const cut = 40 * 40 - areaOf(r.objects[0]);
    expect(cut).toBeCloseTo((20 - 2 * KNOCKDOWN_UNDERLAP_MM) ** 2, 0);
  });

  it("does not cut below the threshold", () => {
    // 3 x 3 mm of overlap, well under 20 mm².
    const below = fillObject("below", polygonOf(rect(0, 0, 20, 20)));
    const above = fillObject("above", polygonOf(rect(17, 17, 3, 3)));
    const r = resolveOverlaps([below, above]);
    expect(areaOf(r.objects[0])).toBeCloseTo(400, 6);
    expect(KNOCKDOWN_MIN_MM2).toBe(20);
  });

  it("cuts below the threshold on cutsBelow always", () => {
    const below = fillObject("below", polygonOf(rect(0, 0, 20, 20)));
    const above = fillObject("above", polygonOf(rect(17, 17, 3, 3)), { cutsBelow: "always" });
    expect(areaOf(resolveOverlaps([below, above]).objects[0])).toBeLessThan(400);
  });

  it("never cuts on cutsBelow never", () => {
    const below = fillObject("below", polygonOf(rect(0, 0, 20, 20)));
    const above = fillObject("above", polygonOf(rect(10, 10, 20, 20)), { cutsBelow: "never" });
    expect(areaOf(resolveOverlaps([below, above]).objects[0])).toBeCloseTo(400, 6);
  });

  it("extends the earlier fill under a neighbour it only touches", () => {
    const below = fillObject("below", polygonOf(rect(0, 0, 20, 20)));
    const above = fillObject("above", polygonOf(rect(20, 0, 20, 20)));
    const r = resolveOverlaps([below, above]);
    // 20 mm of shared edge times 0,8 mm of underlap.
    expect(areaOf(r.objects[0]) - 400).toBeCloseTo(20 * KNOCKDOWN_UNDERLAP_MM, 0);
    expect(areaOf(r.objects[1])).toBeCloseTo(400, 6);
  });

  it("leaves satin, running and text alone", () => {
    const below = fillObject("below", polygonOf(rect(0, 0, 20, 20)));
    const line = runningObject("line", [pt(0, 10), pt(20, 10)]);
    const col = satinObject("col", [pt(0, 5), pt(20, 5)], [pt(0, 8), pt(20, 8)]);
    const r = resolveOverlaps([below, line, col]);
    expect(areaOf(r.objects[0])).toBeCloseTo(400, 6);
    expect(r.objects.map((o) => o.id)).toEqual(["below", "line", "col"]);
  });

  it("reports a fill that vanishes completely", () => {
    const below = fillObject("below", polygonOf(rect(5, 5, 10, 10)));
    const above = fillObject("above", polygonOf(rect(0, 0, 20, 20)));
    const r = resolveOverlaps([below, above]);
    expect(r.objects.map((o) => o.id)).toEqual(["above"]);
    const w = r.warnings.find((x) => x.code === "FILL_COVERED")!;
    expect(w.severity).toBe("info");
  });

  it("keeps every part when a cut splits the lower fill", () => {
    // A bar cut through the middle falls into two pieces — neither is dropped.
    const below = fillObject("below", polygonOf(rect(0, 0, 40, 10)));
    const above = fillObject("above", polygonOf(rect(15, -5, 10, 20)));
    const r = resolveOverlaps([below, above]);
    const parts = r.objects.filter((o) => o.id.startsWith("below"));
    expect(parts).toHaveLength(2);
    expect(r.warnings.some((w) => w.code === "SHAPE_SPLIT")).toBe(true);
  });

  it("is deterministic", () => {
    const objs = [
      fillObject("a", polygonOf(rect(0, 0, 30, 30))),
      fillObject("b", polygonOf(rect(10, 10, 30, 30))),
      fillObject("c", polygonOf(rect(20, 20, 30, 30))),
    ];
    expect(JSON.stringify(resolveOverlaps(objs))).toBe(JSON.stringify(resolveOverlaps(objs)));
  });
});

describe("edgeGapRisks after resolveOverlaps (spec §8.1.3)", () => {
  const below = (over = {}) => fillObject("area", polygonOf(rect(0, 0, 10, 10)), over);

  it("stays quiet where the knockdown already set the underlap", () => {
    const above = fillObject("neighbour", polygonOf(rect(10.2, 0, 10, 10)));
    expect(edgeGapRisks(resolveOverlaps([below(), above]).objects)).toHaveLength(0);
  });

  it("warns for a fill pair when the upper one refuses to cut", () => {
    const above = fillObject("neighbour", polygonOf(rect(10.2, 0, 10, 10)), {
      cutsBelow: "never",
    });
    const w = edgeGapRisks(resolveOverlaps([below(), above]).objects);
    expect(w).toHaveLength(1);
    expect(w[0]!.code).toBe("EDGE_GAP_RISK");
    expect(w[0]!.message).toContain("neighbour");
  });

  it("still warns for a satin rail hugging a fill edge", () => {
    const rail = satinObject("outline", [pt(10.2, 0), pt(10.2, 10)], [pt(11.2, 0), pt(11.2, 10)]);
    const w = edgeGapRisks(resolveOverlaps([below(), rail]).objects);
    expect(w.map((x) => x.code)).toEqual(["EDGE_GAP_RISK"]);
  });

  it("stays quiet when the two are far apart", () => {
    const far = fillObject("neighbour", polygonOf(rect(40, 0, 10, 10)), { cutsBelow: "never" });
    expect(edgeGapRisks(resolveOverlaps([below(), far]).objects)).toHaveLength(0);
  });
});
