import { beforeAll, describe, expect, it } from "vitest";
import type { Point, Polygon } from "@texma-stitch/geometry";
import {
  bbox,
  dist,
  initGeometry,
  offset,
  pointInPolygon,
  polygonArea,
  segmentInside,
} from "@texma-stitch/geometry";
import {
  annulus,
  circle,
  hourglass,
  polygonOf,
  pt,
  rect,
  uShape,
} from "../test/fixtures/shapes.js";
import { fillObject } from "../test/fixtures/designs.js";
import {
  CONTOUR_MIN_WIDTH_MM,
  contourUnderlay,
  DOUBLE_UNDERLAY_EDGE_MM,
  FILL_TINY_MM2,
  fillRegion,
  generateFill,
  keepWide,
  longestEdgeMm,
  NARROW_MIN_ROWS,
  NARROW_SHARE,
  narrowRowShare,
  rowStitches,
  scanlines,
  sectionStitches,
  sections,
  TRAVEL_STITCH_MM,
  travelStitches,
} from "./fill.js";
import type { TravelPath } from "./fill.js";

beforeAll(async () => {
  await initGeometry();
});

const square = polygonOf(rect(0, 0, 10, 10));
const params = { angleDeg: 0, rowSpacingMm: 0.25, stitchLengthMm: 3, staggerRows: 4 };

describe("scanlines (spec §8.2)", () => {
  it("puts the rows on a fixed grid, bottom to top", () => {
    const rows = scanlines(square, 0.25);
    expect(rows.length).toBeGreaterThan(35);
    expect(rows.length).toBeLessThan(42);
    expect(rows[0]![0]!.y).toBeGreaterThan(rows[rows.length - 1]![0]!.y);
    // Absolute grid: every row sits on a multiple of the spacing
    for (const row of rows) expect(Math.abs((row[0]!.y / 0.25) % 1)).toBeLessThan(1e-9);
  });

  it("returns nothing for an empty shape", () => {
    expect(scanlines(polygonOf([pt(0, 0), pt(0, 0), pt(0, 0)]), 0.25)).toHaveLength(0);
  });
});

describe("sections (spec §8.3)", () => {
  it("sees a ring as at least one section per side", () => {
    expect(sections(scanlines(annulus(0, 0, 10, 5), 0.5)).length).toBeGreaterThanOrEqual(2);
  });

  it("keeps a rectangle as a single section", () => {
    expect(sections(scanlines(square, 1))).toHaveLength(1);
  });
});

describe("row stitches (spec §8.4)", () => {
  it("puts the first and last stitch of a row on the outline", () => {
    const p = rowStitches({ row: 4, y: 1, x0: 0, x1: 10, idx: 0 }, params, true);
    expect(p[0]!.x).toBeCloseTo(0, 9);
    expect(p[p.length - 1]!.x).toBeCloseTo(10, 9);
  });

  it("staggers the stitch against the fixed grid", () => {
    const p = { ...params, stitchLengthMm: 4 };
    const a = rowStitches({ row: 0, y: 0, x0: 0, x1: 12, idx: 0 }, p, true);
    const b = rowStitches({ row: 1, y: 0, x0: 0, x1: 12, idx: 0 }, p, true);
    expect(a.map((q) => q.x)).not.toEqual(b.map((q) => q.x));
    expect(b[1]!.x).toBeCloseTo(1, 6); // (0 + 1/4) * 4
  });

  it("keeps the stagger stable for negative row indices", () => {
    const p = { ...params, stitchLengthMm: 4 };
    const a = rowStitches({ row: -3, y: 0, x0: 0, x1: 12, idx: 0 }, p, true);
    const b = rowStitches({ row: 1, y: 0, x0: 0, x1: 12, idx: 0 }, p, true);
    expect(a.map((q) => q.x)).toEqual(b.map((q) => q.x));
  });

  it("reverses the direction for the serpentine", () => {
    const a = rowStitches({ row: 0, y: 0, x0: 0, x1: 10, idx: 0 }, params, true);
    const b = rowStitches({ row: 0, y: 0, x0: 0, x1: 10, idx: 0 }, params, false);
    expect(b.map((q) => q.x)).toEqual([...a.map((q) => q.x)].reverse());
  });
});

describe("section stitches (spec §8.4)", () => {
  it("serpentines row by row, alternating direction", () => {
    const section = sections(scanlines(square, 2))[0]!;
    const stitches = sectionStitches(section, params, {
      point: { x: 0, y: 10 },
      fromBottom: true,
      rightward: true,
    });
    expect(stitches.length).toBeGreaterThan(4);
    // First row left to right, second row back again
    expect(stitches[1]!.x).toBeGreaterThan(stitches[0]!.x);
    const rowOne = stitches.filter((p) => Math.abs(p.y - stitches[0]!.y) < 1e-9);
    const after = stitches[rowOne.length]!;
    expect(after.y).not.toBeCloseTo(stitches[0]!.y, 6);
  });

  it("enters from the top when asked", () => {
    const section = sections(scanlines(square, 2))[0]!;
    const fromTop = sectionStitches(section, params, {
      point: { x: 0, y: 0 },
      fromBottom: false,
      rightward: true,
    });
    const fromBottom = sectionStitches(section, params, {
      point: { x: 0, y: 10 },
      fromBottom: true,
      rightward: true,
    });
    expect(fromTop[0]!.y).toBeLessThan(fromBottom[0]!.y);
  });
});

describe("documented values (spec §8, §11)", () => {
  it("matches the numbers from the spec", () => {
    expect(TRAVEL_STITCH_MM).toBe(3.0);
    expect(FILL_TINY_MM2).toBe(4);
    expect(DOUBLE_UNDERLAY_EDGE_MM).toBe(20);
  });
});

describe("generation", () => {
  it("fills a square and stays inside", () => {
    const r = generateFill(fillObject("f", square));
    // 10 x 10 mm at the preset row spacing of 0,40 mm and a stitch length of
    // 4,0 mm — 25 rows, plus underlay. Was > 120 until 21.09.2026, when the
    // stitch length went from 3,0 to 4,0 (§14).
    expect(r.stitches.length).toBeGreaterThan(90);
    const b = bbox(r.stitches);
    expect(b.minX).toBeGreaterThanOrEqual(-1e-6);
    expect(b.maxX).toBeLessThanOrEqual(10 + 1e-6);
    expect(b.minY).toBeGreaterThanOrEqual(-1e-6);
    expect(b.maxY).toBeLessThanOrEqual(10 + 1e-6);
  });

  it("turns the stitch direction with the angle", () => {
    const directionDeg = (stitches: { x: number; y: number }[]): number => {
      for (let i = 1; i < stitches.length; i++) {
        if (dist(stitches[i - 1]!, stitches[i]!) > 1) {
          const a =
            (Math.atan2(stitches[i]!.y - stitches[i - 1]!.y, stitches[i]!.x - stitches[i - 1]!.x) *
              180) /
            Math.PI;
          return ((a % 180) + 180) % 180;
        }
      }
      return Number.NaN;
    };
    expect(
      directionDeg(generateFill(fillObject("f", square, { angleDeg: 0 })).stitches),
    ).toBeCloseTo(0, 3);
    expect(
      directionDeg(generateFill(fillObject("f", square, { angleDeg: 45 })).stitches),
    ).toBeCloseTo(45, 3);
    expect(
      directionDeg(generateFill(fillObject("f", square, { angleDeg: 90 })).stitches),
    ).toBeCloseTo(90, 3);
  });

  it("travels inside the shape and does not jump", () => {
    const ring = annulus(0, 0, 10, 6);
    const r = generateFill(fillObject("f", ring, { rowSpacingMm: 1 }));
    const outside = r.stitches.filter((p) => !pointInPolygon(ring, p)).length;
    // Only outline points may sit exactly on the boundary
    expect(outside / r.stitches.length).toBeLessThan(0.35);
  });

  it("starts near the given start point", () => {
    const withStart = fillRegion(square, params, pt(10, 0)).points;
    expect(withStart[0]!.x).toBeGreaterThan(5);
  });

  it("ends near the given end point", () => {
    const withEnd = fillRegion(square, params, undefined, pt(10, 10)).points;
    const last = withEnd[withEnd.length - 1]!;
    expect(dist(last, pt(10, 10))).toBeLessThan(2);
  });

  it("warns about tiny areas", () => {
    expect(
      generateFill(fillObject("f", polygonOf(rect(0, 0, 1.5, 1.5)))).warnings.map((w) => w.code),
    ).toContain("FILL_TINY");
  });

  it("warns about an area that is large but everywhere too narrow", () => {
    // 0,6 x 40 mm = 24 mm², well past FILL_TINY. The rows run along x, so each
    // one is 0,6 mm long — a needle stab, not a stitch.
    const sliver = polygonOf(rect(0, 0, 0.6, 40));
    const codes = generateFill(fillObject("f", sliver, { pullCompMm: 0 })).warnings.map(
      (w) => w.code,
    );
    expect(codes).toContain("FILL_TOO_NARROW");
    expect(codes).not.toContain("FILL_TINY");
  });

  it("leaves a normal area alone", () => {
    const codes = generateFill(fillObject("f", square)).warnings.map((w) => w.code);
    expect(codes).not.toContain("FILL_TOO_NARROW");
  });

  it("leaves the narrow warning to FILL_TINY below 4 mm²", () => {
    const codes = generateFill(
      fillObject("f", polygonOf(rect(0, 0, 0.5, 5)), { pullCompMm: 0 }),
    ).warnings.map((w) => w.code);
    expect(codes).toContain("FILL_TINY");
    expect(codes).not.toContain("FILL_TOO_NARROW");
  });

  it("never leaves a stitch longer than 1,5 x the stitch length (spec §8.7)", () => {
    // The phases — contour underlay, grid underlay, top stitching, and several
    // parts — used to be strung together with nothing in between, so the move
    // from one to the next became a single stitch of any length.
    const shapes = [
      polygonOf(rect(0, 0, 40, 30)),
      annulus(0, 0, 20, 12),
      polygonOf(circle(0, 0, 25)),
    ];
    for (const shape of shapes) {
      for (const underlay of [
        { contour: true, fill: "single" as const, spacingMm: 2, insetMm: 0.4 },
        { contour: true, fill: "double" as const, spacingMm: 2, insetMm: 0.4 },
      ]) {
        const obj = fillObject("f", shape, { underlay });
        const r = generateFill(obj);
        const limit = 1.5 * obj.stitchLengthMm;
        let worst = 0;
        for (let i = 1; i < r.stitches.length; i++) {
          worst = Math.max(worst, dist(r.stitches[i - 1]!, r.stitches[i]!));
        }
        expect(worst).toBeLessThanOrEqual(limit);
      }
    }
  });

  it("walks from phase to phase inside the shape", () => {
    const ring = annulus(0, 0, 20, 12);
    const r = generateFill(
      fillObject("f", ring, {
        underlay: { contour: true, fill: "single", spacingMm: 2, insetMm: 0.4 },
      }),
    );
    // The travel is a running stitch inside the shape, so almost every point
    // lies in it — only the outline itself sits exactly on the boundary.
    const outside = r.stitches.filter((p) => !pointInPolygon(ring, p)).length;
    expect(outside / r.stitches.length).toBeLessThan(0.35);
  });

  it("pulls along the thread direction and pushes across it (spec §8.1.1)", () => {
    const wide = generateFill(
      fillObject("f", square, { pullCompMm: 0.5, pushCompMm: 0, angleDeg: 0 }),
    );
    const both = generateFill(
      fillObject("f", square, { pullCompMm: 0.5, pushCompMm: 0.4, angleDeg: 0 }),
    );
    const bw = bbox(wide.stitches);
    const bb = bbox(both.stitches);
    // Rows run along x at angle 0: pull widens x, push narrows y.
    expect(bw.maxX - bw.minX).toBeCloseTo(bb.maxX - bb.minX, 0);
    expect(bb.maxY - bb.minY).toBeLessThan(bw.maxY - bw.minY - 0.5);
  });

  it("lays the underlap outside the outline (spec §8.1.2)", () => {
    const plain = generateFill(fillObject("f", square));
    const lapped = generateFill(fillObject("f", square, { underlapMm: 0.6 }));
    const bp = bbox(plain.stitches);
    const bl = bbox(lapped.stitches);
    expect(bl.maxX - bl.minX).toBeGreaterThan(bp.maxX - bp.minX + 0.8);
    expect(bl.maxY - bl.minY).toBeGreaterThan(bp.maxY - bp.minY + 0.8);
  });

  it("stitches without compensation rather than losing the area (spec §8.1.1)", () => {
    // A 0,3 mm sliver disappears under a 0,2 mm push, but it is still part of
    // the design — it gets stitched, and the warning says why.
    const r = generateFill(
      fillObject("f", polygonOf(rect(0, 0, 20, 0.3)), { pushCompMm: 0.2, pullCompMm: 0 }),
    );
    expect(r.stitches.length).toBeGreaterThan(0);
    expect(r.warnings.find((w) => w.code === "INVALID_GEOMETRY")?.severity).toBe("warn");
  });

  it("reports an area that vanishes under the underlap", () => {
    const r = generateFill(
      fillObject("f", polygonOf(rect(0, 0, 2, 2)), { pullCompMm: 0, underlapMm: -5 }),
    );
    expect(r.stitches).toHaveLength(0);
    expect(r.warnings.find((w) => w.code === "INVALID_GEOMETRY")?.severity).toBe("error");
  });

  it("puts the underlay under the top stitches", () => {
    const without = generateFill(fillObject("f", square));
    const withUnderlay = generateFill(
      fillObject("f", square, {
        underlay: { contour: true, fill: "single", spacingMm: 2, insetMm: 0.4 },
      }),
    );
    expect(withUnderlay.stitches.length).toBeGreaterThan(without.stitches.length);
  });

  it("lays the double underlay at plus and minus 45 degrees", () => {
    const single = generateFill(
      fillObject("f", square, {
        underlay: { contour: false, fill: "single", spacingMm: 2, insetMm: 0.4 },
      }),
    );
    const double = generateFill(
      fillObject("f", square, {
        underlay: { contour: false, fill: "double", spacingMm: 2, insetMm: 0.4 },
      }),
    );
    expect(double.stitches.length).toBeGreaterThan(single.stitches.length);
  });

  it("runs the contour underlay around every ring", () => {
    const ring = contourUnderlay(annulus(0, 0, 10, 5), 0.4).points;
    expect(ring.length).toBeGreaterThan(20);
  });

  it("measures the longest edge for the underlay decision", () => {
    expect(longestEdgeMm(polygonOf(rect(0, 0, 30, 10)))).toBeCloseTo(30, 9);
  });
});

describe("narrowRowShare (spec §11)", () => {
  it("counts no short pieces in a wide shape", () => {
    const r = narrowRowShare(scanlines(square, 0.4));
    expect(r.pieces).toBeGreaterThan(NARROW_MIN_ROWS);
    // Only the very top and bottom rows are short on a square: none, in fact.
    expect(r.share).toBeLessThan(NARROW_SHARE);
  });

  it("counts every piece of a sliver as short", () => {
    const r = narrowRowShare(scanlines(polygonOf(rect(0, 0, 0.6, 20)), 0.4));
    expect(r.share).toBe(1);
  });

  it("leaves a circle alone — only its caps are short, and barely", () => {
    // A chord under 1 mm sits within 0,013 mm of the pole; at a 0,4 mm grid
    // hardly any row lands there. A round shape must never be flagged.
    const r = narrowRowShare(scanlines(polygonOf(circle(0, 0, 10)), 0.4));
    expect(r.share).toBeLessThan(NARROW_SHARE);
    expect(r.pieces).toBeGreaterThan(40);
  });

  it("returns zero for a shape without rows", () => {
    expect(narrowRowShare([])).toEqual({ pieces: 0, share: 0 });
  });
});

describe("travel stays inside the shape (spec §8.7, 21.09.2026)", () => {
  /**
   * Every running segment of a fill has to lie inside the shape. Tolerance is
   * 0,1 mm — compensation and underlap widen the stitched area, and a point on
   * the outline is inside as far as this test is concerned. Segments that the
   * fill itself marked as jumps are not running stitches and are skipped.
   */
  const outsideRuns = (
    shape: Polygon,
    points: Point[],
    jumpAt: number[],
    tolMm = 0.1,
  ): number[] => {
    const area = offset(shape, tolMm);
    const jumps = new Set(jumpAt);
    const out: number[] = [];
    for (let i = 1; i < points.length; i++) {
      if (jumps.has(i)) continue;
      const a = points[i - 1]!;
      const b = points[i]!;
      if (dist(a, b) < 1e-9) continue;
      if (!area.some((p) => segmentInside(p, a, b))) out.push(i);
    }
    return out;
  };

  it("reports a jump when there is no way inside", () => {
    const t = travelStitches(square, pt(5, 5), pt(40, 5));
    expect(t.jump).toBe(true);
    expect(t.points).toHaveLength(0);
  });

  it("stitches the way when it lies inside", () => {
    const t = travelStitches(square, pt(1, 1), pt(9, 9));
    expect(t.jump).toBe(false);
    expect(t.points.length).toBeGreaterThan(1);
  });

  it("keeps every running segment of a ring inside the shape", () => {
    const ring = annulus(0, 0, 12, 6);
    const r = generateFill(
      fillObject("f", ring, {
        rowSpacingMm: 0.6,
        underlay: { contour: true, fill: "single", spacingMm: 2, insetMm: 0.4 },
      }),
    );
    expect(outsideRuns(ring, r.stitches, r.jumpAt)).toEqual([]);
  });

  it("keeps every running segment inside a shape whose underlay falls apart", () => {
    // The 0,4 mm inset cuts the 0,6 mm waist: the underlay is two pieces, the
    // shape itself is one — so the way between them exists and must be used.
    const shape = hourglass(0.6);
    const r = generateFill(
      fillObject("f", shape, {
        rowSpacingMm: 0.6,
        underlay: { contour: true, fill: "single", spacingMm: 2, insetMm: 0.4 },
      }),
    );
    expect(outsideRuns(shape, r.stitches, r.jumpAt)).toEqual([]);
  });

  it("jumps and says so when the area falls into two parts", () => {
    // The push compensation of 0,4 mm eats the 0,6 mm waist from both sides.
    const shape = hourglass(0.6);
    const r = generateFill(
      fillObject("f", shape, { rowSpacingMm: 0.6, pushCompMm: 0.4, angleDeg: 90 }),
    );
    expect(r.jumpAt.length).toBeGreaterThan(0);
    const w = r.warnings.find((x) => x.code === "TRAVEL_OUTSIDE");
    expect(w).toBeDefined();
    expect(w!.objectId).toBe("f");
    expect(outsideRuns(shape, r.stitches, r.jumpAt, 0.5)).toEqual([]);
  });
});

describe("travel paths spread their stitches (spec §8.7, 26.09.2026)", () => {
  /**
   * Several travel paths through one gap used to get the SAME corner node from
   * the visibility graph, and a node is a stitch. Measured on STUTTGART 80 mm:
   * 18 needle penetrations on one point, 0,00 mm apart, out of a single fill.
   * A needle is 0,7 mm across — that is the same hole 18 times (spec §11).
   */
  const u = uShape();
  const GAP_PATHS = 8;
  // The slot leaves one 4 mm gap at the bottom, so all eight have to pass it.
  const gapWays = (): TravelPath[] =>
    Array.from({ length: GAP_PATHS }, (_, k) => travelStitches(u, pt(2, 1 + k * 0.5), pt(18, 2)));
  /** Penetrations per 0,2 mm cell across all paths — the metric of §11. */
  const perCell = (paths: { points: Point[] }[]): number => {
    const cells = new Map<string, number>();
    for (const p of paths) {
      for (const s of p.points) {
        const k = `${Math.round(s.x / 0.2)}:${Math.round(s.y / 0.2)}`;
        cells.set(k, (cells.get(k) ?? 0) + 1);
      }
    }
    return Math.max(...cells.values());
  };

  it("finds a way inside for each of them", () => {
    for (const w of gapWays()) {
      expect(w.jump).toBe(false);
      expect(w.points.length).toBeGreaterThan(1);
    }
  });

  it("does not stack the paths in one needle hole", () => {
    expect(perCell(gapWays())).toBeLessThanOrEqual(3);
  });

  it("keeps every stitch inside the shape", () => {
    const area = offset(u, 0.1);
    for (const w of gapWays()) {
      for (const s of w.points) expect(area.some((p) => pointInPolygon(p, s))).toBe(true);
    }
  });

  it("holds the travel stitch length", () => {
    for (const w of gapWays()) {
      const pts = w.points;
      for (let i = 1; i < pts.length; i++) {
        expect(dist(pts[i - 1]!, pts[i]!)).toBeLessThanOrEqual(TRAVEL_STITCH_MM + 1e-6);
      }
    }
  });

  it("gives the same answer twice (rule 3)", () => {
    const again = travelStitches(u, pt(2, 1), pt(18, 2));
    expect(again.points).toEqual(gapWays()[0]!.points);
  });
});

describe("the contour underlay leaves the splinters alone (spec §8.6, 26.09.2026)", () => {
  /**
   * The inset outline of a shape cut up by a knockdown falls into splinters: on
   * STUTTGART 80 mm the grey shield gave 50 rings, 54 of its 661 mm² in bands
   * narrower than a needle. Both edges of such a band are the same needle track
   * — measured 15 penetrations in one 0,2 mm cell, from the contour underlay
   * alone (spec §11).
   */
  it("drops a band narrower than the needle", () => {
    expect(keepWide([polygonOf(rect(0, 0, 20, 0.6))], CONTOUR_MIN_WIDTH_MM)).toEqual([]);
  });

  it("keeps a part that has room for it", () => {
    const kept = keepWide([polygonOf(rect(0, 0, 20, 10))], CONTOUR_MIN_WIDTH_MM);
    expect(kept).toHaveLength(1);
    expect(polygonArea(kept[0]!)).toBeGreaterThan(20 * 10 * 0.9);
  });

  it("stitches nothing where the inset outline is a splinter", () => {
    // 0,6 mm web: inset by 0,4 mm there is nothing left worth an underlay.
    const web = polygonOf(rect(0, 0, 20, 1.4));
    expect(contourUnderlay(web, 0.4, 2.5).points).toHaveLength(0);
  });

  it("still stitches the outline of a proper area", () => {
    const u = contourUnderlay(polygonOf(rect(0, 0, 20, 10)), 0.4, 2.5);
    expect(u.points.length).toBeGreaterThan(10);
  });
});
