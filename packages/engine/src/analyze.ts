/** Statistics, density and warnings (spec §11). */
import type { MachineProfile } from "./presets.js";
import { MACHINE_DEFAULT } from "./presets.js";
import type { Stats, Stitch, StitchBlock, Warning } from "./types.js";
import { warn, WARNING } from "./warnings.js";

export const DENSITY_WARN = 12;
export const DENSITY_ERROR = 18;
/** A single cell this hot is an error on its own (spec §11). */
export const DENSITY_ERROR_PEAK = 30;
/** Share of occupied cells above DENSITY_ERROR that makes it an error (spec §11). */
export const DENSITY_ERROR_SHARE = 0.01;
export const MAX_COLOR_CHANGES = 8;
export const LONG_JUMP_MM = 30;

/**
 * Stitches per cell on a 1 mm grid (spec §11).
 *
 * The peak alone does not carry the verdict: on the STUTTGART logo 9 cells out
 * of 4047 sat above the error limit while 92 % of them were at 8 or below. So
 * the share above the limit is counted too.
 */
export function densityProfile(stitches: Stitch[]): {
  max: number;
  cells: number;
  overError: number;
} {
  const cells = new Map<string, number>();
  let max = 0;
  for (const s of stitches) {
    if (s.cmd !== "stitch") continue;
    const key = `${Math.floor(s.x)}:${Math.floor(s.y)}`;
    const n = (cells.get(key) ?? 0) + 1;
    cells.set(key, n);
    if (n > max) max = n;
  }
  let overError = 0;
  for (const n of cells.values()) if (n > DENSITY_ERROR) overError++;
  return { max, cells: cells.size, overError };
}

/** Stitches per cell on a 1 mm grid; the maximum is returned. */
export function maxDensity(stitches: Stitch[]): number {
  return densityProfile(stitches).max;
}

export function analyze(
  blocks: StitchBlock[],
  machine: MachineProfile = MACHINE_DEFAULT,
): { stats: Stats; warnings: Warning[] } {
  const all = blocks.flatMap((b) => b.stitches);
  const warnings: Warning[] = [];

  let stitches = 0;
  let jumps = 0;
  let trims = 0;
  let colorChanges = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  let prevX: number | undefined;
  let prevY: number | undefined;
  let longestJump = 0;

  for (const s of all) {
    switch (s.cmd) {
      case "stitch":
        stitches++;
        break;
      case "jump":
        jumps++;
        break;
      case "trim":
        trims++;
        break;
      case "color":
        colorChanges++;
        break;
      case "stop":
      case "end":
        break;
    }
    if (s.cmd === "stitch" || s.cmd === "jump") {
      if (s.x < minX) minX = s.x;
      if (s.y < minY) minY = s.y;
      if (s.x > maxX) maxX = s.x;
      if (s.y > maxY) maxY = s.y;
      if (s.cmd === "jump" && prevX !== undefined && prevY !== undefined) {
        longestJump = Math.max(longestJump, Math.hypot(s.x - prevX, s.y - prevY));
      }
      prevX = s.x;
      prevY = s.y;
    }
  }

  const empty = !Number.isFinite(minX);
  const density = densityProfile(all);
  const densityMax = density.max;
  const stats: Stats = {
    stitches,
    jumps,
    trims,
    colorChanges,
    bboxMm: empty ? { w: 0, h: 0 } : { w: maxX - minX, h: maxY - minY },
    runtimeSec: stitches / (machine.rpm / 60) + trims * 3 + colorChanges * 12,
    densityMax,
  };

  // Error only when a whole area is overfilled, or one cell is far past the
  // limit — a single hot spot is worth a warning, not a refusal (spec §11).
  const share = density.cells === 0 ? 0 : density.overError / density.cells;
  if (densityMax > DENSITY_ERROR_PEAK || share > DENSITY_ERROR_SHARE) {
    warnings.push(
      warn(
        WARNING.DENSITY_HIGH,
        `Up to ${densityMax} stitches per mm², ${density.overError} of ${density.cells} cells ` +
          `over ${DENSITY_ERROR} — the fabric will not take that.`,
        "error",
      ),
    );
  } else if (densityMax > DENSITY_WARN) {
    warnings.push(
      warn(
        WARNING.DENSITY_HIGH,
        `Up to ${densityMax} stitches per mm² in ${density.overError} of ${density.cells} cells.`,
        "warn",
      ),
    );
  }
  if (colorChanges > MAX_COLOR_CHANGES) {
    warnings.push(warn(WARNING.MANY_COLOR_CHANGES, `${colorChanges} colour changes.`, "warn"));
  }
  if (longestJump > LONG_JUMP_MM) {
    warnings.push(warn(WARNING.LONG_JUMP, `Jump of over ${longestJump.toFixed(0)} mm.`, "warn"));
  }
  if (!empty && (stats.bboxMm.w > machine.hoopWMm || stats.bboxMm.h > machine.hoopHMm)) {
    warnings.push(
      warn(
        WARNING.OBJECT_OUTSIDE_HOOP,
        `Design ${stats.bboxMm.w.toFixed(0)} × ${stats.bboxMm.h.toFixed(0)} mm does not fit the hoop ${machine.hoopWMm} × ${machine.hoopHMm} mm.`,
        "error",
      ),
    );
  }

  return { stats, warnings };
}
