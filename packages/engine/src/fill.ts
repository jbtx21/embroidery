/**
 * Fill stitch (spec §8).
 *
 * After rotating, the rows lie horizontally. The grid for rows AND stagger is
 * absolute (multiples of row spacing and stitch length measured from the
 * origin) — otherwise the stagger drifts with the start of each segment and the
 * stitch rows form visible lines (spec §8.4).
 */
import type { Point, Polygon, Polyline } from "@texma-stitch/geometry";
import {
  applyToPolygon,
  clipHorizontal,
  closeRing,
  dist,
  insideTravel,
  offset,
  offsetDirectional,
  polygonArea,
  polygonBbox,
  rings,
  rotator,
  segmentInside,
} from "@texma-stitch/geometry";
import type { FillObject, Warning } from "./types.js";
import { runningStitches } from "./running.js";
import { warn, WARNING } from "./warnings.js";

/**
 * Stitch length of the travel paths inside the shape (spec §8.5, 21.09.2026 —
 * before 2,0). A travel path runs under the top stitching and is not seen, and
 * 3 mm is what a digitiser uses for a hidden running stitch. It also puts a
 * third fewer needle holes into the fabric where several ways share a narrow
 * bridge. Connections BETWEEN objects keep 2,0 (§10.2) — those can show.
 */
export const TRAVEL_STITCH_MM = 3.0;
/** Area below which a fill stops making sense (spec §11). */
export const FILL_TINY_MM2 = 4;
/**
 * A row piece shorter than this does not cover, it perforates — the trade rule
 * is that no stitch belongs below 1 mm (spec §11).
 */
export const SHORT_ROW_MM = 1.0;
/** Fewer row pieces than this and the shape is too small to judge (spec §11). */
export const NARROW_MIN_ROWS = 8;
/** From this share of short row pieces on, a fill is the wrong stitch (spec §11). */
export const NARROW_SHARE = 0.5;
/** From this edge length on, use the double underlay (spec §8.6). */
export const DOUBLE_UNDERLAY_EDGE_MM = 20;

export type FillParams = {
  angleDeg: number;
  rowSpacingMm: number;
  stitchLengthMm: number;
  staggerRows: number;
};

type Segment = {
  /** Absolute row index on the fixed grid. */
  row: number;
  y: number;
  x0: number;
  x1: number;
  /** Index within the row — used by the section graph. */
  idx: number;
};

type Section = { segments: Segment[] };

// ---------------------------------------------------------------------------
// Scanlines (spec §8.2)
// ---------------------------------------------------------------------------

/** Rows from bottom to top. In the SVG system, bottom means large y. */
export function scanlines(poly: Polygon, rowSpacingMm: number): Segment[][] {
  const spacing = Math.max(rowSpacingMm, 0.02);
  const b = polygonBbox(poly);
  const kBottom = Math.floor(b.maxY / spacing);
  const kTop = Math.ceil(b.minY / spacing);
  const rows: Segment[][] = [];
  for (let k = kBottom; k >= kTop; k--) {
    const y = k * spacing;
    const hits = clipHorizontal(y, poly);
    const segs: Segment[] = hits
      .map((h, idx) => ({ row: k, y, x0: Math.min(h.ta, h.tb), x1: Math.max(h.ta, h.tb), idx }))
      .filter((s) => s.x1 - s.x0 > 1e-6);
    if (segs.length > 0) rows.push(segs.map((s, idx) => ({ ...s, idx })));
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Sections (spec §8.3)
// ---------------------------------------------------------------------------

const overlaps = (a: Segment, b: Segment): boolean => a.x0 < b.x1 - 1e-9 && b.x0 < a.x1 - 1e-9;

/**
 * Connected chains without branching. When one segment branches upwards into
 * two — or two run together into one — the section ends.
 */
export function sections(rows: Segment[][]): Section[] {
  const key = (r: number, i: number): string => `${r}:${i}`;
  const used = new Set<string>();
  const out: Section[] = [];

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]!;
    for (let i = 0; i < row.length; i++) {
      if (used.has(key(r, i))) continue;
      const chain: Segment[] = [];
      let ri = r;
      let ii = i;
      for (;;) {
        const seg = rows[ri]![ii]!;
        chain.push(seg);
        used.add(key(ri, ii));

        const above = rows[ri + 1];
        if (!above) break;
        const up = above
          .map((s, si) => ({ s, si }))
          .filter((x) => overlaps(seg, x.s) && !used.has(key(ri + 1, x.si)));
        if (up.length !== 1) break; // branching upwards
        const candidate = up[0]!;
        const down = rows[ri]!.filter((s) => overlaps(s, candidate.s));
        if (down.length !== 1) break; // two rows running together
        ri += 1;
        ii = candidate.si;
      }
      out.push({ segments: chain });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Stitches within a section (spec §8.4)
// ---------------------------------------------------------------------------

/**
 * Stitch points of one row. The positions come from the fixed grid
 * `(m + stagger) * stitchLength`; first and last point always sit on the outline.
 */
export function rowStitches(seg: Segment, params: FillParams, rightward: boolean): Point[] {
  const step = Math.max(params.stitchLengthMm, 0.2);
  const staggerRows = Math.max(1, Math.round(params.staggerRows));
  // Modulo that stays within [0, staggerRows) for negative row indices too.
  const stagger = (((seg.row % staggerRows) + staggerRows) % staggerRows) / staggerRows;

  const xs: number[] = [seg.x0];
  const mFrom = Math.ceil(seg.x0 / step - stagger);
  const mTo = Math.floor(seg.x1 / step - stagger);
  for (let m = mFrom; m <= mTo; m++) {
    const x = (m + stagger) * step;
    if (x > seg.x0 + 1e-9 && x < seg.x1 - 1e-9) xs.push(x);
  }
  xs.push(seg.x1);

  const points = xs.map((x) => ({ x, y: seg.y }));
  return rightward ? points : points.reverse();
}

type Entry = { point: Point; fromBottom: boolean; rightward: boolean };

function entries(section: Section): Entry[] {
  const first = section.segments[0]!;
  const last = section.segments[section.segments.length - 1]!;
  return [
    { point: { x: first.x0, y: first.y }, fromBottom: true, rightward: true },
    { point: { x: first.x1, y: first.y }, fromBottom: true, rightward: false },
    { point: { x: last.x0, y: last.y }, fromBottom: false, rightward: true },
    { point: { x: last.x1, y: last.y }, fromBottom: false, rightward: false },
  ];
}

/**
 * Points between a and b so no step is longer than `maxMm` — a and b themselves
 * are not included.
 */
export function bridge(a: Point, b: Point, maxMm: number): Point[] {
  const d = dist(a, b);
  if (d <= maxMm || maxMm <= 0) return [];
  const n = Math.ceil(d / maxMm);
  const out: Point[] = [];
  for (let i = 1; i < n; i++) {
    out.push({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n });
  }
  return out;
}

/**
 * Serpentine through the section — row by row, alternating direction.
 *
 * The step from the end of one row to the start of the next runs along the
 * boundary. On a straight edge that is the row spacing, but on a curved one the
 * row end walks sideways: at the 2 mm spacing of the grid underlay a circle
 * produces a 6 mm step. It is subdivided (spec §8.7) — the line is the same one
 * that was stitched before, just no longer in a single stitch.
 */
export function sectionStitches(section: Section, params: FillParams, entry: Entry): Point[] {
  const rows = entry.fromBottom ? section.segments : [...section.segments].reverse();
  const out: Point[] = [];
  let rightward = entry.rightward;
  for (const seg of rows) {
    const pts = rowStitches(seg, params, rightward);
    const last = out[out.length - 1];
    if (last !== undefined && pts[0] !== undefined) {
      out.push(...bridge(last, pts[0], params.stitchLengthMm));
    }
    out.push(...pts);
    rightward = !rightward;
  }
  return out;
}

/**
 * How much of a shape is too narrow to fill (spec §11).
 *
 * `FILL_TINY` asks how big an area is; this asks how WIDE it is. A crescent of
 * 114 mm² passes the area check and is still nothing but needle stabs, because
 * every one of its rows is shorter than a stitch.
 */
export function narrowRowShare(rows: Segment[][]): { pieces: number; share: number } {
  let pieces = 0;
  let short = 0;
  for (const row of rows) {
    for (const seg of row) {
      pieces++;
      if (seg.x1 - seg.x0 < SHORT_ROW_MM) short++;
    }
  }
  return { pieces, share: pieces === 0 ? 0 : short / pieces };
}

// ---------------------------------------------------------------------------
// Section order and travel paths (spec §8.5, §8.7)
// ---------------------------------------------------------------------------

/**
 * How far the travel area is widened over the stitched shape (mm).
 *
 * Phase ends and section ends sit exactly ON the outline, and a point on the
 * boundary is neither in nor out: the visibility test then finds no way and the
 * travel falls back to the straight line. A hair of air around the shape makes
 * those points properly inside. Far under what the machine can resolve.
 */
export const TRAVEL_INSIDE_EPS_MM = 0.05;

/**
 * How many of the nearest section entries are checked for a direct line before
 * the plain nearest one is taken (spec §8.5).
 */
const NEAREST_CHECKED = 8;

/** Travel path without its start and end point, or a jump (spec §8.7). */
export type TravelPath = { points: Point[]; jump: boolean };

/** Points plus the indices that are reached by a jump instead of a stitch. */
export type StitchPath = { points: Point[]; jumpAt: number[] };

/** Does every segment of the path lie inside the shape? */
function pathInside(poly: Polygon, path: Polyline): boolean {
  for (let i = 1; i < path.length; i++) {
    if (!segmentInside(poly, path[i - 1]!, path[i]!)) return false;
  }
  return true;
}

/** The area the needle may travel through: the shape plus a hair of air. */
export function travelArea(poly: Polygon): Polygon {
  return offset(poly, TRAVEL_INSIDE_EPS_MM)[0] ?? poly;
}

/**
 * Pieces in the order the needle should walk them: nearest first, from where it
 * stands. Without this they arrive in whatever order the clipping produced
 * (spec §8.5).
 */
export function nearestFirst(pieces: Polygon[], from: Point | undefined): Polygon[] {
  if (pieces.length < 2) return [...pieces];
  const centre = (p: Polygon): Point => {
    const b = polygonBbox(p);
    return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
  };
  const left = pieces.map((p) => ({ poly: p, at: centre(p) }));
  const out: Polygon[] = [];
  let cursor = from ?? left[0]!.at;
  while (left.length > 0) {
    let best = 0;
    for (let i = 1; i < left.length; i++) {
      if (dist(cursor, left[i]!.at) < dist(cursor, left[best]!.at)) best = i;
    }
    const [taken] = left.splice(best, 1);
    out.push(taken!.poly);
    cursor = taken!.at;
  }
  return out;
}

/**
 * Guard at the exit of a fill: every stitch that leaves the shape is replaced
 * by the way around inside it, and where there is no way, by a jump.
 *
 * The rows themselves are cut from the shape and cannot leave it — what can is
 * the move between them: the row change of §8.7 runs straight from the end of
 * one row to the start of the next, and on a waisted shape that line crosses
 * bare fabric. Checking here catches every one of them, wherever it came from.
 */
export function keepInside(area: Polygon, pts: Point[], known: number[] = []): StitchPath {
  const jumps = new Set(known);
  const out: Point[] = [];
  const jumpAt: number[] = [];
  for (const [i, p] of pts.entries()) {
    // A jump is allowed to leave the shape — that is the whole point of it.
    if (i === 0 || jumps.has(i)) {
      if (jumps.has(i)) jumpAt.push(out.length);
      out.push(p);
      continue;
    }
    const from = out[out.length - 1]!;
    if (dist(from, p) < 1e-9 || segmentInside(area, from, p)) {
      out.push(p);
      continue;
    }
    const way = travelPath(area, from, p);
    if (way.jump) jumpAt.push(out.length);
    else out.push(...way.points);
    out.push(p);
  }
  return { points: out, jumpAt };
}

/**
 * Greedy: nearest unvisited section by distance. The travel path runs INSIDE the
 * shape (`insideTravel`) so the later top stitches cover it — there is no jump
 * inside a fill.
 */
export function fillRegion(
  poly: Polygon,
  params: FillParams,
  startPoint?: Point,
  endPoint?: Point,
  travelPoly?: Polygon,
): StitchPath {
  const rotate = rotator(-params.angleDeg);
  const unrotate = rotator(params.angleDeg);
  const rotated = applyToPolygon(rotate, poly);
  // Travelling happens in the area the whole object covers, not only in the
  // piece this phase stitches — the underlay sits inset, and the way from one
  // inset piece to the next runs through the shape around it (spec §8.7).
  const travelRot = travelPoly ? applyToPolygon(rotate, travelPoly) : travelArea(rotated);

  const rows = scanlines(rotated, params.rowSpacingMm);
  if (rows.length === 0) return { points: [], jumpAt: [] };
  const all = sections(rows);
  if (all.length === 0) return { points: [], jumpAt: [] };

  const b = polygonBbox(rotated);
  let cursor: Point = startPoint ? rotate(startPoint) : { x: b.minX, y: b.maxY };

  const open = new Set(all.map((_, i) => i));
  const out: Point[] = [];
  const jumpAt: number[] = [];
  while (open.size > 0) {
    // Nearest first — but a section behind a narrow waist is only near as the
    // crow flies. Taking it means walking there and back through the waist, and
    // every one of those ways lies on top of the last: measured on STUTTGART
    // 80 mm, 33 stitches in one square millimetre from a single fill. So the
    // nearest few are checked, and one that is straight ahead wins over one
    // that needs a detour (spec §8.5, 21.09.2026).
    const candidates: { index: number; entry: Entry; d: number }[] = [];
    for (const i of open) {
      for (const e of entries(all[i]!))
        candidates.push({ index: i, entry: e, d: dist(cursor, e.point) });
    }
    candidates.sort((a, b) => a.d - b.d);
    const reachable = candidates
      .slice(0, NEAREST_CHECKED)
      .find((c) => segmentInside(travelRot, cursor, c.entry.point));
    const chosen = reachable ?? candidates[0];
    const bestIndex = chosen ? chosen.index : -1;
    const bestEntry = chosen?.entry;
    if (bestIndex === -1 || !bestEntry) break;
    open.delete(bestIndex);

    if (out.length > 0) {
      const way = travelPath(travelRot, cursor, bestEntry.point);
      if (way.jump) jumpAt.push(out.length);
      else for (const p of way.points) out.push(p);
    }

    for (const p of sectionStitches(all[bestIndex]!, params, bestEntry)) out.push(p);
    cursor = out[out.length - 1] ?? cursor;
  }

  if (endPoint) {
    const target = rotate(endPoint);
    const way = travelPath(travelRot, cursor, target);
    if (way.jump) jumpAt.push(out.length);
    else for (const p of way.points) out.push(p);
    out.push(target);
  }

  // The rows are inside by construction, the moves between them are not — the
  // guard replaces those. It carries the jumps found above through, because
  // inserting a way shifts every index behind it (§8.7).
  const guarded = keepInside(travelRot, out, jumpAt);
  return { points: guarded.points.map(unrotate), jumpAt: guarded.jumpAt };
}

// ---------------------------------------------------------------------------
// Underlay (spec §8.6)
// ---------------------------------------------------------------------------

/** Contour underlay: running stitch on the inward-offset outline. */
/** Rotate a ring so it starts at the point nearest `from` (spec §8.7). */
export function rotateRingTo(ring: Polyline, from: Point): Polyline {
  if (ring.length < 2) return ring.map((p) => ({ ...p }));
  let best = 0;
  let bestD = Infinity;
  for (const [i, p] of ring.entries()) {
    const d = dist(from, p);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return [...ring.slice(best), ...ring.slice(0, best)].map((p) => ({ ...p }));
}

/**
 * Contour underlay: running stitch on the inward-offset outline.
 *
 * A shape with holes has several rings, and the way from one to the next is a
 * travel path inside the shape — not a single stitch across it (spec §8.7).
 */
export function contourUnderlay(
  poly: Polygon,
  insetMm: number,
  stitchLengthMm = 2.5,
  from?: Point,
  travelPoly?: Polygon,
): StitchPath {
  const inner = offset(poly, -Math.abs(insetMm));
  const area = travelPoly ?? travelArea(poly);
  const out: Point[] = [];
  const jumpAt: number[] = [];
  let cursor = from;
  for (const part of inner) {
    for (const ring of rings(part)) {
      const started = cursor ? rotateRingTo(ring, cursor) : ring;
      const pts = runningStitches(closeRing(started), { stitchLengthMm });
      if (pts.length === 0) continue;
      if (cursor !== undefined && out.length > 0) {
        const way = travelPath(area, cursor, pts[0]!);
        if (way.jump) jumpAt.push(out.length);
        else out.push(...way.points);
      }
      out.push(...pts);
      cursor = pts[pts.length - 1]!;
    }
  }
  return { points: out, jumpAt };
}

/**
 * Way from a to b inside the shape, as running stitches, WITHOUT the start and
 * end point — the cursor sits on one, the caller sets the other (spec §8.5,
 * §8.7).
 *
 * `insideTravel` answers with the straight line when it finds no way inside —
 * because a or b lie outside, or the area falls into parts. Stitching that line
 * drags the thread across bare fabric; measured on the Atzensport logo, 20 mm of
 * it. So the way is checked, and when it does not hold, the move becomes a jump
 * (spec §8.7, 21.09.2026).
 */
export function travelPath(poly: Polygon, a: Point, b: Point): TravelPath {
  const path = insideTravel(poly, a, b);
  if (!pathInside(poly, path)) return { points: [], jump: true };
  // The way follows the outline, and the outline has a bend every tenth of a
  // millimetre. Stitching each one puts hundreds of needle holes into the same
  // spot — measured on STUTTGART 80 mm: the density peak went from 24 to 43.
  // Resampling by length alone is no good either: it drops a bend, and the
  // chord across it leaves the shape, which is what this function prevents.
  // So: reach as far along the way as a stitch may go AND the chord still lies
  // inside, then divide that stretch.
  const out: Point[] = [];
  let i = 0;
  while (i < path.length - 1) {
    let j = i + 1;
    while (
      j + 1 < path.length &&
      dist(path[i]!, path[j + 1]!) <= TRAVEL_STITCH_MM &&
      segmentInside(poly, path[i]!, path[j + 1]!)
    ) {
      j++;
    }
    out.push(...bridge(path[i]!, path[j]!, TRAVEL_STITCH_MM));
    if (j < path.length - 1) out.push({ ...path[j]! });
    i = j;
  }
  return { points: out, jump: false };
}

/** `travelPath` on the shape itself, with the hair of air around it (§8.7). */
export function travelStitches(poly: Polygon, a: Point, b: Point): TravelPath {
  return travelPath(travelArea(poly), a, b);
}

/** Longest bounding-box edge — decides single versus double underlay (spec §8.6). */
export function longestEdgeMm(poly: Polygon): number {
  const b = polygonBbox(poly);
  return Math.max(b.maxX - b.minX, b.maxY - b.minY);
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

export type FillResult = {
  stitches: Point[];
  /** Indices in `stitches` the needle reaches by a jump, not a stitch (§8.7). */
  jumpAt: number[];
  warnings: Warning[];
};

/**
 * Drop points that repeat the one before, and carry the jump marks along —
 * removing a point shifts every index behind it.
 */
function dedupeMarked(points: Point[], jumpAt: number[], eps: number): StitchPath {
  const marked = new Set(jumpAt);
  const out: Point[] = [];
  const marks: number[] = [];
  for (const [i, p] of points.entries()) {
    const last = out[out.length - 1];
    // A jump target is kept even when it repeats: the jump is the information.
    if (last !== undefined && dist(last, p) <= eps && !marked.has(i)) continue;
    if (marked.has(i)) marks.push(out.length);
    out.push(p);
  }
  return { points: out, jumpAt: marks };
}

export function generateFill(obj: FillObject): FillResult {
  const warnings: Warning[] = [];
  const area = polygonArea(obj.shape);
  if (area < FILL_TINY_MM2) {
    warnings.push(
      warn(
        WARNING.FILL_TINY,
        `Area is only ${area.toFixed(1)} mm² — use satin or a running stitch.`,
        "warn",
        obj.id,
      ),
    );
  }

  if (area >= FILL_TINY_MM2) {
    // Measured on the shape as it is stitched, so the angle counts.
    const rotated = applyToPolygon(rotator(-obj.angleDeg), obj.shape);
    const { pieces, share } = narrowRowShare(scanlines(rotated, obj.rowSpacingMm));
    if (pieces >= NARROW_MIN_ROWS && share > NARROW_SHARE) {
      warnings.push(
        warn(
          WARNING.FILL_TOO_NARROW,
          `${(share * 100).toFixed(0)} % of the rows are shorter than ${SHORT_ROW_MM} mm — ` +
            `${area.toFixed(1)} mm² but everywhere too narrow. Use satin or a running stitch.`,
          "warn",
          obj.id,
        ),
      );
    }
  }

  // Pull acts along the thread direction, push across it (spec §8.1.1), and the
  // underlap goes outwards on top of that (spec §8.1.2).
  let compensated = offsetDirectional(obj.shape, obj.pullCompMm, obj.pushCompMm, obj.angleDeg);
  if (compensated.length === 0) {
    // A sliver narrower than twice the push compensation disappears under it.
    // Stitching it without compensation is better than not stitching it at all
    // — but it is said out loud, not done quietly (rule 8).
    warnings.push(
      warn(
        WARNING.INVALID_GEOMETRY,
        `The compensation of ${obj.pushCompMm} mm makes this area vanish — stitched without it.`,
        "warn",
        obj.id,
      ),
    );
    compensated = [obj.shape];
  }
  const parts =
    obj.underlapMm === 0
      ? compensated
      : compensated.flatMap((part) => offset(part, obj.underlapMm));
  if (parts.length === 0) {
    warnings.push(
      warn(WARNING.INVALID_GEOMETRY, "The underlap makes the area vanish.", "error", obj.id),
    );
    return { stitches: [], jumpAt: [], warnings };
  }

  const topParams: FillParams = {
    angleDeg: obj.angleDeg,
    rowSpacingMm: obj.rowSpacingMm,
    stitchLengthMm: obj.stitchLengthMm,
    staggerRows: obj.staggerRows,
  };

  const stitches: Point[] = [];
  const jumps: number[] = [];
  let outside = 0;
  let longestOutsideMm = 0;
  const cursor = (): Point | undefined => stitches[stitches.length - 1];

  // ONE travel area per part, built once after the knockdown cut the shape and
  // the compensation widened it (spec §8.7, 21.09.2026). Every phase of this
  // part travels in it — before, the underlay travelled in its own inset piece
  // and the way between two pieces left the shape.
  const areas = parts.map(travelArea);

  /**
   * Append one phase. Between two phases the needle travels INSIDE the shape
   * (spec §8.7); where no way inside exists, it jumps and the object says so.
   */
  const phase = (path: StitchPath, within: Polygon): void => {
    if (path.points.length === 0) return;
    const from = cursor();
    if (from !== undefined) {
      const way = travelPath(within, from, path.points[0]!);
      if (way.jump) {
        jumps.push(stitches.length);
        outside += 1;
        longestOutsideMm = Math.max(longestOutsideMm, dist(from, path.points[0]!));
      } else stitches.push(...way.points);
    }
    const base = stitches.length;
    for (const i of path.jumpAt) {
      jumps.push(base + i);
      outside += 1;
      const to = path.points[i]!;
      const previous = i > 0 ? path.points[i - 1]! : from;
      if (previous) longestOutsideMm = Math.max(longestOutsideMm, dist(previous, to));
    }
    stitches.push(...path.points);
  };

  for (const part of nearestFirst(parts, undefined)) {
    const area = areas[parts.indexOf(part)]!;
    if (obj.underlay.contour) {
      phase(contourUnderlay(part, obj.underlay.insetMm, 2.5, cursor(), area), area);
    }
    if (obj.underlay.fill !== "none") {
      const inner = offset(part, -Math.abs(obj.underlay.insetMm));
      const angles =
        obj.underlay.fill === "double"
          ? [obj.angleDeg - 45, obj.angleDeg + 45]
          : [obj.angleDeg + 90];
      for (const angleDeg of angles) {
        // The inset can break the piece into several, and clipper hands them
        // over in its own order. Walking them in that order means crossing the
        // shape again for every one of them, and each crossing lies on top of
        // the last: measured on STUTTGART 80 mm, 33 stitches in one square
        // millimetre. Nearest first (spec §8.5, 21.09.2026).
        for (const i of nearestFirst(inner, cursor())) {
          phase(
            fillRegion(
              i,
              {
                angleDeg,
                rowSpacingMm: obj.underlay.spacingMm,
                stitchLengthMm: 3.0,
                staggerRows: obj.staggerRows,
              },
              cursor(),
              undefined,
              area,
            ),
            area,
          );
        }
      }
    }
    // The top stitching starts where the user asked, or else where the needle
    // already stands.
    phase(fillRegion(part, topParams, obj.startPoint ?? cursor(), obj.endPoint, area), area);
  }

  if (outside > 0) {
    warnings.push(
      warn(
        WARNING.TRAVEL_OUTSIDE,
        `${outside} way${outside === 1 ? "" : "s"} inside the shape could not be found — ` +
          `jumped instead of stitching across, longest ${longestOutsideMm.toFixed(1)} mm.`,
        "warn",
        obj.id,
      ),
    );
  }

  const clean = dedupeMarked(stitches, jumps, 1e-6);
  return { stitches: clean.points, jumpAt: clean.jumpAt, warnings };
}
