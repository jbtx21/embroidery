/**
 * Check, repair or flag the geometry (spec §4, first stage).
 *
 * Repair here means exactly what spec §5 allows: resolve self-intersections via
 * a Clipper union and normalise the winding. Anything that cannot be repaired is
 * flagged rather than guessed at (CLAUDE.md, rule 8) — in particular nothing is
 * silently dropped: a shape that normalises into several areas becomes several
 * fill objects, not "the largest one".
 */
import type { Point, Polygon, Polyline } from "@texma-stitch/geometry";
import {
  bbox,
  dedupe,
  intersect,
  normalizePolygon,
  offset,
  polygonArea,
  rings,
} from "@texma-stitch/geometry";
import { coverPolygon } from "./object.js";
import type { Design, FillObject, SatinObject, StitchObject, Warning } from "./types.js";
import { warn, WARNING } from "./warnings.js";

/** Below this, a rail and a fill edge are close enough to open a gap (spec §8.1.3). */
export const EDGE_GAP_MM = 0.3;
/** Overlap smaller than this counts as none (mm²). */
const OVERLAP_EPS_MM2 = 1e-6;

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

/**
 * Fill edge and satin rail close together, but not overlapping (spec §8.1.3).
 *
 * The engine cannot know which outline belongs to which area, but it can see
 * when the two sit on top of each other's edge without sharing any material —
 * that is exactly where the fabric pull tears a gap open. Nothing is changed;
 * the overlap is the user's call (rule 8).
 */
export function edgeGapRisks(objects: StitchObject[]): Warning[] {
  const fills = objects.filter((o): o is FillObject => o.type === "fill");
  const satins = objects.filter((o): o is SatinObject => o.type === "satin");
  if (fills.length === 0 || satins.length === 0) return [];

  const out: Warning[] = [];
  for (const f of fills) {
    // The effective area is the one that gets stitched, underlap included.
    const effective = f.underlapMm > 0 ? offset(f.shape, f.underlapMm) : [f.shape];
    for (const s of satins) {
      const railPoints = [...s.railA, ...s.railB];
      if (railPoints.length === 0) continue;
      if (!effective.some((part) => boxesNear(part.outer, railPoints, EDGE_GAP_MM))) continue;

      const gap = Math.min(
        ...effective.flatMap((part) => [
          lineToPolygon(s.railA, part),
          lineToPolygon(s.railB, part),
        ]),
      );
      if (gap >= EDGE_GAP_MM) continue;

      const cover = coverPolygon(s);
      const shared = cover
        ? effective.reduce(
            (sum, part) => sum + intersect([part], [cover]).reduce((a, p) => a + polygonArea(p), 0),
            0,
          )
        : 0;
      if (shared > OVERLAP_EPS_MM2) continue;

      out.push(
        warn(
          WARNING.EDGE_GAP_RISK,
          `Edge of "${f.id}" and rail of "${s.id}" are ${gap.toFixed(2)} mm apart without ` +
            `overlapping — the fabric pull will open a gap. Give the fill an underlap.`,
          "warn",
          f.id,
        ),
      );
    }
  }
  return out;
}

/** Does the polyline cross itself? Non-adjacent segments, proper crossing. */
export function selfIntersects(line: Polyline): boolean {
  const eps = 1e-9;
  const first = line[0];
  const last = line[line.length - 1];
  // Only for a GENUINELY closed polyline may the first and last segment touch —
  // otherwise that touch is exactly the self-intersection we are looking for.
  const closed =
    line.length > 2 &&
    first !== undefined &&
    last !== undefined &&
    Math.hypot(last.x - first.x, last.y - first.y) < 1e-9;

  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i]!;
    const b = line[i + 1]!;
    for (let j = i + 2; j + 1 < line.length; j++) {
      if (closed && i === 0 && j + 2 === line.length) continue;
      const c = line[j]!;
      const d = line[j + 1]!;
      const r = { x: b.x - a.x, y: b.y - a.y };
      const s = { x: d.x - c.x, y: d.y - c.y };
      const denom = r.x * s.y - r.y * s.x;
      if (Math.abs(denom) < eps) continue;
      const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / denom;
      const u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / denom;
      if (t > eps && t < 1 - eps && u > eps && u < 1 - eps) return true;
    }
  }
  return false;
}

export type ValidateResult = { objects: StitchObject[]; warnings: Warning[] };

export function validate(design: Design): ValidateResult {
  const warnings: Warning[] = [];
  const objects: StitchObject[] = [];

  for (const obj of design.objects) {
    if (!obj.visible) continue;

    if (obj.threadIndex < 0 || obj.threadIndex >= design.threads.length) {
      warnings.push(
        warn(
          WARNING.THREAD_MISSING,
          `Thread ${obj.threadIndex} is not declared in the design.`,
          "error",
          obj.id,
        ),
      );
      continue;
    }

    switch (obj.type) {
      case "fill": {
        const parts = normalizePolygon(obj.shape);
        if (parts.length === 0) {
          warnings.push(
            warn(WARNING.INVALID_GEOMETRY, "Area is empty or degenerate.", "error", obj.id),
          );
          continue;
        }
        if (parts.length === 1) {
          objects.push({ ...obj, shape: parts[0]! });
          break;
        }
        // Several areas: stitch all of them. Picking one would be a guess, and
        // dropping the rest would lose the user's geometry (spec §11,
        // SHAPE_SPLIT — the piece count belongs in the message).
        warnings.push(
          warn(
            WARNING.SHAPE_SPLIT,
            `Area falls into ${parts.length} pieces; each one is stitched separately.`,
            "warn",
            obj.id,
          ),
        );
        parts.forEach((shape, i) => {
          objects.push({ ...obj, id: `${obj.id}#${i}`, shape });
        });
        break;
      }
      case "satin": {
        const railA = dedupe(obj.railA, 1e-6);
        const railB = dedupe(obj.railB, 1e-6);
        if (railA.length < 2 || railB.length < 2) {
          warnings.push(warn(WARNING.EMPTY_OBJECT, "Satin needs two rails.", "error", obj.id));
          continue;
        }
        if (selfIntersects(railA) || selfIntersects(railB)) {
          warnings.push(
            warn(
              WARNING.SELF_INTERSECTING_RAILS,
              "A rail crosses itself — add rungs or split the path.",
              "warn",
              obj.id,
            ),
          );
        }
        objects.push({ ...obj, railA, railB });
        break;
      }
      case "running": {
        const path = dedupe(obj.path, 1e-6);
        if (path.length < 2) {
          warnings.push(
            warn(WARNING.EMPTY_OBJECT, "Running stitch without a path.", "error", obj.id),
          );
          continue;
        }
        objects.push({ ...obj, path });
        break;
      }
      case "text": {
        if (obj.text.trim().length === 0) {
          warnings.push(warn(WARNING.EMPTY_OBJECT, "Text is empty.", "warn", obj.id));
          continue;
        }
        objects.push(obj);
        break;
      }
    }
  }

  warnings.push(...edgeGapRisks(objects));
  return { objects, warnings };
}
