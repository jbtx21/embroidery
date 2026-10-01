/**
 * Fineness and minimum size, checked BEFORE stitching (spec §5.2, second version): which
 * elements of a logo are too fine at the ordered size, and from what logo width they hold.
 *
 * A logo that works as a print is not clean in every size when stitched: a satin
 * stroke that is too narrow sinks into the fabric, a gap that is too narrow sews
 * shut. This module only reports. It changes nothing in the template (rule 8, no
 * silent repairs) — sewing it larger, simplifying it or leaving it is the user's
 * decision. It reads the shapes `importShapes` returns, in document order (the
 * stacking order), at the size of the SVG.
 *
 * - **Satin stroke**: a shape the template classifies as satin (`classifyShape`,
 *   spec §7.8.1) whose median width is under `SATIN_STROKE_MIN_MM` — or, for a **shadow line**
 *   (spec §5.2, 30.09.2026), under `SHADOW_LINE_MIN_MM`: a stroke of which at least one rail lies at
 *   a fabric gap under 1.0 mm, measured as the pull compensation per rail measures it (spec §7.8.3
 *   rule 1, `railGaps`: along the rungs, outwards, median over the column; a form that touches or
 *   lies under 0.1 mm away is no gap). A shape with several columns needs one column with such a
 *   rail. The limit does not hang on the width of the stroke: as satin it always holds, since
 *   satin starts at that width. `measureShapes` reads this once per shape and size; the search
 *   over the size (`min-size-search.ts`) reads the same, once, in the ORDERED size.
 * - **Check points of the gate** (spec §5.2, "Tor", and §13.4, 01.10.2026). The gate decides which
 *   strokes count in the ordered size and keeps them (`orderedStrokes`, `OrderedStroke`); given that
 *   set (`ordered`) the check tells the satin findings of the size it runs at apart: `satin-stroke`,
 *   a stroke of the set under the limit it had in the ordered size; `satin-late`, a form that was no
 *   satin stroke in the ordered size, is one in this size and lies under its limit — it did not set the
 *   size, it is a check point; `satin-near`, a stroke that holds but is narrower than the typical
 *   column of the archive (`SATIN_TYPICAL_MM`, 1.3 mm) — a shadow line is no such stroke, it is held to
 *   0.7 mm and stitches cleanly at 0.75 mm. Without the set the check knows the one limit and finds the
 *   first kind only.
 * - **Gap**: the shapes of one colour are united and closed by half the limit
 *   (out and back, as `smoothOutline` does, spec §7.8.4). What the closing adds
 *   is a gap narrower than `GAP_MIN_MM`, unless a later shape covers it whole.
 * - **Fabric gap** (spec §5.2, "Stofflücken zwischen Farben"): the same closing over the shapes
 *   of ALL colours together. What it adds is fabric that stays visible between two elements — the
 *   channel between a letter and its shadow line. There is no cover check: a shape that lies over
 *   the place, whether stitched before or after, is part of the union, so what the closing adds
 *   lies on no shape at all. A place a colour already reports as a gap is not reported again (see
 *   below).
 *
 * The width where an element holds is the ordered width times the limit over the
 * measured width — a logo made larger makes every width larger in proportion. There are
 * two numbers, not one:
 *
 * - the **minimum size** comes from the satin strokes alone: the width from which all are at
 *   least `SATIN_STROKE_MIN_MM`, with the narrowest stroke named. Where every stroke holds it is
 *   below the ordered width — how far the logo could shrink;
 * - **all gaps open from** the largest width any gap or fabric gap holds from, with that gap
 *   named. Fine channels (the 0.25 mm between rim and body of varsity lettering, the 0.5 mm
 *   between a letter and its shadow) push it far above the minimum size; whether they may sew
 *   shut is the user's call.
 *
 * **The filter for gaps** (spec §5.2, second version). Vectorised logos have hairline slits
 * between shapes of one colour, roundings of every concave corner and slivers a micrometre
 * thin; none is a gap on the fabric. What the closing adds goes through four steps, and
 * each piece that falls out is counted (`ignored`), never dropped silently. Fabric gaps go
 * through the same four (`fabricIgnored`):
 *
 * 1. Slivers thinner than `GAP_SLIVER_MM` come off before anything is measured: the piece is
 *    opened by half of it. A piece that is nothing but sliver is gone (`slivers`).
 * 2. The width is read every `GAP_SAMPLE_MM` (`medianShapeWidthMm` with `sampleMm`), because
 *    the standard sampling reads a strip of 0.2 mm as 0.32 mm.
 * 3. A piece under `GAP_THIN_MM` — the DST resolution — does not count (`thin`).
 * 4. A piece without a medial axis does not count (`compact`): the rounding of a concave
 *    corner, a short gap between small shapes. Only a hole the closing fills whole, a
 *    counter, is measured by the circle that fits in it, and counts from that circle up.
 *
 * "Without a medial axis" is what `medianShapeWidthMm` finds at its STANDARD sampling. The
 * rule says roundings have none; at 0.1 mm every rounding has one (a right angle rounded at
 * 0.4 mm reads 0.12 mm) and would count as a gap 0.12 mm wide. On six customer logos that is
 * 134, 374, 294, 173, 124 and 2744 gaps instead of 49, 109, 186, 74, 57 and 1153, and "all gaps
 * open from" pinned at eight times the ordered width (the width the 0.1 mm limit allows). So the
 * axis is looked for as the engine always looks for it, and only the width is read finer. The
 * price: a strip between 0.1 and 0.15 mm has no axis at the standard sampling and is left out (a
 * blind band), and so is a compact gap under a millimetre across.
 *
 * **One place, one finding.** The closing of all shapes contains what the closing of each colour
 * adds (closing grows with the set), so the fabric closing meets every gap of a colour again. The
 * polygons of the gaps a colour reports are taken off its pieces, and what is left goes through
 * the filter once more (`duplicate`: a piece that lies wholly within reported gaps). Only what
 * is REPORTED is taken off, not everything a colour's closing added: a piece its own filter left
 * out (a rounding, a short gap between small shapes) may grow, with the shapes of other colours
 * near it, into a fabric gap that counts.
 *
 * Known limits (measured 29.09.2026 on six customer logos):
 *
 * - Small pieces that do have an axis — the wedge where three shapes meet, the tip of a notch,
 *   a hole of 0.1 mm; under a millimetre across, read 0.1 to 0.25 mm — still count, and set
 *   "all gaps open from" on five of the six logos (on the sixth, a slit hole of 0.1 × 1.85 mm).
 *   The channels that matter are 3 mm long or more: with that as a minimum the number would be
 *   163 to 522 mm instead of 365 to 1598 mm.
 * - A strip of 0.05 to 0.1 mm still reads 0.10 to 0.14 mm at 0.1 mm sampling and passes step 3.
 * - The standard sampling grows with the perimeter of a piece (perimeter / 300, up to 2 mm), so
 *   a large piece may lose its axis where a small one of the same width keeps it.
 * - A gap that a later shape covers only in part is reported whole.
 * - Fabric gaps run over areas only: a stroked line (a running stitch) neither fills a fabric
 *   gap nor makes one, as it covers no gap of a colour.
 * - Measured 29.09.2026 (fabric gaps): Hofbräu 110 mm has 78 — channels of 0.40 mm (small
 *   lettering) and 0.53 mm (large) between letters and their shadow lines, and pieces of 0.2 to
 *   0.3 mm where a shadow ends or nears a letter. The second number rises from 297 to 434 mm, set
 *   by a real channel of 0.20 mm and 4 mm length at the top of the H. Of the six customer logos
 *   four have none or a few (0, 0, 3, 2), the two of Atzensport 59 and 65; only Atzensport 80 mm
 *   changes its second number (494 to 517 mm), by a wedge 0.12 mm wide and 0.7 mm long. The three
 *   of Köln are seams of 0.10 to 0.12 mm between abutting shapes of two colours: the strip of 0.05
 *   to 0.1 mm above, now between colours.
 * - Where a fabric gap and the gap of a colour meet, the fabric gap is what is left once the gap
 *   of the colour is taken off: its polygon is not the whole channel, and each square millimetre
 *   is in one finding only.
 * - Fabric gaps have the same blind spots as the gaps of a colour (the band of 0.1 to 0.15 mm,
 *   short gaps between small shapes) and the same wedges: where three shapes meet, now of three
 *   colours, which happens more often than of one.
 * - A shape under everything else (a background the size of the page) is part of the union and
 *   leaves no fabric to find: the check does not know a background from a logo element.
 */
import type { Point, Polygon, Rect } from "@texma-stitch/geometry";
import {
  difference,
  intersect,
  offset,
  offsetAll,
  pointInPolygon,
  polygonArea,
  polygonBbox,
  union,
} from "@texma-stitch/geometry";
import type { ImportedAreaShape, ImportedShape } from "../import/svg.js";
import { medianShapeWidthMm } from "../import/svg.js";
import type { Preset } from "../presets.js";
import { PRESETS } from "../presets.js";
import type { ShapeClass } from "./classify.js";
import { classifyShape, SATIN_FROM_MM } from "./classify.js";
import { satinColumns } from "./columns.js";
import type { Form, FormIndex } from "./rail-pull.js";
import { FABRIC_GAP_MAX_MM, formIndex, isFabricGap, railGaps } from "./rail-pull.js";
import { designForms } from "./template.js";

/**
 * A load-bearing satin stroke narrower than this is too fine (spec §5.2): 1.3 mm decided 29.09.2026,
 * lowered to 1.0 mm on 01.10.2026 — the usual lower limit for satin. Measured at the gate with 1.3 mm:
 * STUTTGART 80 mm → 118 mm, Köln 90 mm → 169 mm; with 1.0 mm 91 and 144 mm.
 */
export const SATIN_STROKE_MIN_MM = 1.0;
/**
 * The typical satin column of a file in the TEXMA archive: p5 of the mean satin width per file over 192
 * production files, 1.29 mm (minimum 1.05, median 1.98) — the old limit. It describes the typical
 * column of a file, not the narrowest that holds: a satin stroke between `SATIN_STROKE_MIN_MM` and this
 * holds, and is a check point (`satin-near`, spec §13.4); the trial stitch-out confirms or corrects it.
 */
export const SATIN_TYPICAL_MM = 1.3;
/**
 * A shadow line — a satin stroke with a rail at a fabric gap under 1.0 mm — narrower than this is
 * too fine (spec §5.2, decided 30.09.2026). It is where satin starts (`SATIN_FROM_MM`, spec §7.8.1):
 * as satin a shadow line always holds. Origin: the professional cap "Stuttgarter Hofbräu", whose
 * golden shadow lines of 0.75 mm stitch cleanly at 110 mm.
 */
export const SHADOW_LINE_MIN_MM = SATIN_FROM_MM;
/**
 * A gap within one colour narrower than this sews shut (spec §5.2, decided 29.09.2026).
 * ESTIMATE, not a measurement: twice the pull compensation (0.2 mm per side, spec §7.2)
 * plus one thread strand (0.4 mm, `SINGLE_PASS_MAX_MM`). To be measured against
 * professional files and the trial stitch-out.
 */
export const GAP_MIN_MM = 0.8;
/**
 * Slivers thinner than this are taken off a closing piece before it is measured (spec §5.2,
 * second version): the piece is opened by half of it. What the polygon clipper leaves along
 * an edge, and the hairline seams between abutting shapes, are thinner than this.
 */
export const GAP_SLIVER_MM = 0.01;
/**
 * The width of a closing piece is read with the outline sampled this finely (spec §5.2, second
 * version). The standard sampling of `medianShapeWidthMm` reads a strip of 0.2 mm as 0.32 mm.
 */
export const GAP_SAMPLE_MM = 0.1;
/**
 * A closing piece narrower than this is not a gap (spec §5.2, second version): 0.1 mm is the
 * DST resolution, the fabric shows nothing finer.
 */
export const GAP_THIN_MM = 0.1;

/** Reach for "this shape borders the piece": the piece lies on the edges of its neighbours. */
const BORDER_REACH_MM = 0.05;
/** Overlap above this (mm²) is an overlap, not a rounding of the polygon clipper. */
const OVERLAP_MIN_MM2 = 1e-6;
/** A piece is the very hole it fills where area and box agree this closely. */
const HOLE_MATCH_MM = 1e-3;
/** Bisection steps for the inscribed circle: 0.4 mm down to well under a micrometre. */
const INSCRIBED_STEPS = 20;

export type MinimumSizeKind = "satin-stroke" | "satin-late" | "satin-near" | "gap" | "fabric-gap";

export type MinimumSizeFinding = {
  /**
   * The shape's id for a satin stroke (any of the three kinds); `gap-<colour>-<nnn>` for a gap,
   * numbered per colour in reading order (top to bottom, left to right) among every piece the closing
   * added, with `-2`, `-3` for the further parts of a piece the opening fell apart; `fabric-<nnn>` for
   * a fabric gap, numbered the same way among every piece the closing of all shapes added.
   */
  id: string;
  /**
   * `satin-stroke`: under its limit; `satin-late`: under its limit, and no satin stroke in the ordered
   * size (given `MinimumSizeOptions.ordered`); `satin-near`: holds, but narrower than the typical column
   * (given `ordered` too).
   */
  kind: MinimumSizeKind;
  /**
   * The colour of the shape (satin stroke) or of the gap. A fabric gap belongs to no colour: this
   * is the colours of the shapes it lies on, joined by `+` in the order they first appear in the
   * document (`#d2060d+#d1b35a`).
   */
  color: string;
  /** Width measured at the ordered size, mm. */
  measuredMm: number;
  /**
   * How it was measured: the median width of the shape (spec §5.2), or, for a hole the closing
   * fills whole — a counter, which has no medial axis — the circle that fits in it.
   */
  measure: "median" | "inscribed-circle";
  /**
   * The limit it falls under, mm: for `satin-near` the typical column it is narrower than; for a stroke of
   * the set (`satin-stroke` given `ordered`) the limit it had in the ordered size.
   */
  limitMm: number;
  /** Logo width, mm, from which the element holds: ordered width × limit ÷ measured width. */
  holdsFromWidthMm: number;
  /**
   * The shape (satin stroke) or the piece the closing added, slivers off (gap; a fabric gap
   * without what a colour already reports): what a preview marks.
   */
  polygon: Polygon;
  /**
   * Where to look, mm: the centre of the polygon's bounding box where that lies on the polygon,
   * else — a ring, a channel round a body — the vertex of its outline nearest to it.
   */
  at: Point;
  /**
   * A satin stroke of 0.7 to 1.0 mm may be a thin decorative line, better set as a running
   * stitch (spec §5.2). The check names the possibility; the user decides.
   */
  runningAlternative: boolean;
  /**
   * A satin stroke with a rail at a fabric gap under 1.0 mm — measured against `shadowMinMm`, not
   * `satinMinMm`. Always false for a gap. Only a finding where the limit of a shadow line is raised
   * above satin's start (`MinimumSizeOptions.shadowMinMm`); with the default it never is one. For a
   * stroke of the set (`ordered`) the status of the ordered size.
   */
  shadowLine: boolean;
};

/**
 * A satin stroke of the ORDERED size, as the gate keeps it (spec §5.2, "Tor", 01.10.2026): whether a
 * form is satin (§7.8.1) and whether it is a shadow line is decided in the ordered size and stays, so
 * that a form which only turns satin as the logo grows does not set the size. The limit is the one it
 * has there: a shadow line's or the ordinary one.
 */
export type OrderedStroke = {
  /** The key of the shape (`ShapeMeasure.key`): how it is found again in another size. */
  key: string;
  /** The id of the shape, for the output. */
  id: string;
  color: string;
  /** Median width in the ordered size, mm. */
  widthMm: number;
  /** A rail at a fabric gap under 1.0 mm in the ordered size (`ShapeMeasure.shadowLine`). */
  shadowLine: boolean;
  /** The limit it is held to in every size: `shadowMinMm` for a shadow line, else `satinMinMm`. */
  limitMm: number;
};

export type MinimumSizeOptions = {
  /** The ordered logo width: the width of the SVG, mm. */
  widthMm: number;
  /** Default `SATIN_STROKE_MIN_MM`. */
  satinMinMm?: number;
  /** Default `GAP_MIN_MM`. */
  gapMinMm?: number;
  /** The limit of a shadow line. Default `SHADOW_LINE_MIN_MM`. */
  shadowMinMm?: number;
  /** The typical column, over which a stroke is no check point. Default `SATIN_TYPICAL_MM`. */
  typicalMm?: number;
  /**
   * The satin strokes of the ordered size (`orderedStrokes`, `MinimumSizeSearch.ordered`). Given, the
   * check holds those to the limit they have there and tells the other satin findings apart: a form
   * under its limit that is not in the set is `satin-late`, a stroke between the limit and the typical
   * column is `satin-near` (module doc). The minimum size then comes from the strokes of the set alone.
   * Without it the check knows one limit for every satin stroke, and `satin-stroke` is the only kind.
   */
  ordered?: readonly OrderedStroke[];
  /**
   * The preset the satin columns are set with — only `underlapMm` is read, for the rails of a stroke
   * whose shadow line status is asked. Default Piqué, as the template's default.
   */
  preset?: Preset;
};

/** What the gap filter took out — every part that was measured is in one of these or a finding. */
export type MinimumSizeIgnored = {
  /** Pieces of the closing that the opening took off whole: thinner than `GAP_SLIVER_MM` everywhere. */
  slivers: number;
  /** Parts narrower than `GAP_THIN_MM`, or a counter whose circle is. */
  thin: number;
  /**
   * Parts without a medial axis that are not a hole: the rounding of a concave corner (a
   * quarter circle of half the limit leaves (1 − π/4)·0.4² = 0.034 mm² in a right angle), a short
   * gap between small shapes, a hairline too thin for an axis.
   */
  compact: number;
  /** Parts whose median width reads at or above the limit. */
  wide: number;
  /** Gaps under the limit that a later shape of another colour covers completely. */
  covered: number;
};

/** What the filter took out of the fabric gaps: the same kinds as for a colour, and duplicates. */
export type MinimumSizeFabricIgnored = {
  /** Pieces of the closing of all shapes that the opening took off whole (as `slivers` above). */
  slivers: number;
  /** As `thin` above. */
  thin: number;
  /** As `compact` above: the rounding of an inner corner where two colours meet, a short gap. */
  compact: number;
  /** As `wide` above. */
  wide: number;
  /**
   * Pieces that lie wholly within gaps a colour already reports: the place is reported once, there.
   */
  duplicate: number;
};

export type MinimumSizeResult = {
  /** The ordered logo width the check ran at, mm. */
  widthMm: number;
  /** The limits it ran with, mm — the options, or their defaults. */
  limits: { satinMinMm: number; gapMinMm: number; shadowMinMm: number; typicalMm: number };
  /** Whether the check was given the set of the ordered size (`MinimumSizeOptions.ordered`). */
  ordered: boolean;
  /** All kinds, the largest `holdsFromWidthMm` first. */
  findings: MinimumSizeFinding[];
  /**
   * The minimum size at this size's measurement, mm: the logo width from which every satin stroke
   * holds its limit (`limits.satinMinMm`, `limits.shadowMinMm` for a shadow line), as the widths
   * scale linearly. Above `widthMm` where a stroke is too fine, below it where every one holds.
   * Absent for a logo without a satin stroke. A reading of this one size: the size the logo must
   * be stitched at is found by searching over the size (`findMinimumSize`, spec §5.2, Tor). Given
   * `ordered`, from the strokes of the set alone.
   */
  minimumWidthMm?: number;
  /**
   * The satin stroke that holds from the largest width, which sets `minimumWidthMm` — the
   * narrowest where all limits are equal. It is in `findings` where it is too fine; otherwise it
   * is the stroke the logo could shrink down to.
   */
  decisive?: MinimumSizeFinding;
  /**
   * The satin strokes the lower limit is applied to: a rail at a fabric gap under 1.0 mm and
   * narrower than `limits.satinMinMm` — by id, in document order. Without the shadow line they
   * would be findings. The status of this size, whatever `ordered` says.
   */
  shadowLines: string[];
  /**
   * The width from which all gaps stay open, mm: the largest `holdsFromWidthMm` of the gap and
   * fabric-gap findings. Absent without one.
   */
  gapsOpenFromWidthMm?: number;
  /** The gap or fabric gap that sets `gapsOpenFromWidthMm`. */
  decisiveGap?: MinimumSizeFinding;
  /** Every piece the closing added, over all colours — before the filter. */
  gapPieces: number;
  /** The parts of those pieces that were measured, once the opening took the slivers off. */
  gapParts: number;
  ignored: MinimumSizeIgnored;
  /** Every piece the closing of all shapes together added — before the filter. */
  fabricPieces: number;
  /**
   * The parts of those pieces that were measured, once the opening took the slivers off and the
   * gaps of a colour were taken off: `fabricPieces` = `fabricParts` + `slivers` + `duplicate`, and
   * `fabricParts` = the fabric gaps found + `thin` + `compact` + `wide`.
   */
  fabricParts: number;
  fabricIgnored: MinimumSizeFabricIgnored;
};

/** Logo width from which an element of `measuredMm` holds its `limitMm` (module doc). */
export const holdsFromWidth = (
  orderedWidthMm: number,
  limitMm: number,
  measuredMm: number,
): number => (orderedWidthMm * limitMm) / measuredMm;

/** An area shape with its place in the document and its box. */
type Area = { index: number; shape: ImportedAreaShape; box: Rect };

const centre = (box: Rect): Point => ({
  x: (box.minX + box.maxX) / 2,
  y: (box.minY + box.maxY) / 2,
});

/** A point of the polygon's own to mark it by: the centre of its box, if that is on it (module doc). */
function anchor(polygon: Polygon, box: Rect): Point {
  const c = centre(box);
  if (pointInPolygon(polygon, c)) return c;
  let best = polygon.outer[0] ?? c;
  let bestD = Infinity;
  for (const ring of [polygon.outer, ...polygon.holes]) {
    for (const p of ring) {
      const d = (p.x - c.x) ** 2 + (p.y - c.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
  }
  return best;
}

const boxesOverlap = (a: Rect, b: Rect): boolean =>
  a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY;

const grow = (box: Rect, by: number): Rect => ({
  minX: box.minX - by,
  minY: box.minY - by,
  maxX: box.maxX + by,
  maxY: box.maxY + by,
});

const totalArea = (polys: Polygon[]): number => polys.reduce((sum, p) => sum + polygonArea(p), 0);

/** Reading order, on a grid of 10 µm so that the noise of the last digit does not decide. */
const readingOrder = (p: { box: Rect }, q: { box: Rect }): number =>
  Math.round(p.box.minY * 100) - Math.round(q.box.minY * 100) ||
  Math.round(p.box.minX * 100) - Math.round(q.box.minX * 100);

/** Separates the id of a shape from its number where an id comes twice (a character no XML attribute may hold). */
const KEY_SEPARATOR = "\u0001";

/**
 * The key of every shape of a list, in document order: the id of an area shape, and for the second
 * and later shape with one id (an SVG may carry an id twice) the id with its number. `undefined` for
 * a line. The same SVG read at another size has the same shapes in the same order, so a shape is
 * found again by its key — what the gate holds to a limit in every size it tries (`OrderedStroke`).
 */
export function areaKeys(shapes: ImportedShape[]): (string | undefined)[] {
  const seen = new Map<string, number>();
  return shapes.map((shape) => {
    if (shape.kind !== "area") return undefined;
    const n = (seen.get(shape.id) ?? 0) + 1;
    seen.set(shape.id, n);
    return n === 1 ? shape.id : `${shape.id}${KEY_SEPARATOR}${n}`;
  });
}

/** What the check reads of one area shape at the size it runs at (`measureShapes`). */
export type ShapeMeasure = {
  /** The id of the shape, as the output names it. */
  id: string;
  /** How the shape is found again in another size (`areaKeys`): the id, unless it comes twice. */
  key: string;
  color: string;
  polygon: Polygon;
  box: Rect;
  /** The class of spec §7.8.1 in this size. */
  shapeClass: ShapeClass;
  /** Median width (`medianShapeWidthMm`), mm; infinite for a shape without an axis (a disc). */
  widthMm: number;
  /**
   * The gaps of the rails that lie at a fabric gap (spec §7.8.3 rule 1, `railGaps`), mm: one per
   * such rail, over all columns of the shape — each the median over its column. Empty where no rail
   * lies at one, where the shape has no columns that hold, where it is no satin stroke, or where the
   * stroke is not narrow enough to be asked (`MeasureOptions.railsBelowMm`).
   */
  railGapsMm: number[];
  /** A satin stroke with a rail at a fabric gap: its limit is the one of a shadow line. */
  shadowLine: boolean;
};

export type MeasureOptions = {
  /** The preset the columns are set with (`underlapMm`). Default Piqué. */
  preset?: Preset;
  /**
   * The rails — and with them `railGapsMm` and `shadowLine` — are only asked of satin strokes narrower
   * than this, mm. A stroke at or above the largest limit asked about is under none of them whatever
   * its rails are, and the columns are the dearest part of the measurement: `checkMinimumSize` and
   * `findMinimumSize` pass that limit. Default: every satin stroke.
   */
  railsBelowMm?: number;
};

/**
 * A form whose box lies this near the box of a shape can be the other side of a fabric gap of one of
 * its rails: the gap is under `FABRIC_GAP_MAX_MM`, the ray looks 0.3 mm further, and a rail lies at
 * most 0.15 mm off the outline. A shape without such a form has no shadow line status to ask for.
 */
const NEIGHBOUR_REACH_MM = FABRIC_GAP_MAX_MM + 1;

/** Is there another form near enough to lie at a fabric gap from the shape (`NEIGHBOUR_REACH_MM`)? */
function hasNeighbour(id: string, box: Rect, forms: FormIndex): boolean {
  const reach = grow(box, NEIGHBOUR_REACH_MM);
  return forms.forms.some((e) => e.form.shapeId !== id && boxesOverlap(e.box, reach));
}

/**
 * The gaps of the rails of a shape set as satin columns that lie at a fabric gap under 1.0 mm
 * (`railGaps`): the same columns the template sets, the same forms it measures against.
 */
function railGapsOf(
  polygon: Polygon,
  id: string,
  own: Form | undefined,
  forms: FormIndex,
  preset: Preset,
): number[] {
  const plan = satinColumns(polygon, { underlapMm: preset.underlapMm, idPrefix: id });
  if (!plan.ok) return [];
  const gaps: number[] = [];
  for (const column of plan.columns) {
    for (const gap of railGaps(column, own, forms)) if (isFabricGap(gap)) gaps.push(gap);
  }
  return gaps;
}

/** The forms of a design for the rail gaps, and the form of each shape among them (`designForms`). */
function railForms(shapes: ImportedShape[]): { index: FormIndex; own: Map<string, Form> } {
  const forms = designForms(shapes);
  return { index: formIndex(forms), own: new Map(forms.map((f) => [f.shapeId, f])) };
}

/**
 * Class, width and rail gaps of every area shape, in document order, at the size the shapes are in
 * (spec §5.2). Lines are no areas; they are forms for the rail gaps (`designForms`) and nothing else.
 * The columns are only set where they can matter: for a satin stroke that has another form near
 * enough.
 */
export function measureShapes(shapes: ImportedShape[], opts: MeasureOptions = {}): ShapeMeasure[] {
  const preset = opts.preset ?? PRESETS.pique;
  const railsBelow = opts.railsBelowMm ?? Infinity;
  const { index, own } = railForms(shapes);
  const keys = areaKeys(shapes);
  const out: ShapeMeasure[] = [];
  shapes.forEach((shape, i) => {
    if (shape.kind !== "area") return;
    const cls = classifyShape(shape.polygon, shape.id);
    const box = polygonBbox(shape.polygon);
    const satin = cls.shapeClass === "satin";
    const railGapsMm =
      satin && cls.widthMm < railsBelow && hasNeighbour(shape.id, box, index)
        ? railGapsOf(shape.polygon, shape.id, own.get(shape.id), index, preset)
        : [];
    out.push({
      id: shape.id,
      key: keys[i]!,
      color: shape.color,
      polygon: shape.polygon,
      box,
      shapeClass: cls.shapeClass,
      widthMm: cls.widthMm,
      railGapsMm,
      shadowLine: satin && railGapsMm.length > 0,
    });
  });
  return out;
}

type SatinLimits = { satinMinMm: number; shadowMinMm: number };

/** The limit a measured satin stroke is held to: a shadow line's, or the ordinary one. */
const limitOf = (m: ShapeMeasure, limits: SatinLimits): number =>
  m.shadowLine ? limits.shadowMinMm : limits.satinMinMm;

/**
 * The satin strokes of the ordered size (spec §5.2, "Tor"): every shape `measures` calls satin, with the
 * limit it is held to there — a shadow line's or the ordinary one — which the gate keeps for every size
 * it tries. `measures` are those of the ordered size, made with `railsBelowMm` of at least the larger
 * limit (a stroke at or above it needs no status: it holds either way).
 */
export function orderedStrokes(measures: ShapeMeasure[], limits: SatinLimits): OrderedStroke[] {
  return measures
    .filter((m) => m.shapeClass === "satin")
    .map((m) => ({
      key: m.key,
      id: m.id,
      color: m.color,
      widthMm: m.widthMm,
      shadowLine: m.shadowLine,
      limitMm: limitOf(m, limits),
    }));
}

type SatinCheckLimits = SatinLimits & { typicalMm: number };

/**
 * The satin findings of one size, the decisive stroke for the minimum size and the shadow lines
 * (module doc). Without `ordered` every satin stroke is held to the limit it has in this size and the
 * only kind is `satin-stroke`. With it:
 *
 * - a stroke of the set is held to the limit it had in the ordered size (a shadow line to the lower
 *   one, whatever its rails say now): under it, it is `satin-stroke`;
 * - a satin stroke not in the set — a form that was no satin stroke there — is held to the limit of
 *   this size (`limitOf`): under it, it is `satin-late`;
 * - a stroke that is not under its limit, is no shadow line in this size and is narrower than the
 *   typical column is `satin-near`. A stroke narrower than the ordinary limit is none of them, where it
 *   only holds because the set calls it a shadow line.
 *
 * Only the strokes of the set decide the minimum size.
 */
function satinFindings(
  measures: ShapeMeasure[],
  widthMm: number,
  limits: SatinCheckLimits,
  ordered: ReadonlyMap<string, OrderedStroke> | undefined,
): {
  findings: MinimumSizeFinding[];
  decisive: MinimumSizeFinding | undefined;
  shadowLines: string[];
} {
  const findings: MinimumSizeFinding[] = [];
  const shadowLines: string[] = [];
  let decisive: MinimumSizeFinding | undefined;
  const finding = (
    m: ShapeMeasure,
    kind: MinimumSizeKind,
    limitMm: number,
    shadowLine: boolean,
  ): MinimumSizeFinding => ({
    id: m.id,
    kind,
    color: m.color,
    measuredMm: m.widthMm,
    measure: "median",
    limitMm,
    holdsFromWidthMm: holdsFromWidth(widthMm, limitMm, m.widthMm),
    polygon: m.polygon,
    at: anchor(m.polygon, m.box),
    runningAlternative: m.widthMm < SATIN_STROKE_MIN_MM,
    shadowLine,
  });
  for (const m of measures) {
    if (m.shapeClass !== "satin") continue;
    if (m.shadowLine && m.widthMm < limits.satinMinMm) shadowLines.push(m.id);
    const kept = ordered?.get(m.key);
    const limitMm = kept !== undefined ? kept.limitMm : limitOf(m, limits);
    const stroke = finding(
      m,
      "satin-stroke",
      limitMm,
      kept !== undefined ? kept.shadowLine : m.shadowLine,
    );
    // The stroke that holds from the largest width decides; the first of equals: the same input
    // names the same stroke. A form that is not in the set sets nothing.
    if (ordered === undefined || kept !== undefined) {
      if (decisive === undefined || stroke.holdsFromWidthMm > decisive.holdsFromWidthMm) {
        decisive = stroke;
      }
    }
    if (m.widthMm < limitMm) {
      findings.push(
        ordered === undefined || kept !== undefined ? stroke : { ...stroke, kind: "satin-late" },
      );
    } else if (
      ordered !== undefined &&
      !m.shadowLine &&
      m.widthMm >= limits.satinMinMm &&
      m.widthMm < limits.typicalMm
    ) {
      findings.push(finding(m, "satin-near", limits.typicalMm, false));
    }
  }
  return { findings, decisive, shadowLines };
}

/**
 * What closing by `radiusMm` adds to the united shapes, and the holes of the union.
 *
 * The offsets of separate polygons do not see each other, so the grown polygons are
 * united before they are shrunk — only then does the closing bridge the space between
 * two letters, or between a rim and the body inside it.
 */
function closingPieces(
  polygons: Polygon[],
  radiusMm: number,
): { pieces: Polygon[]; holes: Polygon[] } {
  const united = union(polygons);
  const closed = offsetAll(union(offsetAll(united, radiusMm)), -radiusMm);
  return {
    pieces: difference(closed, united),
    holes: united.flatMap((p) => p.holes.map((ring) => ({ outer: ring, holes: [] }))),
  };
}

/**
 * What is left of the polygons when everything thinner than `GAP_SLIVER_MM` is taken off:
 * an opening (in, then out) by half of it. May be nothing, or fall apart into several parts.
 */
function withoutSlivers(polys: Polygon[]): Polygon[] {
  const r = GAP_SLIVER_MM / 2;
  return offsetAll(offsetAll(polys, -r), r).filter((p) => polygonArea(p) > OVERLAP_MIN_MM2);
}

/** Is the piece exactly a hole of the united shapes, filled whole — a counter, not a gap between shapes? */
function isFilledHole(piece: Polygon, holes: Polygon[]): boolean {
  if (piece.holes.length > 0) return false;
  const box = polygonBbox(piece);
  const area = polygonArea(piece);
  return holes.some((hole) => {
    const h = polygonBbox(hole);
    return (
      Math.abs(box.minX - h.minX) < HOLE_MATCH_MM &&
      Math.abs(box.minY - h.minY) < HOLE_MATCH_MM &&
      Math.abs(box.maxX - h.maxX) < HOLE_MATCH_MM &&
      Math.abs(box.maxY - h.maxY) < HOLE_MATCH_MM &&
      Math.abs(area - polygonArea(hole)) <= HOLE_MATCH_MM * Math.max(1, area)
    );
  });
}

/** Diameter of the largest circle in the piece: the deepest erosion that leaves something. */
function inscribedDiameterMm(piece: Polygon): number {
  const box = polygonBbox(piece);
  let lo = 0;
  let hi = Math.min(box.maxX - box.minX, box.maxY - box.minY) / 2;
  for (let i = 0; i < INSCRIBED_STEPS; i++) {
    const mid = (lo + hi) / 2;
    if (offset(piece, -mid).some((p) => polygonArea(p) > OVERLAP_MIN_MM2)) lo = mid;
    else hi = mid;
  }
  return 2 * lo;
}

/**
 * Width of a part of a closing piece (module doc, steps 2 and 4): its median width, read
 * every `GAP_SAMPLE_MM` — if it has a medial axis, as the engine's own measure finds it. A
 * hole filled whole has none where it is round or square, and is measured by the circle that
 * fits in it. Anything else without an axis is `undefined`.
 */
function gapWidthMm(
  part: Polygon,
  isHole: boolean,
): { widthMm: number; measure: MinimumSizeFinding["measure"] } | undefined {
  if (Number.isFinite(medianShapeWidthMm(part))) {
    const fine = medianShapeWidthMm(part, { sampleMm: GAP_SAMPLE_MM });
    if (Number.isFinite(fine)) return { widthMm: fine, measure: "median" };
  }
  return isHole ? { widthMm: inscribedDiameterMm(part), measure: "inscribed-circle" } : undefined;
}

/** What the filter makes of a part of a closing piece (module doc, steps 2 to 4, then the limit). */
type Judged =
  | { outcome: "compact" | "thin" | "wide" }
  | { outcome: "gap"; widthMm: number; measure: MinimumSizeFinding["measure"] };

/** One judgement for the gaps of a colour and for fabric gaps: the same filter, by construction. */
function judgePart(part: Polygon, isHole: boolean, limitMm: number): Judged {
  const measured = gapWidthMm(part, isHole);
  if (measured === undefined) return { outcome: "compact" };
  if (measured.widthMm < GAP_THIN_MM) return { outcome: "thin" };
  if (measured.widthMm >= limitMm) return { outcome: "wide" };
  return { outcome: "gap", ...measured };
}

/**
 * Does a later shape of another colour cover the gap completely (spec §5.2)? Later means
 * after the last shape of the gap's own colour that borders it: that is what lies over the
 * seam, like an outline stitched last. A form stitched before a bordering shape lies under
 * it and shows through the gap — a real gap. A gap covered in part is still a gap; what is
 * left over of it must be more than a sliver.
 */
function coveredByLater(
  part: Polygon,
  box: Rect,
  color: string,
  areas: Area[],
  lastOfColour: number,
): boolean {
  const reach = grow(box, BORDER_REACH_MM);
  const grown = offset(part, BORDER_REACH_MM);
  let last = -1;
  for (const a of areas) {
    if (a.shape.color !== color || !boxesOverlap(a.box, reach)) continue;
    if (totalArea(intersect(grown, [a.shape.polygon])) > OVERLAP_MIN_MM2)
      last = Math.max(last, a.index);
  }
  // Nothing found touching it (cannot be, the piece lies on their edges): count every form
  // after the colour's last shape — fewer covers, never more.
  if (last < 0) last = lastOfColour;
  const later = areas.filter(
    (a) => a.index > last && a.shape.color !== color && boxesOverlap(a.box, box),
  );
  if (later.length === 0) return false;
  const left = difference(
    [part],
    later.map((a) => a.shape.polygon),
  );
  return totalArea(withoutSlivers(left)) < OVERLAP_MIN_MM2;
}

/** A colour as it goes into an id: letters and digits, the rest an underscore. */
const idOfColour = (color: string): string => color.replace(/^#/, "").replace(/[^A-Za-z0-9]/g, "_");

function gaps(
  areas: Area[],
  widthMm: number,
  limitMm: number,
): {
  findings: MinimumSizeFinding[];
  pieces: number;
  parts: number;
  ignored: MinimumSizeIgnored;
} {
  const findings: MinimumSizeFinding[] = [];
  const ignored: MinimumSizeIgnored = { slivers: 0, thin: 0, compact: 0, wide: 0, covered: 0 };
  let pieces = 0;
  let parts = 0;

  // Colours in the order they first appear: the same input gives the same numbering.
  const byColour = new Map<string, Area[]>();
  for (const a of areas) {
    const list = byColour.get(a.shape.color) ?? [];
    list.push(a);
    byColour.set(a.shape.color, list);
  }

  for (const [color, group] of byColour) {
    const closing = closingPieces(
      group.map((a) => a.shape.polygon),
      limitMm / 2,
    );
    const boxed = closing.pieces
      .map((piece) => ({ piece, box: polygonBbox(piece) }))
      .sort(readingOrder);
    const lastOfColour = group.reduce((m, a) => Math.max(m, a.index), -1);
    pieces += boxed.length;

    boxed.forEach(({ piece }, i) => {
      // Whether the piece is a counter is decided on the piece as the closing left it: the
      // opening rounds its corners by a few micrometres, which its match with the hole would not survive.
      const isHole = isFilledHole(piece, closing.holes);
      const rest = withoutSlivers([piece])
        .map((part) => ({ part, box: polygonBbox(part) }))
        .sort(readingOrder);
      if (rest.length === 0) {
        ignored.slivers++;
        return;
      }
      rest.forEach(({ part, box }, k) => {
        parts++;
        const judged = judgePart(part, isHole, limitMm);
        if (judged.outcome !== "gap") {
          ignored[judged.outcome]++;
          return;
        }
        if (coveredByLater(part, box, color, areas, lastOfColour)) {
          ignored.covered++;
          return;
        }
        const id = `gap-${idOfColour(color)}-${String(i + 1).padStart(3, "0")}`;
        findings.push({
          id: k === 0 ? id : `${id}-${k + 1}`,
          kind: "gap",
          color,
          measuredMm: judged.widthMm,
          measure: judged.measure,
          limitMm,
          holdsFromWidthMm: holdsFromWidth(widthMm, limitMm, judged.widthMm),
          polygon: part,
          at: anchor(part, box),
          runningAlternative: false,
          shadowLine: false,
        });
      });
    });
  }
  return { findings, pieces, parts, ignored };
}

/**
 * The colours of the shapes a part lies on, in the order they first appear in the document. A
 * piece of the closing lies on the edges of its neighbours, so it is those the grown part
 * (`BORDER_REACH_MM`) overlaps.
 */
function borderingColours(part: Polygon, box: Rect, areas: Area[]): string[] {
  const reach = grow(box, BORDER_REACH_MM);
  const grown = offset(part, BORDER_REACH_MM);
  const colours: string[] = [];
  for (const a of areas) {
    if (colours.includes(a.shape.color) || !boxesOverlap(a.box, reach)) continue;
    if (totalArea(intersect(grown, [a.shape.polygon])) > OVERLAP_MIN_MM2)
      colours.push(a.shape.color);
  }
  return colours;
}

/**
 * Fabric between elements (module doc): what closing the shapes of ALL colours together adds,
 * through the same filter as a gap of a colour. Nothing is covered — what the closing adds lies
 * on no shape. The gaps a colour already reports (`reported`) are taken off first: a place is
 * reported once, there.
 */
function fabricGaps(
  areas: Area[],
  reported: MinimumSizeFinding[],
  widthMm: number,
  limitMm: number,
): {
  findings: MinimumSizeFinding[];
  pieces: number;
  parts: number;
  ignored: MinimumSizeFabricIgnored;
} {
  const findings: MinimumSizeFinding[] = [];
  const ignored: MinimumSizeFabricIgnored = {
    slivers: 0,
    thin: 0,
    compact: 0,
    wide: 0,
    duplicate: 0,
  };
  let parts = 0;

  const closing = closingPieces(
    areas.map((a) => a.shape.polygon),
    limitMm / 2,
  );
  const boxed = closing.pieces
    .map((piece) => ({ piece, box: polygonBbox(piece) }))
    .sort(readingOrder);
  const known = reported.map((f) => ({ polygon: f.polygon, box: polygonBbox(f.polygon) }));

  boxed.forEach(({ piece, box: pieceBox }, i) => {
    const isHole = isFilledHole(piece, closing.holes);
    const opened = withoutSlivers([piece]);
    if (opened.length === 0) {
      ignored.slivers++;
      return;
    }
    // What a colour reports comes off before anything is measured. The difference leaves a
    // hairline along the edge where the two polygons do not quite agree: the opening takes it off.
    const held = known.filter(
      (k) =>
        boxesOverlap(k.box, pieceBox) &&
        totalArea(intersect(opened, [k.polygon])) > OVERLAP_MIN_MM2,
    );
    const remaining =
      held.length === 0
        ? opened
        : withoutSlivers(
            difference(
              opened,
              held.map((k) => k.polygon),
            ),
          );
    if (remaining.length === 0) {
      ignored.duplicate++;
      return;
    }
    const rest = remaining.map((part) => ({ part, box: polygonBbox(part) })).sort(readingOrder);
    rest.forEach(({ part, box }, k) => {
      parts++;
      // A hole is measured by its circle only where it is left whole.
      const judged = judgePart(part, isHole && held.length === 0, limitMm);
      if (judged.outcome !== "gap") {
        ignored[judged.outcome]++;
        return;
      }
      const id = `fabric-${String(i + 1).padStart(3, "0")}`;
      findings.push({
        id: k === 0 ? id : `${id}-${k + 1}`,
        kind: "fabric-gap",
        color: borderingColours(part, box, areas).join("+"),
        measuredMm: judged.widthMm,
        measure: judged.measure,
        limitMm,
        holdsFromWidthMm: holdsFromWidth(widthMm, limitMm, judged.widthMm),
        polygon: part,
        at: anchor(part, box),
        runningAlternative: false,
        shadowLine: false,
      });
    });
  });
  return { findings, pieces: boxed.length, parts, ignored };
}

function requirePositive(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive number of millimetres, got ${value}`);
  }
}

/** Largest `holdsFromWidthMm` first; ties by kind and id, never by the order the geometry happened to come in. */
const byHoldsFrom = (p: MinimumSizeFinding, q: MinimumSizeFinding): number =>
  q.holdsFromWidthMm - p.holdsFromWidthMm ||
  (p.kind < q.kind ? -1 : p.kind > q.kind ? 1 : 0) ||
  (p.id < q.id ? -1 : p.id > q.id ? 1 : 0);

/** The limits of a check or a review, from its options and the defaults; refuses what cannot be a limit. */
function checkLimits(opts: Omit<MinimumSizeOptions, "widthMm">): {
  satinMinMm: number;
  shadowMinMm: number;
  typicalMm: number;
} {
  const satinMinMm = opts.satinMinMm ?? SATIN_STROKE_MIN_MM;
  const shadowMinMm = opts.shadowMinMm ?? SHADOW_LINE_MIN_MM;
  const typicalMm = opts.typicalMm ?? SATIN_TYPICAL_MM;
  requirePositive("satinMinMm", satinMinMm);
  requirePositive("shadowMinMm", shadowMinMm);
  requirePositive("typicalMm", typicalMm);
  return { satinMinMm, shadowMinMm, typicalMm };
}

/** The set of the ordered size as the map the check looks strokes up in, by key. */
const orderedMap = (ordered: readonly OrderedStroke[] | undefined) =>
  ordered === undefined ? undefined : new Map(ordered.map((o) => [o.key, o]));

/**
 * The rails of a stroke are asked where its status can matter: under the larger of the limits, and,
 * given the set of the ordered size, under the typical column (a shadow line is no `satin-near`).
 */
const railsBelowOf = (
  limits: { satinMinMm: number; shadowMinMm: number; typicalMm: number },
  ordered: boolean,
): number => Math.max(limits.satinMinMm, limits.shadowMinMm, ordered ? limits.typicalMm : 0);

/**
 * The fineness check of spec §5.2 (module doc) on the shapes of an SVG, in document order,
 * at the ordered width. Stroked lines are not areas: they neither make a gap nor cover one, nor
 * fill the fabric between two shapes.
 */
export function checkMinimumSize(
  shapes: ImportedShape[],
  opts: MinimumSizeOptions,
): MinimumSizeResult {
  const { widthMm } = opts;
  const gapMinMm = opts.gapMinMm ?? GAP_MIN_MM;
  requirePositive("widthMm", widthMm);
  requirePositive("gapMinMm", gapMinMm);
  const limits = checkLimits(opts);
  const ordered = orderedMap(opts.ordered);

  const areas: Area[] = shapes.flatMap((shape, index) =>
    shape.kind === "area" ? [{ index, shape, box: polygonBbox(shape.polygon) }] : [],
  );

  const satin = satinFindings(
    measureShapes(shapes, {
      railsBelowMm: railsBelowOf(limits, ordered !== undefined),
      ...(opts.preset === undefined ? {} : { preset: opts.preset }),
    }),
    widthMm,
    limits,
    ordered,
  );
  const gapResult = gaps(areas, widthMm, gapMinMm);
  const fabricResult = fabricGaps(areas, gapResult.findings, widthMm, gapMinMm);
  const findings = [...satin.findings, ...gapResult.findings, ...fabricResult.findings].sort(
    byHoldsFrom,
  );
  // The findings are sorted, so the first gap of either kind is the gap that asks for the most.
  const decisiveGap = findings.find((f) => f.kind === "gap" || f.kind === "fabric-gap");
  return {
    widthMm,
    limits: { ...limits, gapMinMm },
    ordered: ordered !== undefined,
    findings,
    ...(satin.decisive
      ? { minimumWidthMm: satin.decisive.holdsFromWidthMm, decisive: satin.decisive }
      : {}),
    shadowLines: satin.shadowLines,
    ...(decisiveGap ? { gapsOpenFromWidthMm: decisiveGap.holdsFromWidthMm, decisiveGap } : {}),
    gapPieces: gapResult.pieces,
    gapParts: gapResult.parts,
    ignored: gapResult.ignored,
    fabricPieces: fabricResult.pieces,
    fabricParts: fabricResult.parts,
    fabricIgnored: fabricResult.ignored,
  };
}

/**
 * The satin findings of one size alone — the three kinds `checkMinimumSize` gives for the strokes,
 * the same, in the same order — without the gap analysis, which is the dearer half: the check points
 * of the gate (spec §5.2, "Tor") are wanted for a size nothing is checked at otherwise.
 */
export function reviewSatin(
  shapes: ImportedShape[],
  opts: Pick<
    MinimumSizeOptions,
    "widthMm" | "satinMinMm" | "shadowMinMm" | "typicalMm" | "preset"
  > & {
    ordered: readonly OrderedStroke[];
  },
): MinimumSizeFinding[] {
  requirePositive("widthMm", opts.widthMm);
  const limits = checkLimits(opts);
  const satin = satinFindings(
    measureShapes(shapes, {
      railsBelowMm: railsBelowOf(limits, true),
      ...(opts.preset === undefined ? {} : { preset: opts.preset }),
    }),
    opts.widthMm,
    limits,
    orderedMap(opts.ordered),
  );
  return satin.findings.sort(byHoldsFrom);
}
