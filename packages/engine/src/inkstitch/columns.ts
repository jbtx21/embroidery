/**
 * Satin columns for one letter, set the way a puncher sets block lettering —
 * the rails Ink/Stitch then stitches as native satin columns (ADR 0001).
 *
 * `strokes.ts` decides the plan: which strokes a letter has, which pass through
 * where they meet, which end under which. This module draws each stroke as a
 * column:
 *
 * - **Rails follow the outline.** Along the stroke's axis a normal is cast to
 *   both sides; where it meets outline that belongs to this stroke, that is a
 *   rail point, and between two rail points the rail runs along the outline
 *   itself — corners, serifs and bumps included.
 * - **Openings are bridged.** Where another stroke joins, the outline on that
 *   side turns away into it. The rail runs straight across the opening, from
 *   the last point before it to the first after it.
 * - **Ends.** A free end runs out to its corners (a square end) or to its tip
 *   (a round or pointed end). The longest stroke at a corner does the same over
 *   the corner. A stroke that ends under another one runs straight on until it
 *   lies `underlapMm` under that stroke's edge.
 * - **Rungs** are the normals themselves, every `SATIN_RUNG_SPACING_MM` and on both
 *   sides of every opening, so the stitches keep the angle the stroke has.
 *
 * Ownership decides what "belongs to this stroke" means: every outline point
 * belongs to the axis branch whose clearance circle touches it — the circle
 * centred at p with radius r touches q when |p − q| − r is (close to) zero —
 * and every branch to a stroke (`StrokeGraph.branchStroke`).
 *
 * Whether the result is good enough is measured, not assumed: no rail may
 * leave the letter (`RAIL_OUTSIDE_MAX_MM`), no column's rails may cross, no
 * column may lie mostly on the others (`COLUMN_OVERLAP_MAX`), and together
 * the columns have to cover `COLUMN_COVERAGE_MIN` of the letter (spec §5.1) —
 * or the letter is reported back for tatami with the reason.
 */
import type { Point, Polygon, Polyline } from "@texma-stitch/geometry";
import {
  add,
  angleBetweenDeg,
  arcLength,
  cross,
  cumulativeLengths,
  dist,
  dot,
  intersect,
  lerp,
  normal,
  normalize,
  offsetPolyline,
  pointAt,
  pointInPolygon,
  polygonArea,
  rings,
  scale,
  sub,
  union,
} from "@texma-stitch/geometry";
import { COLUMN_COVERAGE_MIN, patchCoverage, railPatch } from "../import/svg.js";
import type { Warning } from "../types.js";
import { warn, WARNING } from "../warnings.js";
import type { LetterStroke, StrokeEnd, StrokeGraph } from "./strokes.js";
import { isTextureSmoothing, smoothingChange, smoothOutline } from "./smooth.js";
import { stitchOrder, strokeGraph } from "./strokes.js";

/**
 * A free end is trimmed back while its clearance is under this share of the
 * stroke's typical clearance — the axis running out into a corner or a tip —
 * but by no more than `FREE_END_TRIM_MAX` times that clearance.
 */
const FREE_END_TRIM = 0.85;
const FREE_END_TRIM_MAX = 2.2;
/** Axis sampling step (mm). */
export const AXIS_STEP_MM = 0.2;
/**
 * Outline that runs at more than ~55° to the stroke is no side of it (cos 55°):
 * the end edge of a slanted foot, the flank of a serif.
 */
const SIDE_MIN_COS = 0.57;
/** Outline ownership is read every so many mm. */
const OWNER_STEP_MM = 0.05;
/** One rung at least every so many mm of axis. */
export const SATIN_RUNG_SPACING_MM = 1.2;
/** Rungs closer together than this are thinned out. */
const RUNG_MIN_GAP_MM = 0.5;
/**
 * How slanted a column end may be and still end square across (its last
 * stitches turning by up to ~35° to lie along it): tan 35°, as a share of the
 * width. Steeper, the column narrows to a point along the slant instead — a
 * fan turning further than that piles its stitches on the short side.
 */
const SLANT_FAN_MAX = 0.7;
const WEDGE_MIN_MM = 0.2;
/** A column end slanted by more than this share of the width turns its stitches… */
const FAN_MIN_SLANT = 0.1;
/** …over this many widths before the end. */
const FAN_LENGTH = 1.0;
/** Through the ends of a column, one rung every so many mm. */
const END_RUNG_STEP_MM = 0.4;
/** Rungs reach this far past the rails, so Ink/Stitch sees them cross. */
export const SATIN_RUNG_OVERSHOOT_MM = 0.05;
/** An outline run between two rail points is followed if it is at most this much longer than the chord… */
const FOLLOW_FACTOR = 2.5;
/** …plus this (mm). Longer means it runs round another stroke: bridged. */
const FOLLOW_SLACK_MM = 0.5;
/** A corner on an end cap turns at least this much within `CORNER_WINDOW_MM`. */
const END_CORNER_DEG = 45;
const CORNER_WINDOW_MM = 0.15;

export type SatinColumnPlan = {
  id: string;
  /** Index into `StrokeGraph.strokes`. */
  stroke: number;
  railA: Polyline;
  railB: Polyline;
  rungs: [Point, Point][];
  /** Median rung length — the width Ink/Stitch sets the column at. */
  widthMm: number;
  closed: boolean;
};

export type SatinColumnsOptions = {
  /** How far a stroke reaches under the one it ends at (preset, Piqué 0.2 mm). */
  underlapMm: number;
  idPrefix?: string;
};

export type SatinColumnsResult = {
  /** The columns cover the letter well enough to be stitched as satin. */
  ok: boolean;
  /** In stitch order: what ends under a stroke comes before it. */
  columns: SatinColumnPlan[];
  /** Share of the letter the columns cover (spec §5.1). */
  coverage: number;
  /** Why `ok` is false — for the report and the tatami fallback. */
  reason?: string;
  /** The outline was smoothed by this radius first (`smooth.ts`); 0 when not. */
  smoothedMm: number;
  /** The stroke plan of every piece the columns were set on (one unless smoothed). */
  graphs: StrokeGraph[];
  warnings: Warning[];
};

// ---------------------------------------------------------------------------
// Outline index
// ---------------------------------------------------------------------------

type Ring = { pts: Point[]; cum: number[]; total: number };
type Hit = { point: Point; t: number; ring: number; s: number };

function buildRings(shape: Polygon): Ring[] {
  return rings(shape)
    .filter((r) => r.length >= 3)
    .map((r) => {
      const pts = [...r, r[0]!];
      const cum = cumulativeLengths(pts);
      return { pts, cum, total: cum[cum.length - 1]! };
    });
}

/** First outline hit of the ray o + t·d (d a unit vector), t > minT. */
function castRay(rs: Ring[], o: Point, d: Point, minT = 1e-6): Hit | undefined {
  let best: Hit | undefined;
  rs.forEach((ring, ri) => {
    for (let i = 0; i + 1 < ring.pts.length; i++) {
      const a = ring.pts[i]!;
      const e = sub(ring.pts[i + 1]!, a);
      const denom = cross(d, e);
      if (Math.abs(denom) < 1e-12) continue;
      const w = sub(a, o);
      const t = cross(w, e) / denom;
      const u = cross(w, d) / denom;
      if (u < 0 || u > 1 || t <= minT) continue;
      if (!best || t < best.t) {
        best = {
          point: add(o, scale(d, t)),
          t,
          ring: ri,
          s: ring.cum[i]! + u * (ring.cum[i + 1]! - ring.cum[i]!),
        };
      }
    }
  });
  return best;
}

const wrap = (s: number, total: number): number => ((s % total) + total) % total;

/** Unit direction of the ring at arc position s. */
function outlineTangent(ring: Ring, s: number): Point {
  const at = wrap(s, ring.total);
  let i = 0;
  while (i < ring.pts.length - 2 && ring.cum[i + 1]! <= at) i++;
  return normalize(sub(ring.pts[i + 1]!, ring.pts[i]!));
}

/** Distance along the ring from s0 to s1 walking in direction dir. */
const forward = (ring: Ring, s0: number, s1: number, dir: 1 | -1): number =>
  wrap(dir > 0 ? s1 - s0 : s0 - s1, ring.total);

/** Outline points from s0 to s1 walking in direction dir, both ends included. */
function ringPath(ring: Ring, s0: number, s1: number, dir: 1 | -1): Point[] {
  const out: Point[] = [pointAt(ring.pts, wrap(s0, ring.total), ring.cum)];
  const span = forward(ring, s0, s1, dir);
  const n = ring.pts.length - 1;
  // Vertices strictly inside the run, in walking order.
  const inside: { d: number; p: Point }[] = [];
  for (let i = 0; i < n; i++) {
    const d = forward(ring, s0, ring.cum[i]!, dir);
    if (d > 1e-9 && d < span - 1e-9) inside.push({ d, p: ring.pts[i]! });
  }
  inside.sort((a, b) => a.d - b.d);
  for (const v of inside) out.push({ ...v.p });
  out.push(pointAt(ring.pts, wrap(s1, ring.total), ring.cum));
  return out;
}

// ---------------------------------------------------------------------------
// Ownership: which stroke each piece of outline belongs to
// ---------------------------------------------------------------------------

type Ownership = { step: number[]; owner: number[][] };

/** Owner code of the outline around the inside of junction `ji` (see `owns`). */
const junctionOwner = (ji: number): number => -2 - ji;

function readOwnership(rs: Ring[], graph: StrokeGraph): Ownership {
  const innerOf = new Map<number, number>();
  graph.junctions.forEach((j, ji) => j.inner.forEach((bi) => innerOf.set(bi, ji)));
  const axis: { x: number; y: number; r: number; stroke: number }[] = [];
  graph.branches.forEach((b, bi) => {
    const ji = innerOf.get(bi);
    const owner = ji !== undefined ? junctionOwner(ji) : graph.branchStroke[bi]!;
    b.points.forEach((p, i) => axis.push({ x: p.x, y: p.y, r: b.radii[i] ?? 0, stroke: owner }));
  });
  const step: number[] = [];
  const owner: number[][] = [];
  for (const ring of rs) {
    const n = Math.max(8, Math.ceil(ring.total / OWNER_STEP_MM));
    const h = ring.total / n;
    const row: number[] = [];
    for (let k = 0; k < n; k++) {
      const q = pointAt(ring.pts, k * h, ring.cum);
      let best = -1;
      let bestGap = Infinity;
      for (const a of axis) {
        const gap = Math.hypot(a.x - q.x, a.y - q.y) - a.r;
        if (gap < bestGap) {
          bestGap = gap;
          best = a.stroke;
        }
      }
      row.push(best);
    }
    step.push(h);
    owner.push(row);
  }
  return { step, owner };
}

/**
 * Does outline with this owner code belong to the stroke? Its own outline and
 * its appendages', and the inside of a junction it passes straight through —
 * the waist of an "8" belongs to both bowls.
 */
const owns = (stroke: LetterStroke, owner: number): boolean =>
  owner === stroke.index || (owner <= -2 && stroke.through.includes(-2 - owner));

const ownerAt = (own: Ownership, ring: number, s: number, total: number): number => {
  const row = own.owner[ring]!;
  return row[Math.round(wrap(s, total) / own.step[ring]!) % row.length]!;
};

/** Is the whole run from s0 to s1 (direction dir) outline of `stroke`? */
function runOwnedBy(
  own: Ownership,
  rs: Ring[],
  ring: number,
  s0: number,
  s1: number,
  dir: 1 | -1,
  stroke: LetterStroke,
): boolean {
  const r = rs[ring]!;
  const span = forward(r, s0, s1, dir);
  const h = own.step[ring]!;
  for (let d = 0; d <= span; d += h) {
    if (!owns(stroke, ownerAt(own, ring, s0 + dir * d, r.total))) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Sampling one stroke
// ---------------------------------------------------------------------------

/**
 * One point of the axis: position, tangent and normal, clearance, and the
 * stroke's direction over a wider stretch (`trend`) — near an end the axis
 * bends into the last corner, the stroke does not.
 */
type Sample = { p: Point; t: Point; n: Point; r: number; trend: Point };
type Contact = { point: Point; ring: number; s: number };
/** A rail point at one sample: on the outline, or on a straight run (bridge, extension). */
type Anchor = { point: Point; contact?: Contact };

type Axis = {
  points: Point[];
  radii: number[];
  closed: boolean;
  /** Arc-length range of the stroke's own axis, without the straight runs added at its ends. */
  own: [number, number];
};

/**
 * The stroke's axis as the rails need it. The medial axis bends towards every
 * junction centre — the crossbar of a T dips where the stem meets it, the stem
 * of an L curves into the corner. Normals cast from such a dip lean over and
 * so do the stitches. So:
 *
 * - where the stroke passes straight through a junction, the axis inside the
 *   junction's clearance circle is replaced by the straight line across it;
 * - where it ends at a junction (abutting, or running on at a corner), the axis
 *   stops at the circle and runs straight on from there — to the outline for a
 *   corner, far enough into the other stroke for an abutting end.
 */
function strokeAxis(stroke: LetterStroke, graph: StrokeGraph, rs: Ring[]): Axis {
  let points = stroke.points.map((p) => ({ ...p }));
  let radii = [...stroke.radii];
  if (stroke.closed || points.length < 2) {
    return { points, radii, closed: stroke.closed, own: [0, arcLength(points)] };
  }
  let added: [number, number] = [0, 0];

  for (const ji of stroke.through) {
    const j = graph.junctions[ji]!;
    const inside = points.map((p) => dist(p, j.point) < j.radius);
    const first = inside.indexOf(true);
    const last = inside.lastIndexOf(true);
    if (first <= 0 || last < 0 || last >= points.length - 1) continue;
    points = [...points.slice(0, first), ...points.slice(last + 1)];
    radii = [...radii.slice(0, first), ...radii.slice(last + 1)];
  }

  const rRef = median(radii);
  const endAt = (which: "start" | "end"): void => {
    const e = which === "start" ? stroke.start : stroke.end;
    const ji = which === "start" ? stroke.startJunction : stroke.endJunction;
    const pts = which === "end" ? points : [...points].reverse();
    const rad = which === "end" ? radii : [...radii].reverse();
    let cut = pts.length - 1;
    let reach: number;
    let r = rRef;
    if (e.kind === "free") {
      // A free end: the axis runs out into its last corner (an acute foot) or
      // tip, narrowing as it goes. Back to where it is still the stroke's
      // width, then straight on to the outline.
      let trimmed = 0;
      while (cut > 1 && rad[cut]! < FREE_END_TRIM * rRef) {
        const step = dist(pts[cut]!, pts[cut - 1]!);
        if (trimmed + step > FREE_END_TRIM_MAX * rRef) break;
        trimmed += step;
        cut--;
      }
      r = rad[cut] ?? rRef;
    } else {
      if (ji === undefined) return;
      const j = graph.junctions[ji]!;
      // Walk in from the end until the axis leaves the junction circle.
      while (cut > 1 && dist(pts[cut]!, j.point) < j.radius) cut--;
      r = rad[cut] ?? rRef;
    }
    const keptPts = pts.slice(0, cut + 1);
    const keptRad = rad.slice(0, cut + 1);
    const cum = cumulativeLengths(keptPts);
    const total = cum[cum.length - 1]!;
    const from = keptPts[keptPts.length - 1]!;
    // Direction over the last stretch only: a stroke may turn shortly before it
    // ends (the bar of an R comes out of the leg).
    const back = pointAt(keptPts, Math.max(0, total - Math.min(1.2, Math.max(0.6, r))), cum);
    const dir = normalize(sub(from, back));
    // A free end or a corner runs on to the outline; an abutting end far
    // enough into the other stroke — never out of the letter.
    const hit = castRay(rs, from, dir);
    const toOutline = hit ? Math.max(0, hit.t - 0.02) : 0;
    if (e.kind === "abut") {
      const j = graph.junctions[ji!]!;
      reach = Math.min(2.5 * j.radius + 0.5, toOutline);
    } else {
      reach = toOutline;
    }
    const steps = Math.max(1, Math.ceil(reach / AXIS_STEP_MM));
    if (reach > 1e-6) {
      for (let i = 1; i <= steps; i++) {
        keptPts.push(add(from, scale(dir, (reach * i) / steps)));
        keptRad.push(r);
      }
    }
    if (which === "end") {
      points = keptPts;
      radii = keptRad;
      added = [added[0], reach];
    } else {
      points = keptPts.reverse();
      radii = keptRad.reverse();
      added = [reach, added[1]];
    }
  };
  endAt("start");
  endAt("end");
  const total = arcLength(points);
  return { points, radii, closed: false, own: [added[0], total - added[1]] };
}

function sampleAxis(axis: Axis): { samples: Sample[]; own: [number, number] } {
  const pts = axis.closed ? [...axis.points, axis.points[0]!] : axis.points;
  const radii = axis.closed ? [...axis.radii, axis.radii[0]!] : axis.radii;
  const cum = cumulativeLengths(pts);
  const total = cum[cum.length - 1]!;
  if (total < 1e-6) return { samples: [], own: [0, 0] };
  const n = Math.max(2, Math.ceil(total / AXIS_STEP_MM));
  const count = axis.closed ? n : n + 1;
  const radiusAt = (s: number): number => {
    let i = 0;
    while (i < cum.length - 2 && cum[i + 1]! <= s) i++;
    return radii[i] ?? 0;
  };
  const at = (s: number): Point =>
    axis.closed ? pointAt(pts, wrap(s, total), cum) : pointAt(pts, s, cum);
  const out: Sample[] = [];
  for (let k = 0; k < count; k++) {
    const s = (k * total) / n;
    const r = radiusAt(s);
    const w = Math.min(1.2, Math.max(0.3, 0.8 * r));
    const t = normalize(sub(at(s + w), at(s - w)));
    const wide = Math.max(1.5, 4 * r);
    const trend = normalize(sub(at(s + wide), at(s - wide)));
    out.push({ p: at(s), t, n: normalize(normal(t)), r, trend });
  }
  const own: [number, number] = [
    Math.min(count - 1, Math.max(0, Math.round((axis.own[0] / total) * n))),
    Math.min(count - 1, Math.max(0, Math.round((axis.own[1] / total) * n))),
  ];
  return { samples: out, own };
}

/** Intersection of line (p, d) with line (a, b) as a point, if not parallel. */
function lineHit(p: Point, d: Point, a: Point, b: Point): Point | undefined {
  const e = sub(b, a);
  const denom = cross(d, e);
  if (Math.abs(denom) < 1e-12) return undefined;
  const t = cross(sub(a, p), e) / denom;
  return add(p, scale(d, t));
}

/**
 * First crossing of segment a-b with polyline `line`: parameter along a-b, the
 * point, and its arc position along `line`.
 */
function segmentCrossing(
  a: Point,
  b: Point,
  line: Point[],
): { u: number; p: Point; along: number } | undefined {
  const d = sub(b, a);
  let best: { u: number; p: Point; along: number } | undefined;
  let before = 0;
  for (let i = 0; i + 1 < line.length; i++) {
    const c = line[i]!;
    const e = sub(line[i + 1]!, c);
    const segLen = Math.hypot(e.x, e.y);
    const denom = cross(d, e);
    if (Math.abs(denom) >= 1e-12) {
      const w = sub(c, a);
      const u = cross(w, e) / denom;
      const v = cross(w, d) / denom;
      if (u >= -1e-9 && u <= 1 + 1e-9 && v >= -1e-9 && v <= 1 + 1e-9) {
        if (!best || u < best.u) best = { u, p: add(a, scale(d, u)), along: before + v * segLen };
      }
    }
    before += segLen;
  }
  return best;
}

/** The piece of `line` between two arc positions, in the order given, ends included. */
function linePiece(line: Point[], from: number, to: number): Point[] {
  const cum = cumulativeLengths(line);
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const pts = [pointAt(line, lo, cum)];
  for (let i = 0; i < line.length; i++)
    if (cum[i]! > lo + 1e-9 && cum[i]! < hi - 1e-9) pts.push(line[i]!);
  pts.push(pointAt(line, hi, cum));
  return from <= to ? pts : pts.reverse();
}

type Side = {
  /** One slot per sample. */
  anchors: (Anchor | undefined)[];
  dir: 1 | -1;
};

/**
 * Rail points on one side (module doc): outline contacts that belong to the
 * stroke and move forward along the outline; straight runs across openings.
 */
function buildSide(
  samples: Sample[],
  sign: 1 | -1,
  stroke: LetterStroke,
  rs: Ring[],
  own: Ownership,
): Side {
  const reach = railReach(samples);
  const contacts: (Contact | undefined)[] = samples.map((sm) => {
    const hit = castRay(rs, sm.p, scale(sm.n, sign));
    // Beyond reach the normal ran along inside another stroke to its far side.
    if (!hit || hit.t > reach) return undefined;
    if (!owns(stroke, ownerAt(own, hit.ring, hit.s, rs[hit.ring]!.total))) return undefined;
    // Outline running across the stroke is its end (or a serif), not a side:
    // the rail reaches it along the outline from the side contacts.
    const along = Math.abs(dot(outlineTangent(rs[hit.ring]!, hit.s), sm.trend));
    if (along < SIDE_MIN_COS) return undefined;
    return { point: hit.point, ring: hit.ring, s: hit.s };
  });

  // Which way along the outline this side runs: vote over short steps.
  let vote = 0;
  let prev: Contact | undefined;
  for (const c of contacts) {
    if (c && prev && c.ring === prev.ring && dist(c.point, prev.point) < 3 * AXIS_STEP_MM) {
      const total = rs[c.ring]!.total;
      let ds = wrap(c.s - prev.s, total);
      if (ds > total / 2) ds -= total;
      if (Math.abs(ds) > 1e-9) vote += ds > 0 ? 1 : -1;
    }
    if (c) prev = c;
  }
  const dir: 1 | -1 = vote < 0 ? -1 : 1;

  // Drop contacts that step back (normals crossing inside a tight bend).
  const maxRadius = Math.max(...samples.map((s) => s.r), 0.1);
  const backstep = 1.5 * maxRadius + 0.5;
  let last: Contact | undefined;
  const kept = contacts.map((c) => {
    if (!c) return undefined;
    if (last && c.ring === last.ring) {
      const ring = rs[c.ring]!;
      const fwd = forward(ring, last.s, c.s, dir);
      const bwd = ring.total - fwd;
      if (bwd < fwd && bwd < backstep) return undefined;
    }
    last = c;
    return c;
  });

  const anchors: (Anchor | undefined)[] = kept.map((c) =>
    c ? { point: c.point, contact: c } : undefined,
  );
  if (stroke.closed) return { anchors, dir };

  // Openings: consecutive contacts whose outline run is not this stroke's are bridged.
  const idx = kept.flatMap((c, k) => (c ? [k] : []));
  for (let q = 0; q + 1 < idx.length; q++) {
    const k1 = idx[q]!;
    const k2 = idx[q + 1]!;
    if (k2 === k1 + 1) continue;
    const a = kept[k1]!;
    const b = kept[k2]!;
    if (followOutline(a, b, dir, rs, own, stroke)) continue;
    for (let k = k1 + 1; k < k2; k++) {
      const p = lineHit(samples[k]!.p, samples[k]!.n, a.point, b.point);
      if (p && dist(p, samples[k]!.p) <= reach) anchors[k] = { point: p };
    }
  }
  return { anchors, dir };
}

/** Does the rail run along the outline from a to b (instead of across an opening)? */
function followOutline(
  a: Contact,
  b: Contact,
  dir: 1 | -1,
  rs: Ring[],
  own: Ownership,
  stroke: LetterStroke,
): boolean {
  if (a.ring !== b.ring) return false;
  const run = forward(rs[a.ring]!, a.s, b.s, dir);
  if (run > FOLLOW_FACTOR * dist(a.point, b.point) + FOLLOW_SLACK_MM) return false;
  return runOwnedBy(own, rs, a.ring, a.s, b.s, dir, stroke);
}

// ---------------------------------------------------------------------------
// Rails from anchors
// ---------------------------------------------------------------------------

/** The rail through the anchors from sample k0 to k1 (inclusive), outline runs included. */
function railThrough(
  side: Side,
  k0: number,
  k1: number,
  rs: Ring[],
  own: Ownership,
  stroke: LetterStroke,
): Point[] {
  const out: Point[] = [];
  let prev: Anchor | undefined;
  for (let k = k0; k <= k1; k++) {
    const a = side.anchors[k];
    if (!a) continue;
    if (
      prev?.contact &&
      a.contact &&
      followOutline(prev.contact, a.contact, side.dir, rs, own, stroke)
    ) {
      const run = ringPath(rs[a.contact.ring]!, prev.contact.s, a.contact.s, side.dir);
      for (let i = 1; i < run.length; i++) out.push(run[i]!);
    } else {
      out.push({ ...a.point });
    }
    prev = a;
  }
  return dedupeRail(out);
}

function dedupeRail(pts: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of pts) {
    if (out.length > 0 && dist(out[out.length - 1]!, p) < 1e-6) continue;
    out.push(p);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Ends
// ---------------------------------------------------------------------------

/** Turning angle at each point, measured over `CORNER_WINDOW_MM` either side. */
function cornerFlags(path: Point[]): boolean[] {
  const cum = cumulativeLengths(path);
  const total = cum[cum.length - 1] ?? 0;
  return path.map((p, i) => {
    if (i === 0 || i === path.length - 1) return false;
    const before = pointAt(path, Math.max(0, cum[i]! - CORNER_WINDOW_MM), cum);
    const after = pointAt(path, Math.min(total, cum[i]! + CORNER_WINDOW_MM), cum);
    if (dist(before, p) < 1e-6 || dist(after, p) < 1e-6) return false;
    return angleBetweenDeg(sub(p, before), sub(after, p)) >= END_CORNER_DEG;
  });
}

/**
 * Where the two rails end on an end cap (module doc): at the corners that lie
 * furthest out (a square or slanted end, serifs included), else at the tip.
 * Returns the indices on `path` for the first and the second rail.
 */
function endCapSplit(path: Point[], outward: Point, width: number): [number, number] {
  const u = path.map((p) => dot(sub(p, path[0]!), outward));
  const uMax = Math.max(...u);
  const tol = Math.max(0.1 * width, 0.08);
  const corners = cornerFlags(path);
  const cornerIdx = path.flatMap((_, i) => (corners[i] ? [i] : []));
  const far = cornerIdx.filter((i) => u[i]! >= uMax - tol);
  if (far.length >= 2) return [far[0]!, far[far.length - 1]!];
  if (far.length === 1) {
    // A slanted end: its other corner, if the slant is mild, still ends the
    // column (the last stitches turn a little); a steep slant narrows to the
    // far corner instead (module doc).
    const f = far[0]!;
    const partner = (side: number[]): number | undefined =>
      side.reduce<number | undefined>(
        (best, i) => (best === undefined || u[i]! > u[best]! ? i : best),
        undefined,
      );
    const before = partner(cornerIdx.filter((i) => i < f));
    const after = partner(cornerIdx.filter((i) => i > f));
    const cand = [before, after].filter((i): i is number => i !== undefined);
    const other = cand.sort((a, b) => u[b]! - u[a]!)[0];
    if (other !== undefined && u[f]! - u[other]! <= SLANT_FAN_MAX * width) {
      return other < f ? [other, f] : [f, other];
    }
    return [f, f];
  }
  // Round or pointed: the middle of the stretch that lies furthest out.
  const top = path.flatMap((_, i) => (u[i]! >= uMax - 0.02 ? [i] : []));
  const mid = top[Math.floor((top.length - 1) / 2)]!;
  return [mid, mid];
}

// ---------------------------------------------------------------------------
// One stroke → one column
// ---------------------------------------------------------------------------

type Built = {
  railA: Point[];
  railB: Point[];
  rungs: [Point, Point][];
  closed: boolean;
  /** The axis the column was built along. */
  axis: Sample[];
  /**
   * The rails without their end runs — the stroke's sides, which an abutting
   * stroke is cut against (its ends may narrow or turn along an outline).
   */
  sideA: Point[];
  sideB: Point[];
};

type EndInfo = {
  kind: StrokeEnd["kind"];
  /** For `abut`: the rails of the stroke it ends under. */
  onto?: Built;
};

function buildColumn(
  shape: Polygon,
  stroke: LetterStroke,
  graph: StrokeGraph,
  rs: Ring[],
  own: Ownership,
  startEnd: EndInfo,
  endEnd: EndInfo,
  underlapMm: number,
): Built | { error: string } {
  const { samples, own: ownRange } = sampleAxis(strokeAxis(stroke, graph, rs));
  if (samples.length < 2) return { error: "axis too short" };
  const left = buildSide(samples, 1, stroke, rs, own);
  const right = buildSide(samples, -1, stroke, rs, own);
  const validL = left.anchors.some((a) => a?.contact);
  const validR = right.anchors.some((a) => a?.contact);
  if (!validL || !validR) return { error: "one side has no outline of its own" };

  if (stroke.closed) return closedColumn(samples, left, right, rs, own, stroke);

  const width = 2 * median(samples.map((s) => s.r));
  // Open ends: extend each side straight past its last outline point.
  for (const side of [left, right]) {
    extendStraight(shape, samples, side, "end");
    extendStraight(shape, samples, side, "start");
  }

  let k0 = 0;
  let k1 = samples.length - 1;
  const railStart: [Point[], Point[]] = [[], []];
  const railEnd: [Point[], Point[]] = [[], []];

  for (const which of ["start", "end"] as const) {
    const info = which === "start" ? startEnd : endEnd;
    if (info.kind === "abut" && info.onto) {
      const cut = abutCut(shape, rs, samples, ownRange, left, right, which, info.onto, underlapMm);
      if ("error" in cut) return cut;
      if (which === "start") {
        k0 = cut.k;
        railStart[0] = cut.a;
        railStart[1] = cut.b;
      } else {
        k1 = cut.k;
        railEnd[0] = cut.a;
        railEnd[1] = cut.b;
      }
    } else {
      const cap = endCap(samples, left, right, which, rs, own, stroke, width);
      if (which === "start") {
        railStart[0] = cap.a;
        railStart[1] = cap.b;
      } else {
        railEnd[0] = cap.a;
        railEnd[1] = cap.b;
      }
    }
  }
  if (k1 - k0 < 1) return { error: "nothing left between the ends" };

  const sideA = railThrough(left, k0, k1, rs, own, stroke);
  const sideB = railThrough(right, k0, k1, rs, own, stroke);
  const railA = dedupeRail([...railStart[0], ...sideA, ...railEnd[0]]);
  const railB = dedupeRail([...railStart[1], ...sideB, ...railEnd[1]]);
  const rungs = pickRungs(samples, left, right, k0, k1, railA, railB, false);
  return { railA, railB, rungs, closed: false, axis: samples, sideA, sideB };
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length === 0 ? 0 : s[Math.floor((s.length - 1) / 2)]!;
};

/**
 * Straight run past the last outline point of a side, towards one end (virtual
 * anchors) — never out of the letter: where the run would leave it, the side
 * stops, and the end decides how it goes on.
 */
function extendStraight(
  shape: Polygon,
  samples: Sample[],
  side: Side,
  which: "start" | "end",
): void {
  const ks = side.anchors.flatMap((a, k) => (a ? [k] : []));
  if (ks.length === 0) return;
  const kLast = which === "end" ? ks[ks.length - 1]! : ks[0]!;
  const from = side.anchors[kLast]!.point;
  const dir = samples[kLast]!.t;
  // Outwards from the last point, so the run stops where it leaves the letter.
  const range =
    which === "end"
      ? Array.from({ length: samples.length - 1 - kLast }, (_, i) => kLast + 1 + i)
      : Array.from({ length: kLast }, (_, i) => kLast - 1 - i);
  const reach = railReach(samples);
  for (const k of range) {
    const p = lineHit(samples[k]!.p, samples[k]!.n, from, add(from, dir));
    // A rail along the outline lies on it: test a hair towards the axis.
    if (!p || !pointInPolygon(shape, lerp(p, samples[k]!.p, 0.02))) break;
    // A normal running nearly along the run meets it far off: no rail point there.
    if (dist(p, samples[k]!.p) > reach) break;
    side.anchors[k] = { point: p };
  }
}

/** A rail point further than this from its axis sample met the wrong line. */
function railReach(samples: Sample[]): number {
  return 2 * Math.max(...samples.map((s) => s.r), 0.1) + 0.3;
}

/**
 * A free or corner end: both rails run out along the outline to the end corners
 * (or the tip). A side that is open at the end (the other stroke of a corner
 * lies there) runs straight on to the same end line.
 */
function endCap(
  samples: Sample[],
  left: Side,
  right: Side,
  which: "start" | "end",
  rs: Ring[],
  own: Ownership,
  stroke: LetterStroke,
  width: number,
): { a: Point[]; b: Point[] } {
  const kEnd = which === "end" ? samples.length - 1 : 0;
  const outward = which === "end" ? samples[kEnd]!.t : scale(samples[kEnd]!.t, -1);
  const lastContact = (side: Side): { k: number; c: Contact } | undefined => {
    const ks = side.anchors.flatMap((a, k) => (a?.contact ? [k] : []));
    if (ks.length === 0) return undefined;
    const k = which === "end" ? ks[ks.length - 1]! : ks[0]!;
    return { k, c: side.anchors[k]!.contact! };
  };
  const lc = lastContact(left);
  const rc = lastContact(right);
  // Walking direction on the outline away from the stroke, per side.
  const walkDir = (side: Side): 1 | -1 => (which === "end" ? side.dir : (-side.dir as 1 | -1));

  const walkFrom = (c: Contact, dir: 1 | -1, until?: Contact): Point[] => {
    const ring = rs[c.ring]!;
    const maxRun = 3 * width + 1.5;
    if (until && until.ring === c.ring) {
      const run = forward(ring, c.s, until.s, dir);
      if (run <= maxRun && runOwnedBy(own, rs, c.ring, c.s, until.s, dir, stroke)) {
        return ringPath(ring, c.s, until.s, dir);
      }
    }
    // Open-ended: as far as the outline stays this stroke's.
    const h = own.step[c.ring]!;
    let run = 0;
    while (
      run + h <= maxRun &&
      owns(stroke, ownerAt(own, c.ring, c.s + dir * (run + h), ring.total))
    ) {
      run += h;
    }
    return ringPath(ring, c.s, c.s + dir * run, dir);
  };

  // Both sides meet round the end cap when the outline between their last
  // contacts is this stroke's own.
  if (lc && rc) {
    const path = walkFrom(lc.c, walkDir(left), rc.c);
    if (dist(path[path.length - 1]!, rc.c.point) < 1e-6) {
      const [ia, ib] = endCapSplit(path, outward, width);
      const a = path.slice(1, ia + 1);
      const b = path.slice(ib, path.length - 1).reverse();
      return orderCap(a, b, which);
    }
  }
  // Otherwise the side that gets further out runs round the outline, the other
  // one is open there (the other stroke of a corner lies against it).
  const uOf = (c?: { c: Contact }): number => (c ? dot(c.c.point, outward) : -Infinity);
  const lOk = !!lc && (!rc || uOf(lc) >= uOf(rc));
  const rOk = !!rc && !lOk;
  // One side open at the end: the outline side runs out, the open side follows
  // straight to the same end line — never out of the letter.
  if (lOk || rOk) {
    const ownSide = lOk ? left : right;
    const openSide = lOk ? right : left;
    const c = (lOk ? lc : rc)!.c;
    const path = walkFrom(c, walkDir(ownSide));
    // The own side runs out to whichever end corner lies further out.
    const split = endCapSplit(path, outward, width);
    const iEnd = split.reduce((a, b) => (dot(path[b]!, outward) > dot(path[a]!, outward) ? b : a));
    const run = path.slice(1, iEnd + 1);
    const tip = run.length > 0 ? run[run.length - 1]! : c.point;
    const ks = openSide.anchors.flatMap((a, k) => (a ? [k] : []));
    const openTail: Point[] = [];
    if (ks.length > 0) {
      const from = openSide.anchors[which === "end" ? ks[ks.length - 1]! : ks[0]!]!.point;
      const target = lineHit(from, outward, tip, add(tip, normal(outward)));
      if (target && dot(sub(target, from), outward) > 1e-6) {
        const hit = castRay(rs, from, outward);
        if (hit && hit.t < dist(from, target) - 0.05) {
          // The letter ends first (an acute corner, the apex of an A): along
          // the outline on to the tip, so the column narrows to it (wedge).
          openTail.push(hit.point);
          const tipAt = locate(rs, tip);
          if (tipAt && tipAt.ring === hit.ring) {
            const ring = rs[hit.ring]!;
            const fwd = forward(ring, hit.s, tipAt.s, 1);
            const dir: 1 | -1 = fwd <= ring.total - fwd ? 1 : -1;
            if (Math.min(fwd, ring.total - fwd) <= 2 * width + 1) {
              openTail.push(...ringPath(ring, hit.s, tipAt.s, dir).slice(1));
            }
          }
        } else {
          openTail.push(target);
        }
      }
    }
    return lOk ? orderCap(run, openTail, which) : orderCap(openTail, run, which);
  }
  return { a: [], b: [] };
}

/** Cap runs are built walking outwards; the start of a rail needs them the other way. */
function orderCap(a: Point[], b: Point[], which: "start" | "end"): { a: Point[]; b: Point[] } {
  return which === "end" ? { a, b } : { a: [...a].reverse(), b: [...b].reverse() };
}

/**
 * The end of a stroke that stops under another one: both rails run straight on
 * until they lie `underlapMm` beyond the facing rail of the other stroke.
 *
 * The facing rail is the one the axis meets first on its way out; the cut line
 * is that rail near the meeting point, shifted by the underlap towards where
 * the axis goes on. Both are searched from the middle of the stroke outwards —
 * a rail of this stroke may run along its own outline past the line (the bar
 * of an R reaches into the crotch the bowl covers).
 */
function abutCut(
  shape: Polygon,
  rs: Ring[],
  samples: Sample[],
  ownRange: [number, number],
  left: Side,
  right: Side,
  which: "start" | "end",
  onto: Built,
  underlapMm: number,
): { k: number; a: Point[]; b: Point[] } | { error: string } {
  // From the middle of the stroke's own axis outwards.
  const mid = Math.floor((ownRange[0] + ownRange[1]) / 2);
  const order =
    which === "end"
      ? Array.from({ length: samples.length - mid }, (_, i) => mid + i)
      : Array.from({ length: mid + 1 }, (_, i) => mid - i);
  const outward = which === "end" ? samples[samples.length - 1]!.t : scale(samples[0]!.t, -1);

  // Where along the walk a polyline is first crossed by the axis (q + u), if at all.
  const axisMeets = (line: Point[]): { at: number; p: Point } | undefined => {
    for (let q = 0; q + 1 < order.length; q++) {
      const hit = segmentCrossing(samples[order[q]!]!.p, samples[order[q + 1]!]!.p, line);
      if (hit) return { at: q + hit.u, p: hit.p };
    }
    return undefined;
  };
  const width = 2 * (samples[order[0]!]?.r ?? 1);
  const inside = samples[order[0]!]!.p;
  /** The piece of `line` within `reach` of p, around its point nearest to p. */
  const around = (line: Point[], p: Point, reach: number): Point[] => {
    let near = 0;
    line.forEach((q, i) => {
      if (dist(q, p) < dist(line[near]!, p)) near = i;
    });
    let lo = near;
    let hi = near;
    while (lo > 0 && dist(line[lo - 1]!, p) <= reach) lo--;
    while (hi < line.length - 1 && dist(line[hi + 1]!, p) <= reach) hi++;
    if (hi === lo) {
      if (hi < line.length - 1) hi++;
      else lo--;
    }
    return line.slice(lo, hi + 1);
  };
  // The line this stroke ends on: the side of the other stroke it meets first,
  // shifted by the underlap into that stroke. Where the axis meets neither side
  // (it stops short), the other stroke's axis shifted by its half width less
  // the underlap stands in for it.
  let cutLine: Point[] | undefined;
  const ma = axisMeets(onto.sideA);
  const mb = axisMeets(onto.sideB);
  const meet = ma && (!mb || ma.at <= mb.at) ? ma : mb;
  if (meet) {
    const facing = meet === ma ? onto.sideA : onto.sideB;
    const opposite = meet === ma ? onto.sideB : onto.sideA;
    const piece = around(facing, meet.p, width + 0.5);
    const plus = offsetPolyline(piece, underlapMm);
    const minus = offsetPolyline(piece, -underlapMm);
    const gap = (line: Point[]): number =>
      Math.min(...line.map((p) => Math.min(...opposite.map((q) => dist(p, q)))));
    cutLine = extendLine(gap(plus) < gap(minus) ? plus : minus, 2 * width + 1);
  } else {
    const other = onto.axis;
    if (other.length < 2) return { error: "does not reach the stroke it ends under" };
    let meetAt = other[0]!.p;
    let bestD = Infinity;
    for (const k of order) {
      for (const sm of other) {
        const d = dist(samples[k]!.p, sm.p);
        if (d < bestD) {
          bestD = d;
          meetAt = sm.p;
        }
      }
    }
    const piece = around(
      other.map((sm) => sm.p),
      meetAt,
      width + 0.5,
    );
    let near = 0;
    other.forEach((sm, i) => {
      if (dist(sm.p, meetAt) < dist(other[near]!.p, meetAt)) near = i;
    });
    const halfWidth = other[near]!.r;
    const tangent = other[near]!.t;
    const side = cross(tangent, sub(inside, other[near]!.p)) >= 0 ? 1 : -1;
    // offsetPolyline shifts to the left-hand normal (y, -x) for a positive value.
    const leftIsSide = cross(tangent, normal(tangent)) >= 0 ? 1 : -1;
    cutLine = extendLine(
      offsetPolyline(piece, Math.max(0, halfWidth - underlapMm) * side * leftIsSide),
      2 * width + 1,
    );
  }
  const maxRun = 3 * width + 2;

  // First crossing of each rail with the cut line, walking out from the middle.
  // A rail that runs out of the letter before it gets there follows the outline.
  /** `along`: position on the cut line; undefined where the rail met it along the outline. */
  type Cut = { q: number; p: Point; via: Point[]; along?: number };
  const cutSide = (side: Side): Cut | undefined => {
    let prevQ: number | undefined;
    for (let q = 0; q < order.length; q++) {
      const k = order[q]!;
      if (!side.anchors[k]) continue;
      if (prevQ !== undefined) {
        const from = side.anchors[order[prevQ]!]!.point;
        const hit = segmentCrossing(from, side.anchors[k]!.point, cutLine);
        if (hit) return { q: prevQ, p: hit.p, via: [], along: hit.along };
      }
      prevQ = q;
    }
    if (prevQ === undefined) return undefined;
    const last = side.anchors[order[prevQ]!]!;
    // Straight on, as far as the letter goes.
    let exit: Contact | undefined;
    if (!pointInPolygon(shape, add(last.point, scale(outward, 0.02)))) {
      exit = last.contact ?? locate(rs, last.point);
    } else {
      const h = castRay(rs, last.point, outward);
      if (h && h.t < maxRun) exit = { point: h.point, ring: h.ring, s: h.s };
    }
    const straightTo = exit ? exit.point : add(last.point, scale(outward, maxRun));
    const straight = segmentCrossing(last.point, straightTo, cutLine);
    if (straight) return { q: prevQ, p: straight.p, via: [], along: straight.along };
    if (!exit) return undefined;
    // Along the outline from where the run leaves the letter, whichever way
    // meets the line first — a stroke's width at most; failing that the rail
    // ends where it leaves the letter (whatever lies beyond was stitched by
    // the stroke this one ends at, or is outside).
    let best: Cut | undefined;
    let bestLen = Infinity;
    const ring = rs[exit.ring]!;
    for (const dir of [1, -1] as const) {
      const path = ringPath(ring, exit.s, exit.s + dir * width, dir);
      let len = 0;
      // Nearest approach to the line, for a walk that runs along it without crossing
      // (the outline reaching the other stroke's side at a notch).
      let close: { i: number; p: Point; d: number } | undefined;
      for (let i = 0; i + 1 < path.length; i++) {
        const hit = segmentCrossing(path[i]!, path[i + 1]!, cutLine);
        if (hit) {
          len += dist(path[i]!, hit.p);
          if (len < bestLen) {
            bestLen = len;
            best = {
              q: prevQ,
              p: hit.p,
              via: [exit.point, ...path.slice(1, i + 1)],
              along: hit.along,
            };
          }
          close = undefined;
          break;
        }
        len += dist(path[i]!, path[i + 1]!);
        const q = path[i + 1]!;
        const foot = closestOn(cutLine, q);
        if (foot && foot.d <= underlapMm + 0.05 && (!close || foot.d < close.d)) {
          close = { i: i + 1, p: foot.p, d: foot.d };
        }
      }
      if (close && len < bestLen) {
        bestLen = len;
        best = { q: prevQ, p: close.p, via: [exit.point, ...path.slice(1, close.i + 1)] };
      }
    }
    return best ?? { q: prevQ, p: exit.point, via: [] };
  };
  const ca = cutSide(left);
  const cb = cutSide(right);
  if (!ca || !cb) return { error: "does not reach the stroke it ends under" };
  // Keep the samples up to the earlier cut; the other rail keeps its own
  // points out to its cut.
  const qCut = Math.min(ca.q, cb.q);
  const tail = (side: Side, c: Cut): Point[] => {
    const ks = order.slice(qCut + 1, c.q + 1).filter((k) => side.anchors[k]);
    const pts = ks.map((k) => side.anchors[k]!.point);
    return [...pts, ...c.via, c.p];
  };
  const a = tail(left, ca);
  const b = tail(right, cb);
  // A slanted cut: the rail that gets there first runs on along the cut to the
  // other one, so the column narrows to a point with its stitches still square
  // to the stroke — not a fan pivoting on the short rail (module doc).
  const ua = dot(ca.p, outward);
  const ub = dot(cb.p, outward);
  if (Math.abs(ua - ub) > Math.max(SLANT_FAN_MAX * width, WEDGE_MIN_MM)) {
    const [near, far, nearCut, farCut] = ua < ub ? [a, b, ca, cb] : [b, a, cb, ca];
    if (nearCut.along !== undefined && farCut.along !== undefined) {
      near.push(...linePiece(cutLine, nearCut.along, farCut.along).slice(1));
    } else {
      near.push(far[far.length - 1]!);
    }
  }
  return {
    k: order[qCut]!,
    // Built walking outwards; the start of a rail needs them the other way.
    a: which === "end" ? a : a.reverse(),
    b: which === "end" ? b : b.reverse(),
  };
}

/** Nearest point on a polyline to p, with its distance. */
function closestOn(line: Point[], p: Point): { p: Point; d: number } | undefined {
  let best: { p: Point; d: number } | undefined;
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i]!;
    const e = sub(line[i + 1]!, a);
    const l2 = dot(e, e);
    const u = l2 < 1e-18 ? 0 : Math.max(0, Math.min(1, dot(sub(p, a), e) / l2));
    const q = add(a, scale(e, u));
    const d = dist(p, q);
    if (!best || d < best.d) best = { p: q, d };
  }
  return best;
}

/** Nearest outline position to p. */
function locate(rs: Ring[], p: Point): Contact | undefined {
  let best: Contact | undefined;
  let bestD = Infinity;
  rs.forEach((ring, ri) => {
    for (let i = 0; i + 1 < ring.pts.length; i++) {
      const a = ring.pts[i]!;
      const e = sub(ring.pts[i + 1]!, a);
      const l2 = dot(e, e);
      const u = l2 < 1e-18 ? 0 : Math.max(0, Math.min(1, dot(sub(p, a), e) / l2));
      const q = add(a, scale(e, u));
      const d = dist(p, q);
      if (d < bestD) {
        bestD = d;
        best = { point: q, ring: ri, s: ring.cum[i]! + u * Math.sqrt(l2) };
      }
    }
  });
  return best;
}

/** The polyline with its first and last segment run on by `mm`. */
function extendLine(line: Point[], mm: number): Point[] {
  if (line.length < 2) return line;
  const d0 = normalize(sub(line[0]!, line[1]!));
  const d1 = normalize(sub(line[line.length - 1]!, line[line.length - 2]!));
  return [add(line[0]!, scale(d0, mm)), ...line, add(line[line.length - 1]!, scale(d1, mm))];
}

// ---------------------------------------------------------------------------
// Rings
// ---------------------------------------------------------------------------

function closedColumn(
  samples: Sample[],
  left: Side,
  right: Side,
  rs: Ring[],
  own: Ownership,
  stroke: LetterStroke,
): Built | { error: string } {
  const n = samples.length;
  // Bridges across openings, going round.
  for (const side of [left, right]) {
    const idx = side.anchors.flatMap((a, k) => (a?.contact ? [k] : []));
    if (idx.length < 2) return { error: "ring without outline on one side" };
    for (let q = 0; q < idx.length; q++) {
      const k1 = idx[q]!;
      const k2 = idx[(q + 1) % idx.length]!;
      const gap = (k2 - k1 + n) % n;
      if (gap <= 1) continue;
      const a = side.anchors[k1]!.contact!;
      const b = side.anchors[k2]!.contact!;
      if (followOutline(a, b, side.dir, rs, own, stroke)) continue;
      for (let g = 1; g < gap; g++) {
        const k = (k1 + g) % n;
        const p = lineHit(samples[k]!.p, samples[k]!.n, a.point, b.point);
        if (p && dist(p, samples[k]!.p) <= railReach(samples)) side.anchors[k] = { point: p };
      }
    }
  }
  // Seam: the topmost sample with outline on both sides.
  let seam = -1;
  for (let k = 0; k < n; k++) {
    if (!left.anchors[k]?.contact || !right.anchors[k]?.contact) continue;
    if (seam < 0 || samples[k]!.p.y < samples[seam]!.p.y - 1e-9) seam = k;
  }
  if (seam < 0) return { error: "ring without a place to start" };
  const rotate = <T>(xs: T[]): T[] => [...xs.slice(seam), ...xs.slice(0, seam), xs[seam]!];
  const s2 = rotate(samples);
  const l2: Side = { anchors: rotate(left.anchors), dir: left.dir };
  const r2: Side = { anchors: rotate(right.anchors), dir: right.dir };
  const railA = railThrough(l2, 0, n, rs, own, stroke);
  const railB = railThrough(r2, 0, n, rs, own, stroke);
  const rungs = pickRungs(s2, l2, r2, 0, n, railA, railB, true);
  return { railA, railB, rungs, closed: true, axis: samples, sideA: railA, sideB: railB };
}

// ---------------------------------------------------------------------------
// Rungs
// ---------------------------------------------------------------------------

function segmentsCross(p1: Point, p2: Point, p3: Point, p4: Point): boolean {
  const d1 = sub(p2, p1);
  const d2 = sub(p4, p3);
  const denom = cross(d1, d2);
  if (Math.abs(denom) < 1e-12) return false;
  const w = sub(p3, p1);
  const t = cross(w, d2) / denom;
  const u = cross(w, d1) / denom;
  const eps = 1e-6;
  return t > eps && t < 1 - eps && u > eps && u < 1 - eps;
}

/** Does the segment touch the rail anywhere but near its own end point `own`? */
function touchesRailElsewhere(a: Point, b: Point, rail: Point[], ownPoint: Point): boolean {
  for (let i = 0; i + 1 < rail.length; i++) {
    const c = rail[i]!;
    const d = rail[i + 1]!;
    if (!segmentsCross(a, b, c, d)) continue;
    const hit = lineHit(a, sub(b, a), c, d);
    if (hit && dist(hit, ownPoint) > 0.05) return true;
  }
  return false;
}

type RailHit = { point: Point; t: number; pos: number };

/** Every crossing of the line p + t·n with the rail, with its arc position on the rail. */
function lineRailHits(p: Point, n: Point, rail: Point[], cum: number[]): RailHit[] {
  const out: RailHit[] = [];
  for (let i = 0; i + 1 < rail.length; i++) {
    const c = rail[i]!;
    const e = sub(rail[i + 1]!, c);
    const denom = cross(n, e);
    if (Math.abs(denom) < 1e-12) continue;
    const w = sub(c, p);
    const t = cross(w, e) / denom;
    const v = cross(w, n) / denom;
    if (v < -1e-9 || v > 1 + 1e-9) continue;
    out.push({ point: add(p, scale(n, t)), t, pos: cum[i]! + v * (cum[i + 1]! - cum[i]!) });
  }
  return out;
}

/** The crossing nearest to p, preferring the given side of the axis. */
function nearestRailHit(
  p: Point,
  n: Point,
  rail: Point[],
  cum: number[],
  sign: 1 | -1,
): RailHit | undefined {
  const hits = lineRailHits(p, n, rail, cum);
  const onSide = hits.filter((h) => h.t * sign > -1e-9);
  const pool = onSide.length > 0 ? onSide : hits;
  let best: RailHit | undefined;
  for (const h of pool) if (!best || Math.abs(h.t) < Math.abs(best.t)) best = h;
  return best;
}

/**
 * Rungs: the axis normals, cut with the finished rails — every
 * `SATIN_RUNG_SPACING_MM`, at the edges of every opening, and densely through
 * the ends, so the stitches keep square to the stroke right into a slanted or
 * tapering end instead of fanning out there (module doc).
 */
function pickRungs(
  samples: Sample[],
  left: Side,
  right: Side,
  k0: number,
  k1: number,
  railA: Point[],
  railB: Point[],
  closed: boolean,
): [Point, Point][] {
  type Cand = { key: number; p: Point; n: Point };
  const cands: Cand[] = [];
  const every = Math.max(1, Math.round(SATIN_RUNG_SPACING_MM / AXIS_STEP_MM));
  const endStep = Math.max(1, Math.round(END_RUNG_STEP_MM / AXIS_STEP_MM));
  const add1 = (k: number): void => {
    const sm = samples[k];
    if (sm) cands.push({ key: k, p: sm.p, n: sm.n });
  };
  for (let k = k0; k <= k1; k += every) add1(k);
  const kind = (side: Side, k: number): string => (side.anchors[k]?.contact ? "c" : "v");
  for (let k = k0; k < k1; k++) {
    for (const side of [left, right]) {
      if (side.anchors[k] && side.anchors[k + 1] && kind(side, k) !== kind(side, k + 1)) {
        add1(kind(side, k) === "c" ? k : k + 1);
      }
    }
  }
  // A mildly slanted end turns its last stitches gradually over about one
  // width: no rung there, Ink/Stitch shares the turn out over the section. A
  // square end or a narrowing (wedge) end keeps its rungs to the end.
  const fanZone: [number, number] = [-Infinity, Infinity];
  if (!closed) {
    const width = 2 * median(samples.map((sm) => sm.r));
    for (const which of ["start", "end"] as const) {
      const ia = which === "end" ? railA.length - 1 : 0;
      const ib = which === "end" ? railB.length - 1 : 0;
      const kEdge = which === "end" ? k1 : k0;
      const out = which === "end" ? samples[kEdge]!.t : scale(samples[kEdge]!.t, -1);
      const a = railA[ia]!;
      const b = railB[ib]!;
      const slant = Math.abs(dot(sub(a, b), out)) / Math.max(width, 1e-6);
      const wedge = dist(a, b) < 1e-6;
      if (!wedge && slant > FAN_MIN_SLANT) {
        const keep = Math.round((FAN_LENGTH * width) / AXIS_STEP_MM);
        if (which === "end") fanZone[1] = kEdge - keep;
        else fanZone[0] = kEdge + keep;
      }
    }
  }
  if (!closed) {
    // Through the ends and on past the samples, straight, as far as the rails go.
    const width = 2 * Math.max(...samples.map((sm) => sm.r), 0.1);
    const reach = Math.ceil((2 * width + 1) / AXIS_STEP_MM);
    for (const [kEdge, step] of [
      [k0, -1],
      [k1, 1],
    ] as const) {
      const base = samples[kEdge]!;
      const inside = step > 0 ? Math.max(k0, k1 - 3 * endStep) : Math.min(k1, k0 + 3 * endStep);
      for (let k = inside; step > 0 ? k <= k1 : k >= k0; k += step * endStep) add1(k);
      for (let i = 1; i <= reach; i++) {
        const k = kEdge + step * i;
        const sm = samples[k];
        const p = sm ? sm.p : add(base.p, scale(base.t, step * i * AXIS_STEP_MM));
        const n = sm ? sm.n : base.n;
        if (i % endStep === 0) cands.push({ key: k, p, n });
      }
    }
  }
  cands.sort((a, b) => a.key - b.key);
  for (let i = cands.length - 1; i >= 0; i--) {
    if (cands[i]!.key < fanZone[0] || cands[i]!.key > fanZone[1]) cands.splice(i, 1);
  }

  const cumA = cumulativeLengths(railA);
  const cumB = cumulativeLengths(railB);
  const lenA = cumA[cumA.length - 1]!;
  const lenB = cumB[cumB.length - 1]!;
  // A normal that meets a rail further out than this met the wrong bit of it.
  const reachMax = 1.5 * 2 * Math.max(...samples.map((sm) => sm.r), 0.1) + 0.5;
  type Rung = { key: number; a: RailHit; b: RailHit };
  const valid: Rung[] = [];
  for (const c of cands) {
    const ha = nearestRailHit(c.p, c.n, railA, cumA, 1);
    const hb = nearestRailHit(c.p, c.n, railB, cumB, -1);
    if (!ha || !hb) continue;
    if (Math.abs(ha.t) > reachMax || Math.abs(hb.t) > reachMax) continue;
    if (ha.pos < 1e-6 || hb.pos < 1e-6 || ha.pos > lenA - 1e-6 || hb.pos > lenB - 1e-6) continue;
    if (dist(ha.point, hb.point) < 0.1) continue;
    valid.push({ key: c.key, a: ha, b: hb });
  }
  // The longest run of rungs that move on along both rails together — one
  // stray normal must not block the rest.
  const best: number[] = valid.map(() => 1);
  const prev: number[] = valid.map(() => -1);
  for (let i = 0; i < valid.length; i++) {
    for (let j = 0; j < i; j++) {
      const ok =
        valid[j]!.key < valid[i]!.key &&
        valid[j]!.a.pos < valid[i]!.a.pos - 1e-6 &&
        valid[j]!.b.pos < valid[i]!.b.pos - 1e-6;
      if (ok && best[j]! + 1 > best[i]!) {
        best[i] = best[j]! + 1;
        prev[i] = j;
      }
    }
  }
  let tail = -1;
  valid.forEach((_, i) => {
    if (tail < 0 || best[i]! > best[tail]!) tail = i;
  });
  const chain: Rung[] = [];
  for (let i = tail; i >= 0; i = prev[i]!) chain.unshift(valid[i]!);

  const rungs: [Point, Point][] = [];
  const minGap = RUNG_MIN_GAP_MM / AXIS_STEP_MM;
  let lastKey = -Infinity;
  for (const r of chain) {
    if (r.key - lastKey < minGap) continue;
    const a = r.a.point;
    const b = r.b.point;
    const d = normalize(sub(b, a));
    const ra = sub(a, scale(d, SATIN_RUNG_OVERSHOOT_MM));
    const rb = add(b, scale(d, SATIN_RUNG_OVERSHOOT_MM));
    if (rungs.some(([p, q]) => segmentsCross(ra, rb, p, q))) continue;
    if (touchesRailElsewhere(ra, rb, railA, a) || touchesRailElsewhere(ra, rb, railB, b)) continue;
    rungs.push([ra, rb]);
    lastKey = r.key;
  }
  return rungs;
}

// ---------------------------------------------------------------------------
// The letter
// ---------------------------------------------------------------------------

/**
 * Rails that leave the letter by more than this (mm) are no rails of it: the
 * normals met the wrong outline (a sharp turn without a corner in the plan).
 * Less than the pull compensation any preset sets (spec §7.2, 0.2 mm at least)
 * — within that, Ink/Stitch widens the column past the outline anyway.
 */
export const RAIL_OUTSIDE_MAX_MM = 0.15;
/**
 * A plan with the sharp bends split into corners wins if it covers the letter
 * well enough and no more than this much less than the plain plan: a column
 * turning round a corner piles its stitches up in the crotch.
 */
const SPLIT_COVERAGE_SLACK = 0.03;
/** Rails are checked every so many mm. */
const RAIL_CHECK_STEP_MM = 0.05;

/** How far the rail gets out of the letter, at most (mm). */
function railOutsideMm(shape: Polygon, rs: Ring[], rail: Point[]): number {
  let worst = 0;
  const check = (p: Point): void => {
    if (pointInPolygon(shape, p)) return;
    const at = locate(rs, p);
    if (at) worst = Math.max(worst, dist(at.point, p));
  };
  for (let i = 0; i + 1 < rail.length; i++) {
    const a = rail[i]!;
    const b = rail[i + 1]!;
    const n = Math.max(1, Math.ceil(dist(a, b) / RAIL_CHECK_STEP_MM));
    for (let k = 0; k < n; k++) check(lerp(a, b, k / n));
  }
  if (rail.length > 0) check(rail[rail.length - 1]!);
  return worst;
}

/** Do the two rails cross each other (a twisted column)? Touching ends do not count. */
function railsCross(railA: Point[], railB: Point[]): boolean {
  for (let i = 0; i + 1 < railA.length; i++) {
    for (let j = 0; j + 1 < railB.length; j++) {
      if (segmentsCross(railA[i]!, railA[i + 1]!, railB[j]!, railB[j + 1]!)) return true;
    }
  }
  return false;
}

/**
 * A column lying on the others for more than this share of its area is no
 * stroke of its own: the plan read a crossing as one. Crossing strokes share
 * up to a third (the "4" of the test glyphs 31 %, the X 19 %).
 */
export const COLUMN_OVERLAP_MAX = 0.6;

/** The first column that lies mostly on the others, with its share. */
function overlapFault(columns: SatinColumnPlan[]): string | undefined {
  if (columns.length < 2) return undefined;
  const area = (ps: Polygon[]): number => ps.reduce((sum, p) => sum + Math.abs(polygonArea(p)), 0);
  const patches = columns.map((c) => railPatch(c.railA, c.railB));
  for (let i = 0; i < columns.length; i++) {
    const own = union(patches[i]!);
    const total = area(own);
    if (total <= 0) continue;
    const others = union(patches.filter((_, j) => j !== i).flat());
    const shared = area(intersect(own, others)) / total;
    if (shared > COLUMN_OVERLAP_MAX) {
      return `stroke ${columns[i]!.stroke}: ${(shared * 100).toFixed(0)} % of its column lies on the others`;
    }
  }
  return undefined;
}

/** What is wrong with a column, if anything (module doc: measured, not assumed). */
function columnFault(shape: Polygon, rs: Ring[], c: Built): string | undefined {
  const out = Math.max(railOutsideMm(shape, rs, c.railA), railOutsideMm(shape, rs, c.railB));
  if (out > RAIL_OUTSIDE_MAX_MM) return `a rail leaves the letter by ${out.toFixed(2)} mm`;
  if (railsCross(c.railA, c.railB)) return "its rails cross";
  return undefined;
}

/** One plan: the stroke graph read one way, turned into columns and checked. */
function planColumns(
  shape: Polygon,
  opts: SatinColumnsOptions,
  splitSharpBends: boolean,
): SatinColumnsResult {
  const idPrefix = opts.idPrefix ?? "satin";
  const graph = strokeGraph(shape, idPrefix, { splitSharpBends });
  const warnings: Warning[] = [...graph.warnings];
  const fail = (
    reason: string,
    columns: SatinColumnPlan[] = [],
    coverage = 0,
  ): SatinColumnsResult => ({
    ok: false,
    columns,
    coverage,
    reason,
    smoothedMm: 0,
    graphs: [graph],
    warnings,
  });
  if (graph.strokes.length === 0) return fail("no stroke found");
  const order = stitchOrder(graph.strokes.length, graph.before);
  if (!order) return fail("stitch order runs in a circle");

  const rs = buildRings(shape);
  const own = readOwnership(rs, graph);
  const built = new Map<number, Built>();
  // Through strokes first: an abutting end needs the rail it ends under.
  for (const si of [...order].reverse()) {
    const stroke = graph.strokes[si]!;
    const endInfo = (e: StrokeEnd): EndInfo =>
      e.kind === "abut" ? { kind: "abut", onto: built.get(e.onto) } : { kind: e.kind };
    const col = buildColumn(
      shape,
      stroke,
      graph,
      rs,
      own,
      endInfo(stroke.start),
      endInfo(stroke.end),
      opts.underlapMm,
    );
    if ("error" in col) return fail(`stroke ${si}: ${col.error}`);
    if (col.railA.length < 2 || col.railB.length < 2) return fail(`stroke ${si}: rails too short`);
    const fault = columnFault(shape, rs, col);
    if (fault) return fail(`stroke ${si}: ${fault}`);
    built.set(si, col);
  }
  const columns: SatinColumnPlan[] = order.map((si, i) => {
    const c = built.get(si)!;
    return {
      id: `${idPrefix}-${i}`,
      stroke: si,
      railA: c.railA,
      railB: c.railB,
      rungs: c.rungs,
      // Without rungs (a short bar with slanted ends), the stroke's own width.
      widthMm:
        c.rungs.length > 0
          ? median(c.rungs.map(([a, b]) => dist(a, b) - 2 * SATIN_RUNG_OVERSHOOT_MM))
          : 2 * median(c.axis.map((sm) => sm.r)),
      closed: c.closed,
    };
  });
  const overlap = overlapFault(columns);
  if (overlap) return fail(overlap);
  const coverage = patchCoverage(
    shape,
    columns.flatMap((c) => railPatch(c.railA, c.railB)),
  );
  if (coverage < COLUMN_COVERAGE_MIN) {
    return fail(
      `columns cover ${(coverage * 100).toFixed(1)} % (need ${(COLUMN_COVERAGE_MIN * 100).toFixed(0)} %)`,
      columns,
      coverage,
    );
  }
  return { ok: true, columns, coverage, smoothedMm: 0, graphs: [graph], warnings };
}

/** A letter's plan, with its sharp bends read as corners or not (see `satinColumns`). */
function planLetter(shape: Polygon, opts: SatinColumnsOptions): SatinColumnsResult {
  let best = planColumns(shape, opts, false);
  if (best.graphs[0]!.sharpBendCount > 0) {
    const split = planColumns(shape, opts, true);
    const holds = split.ok && (!best.ok || split.coverage >= best.coverage - SPLIT_COVERAGE_SLACK);
    if (holds || (!best.ok && split.coverage > best.coverage)) best = split;
  }
  return best;
}

/**
 * Smoothing radii tried, in turn, on a letter whose own outline yields no plan
 * (`smooth.ts`). Measured on "SEGEN SEIN": 0 of 34 pieces as drawn, 18 at
 * 0.2 mm, 28 at 0.3 mm, 33 at 0.4 mm — the smallest radius that works wins.
 */
export const SMOOTHING_STEPS_MM = [0.2, 0.3, 0.4];

/**
 * How the note `satinColumns` writes for a letter it leaves to tatami ends. The
 * template drops it where it sets the shape as a running stitch instead
 * (`template.ts`) — the note would otherwise say the opposite of what happens.
 */
export const STAYS_TATAMI = "stays tatami.";

/**
 * Satin columns for one letter (module doc). Never throws on odd geometry:
 * a letter that cannot be set comes back with `ok: false` and the reason.
 *
 * Where the axis turns sharply, the bend may be a corner between two strokes
 * (the feet of a "w") or a tight curve (the bowl of an italic "a"): both plans
 * are made. Corners win when their plan holds (`SPLIT_COVERAGE_SLACK`), else
 * the one that covers more.
 *
 * A letter whose outline yields no plan is tried again smoothed
 * (`SMOOTHING_STEPS_MM`), piece by piece; the coverage is always measured
 * against the outline as drawn, and the smoothing is reported.
 */
export function satinColumns(shape: Polygon, opts: SatinColumnsOptions): SatinColumnsResult {
  const idPrefix = opts.idPrefix ?? "satin";
  const plain = planLetter(shape, opts);
  if (plain.ok) return plain;
  // Smoothing tidies strokes up; it must not make a stroke of a blob.
  const hasStrokes = plain.graphs.some((g) => g.strokes.length > 0);
  for (const radius of hasStrokes ? SMOOTHING_STEPS_MM : []) {
    const pieces = smoothOutline(shape, radius);
    if (pieces.length === 0) continue;
    // Drawn holes are no texture — a larger radius would only fill in more.
    const change = smoothingChange(shape, pieces);
    if (!isTextureSmoothing(change)) {
      plain.reason =
        `${plain.reason}; not smoothed: that would fill ${(change.added * 100).toFixed(0)} % ` +
        `of a clean outline (drawn holes)`;
      break;
    }
    const plans = pieces.map((piece) => planLetter(piece, opts));
    if (!plans.every((p) => p.ok)) continue;
    const columns = plans
      .flatMap((p) => p.columns)
      .map((c, i) => ({ ...c, id: `${idPrefix}-${i}` }));
    const coverage = patchCoverage(
      shape,
      columns.flatMap((c) => railPatch(c.railA, c.railB)),
    );
    if (coverage < COLUMN_COVERAGE_MIN) continue;
    const warnings = plans.flatMap((p) => p.warnings);
    warnings.push(
      warn(
        WARNING.AUTOSATIN_MIXED,
        `"${idPrefix}": outline smoothed by ${radius} mm for satin — notches, holes and ` +
          `hairlines under ${(2 * radius).toFixed(1)} mm are stitched over ` +
          `(columns cover ${(coverage * 100).toFixed(1)} % of the letter as drawn).`,
        "info",
        idPrefix,
      ),
    );
    return {
      ok: true,
      columns,
      coverage,
      smoothedMm: radius,
      graphs: plans.flatMap((p) => p.graphs),
      warnings,
    };
  }
  plain.warnings.push(
    warn(
      WARNING.AUTOSATIN_MIXED,
      `"${idPrefix}": ${plain.reason} — ${STAYS_TATAMI}`,
      "info",
      idPrefix,
    ),
  );
  return plain;
}
