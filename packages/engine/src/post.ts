/**
 * Post-processing (spec §11).
 *
 * - Remove stitches below `minStitchMm` (0.6 by default, from the machine
 *   profile), except lock stitches — those ARE short by definition (spec §11).
 * - Split stitches and jumps above 12.1 mm — the DST limit is 121 units of
 *   0.1 mm per axis, and a Euclidean length of 12.1 mm keeps both axes below it.
 */
import type { Stitch, StitchBlock } from "./types.js";

export const MIN_STITCH_MM = 0.6;
export const MAX_STITCH_MM = 12.1;

const isMovement = (s: Stitch): boolean => s.cmd === "stitch" || s.cmd === "jump";

export function postProcess(
  blocks: StitchBlock[],
  maxStitchMm = MAX_STITCH_MM,
  minStitchMm = MIN_STITCH_MM,
): StitchBlock[] {
  const out: StitchBlock[] = [];
  // The needle position carries on across block boundaries.
  let lastX: number | undefined;
  let lastY: number | undefined;

  let lastWasJump = false;
  for (const [bi, block] of blocks.entries()) {
    const stitches: Stitch[] = [];
    for (const [index, s] of block.stitches.entries()) {
      // The needle carries on across the block boundary, so the stitch before a
      // jump can be the last one of the block before it.
      const next = block.stitches[index + 1] ?? blocks[bi + 1]?.stitches[0];
      if (!isMovement(s)) {
        stitches.push({ ...s });
        // Commands do not move, but they do set the reference position.
        lastX = s.x;
        lastY = s.y;
        continue;
      }
      if (lastX === undefined || lastY === undefined) {
        stitches.push({ ...s });
        lastX = s.x;
        lastY = s.y;
        continue;
      }
      const dx = s.x - lastX;
      const dy = s.y - lastY;
      const d = Math.hypot(dx, dy);

      // The stitches on either side of a jump anchor it: the one before sets
      // where it starts, the one after catches the thread. Dropping either for
      // being short makes the jump longer than the rule allows or merges two
      // jumps into one, and the thread then lies on the fabric across both
      // (spec §10.2, 21.09.2026).
      const anchor = s.cmd === "stitch" && (lastWasJump || next?.cmd === "jump");
      if (d < minStitchMm && s.tie !== true && !anchor) continue; // tiny stitch

      if (d > maxStitchMm) {
        const parts = Math.ceil(d / maxStitchMm);
        for (let k = 1; k < parts; k++) {
          stitches.push({
            x: lastX + (dx * k) / parts,
            y: lastY + (dy * k) / parts,
            cmd: s.cmd,
          });
        }
      }
      stitches.push({ ...s });
      lastWasJump = s.cmd === "jump";
      lastX = s.x;
      lastY = s.y;
    }
    if (stitches.length > 0) {
      out.push({ objectId: block.objectId, threadIndex: block.threadIndex, stitches });
    }
  }
  return out;
}
