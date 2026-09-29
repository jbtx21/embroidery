/**
 * Pull compensation per rail (spec §7.8.3, "Zugausgleich lässt Stofflücken offen").
 *
 * The pull compensation of §7.2 widens a satin column on both sides. Between two
 * forms that eats the strip of fabric that is meant to stay open: on the
 * Hofbräu cap the red letter (2.4 mm, 0.29 mm each side) and its gold shadow line
 * (0.75 mm, 0.2 mm) leave 0.53 mm of fabric between them — 0.04 mm remained once
 * both were compensated, and the professional cap shows fabric there. So, with
 * Ink/Stitch's compensation per rail (`pull_compensation_mm="a b"`, `a` for the
 * first rail of the path, `b` for the second):
 *
 * 1. A rail at a **fabric gap under 1.0 mm** gets none. The gap is what lies between
 *    the rail and the next other form — of any colour, but not of the column's own
 *    shape — when only fabric does. Measured along the rungs, outwards, the median
 *    over the column. The limit is 0.2 mm over the gap limit of §5.2, so that two
 *    columns with compensation cannot press a gap of 1.0 mm below 0.5 mm.
 * 2. A **column under 1.0 mm** (`SATIN_NARROW_WARN_MM`) gets none at all: a thin
 *    ornamental or shadow line is stitched as narrow as it is drawn.
 *
 * What is no gap: a form that touches or overlaps (there is no fabric to keep open),
 * and a gap under `FABRIC_GAP_MIN_MM` — hairline seams between traced shapes are
 * closed by the thread, and 0.1 mm is the resolution of the DST (§5.2 rule 3; the
 * spec names no lower limit for this rule, that one is taken from there).
 */
import type { EdgeIndex, Point, Polygon, Rect } from "@texma-stitch/geometry";
import { buildEdgeIndex, polygonBbox } from "@texma-stitch/geometry";
import type { Preset } from "../presets.js";
import { SATIN_NARROW_WARN_MM } from "./classify.js";
import type { SatinColumnPlan } from "./columns.js";
import { SATIN_RUNG_OVERSHOOT_MM } from "./columns.js";

/** A fabric gap under this keeps its rail uncompensated (spec §7.8.3 rule 1). */
export const FABRIC_GAP_MAX_MM = 1.0;
/** A gap under this is no gap: a hairline seam, under the resolution of the DST (spec §5.2 rule 3). */
export const FABRIC_GAP_MIN_MM = 0.1;
/**
 * How far past the gap limit the ray looks: a rail that lies a little inside its shape
 * has that much of the shape's own material to leave first.
 */
const REACH_SLACK_MM = 0.3;
/** Crossings this close to the start are the rail's own outline, not something met on the way. */
const START_EPS_MM = 0.01;

/** Pull compensation per side (spec §7.2): a share of the column's width, clamped. */
export function satinPullCompMm(widthMm: number, preset: Preset): number {
  const pct = (preset.pullCompPct / 100) * widthMm;
  return Math.min(preset.pullCompMaxMm, Math.max(preset.pullCompMinMm, pct));
}

/** A form of the design: the outline of a shape, by the id of the shape. */
export type Form = { shapeId: string; polygon: Polygon };

type Entry = { form: Form; box: Rect };
export type FormIndex = {
  forms: Entry[];
};

/** The forms of a design, for the queries below. */
export function formIndex(forms: Form[]): FormIndex {
  return { forms: forms.map((form) => ({ form, box: polygonBbox(form.polygon) })) };
}

/** Edge indexes are built when a query first needs one, and kept as long as the polygon lives. */
const indexes = new WeakMap<Polygon, EdgeIndex>();
const edgesOf = (poly: Polygon): EdgeIndex => {
  let index = indexes.get(poly);
  if (!index) {
    index = buildEdgeIndex(poly);
    indexes.set(poly, index);
  }
  return index;
};

/** Where the ray p + t·u crosses an edge, or undefined (parallel, or off the edge; half-open at its end). */
function rayEdge(p: Point, u: Point, a: Point, b: Point): number | undefined {
  const ex = b.x - a.x;
  const ey = b.y - a.y;
  const denom = u.x * ey - u.y * ex;
  if (Math.abs(denom) < 1e-12) return undefined;
  const apx = a.x - p.x;
  const apy = a.y - p.y;
  const s = (apx * u.y - apy * u.x) / denom;
  if (s < 0 || s >= 1) return undefined;
  return (apx * ey - apy * ex) / denom;
}

/** The crossings of the ray with the edges of one polygon, beyond the start and up to `reach`, ascending. */
function crossings(p: Point, u: Point, reach: number, index: EdgeIndex): number[] {
  const q = { x: p.x + u.x * reach, y: p.y + u.y * reach };
  const ts: number[] = [];
  for (const i of index.near(p, q)) {
    const e = index.edges[i]!;
    const t = rayEdge(p, u, e.a, e.b);
    if (t !== undefined && t > START_EPS_MM && t <= reach) ts.push(t);
  }
  return ts.sort((x, y) => x - y);
}

const boxHitsRay = (box: Rect, p: Point, u: Point, reach: number): boolean => {
  const qx = p.x + u.x * reach;
  const qy = p.y + u.y * reach;
  return !(
    Math.max(p.x, qx) < box.minX ||
    Math.min(p.x, qx) > box.maxX ||
    Math.max(p.y, qy) < box.minY ||
    Math.min(p.y, qy) > box.maxY
  );
};

/**
 * The fabric between the point `p` on a rail and the next other form, looking along
 * the unit vector `u`, which points away from the column. `own` is the column's own
 * shape: its forms are no neighbours, and its material in the way ends the look —
 * what lies behind is not reached over fabric.
 *
 * `0`: another form touches or overlaps there, or the gap is under `FABRIC_GAP_MIN_MM` —
 * no fabric to keep open. `Infinity`: none within `FABRIC_GAP_MAX_MM`. Otherwise the gap in mm.
 */
export function gapAlong(p: Point, u: Point, forms: FormIndex, own?: Form): number {
  const reach = FABRIC_GAP_MAX_MM + REACH_SLACK_MM;
  const start = { x: p.x + u.x * START_EPS_MM, y: p.y + u.y * START_EPS_MM };

  // The column's own shape: where its material ends (the rail may lie a little inside it)
  // and where it would begin again.
  let leaves = 0;
  let returns = Infinity;
  if (own) {
    const ownIndex = edgesOf(own.polygon);
    const ts = crossings(p, u, reach, ownIndex);
    if (ownIndex.contains(start)) {
      if (ts.length === 0) return Infinity; // inside the shape as far as the eye reaches
      leaves = ts[0]!;
      returns = ts[1] ?? Infinity;
    } else {
      returns = ts[0] ?? Infinity;
    }
  }

  let meets = Infinity;
  for (const e of forms.forms) {
    if (own && e.form.shapeId === own.shapeId) continue;
    if (!boxHitsRay(e.box, p, u, reach)) continue;
    const index = edgesOf(e.form.polygon);
    if (index.contains(start)) return 0; // lies inside another form: touching, overlapping
    const first = crossings(p, u, reach, index)[0];
    if (first !== undefined && first < meets) meets = first;
  }
  if (meets === Infinity || meets > returns) return Infinity;
  const gap = meets - leaves;
  if (gap < FABRIC_GAP_MIN_MM) return 0;
  return gap >= FABRIC_GAP_MAX_MM ? Infinity : gap;
}

/** A gap in the sense of the rule: fabric between the rail and another form, under the limit, over the hairline. */
export const isFabricGap = (gapMm: number): boolean =>
  gapMm >= FABRIC_GAP_MIN_MM && gapMm < FABRIC_GAP_MAX_MM;

export type RailPull = {
  /** The compensation per rail, mm: rail A, rail B (`pull_compensation_mm="a b"`). */
  pull: [number, number];
  /** The median gap per rail, mm (`0` touching, `Infinity` none within the limit). */
  gapMm: [number, number];
  /** The column is under `SATIN_NARROW_WARN_MM`: none at all (rule 2). */
  narrow: boolean;
};

/** The middle of the sorted values, the lower one of two. */
const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[(sorted.length - 1) >> 1] ?? Infinity;
};

/**
 * The pull compensation of a column per rail (module doc). `own` is the shape the column
 * belongs to, `forms` all forms of the design. A column without rungs has nothing to
 * measure along and keeps its compensation.
 */
export function railPull(
  column: SatinColumnPlan,
  own: Form | undefined,
  forms: FormIndex,
  preset: Preset,
): RailPull {
  const full = satinPullCompMm(column.widthMm, preset);
  if (column.widthMm < SATIN_NARROW_WARN_MM) {
    return { pull: [0, 0], gapMm: [Infinity, Infinity], narrow: true };
  }
  const gapsA: number[] = [];
  const gapsB: number[] = [];
  for (const [ra, rb] of column.rungs) {
    const along = Math.hypot(rb.x - ra.x, rb.y - ra.y);
    if (along < 1e-9) continue;
    const d = { x: (rb.x - ra.x) / along, y: (rb.y - ra.y) / along };
    // The rungs reach a little past the rails; the rails are where the fabric begins.
    const a = { x: ra.x + d.x * SATIN_RUNG_OVERSHOOT_MM, y: ra.y + d.y * SATIN_RUNG_OVERSHOOT_MM };
    const b = { x: rb.x - d.x * SATIN_RUNG_OVERSHOOT_MM, y: rb.y - d.y * SATIN_RUNG_OVERSHOOT_MM };
    gapsA.push(gapAlong(a, { x: -d.x, y: -d.y }, forms, own));
    gapsB.push(gapAlong(b, d, forms, own));
  }
  const gapMm: [number, number] = [median(gapsA), median(gapsB)];
  return {
    pull: [isFabricGap(gapMm[0]) ? 0 : full, isFabricGap(gapMm[1]) ? 0 : full],
    gapMm,
    narrow: false,
  };
}
