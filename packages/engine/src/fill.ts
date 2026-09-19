/**
 * Fill stitch (spec §8).
 *
 * After rotating, the rows lie horizontally. The grid for rows AND stagger is
 * absolute (multiples of row spacing and stitch length measured from the
 * origin) — otherwise the stagger drifts with the start of each segment and the
 * stitch rows form visible lines (spec §8.4).
 */
import type { Point, Polygon } from "@texma-stitch/geometry";
import {
  applyToPolygon,
  clipHorizontal,
  closeRing,
  dedupe,
  dist,
  insideTravel,
  offset,
  polygonArea,
  polygonBbox,
  rings,
  rotator,
} from "@texma-stitch/geometry";
import type { FillObject, Warning } from "./types.js";
import { runningStitches } from "./running.js";
import { warn, WARNING } from "./warnings.js";

/** Stitch length of the travel paths inside the shape (spec §8.5). */
export const TRAVEL_STITCH_MM = 2.0;
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

/** Serpentine through the section — row by row, alternating direction. */
export function sectionStitches(section: Section, params: FillParams, entry: Entry): Point[] {
  const rows = entry.fromBottom ? section.segments : [...section.segments].reverse();
  const out: Point[] = [];
  let rightward = entry.rightward;
  for (const seg of rows) {
    out.push(...rowStitches(seg, params, rightward));
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
// Section order and travel paths (spec §8.5)
// ---------------------------------------------------------------------------

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
): Point[] {
  const rotate = rotator(-params.angleDeg);
  const unrotate = rotator(params.angleDeg);
  const rotated = applyToPolygon(rotate, poly);

  const rows = scanlines(rotated, params.rowSpacingMm);
  if (rows.length === 0) return [];
  const all = sections(rows);
  if (all.length === 0) return [];

  const b = polygonBbox(rotated);
  let cursor: Point = startPoint ? rotate(startPoint) : { x: b.minX, y: b.maxY };

  const open = new Set(all.map((_, i) => i));
  const out: Point[] = [];
  while (open.size > 0) {
    let bestIndex = -1;
    let bestEntry: Entry | undefined;
    let bestDistance = Infinity;
    for (const i of open) {
      for (const e of entries(all[i]!)) {
        const d = dist(cursor, e.point);
        if (d < bestDistance) {
          bestDistance = d;
          bestIndex = i;
          bestEntry = e;
        }
      }
    }
    if (bestIndex === -1 || !bestEntry) break;
    open.delete(bestIndex);

    if (out.length > 0) {
      const path = insideTravel(rotated, cursor, bestEntry.point);
      const stitched = runningStitches(path, { stitchLengthMm: TRAVEL_STITCH_MM });
      // Drop the first point — the cursor already sits there.
      for (let i = 1; i < stitched.length; i++) out.push(stitched[i]!);
    }

    for (const p of sectionStitches(all[bestIndex]!, params, bestEntry)) out.push(p);
    cursor = out[out.length - 1] ?? cursor;
  }

  if (endPoint) {
    const target = rotate(endPoint);
    const path = insideTravel(rotated, cursor, target);
    const stitched = runningStitches(path, { stitchLengthMm: TRAVEL_STITCH_MM });
    for (let i = 1; i < stitched.length; i++) out.push(stitched[i]!);
  }

  return out.map(unrotate);
}

// ---------------------------------------------------------------------------
// Underlay (spec §8.6)
// ---------------------------------------------------------------------------

/** Contour underlay: running stitch on the inward-offset outline. */
export function contourUnderlay(poly: Polygon, insetMm: number, stitchLengthMm = 2.5): Point[] {
  const inner = offset(poly, -Math.abs(insetMm));
  const out: Point[] = [];
  for (const part of inner) {
    for (const ring of rings(part)) {
      out.push(...runningStitches(closeRing(ring), { stitchLengthMm }));
    }
  }
  return out;
}

/** Longest bounding-box edge — decides single versus double underlay (spec §8.6). */
export function longestEdgeMm(poly: Polygon): number {
  const b = polygonBbox(poly);
  return Math.max(b.maxX - b.minX, b.maxY - b.minY);
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

export type FillResult = { stitches: Point[]; warnings: Warning[] };

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

  const parts = obj.pullCompMm === 0 ? [obj.shape] : offset(obj.shape, obj.pullCompMm);
  if (parts.length === 0) {
    warnings.push(
      warn(WARNING.INVALID_GEOMETRY, "Pull compensation makes the area vanish.", "error", obj.id),
    );
    return { stitches: [], warnings };
  }

  const topParams: FillParams = {
    angleDeg: obj.angleDeg,
    rowSpacingMm: obj.rowSpacingMm,
    stitchLengthMm: obj.stitchLengthMm,
    staggerRows: obj.staggerRows,
  };

  const stitches: Point[] = [];
  for (const part of parts) {
    if (obj.underlay.contour) {
      stitches.push(...contourUnderlay(part, obj.underlay.insetMm));
    }
    if (obj.underlay.fill !== "none") {
      const inner = offset(part, -Math.abs(obj.underlay.insetMm));
      const angles =
        obj.underlay.fill === "double"
          ? [obj.angleDeg - 45, obj.angleDeg + 45]
          : [obj.angleDeg + 90];
      for (const angleDeg of angles) {
        for (const i of inner) {
          stitches.push(
            ...fillRegion(i, {
              angleDeg,
              rowSpacingMm: obj.underlay.spacingMm,
              stitchLengthMm: 3.0,
              staggerRows: obj.staggerRows,
            }),
          );
        }
      }
    }
    stitches.push(...fillRegion(part, topParams, obj.startPoint, obj.endPoint));
  }

  return { stitches: dedupe(stitches, 1e-6), warnings };
}
