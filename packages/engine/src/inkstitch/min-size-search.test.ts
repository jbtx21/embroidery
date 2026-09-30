/**
 * The search over the size of the minimum-size gate (spec §5.2, "Tor"): the ranges of logo widths in
 * which a stroke is too narrow, the smallest whole-millimetre size outside all of them, and the
 * search that checks that size for real and goes on where the check finds more.
 *
 * Own shapes (`test/fixtures/gate.ts`), no customer logos. The scenes are read at other sizes by
 * `scaledAt`, the way `importShapes` reads the same SVG at another width.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { initGeometry } from "@texma-stitch/geometry";
import type { ImportedShape } from "../import/svg.js";
import {
  aloneScene,
  barAt,
  fadingScene,
  growScene,
  ORDERED_MM,
  scaledAt,
  shadowScene,
} from "../../test/fixtures/gate.js";
import { areaShape, polygonOf, rect } from "../../test/fixtures/shapes.js";
import { checkMinimumSize, isTooNarrow, measureShapes } from "./min-size.js";
import type { ShapeMeasure } from "./min-size.js";
import {
  findMinimumSize,
  forbiddenRanges,
  mergeRanges,
  SEARCH_MAX_FACTOR,
  SEARCH_MAX_STEPS,
  smallestWidthOutside,
} from "./min-size-search.js";
import type { ForbiddenRange } from "./min-size-search.js";

beforeAll(async () => {
  await initGeometry();
});

const LIMITS = { satinMinMm: 1.3, shadowMinMm: 0.7 };
const R = ORDERED_MM;

/** A measurement as `measureShapes` makes it, without the geometry the ranges do not read. */
const measure = (
  m: Partial<ShapeMeasure> & Pick<ShapeMeasure, "id" | "shapeClass" | "widthMm">,
): ShapeMeasure => ({
  color: "#000000",
  polygon: polygonOf(rect(0, 0, 1, 1)),
  box: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
  railGapsMm: [],
  shadowLine: false,
  hypothetical: false,
  ...m,
});

const range = (id: string, fromMm: number, toMm: number): ForbiddenRange => ({
  id,
  color: "#000000",
  fromMm,
  toMm,
  measuredMm: 1,
  atWidthMm: 80,
  limitMm: 1.3,
  kind: "too-narrow",
});

/**
 * The real check at one size, for the satin strokes: is any under its limit, the shapes read at that
 * size? The same test `checkMinimumSize` makes (one of the tests below says so), without the gaps,
 * which the loops over many sizes would pay for in every step.
 */
const passesAt = (shapes: ImportedShape[], widthMm: number): boolean =>
  measureShapes(scaledAt(shapes)(widthMm)).every((m) => !isTooNarrow(m, LIMITS));

describe("constants of the search", () => {
  it("stops after 16 checks and above 10 times the ordered size", () => {
    // Measured 30.09.2026: the customer logos need 2 to 7 checks; Eislingen 200 mm ends at 6.3 times.
    expect(SEARCH_MAX_STEPS).toBe(16);
    expect(SEARCH_MAX_FACTOR).toBe(10);
  });
});

describe("forbiddenRanges (logo widths at which a stroke is satin and too narrow)", () => {
  it("gives a satin stroke under its limit the range from now to where it is 1.3 mm wide", () => {
    const [r] = forbiddenRanges(
      [measure({ id: "a", shapeClass: "satin", widthMm: 0.9 })],
      80,
      LIMITS,
    );
    expect(r).toEqual({
      id: "a",
      color: "#000000",
      fromMm: 80,
      toMm: (80 * 1.3) / 0.9,
      measuredMm: 0.9,
      atWidthMm: 80,
      limitMm: 1.3,
      kind: "too-narrow",
    });
  });

  it("gives a running stitch the range from where it turns satin (0.7 mm) to where it is 1.3 mm wide", () => {
    const [r] = forbiddenRanges(
      [measure({ id: "h", shapeClass: "running", widthMm: 0.5 })],
      80,
      LIMITS,
    );
    expect(r!.kind).toBe("becomes-satin");
    expect(r!.fromMm).toBeCloseTo((80 * 0.7) / 0.5, 9); // 112 mm
    expect(r!.toMm).toBeCloseTo((80 * 1.3) / 0.5, 9); // 208 mm
  });

  it("gives a stroke that holds, and a wide area, none", () => {
    const held = measure({ id: "a", shapeClass: "satin", widthMm: 1.3 });
    const wide = measure({ id: "b", shapeClass: "satin", widthMm: 2.4 });
    const area = measure({ id: "c", shapeClass: "tatami", widthMm: 8 });
    const disc = measure({ id: "d", shapeClass: "tatami", widthMm: Infinity });
    expect(forbiddenRanges([held, wide, area, disc], 80, LIMITS)).toEqual([]);
  });

  it("gives a shadow line none while the gap stays open: as satin it always holds", () => {
    const shadow = measure({
      id: "s",
      shapeClass: "satin",
      widthMm: 0.8,
      railGapsMm: [0.5],
      shadowLine: true,
    });
    // At twice the size the gap is 1.0 mm: the stroke is 1.6 mm wide by then, it holds.
    expect(forbiddenRanges([shadow], 80, LIMITS)).toEqual([]);
  });

  it("lets a shadow line lose its limit where the gap reaches 1.0 mm, if it is still too narrow then", () => {
    const fading = measure({
      id: "s",
      shapeClass: "satin",
      widthMm: 0.8,
      railGapsMm: [0.9],
      shadowLine: true,
    });
    const [r] = forbiddenRanges([fading], 80, LIMITS);
    expect(r!.kind).toBe("loses-shadow");
    expect(r!.fromMm).toBeCloseTo(80 / 0.9, 9); // the gap is 1.0 mm at 88.9 mm
    expect(r!.toMm).toBeCloseTo((80 * 1.3) / 0.8, 9); // the stroke is 1.3 mm at 130 mm
    expect(r!.limitMm).toBe(1.3);
  });

  it("goes by the smallest gap of a stroke with several rails at one: the last to open decides", () => {
    const two = measure({
      id: "s",
      shapeClass: "satin",
      widthMm: 0.8,
      railGapsMm: [0.9, 0.7],
      shadowLine: true,
    });
    const [r] = forbiddenRanges([two], 80, LIMITS);
    // The rail at 0.7 mm stays a gap until 114 mm — the stroke is 1.14 mm wide then.
    expect(r!.fromMm).toBeCloseTo(80 / 0.7, 9);
    expect(r!.toMm).toBeCloseTo(130, 9);
  });

  it("reads what a running stitch would be as a shadow line: no range while the gap holds it", () => {
    const hair = measure({
      id: "h",
      shapeClass: "running",
      widthMm: 0.5,
      railGapsMm: [0.5],
      hypothetical: true,
    });
    const [r] = forbiddenRanges([hair], 80, LIMITS);
    // Satin from 112 mm, a shadow line until the gap is 1.0 mm (160 mm), too narrow until 208 mm.
    expect(r!.kind).toBe("loses-shadow");
    expect(r!.fromMm).toBeCloseTo(160, 9);
    expect(r!.toMm).toBeCloseTo(208, 9);
    // A gap of 0.8 mm opens at 100 mm — before the stroke is satin: the range is the ordinary one.
    const early = measure({ ...hair, id: "e", railGapsMm: [0.8] });
    expect(forbiddenRanges([early], 80, LIMITS)[0]!.kind).toBe("becomes-satin");
    expect(forbiddenRanges([early], 80, LIMITS)[0]!.fromMm).toBeCloseTo(112, 9);
  });

  it("holds a shadow line to the limit of a shadow line while it is one, when that limit is raised", () => {
    const fading = measure({
      id: "s",
      shapeClass: "satin",
      widthMm: 0.8,
      railGapsMm: [0.9],
      shadowLine: true,
    });
    const rs = forbiddenRanges([fading], 80, { satinMinMm: 1.3, shadowMinMm: 1.0 });
    // Too narrow for a shadow line until 1.0 mm (100 mm) — but its gap opens at 88.9 mm: the two
    // ranges, the second where it is an ordinary stroke.
    expect(rs.map((r) => r.kind)).toEqual(["too-narrow", "loses-shadow"]);
    expect(rs[0]!.toMm).toBeCloseTo(80 / 0.9, 9); // the gap opens first
    expect(rs[0]!.limitMm).toBe(1.0);
    expect(rs[1]!.fromMm).toBeCloseTo(80 / 0.9, 9);
    expect(rs[1]!.toMm).toBeCloseTo(130, 9);
  });

  it("measures from the width the measurement was made at: the numbers are logo widths, not factors", () => {
    const [r] = forbiddenRanges(
      [measure({ id: "a", shapeClass: "satin", widthMm: 0.9 })],
      119,
      LIMITS,
    );
    expect(r!.atWidthMm).toBe(119);
    expect(r!.fromMm).toBe(119);
    expect(r!.toMm).toBeCloseTo((119 * 1.3) / 0.9, 9);
  });

  it("lists the ranges by where they begin, then by id", () => {
    const rs = forbiddenRanges(
      [
        measure({ id: "z", shapeClass: "running", widthMm: 0.5 }),
        measure({ id: "b", shapeClass: "satin", widthMm: 1.0 }),
        measure({ id: "a", shapeClass: "satin", widthMm: 1.0 }),
      ],
      80,
      LIMITS,
    );
    expect(rs.map((r) => r.id)).toEqual(["a", "b", "z"]);
  });
});

describe("smallestWidthOutside (the smallest size in no range)", () => {
  it("is the end of a range that holds the size, where nothing follows", () => {
    expect(smallestWidthOutside([range("a", 80, 115.56)], 80)).toMatchObject({ widthMm: 115.56 });
    expect(smallestWidthOutside([range("a", 80, 115.56)], 80).by!.id).toBe("a");
  });

  it("rounds UP to whole millimetres, where asked: 115.56 is 116, and 116.0 stays 116", () => {
    expect(smallestWidthOutside([range("a", 80, 115.56)], 80, { whole: true }).widthMm).toBe(116);
    expect(smallestWidthOutside([range("a", 80, 116)], 80, { whole: true }).widthMm).toBe(116);
    // A hair above a whole number is that number for the float noise of the division, not a millimetre more.
    expect(smallestWidthOutside([range("a", 80, 116 + 1e-9)], 80, { whole: true }).widthMm).toBe(
      116,
    );
    expect(smallestWidthOutside([range("a", 80, 116.001)], 80, { whole: true }).widthMm).toBe(117);
  });

  it("follows a chain of overlapping ranges to its end, whatever their order", () => {
    const rs = [range("c", 140, 180), range("a", 80, 120), range("b", 110, 150)];
    const r = smallestWidthOutside(rs, 80);
    expect(r.widthMm).toBe(180);
    expect(r.by!.id).toBe("c");
  });

  it("does not jump over a gap between ranges: [80, 120) and [130, 150) leave 120 open", () => {
    const rs = [range("a", 80, 120), range("b", 130, 150)];
    expect(smallestWidthOutside(rs, 80).widthMm).toBe(120);
  });

  it("finds ranges half open: the end is outside, the start is inside", () => {
    expect(smallestWidthOutside([range("a", 100, 120)], 120).widthMm).toBe(120);
    expect(smallestWidthOutside([range("a", 100, 120)], 100).widthMm).toBe(120);
  });

  it("lands a whole-millimetre size inside the next range on the far side of it", () => {
    // 119.4 rounds up to 120, which lies in [120, 130): the next range decides.
    const rs = [range("a", 80, 119.4), range("b", 120, 130)];
    const r = smallestWidthOutside(rs, 80, { whole: true });
    expect(r.widthMm).toBe(130);
    expect(r.by!.id).toBe("b");
  });

  it("is the size itself where no range holds it, rounded up where whole millimetres are asked", () => {
    expect(smallestWidthOutside([], 80.4)).toEqual({ widthMm: 80.4 });
    expect(smallestWidthOutside([], 80.4, { whole: true })).toEqual({ widthMm: 81 });
    expect(smallestWidthOutside([range("a", 100, 120)], 80).by).toBeUndefined();
  });

  it("names, among ranges that hold the same size, the one that reaches furthest, then by id", () => {
    const rs = [range("b", 80, 130), range("a", 80, 130), range("c", 80, 100)];
    expect(smallestWidthOutside(rs, 80).by!.id).toBe("a");
  });
});

describe("mergeRanges (where a stroke is too narrow, as stretches of logo widths)", () => {
  it("joins ranges that overlap or touch, and keeps the ranges that make each stretch", () => {
    const rs = [
      range("b", 110, 130),
      range("a", 100, 120),
      range("d", 130, 135),
      range("c", 200, 210),
    ];
    const spans = mergeRanges(rs);
    expect(spans.map((s) => [s.fromMm, s.toMm])).toEqual([
      [100, 135],
      [200, 210],
    ]);
    expect(spans[0]!.ranges.map((r) => r.id)).toEqual(["a", "b", "d"]);
    expect(spans[1]!.ranges.map((r) => r.id)).toEqual(["c"]);
  });

  it("is empty for no ranges", () => {
    expect(mergeRanges([])).toEqual([]);
  });
});

describe("findMinimumSize (the smallest size from the ordered one at which the check finds nothing)", () => {
  const opts = { orderedWidthMm: R };

  it("leaves the ordered size alone where every stroke holds — not rounded", () => {
    const shapes = aloneScene(1.6);
    const r = findMinimumSize(scaledAt(shapes), opts);
    expect(r.found).toBe(true);
    expect(r.widthMm).toBe(R);
    expect(r.enlarged).toBe(false);
    expect(r.belowMinimum).toBe(false);
    expect(r.decisive).toBeUndefined();
    expect(r.steps).toEqual([{ widthMm: R, under: 0, shadowLines: 0 }]);
    // An ordered size that is no whole number stays as it is.
    const odd = findMinimumSize(scaledAt(shapes, 80.4), { orderedWidthMm: 80.4 });
    expect(odd.widthMm).toBe(80.4);
  });

  it("finds the size from which a free stroke of 0.9 mm holds, in whole millimetres, checked for real", () => {
    const shapes = aloneScene(0.9);
    const r = findMinimumSize(scaledAt(shapes), opts);
    expect(r.found).toBe(true);
    expect(r.enlarged).toBe(true);
    expect(r.belowMinimum).toBe(true);
    expect(Number.isInteger(r.widthMm)).toBe(true);
    // The real check passes there and fails one millimetre below.
    expect(passesAt(shapes, r.widthMm)).toBe(true);
    expect(passesAt(shapes, r.widthMm - 1)).toBe(false);
    // The first step is the ordered size, with its one stroke under the limit; the last is the found size.
    expect(r.steps[0]).toEqual({ widthMm: R, under: 1, shadowLines: 0 });
    expect(r.steps[r.steps.length - 1]).toEqual({
      widthMm: r.widthMm,
      under: 0,
      shadowLines: 0,
    });
    // Round numbers only above the ordered size.
    expect(r.steps.slice(1).every((s) => Number.isInteger(s.widthMm))).toBe(true);
  });

  it("names the stroke that sets it, with the width it had and where it was measured", () => {
    const r = findMinimumSize(scaledAt(aloneScene(0.9)), opts);
    const d = r.decisive!;
    expect(d.id).toBe("schatten");
    expect(d.limitMm).toBe(1.3);
    expect(d.measuredMm).toBeGreaterThan(0.85);
    expect(d.measuredMm).toBeLessThan(1.3);
    // Measured at the size of the last step before the found one; its range ends at or below the found size.
    const before = r.steps[r.steps.length - 2]!;
    expect(d.atWidthMm).toBe(before.widthMm);
    expect(Math.ceil(d.toMm - 1e-6)).toBeLessThanOrEqual(r.widthMm);
    expect(r.widthMm - d.toMm).toBeLessThan(1 + 1e-6);
  });

  it("goes on where the check at the found size finds more: the stroke measures a little less than it was read", () => {
    // The measurement of a thin bar reads high at 80 mm (0.95 for 0.9), lower when larger (0.92·k):
    // the first size the ranges give is not yet enough, and the search says how often it had to go on.
    const r = findMinimumSize(scaledAt(aloneScene(0.9)), opts);
    expect(r.steps.length).toBeGreaterThan(2);
    const widths = r.steps.map((s) => s.widthMm);
    expect(widths).toEqual([...widths].sort((a, b) => a - b));
    expect(new Set(widths).size).toBe(widths.length);
    expect(r.steps.slice(0, -1).every((s) => s.under > 0)).toBe(true);
  });

  it("finds, for a running stitch that grows into the range, the size beyond it — not the one of the stroke alone", () => {
    // The stroke of 0.85 mm alone holds from ~118 mm. At 118 mm the hairline of 0.5 mm (running at
    // 80 mm) is satin at 0.81 mm and too narrow, until it is 1.3 mm wide — at ~189 mm.
    const shapes = growScene(0.5);
    const alone = findMinimumSize(scaledAt([shapes[0]!]), opts);
    const r = findMinimumSize(scaledAt(shapes), opts);
    expect(r.found).toBe(true);
    expect(r.widthMm).toBeGreaterThan(alone.widthMm + 40);
    expect(r.decisive!.id).toBe("haar");
    expect(passesAt(shapes, r.widthMm)).toBe(true);
    expect(passesAt(shapes, r.widthMm - 1)).toBe(false);
    // The path it took: the ordered size, then the size that holds the stroke, then the one beyond.
    expect(r.steps.map((s) => s.under > 0)).toEqual(r.steps.map((_, i) => i < r.steps.length - 1));
    expect(r.steps[1]!.widthMm).toBe(alone.widthMm);
  });

  it("finds a size at which the real check fails everywhere below it — no size that holds is skipped", () => {
    const shapes = growScene(0.5);
    const r = findMinimumSize(scaledAt(shapes), opts);
    // Every second whole millimetre from the ordered size to the one below the found size (every
    // one would be the same test again for twice the time), and the last three in any case.
    const sizes = new Set<number>([r.widthMm - 1, r.widthMm - 2, r.widthMm - 3]);
    for (let n = R + 1; n < r.widthMm; n += 2) sizes.add(n);
    for (const n of [...sizes].sort((a, b) => a - b)) {
      expect(passesAt(shapes, n), `${n} mm`).toBe(false);
    }
    expect(passesAt(shapes, r.widthMm)).toBe(true);
  });

  it("leaves a shadow line alone where the stroke alone would have to grow to 113 mm", () => {
    const r = findMinimumSize(scaledAt(shadowScene(0.5)), opts);
    expect(r.found).toBe(true);
    expect(r.widthMm).toBe(R);
    expect(r.shadowLines).toEqual(["schatten"]);
    expect(findMinimumSize(scaledAt(aloneScene()), opts).widthMm).toBeGreaterThan(100);
  });

  it("counts the shadow lines in every check: a stroke that is one at the ordered size and none at the size found", () => {
    // The fading stroke (0.8 mm, gap 0.9 mm) holds at 80 mm as a shadow line. A free stroke of 0.9 mm
    // asks for more; by the size that holds it the gap is over 1.0 mm — and the stroke 1.1 mm wide.
    const shapes = [...fadingScene(), areaShape("frei", barAt(0, 30, 40, 0.9), "#000000")];
    const r = findMinimumSize(scaledAt(shapes), opts);
    expect(r.found).toBe(true);
    expect(r.steps[0]!.shadowLines).toBe(1);
    expect(r.steps[r.steps.length - 1]!.shadowLines).toBe(r.shadowLines.length);
    expect(r.shadowLines).toEqual([]);
    // The range of the shadow line that loses its gap is in the jump: one check at the ordered size, one at the end.
    expect(r.steps).toHaveLength(2);
    expect(r.widthMm).toBeGreaterThan(125);
  });

  it("does not round what passes and does not search below the ordered size", () => {
    // A stroke of 2 mm holds from far below 80 mm; the search does not go down to say so.
    const r = findMinimumSize(scaledAt(aloneScene(2)), opts);
    expect(r.widthMm).toBe(R);
    expect(r.steps).toHaveLength(1);
  });

  it("agrees with the check at the size it found: no stroke under its limit, the same shadow lines", () => {
    for (const shapes of [aloneScene(0.9), shadowScene(0.5), growScene(0.5), fadingScene()]) {
      const r = findMinimumSize(scaledAt(shapes), opts);
      const check = checkMinimumSize(scaledAt(shapes)(r.widthMm), { widthMm: r.widthMm });
      expect(check.findings.filter((f) => f.kind === "satin-stroke")).toEqual([]);
      expect(check.shadowLines).toEqual(r.shadowLines);
    }
  });

  it("names the ranges above the found size: a hairline that turns satin and is too narrow for a while", () => {
    // The stroke of 0.85 mm holds from ~118 mm. The hairline of 0.3 mm is a running stitch until
    // ~146 mm, and then satin under 1.3 mm until ~270 mm: a larger order would land there.
    const shapes = growScene(0.3);
    const r = findMinimumSize(scaledAt(shapes), opts);
    expect(r.found).toBe(true);
    expect(r.enlarged).toBe(true);
    expect(r.above).toHaveLength(1);
    const a = r.above[0]!;
    expect(a.id).toBe("haar");
    expect(a.kind).toBe("becomes-satin");
    expect(a.fromMm).toBeGreaterThan(r.widthMm);
    expect(a.atWidthMm).toBe(r.widthMm);
    // The range is where the real check fails — to within the few per cent the width reads off by.
    const inside = Math.ceil(a.fromMm * 1.04);
    const before = Math.floor(a.fromMm * 0.96);
    expect(passesAt(shapes, before)).toBe(true);
    expect(passesAt(shapes, inside)).toBe(false);
    expect(passesAt(shapes, Math.floor(a.toMm * 1.04) + 1)).toBe(true);
    expect(passesAt(shapes, Math.ceil(a.toMm * 0.96))).toBe(false);
  });

  it("names the range above the ordered size even where nothing is wrong at it: a shadow line that fades", () => {
    const shapes = fadingScene();
    const r = findMinimumSize(scaledAt(shapes), opts);
    expect(r.found).toBe(true);
    expect(r.widthMm).toBe(R);
    expect(r.shadowLines).toEqual(["schatten"]);
    expect(r.above).toHaveLength(1);
    const a = r.above[0]!;
    expect(a.kind).toBe("loses-shadow");
    // The gap of 0.9 mm is 1.0 mm at 88.9 mm; the stroke of 0.8 mm is 1.3 mm wide at about 125 mm.
    expect(a.fromMm).toBeCloseTo(R / 0.9, 1);
    expect(a.toMm).toBeGreaterThan(115);
    expect(a.toMm).toBeLessThan(135);
    expect(passesAt(shapes, 88)).toBe(true);
    expect(passesAt(shapes, 90)).toBe(false);
    expect(passesAt(shapes, 110)).toBe(false);
    expect(passesAt(shapes, Math.ceil(a.toMm * 1.04))).toBe(true);
  });

  it("sorts what lies above by where it begins", () => {
    const shapes = [...growScene(0.3), areaShape("haar2", barAt(0, 40, 40, 0.4), "#000000")];
    const r = findMinimumSize(scaledAt(shapes), opts);
    const from = r.above.map((a) => a.fromMm);
    expect(from).toEqual([...from].sort((a, b) => a - b));
    expect(r.above.map((a) => a.id).sort()).toEqual(["haar", "haar2"]);
  });

  it("says, where it gives up, that the size is none that holds: too many steps", () => {
    const r = findMinimumSize(scaledAt(aloneScene(0.9)), { ...opts, maxSteps: 1 });
    expect(r.found).toBe(false);
    expect(r.reason).toBe("steps");
    expect(r.belowMinimum).toBe(true);
    expect(r.enlarged).toBe(false);
    // The size it stopped at is the last one it checked — no size that holds.
    expect(r.widthMm).toBe(R);
  });

  it("says, where it gives up, that the size is none that holds: too far above the ordered size", () => {
    const r = findMinimumSize(scaledAt(aloneScene(0.9)), { ...opts, maxFactor: 1.2 });
    expect(r.found).toBe(false);
    expect(r.reason).toBe("factor");
    expect(r.enlarged).toBe(false);
    expect(r.belowMinimum).toBe(true);
  });

  it("gives the same result for the same input", () => {
    const shapes = growScene(0.4);
    expect(findMinimumSize(scaledAt(shapes), opts)).toEqual(
      findMinimumSize(scaledAt(shapes), opts),
    );
  });

  it("refuses an ordered width it cannot divide by", () => {
    for (const orderedWidthMm of [0, -80, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => findMinimumSize(scaledAt(aloneScene()), { orderedWidthMm })).toThrow(RangeError);
    }
    expect(() => findMinimumSize(scaledAt(aloneScene()), { ...opts, maxSteps: 0 })).toThrow(
      RangeError,
    );
    expect(() => findMinimumSize(scaledAt(aloneScene()), { ...opts, maxFactor: 0.5 })).toThrow(
      RangeError,
    );
  });

  it("reads the shapes at each size it asks for, and only at those", () => {
    const asked: number[] = [];
    const at = scaledAt(aloneScene(0.9));
    const r = findMinimumSize((w) => (asked.push(w), at(w)), opts);
    // One reading per step — the ranges above the found size are read from the shapes of the last one.
    expect(asked).toEqual(r.steps.map((s) => s.widthMm));
  });
});
