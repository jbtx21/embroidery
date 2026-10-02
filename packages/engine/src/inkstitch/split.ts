/**
 * A wide shape with a narrow band on it, split where the one passes into the other (spec §7.8.7):
 * the wide part stays tatami, the band becomes satin columns — the lollipop, the plug with its
 * cable. A puncher sets them that way; the width classification (`classify.ts`) cannot, because it
 * reads ONE width per shape, and the median over the spine of the medial axis is the head's
 * (spec §5.1): the cable of the Yer logo, 2.4 mm wide and 113 mm long beside a plug 10 mm across,
 * was stitched as tatami at 45° — rows of 3.5 mm that end at the edge, 1,020 stitches of which 399
 * were travel stitches.
 *
 * **Where.** The wide part is what a disc of the satin limit fits in (`AUTOSATIN_MAX_WIDTH_MM`,
 * spec §7.8.1): the shape opened by half of it, out and back, which is the union of every inscribed
 * disc of that size. What the opening leaves of the shape are corners of the wide part, slivers
 * along its edge, and — where there is one — the narrow part. The cut is the edge of the wide part:
 * the arc of the last disc that fits. It needs no axis to follow and no corner to find, and it is
 * the same for a stick on a flank as for one on a tip.
 *
 * **Which pieces are bands.** Only a long, even strip held at one end qualifies, and only if its
 * columns hold. Measured on the customer logos (spec §7.8.7): the pieces the opening leaves are
 * legs and manes of a horse, tips of a leaf, strips between a hole and an edge, corners — they
 * differ from a cable in length against width, in how much their width varies, and in how many
 * ends are held. Every one of the checks below is that difference; each states why it is there.
 *
 * - `bandProfile` reads the three numbers of a piece off its medial axis: length (the longest path
 *   through the axis), width (`medianShapeWidthMm`, the very measure of the classification) and
 *   evenness (the width at the 20th over the 80th percentile along that path, the ends left out).
 * - The cut is not made if the band does not hold as satin columns (`satinColumns`: rails inside the
 *   outline, no crossing, coverage from 85 %): a band that was left in the wide part is reported
 *   (`SplitPlan.kept`) with the reason, as every fallback of the template is (spec §7.8.5).
 *
 * **The seam.** The wide part is stitched first (spec §10.1: areas before satin within a colour) and
 * is tucked `SPLIT_TUCK_MM` under the band's end — the earlier of two touching areas grows under the
 * later by that much (spec §4.1 rule 5) — so the pull of the satin has no gap to open. The tuck
 * lies inside the band, never outside the shape.
 */
import type { MedialAxis, Point, Polygon } from "@texma-stitch/geometry";
import {
  arcLength,
  cumulativeLengths,
  difference,
  intersect,
  medialAxis,
  offset,
  offsetAll,
  polygonArea,
  polygonBbox,
  union,
} from "@texma-stitch/geometry";
import { AUTOSATIN_MAX_WIDTH_MM, medianShapeWidthMm } from "../import/svg.js";
import { KNOCKDOWN_MIN_MM2, KNOCKDOWN_UNDERLAP_MM } from "../resolve-overlaps.js";
import type { SatinColumnsOptions, SatinColumnsResult } from "./columns.js";
import { satinColumns } from "./columns.js";

/** The wide part: the union of every disc of the satin limit that fits in the shape (module doc). */
export const SPLIT_BULK_RADIUS_MM = AUTOSATIN_MAX_WIDTH_MM / 2;
/**
 * The narrowest band, mm: the typical satin column of the TEXMA archive (`SATIN_TYPICAL_MM`,
 * spec §5.2: p5 of the mean satin width per file, 1.29 mm). The gate holds a satin stroke to 1.0 mm
 * and makes one between 1.0 and 1.3 mm a check point; a band is never narrower than that, so the
 * gate has nothing to decide about it (`split.test.ts` holds the two constants together; they are
 * not imported from `min-size.ts`, which imports the template).
 */
export const SPLIT_BAND_MIN_WIDTH_MM = 1.3;
/**
 * A band is at least this many of its own widths long (spec §7.8.7: the cable of the Yer logo reads
 * 46.6, the nearest pieces that are no band 8.5 — two feathers of the Köln eagle — and 8.1, a leg of
 * the STUTTGART horse).
 */
export const SPLIT_BAND_MIN_ASPECT = 12;
/**
 * Evenness of the width along a band, at least (`bandProfile`): 0.7 lets a band narrow to a little
 * over half from one end to the other (3.0 to 1.6 mm reads 0.70) — a satin column takes that — and
 * refuses the leg that tapers to a third (3.0 to 1.0 mm reads 0.54). The cable of the Yer logo
 * reads 0.83, the one piece of the customer logos that fails only this check 0.44.
 */
export const SPLIT_BAND_MIN_UNIFORMITY = 0.7;
/** The wide part is at least this large, mm² — where the repo itself says a cut costs more than it saves (spec §4.1 rule 3). */
export const SPLIT_BULK_MIN_MM2 = KNOCKDOWN_MIN_MM2;
/** …and a disc this many band widths across fits in it. */
export const SPLIT_BULK_MIN_RATIO = 2;
/** The wide part reaches this far under the band, mm: as far as an earlier area grows under a later one it touches (spec §4.1 rule 5). */
export const SPLIT_TUCK_MM = KNOCKDOWN_UNDERLAP_MM;

/** What the opening leaves is cleaned of slivers thinner than this before it is measured, mm (arcs stray by up to 0.04). */
const SLIVER_MM = 0.1;
/** A piece is looked at only from this share of the smallest band's area (`minWidth²` × `minAspect`). */
const CANDIDATE_AREA_SHARE = 0.5;
/**
 * Evenness is the width at the 20th percentile along the band over the width at the 80th. The
 * middle 60 % leave out the stretches where the width is not the band's own: a bend that is a
 * corner (the axis of a mitre reaches into the apex, where the circle is larger), the swell at a
 * socket. 10th over 90th lets one corner decide: a band with a mitre of 110° reads 0.68 where the
 * middle 60 % read 0.75.
 */
const UNIFORMITY_LOW = 0.2;
const UNIFORMITY_HIGH = 0.8;
/** The width along a band is read every so many mm. */
const PROFILE_STEP_MM = 0.25;
/** The ends of the band are left out of its evenness: this many widths at least, and this many mm. */
const PROFILE_TRIM_WIDTHS = 0.75;
const PROFILE_TRIM_MIN_MM = 1.0;
/** The band meets the wide part where the band grown by this much overlaps it… */
const CONTACT_REACH_MM = 0.05;
/** …in a piece of at least this area, mm² (a disc tangent to the band's edge overlaps it by a hair). */
const CONTACT_MIN_MM2 = 0.01;

export type BandProfile = {
  /** The longest path through the medial axis, mm: the band's length, curves and all. */
  lengthMm: number;
  /** The median width over the spine of the axis, mm — `medianShapeWidthMm`, the measure of the classification. */
  widthMm: number;
  /** Width at the 20th over the 80th percentile along the path, its ends left out: 1 for a strip of one width. */
  uniformity: number;
};

type AxisPath = { points: Point[]; radii: number[]; length: number };

/**
 * The longest path through a medial axis (a tree for a shape without holes): the farthest node from
 * any node, then the farthest from that one, by length along the branches. `undefined` for an empty
 * axis. The first of equals wins: the same shape gives the same path.
 */
function longestPath(axis: MedialAxis): AxisPath | undefined {
  const branches = axis.branches.filter((b) => b.points.length >= 2);
  if (branches.length === 0) return undefined;
  const key = (p: Point): string => `${Math.round(p.x * 1e4)}:${Math.round(p.y * 1e4)}`;
  type Edge = { branch: number; reversed: boolean; to: string; length: number };
  const adj = new Map<string, Edge[]>();
  const link = (from: string, edge: Edge): void => {
    const list = adj.get(from);
    if (list === undefined) adj.set(from, [edge]);
    else list.push(edge);
  };
  branches.forEach((b, i) => {
    const a = key(b.points[0]!);
    const z = key(b.points[b.points.length - 1]!);
    const length = arcLength(b.points);
    link(a, { branch: i, reversed: false, to: z, length });
    link(z, { branch: i, reversed: true, to: a, length });
  });

  const farthest = (start: string): { node: string; via: Map<string, Edge & { from: string }> } => {
    const reach = new Map<string, number>([[start, 0]]);
    const via = new Map<string, Edge & { from: string }>();
    const stack = [start];
    let best = start;
    while (stack.length > 0) {
      const at = stack.pop()!;
      for (const e of adj.get(at) ?? []) {
        if (reach.has(e.to)) continue;
        reach.set(e.to, reach.get(at)! + e.length);
        via.set(e.to, { ...e, from: at });
        stack.push(e.to);
        if (reach.get(e.to)! > reach.get(best)!) best = e.to;
      }
    }
    return { node: best, via };
  };

  const a = farthest(key(branches[0]!.points[0]!)).node;
  const { node: z, via } = farthest(a);
  const chain: Edge[] = [];
  for (let at = z; at !== a;) {
    const e = via.get(at)!;
    chain.push(e);
    at = e.from;
  }
  chain.reverse();

  const points: Point[] = [];
  const radii: number[] = [];
  for (const e of chain) {
    const b = branches[e.branch]!;
    const pts = e.reversed ? [...b.points].reverse() : b.points;
    const rs = e.reversed ? [...b.radii].reverse() : b.radii;
    pts.forEach((p, i) => {
      if (points.length > 0 && i === 0) return; // the joint is the end of the last branch
      points.push(p);
      radii.push(rs[i] ?? 0);
    });
  }
  return { points, radii, length: arcLength(points) };
}

/** The clearance radius at arc length `s` along the path, linear between its points. */
function radiusAt(cum: number[], radii: number[], s: number): number {
  let lo = 0;
  let hi = cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid]! <= s) lo = mid;
    else hi = mid;
  }
  const span = cum[hi]! - cum[lo]!;
  const t = span < 1e-12 ? 0 : (s - cum[lo]!) / span;
  return radii[lo]! + (radii[hi]! - radii[lo]!) * t;
}

/** The p-quantile of a sorted list, linear between neighbours. */
function quantile(sorted: number[], p: number): number {
  const at = (sorted.length - 1) * p;
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (at - lo);
}

/**
 * Length, width and evenness of a piece read as a band (module doc). `undefined` for a piece with no
 * medial axis or no spine (a disc, a speck). The evenness is 0 where the path is too short to leave
 * anything after its ends are taken off: such a piece is no band either.
 */
export function bandProfile(piece: Polygon): BandProfile | undefined {
  const path = longestPath(medialAxis(piece));
  if (path === undefined) return undefined;
  const widthMm = medianShapeWidthMm(piece);
  if (!Number.isFinite(widthMm)) return undefined;

  const cum = cumulativeLengths(path.points);
  const trim = Math.max(PROFILE_TRIM_MIN_MM, PROFILE_TRIM_WIDTHS * widthMm);
  const widths: number[] = [];
  for (let s = trim; s <= path.length - trim; s += PROFILE_STEP_MM) {
    widths.push(2 * radiusAt(cum, path.radii, s));
  }
  if (widths.length < 3) return { lengthMm: path.length, widthMm, uniformity: 0 };
  widths.sort((a, b) => a - b);
  const wide = quantile(widths, UNIFORMITY_HIGH);
  return {
    lengthMm: path.length,
    widthMm,
    uniformity: wide > 0 ? quantile(widths, UNIFORMITY_LOW) / wide : 0,
  };
}

/** One band of a split shape: its piece, what was read off it, and the columns that hold it. */
export type SplitBand = BandProfile & {
  /** Position among the pieces that met the rule, in reading order — it names the band (`<id>_band<index>`). */
  index: number;
  /** The narrow part, as a polygon of its own: the shape up to the edge of the wide part. */
  polygon: Polygon;
  /** The satin columns that hold it (`satinColumns`, `ok`). */
  columns: SatinColumnsResult;
};

/** A piece that met the rule but whose columns do not hold: it stays in the wide part. */
export type SplitKept = BandProfile & {
  index: number;
  polygon: Polygon;
  /** Why the columns do not hold (`SatinColumnsResult.reason`). */
  reason: string;
};

export type SplitPlan = {
  /** The narrow parts that become satin, in reading order (top to bottom, left to right). Empty where the shape stays whole. */
  bands: SplitBand[];
  /**
   * The wide part as tatami areas, each tucked `tuckMm` under the bands. Where `bands` is empty: the
   * very shape that was given, in a list of one.
   */
  bulk: Polygon[];
  /** Pieces that met the rule and whose columns do not hold, with the reason: left in the wide part. */
  kept: SplitKept[];
};

export type SplitOptions = {
  /** How far a column reaches under the one it ends at (preset, Piqué 0.2 mm): for the columns of the bands. */
  underlapMm: number;
  /** Names the columns: `<idPrefix>_band<n>-<i>`. Default `satin`. */
  idPrefix?: string;
  /** The column planner. Default `satinColumns`; a test hands in one that refuses. */
  columns?: (piece: Polygon, opts: SatinColumnsOptions) => SatinColumnsResult;
  /** The thresholds, for tests and measurements. Default: the `SPLIT_…` constants. */
  minWidthMm?: number;
  minAspect?: number;
  minUniformity?: number;
  bulkMinMm2?: number;
  bulkMinRatio?: number;
  tuckMm?: number;
};

/** Reading order on a grid of 10 µm: top to bottom, then left to right. */
const readingOrder = (a: Polygon, b: Polygon): number => {
  const p = polygonBbox(a);
  const q = polygonBbox(b);
  return (
    Math.round(p.minY * 100) - Math.round(q.minY * 100) ||
    Math.round(p.minX * 100) - Math.round(q.minX * 100)
  );
};

const totalArea = (polys: Polygon[]): number => polys.reduce((sum, p) => sum + polygonArea(p), 0);

/** Does a disc of this radius fit in the shape? Eroding by it leaves something. */
const fitsDisc = (shape: Polygon, radiusMm: number): boolean =>
  offset(shape, -radiusMm).some((p) => polygonArea(p) > 1e-6);

/** An overlap above this (mm²) is an overlap, not the rounding of the polygon clipper. */
const OVERLAP_MIN_MM2 = 1e-6;
/** Two polygons that share an edge: grown a hair, they overlap. */
const TOUCH_REACH_MM = 0.002;

const touches = (a: Polygon, b: Polygon): boolean =>
  totalArea(intersect(offset(a, TOUCH_REACH_MM), [b])) > OVERLAP_MIN_MM2;

/**
 * How many separate places the piece meets the wide part: the pieces the band, grown a little,
 * overlaps it in (module doc: a band is held at ONE end).
 */
function contactsWith(piece: Polygon, bulk: Polygon[]): number {
  return intersect(offsetAll([piece], CONTACT_REACH_MM), bulk).filter(
    (p) => polygonArea(p) >= CONTACT_MIN_MM2,
  ).length;
}

/**
 * Splits a shape into its wide part and its bands (module doc), or says it stays whole. Every
 * check is on the pieces the opening leaves; where none passes, `bulk` is the shape itself.
 */
export function splitNarrowWide(shape: Polygon, opts: SplitOptions): SplitPlan {
  const minWidth = opts.minWidthMm ?? SPLIT_BAND_MIN_WIDTH_MM;
  const minAspect = opts.minAspect ?? SPLIT_BAND_MIN_ASPECT;
  const minUniformity = opts.minUniformity ?? SPLIT_BAND_MIN_UNIFORMITY;
  const bulkMin = opts.bulkMinMm2 ?? SPLIT_BULK_MIN_MM2;
  const bulkRatio = opts.bulkMinRatio ?? SPLIT_BULK_MIN_RATIO;
  const tuck = opts.tuckMm ?? SPLIT_TUCK_MM;
  const columns = opts.columns ?? satinColumns;
  const idPrefix = opts.idPrefix ?? "satin";
  const whole: SplitPlan = { bands: [], bulk: [shape], kept: [] };

  if (polygonArea(shape) < bulkMin) return whole;
  // The wide part: every disc of the satin limit that fits (module doc).
  const wide = offsetAll(offsetAll([shape], -SPLIT_BULK_RADIUS_MM), SPLIT_BULK_RADIUS_MM);
  if (wide.length === 0) return whole;

  // What is left of the shape: corners of the wide part, slivers, and the narrow parts. A piece
  // thinner than `SLIVER_MM` goes (an opening by half of it); a piece too small for the smallest
  // band is not looked at.
  const leftover = difference([shape], wide);
  const smallest = CANDIDATE_AREA_SHARE * minWidth * minWidth * minAspect;
  const pieces = offsetAll(offsetAll(leftover, -SLIVER_MM / 2), SLIVER_MM / 2)
    .filter((p) => p.holes.length === 0 && polygonArea(p) >= smallest)
    .sort(readingOrder);

  const bands: SplitBand[] = [];
  const kept: SplitKept[] = [];
  let index = 0;
  for (const piece of pieces) {
    const profile = bandProfile(piece);
    if (profile === undefined) continue;
    if (profile.widthMm < minWidth) continue;
    if (profile.lengthMm < minAspect * profile.widthMm) continue;
    if (profile.uniformity < minUniformity) continue;
    if (contactsWith(piece, wide) !== 1) continue;
    // The head has to stand out from the band: a disc of `bulkRatio` band widths across fits in it.
    if (!fitsDisc(shape, (bulkRatio * profile.widthMm) / 2)) continue;

    const at = index++;
    const plan = columns(piece, { underlapMm: opts.underlapMm, idPrefix: `${idPrefix}_band${at}` });
    if (plan.ok) bands.push({ ...profile, index: at, polygon: piece, columns: plan });
    else kept.push({ ...profile, index: at, polygon: piece, reason: plan.reason ?? "no columns" });
  }
  if (bands.length === 0) return { bands: [], bulk: [shape], kept };

  // The shape without the bands falls into the wide part — corners, slivers and the pieces that did
  // not qualify included, all of it touches the wide part — and the leftovers of the cleaning: the
  // corners it rounded off the bands and the slivers it took off their flanks. Those are the bands'.
  const rest = difference(
    [shape],
    bands.map((b) => b.polygon),
  );
  const isWide = (p: Polygon): boolean => totalArea(intersect([p], wide)) > OVERLAP_MIN_MM2;
  const main = rest.filter(isWide);
  if (totalArea(main) < bulkMin) return { bands: [], bulk: [shape], kept };
  const finished = bands.map((band) => {
    const mine = rest.filter((p) => !isWide(p) && touches(p, band.polygon));
    const joined = mine.length === 0 ? [] : union([band.polygon], mine);
    return joined.length === 1 && joined[0]!.holes.length === 0
      ? { ...band, polygon: joined[0]! }
      : band;
  });

  // The wide part reaches `tuckMm` into the bands (module doc), and never beyond the shape.
  const tucked =
    tuck > 0
      ? intersect(
          offsetAll(main, tuck),
          finished.map((b) => b.polygon),
        )
      : [];
  return { bands: finished, bulk: union(main, tucked).sort(readingOrder), kept };
}
