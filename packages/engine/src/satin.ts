/**
 * Satin (spec §7).
 *
 * Order of the stages: normalise rails -> pull compensation -> pairing (with or
 * without rungs) -> short stitches -> zigzag (with split) -> underlay in front.
 */
import type { Point, Polygon, Polyline } from "@texma-stitch/geometry";
import {
  arcLength,
  cumulativeLengths,
  dedupe,
  dist,
  lerp,
  nearestPoint,
  offsetPolyline,
  pointAt,
  resample,
  tangentAt,
} from "@texma-stitch/geometry";
import type { SatinObject, Warning } from "./types.js";
import { warn, WARNING } from "./warnings.js";

/** One rung: paired points on rail A and rail B. */
export type SatinRung = { a: Point; b: Point };

export const SATIN_MIN_WIDTH_MM = 1.0;
export const SATIN_RUNNING_HINT_MM = 0.6;
export const SATIN_MAX_WIDTH_MM = 12.0;
/** Inner radius below which short stitches kick in (spec §7.5). */
export const SHORT_STITCH_RADIUS_MM = 1.0;
export const SHORT_STITCH_FACTOR = 0.7;
export const CENTER_UNDERLAY_STITCH_MM = 2.5;

// ---------------------------------------------------------------------------
// Rungs and pairing (spec §7.1)
// ---------------------------------------------------------------------------

/**
 * Arc length at which the rung `seg` crosses the rail. Without a real
 * intersection (the rung stops just short of the rail) the function falls back
 * to projecting the rung midpoint — rungs are drawn by hand in the editor, so
 * half a millimetre may be missing.
 */
export function rungCutLength(rail: Polyline, seg: [Point, Point]): number {
  const cum = cumulativeLengths(rail);
  const [p, q] = seg;
  const rx = q.x - p.x;
  const ry = q.y - p.y;
  for (let i = 0; i + 1 < rail.length; i++) {
    const a = rail[i]!;
    const b = rail[i + 1]!;
    const sx = b.x - a.x;
    const sy = b.y - a.y;
    const denom = rx * sy - ry * sx;
    if (Math.abs(denom) < 1e-12) continue;
    const t = ((a.x - p.x) * sy - (a.y - p.y) * sx) / denom;
    const u = ((a.x - p.x) * ry - (a.y - p.y) * rx) / denom;
    if (t >= -1e-9 && t <= 1 + 1e-9 && u >= -1e-9 && u <= 1 + 1e-9) {
      return cum[i]! + u * Math.hypot(sx, sy);
    }
  }
  const mid: Point = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
  return nearestPoint(rail, mid, cum).length;
}

/** A stretch of both rails between two consecutive rungs. */
type RailSection = { a0: number; a1: number; b0: number; b1: number };

/** Split the rails into sections along the rungs (spec §7.1). */
export function railSections(
  railA: Polyline,
  railB: Polyline,
  rungs: [Point, Point][],
): RailSection[] {
  const lenA = arcLength(railA);
  const lenB = arcLength(railB);
  if (rungs.length === 0) return [{ a0: 0, a1: lenA, b0: 0, b1: lenB }];

  const cuts = rungs
    .map((r) => ({ a: rungCutLength(railA, r), b: rungCutLength(railB, r) }))
    .sort((x, y) => x.a - y.a);

  const out: RailSection[] = [];
  let prevA = 0;
  let prevB = 0;
  for (const c of cuts) {
    // Skip rungs sitting exactly on a boundary, and ones that would reverse the
    // order on rail B — otherwise we get sections of negative length and the
    // column twists at exactly the place the rung was meant to hold straight.
    if (c.a - prevA < 1e-6 || c.b - prevB < 1e-6) continue;
    out.push({ a0: prevA, a1: c.a, b0: prevB, b1: c.b });
    prevA = c.a;
    prevB = c.b;
  }
  if (lenA - prevA > 1e-6 && lenB - prevB > 1e-6) {
    out.push({ a0: prevA, a1: lenA, b0: prevB, b1: lenB });
  }
  return out.length > 0 ? out : [{ a0: 0, a1: lenA, b0: 0, b1: lenB }];
}

/**
 * Pairing: within a section by arc-length fraction. The number of rungs follows
 * the LONGER side so the outer curve gets no gaps (spec §7.3).
 */
export function pairRails(
  railA: Polyline,
  railB: Polyline,
  rungs: [Point, Point][],
  spacingMm: number,
): SatinRung[] {
  if (railA.length < 2 || railB.length < 2) return [];
  const cumA = cumulativeLengths(railA);
  const cumB = cumulativeLengths(railB);
  const spacing = Math.max(spacingMm, 0.05);

  const out: SatinRung[] = [];
  const sections = railSections(railA, railB, rungs);
  for (let s = 0; s < sections.length; s++) {
    const p = sections[s]!;
    const lenA = p.a1 - p.a0;
    const lenB = p.b1 - p.b0;
    const n = Math.max(1, Math.ceil(Math.max(lenA, lenB) / spacing));
    for (let j = s === 0 ? 0 : 1; j <= n; j++) {
      const f = j / n;
      out.push({
        a: pointAt(railA, p.a0 + lenA * f, cumA),
        b: pointAt(railB, p.b0 + lenB * f, cumB),
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Pull compensation (spec §7.2)
// ---------------------------------------------------------------------------

/**
 * Shift both rails outwards by `pullCompMm`, perpendicular to the rail.
 * "Outwards" means away from the other rail — the sign comes from where the
 * column actually lies, not from the drawing direction.
 */
/**
 * Median width of the column, sampled along both rails by arc-length fraction.
 * The median, not the mean: a column that flares at one end should not be
 * widened as if it were that wide everywhere (spec §7.2).
 */
export function columnWidthMm(railA: Polyline, railB: Polyline): number {
  if (railA.length < 2 || railB.length < 2) return 0;
  const samples: number[] = [];
  for (let i = 0; i <= 10; i++) {
    samples.push(dist(pointAtFraction(railA, i / 10), pointAtFraction(railB, i / 10)));
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)] ?? 0;
}

/** Point at a fraction of the rail's length. */
function pointAtFraction(rail: Polyline, t: number): Point {
  const total = arcLength(rail);
  if (total < 1e-12) return { ...rail[0]! };
  return pointAt(rail, total * t);
}

/**
 * Pull compensation of a column in millimetres per side (spec §7.2, §14).
 *
 * An explicit `pullCompMm` wins — that is the override, and the way a font
 * states what it was drawn with (§9.2). Otherwise the percentage of the
 * column's own width, capped.
 */
export function pullCompFor(obj: SatinObject): number {
  if (obj.pullCompMm !== undefined) return obj.pullCompMm;
  const pct = obj.pullCompPct ?? 0;
  if (pct === 0) return 0;
  const wide = (columnWidthMm(obj.railA, obj.railB) * pct) / 100;
  return obj.pullCompMaxMm === undefined ? wide : Math.min(wide, obj.pullCompMaxMm);
}

export function applyPullComp(
  railA: Polyline,
  railB: Polyline,
  pullCompMm: number,
): [Polyline, Polyline] {
  if (pullCompMm === 0) return [railA, railB];
  return [
    offsetPolyline(railA, pullCompMm * outwardSign(railA, railB)),
    offsetPolyline(railB, pullCompMm * outwardSign(railB, railA)),
  ];
}

/**
 * +1 when the left normal of `self` points away from `other`, -1 otherwise.
 *
 * Decided by majority over several places along the rail, not at one vertex. At
 * an endpoint of a short rail the other rail can sit almost straight ahead, and
 * then the cross product is near zero and its sign is noise. Getting it wrong
 * flips the underlay inset outwards, which puts stabilising stitches outside the
 * shape where they show around the edge.
 */
function outwardSign(self: Polyline, other: Polyline): number {
  const cum = cumulativeLengths(self);
  const total = cum[cum.length - 1]!;
  if (total < 1e-12) return 1;

  const middle = pointAt(self, 0.5 * total, cum);
  const midTangent = tangentAt(self, 0.5 * total, cum);

  let vote = 0;
  for (const f of [0.1, 0.3, 0.5, 0.7, 0.9]) {
    const here = pointAt(self, f * total, cum);
    const t = tangentAt(self, f * total, cum);
    const nLeft = { x: t.y, y: -t.x };
    const opposite = nearestPoint(other, here).point;
    const toward = nLeft.x * (opposite.x - here.x) + nLeft.y * (opposite.y - here.y);
    if (Math.abs(toward) < 1e-9) continue; // ambiguous here, let the others decide
    vote += toward > 0 ? -1 : 1;
  }
  if (vote !== 0) return vote > 0 ? 1 : -1;

  // Every sample was ambiguous: the nearest point of the other rail lies along
  // this rail rather than across it. That happens at the end cap of a shape,
  // where both rails run into the same corner. The centre of mass of the other
  // rail still says which side the column is on.
  const centroid = other.reduce(
    (acc, p) => ({ x: acc.x + p.x / other.length, y: acc.y + p.y / other.length }),
    { x: 0, y: 0 },
  );
  const nLeft = { x: midTangent.y, y: -midTangent.x };
  const toward = nLeft.x * (centroid.x - middle.x) + nLeft.y * (centroid.y - middle.y);
  return toward > 0 ? -1 : 1;
}

// ---------------------------------------------------------------------------
// Short stitches (spec §7.5)
// ---------------------------------------------------------------------------

/**
 * In tight curves shorten every second stitch on the inside to 70 %.
 *
 * The inner radius is estimated with similar triangles: if outer and inner rail
 * advance through the same angle, their step lengths relate as (r + w) to r,
 * hence r = w * dInner / (dOuter - dInner).
 */
export function applyShortStitches(rungs: SatinRung[]): SatinRung[] {
  if (rungs.length < 2) return rungs;
  const out = rungs.map((r) => ({ a: { ...r.a }, b: { ...r.b } }));
  for (let i = 1; i < out.length; i++) {
    if (i % 2 === 0) continue; // only every second stitch
    const cur = out[i]!;
    const prev = rungs[i - 1]!;
    const dA = dist(rungs[i]!.a, prev.a);
    const dB = dist(rungs[i]!.b, prev.b);
    const w = dist(cur.a, cur.b);
    if (w < 1e-9) continue;
    const dInner = Math.min(dA, dB);
    const dOuter = Math.max(dA, dB);
    if (dOuter - dInner < 1e-9) continue;
    const r = (w * dInner) / (dOuter - dInner);
    if (r >= SHORT_STITCH_RADIUS_MM) continue;
    if (dA < dB) cur.a = lerp(cur.a, cur.b, 1 - SHORT_STITCH_FACTOR);
    else cur.b = lerp(cur.b, cur.a, 1 - SHORT_STITCH_FACTOR);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Zigzag and split satin (spec §7.3, §7.4)
// ---------------------------------------------------------------------------

/**
 * Point sequence of the zigzag: A, B, A, B … Every step crosses the column, and
 * penetrations on the same rail sit `spacingMm` apart.
 */
export function zigzagSequence(rungs: SatinRung[]): Point[] {
  const out: Point[] = [];
  for (const r of rungs) {
    out.push({ ...r.a }, { ...r.b });
  }
  return out;
}

/**
 * Split satin (spec §7.4): crossings wider than `maxWidthMm` are broken into
 * `ceil(b / maxWidthMm)` partial stitches. The intermediate points move on by a
 * quarter per crossing so that no line forms across the column.
 */
export function splitWideStitches(seq: Point[], maxWidthMm: number, staggerRows = 4): Point[] {
  if (seq.length < 2 || maxWidthMm <= 0) return seq;
  const out: Point[] = [{ ...seq[0]! }];
  for (let i = 0; i + 1 < seq.length; i++) {
    const from = seq[i]!;
    const to = seq[i + 1]!;
    const w = dist(from, to);
    const k = Math.ceil(w / maxWidthMm);
    if (k > 1) {
      const stagger = (i % staggerRows) / staggerRows / k;
      for (let j = 1; j < k; j++) {
        const f = Math.min(0.999, Math.max(0.001, j / k + stagger));
        out.push(lerp(from, to, f));
      }
    }
    out.push({ ...to });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Underlay (spec §7.6)
// ---------------------------------------------------------------------------

/** Centre line of the column: the midpoints of the rungs. */
export const centerLine = (rungs: SatinRung[]): Polyline => rungs.map((r) => lerp(r.a, r.b, 0.5));

/** Shift a rail inwards (towards the other rail) by `insetMm`. */
function inset(rail: Polyline, other: Polyline, insetMm: number): Polyline {
  if (insetMm === 0) return rail;
  return offsetPolyline(rail, -insetMm * outwardSign(rail, other));
}

/** Append `next` to `out` in whichever direction gives the shorter connection. */
function appendPath(out: Point[], next: Point[]): void {
  if (next.length === 0) return;
  if (out.length === 0) {
    out.push(...next.map((p) => ({ ...p })));
    return;
  }
  const end = out[out.length - 1]!;
  const forward = dist(end, next[0]!) <= dist(end, next[next.length - 1]!);
  const ordered = forward ? next : [...next].reverse();
  for (const p of ordered) out.push({ ...p });
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

/** Outline of the column — needed for connections (spec §10.2) and display. */
export function satinOutline(railA: Polyline, railB: Polyline): Polygon {
  return {
    outer: [...railA.map((p) => ({ ...p })), ...[...railB].reverse().map((p) => ({ ...p }))],
    holes: [],
  };
}

export type SatinResult = { stitches: Point[]; rungs: SatinRung[]; warnings: Warning[] };

export function generateSatin(obj: SatinObject): SatinResult {
  const warnings: Warning[] = [];
  let railA = dedupe(obj.railA, 1e-6);
  let railB = dedupe(obj.railB, 1e-6);
  let rungs = obj.rungs;

  if (railA.length < 2 || railB.length < 2) {
    warnings.push(warn(WARNING.EMPTY_OBJECT, "Satin without two rails.", "error", obj.id));
    return { stitches: [], rungs: [], warnings };
  }

  if (obj.reverse) {
    railA = [...railA].reverse();
    railB = [...railB].reverse();
    rungs = [...rungs].reverse();
  }

  const [compA, compB] = applyPullComp(railA, railB, pullCompFor({ ...obj, railA, railB }));
  let pairs = pairRails(compA, compB, rungs, obj.spacingMm);
  if (pairs.length === 0) {
    warnings.push(warn(WARNING.EMPTY_OBJECT, "Satin yields no rungs.", "error", obj.id));
    return { stitches: [], rungs: [], warnings };
  }

  const widths = pairs.map((r) => dist(r.a, r.b));
  const minWidth = Math.min(...widths);
  const maxWidth = Math.max(...widths);
  if (minWidth < SATIN_RUNNING_HINT_MM) {
    warnings.push(
      warn(
        WARNING.SATIN_TOO_NARROW,
        `Column only ${minWidth.toFixed(2)} mm wide — use a running stitch.`,
        "warn",
        obj.id,
      ),
    );
  } else if (minWidth < SATIN_MIN_WIDTH_MM) {
    warnings.push(
      warn(WARNING.SATIN_TOO_NARROW, `Column only ${minWidth.toFixed(2)} mm wide.`, "warn", obj.id),
    );
  }
  if (maxWidth > SATIN_MAX_WIDTH_MM) {
    warnings.push(
      warn(
        WARNING.SATIN_TOO_WIDE,
        `Column up to ${maxWidth.toFixed(1)} mm wide — use a fill.`,
        "warn",
        obj.id,
      ),
    );
  }

  if (obj.shortStitches) pairs = applyShortStitches(pairs);

  const stitches: Point[] = [];

  // Underlay: center -> contour -> zigzag (spec §7.6)
  if (obj.underlay.center) {
    appendPath(stitches, resample(centerLine(pairs), CENTER_UNDERLAY_STITCH_MM, true));
  }
  if (obj.underlay.contour) {
    const insetA = inset(compA, compB, obj.underlay.insetMm);
    const insetB = inset(compB, compA, obj.underlay.insetMm);
    appendPath(stitches, resample(insetA, CENTER_UNDERLAY_STITCH_MM, true));
    appendPath(stitches, resample(insetB, CENTER_UNDERLAY_STITCH_MM, true));
  }
  if (obj.underlay.zigzag) {
    const insetA = inset(compA, compB, obj.underlay.insetMm);
    const insetB = inset(compB, compA, obj.underlay.insetMm);
    const coarse = pairRails(insetA, insetB, rungs, obj.underlay.zigzagSpacingMm);
    appendPath(stitches, splitWideStitches(zigzagSequence(coarse), obj.maxWidthMm));
  }

  // Top stitches
  appendPath(stitches, splitWideStitches(zigzagSequence(pairs), obj.maxWidthMm));

  return { stitches: dedupe(stitches, 1e-6), rungs: pairs, warnings };
}
