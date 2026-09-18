/** Kennzahlen, Dichte und Warnungen (Kap. 11). */
import type { MachineProfile } from "./presets.js";
import { MASCHINE_STANDARD } from "./presets.js";
import type { Stats, Stitch, StitchBlock, Warning } from "./types.js";
import { warne, WARNUNG } from "./warnings.js";

export const DICHTE_WARNUNG = 12;
export const DICHTE_FEHLER = 18;
export const MAX_FARBWECHSEL = 8;
export const LANGER_SPRUNG_MM = 30;

/** Stiche pro Zelle im 1-mm-Raster; zurueck kommt das Maximum. */
export function maxDichte(stiche: Stitch[]): number {
  const zellen = new Map<string, number>();
  let max = 0;
  for (const s of stiche) {
    if (s.cmd !== "stitch") continue;
    const key = `${Math.floor(s.x)}:${Math.floor(s.y)}`;
    const n = (zellen.get(key) ?? 0) + 1;
    zellen.set(key, n);
    if (n > max) max = n;
  }
  return max;
}

export function analyze(
  blocks: StitchBlock[],
  maschine: MachineProfile = MASCHINE_STANDARD,
): { stats: Stats; warnings: Warning[] } {
  const alle = blocks.flatMap((b) => b.stitches);
  const warnings: Warning[] = [];

  let stitches = 0;
  let jumps = 0;
  let trims = 0;
  let colorChanges = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  let vorherX: number | undefined;
  let vorherY: number | undefined;
  let laengsterSprung = 0;

  for (const s of alle) {
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
      if (s.cmd === "jump" && vorherX !== undefined && vorherY !== undefined) {
        laengsterSprung = Math.max(laengsterSprung, Math.hypot(s.x - vorherX, s.y - vorherY));
      }
      vorherX = s.x;
      vorherY = s.y;
    }
  }

  const leer = !Number.isFinite(minX);
  const densityMax = maxDichte(alle);
  const stats: Stats = {
    stitches,
    jumps,
    trims,
    colorChanges,
    bboxMm: leer ? { w: 0, h: 0 } : { w: maxX - minX, h: maxY - minY },
    runtimeSec: stitches / (maschine.rpm / 60) + trims * 3 + colorChanges * 12,
    densityMax,
  };

  if (densityMax >= DICHTE_FEHLER) {
    warnings.push(
      warne(
        WARNUNG.DENSITY_HIGH,
        `Bis zu ${densityMax} Stiche je mm² — der Stoff traegt das nicht.`,
        "error",
      ),
    );
  } else if (densityMax >= DICHTE_WARNUNG) {
    warnings.push(
      warne(WARNUNG.DENSITY_HIGH, `Bis zu ${densityMax} Stiche je mm².`, "warn"),
    );
  }
  if (colorChanges > MAX_FARBWECHSEL) {
    warnings.push(
      warne(WARNUNG.MANY_COLOR_CHANGES, `${colorChanges} Farbwechsel.`, "warn"),
    );
  }
  if (laengsterSprung > LANGER_SPRUNG_MM) {
    warnings.push(
      warne(WARNUNG.LONG_JUMP, `Sprung ueber ${laengsterSprung.toFixed(0)} mm.`, "warn"),
    );
  }
  if (!leer && (stats.bboxMm.w > maschine.hoopWMm || stats.bboxMm.h > maschine.hoopHMm)) {
    warnings.push(
      warne(
        WARNUNG.OBJECT_OUTSIDE_HOOP,
        `Motiv ${stats.bboxMm.w.toFixed(0)} × ${stats.bboxMm.h.toFixed(0)} mm passt nicht in den Rahmen ${maschine.hoopWMm} × ${maschine.hoopHMm} mm.`,
        "error",
      ),
    );
  }

  return { stats, warnings };
}
