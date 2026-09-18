/**
 * Golden files from phase 0 (spec §15, §16 acceptance for week 1).
 *
 * For every `test-data/phase0/<name>.svg` with a matching `<name>.dst` from
 * Ink/Stitch: run the SVG through our pipeline and compare.
 *
 *   stitch count   ±10 %
 *   bounding box   ±0.3 mm
 *
 * When the folder is empty the suite says so loudly and runs nothing. It is NOT
 * replaced by a weaker test that checks nothing (CLAUDE.md: golden-file tests are
 * never "adjusted" to go green).
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { importSvg, initEngine, planDesign } from "@texma-stitch/engine";
import { readDst, unitsToMm } from "@texma-stitch/formats";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const phase0 = join(root, "test-data", "phase0");

const STITCH_TOLERANCE = 0.1; // ±10 %
const BBOX_TOLERANCE_MM = 0.3;

type Pair = { name: string; svg: string; dst: string };

function goldenPairs(): Pair[] {
  if (!existsSync(phase0)) return [];
  return readdirSync(phase0)
    .filter((f) => f.toLowerCase().endsWith(".svg"))
    .map((f) => ({
      name: f.replace(/\.svg$/i, ""),
      svg: join(phase0, f),
      dst: join(phase0, f.replace(/\.svg$/i, ".dst")),
    }))
    .filter((p) => existsSync(p.dst));
}

const pairs = goldenPairs();

if (pairs.length === 0) {
  console.warn(
    `[golden] no phase-0 motifs in test-data/phase0 — the acceptance comparison from spec §15 is NOT running. ` +
      `See test-data/phase0/README.md.`,
  );
}

beforeAll(async () => {
  await initEngine();
});

describe.skipIf(pairs.length === 0)("phase-0 golden files (spec §15)", () => {
  it.each(pairs)("$name stays within the tolerance", ({ svg, dst }) => {
    const { design } = importSvg(readFileSync(svg, "utf8"));
    const plan = planDesign(design);

    const reference = unitsToMm(readDst(new Uint8Array(readFileSync(dst))).stitches).filter(
      (s) => s.cmd === "stitch",
    );
    expect(reference.length).toBeGreaterThan(0);

    const ratio = plan.stats.stitches / reference.length;
    expect(Math.abs(ratio - 1)).toBeLessThanOrEqual(STITCH_TOLERANCE);

    const refW = Math.max(...reference.map((s) => s.x)) - Math.min(...reference.map((s) => s.x));
    const refH = Math.max(...reference.map((s) => s.y)) - Math.min(...reference.map((s) => s.y));
    expect(Math.abs(plan.stats.bboxMm.w - refW)).toBeLessThanOrEqual(BBOX_TOLERANCE_MM);
    expect(Math.abs(plan.stats.bboxMm.h - refH)).toBeLessThanOrEqual(BBOX_TOLERANCE_MM);
  });
});
