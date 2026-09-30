/**
 * Where a DST read back from Ink/Stitch is too dense or leaves thread lying (spec §13.4): the places
 * `needleClusters`, `densityProfile` and `untrimmedJumps` (`analyze.ts`) only count, as a list with
 * positions, for the layer "Prüfstellen" of the Nacharbeit file. The grids, limits and the rule for a
 * jump are theirs — this module imports the constants, and its tests hold it to the same numbers.
 *
 * The positions are those of the stitches as given; the caller maps them onto the page.
 */
import type { Point } from "@texma-stitch/geometry";
import { DENSITY_ERROR, NEEDLE_GRID_MM, NEEDLE_WARN } from "../analyze.js";
import type { Stitch } from "../types.js";

/** Cells this close (mm, centre to centre) are one place: a pile-up spreads over the cells round it. */
export const NEEDLE_SPOT_REACH_MM = 1;
/** The same for the 1 mm cells of the density: the eight round a cell are one place. */
export const DENSITY_SPOT_REACH_MM = 1.5;

/** A place: where, how full its fullest cell is, and how many cells of it are over the limit. */
export type CellSpot = { x: number; y: number; count: number; cells: number };

type Cell = { x: number; y: number; count: number };

/** No floating-point dust on the middle of a cell (`50 * 0.2` is a multiple of the grid, in name only). */
const tidy = (v: number): number => Math.round(v * 1e9) / 1e9;

/**
 * Cells over the limit, joined where they touch: the fullest first, each further cell within `reachMm`
 * of a place joins it. Ordered by count, then position, so the stitch order does not matter.
 */
function merge(cells: Cell[], reachMm: number): CellSpot[] {
  const sorted = [...cells].sort((a, b) => b.count - a.count || a.y - b.y || a.x - b.x);
  const spots: CellSpot[] = [];
  for (const c of sorted) {
    const near = spots.find((s) => Math.hypot(s.x - c.x, s.y - c.y) <= reachMm);
    if (near) near.cells++;
    else spots.push({ x: c.x, y: c.y, count: c.count, cells: 1 });
  }
  return spots;
}

/**
 * Needle pile-ups: cells of `NEEDLE_GRID_MM` (0.2 mm, rounded as `needleClusters` does) holding
 * `NEEDLE_WARN` or more penetrations, stitches only — a jump is no hole in the fabric.
 */
export function needleSpots(stitches: Stitch[], reachMm = NEEDLE_SPOT_REACH_MM): CellSpot[] {
  const grid = new Map<string, { gx: number; gy: number; count: number }>();
  for (const s of stitches) {
    if (s.cmd !== "stitch") continue;
    const gx = Math.round(s.x / NEEDLE_GRID_MM);
    const gy = Math.round(s.y / NEEDLE_GRID_MM);
    const key = `${gx}:${gy}`;
    const cell = grid.get(key);
    if (cell) cell.count++;
    else grid.set(key, { gx, gy, count: 1 });
  }
  const over: Cell[] = [];
  for (const c of grid.values()) {
    if (c.count >= NEEDLE_WARN) {
      over.push({ x: tidy(c.gx * NEEDLE_GRID_MM), y: tidy(c.gy * NEEDLE_GRID_MM), count: c.count });
    }
  }
  return merge(over, reachMm);
}

/**
 * Dense places: cells of 1 mm (floored as `densityProfile` does) with more than `DENSITY_ERROR`
 * stitches, each at the middle of its cell.
 */
export function densitySpots(stitches: Stitch[], reachMm = DENSITY_SPOT_REACH_MM): CellSpot[] {
  const grid = new Map<string, { cx: number; cy: number; count: number }>();
  for (const s of stitches) {
    if (s.cmd !== "stitch") continue;
    const cx = Math.floor(s.x);
    const cy = Math.floor(s.y);
    const key = `${cx}:${cy}`;
    const cell = grid.get(key);
    if (cell) cell.count++;
    else grid.set(key, { cx, cy, count: 1 });
  }
  const over: Cell[] = [];
  for (const c of grid.values()) {
    if (c.count > DENSITY_ERROR) over.push({ x: c.cx + 0.5, y: c.cy + 0.5, count: c.count });
  }
  return merge(over, reachMm);
}

/** A move of jump records alone with the thread fast to the last stitch at its start. */
export type OpenJump = { from: Point; to: Point; lengthMm: number };

/**
 * The jumps `untrimmedJumps` counts (spec §10.2), one by one: a run of jump records longer than
 * `thresholdMm`, measured along the records, with no trim and no colour change before it since the
 * last stitch. `from` is where the thread was fast, `to` where the run ends.
 */
export function openJumps(stitches: Stitch[], thresholdMm: number): OpenJump[] {
  const out: OpenJump[] = [];
  let at: Stitch | undefined;
  let fast = false;
  let run = 0;
  let runFast = false;
  let from: Point | undefined;
  let to: Point | undefined;
  const flush = (): void => {
    if (run > thresholdMm && runFast && from !== undefined && to !== undefined) {
      out.push({ from, to, lengthMm: run });
    }
    run = 0;
  };
  for (const s of stitches) {
    if (s.cmd === "jump") {
      if (run === 0) {
        runFast = fast;
        from = at === undefined ? { x: s.x, y: s.y } : { x: at.x, y: at.y };
      }
      if (at !== undefined) run += Math.hypot(s.x - at.x, s.y - at.y);
      at = s;
      to = { x: s.x, y: s.y };
      continue;
    }
    flush();
    if (s.cmd === "stitch") {
      fast = true;
      at = s;
    } else if (s.cmd === "trim" || s.cmd === "color") {
      fast = false;
    }
  }
  flush();
  return out;
}
