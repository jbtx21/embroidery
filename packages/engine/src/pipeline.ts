/**
 * The pipeline (spec §4):
 *
 *   Design -> validate -> expand -> order -> generate -> connect -> tie -> post
 *          -> analyze -> StitchPlan
 *
 * `generate` is the only expensive stage and therefore the only cached one:
 * `hash(object params + object geometry + preset)` -> stitch block. Everything
 * from `connect` onwards runs every time, because it is cheap and depends on how
 * the objects sit next to each other.
 */
import type { Point } from "@texma-stitch/geometry";
import { isGeometryReady } from "@texma-stitch/geometry";
import type { FontRegistry } from "@texma-stitch/fonts";
import { analyze } from "./analyze.js";
import type { ConnectOptions, RawBlock } from "./connect.js";
import { CONNECT_DEFAULTS, connectBlocks } from "./connect.js";
import { expand } from "./expand.js";
import { generateFill } from "./fill.js";
import { stableHash } from "./hash.js";
import { coverPolygon } from "./object.js";
import { autoOrder } from "./order.js";
import { postProcess } from "./post.js";
import type { MachineProfile } from "./presets.js";
import { MACHINE_DEFAULT, presetForMachine } from "./presets.js";
import { generateRunning } from "./running.js";
import { generateSatin } from "./satin.js";
import { tieBlocks } from "./tie.js";
import type { Design, StitchObject, StitchPlan, Warning } from "./types.js";
import { edgeGapRisks, resolveOverlaps } from "./resolve-overlaps.js";
import { validate } from "./validate.js";
import { warn, WARNING } from "./warnings.js";

/** What a generated object contributes to a block (spec §4, §8.7). */
export type GeneratedStitches = { points: Point[]; jumpAt: number[] };

/** Cache for the stitch block of a single object (spec §4). */
export interface StitchCache {
  get(key: string): GeneratedStitches | undefined;
  set(key: string, value: GeneratedStitches): void;
}

export function createCache(): StitchCache {
  const map = new Map<string, GeneratedStitches>();
  return {
    get: (key) => map.get(key),
    set: (key, value) => {
      map.set(key, value);
    },
  };
}

export type PlanOptions = {
  machine?: MachineProfile;
  connect?: ConnectOptions;
  cache?: StitchCache;
  fonts?: FontRegistry;
  /** "design" (default) keeps the object list, "auto" takes the suggestion (spec §10.1). */
  order?: "design" | "auto";
};

/** Stitches of a single object — no connections, no lock stitches. */
export function generateObject(obj: StitchObject): {
  points: Point[];
  /** Indices the needle reaches by a jump instead of a stitch (spec §8.7). */
  jumpAt: number[];
  warnings: Warning[];
} {
  switch (obj.type) {
    case "running":
      return { points: generateRunning(obj), jumpAt: [], warnings: [] };
    case "satin": {
      const r = generateSatin(obj);
      return { points: r.stitches, jumpAt: [], warnings: r.warnings };
    }
    case "fill": {
      const r = generateFill(obj);
      return { points: r.stitches, jumpAt: r.jumpAt, warnings: r.warnings };
    }
    case "text":
      // After `expand` there is no text object left; if one still arrives, that
      // is a bug in the ordering of the stages, not a silent no-op.
      return {
        points: [],
        jumpAt: [],
        warnings: [
          warn(
            WARNING.NOT_IMPLEMENTED,
            "Text was not expanded — `expand` did not run.",
            "error",
            obj.id,
          ),
        ],
      };
  }
}

const EMPTY_STATS = {
  stitches: 0,
  jumps: 0,
  trims: 0,
  colorChanges: 0,
  bboxMm: { w: 0, h: 0 },
  runtimeSec: 0,
  densityMax: 0,
};

export function planDesign(design: Design, opts: PlanOptions = {}): StitchPlan {
  if (!isGeometryReady()) {
    throw new Error("Engine not initialised — call `await initEngine()` before planning.");
  }
  const machine = opts.machine ?? MACHINE_DEFAULT;
  const preset = presetForMachine(design.preset, machine);
  const warnings: Warning[] = [];

  const validated = validate(design);
  warnings.push(...validated.warnings);

  const expanded = expand(validated.objects, { preset, fonts: opts.fonts, machine });
  warnings.push(...expanded.warnings);

  // `autoOrder` is the default since 20.09.2026 (spec §10.1); `orderMode` or an
  // explicit option turns it off. The cap rule travels with the preset.
  const mode = opts.order ?? (design.orderMode === "manual" ? "design" : "auto");
  const ordered =
    mode === "auto"
      ? autoOrder(expanded.objects, { centreOut: design.preset === "cap" })
      : expanded.objects;

  // Knockdown: what lies on top cuts out of what lies below (spec §4.1).
  const resolved = resolveOverlaps(ordered);
  warnings.push(...resolved.warnings);
  warnings.push(...edgeGapRisks(resolved.objects));

  const raw: RawBlock[] = [];
  for (const obj of resolved.objects) {
    const key = stableHash(obj, design.preset);
    let generated = opts.cache?.get(key);
    if (!generated) {
      const fresh = generateObject(obj);
      warnings.push(...fresh.warnings);
      generated = { points: fresh.points, jumpAt: fresh.jumpAt };
      opts.cache?.set(key, generated);
    }
    if (generated.points.length === 0) continue;
    const cover = coverPolygon(obj);
    raw.push({
      objectId: obj.id,
      threadIndex: obj.threadIndex,
      points: generated.points,
      trimAfter: obj.trimAfter,
      ...(generated.jumpAt.length > 0 ? { jumpAt: generated.jumpAt } : {}),
      ...(cover ? { cover } : {}),
    });
  }

  if (raw.length === 0) return { blocks: [], stats: { ...EMPTY_STATS }, warnings };

  const connected = connectBlocks(raw, opts.connect ?? CONNECT_DEFAULTS);
  const tied = tieBlocks(connected);
  const finished = postProcess(tied, machine.maxJumpMm, machine.minStitchMm);

  const { stats, warnings: analysisWarnings } = analyze(finished, machine);
  warnings.push(...analysisWarnings);

  return { blocks: finished, stats, warnings };
}
