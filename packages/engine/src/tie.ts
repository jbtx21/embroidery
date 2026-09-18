/**
 * Lock stitches (spec §10.3).
 *
 * After every trim or colour change, and at the very start: three stitches of
 * 0.3 mm forwards and back along the direction of the first stitch. Before every
 * trim and at the end the same thing backwards. Running connections get no lock
 * stitches — the thread is not cut there, so it cannot unravel.
 */
import type { Point } from "@texma-stitch/geometry";
import type { Stitch, StitchBlock } from "./types.js";

export const TIE_LENGTH_MM = 0.3;

const isCommand = (s: Stitch): boolean => s.cmd !== "stitch" && s.cmd !== "jump";

function direction(from: Point, to: Point): Point | undefined {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const l = Math.hypot(dx, dy);
  if (l < 1e-9) return undefined;
  return { x: dx / l, y: dy / l };
}

const tieStitch = (p: Point): Stitch => ({ x: p.x, y: p.y, cmd: "stitch", tie: true });

/** Three short stitches around `p` along `dir`: q, p, q. */
function lockStitches(p: Point, dir: Point): Stitch[] {
  const q: Point = { x: p.x + dir.x * TIE_LENGTH_MM, y: p.y + dir.y * TIE_LENGTH_MM };
  return [tieStitch(q), tieStitch(p), tieStitch(q)];
}

/**
 * Adds lock stitches in place. Works on a copy and returns new blocks — the
 * input stays untouched so the object cache (spec §4) never gets a tied block
 * back.
 */
export function tieBlocks(blocks: StitchBlock[]): StitchBlock[] {
  const out: StitchBlock[] = blocks.map((b) => ({
    objectId: b.objectId,
    threadIndex: b.threadIndex,
    stitches: b.stitches.map((s) => ({ ...s })),
  }));

  // A block needs a lock at the start when it is the first one, or when the
  // thread was cut or the colour changed before it.
  let needsTieIn = true;
  for (let bi = 0; bi < out.length; bi++) {
    const s = out[bi]!.stitches;

    if (needsTieIn && s.length >= 2) {
      // The start position is the first entry (stitch or jump); the direction
      // points at the next real point.
      const p0 = s[0]!;
      const next = s.find((x, i) => i > 0 && !isCommand(x));
      const dir = next ? direction(p0, next) : undefined;
      if (dir) s.splice(1, 0, ...lockStitches(p0, dir));
    }

    // Lock before a trim and before `end`.
    for (let i = 0; i < s.length; i++) {
      const cur = s[i]!;
      if (cur.cmd !== "trim" && cur.cmd !== "end") continue;
      const before = s[i - 1];
      const beforeThat = s[i - 2];
      if (!before || !beforeThat) continue;
      const dir = direction(before, beforeThat);
      if (!dir) continue;
      const lock = lockStitches(before, dir);
      s.splice(i, 0, ...lock);
      // Trim, colour change and end sit where the needle now is.
      const last = lock[lock.length - 1]!;
      for (let k = i + lock.length; k < s.length; k++) {
        const cmd = s[k]!;
        if (!isCommand(cmd)) break;
        s[k] = { ...cmd, x: last.x, y: last.y };
      }
      i += lock.length;
    }

    const last = s[s.length - 1];
    needsTieIn = last?.cmd === "trim" || last?.cmd === "color";
  }

  return out;
}
