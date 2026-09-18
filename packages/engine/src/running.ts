/**
 * Laufstich (Kap. 6).
 *
 * 1. Pfad mit `resample(step = stitchLengthMm, keepCorners = true)`.
 * 2. Gleichmaessige Aufteilung je Abschnitt — dadurch entsteht kein Reststich
 *    unter 0,5 mm (die Schrittweite wird angepasst, statt einen Stummel
 *    anzuhaengen; siehe `resample`).
 * 3. Bean Stitch: je Segment vor, zurueck, vor (3) bzw. 5 Durchgaenge.
 * 4. Geschlossen: letzter Stich = erster Stich.
 */
import type { Point, Polyline } from "@texma-stitch/geometry";
import { dedupe, resample } from "@texma-stitch/geometry";
import type { RunningObject } from "./types.js";

export const MIN_RESTSTICH_MM = 0.5;

export type RunningOptions = {
  stitchLengthMm: number;
  repeats?: 1 | 3 | 5;
  closed?: boolean;
};

/**
 * Bean Stitch: jedes Segment `repeats` mal ablaufen, beginnend und endend
 * vorwaerts. `repeats` ist ungerade, damit der Pfad vorne heraus kommt.
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
