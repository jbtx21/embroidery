/**
 * Check, repair or flag the geometry (spec §4, first stage).
 *
 * Repair here means exactly what spec §5 allows: resolve self-intersections via
 * a Clipper union and normalise the winding. Anything that cannot be repaired is
 * flagged rather than guessed at (CLAUDE.md, rule 8) — in particular nothing is
 * silently dropped: a shape that normalises into several areas becomes several
 * fill objects, not "the largest one".
 */
import type { Polyline } from "@texma-stitch/geometry";
import { dedupe, normalizePolygon } from "@texma-stitch/geometry";
import type { Design, StitchObject, Warning } from "./types.js";
import { warn, WARNING } from "./warnings.js";

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
        // dropping the rest would lose the user's geometry.
        warnings.push(
          warn(
            WARNING.INVALID_GEOMETRY,
            `Area falls into ${parts.length} pieces; each one is stitched separately.`,
            "info",
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

  return { objects, warnings };
}
