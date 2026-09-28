/**
 * Width classification for the Ink/Stitch template (`template.ts`).
 *
 * This is a SEPARATE set of thresholds from `auto-satin.ts` — that module
 * feeds our own satin generator (spec §7.7) and is frozen (28.09.2026
 * decision: Ink/Stitch generates the stitches now). This module decides what
 * a narrow imported shape should become BEFORE it reaches Ink/Stitch:
 * running stitch (too narrow for a column at all), satin columns
 * (`columns.ts`), or left as a tatami fill (too wide).
 *
 * 0.8 mm is the split between running and satin. "CYS SPORTS" (STUTTGART
 * logo) measures 0.89-1.22 mm stroke width and has to come out as ONE closed
 * satin column, not a gappy running stitch; the same word's thin serif
 * remnants measure 0.44-0.62 mm and are meant to stay running stitch.
 */
import type { Polygon } from "@texma-stitch/geometry";
import { AUTOSATIN_MAX_WIDTH_MM, medianShapeWidthMm, SINGLE_PASS_MAX_MM } from "../import/svg.js";
import type { Warning } from "../types.js";
import { warn, WARNING } from "../warnings.js";

/** Below this median width, a shape becomes a running stitch, not satin. */
export const SATIN_FROM_MM = 0.8;
/**
 * Below this satin width the column is still proposed as satin, but flagged
 * `SATIN_TOO_NARROW` (spec §7.4) — technically stitchable, tight in practice.
 */
export const SATIN_NARROW_WARN_MM = 1.0;

export type ShapeClass = "running" | "satin" | "tatami";

export type ClassifyResult = {
  shapeClass: ShapeClass;
  /** Median width over the shape's medial axis spine, in mm. */
  widthMm: number;
  /** Only set for `shapeClass === "running"`: one pass up to `SINGLE_PASS_MAX_MM`, above it three (bean stitch, spec §7.4). */
  repeats?: 1 | 3;
  warnings: Warning[];
};

/**
 * Classifies one shape by its median stroke width (spec §5.1's
 * `medianShapeWidthMm`, reused as-is — this module changes what the width
 * DECIDES, not how it is measured).
 */
export function classifyShape(shape: Polygon, id?: string): ClassifyResult {
  const widthMm = medianShapeWidthMm(shape);

  if (widthMm < SATIN_FROM_MM) {
    return {
      shapeClass: "running",
      widthMm,
      repeats: widthMm <= SINGLE_PASS_MAX_MM ? 1 : 3,
      warnings: [],
    };
  }

  if (widthMm < AUTOSATIN_MAX_WIDTH_MM) {
    const warnings: Warning[] =
      widthMm < SATIN_NARROW_WARN_MM
        ? [
            warn(
              WARNING.SATIN_TOO_NARROW,
              `Satin column is ${widthMm.toFixed(2)} mm wide, under the ` +
                `${SATIN_NARROW_WARN_MM} mm comfort margin — stitchable, but tight.`,
              "warn",
              id,
            ),
          ]
        : [];
    return { shapeClass: "satin", widthMm, warnings };
  }

  return { shapeClass: "tatami", widthMm, warnings: [] };
}
