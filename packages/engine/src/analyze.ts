/** Statistics, density and warnings (spec §11). */
import type { MachineProfile } from "./presets.js";
import { MACHINE_DEFAULT } from "./presets.js";
import type { Stats, Stitch, StitchBlock, Warning } from "./types.js";
import { warn, WARNING } from "./warnings.js";

export const DENSITY_WARN = 12;
export const DENSITY_ERROR = 18;
export const MAX_COLOR_CHANGES = 8;
export const LONG_JUMP_MM = 30;

/** Stitches per cell on a 1 mm grid; the maximum is returned. */
export function maxDensity(stitches: Stitch[]): number {
  const cells = new Map<string, number>();
  let max = 0;
  for (const s of stitches) {
    if (s.cmd !== "stitch") continue;
    const key = `${Math.floor(s.x)}:${Math.floor(s.y)}`;
    const n = (cells.get(key) ?? 0) + 1;
    cells.set(key, n);
    if (n > max) max = n;
  }
  return max;
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
  const densityMax = maxDensity(all);
  const stats: Stats = {
    stitches,
    jumps,
    trims,
    colorChanges,
    bboxMm: empty ? { w: 0, h: 0 } : { w: maxX - minX, h: maxY - minY },
    runtimeSec: stitches / (machine.rpm / 60) + trims * 3 + colorChanges * 12,
    densityMax,
  };

  if (densityMax >= DENSITY_ERROR) {
    warnings.push(
      warn(
        WARNING.DENSITY_HIGH,
        `Up to ${densityMax} stitches per mm² — the fabric will not take that.`,
        "error",
      ),
    );
  } else if (densityMax >= DENSITY_WARN) {
    warnings.push(warn(WARNING.DENSITY_HIGH, `Up to ${densityMax} stitches per mm².`, "warn"));
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
