import { beforeAll, describe, expect, it } from "vitest";
import { dist, initGeometry, polygonArea } from "@texma-stitch/geometry";
import { arc, pt } from "../test/fixtures/shapes.js";
import { satinObject } from "../test/fixtures/designs.js";
import {
  applyPullComp,
  applyShortStitches,
  centerLine,
  generateSatin,
  pairRails,
  railSections,
  rungCutLength,
  satinOutline,
  CENTER_UNDERLAY_STITCH_MM,
  SATIN_MAX_WIDTH_MM,
  SATIN_MIN_WIDTH_MM,
  SATIN_RUNNING_HINT_MM,
  SHORT_STITCH_FACTOR,
  SHORT_STITCH_RADIUS_MM,
  splitWideStitches,
  zigzagSequence,
} from "./satin.js";
import type { Point } from "./types.js";

beforeAll(async () => {
  await initGeometry();
});

const railA = [pt(0, 0), pt(20, 0)];
const railB = [pt(0, 4), pt(20, 4)];

describe("pairing (spec §7.1)", () => {
  it("pairs by arc-length fraction and follows the longer side", () => {
    const pairs = pairRails(railA, railB, [], 0.4);
    expect(pairs).toHaveLength(51); // 20 / 0.4 = 50 steps
    expect(pairs[0]!.a).toEqual(pt(0, 0));
    expect(pairs[50]!.b.x).toBeCloseTo(20, 9);
  });

  it("finds where a rung crosses a rail", () => {
    expect(rungCutLength(railA, [pt(10, -1), pt(10, 1)])).toBeCloseTo(10, 9);
    // No real crossing: falls back to projecting the midpoint
    expect(rungCutLength(railA, [pt(5, -2), pt(5, -1)])).toBeCloseTo(5, 6);
  });

  it("splits into sections along the rungs", () => {
    const sections = railSections(railA, railB, [[pt(10, -1), pt(10, 5)]]);
    expect(sections).toHaveLength(2);
    expect(sections[0]!.a1).toBeCloseTo(10, 6);
  });

  it("skips a rung that would reverse the order", () => {
    // Two rungs at the same place: the second adds nothing
    const sections = railSections(railA, railB, [
      [pt(10, -1), pt(10, 5)],
      [pt(10, -1), pt(10, 5)],
    ]);
    expect(sections).toHaveLength(2);
  });

  it("pairs section by section when rungs are present", () => {
    const rungs: [Point, Point][] = [[pt(10, -1), pt(10, 5)]];
    const middle = pairRails(railA, railB, rungs, 0.4).find((p) => Math.abs(p.a.x - 10) < 1e-6);
    expect(middle).toBeDefined();
    expect(middle!.b.x).toBeCloseTo(10, 6);
  });

  it("returns nothing for a degenerate rail", () => {
    expect(pairRails([pt(0, 0)], railB, [], 0.4)).toHaveLength(0);
  });
});

describe("pull compensation (spec §7.2)", () => {
  it("shifts both rails outwards, not in the same direction", () => {
    const [a, b] = applyPullComp(railA, railB, 0.2);
    expect(a[0]!.y).toBeCloseTo(-0.2, 6);
    expect(b[0]!.y).toBeCloseTo(4.2, 6);
  });

  it("does nothing at zero", () => {
    expect(applyPullComp(railA, railB, 0)[0]).toBe(railA);
  });
});

describe("zigzag and split (spec §7.3, §7.4)", () => {
  it("produces the sequence A, B, A, B", () => {
    const seq = zigzagSequence(pairRails(railA, railB, [], 4));
    expect(seq[0]!.y).toBeCloseTo(0, 9);
    expect(seq[1]!.y).toBeCloseTo(4, 9);
    expect(seq[2]!.y).toBeCloseTo(0, 9);
  });

  it("splits crossings that are too wide", () => {
    const wide = zigzagSequence(pairRails([pt(0, 0), pt(10, 0)], [pt(0, 12), pt(10, 12)], [], 1));
    const split = splitWideStitches(wide, 7);
    expect(split.length).toBeGreaterThan(wide.length);
    for (let i = 1; i < split.length; i++)
      expect(dist(split[i - 1]!, split[i]!)).toBeLessThanOrEqual(12.1);
  });

  it("staggers the intermediate points so no line forms", () => {
    const wide = zigzagSequence(pairRails([pt(0, 0), pt(10, 0)], [pt(0, 12), pt(10, 12)], [], 1));
    const split = splitWideStitches(wide, 7);
    const inner = split
      .filter((p) => p.y > 0.5 && p.y < 11.5)
      .map((p) => Math.round(p.y * 100) / 100);
    expect(new Set(inner).size).toBeGreaterThan(1);
  });

  it("leaves narrow crossings alone", () => {
    const seq = zigzagSequence(pairRails(railA, railB, [], 1));
    expect(splitWideStitches(seq, 7)).toHaveLength(seq.length);
    expect(splitWideStitches(seq, 0)).toBe(seq);
  });
});

describe("short stitches (spec §7.5)", () => {
  it("shortens every second inner stitch in tight curves", () => {
    // Tight bend: inner rail r = 0.5 mm, outer rail r = 2.5 mm
    const pairs = pairRails(arc(0, 0, 0.5, 0, 180, 12), arc(0, 0, 2.5, 0, 180, 12), [], 0.4);
    const shortened = applyShortStitches(pairs);
    const before = pairs.map((r) => dist(r.a, r.b));
    const after = shortened.map((r) => dist(r.a, r.b));
    expect(after.filter((n, i) => n < before[i]! - 1e-9).length).toBeGreaterThan(0);
    for (let i = 0; i < after.length; i++) {
      expect(after[i]!).toBeGreaterThanOrEqual(before[i]! * SHORT_STITCH_FACTOR - 1e-6);
    }
  });

  it("leaves a straight column untouched", () => {
    const pairs = pairRails(railA, railB, [], 0.4);
    expect(applyShortStitches(pairs).map((r) => dist(r.a, r.b))).toEqual(
      pairs.map((r) => dist(r.a, r.b)),
    );
  });
});

describe("documented thresholds (spec §7)", () => {
  it("matches the numbers from the spec", () => {
    expect(SATIN_MIN_WIDTH_MM).toBe(1.0);
    expect(SATIN_RUNNING_HINT_MM).toBe(0.6);
    expect(SATIN_MAX_WIDTH_MM).toBe(12.0);
    expect(SHORT_STITCH_RADIUS_MM).toBe(1.0);
    expect(SHORT_STITCH_FACTOR).toBe(0.7);
    expect(CENTER_UNDERLAY_STITCH_MM).toBe(2.5);
  });
});

describe("generation", () => {
  it("warns about columns that are too narrow or too wide", () => {
    const narrow = generateSatin(
      satinObject("s", [pt(0, 0), pt(10, 0)], [pt(0, 0.4), pt(10, 0.4)]),
    );
    expect(narrow.warnings.map((w) => w.code)).toContain("SATIN_TOO_NARROW");
    expect(narrow.warnings[0]!.message).toMatch(/running stitch/);

    const mid = generateSatin(satinObject("s", [pt(0, 0), pt(10, 0)], [pt(0, 0.8), pt(10, 0.8)]));
    expect(mid.warnings.map((w) => w.code)).toContain("SATIN_TOO_NARROW");

    const wide = generateSatin(satinObject("s", [pt(0, 0), pt(10, 0)], [pt(0, 14), pt(10, 14)]));
    expect(wide.warnings.map((w) => w.code)).toContain("SATIN_TOO_WIDE");
  });

  it("puts the underlay before the top stitches", () => {
    const without = generateSatin(satinObject("s", railA, railB));
    const with_ = generateSatin(
      satinObject("s", railA, railB, {
        underlay: { center: true, contour: true, zigzag: true, insetMm: 0.4, zigzagSpacingMm: 3 },
      }),
    );
    expect(with_.stitches.length).toBeGreaterThan(without.stitches.length);
    const tail = with_.stitches.slice(-without.stitches.length);
    expect(tail[tail.length - 1]!.x).toBeCloseTo(
      without.stitches[without.stitches.length - 1]!.x,
      6,
    );
  });

  it("stitches the column from the other end when reversed", () => {
    const plain = generateSatin(satinObject("s", railA, railB));
    const reversed = generateSatin(satinObject("s", railA, railB, { reverse: true }));
    expect(reversed.stitches[0]!.x).toBeCloseTo(20, 6);
    expect(plain.stitches[0]!.x).toBeCloseTo(0, 6);
  });

  it("reports a missing rail instead of stitching nothing", () => {
    const r = generateSatin(satinObject("s", [pt(0, 0)], railB));
    expect(r.stitches).toHaveLength(0);
    expect(r.warnings[0]!.severity).toBe("error");
  });

  it("gives the centre line and the outline", () => {
    const pairs = pairRails(railA, railB, [], 4);
    expect(centerLine(pairs)[0]!.y).toBeCloseTo(2, 9);
    const outline = satinOutline(railA, railB);
    expect(polygonArea(outline)).toBeCloseTo(80, 6);
  });
});
