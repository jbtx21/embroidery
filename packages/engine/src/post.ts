/**
 * Nachbearbeitung (Kap. 11).
 *
 * - Stiche unter 0,3 mm entfernen, ausser Verriegelung (die IST kurz).
 * - Stiche und Spruenge ueber 12,1 mm teilen — das DST-Limit sind 121 Einheiten
 *   zu 0,1 mm je Achse; eine euklidische Laenge von 12,1 mm haelt beide Achsen
 *   darunter.
 */
import type { Stitch, StitchBlock } from "./types.js";

export const MIN_STITCH_MM = 0.3;
export const MAX_STITCH_MM = 12.1;

const istBewegung = (s: Stitch): boolean => s.cmd === "stitch" || s.cmd === "jump";

export function postProcess(
  blocks: StitchBlock[],
  maxStitchMm = MAX_STITCH_MM,
  minStitchMm = MIN_STITCH_MM,
): StitchBlock[] {
  const out: StitchBlock[] = [];
  // Die Nadelposition laeuft ueber Blockgrenzen hinweg weiter.
  let letzteX: number | undefined;
  let letzteY: number | undefined;

  for (const block of blocks) {
    const stitches: Stitch[] = [];
    for (const s of block.stitches) {
      if (!istBewegung(s)) {
        stitches.push({ ...s });
        // Kommandos bewegen nicht, setzen aber die Bezugsposition.
        letzteX = s.x;
        letzteY = s.y;
        continue;
      }
      if (letzteX === undefined || letzteY === undefined) {
        stitches.push({ ...s });
        letzteX = s.x;
        letzteY = s.y;
        continue;
      }
      const dx = s.x - letzteX;
      const dy = s.y - letzteY;
      const d = Math.hypot(dx, dy);

      if (d < minStitchMm && s.tie !== true) continue; // Ministich

      if (d > maxStitchMm) {
        const teile = Math.ceil(d / maxStitchMm);
        for (let k = 1; k < teile; k++) {
          stitches.push({
            x: letzteX + (dx * k) / teile,
            y: letzteY + (dy * k) / teile,
            cmd: s.cmd,
          });
        }
      }
      stitches.push({ ...s });
      letzteX = s.x;
      letzteY = s.y;
    }
    if (stitches.length > 0) {
      out.push({ objectId: block.objectId, threadIndex: block.threadIndex, stitches });
    }
  }
  return out;
}
