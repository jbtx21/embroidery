import { beforeAll, describe, expect, it } from "vitest";
import { initGeometry } from "@texma-stitch/geometry";
import { polygonOf, pt, rect } from "../test/fixtures/shapes.js";
import { fillObject } from "../test/fixtures/designs.js";
import type { RunningObject, SatinObject } from "./types.js";
import { coverPolygon, objectStart, orderRank } from "./object.js";

beforeAll(async () => {
  await initGeometry();
});

const satin = (over: Partial<SatinObject> = {}): SatinObject => ({
  id: "s",
  type: "satin",
  threadIndex: 0,
  visible: true,
  locked: false,
  trimAfter: "auto",
  railA: [pt(0, 0), pt(30, 0)],
  railB: [pt(0, 2), pt(30, 2)],
  rungs: [],
  spacingMm: 0.4,
  maxWidthMm: 7,
  underlay: { center: true, contour: false, zigzag: false, insetMm: 0.4, zigzagSpacingMm: 2 },
  shortStitches: true,
  reverse: false,
  ...over,
});

const running = (over: Partial<RunningObject> = {}): RunningObject => ({
  id: "r",
  type: "running",
  threadIndex: 0,
  visible: true,
  locked: false,
  trimAfter: "auto",
  path: [pt(0, 0), pt(10, 0), pt(10, 10)],
  stitchLengthMm: 2,
  ...over,
});

describe("objectStart (spec §10.1)", () => {
  it("takes the bottom left of a fill", () => {
    const f = fillObject("f", polygonOf(rect(0, 0, 20, 10)), { angleDeg: 0 });
    expect(objectStart(f)).toEqual({ x: 0, y: 10 });
  });

  it("uses an explicit start point when the object carries one", () => {
    const f = fillObject("f", polygonOf(rect(0, 0, 20, 10)), { angleDeg: 0 });
    expect(objectStart({ ...f, startPoint: pt(5, 5) })).toEqual({ x: 5, y: 5 });
  });

  it("measures the corner of the UNROTATED shape — a rough estimate on purpose", () => {
    // `fillRegion` takes its corner from the shape rotated by `-angleDeg`, and
    // that corner can sit well outside the shape. Measured on 26.09.2026: using
    // it here instead took Köln 90 mm from 25 to 28 stitches/mm² and from 7 to
    // 10 needle penetrations per 0,2 mm cell. The unrotated corner is wrong in
    // theory and better in practice because it stays on the shape (§10.1).
    const shape = polygonOf(rect(0, 0, 20, 20));
    for (const angleDeg of [0, 45, -45, 90]) {
      expect(objectStart(fillObject("f", shape, { angleDeg }))).toEqual({ x: 0, y: 20 });
    }
  });

  it("starts a satin on rail A", () => {
    expect(objectStart(satin())).toEqual({ x: 0, y: 0 });
  });

  it("starts a running stitch at the first point", () => {
    expect(objectStart(running())).toEqual({ x: 0, y: 0 });
  });
});

describe("coverPolygon and orderRank", () => {
  it("covers a fill with its shape and a satin with its outline", () => {
    const f = fillObject("f", polygonOf(rect(0, 0, 20, 10)));
    expect(coverPolygon(f)).toEqual(f.shape);
    expect(coverPolygon(satin())).toBeDefined();
  });

  it("covers nothing with a running stitch", () => {
    expect(coverPolygon(running())).toBeUndefined();
  });

  it("puts areas before details before outlines", () => {
    const f = fillObject("f", polygonOf(rect(0, 0, 20, 10)));
    expect(orderRank(f)).toBeLessThan(orderRank(satin()));
    expect(orderRank(satin())).toBeLessThan(orderRank(running()));
  });
});
