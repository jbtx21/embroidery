/** StitchPlan to a DST file (spec §13.1). */
import type { Stitch, StitchBlock, StitchPlan } from "@texma-stitch/engine";
import {
  DST_MAX_DELTA,
  DST_UNITS_PER_MM,
  encodeRecord,
  roundHalfEven,
  TRIM_RECORDS,
} from "./encode.js";
import { writeHeader } from "./header.js";

/** A stitch in DST units (0.1 mm), y still pointing down. */
export type DstStitch = { x: number; y: number; cmd: Stitch["cmd"] };

export type DstOptions = {
  /** Label in the header, at most 16 characters. */
  label?: string;
  /**
   * Centre the design on the origin (default). Embroidery machines start at the
   * origin — a file whose coordinates are all positive drives the frame out of
   * range.
   */
  center?: boolean;
};

export function planToUnits(blocks: StitchBlock[]): DstStitch[] {
  const out: DstStitch[] = [];
  for (const b of blocks) {
    for (const s of b.stitches) {
      out.push({ x: s.x * DST_UNITS_PER_MM, y: s.y * DST_UNITS_PER_MM, cmd: s.cmd });
    }
  }
  return out;
}

/**
 * Bring a stitch list into the shape DST actually tolerates:
 *
 * 1. Centre it (default), see `DstOptions.center`.
 * 2. Leading jumps: the way from the origin to the first stitch is itself a
 *    delta and has to respect the same limit as every other one.
 * 3. Split movements that are too long. The engine already does that in `post`,
 *    but the limit belongs to the FORMAT — anyone handing in a foreign list
 *    should be able to rely on it.
 */
export function prepareUnits(stitches: DstStitch[], opts: { center?: boolean } = {}): DstStitch[] {
  if (stitches.length === 0) return [];

  let shiftX = 0;
  let shiftY = 0;
  if (opts.center !== false) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const s of stitches) {
      if (s.x < minX) minX = s.x;
      if (s.y < minY) minY = s.y;
      if (s.x > maxX) maxX = s.x;
      if (s.y > maxY) maxY = s.y;
    }
    // Shift by whole units so the coordinates stay on the same grid.
    shiftX = -Math.round((minX + maxX) / 2);
    shiftY = -Math.round((minY + maxY) / 2);
  }

  const shifted = stitches.map((s) => ({ ...s, x: s.x + shiftX, y: s.y + shiftY }));

  const out: DstStitch[] = [];
  let cx = 0;
  let cy = 0;
  let firstMove = true;

  for (const s of shifted) {
    if (s.cmd !== "stitch" && s.cmd !== "jump") {
      out.push({ ...s, x: cx, y: cy });
      continue;
    }

    if (firstMove) {
      firstMove = false;
      const steps = Math.max(
        Math.ceil(Math.abs(s.x) / DST_MAX_DELTA),
        Math.ceil(Math.abs(s.y) / DST_MAX_DELTA),
      );
      for (let k = 1; k <= steps; k++) {
        out.push({ x: (s.x * k) / steps, y: (s.y * k) / steps, cmd: "jump" });
      }
      // That already places a jump; a stitch still needs its own record at the
      // same spot.
      if (s.cmd !== "jump" || steps === 0) out.push({ ...s });
      cx = s.x;
      cy = s.y;
      continue;
    }

    const dx = s.x - cx;
    const dy = s.y - cy;
    const steps = Math.max(
      1,
      Math.ceil(Math.abs(dx) / DST_MAX_DELTA),
      Math.ceil(Math.abs(dy) / DST_MAX_DELTA),
    );
    for (let k = 1; k < steps; k++) {
      out.push({ x: cx + (dx * k) / steps, y: cy + (dy * k) / steps, cmd: s.cmd });
    }
    out.push({ ...s });
    cx = s.x;
    cy = s.y;
  }

  return out;
}

/** Encodes exactly the list handed in — no centring, no splitting. */
export function writeDstFromUnits(stitches: DstStitch[], opts: DstOptions = {}): Uint8Array {
  const label = opts.label ?? "Untitled";

  let minX = 0;
  let minY = 0;
  let maxX = 0;
  let maxY = 0;
  if (stitches.length > 0) {
    minX = Infinity;
    minY = Infinity;
    maxX = -Infinity;
    maxY = -Infinity;
    for (const s of stitches) {
      if (s.x < minX) minX = s.x;
      if (s.y < minY) minY = s.y;
      if (s.x > maxX) maxX = s.x;
      if (s.y > maxY) maxY = s.y;
    }
  }

  const last = stitches[stitches.length - 1];
  const header = writeHeader({
    label,
    records: stitches.length,
    colorChanges: stitches.filter((s) => s.cmd === "color").length,
    bounds: {
      minX: Math.trunc(minX),
      minY: Math.trunc(minY),
      maxX: Math.trunc(maxX),
      maxY: Math.trunc(maxY),
    },
    last: last ? { x: Math.trunc(last.x), y: Math.trunc(last.y) } : { x: 0, y: 0 },
  });

  const chunks: Uint8Array[] = [header];
  // The needle position is tracked as an integer: the delta is always the TRUE
  // target position minus the already rounded position. Otherwise the rounding
  // errors add up over thousands of stitches (spec §13.1).
  let xx = 0;
  let yy = 0;
  for (const s of stitches) {
    const dx = roundHalfEven(s.x - xx);
    const dy = roundHalfEven(s.y - yy);
    xx += dx;
    yy += dy;
    if (s.cmd === "trim") {
      for (const r of TRIM_RECORDS) chunks.push(r);
    } else {
      chunks.push(encodeRecord(dx, dy, s.cmd));
    }
  }

  const length = chunks.reduce((sum, t) => sum + t.length, 0);
  const out = new Uint8Array(length);
  let offset = 0;
  for (const t of chunks) {
    out.set(t, offset);
    offset += t.length;
  }
  return out;
}

export function writeDst(plan: StitchPlan, opts: DstOptions = {}): Uint8Array {
  return writeDstFromUnits(prepareUnits(planToUnits(plan.blocks), opts), opts);
}
