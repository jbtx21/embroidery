/**
 * Neutral JSON (spec §13.2): the stitch plan as `apps/api` hands it on to
 * pyembroidery. Deliberately thin — the format IS the stitch plan plus a header.
 *
 * Serialisation walks the keys in a fixed order, so the same plan always yields
 * the same text (CLAUDE.md, rule 3).
 */
import type { Stitch, StitchBlock, StitchPlan, Thread } from "@texma-stitch/engine";

export const NEUTRAL_JSON_VERSION = 1 as const;

export type NeutralPlan = {
  version: typeof NEUTRAL_JSON_VERSION;
  name: string;
  /** Unit of the coordinates — always millimetres. */
  unit: "mm";
  threads: Thread[];
  plan: StitchPlan;
};

export function toNeutralJson(plan: StitchPlan, name: string, threads: Thread[]): NeutralPlan {
  return { version: NEUTRAL_JSON_VERSION, name, unit: "mm", threads, plan };
}

const stitchToJson = (s: Stitch): Record<string, unknown> =>
  s.tie === true ? { x: s.x, y: s.y, cmd: s.cmd, tie: true } : { x: s.x, y: s.y, cmd: s.cmd };

const blockToJson = (b: StitchBlock): Record<string, unknown> => ({
  objectId: b.objectId,
  threadIndex: b.threadIndex,
  stitches: b.stitches.map(stitchToJson),
});

/** Stable text form — same plan, same bytes. */
export function stringifyNeutralJson(neutral: NeutralPlan, indent = 0): string {
  return JSON.stringify(
    {
      version: neutral.version,
      name: neutral.name,
      unit: neutral.unit,
      threads: neutral.threads.map((t) => ({
        brand: t.brand,
        number: t.number,
        hex: t.hex,
        name: t.name,
      })),
      plan: {
        blocks: neutral.plan.blocks.map(blockToJson),
        stats: {
          stitches: neutral.plan.stats.stitches,
          jumps: neutral.plan.stats.jumps,
          trims: neutral.plan.stats.trims,
          colorChanges: neutral.plan.stats.colorChanges,
          bboxMm: { w: neutral.plan.stats.bboxMm.w, h: neutral.plan.stats.bboxMm.h },
          runtimeSec: neutral.plan.stats.runtimeSec,
          densityMax: neutral.plan.stats.densityMax,
          needleMax: neutral.plan.stats.needleMax,
          needleCells: neutral.plan.stats.needleCells,
        },
        warnings: neutral.plan.warnings.map((w) => ({
          objectId: w.objectId,
          code: w.code,
          message: w.message,
          severity: w.severity,
        })),
      },
    },
    null,
    indent,
  );
}

export function fromNeutralJson(text: string): NeutralPlan {
  const data = JSON.parse(text) as NeutralPlan;
  if (data.version !== NEUTRAL_JSON_VERSION) {
    throw new Error(`Neutral JSON: version ${data.version} is not readable.`);
  }
  return data;
}
