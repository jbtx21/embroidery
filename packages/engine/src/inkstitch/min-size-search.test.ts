/**
 * The search over the size of the minimum-size gate (spec §5.2, "Tor", 01.10.2026): the smallest
 * whole-millimetre size from the ordered one upwards in which every satin stroke of the ORDERED size
 * holds the limit it has there — from which every size up to the first the proportion found holds.
 * The set of strokes (and which of them are shadow lines) is read once, in the ordered size, and
 * kept; a form that only turns satin as the logo grows does not set the size, it is a check point
 * (`checkMinimumSize` with `ordered`, `min-size.test.ts`).
 *
 * Own shapes (`test/fixtures/gate.ts`), no customer logos. The scenes are read at other sizes by
 * `scaledAt`, the way `importShapes` reads the same SVG at another width.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { initGeometry } from "@texma-stitch/geometry";
import type { ImportedShape } from "../import/svg.js";
import { medianShapeWidthMm } from "../import/svg.js";
import {
  aloneScene,
  barAt,
  fadingScene,
  frozenScene,
  growScene,
  jumpScene,
  ORDERED_MM,
  reachScene,
  scaledAt,
  shadowScene,
} from "../../test/fixtures/gate.js";
import { areaShape } from "../../test/fixtures/shapes.js";
import { checkMinimumSize, measureShapes } from "./min-size.js";
import { findMinimumSize, SEARCH_MAX_FACTOR, SEARCH_MAX_STEPS } from "./min-size-search.js";

beforeAll(async () => {
  await initGeometry();
});

const R = ORDERED_MM;

/**
 * Does every stroke of the list hold its limit at one size, the shapes read at that size? Independent
 * of the search: the median width of the shape of that id, against the limit it is given here.
 */
const holdsAt = (
  shapes: ImportedShape[],
  widthMm: number,
  limits: Record<string, number>,
): boolean =>
  scaledAt(shapes)(widthMm).every(
    (s) =>
      s.kind !== "area" ||
      limits[s.id] === undefined ||
      medianShapeWidthMm(s.polygon) >= limits[s.id]!,
  );

describe("constants of the search", () => {
  it("stops after 16 checks and above 10 times the ordered size", () => {
    // With the strokes of the ordered size alone a size above ~1.5 times it is not to be expected
    // (a satin stroke is 0.7 mm at least, its limit 1.0 mm): the two are safety nets.
    expect(SEARCH_MAX_STEPS).toBe(16);
    expect(SEARCH_MAX_FACTOR).toBe(10);
  });
});

describe("findMinimumSize (the smallest size from the ordered one in which every stroke of the ordered size holds)", () => {
  const opts = { orderedWidthMm: R };

  it("leaves the ordered size alone where every stroke holds — not rounded", () => {
    const shapes = aloneScene(1.6);
    const r = findMinimumSize(scaledAt(shapes), opts);
    expect(r.found).toBe(true);
    expect(r.widthMm).toBe(R);
    expect(r.maxWidthMm).toBe(R * SEARCH_MAX_FACTOR);
    expect(r.enlarged).toBe(false);
    expect(r.belowMinimum).toBe(false);
    expect(r.decisive).toBeUndefined();
    expect(r.steps).toEqual([{ widthMm: R, under: 0 }]);
    expect(r.limits).toEqual({ satinMinMm: 1.0, shadowMinMm: 0.7 });
    // An ordered size that is no whole number stays as it is.
    const odd = findMinimumSize(scaledAt(shapes, 80.4), { orderedWidthMm: 80.4 });
    expect(odd.widthMm).toBe(80.4);
  });

  it("finds the size from which a free stroke of 0.9 mm holds 1.0 mm, in whole millimetres, checked in that size", () => {
    const shapes = aloneScene(0.9);
    const r = findMinimumSize(scaledAt(shapes), opts);
    expect(r.found).toBe(true);
    expect(r.enlarged).toBe(true);
    expect(r.belowMinimum).toBe(true);
    expect(Number.isInteger(r.widthMm)).toBe(true);
    // The real measurement holds there — and one millimetre below it does not.
    expect(holdsAt(shapes, r.widthMm, { schatten: 1.0 })).toBe(true);
    expect(holdsAt(shapes, r.widthMm - 1, { schatten: 1.0 })).toBe(false);
    // The first step is the ordered size, with its one stroke under the limit; the last is the first
    // size that held — the size found, where (as for a smooth bar) no size below it does.
    expect(r.steps[0]).toEqual({ widthMm: R, under: 1 });
    expect(r.steps[r.steps.length - 1]).toEqual({ widthMm: r.widthMm, under: 0 });
    // Round numbers only above the ordered size.
    expect(r.steps.slice(1).every((s) => Number.isInteger(s.widthMm))).toBe(true);
  });

  it("names the stroke that sets it: its width in the ordered size, its limit, and where it was measured last", () => {
    const r = findMinimumSize(scaledAt(aloneScene(0.9)), opts);
    const d = r.decisive!;
    expect(d.id).toBe("schatten");
    expect(d.color).toBe("#d1b35a");
    expect(d.limitMm).toBe(1.0);
    expect(d.shadowLine).toBe(false);
    // The width it has in the ordered size is the one the set was made from.
    const stroke = aloneScene(0.9)[0]!;
    if (stroke.kind !== "area") throw new Error("area expected");
    expect(d.orderedMm).toBeCloseTo(medianShapeWidthMm(stroke.polygon), 9);
    expect(d.orderedMm).toBe(r.ordered[0]!.widthMm);
    // The check just below the size found — a millimetre under it, the one that fails — the width the
    // stroke had there, and where it holds by proportion.
    expect(d.atWidthMm).toBe(r.widthMm - 1);
    expect(d.measuredMm).toBeGreaterThan(0.9);
    expect(d.measuredMm).toBeLessThan(1.0);
    expect(d.toMm).toBeCloseTo((d.atWidthMm * 1.0) / d.measuredMm, 9);
    expect(Math.ceil(d.toMm - 1e-6)).toBeLessThanOrEqual(r.widthMm);
    expect(r.widthMm - d.toMm).toBeLessThan(1 + 1e-6);
  });

  it("goes on where the stroke measures less than it was read: a thin bar grows slower than the size", () => {
    // The measurement of a thin bar reads high at 80 mm and less so when it is larger: by proportion
    // the first size is not yet enough, and the search says how often it had to go on.
    const r = findMinimumSize(scaledAt(aloneScene(0.9)), opts);
    expect(r.steps.length).toBeGreaterThan(2);
    const widths = r.steps.map((s) => s.widthMm);
    expect(widths).toEqual([...widths].sort((a, b) => a - b));
    expect(new Set(widths).size).toBe(widths.length);
    expect(r.steps.slice(0, -1).every((s) => s.under > 0)).toBe(true);
  });

  it("counts the satin strokes of the ordered size, each with the limit it has there", () => {
    const shapes = [
      ...shadowScene(0.5), // a shadow line of 0.9 mm and a letter stroke of 3 mm
      areaShape("haar", barAt(0, 20, 40, 0.5), "#bebebe"), // a running stitch at 80 mm
      areaShape("platte", barAt(0, 30, 8, 8), "#000000"), // an area: tatami
    ];
    const r = findMinimumSize(scaledAt(shapes), opts);
    expect(r.ordered.map((o) => o.id)).toEqual(["schatten", "buchstabe"]);
    const [schatten, buchstabe] = r.ordered as [
      (typeof r.ordered)[number],
      (typeof r.ordered)[number],
    ];
    expect(schatten).toMatchObject({ color: "#d1b35a", shadowLine: true, limitMm: 0.7 });
    expect(buchstabe).toMatchObject({ color: "#c8102e", shadowLine: false, limitMm: 1.0 });
    expect(schatten.widthMm).toBeGreaterThan(0.9);
    expect(r.shadowLines).toEqual(["schatten"]);
    // Nothing is too narrow: the shadow line holds 0.7 mm, the letter is 3 mm.
    expect(r.widthMm).toBe(R);
    expect(r.steps).toEqual([{ widthMm: R, under: 0 }]);
  });

  it("lets a hairline that is a running stitch in the ordered size alone: it does not set the size", () => {
    // The stroke of 0.85 mm is too narrow at 80 mm and sets the size. The hairline of 0.6 mm is a
    // running stitch at 80 mm, turns satin as the logo grows and is narrower than 1.0 mm for a long
    // while: with the classification of every size tried it would have driven the size up (30.09.2026:
    // STUTTGART 80 mm → 252 mm, Köln 90 mm → 567 mm). Now it is a check point, not a driver.
    const shapes = growScene(0.6);
    const alone = findMinimumSize(scaledAt([shapes[0]!]), opts);
    const r = findMinimumSize(scaledAt(shapes), opts);
    expect(r.found).toBe(true);
    expect(r.widthMm).toBe(alone.widthMm);
    expect(r.widthMm).toBeGreaterThan(R);
    expect(r.ordered.map((o) => o.id)).toEqual(["strich"]);
    expect(r.decisive!.id).toBe("strich");
    // In the size found the hairline is satin, and narrower than the limit — and found nothing to fail.
    const haar = measureShapes(scaledAt(shapes)(r.widthMm)).find((m) => m.id === "haar")!;
    expect(haar.shapeClass).toBe("satin");
    expect(haar.widthMm).toBeLessThan(1.0);
    expect(r.steps.every((s) => s.under <= 1)).toBe(true);
  });

  it("is monotone: from the size found on, no larger size lets a stroke of the set fall under again", () => {
    for (const shapes of [
      aloneScene(0.9),
      growScene(0.6),
      frozenScene(),
      jumpScene(),
      reachScene(),
    ]) {
      const r = findMinimumSize(scaledAt(shapes), opts);
      const limits = Object.fromEntries(r.ordered.map((o) => [o.id, o.limitMm]));
      for (let w = r.widthMm; w <= r.widthMm + 60; w += 4) {
        expect(holdsAt(shapes, w, limits), `${w} mm`).toBe(true);
      }
    }
  });

  it("finds no size that holds below the one found, as far as the sizes in between show", () => {
    const shapes = growScene(0.6);
    const r = findMinimumSize(scaledAt(shapes), opts);
    const limits = Object.fromEntries(r.ordered.map((o) => [o.id, o.limitMm]));
    // Every whole millimetre from the ordered size to the one below the size found.
    for (let n = R; n < r.widthMm; n++) {
      expect(holdsAt(shapes, n, limits), `${n} mm`).toBe(false);
    }
    expect(holdsAt(shapes, r.widthMm, limits)).toBe(true);
  });

  it("keeps a shadow line a shadow line: the status of the ordered size, not the one of the size tried", () => {
    // The shadow line of 0.72 mm has a gap of 0.9 mm at 80 mm and holds 0.7 mm. The free stroke of
    // 0.8 mm sets the size; where it holds the gap of the shadow line is over 1.0 mm — measured afresh
    // it would be an ordinary stroke under 1.0 mm and drive the size further. It does not.
    const shapes = frozenScene();
    const r = findMinimumSize(scaledAt(shapes), opts);
    const alone = findMinimumSize(scaledAt([shapes[2]!]), opts);
    expect(r.found).toBe(true);
    expect(r.widthMm).toBe(alone.widthMm);
    expect(r.decisive!.id).toBe("frei");
    expect(r.shadowLines).toEqual(["schatten"]);
    expect(r.ordered.find((o) => o.id === "schatten")).toMatchObject({
      shadowLine: true,
      limitMm: 0.7,
    });
    // The premise of the case: in the size found the stroke is no shadow line any more and is under 1.0 mm.
    const m = measureShapes(scaledAt(shapes)(r.widthMm), { railsBelowMm: 1.3 });
    const schatten = m.find((x) => x.id === "schatten")!;
    expect(schatten.shadowLine).toBe(false);
    expect(schatten.widthMm).toBeLessThan(1.0);
  });

  it("holds a shadow line to 0.7 mm: as satin it always holds, so it sets nothing — where the stroke alone would have to grow", () => {
    const r = findMinimumSize(scaledAt(shadowScene(0.5)), opts);
    expect(r.found).toBe(true);
    expect(r.widthMm).toBe(R);
    expect(r.shadowLines).toEqual(["schatten"]);
    // The same stroke with nothing near it: 0.78 mm measured, 1.0 mm asked.
    expect(findMinimumSize(scaledAt(aloneScene(0.75)), opts).widthMm).toBeGreaterThan(100);
  });

  it("keeps a shape by its id, and a second shape with the same id apart from the first", () => {
    const first = areaShape("x", barAt(0, 0, 40, 0.9), "#000000");
    const second = areaShape("x", barAt(0, 20, 40, 0.8), "#000000"); // the same id, narrower
    const r = findMinimumSize(scaledAt([first, second]), opts);
    expect(r.ordered).toHaveLength(2);
    expect(r.ordered.map((o) => o.id)).toEqual(["x", "x"]);
    expect(new Set(r.ordered.map((o) => o.key)).size).toBe(2);
    // The narrower one decides: 0.8 mm needs more than 0.9 mm does.
    const firstAlone = findMinimumSize(scaledAt([first]), opts);
    expect(r.widthMm).toBeGreaterThan(firstAlone.widthMm);
    const shapes = scaledAt([first, second])(r.widthMm);
    for (const s of shapes) {
      if (s.kind === "area") expect(medianShapeWidthMm(s.polygon)).toBeGreaterThanOrEqual(1.0);
    }
  });

  it("does not round what passes and does not search below the ordered size", () => {
    // A stroke of 2 mm holds from far below 80 mm; the search does not go down to say so.
    const r = findMinimumSize(scaledAt(aloneScene(2)), opts);
    expect(r.widthMm).toBe(R);
    expect(r.steps).toHaveLength(1);
  });

  it("takes the limits as options", () => {
    const shapes = aloneScene(1.1);
    expect(findMinimumSize(scaledAt(shapes), opts).widthMm).toBe(R);
    const strict = findMinimumSize(scaledAt(shapes), { ...opts, satinMinMm: 1.3 });
    expect(strict.limits).toEqual({ satinMinMm: 1.3, shadowMinMm: 0.7 });
    expect(strict.widthMm).toBeGreaterThan(R);
    expect(strict.ordered[0]!.limitMm).toBe(1.3);
  });

  it("agrees with the check in the size found: no stroke of the set under its limit, none late for it", () => {
    for (const shapes of [
      aloneScene(0.9),
      shadowScene(0.5),
      growScene(0.6),
      frozenScene(),
      jumpScene(),
    ]) {
      const r = findMinimumSize(scaledAt(shapes), opts);
      const check = checkMinimumSize(scaledAt(shapes)(r.widthMm), {
        widthMm: r.widthMm,
        ordered: r.ordered,
      });
      expect(check.findings.filter((f) => f.kind === "satin-stroke")).toEqual([]);
    }
  });

  it("says, where it gives up, that the size is none that holds: too many steps", () => {
    const r = findMinimumSize(scaledAt(aloneScene(0.9)), { ...opts, maxSteps: 1 });
    expect(r.found).toBe(false);
    expect(r.reason).toBe("steps");
    expect(r.belowMinimum).toBe(true);
    expect(r.enlarged).toBe(false);
    expect(r.decisive).toBeUndefined();
    // The size it stopped at is the last one it checked — no size that holds.
    expect(r.widthMm).toBe(R);
    expect(r.ordered).toHaveLength(1);
  });

  it("says, where it gives up, that the size is none that holds: too far above the ordered size", () => {
    // 0.75 mm needs ~103 mm at 80: more than the 1.2 times asked for.
    const r = findMinimumSize(scaledAt(aloneScene(0.75)), { ...opts, maxFactor: 1.2 });
    expect(r.found).toBe(false);
    expect(r.reason).toBe("factor");
    expect(r.maxWidthMm).toBeCloseTo(96, 9); // 1.2 times the ordered 80 mm
    expect(r.enlarged).toBe(false);
    expect(r.belowMinimum).toBe(true);
  });

  it("gives the same result for the same input", () => {
    for (const shapes of [growScene(0.6), jumpScene()]) {
      expect(findMinimumSize(scaledAt(shapes), opts)).toEqual(
        findMinimumSize(scaledAt(shapes), opts),
      );
    }
  });

  it("refuses what it cannot divide by or count with", () => {
    for (const orderedWidthMm of [0, -80, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => findMinimumSize(scaledAt(aloneScene()), { orderedWidthMm })).toThrow(RangeError);
    }
    expect(() => findMinimumSize(scaledAt(aloneScene()), { ...opts, maxSteps: 0 })).toThrow(
      RangeError,
    );
    expect(() => findMinimumSize(scaledAt(aloneScene()), { ...opts, maxFactor: 0.5 })).toThrow(
      RangeError,
    );
    expect(() => findMinimumSize(scaledAt(aloneScene()), { ...opts, satinMinMm: 0 })).toThrow(
      RangeError,
    );
    expect(() => findMinimumSize(scaledAt(aloneScene()), { ...opts, shadowMinMm: -1 })).toThrow(
      RangeError,
    );
  });

  it("reads the shapes at each size it asks for, and only at those", () => {
    const asked: number[] = [];
    const at = scaledAt(aloneScene(0.9));
    const r = findMinimumSize((w) => (asked.push(w), at(w)), opts);
    // One reading per check, those of the proportion and those below the size it found: no further
    // one for a status or a rail, the set is kept.
    expect(asked).toEqual([...r.steps, ...r.refinement].map((s) => s.widthMm));
    expect(r.refinement).not.toHaveLength(0);
  });

  it("leaves a shadow line that fades alone where it holds: its gap decides nothing, the ordered size does", () => {
    const r = findMinimumSize(scaledAt(fadingScene()), opts);
    expect(r.found).toBe(true);
    expect(r.widthMm).toBe(R);
    expect(r.shadowLines).toEqual(["schatten"]);
  });
});

describe("findMinimumSize, below the first size that held (spec §5.2: the smallest size from the ordered one)", () => {
  const opts = { orderedWidthMm: R };
  /** The limits of the set by shape id, for `holdsAt`: independent of the search. */
  const limitsOf = (r: { ordered: { id: string; limitMm: number }[] }) =>
    Object.fromEntries(r.ordered.map((o) => [o.id, o.limitMm]));
  const sizes = (steps: { widthMm: number }[]) => steps.map((s) => s.widthMm);
  /** The sizes from `from` down to `to`, whole millimetres. */
  const down = (from: number, to: number) =>
    Array.from({ length: from - to + 1 }, (_, i) => from - i);

  it("takes the smallest size from which every size holds, not the first one the proportion names", () => {
    // The width of a speck of 1.5 × 0.75 mm is no smooth function of the size: it reads 0.995 mm at
    // 103 mm, 0.842 mm at 104 mm — the proportion asks for 124 mm and holds there — but every size from
    // 111 mm holds, and 110 mm (0.987 mm) does not.
    const shapes = jumpScene();
    const r = findMinimumSize(scaledAt(shapes), opts);
    const limits = limitsOf(r);
    expect(sizes(r.steps)).toEqual([R, 103, 104, 124]);
    expect(r.steps[r.steps.length - 1]).toEqual({ widthMm: 124, under: 0 });
    expect(r.found).toBe(true);
    expect(r.widthMm).toBe(111);
    expect(r.enlarged).toBe(true);
    expect(r.belowMinimum).toBe(true);
    expect(holdsAt(shapes, 110, limits)).toBe(false);
    // From the size found on, as far as it was looked, every size holds.
    for (let n = 111; n <= 124 + 40; n++) expect(holdsAt(shapes, n, limits), `${n} mm`).toBe(true);
  });

  it("is the end of the run of sizes that hold, counted down from the first the proportion found", () => {
    // Independent of the search: walk down from the first size that held, while the size below holds.
    for (const shapes of [
      jumpScene(),
      reachScene(),
      aloneScene(0.9),
      aloneScene(0.75),
      aloneScene(0.96),
      growScene(0.6),
      frozenScene(),
    ]) {
      const r = findMinimumSize(scaledAt(shapes), opts);
      const limits = limitsOf(r);
      let smallest = r.steps[r.steps.length - 1]!.widthMm;
      while (smallest - 1 > R && holdsAt(shapes, smallest - 1, limits)) smallest--;
      expect(r.widthMm).toBe(smallest);
      expect(r.widthMm).toBeLessThanOrEqual(r.steps[r.steps.length - 1]!.widthMm);
    }
  });

  it("does not stop at a size below that holds on its own: the one above it fails, and the search is monotone", () => {
    const shapes = jumpScene();
    const r = findMinimumSize(scaledAt(shapes), opts);
    const limits = limitsOf(r);
    // The premise of the case: sizes between the last that failed and the size found that hold, with
    // a size above them that does not (105 to 109 mm hold, 110 mm does not).
    const alone: number[] = [];
    for (let n = R + 1; n < r.widthMm; n++) {
      if (holdsAt(shapes, n, limits) && !holdsAt(shapes, n + 1, limits)) alone.push(n);
    }
    expect(alone).toEqual([109]);
    expect(holdsAt(shapes, 105, limits)).toBe(true);
    // The first size of the run that holds on, not the first size that holds at all.
    expect(r.widthMm).toBeGreaterThan(105);
    expect(r.widthMm).toBe(alone[alone.length - 1]! + 2);
  });

  it("checks the whole millimetres below the first size that held, from just below it down to the first that fails", () => {
    const r = findMinimumSize(scaledAt(jumpScene()), opts);
    // 123 down to 111: thirteen sizes that hold, then 110 mm with its stroke under the limit.
    expect(sizes(r.refinement)).toEqual(down(123, 110));
    expect(r.refinement.slice(0, -1).every((s) => s.under === 0)).toBe(true);
    expect(r.refinement[r.refinement.length - 1]).toEqual({ widthMm: 110, under: 1 });
    // The size found is the last that held.
    expect(r.widthMm).toBe(r.refinement[r.refinement.length - 2]!.widthMm);
    // The checks of the proportion are the same as without the refinement: it adds to them.
    expect(sizes(r.steps)).toEqual([R, 103, 104, 124]);
  });

  it("stops at the last size the proportion found failing: it is known, and is not read again", () => {
    const asked: number[] = [];
    const at = scaledAt(reachScene());
    const r = findMinimumSize((w) => (asked.push(w), at(w)), opts);
    expect(sizes(r.steps)).toEqual([R, 87, 88, 90, 104]);
    expect(r.steps[3]!.under).toBe(1);
    // 103 down to 91 all hold; 90 mm failed in the search, and the scan goes no further down.
    expect(sizes(r.refinement)).toEqual(down(103, 91));
    expect(r.refinement.every((s) => s.under === 0)).toBe(true);
    expect(r.widthMm).toBe(91);
    // Every size is read once, and only the sizes that are checked.
    expect(new Set(asked).size).toBe(asked.length);
    expect(asked).toEqual([...r.steps, ...r.refinement].map((s) => s.widthMm));
    // What the size owes its being the smallest to: the stroke under its limit at 90 mm.
    expect(r.decisive!.atWidthMm).toBe(90);
    expect(r.decisive!.id).toBe("splitter");
  });

  it("makes one check below where the first size that held lies above the last that failed, and it fails", () => {
    // 0.9 mm: 80 → 85 → 87 by proportion; 86 mm is under the limit, 87 mm is the smallest.
    const r = findMinimumSize(scaledAt(aloneScene(0.9)), opts);
    expect(sizes(r.steps)).toEqual([R, 85, 87]);
    expect(r.refinement).toEqual([{ widthMm: 86, under: 1 }]);
    expect(r.widthMm).toBe(87);
  });

  it("makes no check where the first size that held directly follows the last that failed", () => {
    // 0.96 mm: 0.992 mm at 80 mm, over 1.0 mm at 81 mm — nothing lies between.
    const r = findMinimumSize(scaledAt(aloneScene(0.96)), opts);
    expect(sizes(r.steps)).toEqual([R, 81]);
    expect(r.refinement).toEqual([]);
    expect(r.widthMm).toBe(81);
    expect(r.decisive!.atWidthMm).toBe(R);
  });

  it("has nothing to refine where the ordered size holds, and where none was found", () => {
    expect(findMinimumSize(scaledAt(aloneScene(1.6)), opts).refinement).toEqual([]);
    const steps = findMinimumSize(scaledAt(jumpScene()), { ...opts, maxSteps: 2 });
    expect(steps.found).toBe(false);
    expect(steps.refinement).toEqual([]);
    const factor = findMinimumSize(scaledAt(aloneScene(0.75)), { ...opts, maxFactor: 1.2 });
    expect(factor.found).toBe(false);
    expect(factor.refinement).toEqual([]);
  });

  it("names the stroke that fails just below the size found, not the one that asked for the most on the way", () => {
    // The width jumps up between 110 and 111 mm: by proportion from 110 mm (0.987 mm) the stroke would
    // hold from 111.5 mm, so the size found is below what the proportion says there.
    const r = findMinimumSize(scaledAt(jumpScene()), opts);
    const d = r.decisive!;
    expect(d.id).toBe("splitter");
    expect(d.limitMm).toBe(1.0);
    expect(d.atWidthMm).toBe(110);
    expect(d.measuredMm).toBeCloseTo(0.987, 3);
    expect(d.toMm).toBeCloseTo((110 * 1.0) / d.measuredMm, 9);
    expect(Math.ceil(d.toMm - 1e-6)).toBeGreaterThan(r.widthMm);
  });

  it("never looks below the ordered size: a size that is no whole number is only the lower bound", () => {
    // Drawn for 80.4 mm: the first whole millimetre above it is 81.
    const shapes = aloneScene(0.96);
    const asked: number[] = [];
    const at = scaledAt(shapes, 80.4);
    const r = findMinimumSize((w) => (asked.push(w), at(w)), { orderedWidthMm: 80.4 });
    expect(r.found).toBe(true);
    expect(r.widthMm).toBeGreaterThan(80.4);
    expect(Math.min(...asked.filter((w) => w !== 80.4))).toBeGreaterThan(80.4);
    expect(asked.every((w) => w === 80.4 || Number.isInteger(w))).toBe(true);
  });
});
