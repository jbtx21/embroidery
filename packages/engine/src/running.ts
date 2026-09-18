/**
 * Running stitch (spec §6).
 *
 * 1. Resample the path with `step = stitchLengthMm`, `keepCorners = true`.
 * 2. Every piece is divided evenly, so no remnant stitch below 0.5 mm appears
 *    (the step is adjusted instead of a stub being appended; see `resample`).
 * 3. Bean stitch: each segment forward, back, forward (3) or 5 passes.
 * 4. Closed: last stitch equals the first stitch.
 */
import type { Point, Polyline } from "@texma-stitch/geometry";
import { dedupe, resample } from "@texma-stitch/geometry";
import type { RunningObject } from "./types.js";

export const MIN_REMNANT_MM = 0.5;

export type RunningOptions = {
  stitchLengthMm: number;
  repeats?: 1 | 3 | 5;
  closed?: boolean;
};

/**
 * Bean stitch: walk each segment `repeats` times, starting and ending forwards.
 * `repeats` is odd so the path comes out at the far end.
 */
function bean(points: Polyline, repeats: number): Polyline {
  if (repeats <= 1 || points.length < 2) return points;
  const out: Polyline = [{ ...points[0]! }];
  for (let i = 0; i + 1 < points.length; i++) {
    const from = points[i]!;
    const to = points[i + 1]!;
    for (let k = 0; k < repeats; k++) out.push({ ...(k % 2 === 0 ? to : from) });
  }
  return out;
}

export function runningStitches(path: Polyline, opts: RunningOptions): Polyline {
  const clean = dedupe(path, 1e-6);
  if (clean.length < 2) return clean.map((p) => ({ ...p }));

  const closed = opts.closed ?? false;
  const source: Polyline = closed ? [...clean, { ...clean[0]! }] : clean;
  const sampled = resample(source, opts.stitchLengthMm, true);
  return bean(sampled, opts.repeats ?? 1);
}

export function generateRunning(obj: RunningObject): Point[] {
  return runningStitches(obj.path, {
    stitchLengthMm: obj.stitchLengthMm,
    repeats: obj.repeats,
    closed: obj.closed,
  });
}
