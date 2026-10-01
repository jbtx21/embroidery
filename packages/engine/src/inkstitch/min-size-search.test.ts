/**
 * The search over the size of the minimum-size gate (spec §5.2, "Tor", 01.10.2026): the smallest
 * whole-millimetre size from the ordered one upwards in which every satin stroke of the ORDERED size
 * holds the limit it has there. The set of strokes (and which of them are shadow lines) is read once,
 * in the ordered size, and kept; a form that only turns satin as the logo grows does not set the
 * size, it is a check point (`checkMinimumSize` with `ordered`, `min-size.test.ts`).
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
  ORDERED_MM,
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
    // The first step is the ordered size, with its one stroke under the limit; the last is the size found.
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
    // The last size before the one found, the width it had there, and where it holds by proportion.
    const before = r.steps[r.steps.length - 2]!;
    expect(d.atWidthMm).toBe(before.widthMm);
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
    for (const shapes of [aloneScene(0.9), growScene(0.6), frozenScene()]) {
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
    for (const shapes of [aloneScene(0.9), shadowScene(0.5), growScene(0.6), frozenScene()]) {
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
    const shapes = growScene(0.6);
    expect(findMinimumSize(scaledAt(shapes), opts)).toEqual(
      findMinimumSize(scaledAt(shapes), opts),
    );
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
    // One reading per step: no further one for a status or a rail, the set is kept.
    expect(asked).toEqual(r.steps.map((s) => s.widthMm));
  });

  it("leaves a shadow line that fades alone where it holds: its gap decides nothing, the ordered size does", () => {
    const r = findMinimumSize(scaledAt(fadingScene()), opts);
    expect(r.found).toBe(true);
    expect(r.widthMm).toBe(R);
    expect(r.shadowLines).toEqual(["schatten"]);
  });
});
