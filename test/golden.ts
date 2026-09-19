/**
 * Comparison against the phase-0 golden files (spec §15).
 *
 * The comparison lives in its own function so it can be tested on its own: a
 * harness that silently passes is worse than none. `pnpm golden` uses the same
 * function to print the table for `docs/abweichungen.md`.
 */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Stats, Stitch } from "@texma-stitch/engine";

/** Stitch count ±10 %, bounding box ±0.3 mm (spec §15). */
export const STITCH_TOLERANCE = 0.1;
export const BBOX_TOLERANCE_MM = 0.3;

/**
 * The spec tolerances are inclusive, so the comparison must not trip over binary
 * representation: 110/100 - 1 is 0.10000000000000009, and 30.3 - 30 is
 * 0.3000000000000007. Without this slack a motif that sits exactly on the limit
 * would be rejected by float noise rather than by its stitches.
 */
const EPS = 1e-9;

export type GoldenPair = { name: string; svg: string; dst: string };

/** Every `<name>.svg` in the folder that has a matching `<name>.dst`. */
export function goldenPairs(folder: string): GoldenPair[] {
  if (!existsSync(folder)) return [];
  return readdirSync(folder)
    .filter((f) => f.toLowerCase().endsWith(".svg"))
    .sort()
    .map((f) => ({
      name: f.replace(/\.svg$/i, ""),
      svg: join(folder, f),
      dst: join(folder, f.replace(/\.svg$/i, ".dst")),
    }))
    .filter((p) => existsSync(p.dst));
}

export type Comparison = {
  ours: number;
  reference: number;
  /** ours / reference; 1 means identical. */
  ratio: number;
  bboxOurs: { w: number; h: number };
  bboxReference: { w: number; h: number };
  deltaW: number;
  deltaH: number;
  stitchesWithinTolerance: boolean;
  bboxWithinTolerance: boolean;
  withinTolerance: boolean;
};

/** Bounding box over the needle penetrations of a reference file. */
export function referenceBbox(reference: Stitch[]): { w: number; h: number } {
  const points = reference.filter((s) => s.cmd === "stitch");
  if (points.length === 0) return { w: 0, h: 0 };
  const xs = points.map((s) => s.x);
  const ys = points.map((s) => s.y);
  return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

export function compare(stats: Stats, reference: Stitch[]): Comparison {
  const ours = stats.stitches;
  const refCount = reference.filter((s) => s.cmd === "stitch").length;
  const ratio = refCount === 0 ? Number.POSITIVE_INFINITY : ours / refCount;
  const bboxReference = referenceBbox(reference);
  const deltaW = stats.bboxMm.w - bboxReference.w;
  const deltaH = stats.bboxMm.h - bboxReference.h;

  const stitchesWithinTolerance =
    Number.isFinite(ratio) && Math.abs(ratio - 1) <= STITCH_TOLERANCE + EPS;
  const bboxWithinTolerance =
    Math.abs(deltaW) <= BBOX_TOLERANCE_MM + EPS && Math.abs(deltaH) <= BBOX_TOLERANCE_MM + EPS;

  return {
    ours,
    reference: refCount,
    ratio,
    bboxOurs: stats.bboxMm,
    bboxReference,
    deltaW,
    deltaH,
    stitchesWithinTolerance,
    bboxWithinTolerance,
    withinTolerance: stitchesWithinTolerance && bboxWithinTolerance,
  };
}

/** One line for the failure message and for `docs/abweichungen.md`. */
export function describeComparison(name: string, c: Comparison): string {
  const pct = Number.isFinite(c.ratio) ? `${((c.ratio - 1) * 100).toFixed(1)} %` : "—";
  return [
    `${name}:`,
    `Stiche ${c.ours} (unsere) gegen ${c.reference} (Ink/Stitch), ${pct}`,
    `Box ${c.bboxOurs.w.toFixed(2)} × ${c.bboxOurs.h.toFixed(2)} mm`,
    `gegen ${c.bboxReference.w.toFixed(2)} × ${c.bboxReference.h.toFixed(2)} mm`,
    `(Δ ${c.deltaW.toFixed(2)} / ${c.deltaH.toFixed(2)} mm)`,
  ].join(" ");
}
