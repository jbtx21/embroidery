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
import { validate } from "./validate.js";
import { warn, WARNING } from "./warnings.js";

/** Cache for the stitch block of a single object (spec §4). */
export interface StitchCache {
  get(key: string): Point[] | undefined;
  set(key: string, value: Point[]): void;
}

export function createCache(): StitchCache {
  const map = new Map<string, Point[]>();
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
export function generateObject(obj: StitchObject): { points: Point[]; warnings: Warning[] } {
  switch (obj.type) {
    case "running":
      return { points: generateRunning(obj), warnings: [] };
    case "satin": {
      const r = generateSatin(obj);
      return { points: r.stitches, warnings: r.warnings };
    }
    case "fill": {
      const r = generateFill(obj);
      return { points: r.stitches, warnings: r.warnings };
    }
    case "text":
      // After `expand` there is no text object left; if one still arrives, that
      // is a bug in the ordering of the stages, not a silent no-op.
      return {
        points: [],
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

  // The cap rule travels with the preset, not with the machine (spec §10.1).
  const ordered =
    opts.order === "auto"
      ? autoOrder(expanded.objects, { centreOut: design.preset === "cap" })
      : expanded.objects;

  const raw: RawBlock[] = [];
  for (const obj of ordered) {
    const key = stableHash(obj, design.preset);
    let points = opts.cache?.get(key);
    if (!points) {
      const generated = generateObject(obj);
      warnings.push(...generated.warnings);
      points = generated.points;
      opts.cache?.set(key, points);
    }
    if (points.length === 0) continue;
    const cover = coverPolygon(obj);
    raw.push({
      objectId: obj.id,
      threadIndex: obj.threadIndex,
      points,
      trimAfter: obj.trimAfter,
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
