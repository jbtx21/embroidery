/**
 * Golden files from phase 0 (spec §15, §16 acceptance for week 1).
 *
 * For every `test-data/phase0/<name>.svg` with a matching `<name>.dst` from
 * Ink/Stitch: run the SVG through our pipeline and compare — stitch count ±10 %,
 * bounding box ±0.3 mm.
 *
 * When the folder is empty the suite says so loudly and runs nothing. It is NOT
 * replaced by a weaker test that checks nothing (CLAUDE.md: golden-file tests are
 * never "adjusted" to go green). The comparison itself is tested below on
 * synthetic input, so an empty folder never hides a harness that does not bite.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { importSvg, initEngine, planDesign } from "@texma-stitch/engine";
import type { Stats, Stitch } from "@texma-stitch/engine";
import { readDst, unitsToMm } from "@texma-stitch/formats";
import {
  BBOX_TOLERANCE_MM,
  compare,
  describeComparison,
  goldenPairs,
  referenceBbox,
  STITCH_TOLERANCE,
} from "./golden.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const phase0 = join(root, "test-data", "phase0");
const pairs = goldenPairs(phase0);

if (pairs.length === 0) {
  console.warn(
    "[golden] no phase-0 motifs in test-data/phase0 — the acceptance comparison from spec §15 is NOT running. " +
      "See test-data/phase0/README.md.",
  );
}

const stats = (stitches: number, w: number, h: number): Stats => ({
  stitches,
  jumps: 0,
  trims: 0,
  colorChanges: 0,
  bboxMm: { w, h },
  runtimeSec: 0,
  densityMax: 0,
});

const refStitches = (count: number, w: number, h: number): Stitch[] => [
  { x: 0, y: 0, cmd: "stitch" },
  ...Array.from({ length: Math.max(0, count - 2) }, () => ({
    x: w / 2,
    y: h / 2,
    cmd: "stitch" as const,
  })),
  { x: w, y: h, cmd: "stitch" },
  { x: w, y: h, cmd: "end" },
];

describe("comparison logic (spec §15)", () => {
  it("accepts a run inside both tolerances", () => {
    const c = compare(stats(105, 50, 30), refStitches(100, 50, 30));
    expect(c.reference).toBe(100);
    expect(c.ratio).toBeCloseTo(1.05, 6);
    expect(c.withinTolerance).toBe(true);
  });

  it("rejects a stitch count outside ±10 %", () => {
    expect(compare(stats(111, 50, 30), refStitches(100, 50, 30)).stitchesWithinTolerance).toBe(
      false,
    );
    expect(compare(stats(89, 50, 30), refStitches(100, 50, 30)).stitchesWithinTolerance).toBe(
      false,
    );
    // Exactly on the limit still counts as inside
    expect(compare(stats(110, 50, 30), refStitches(100, 50, 30)).stitchesWithinTolerance).toBe(
      true,
    );
  });

  it("rejects a bounding box outside ±0.3 mm", () => {
    const c = compare(stats(100, 50.4, 30), refStitches(100, 50, 30));
    expect(c.bboxWithinTolerance).toBe(false);
    expect(c.withinTolerance).toBe(false);
    expect(c.deltaW).toBeCloseTo(0.4, 6);
    expect(compare(stats(100, 50, 30.3), refStitches(100, 50, 30)).bboxWithinTolerance).toBe(true);
  });

  it("does not quietly pass an empty reference", () => {
    const c = compare(stats(100, 50, 30), []);
    expect(c.reference).toBe(0);
    expect(c.withinTolerance).toBe(false);
  });

  it("measures the reference box over needle penetrations only", () => {
    const withJump: Stitch[] = [
      { x: 0, y: 0, cmd: "stitch" },
      { x: 500, y: 500, cmd: "jump" },
      { x: 10, y: 5, cmd: "stitch" },
    ];
    expect(referenceBbox(withJump)).toEqual({ w: 10, h: 5 });
    expect(referenceBbox([])).toEqual({ w: 0, h: 0 });
  });

  it("describes a deviation in the form docs/abweichungen.md needs", () => {
    const text = describeComparison(
      "kontur",
      compare(stats(120, 50.5, 30), refStitches(100, 50, 30)),
    );
    expect(text).toContain("120");
    expect(text).toContain("100");
    expect(text).toContain("20.0 %");
    expect(text).toMatch(/0\.50/);
  });

  it("carries the tolerances from the spec", () => {
    expect(STITCH_TOLERANCE).toBe(0.1);
    expect(BBOX_TOLERANCE_MM).toBe(0.3);
  });
});

describe.skipIf(pairs.length === 0)("phase-0 golden files (spec §15)", () => {
  beforeAll(async () => {
    await initEngine();
  });

  it.each(pairs)("$name stays within the tolerance", ({ svg, dst, name }) => {
    const { design } = importSvg(readFileSync(svg, "utf8"));
    const plan = planDesign(design);
    const reference = unitsToMm(readDst(new Uint8Array(readFileSync(dst))).stitches);
    const c = compare(plan.stats, reference);

    // Print on every run, not only on failure: docs/abweichungen.md wants the
    // numbers for each motif whether or not it is inside the tolerance.
    console.log(`[golden] ${describeComparison(name, c)}`);

    // The message carries the same numbers, so a deviation goes straight into
    // docs/abweichungen.md instead of being tested away.
    expect(c.withinTolerance, describeComparison(name, c)).toBe(true);
  });
});
