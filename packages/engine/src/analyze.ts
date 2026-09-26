/** Statistics, density and warnings (spec §11). */
import type { MachineProfile } from "./presets.js";
import { MACHINE_DEFAULT } from "./presets.js";
import type { Stats, Stitch, StitchBlock, Warning } from "./types.js";
import { warn, WARNING } from "./warnings.js";

export const DENSITY_WARN = 12;
export const DENSITY_ERROR = 18;
/** A single cell this hot is an error on its own (spec §11). */
export const DENSITY_ERROR_PEAK = 40;
/** Share of occupied cells above DENSITY_ERROR that makes it an error (spec §11). */
export const DENSITY_ERROR_SHARE = 0.02;
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

/**
 * Needle penetrations on a grid finer than the needle itself (spec §11,
 * 26.09.2026).
 *
 * The density of §11 measures on 1 mm cells and averages a pile-up away. What
 * decides whether a file can be sewn at all is how often the needle goes into
 * the SAME hole: a needle is 0,7 to 0,8 mm across, so a 0,2 mm cell holds
 * penetrations that land on top of each other. Measured against the TEXMA
 * archive, a production file puts at most 8 into one such cell and has between
 * 0 and 8 cells with six or more. STUTTGART 80 mm had 24 in one cell and 80
 * such cells — the fabric tears there and the needle breaks.
 */
export const NEEDLE_GRID_MM = 0.2;
/** One cell this full is worth a warning — the archive's own maximum. */
export const NEEDLE_WARN = 6;
/** This full, or too many warned cells, and the file is not sewable. */
export const NEEDLE_ERROR = 12;
/** Number of cells at or above NEEDLE_WARN that still counts as an error. */
export const NEEDLE_ERROR_CELLS = 20;

export function needleClusters(stitches: Stitch[]): {
  /** Most penetrations in one cell. */
  max: number;
  /** Cells holding NEEDLE_WARN or more. */
  cells: number;
  /** Where the worst cell sits, for the editor. */
  worst?: { x: number; y: number };
} {
  const grid = new Map<string, number>();
  let max = 0;
  let worst: { x: number; y: number } | undefined;
  for (const s of stitches) {
    if (s.cmd !== "stitch") continue;
    const gx = Math.round(s.x / NEEDLE_GRID_MM);
    const gy = Math.round(s.y / NEEDLE_GRID_MM);
    const n = (grid.get(`${gx}:${gy}`) ?? 0) + 1;
    grid.set(`${gx}:${gy}`, n);
    if (n > max) {
      max = n;
      worst = { x: s.x, y: s.y };
    }
  }
  let cells = 0;
  for (const n of grid.values()) if (n >= NEEDLE_WARN) cells++;
  return worst === undefined ? { max, cells } : { max, cells, worst };
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
  const needle = needleClusters(all);
  const stats: Stats = {
    stitches,
    jumps,
    trims,
    colorChanges,
    bboxMm: empty ? { w: 0, h: 0 } : { w: maxX - minX, h: maxY - minY },
    runtimeSec: stitches / (machine.rpm / 60) + trims * 3 + colorChanges * 12,
    densityMax,
    needleMax: needle.max,
    needleCells: needle.cells,
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
  // The needle grid decides sewability, the density grid decides look (§11).
  if (needle.max >= NEEDLE_ERROR || needle.cells > NEEDLE_ERROR_CELLS) {
    const where = needle.worst
      ? ` (worst at ${needle.worst.x.toFixed(1)}, ${needle.worst.y.toFixed(1)} mm)`
      : "";
    warnings.push(
      warn(
        WARNING.NEEDLE_CLUSTER,
        `Up to ${needle.max} penetrations in one ${NEEDLE_GRID_MM} mm cell, ` +
          `${needle.cells} cells at ${NEEDLE_WARN} or more${where} — the needle goes into ` +
          `the same hole and the fabric tears.`,
        "error",
      ),
    );
  } else if (needle.cells > 0) {
    warnings.push(
      warn(
        WARNING.NEEDLE_CLUSTER,
        `${needle.cells} cells with ${NEEDLE_WARN} or more penetrations per ` +
          `${NEEDLE_GRID_MM} mm, worst ${needle.max}.`,
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
