/**
 * Knockdown: cut covered areas out of the fills below them (spec §4.1).
 *
 * Print artwork puts the background down as a solid area and paints the motif on
 * top. Printed, the upper colour hides the lower one; stitched, both are sewn
 * and the spot gets double coverage — on the four test logos that was the reason
 * `DENSITY_HIGH` came out as an error, with two areas overlapping by 86 %.
 *
 * The stage runs AFTER `order()`, because only then is it settled what lies on
 * top, and BEFORE `generate()`, so the cache sees the changed geometry.
 */
import type { Point, Polygon, Polyline } from "@texma-stitch/geometry";
import {
  bbox,
  difference,
  intersect,
  offset,
  polygonArea,
  rings,
  union,
} from "@texma-stitch/geometry";
import { coverPolygon } from "./object.js";
import type { FillObject, SatinObject, StitchObject, Warning } from "./types.js";
import { warn, WARNING } from "./warnings.js";

/** Below this covered area, cutting costs more than the double stitch (spec §4.1). */
export const KNOCKDOWN_MIN_MM2 = 20;
/** How far the lower area stays under the upper one (spec §4.1). */
export const KNOCKDOWN_UNDERLAP_MM = 0.8;
/** Below this, a fill edge and its neighbour are close enough to open a gap (spec §8.1.3). */
export const EDGE_GAP_MM = 0.3;
/** Areas under this count as nothing (mm²). */
const AREA_EPS_MM2 = 1e-6;

const isFill = (o: StitchObject): o is FillObject => o.type === "fill";

const boxesNear = (a: Polyline, b: Polyline, gap: number): boolean => {
  const ba = bbox(a);
  const bb = bbox(b);
  return (
    ba.minX - gap <= bb.maxX &&
    bb.minX - gap <= ba.maxX &&
    ba.minY - gap <= bb.maxY &&
    bb.minY - gap <= ba.maxY
  );
};

const totalArea = (parts: Polygon[]): number => parts.reduce((s, p) => s + polygonArea(p), 0);

type Work = { obj: StitchObject; parts: Polygon[] };

export type ResolveResult = { objects: StitchObject[]; warnings: Warning[] };

/**
 * Cut the fills, one pair at a time.
 *
 * Worked from the top down: by the time an object is used as a cutter it has
 * itself been cut by everything above it, so what cuts is what actually covers.
 */
export function resolveOverlaps(objects: StitchObject[]): ResolveResult {
  const warnings: Warning[] = [];
  const work: Work[] = objects.map((obj) => ({
    obj,
    parts: isFill(obj) ? [obj.shape] : [],
  }));

  for (let upper = work.length - 1; upper >= 1; upper--) {
    const u = work[upper]!;
    if (!isFill(u.obj) || u.obj.cutsBelow === "never" || u.parts.length === 0) continue;
    const always = u.obj.cutsBelow === "always";

    for (let lower = 0; lower < upper; lower++) {
      const l = work[lower]!;
      if (!isFill(l.obj) || l.parts.length === 0) continue;

      for (const up of u.parts) {
        if (l.parts.length === 0) break;
        if (!l.parts.some((lp) => boxesNear(lp.outer, up.outer, KNOCKDOWN_UNDERLAP_MM))) continue;

        const covered = totalArea(intersect(l.parts, [up]));
        if (covered >= KNOCKDOWN_MIN_MM2 || (always && covered > AREA_EPS_MM2)) {
          // Cut, but not flush: the upper shape is shrunk first, so the lower
          // one keeps running 0,8 mm underneath it (spec §4.1 rule 4).
          const keepUnder = offset(up, -KNOCKDOWN_UNDERLAP_MM);
          l.parts = keepUnder.length === 0 ? l.parts : difference(l.parts, keepUnder);
        } else {
          // Touching without covering: grow the earlier area under the later one
          // (spec §4.1 rule 5). Only into the upper shape, nowhere else.
          const reach = l.parts.flatMap((lp) => offset(lp, KNOCKDOWN_UNDERLAP_MM));
          const ext = intersect(reach, [up]);
          if (totalArea(ext) > AREA_EPS_MM2) l.parts = union([...l.parts, ...ext]);
        }
      }
    }
  }

  const out: StitchObject[] = [];
  for (const w of work) {
    const obj = w.obj;
    if (!isFill(obj)) {
      out.push(obj);
      continue;
    }
    if (w.parts.length === 0) {
      warnings.push(
        warn(
          WARNING.FILL_COVERED,
          "Covered completely by later areas — nothing left to stitch.",
          "info",
          obj.id,
        ),
      );
      continue;
    }
    if (w.parts.length === 1) {
      out.push({ ...obj, shape: w.parts[0]! });
      continue;
    }
    warnings.push(
      warn(
        WARNING.SHAPE_SPLIT,
        `The cut leaves ${w.parts.length} separate areas — every one of them is stitched.`,
        "warn",
        obj.id,
      ),
    );
    w.parts.forEach((shape, i) => out.push({ ...obj, id: `${obj.id}#${i}`, shape }));
  }

  return { objects: out, warnings };
}

// ---------------------------------------------------------------------------
// Edge gap risk (spec §8.1.3)
// ---------------------------------------------------------------------------

/** Shortest distance from a point to a segment. */
function pointToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 < 1e-12) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

/** Shortest distance between a polyline and the rings of a polygon. */
function lineToPolygon(line: Polyline, poly: Polygon): number {
  let best = Infinity;
  for (const ring of rings(poly)) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!;
      const b = ring[(i + 1) % ring.length]!;
      for (const p of line) best = Math.min(best, pointToSegment(p, a, b));
      for (const q of [a, b]) {
        for (let j = 0; j + 1 < line.length; j++) {
          best = Math.min(best, pointToSegment(q, line[j]!, line[j + 1]!));
        }
      }
    }
  }
  return best;
}

/** The outlines a neighbour offers for the distance test. */
function outlinesOf(obj: StitchObject): Polyline[] {
  if (obj.type === "satin") {
    const s = obj as SatinObject;
    return [s.railA, s.railB].filter((r) => r.length > 0);
  }
  if (obj.type === "fill") return rings((obj as FillObject).shape);
  return [];
}

/**
 * Fill edge and neighbour close together, but not overlapping (spec §8.1.3).
 *
 * After `resolveOverlaps` this only fires where the knockdown was refused: in
 * every other case §4.1 has set the underlap itself, and the warning would point
 * at something the engine has already done. A satin never cuts, so it is always
 * a candidate. Nothing is changed here (rule 8).
 */
export function edgeGapRisks(objects: StitchObject[]): Warning[] {
  const fills = objects.filter(isFill);
  if (fills.length === 0) return [];

  const out: Warning[] = [];
  for (const f of fills) {
    const effective = f.underlapMm > 0 ? offset(f.shape, f.underlapMm) : [f.shape];
    for (const n of objects) {
      if (n === f) continue;
      if (n.type !== "satin" && !(isFill(n) && n.cutsBelow === "never")) continue;

      const lines = outlinesOf(n);
      if (lines.length === 0) continue;
      const points = lines.flat();
      if (!effective.some((part) => boxesNear(part.outer, points, EDGE_GAP_MM))) continue;

      const gap = Math.min(
        ...effective.flatMap((part) => lines.map((line) => lineToPolygon(line, part))),
      );
      if (gap >= EDGE_GAP_MM) continue;

      const cover = coverPolygon(n);
      const shared = cover ? totalArea(intersect(effective, [cover])) : 0;
      if (shared > AREA_EPS_MM2) continue;

      out.push(
        warn(
          WARNING.EDGE_GAP_RISK,
          `Edge of "${f.id}" and "${n.id}" are ${gap.toFixed(2)} mm apart without ` +
            `overlapping — the fabric pull will open a gap.`,
          "warn",
          f.id,
        ),
      );
    }
  }
  return out;
}
