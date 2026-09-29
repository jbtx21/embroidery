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
 * Satin starts where one thread no longer covers the width: `SINGLE_PASS_MAX_MM`
 * (0.7 mm, spec §7.4), decided 29.09.2026. Up to it a single running stitch
 * covers the shape; above it only a column does, so there is no three-pass
 * band in between. Measured on the customer logos: the rims of the STUTTGART
 * letters (0.44-0.62 mm, the width measurement over-reads thin rings) stay
 * running stitch; the slash of "NotSan 01/24" (0.73 mm) and "CYS SPORTS"
 * (0.88-1.24 mm) come out as closed satin columns. Spec §7.4's 0.6 mm would
 * have made the banner rims satin.
 */
import type { Polygon } from "@texma-stitch/geometry";
import { AUTOSATIN_MAX_WIDTH_MM, medianShapeWidthMm, SINGLE_PASS_MAX_MM } from "../import/svg.js";
import type { Warning } from "../types.js";
import { warn, WARNING } from "../warnings.js";

/** Below this median width, a shape becomes a single running stitch, not satin. */
export const SATIN_FROM_MM = SINGLE_PASS_MAX_MM;
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
    return { shapeClass: "running", widthMm, warnings: [] };
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
