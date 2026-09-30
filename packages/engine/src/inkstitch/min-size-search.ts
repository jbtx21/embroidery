/**
 * The minimum size of a logo as a search over the size (spec §5.2, "Tor", 30.09.2026): the smallest
 * size from the ordered one upwards at which the check finds no satin stroke under its limit.
 *
 * Extrapolating from the ordered size does not hold. A stroke that is a running stitch at 80 mm
 * turns into satin as the logo grows — at 0.7 mm — and is too narrow from there until it is 1.3 mm
 * wide; the gray stroke of the STUTTGART logo is 0.47 mm at 80 mm, 0.70 mm at 120 mm, and the size
 * the extrapolation gives from 80 mm (118 mm) lies inside its range. Every stroke has a range of
 * logo widths in which it is satin and too narrow (`ForbiddenRange`), and the minimum size is the
 * smallest size outside all of them.
 *
 * - **Ranges** (`forbiddenRanges`): a stroke of median width `w` at logo width `c` is `k·w` wide at
 *   `k·c`. It is satin from `k = 0.7 / w` and holds from `k = limit / w`: the range is
 *   `[0.7 / w, limit / w)`, and `limit` is 1.3 mm — or, as a shadow line, 0.7 mm, which makes the
 *   range empty. A shadow line owes its status to its gap, and the gap grows with the size as well:
 *   at `k = 1.0 / g` (`g` the gap of its rail, `railGaps`) it stops being one and is held to 1.3 mm
 *   again — the range `[1.0 / g, 1.3 / w)`, if the stroke is still too narrow then.
 * - **Search** (`findMinimumSize`): from a size `c` where the check finds strokes under their limit,
 *   the smallest whole-millimetre size outside the ranges of the satin strokes of `c`. The shapes
 *   are then read again at that size (`shapesAt`: the SVG imported at that width, the way the run
 *   reads it), the strokes and their shadow line status measured there, and the check made for
 *   real. It passes, or finds strokes under their limit — a running stitch that has turned satin, a
 *   stroke that measures a little less than it was read, a shadow line that has lost its gap — and
 *   the search goes on from there. Only upwards, never below the ordered size.
 *
 *   The ranges of a running stitch are left out of the jump: whether it is a shadow line once it is
 *   satin depends on the gap at that size, which only the check in that size knows. A range taken
 *   from it would skip sizes that hold. So a size that lies in no range of a satin stroke is the
 *   next one to check; that is what makes the size found the smallest.
 * - **Whole millimetres**: the size is rounded up (`ceil`), never down: "from 119 mm" is then true.
 *   Where the ordered size itself holds it stays as it is.
 * - **Above** (`MinimumSizeSearch.above`): the ranges that lie above the size found, for the output
 *   (an order for a larger logo would land above them). Read from the shapes at that size, the
 *   running stitches included with the rails they would have as satin strokes
 *   (`addRunningRails`): a hairline next to a letter becomes satin as a shadow line, and is no
 *   problem until its gap reaches 1.0 mm. The widths scale linearly in these ranges, which they do
 *   not exactly (the measurement of a thin strip reads a few per cent higher at small sizes): the
 *   ranges are where to look, and the check in that size is what decides.
 */
import type { ImportedShape } from "../import/svg.js";
import type { Preset } from "../presets.js";
import { PRESETS } from "../presets.js";
import { SATIN_FROM_MM } from "./classify.js";
import type { ShapeMeasure } from "./min-size.js";
import {
  addRunningRails,
  isTooNarrow,
  measureShapes,
  SATIN_STROKE_MIN_MM,
  SHADOW_LINE_MIN_MM,
} from "./min-size.js";
import { FABRIC_GAP_MAX_MM } from "./rail-pull.js";

/** The search stops after this many checks, each in a size of its own. */
export const SEARCH_MAX_STEPS = 12;
/** The search gives up at sizes above this many times the ordered one. */
export const SEARCH_MAX_FACTOR = 10;
/**
 * A size this close to a whole number of millimetres is that number: the widths are divided and
 * multiplied, and 116.0000000001 is no reason to ask for 117 mm.
 */
const WHOLE_EPS = 1e-6;

/**
 * What a range is: `too-narrow` holds the size it was read at (a stroke that is under its limit
 * now); `becomes-satin` begins where a running stitch turns satin; `loses-shadow` begins where the
 * gap of a shadow line reaches 1.0 mm and the stroke is held to 1.3 mm again.
 */
export type SizeRangeKind = "too-narrow" | "becomes-satin" | "loses-shadow";

/** The logo widths at which a stroke is a satin stroke under its limit (module doc). */
export type ForbiddenRange = {
  id: string;
  color: string;
  /** The range is `[fromMm, toMm)`: the logo widths, mm, at which the stroke is too narrow. */
  fromMm: number;
  toMm: number;
  /** The median width the range was read from, mm… */
  measuredMm: number;
  /** …at this logo width, mm. */
  atWidthMm: number;
  /** The limit the stroke is held to at the end of the range, mm. */
  limitMm: number;
  kind: SizeRangeKind;
};

export type SizeLimits = { satinMinMm: number; shadowMinMm: number };

const DEFAULT_LIMITS: SizeLimits = {
  satinMinMm: SATIN_STROKE_MIN_MM,
  shadowMinMm: SHADOW_LINE_MIN_MM,
};

const byFrom = (p: ForbiddenRange, q: ForbiddenRange): number =>
  p.fromMm - q.fromMm || p.toMm - q.toMm || (p.id < q.id ? -1 : p.id > q.id ? 1 : 0);

/**
 * The ranges of logo widths, measured at `atWidthMm`, in which the shapes are satin strokes under
 * their limit — by where they begin. A shape that is no satin now (a running stitch) has one from
 * where it turns satin; a wide area has none. `railGapsMm` of a measure, where it has any, is what
 * ends the shadow line status (module doc).
 */
export function forbiddenRanges(
  measures: ShapeMeasure[],
  atWidthMm: number,
  limits: SizeLimits = DEFAULT_LIMITS,
): ForbiddenRange[] {
  const out: ForbiddenRange[] = [];
  for (const m of measures) {
    const w = m.widthMm;
    if (m.shapeClass === "tatami" || !(w > 0) || !Number.isFinite(w)) continue;
    // In units of the size the measurement was made at: the factor k of `k·w`.
    const satinFrom = SATIN_FROM_MM / w;
    const start = Math.max(1, satinFrom);
    const startKind: SizeRangeKind = satinFrom > 1 ? "becomes-satin" : "too-narrow";
    // The smallest gap decides: the stroke is a shadow line while ANY rail is at a gap.
    const gapOpens = m.railGapsMm.length > 0 ? FABRIC_GAP_MAX_MM / Math.min(...m.railGapsMm) : 0;
    const add = (from: number, to: number, limitMm: number, kind: SizeRangeKind): void => {
      if (!(from < to)) return;
      out.push({
        id: m.id,
        color: m.color,
        fromMm: atWidthMm * from,
        toMm: atWidthMm * to,
        measuredMm: w,
        atWidthMm,
        limitMm,
        kind,
      });
    };
    if (gapOpens > start) {
      // A shadow line until its gap is 1.0 mm — held to the limit of a shadow line — then an ordinary stroke.
      add(start, Math.min(gapOpens, limits.shadowMinMm / w), limits.shadowMinMm, startKind);
      add(gapOpens, limits.satinMinMm / w, limits.satinMinMm, "loses-shadow");
    } else {
      add(start, limits.satinMinMm / w, limits.satinMinMm, startKind);
    }
  }
  return out.sort(byFrom);
}

/**
 * The smallest size from `fromMm` that lies in none of the `ranges` (half open: the end is outside,
 * the start inside), with the range whose end it is — the last one it had to get past. With `whole`
 * a whole number of millimetres, rounded up: a size inside a range is followed to the end of it,
 * rounded up, and so on until one lies in none.
 */
export function smallestWidthOutside(
  ranges: ForbiddenRange[],
  fromMm: number,
  opts: { whole?: boolean } = {},
): { widthMm: number; by?: ForbiddenRange } {
  const whole = opts.whole === true;
  const up = (x: number): number => (whole ? Math.ceil(x - WHOLE_EPS) : x);
  // A range that ends within the tolerance of a whole number ends there.
  const tolerance = whole ? WHOLE_EPS : 0;
  let s = up(fromMm);
  let by: ForbiddenRange | undefined;
  for (;;) {
    // Of the ranges that hold it, the one that reaches furthest: fewest steps, and the same on every run.
    let hit: ForbiddenRange | undefined;
    for (const r of ranges) {
      if (!(r.fromMm <= s && s < r.toMm - tolerance)) continue;
      if (hit === undefined || r.toMm > hit.toMm || (r.toMm === hit.toMm && r.id < hit.id)) hit = r;
    }
    if (hit === undefined) return by === undefined ? { widthMm: s } : { widthMm: s, by };
    s = up(hit.toMm);
    by = hit;
  }
}

/** A stretch of logo widths that is in some range: where the ranges overlap or touch, they are one. */
export type WidthSpan = {
  fromMm: number;
  toMm: number;
  /** The ranges it is made of, by where they begin. */
  ranges: ForbiddenRange[];
};

/** The ranges as stretches of logo widths, by where they begin. */
export function mergeRanges(ranges: ForbiddenRange[]): WidthSpan[] {
  const spans: WidthSpan[] = [];
  for (const r of [...ranges].sort(byFrom)) {
    const last = spans[spans.length - 1];
    if (last !== undefined && r.fromMm <= last.toMm) {
      last.toMm = Math.max(last.toMm, r.toMm);
      last.ranges.push(r);
    } else {
      spans.push({ fromMm: r.fromMm, toMm: r.toMm, ranges: [r] });
    }
  }
  return spans;
}

export type MinimumSizeSearchOptions = {
  /** The ordered logo width, mm: where the search starts, and the size it never goes below. */
  orderedWidthMm: number;
  /** The preset the columns are set with (`underlapMm`). Default Piqué. */
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

/** One check of the search: a logo width, and how many satin strokes were under their limit in it. */
export type SearchStep = { widthMm: number; under: number };

export type MinimumSizeSearch = {
  /** The ordered logo width the search started from, mm. */
  orderedWidthMm: number;
  /**
   * The minimum size, mm: where `found`, the smallest size from the ordered one at which the check
   * finds no satin stroke under its limit — the ordered size itself where that holds, else a whole
   * number of millimetres. Where not, the last size checked: no size that holds.
   */
  widthMm: number;
  /** False where the search gave up (`reason`). */
  found: boolean;
  /** Why it gave up: `steps` (`maxSteps` checks made) or `factor` (the next size was above `maxFactor`). */
  reason?: "steps" | "factor";
  /** The minimum size is above the ordered one: the program is made in `widthMm`. */
  enlarged: boolean;
  /** The ordered size is under the minimum size — or, where none was found, has strokes under their limit. */
  belowMinimum: boolean;
  /**
   * The stroke that sets the size found, as the range at whose end it lies — with its width, the
   * logo width it was measured at, and its limit. Absent where the ordered size holds.
   */
  decisive?: ForbiddenRange;
  /** Every check made, in order: the ordered size first, the size found last. */
  steps: SearchStep[];
  /** The satin strokes held to the lower limit at the size found (`MinimumSizeResult.shadowLines`). */
  shadowLines: string[];
  /**
   * The ranges above the size found, by where they begin (module doc): where a stroke would be too
   * narrow in a larger logo. Empty where none was found.
   */
  above: ForbiddenRange[];
  /** The limits it ran with, mm. */
  limits: SizeLimits;
};

function requirePositive(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive number, got ${value}`);
  }
}

/**
 * The minimum size of a logo (module doc). `shapesAt(w)` gives the shapes of the logo at the width
 * `w` mm, read the way the run reads them — for a file the SVG imported at that width; an implementation
 * that scales the coordinates does the same. It is asked once per check, and for no other size.
 */
export function findMinimumSize(
  shapesAt: (widthMm: number) => ImportedShape[],
  opts: MinimumSizeSearchOptions,
): MinimumSizeSearch {
  const ordered = opts.orderedWidthMm;
  const limits: SizeLimits = {
    satinMinMm: opts.satinMinMm ?? SATIN_STROKE_MIN_MM,
    shadowMinMm: opts.shadowMinMm ?? SHADOW_LINE_MIN_MM,
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
  const measureOpts = { preset, railsBelowMm: Math.max(limits.satinMinMm, limits.shadowMinMm) };
  const cap = ordered * maxFactor;

  const steps: SearchStep[] = [];
  let width = ordered;
  let shapes = shapesAt(width);
  let measures = measureShapes(shapes, measureOpts);
  let decisive: ForbiddenRange | undefined;
  let found = false;
  let reason: MinimumSizeSearch["reason"];

  for (;;) {
    const under = measures.filter((m) => isTooNarrow(m, limits)).length;
    steps.push({ widthMm: width, under });
    if (under === 0) {
      found = true;
      break;
    }
    if (steps.length >= maxSteps) {
      reason = "steps";
      break;
    }
    // Below the end of the ranges of the satin strokes every size fails; the next one to check is
    // the first whole millimetre outside them (module doc). It lies above this one: the strokes
    // under their limit here are in a range that holds the size.
    const ranges = forbiddenRanges(
      measures.filter((m) => m.shapeClass === "satin"),
      width,
      limits,
    );
    const next = smallestWidthOutside(ranges, width, { whole: true });
    const nextWidth = Math.max(next.widthMm, Math.floor(width) + 1);
    if (nextWidth > cap) {
      reason = "factor";
      break;
    }
    decisive = next.by;
    width = nextWidth;
    shapes = shapesAt(width);
    measures = measureShapes(shapes, measureOpts);
  }

  const shadowLines = found
    ? measures
        .filter((m) => m.shapeClass === "satin" && m.shadowLine && m.widthMm < limits.satinMinMm)
        .map((m) => m.id)
    : [];
  const above = found
    ? forbiddenRanges(addRunningRails(measures, shapes, preset), width, limits).filter(
        (r) => r.fromMm > width,
      )
    : [];
  return {
    orderedWidthMm: ordered,
    widthMm: width,
    found,
    ...(reason === undefined ? {} : { reason }),
    enlarged: found && width > ordered,
    belowMinimum: steps[0]!.under > 0,
    ...(found && decisive !== undefined ? { decisive } : {}),
    steps,
    shadowLines,
    above,
    limits,
  };
}
