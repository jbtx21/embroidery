/**
 * The minimum size of a logo as a search over the size (spec §5.2, "Tor", 01.10.2026): the smallest
 * whole-millimetre size from the ordered one upwards from which every satin stroke of the ORDERED size
 * holds the limit it has there.
 *
 * **The ordered size decides which strokes count.** Whether a shape is satin (§7.8.1) and whether it is
 * a shadow line — a rail at a fabric gap under 1.0 mm, measured as the pull compensation measures it —
 * is read once, in the ordered size R, and kept (`OrderedStroke`: the shape by its key, the limit it is
 * held to: 1.0 mm, or 0.7 mm as a shadow line). The version of 30.09.2026 classified again in every size
 * it tried: any hairline of a vectorisation turns into a narrow satin stroke at some size, the ranges
 * in which it is too narrow lined up, and the minimum size ran away (STUTTGART 80 mm → 252 mm, Köln
 * 90 mm → 567 mm, Eislingen 200 mm → 1,266 mm), driven by decorative parts such as a blue gusset of
 * 0.8 × 2.7 mm. What only turns satin as the logo grows does not set the size; it is a check point
 * (`checkMinimumSize` with `ordered`, §13.4).
 *
 * **The search is monotone.** A stroke of the set grows with the logo, so from the size where all hold
 * no larger size lets one fall under again, and there is no range above in which the logo fails once
 * more. With the strokes of R alone — a satin stroke is 0.7 mm wide at least and held to 1.0 mm at
 * most — the size found is by proportion at most 1.43 times R; measured on the customer logos it is
 * 1.1 to 1.5 times (STUTTGART 80 mm → 91 mm, Köln 90 mm → 134 mm, Eislingen 200 mm → 286 mm), where
 * the 30.09.2026 version ran to 3 to 6 times.
 *
 * - **Search** (`findMinimumSize`): at a size `c` the strokes of the set are measured (the median
 *   width of the same shapes, found again by their key: `shapesAt(c)` imports the SVG at that width,
 *   the way the run reads it). Where one is under its limit, the next size is the smallest whole
 *   millimetre at which every one would hold if its width grew in proportion to the size — the largest
 *   of `c × limit ÷ width` — and the strokes are measured again there. It passes, or finds strokes under
 *   their limit, and the search goes on from there. Only upwards, never below the ordered size.
 * - **Whole millimetres**: the size is rounded up (`ceil`), never down: "from 91 mm" is then true.
 *   Where the ordered size itself holds it stays as it is.
 * - **Nothing is skipped on the way up, for a smooth stroke.** The median width of a thin shape grows
 *   slower than the size (its outline is sampled every perimeter / 300, between 0.3 and 2 mm, and the
 *   measure reads a few per cent high at small sizes: a bar of 0.9 mm reads 0.95 mm at 80 mm and
 *   0.99 mm at 85 mm). By proportion such a stroke cannot hold before the size the formula names, so a
 *   step never jumps over a size that holds; where the measurement in that size says otherwise the
 *   formula is applied again from it.
 * - **Below** (`refinement`): the width of a small shape is no smooth function of the size, and the
 *   proportion then overshoots (see the limits). The size the search ends at, S₀, is one where every
 *   stroke holds — not always the smallest. From S₀ − 1 the search goes down, one whole millimetre at a
 *   time, while every stroke of the set holds, and stops at the first size where one does not — or at
 *   the last size of the search that failed, which it knows and does not read again. The size found is
 *   the last that held: every size from it up to S₀ holds. It is not "the first size that holds, from
 *   below": a size can hold on its own with the one above it failing (Atzensport 80 mm: 106 mm holds,
 *   107 mm does not, 108 mm does), and "from 106 mm" would be untrue — the search would not be monotone.
 *   The size found is where the run of sizes that hold, which reaches S₀, begins.
 * - **Only the strokes of the set are measured above the ordered size** — their widths, not the whole
 *   classification and not the columns: the status of a shadow line is not asked again.
 *
 * Known limits (measured 01.10.2026 on the customer logos):
 *
 * - The width of a small shape jumps where the medial axis of a sliver changes (the blue gusset of the
 *   Köln logo, 0.8 × 2.7 mm, is 0.91 mm at 131 mm and 1.14 mm at 144 mm; a speck of 1.5 × 0.75 mm reads
 *   0.995 mm at 103 mm and 0.842 mm at 104 mm). By proportion alone Köln 90 mm is found at 144 mm,
 *   Eislingen 200 mm at 294 mm and Atzensport 80 mm at 109 mm; below, 134 mm, 286 mm and 108 mm are the
 *   smallest sizes from which every size up to those holds. STUTTGART 80 mm (91 mm), Atzensport-PDF 80 mm
 *   (107 mm) and Atzensport 200 mm (222 mm) are the smallest to begin with.
 * - Above S₀ nothing is checked: that every larger size holds is a measurement, not a proof. On all six
 *   logos every size held up to 40 mm above S₀; a shape whose width drops with the size (the speck
 *   above, 15 % in one millimetre) could fall under its limit once more further up.
 * - Every shape the classification calls satin in R counts, however small: a speck of 1 mm² that
 *   measures 0.9 mm at R sets the size on its own. Whether such a shape is stitched at all is not asked
 *   (`DROP_TINY_MM2` is the importer's, not the template's).
 * - A shadow line that loses its gap as the logo grows (the gap is 0.9 mm at R, 1.0 mm at 1.11 R) keeps
 *   its limit of 0.7 mm: the status is the one of R. It is narrower than 1.0 mm for a while and not a
 *   check point either (`satin-near` starts at 1.0 mm).
 * - The refinement reads one size per whole millimetre between the last size of the search that failed
 *   and S₀, as many as there are and with no limit of its own: each is a reading of the file at that
 *   width (`shapesAt`).
 */
import type { ImportedShape } from "../import/svg.js";
import { medianShapeWidthMm } from "../import/svg.js";
import type { Preset } from "../presets.js";
import { PRESETS } from "../presets.js";
import type { OrderedStroke } from "./min-size.js";
import {
  areaKeys,
  holdsFromWidth,
  measureShapes,
  orderedStrokes,
  SATIN_STROKE_MIN_MM,
  SHADOW_LINE_MIN_MM,
} from "./min-size.js";

/** The search stops after this many checks, each in a size of its own. */
export const SEARCH_MAX_STEPS = 16;
/** The search gives up at sizes above this many times the ordered one. */
export const SEARCH_MAX_FACTOR = 10;
/**
 * A size this close to a whole number of millimetres is that number: the widths are divided and
 * multiplied, and 116.0000000001 is no reason to ask for 117 mm.
 */
const WHOLE_EPS = 1e-6;

export type SizeLimits = { satinMinMm: number; shadowMinMm: number };

const DEFAULT_LIMITS: SizeLimits = {
  satinMinMm: SATIN_STROKE_MIN_MM,
  shadowMinMm: SHADOW_LINE_MIN_MM,
};

/**
 * The stroke of the set that sets the size: of those under their limit at the check just below the size
 * found — the one that fails there — the one that asked for the most; with the width it has in the
 * ordered size and the limit it was held to there.
 */
export type SizeDriver = {
  id: string;
  color: string;
  /** Median width in the ordered size, mm. */
  orderedMm: number;
  /** The limit it is held to, mm: 1.0, or 0.7 as a shadow line. */
  limitMm: number;
  shadowLine: boolean;
  /** The width it had at the check just below the size found, mm… */
  measuredMm: number;
  /** …at this logo width, mm: the last size under the one found that was checked (one millimetre under it). */
  atWidthMm: number;
  /**
   * The logo width, mm, from which it would hold if its width grew in proportion from there. The size
   * found is this rounded up — or lower, where the width of a small shape jumps (module doc).
   */
  toMm: number;
};

export type MinimumSizeSearchOptions = {
  /** The ordered logo width, mm: where the search starts, and the size it never goes below. */
  orderedWidthMm: number;
  /** The preset the columns are set with, in the ordered size only (`underlapMm`). Default Piqué. */
  preset?: Preset;
  /** Default `SATIN_STROKE_MIN_MM`. */
  satinMinMm?: number;
  /** Default `SHADOW_LINE_MIN_MM`. */
  shadowMinMm?: number;
  /** Checks, each in a size of its own, before the search gives up. Default `SEARCH_MAX_STEPS`. */
  maxSteps?: number;
  /** The search gives up above this many times the ordered size. Default `SEARCH_MAX_FACTOR`. */
  maxFactor?: number;
};

/** One check of the search: a logo width, and how many strokes of the set were under their limit in it. */
export type SearchStep = { widthMm: number; under: number };

export type MinimumSizeSearch = {
  /** The ordered logo width the search started from, mm. */
  orderedWidthMm: number;
  /**
   * The minimum size, mm: where `found`, the smallest size from the ordered one from which every stroke
   * of the set holds — in every whole millimetre up to the first size that held (`steps`). The ordered
   * size itself where that holds, else a whole number of millimetres. Where not found, the last size
   * checked: no size that holds.
   */
  widthMm: number;
  /** False where the search gave up (`reason`). */
  found: boolean;
  /** Why it gave up: `steps` (`maxSteps` checks made) or `factor` (the next size was above `maxWidthMm`). */
  reason?: "steps" | "factor";
  /** The size above which the search gives up: the ordered size times `maxFactor`, mm. */
  maxWidthMm: number;
  /** The minimum size is above the ordered one: the program is made in `widthMm`. */
  enlarged: boolean;
  /** The ordered size is under the minimum size — or, where none was found, has strokes under their limit. */
  belowMinimum: boolean;
  /** The stroke that sets the size found. Absent where the ordered size holds, or where none was found. */
  decisive?: SizeDriver;
  /**
   * Every check of the search by proportion, in order: the ordered size first, the first size that
   * held last. The size found is this one or — where the width of a small shape jumps — one below it
   * (`refinement`).
   */
  steps: SearchStep[];
  /**
   * The checks below the first size that held, in order: from one millimetre under it, downwards, a
   * size each, while every stroke of the set holds in it. The last is the first check in which one does
   * not (`under` above 0) — unless the scan reached the last size of `steps` that failed, which it does
   * not read again. The size found is the last size of these that held, and the first size that held
   * where the first of them failed. Empty where nothing lay between (the first size that held follows
   * the last that failed), where the ordered size holds and where none was found.
   */
  refinement: SearchStep[];
  /**
   * The satin strokes of the ordered size with the limit each is held to (`orderedStrokes`): the set the
   * search kept, and what the check of the size made is given (`MinimumSizeOptions.ordered`).
   */
  ordered: OrderedStroke[];
  /** The shadow lines among them, by id: held to the lower limit. */
  shadowLines: string[];
  /** The limits it ran with, mm. */
  limits: SizeLimits;
};

function requirePositive(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive number, got ${value}`);
  }
}

/** The median widths of the strokes of the set in a list of shapes, by key; a stroke not in the list is left out. */
function widthsOf(shapes: ImportedShape[], keys: ReadonlySet<string>): Map<string, number> {
  const widths = new Map<string, number>();
  const all = areaKeys(shapes);
  shapes.forEach((shape, i) => {
    const key = all[i];
    if (shape.kind === "area" && key !== undefined && keys.has(key)) {
      widths.set(key, medianShapeWidthMm(shape.polygon));
    }
  });
  return widths;
}

/** A stroke of the set under its limit in one size, with the width it has there. */
type Under = { stroke: OrderedStroke; widthMm: number };

/**
 * The strokes of the set under their limit, given their widths in one size. A stroke that is not in the
 * shapes of that size cannot be held to a limit there.
 */
function underOf(set: OrderedStroke[], widths: ReadonlyMap<string, number>): Under[] {
  return set.flatMap((o) => {
    const w = widths.get(o.key);
    return w !== undefined && w < o.limitMm ? [{ stroke: o, widthMm: w }] : [];
  });
}

/**
 * The stroke that asks for the most in a size where some are under their limit — the one that holds
 * last if every width grew in proportion to the size — and the logo width it holds from by that
 * proportion. The first of equals: the same input names the same stroke.
 */
function driverOf(widthMm: number, under: Under[]): { driver: Under; need: number } {
  let driver = under[0]!;
  let need = holdsFromWidth(widthMm, driver.stroke.limitMm, driver.widthMm);
  for (const u of under) {
    const n = holdsFromWidth(widthMm, u.stroke.limitMm, u.widthMm);
    if (n > need) {
      driver = u;
      need = n;
    }
  }
  return { driver, need };
}

/**
 * The minimum size of a logo (module doc). `shapesAt(w)` gives the shapes of the logo at the width
 * `w` mm, read the way the run reads them — for a file the SVG imported at that width; an implementation
 * that scales the coordinates does the same. It is asked once per check (`steps`, `refinement`), and for
 * no other size.
 */
export function findMinimumSize(
  shapesAt: (widthMm: number) => ImportedShape[],
  opts: MinimumSizeSearchOptions,
): MinimumSizeSearch {
  const ordered = opts.orderedWidthMm;
  const limits: SizeLimits = {
    satinMinMm: opts.satinMinMm ?? DEFAULT_LIMITS.satinMinMm,
    shadowMinMm: opts.shadowMinMm ?? DEFAULT_LIMITS.shadowMinMm,
  };
  const maxSteps = opts.maxSteps ?? SEARCH_MAX_STEPS;
  const maxFactor = opts.maxFactor ?? SEARCH_MAX_FACTOR;
  requirePositive("orderedWidthMm", ordered);
  requirePositive("satinMinMm", limits.satinMinMm);
  requirePositive("shadowMinMm", limits.shadowMinMm);
  if (!Number.isInteger(maxSteps) || maxSteps < 1) {
    throw new RangeError(`maxSteps must be a whole number from 1, got ${maxSteps}`);
  }
  if (!Number.isFinite(maxFactor) || maxFactor < 1) {
    throw new RangeError(`maxFactor must be a number from 1, got ${maxFactor}`);
  }
  const preset = opts.preset ?? PRESETS.pique;
  const cap = ordered * maxFactor;

  // The ordered size, once and with the columns: which shapes are satin, which are shadow lines. A
  // stroke at or above the larger limit holds either way, and is not asked for its rails.
  const set = orderedStrokes(
    measureShapes(shapesAt(ordered), {
      preset,
      railsBelowMm: Math.max(limits.satinMinMm, limits.shadowMinMm),
    }),
    limits,
  );
  const keys = new Set(set.map((o) => o.key));

  const steps: SearchStep[] = [];
  const refinement: SearchStep[] = [];
  let width = ordered;
  let widths = new Map(set.map((o) => [o.key, o.widthMm]));
  // The check just below the size found, the one that failed: what the size owes its being the smallest.
  let failed: { widthMm: number; under: Under[] } | undefined;
  let found = false;
  let reason: MinimumSizeSearch["reason"];

  for (;;) {
    const under = underOf(set, widths);
    steps.push({ widthMm: width, under: under.length });
    if (under.length === 0) {
      found = true;
      break;
    }
    failed = { widthMm: width, under };
    if (steps.length >= maxSteps) {
      reason = "steps";
      break;
    }
    // The size at which every one holds if its width grew in proportion: the largest of them. For a
    // smooth stroke it cannot hold before it (module doc); the check in that size says whether it does.
    const { need } = driverOf(width, under);
    const nextWidth = Math.max(Math.ceil(need - WHOLE_EPS), Math.floor(width) + 1);
    if (nextWidth > cap) {
      reason = "factor";
      break;
    }
    width = nextWidth;
    widths = widthsOf(shapesAt(width), keys);
  }

  // Below the first size that held: the width of a small shape jumps, and the proportion overshoots.
  // One whole millimetre at a time from just under it, while every stroke holds; the last size that
  // failed in the search is known to fail and is not read again. `width` is a whole number here: it was
  // rounded up from the ordered size.
  if (found && failed !== undefined) {
    for (let n = width - 1; n > failed.widthMm + WHOLE_EPS; n--) {
      const under = underOf(set, widthsOf(shapesAt(n), keys));
      refinement.push({ widthMm: n, under: under.length });
      if (under.length > 0) {
        failed = { widthMm: n, under };
        break;
      }
      width = n;
    }
  }

  let decisive: SizeDriver | undefined;
  if (found && failed !== undefined) {
    const { driver, need } = driverOf(failed.widthMm, failed.under);
    decisive = {
      id: driver.stroke.id,
      color: driver.stroke.color,
      orderedMm: driver.stroke.widthMm,
      limitMm: driver.stroke.limitMm,
      shadowLine: driver.stroke.shadowLine,
      measuredMm: driver.widthMm,
      atWidthMm: failed.widthMm,
      toMm: need,
    };
  }

  return {
    orderedWidthMm: ordered,
    widthMm: width,
    found,
    ...(reason === undefined ? {} : { reason }),
    maxWidthMm: cap,
    enlarged: found && width > ordered,
    belowMinimum: steps[0]!.under > 0,
    ...(decisive === undefined ? {} : { decisive }),
    steps,
    refinement,
    ordered: set,
    shadowLines: set.filter((o) => o.shadowLine).map((o) => o.id),
    limits,
  };
}
