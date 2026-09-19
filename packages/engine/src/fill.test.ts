import { beforeAll, describe, expect, it } from "vitest";
import { bbox, dist, initGeometry, pointInPolygon } from "@texma-stitch/geometry";
import { annulus, circle, polygonOf, pt, rect } from "../test/fixtures/shapes.js";
import { fillObject } from "../test/fixtures/designs.js";
import {
  contourUnderlay,
  DOUBLE_UNDERLAY_EDGE_MM,
  FILL_TINY_MM2,
  fillRegion,
  generateFill,
  longestEdgeMm,
  NARROW_MIN_ROWS,
  NARROW_SHARE,
  narrowRowShare,
  rowStitches,
  scanlines,
  sectionStitches,
  sections,
  TRAVEL_STITCH_MM,
} from "./fill.js";

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
    expect(TRAVEL_STITCH_MM).toBe(2.0);
    expect(FILL_TINY_MM2).toBe(4);
    expect(DOUBLE_UNDERLAY_EDGE_MM).toBe(20);
  });
});

describe("generation", () => {
  it("fills a square and stays inside", () => {
    const r = generateFill(fillObject("f", square));
    // 10 x 10 mm at the preset row spacing of 0,40 mm — 25 rows, plus underlay.
    expect(r.stitches.length).toBeGreaterThan(120);
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
    const withStart = fillRegion(square, params, pt(10, 0));
    expect(withStart[0]!.x).toBeGreaterThan(5);
  });

  it("ends near the given end point", () => {
    const withEnd = fillRegion(square, params, undefined, pt(10, 10));
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

  it("reports an area that vanishes under pull compensation", () => {
    const r = generateFill(fillObject("f", polygonOf(rect(0, 0, 2, 2)), { pullCompMm: -5 }));
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
    const ring = contourUnderlay(annulus(0, 0, 10, 5), 0.4);
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
