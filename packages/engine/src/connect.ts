/**
 * Connections between blocks (spec §10.2).
 *
 * | Condition                                              | Action              |
 * |--------------------------------------------------------|---------------------|
 * | different colour                                        | trim, color         |
 * | distance <= 3 mm and the path lies under a later object | running connection  |
 * | of the same colour, or inside B                         | (no trim)           |
 * | distance <= jumpTrimMm (5)                              | jump, no trim       |
 * | otherwise                                               | trim, jump          |
 *
 * `trimAfter` on the object overrides: `always` always trims, `never` never
 * does. A colour change stays a colour change even with `never` — only the trim
 * is dropped.
 */
import type { Point, Polygon } from "@texma-stitch/geometry";
import { dist, insideTravel, segmentInside } from "@texma-stitch/geometry";
import { runningStitches } from "./running.js";
import { direction, lockStitches } from "./tie.js";
import type { Stitch, StitchBlock, TrimAfter } from "./types.js";

export type ConnectOptions = {
  /** Up to this distance a jump replaces a trim. */
  jumpTrimMm: number;
  /** Up to this distance a running connection is considered at all. */
  runningConnectMm: number;
  travelStitchMm: number;
};

export const CONNECT_DEFAULTS: ConnectOptions = {
  jumpTrimMm: 5,
  runningConnectMm: 3,
  travelStitchMm: 2.0,
};

export type RawBlock = {
  objectId: string;
  threadIndex: number;
  points: Point[];
  trimAfter: TrimAfter;
  /**
   * Indices in `points` the needle reaches by a jump rather than a stitch — a
   * fill whose travel found no way inside says so here (spec §8.7, 21.09.2026).
   */
  jumpAt?: number[];
  /** The area this object covers — used by the coverage test. */
  cover?: Polygon;
};

export type Connection = {
  trim: boolean;
  color: boolean;
  /** Points of the running connection without its start point, empty otherwise. */
  travel: Point[];
  jump: boolean;
};

/** Does the path lie under a later object of the same colour, or inside B? */
function coveredBy(
  from: Point,
  to: Point,
  index: number,
  blocks: RawBlock[],
  threadIndex: number,
): Polygon | undefined {
  for (let i = index; i < blocks.length; i++) {
    const b = blocks[i]!;
    if (b.threadIndex !== threadIndex) continue;
    if (!b.cover) continue;
    if (segmentInside(b.cover, from, to)) return b.cover;
  }
  return undefined;
}

export function decideConnection(
  index: number,
  blocks: RawBlock[],
  opts: ConnectOptions,
): Connection {
  const a = blocks[index]!;
  const b = blocks[index + 1]!;
  const endA = a.points[a.points.length - 1]!;
  const startB = b.points[0]!;
  const d = dist(endA, startB);
  const colorChange = a.threadIndex !== b.threadIndex;

  if (colorChange) {
    return { trim: a.trimAfter !== "never", color: true, travel: [], jump: d > 1e-6 };
  }

  if (a.trimAfter === "always") {
    return { trim: true, color: false, travel: [], jump: d > 1e-6 };
  }

  if (d <= opts.runningConnectMm) {
    // The path must lie under a later object of the same colour. Starting at
    // index + 1 includes B itself — "inside B" is the same test.
    const cover = coveredBy(endA, startB, index + 1, blocks, a.threadIndex);
    if (cover) {
      const path = insideTravel(cover, endA, startB);
      const stitched = runningStitches(path, { stitchLengthMm: opts.travelStitchMm });
      return { trim: false, color: false, travel: stitched.slice(1), jump: false };
    }
  }

  if (d <= opts.jumpTrimMm) {
    return { trim: false, color: false, travel: [], jump: d > 1e-6 };
  }

  return { trim: a.trimAfter !== "never", color: false, travel: [], jump: d > 1e-6 };
}

const stitchAt = (p: Point): Stitch => ({ x: p.x, y: p.y, cmd: "stitch" });

/**
 * The stitches of one block, with the jumps the object asked for (spec §8.7.1)
 * — and a trim before the ones that would otherwise drag thread across bare
 * fabric.
 *
 * A jump inside a block is the same move as a jump between two blocks, so it
 * follows the same rule (§10.2, 21.09.2026): up to `jumpTrimMm` it stays as it
 * is, above that the thread is cut — unless a later object of the same colour
 * stitches over the line anyway. `trimAfter: "never"` suppresses it, as it does
 * everywhere else.
 */
function withInnerJumps(block: RawBlock): Stitch[] {
  const marks = new Set(block.jumpAt ?? []);
  return block.points.map((p, i) =>
    marks.has(i) && i > 0 ? { x: p.x, y: p.y, cmd: "jump" as const } : stitchAt(p),
  );
}

/**
 * Cut the thread where it would otherwise lie on the fabric (spec §10.2,
 * 21.09.2026).
 *
 * Runs over the finished blocks, because only there is the whole picture: a
 * jump between two objects and a jump inside the next one follow each other
 * with nothing stitched in between, and the thread spans both. What counts is
 * therefore the distance **since the last stitch**, not the single jump —
 * measured on STUTTGART 250 mm, that difference is 10,3 mm of thread lying on
 * top. Up to `jumpTrimMm` it stays, above it the thread is cut, unless a later
 * object of the same colour stitches over the line. `trimAfter: "never"` on the
 * block that would carry the trim suppresses it.
 */
export function cutLongJumps(
  out: StitchBlock[],
  raw: RawBlock[],
  opts: ConnectOptions = CONNECT_DEFAULTS,
): StitchBlock[] {
  out = out.map((b) => ({ ...b, stitches: b.stitches.map((s) => ({ ...s })) }));
  let cut = false;
  // Where the current run of jumps started, and where a trim would go.
  let from: Stitch | undefined;
  let atBlock = -1;
  let atIndex = -1;
  for (let bi = 0; bi < out.length; bi++) {
    const block = out[bi]!;
    for (let i = 0; i < block.stitches.length; i++) {
      const s = block.stitches[i]!;
      if (s.cmd === "trim" || s.cmd === "color") {
        cut = true;
        from = undefined;
        continue;
      }
      if (s.cmd !== "jump") {
        // Any real stitch anchors the thread again.
        cut = false;
        from = undefined;
        continue;
      }
      if (cut) continue;
      if (from === undefined) {
        const before = i > 0 ? block.stitches[i - 1] : lastMovement(out, bi);
        if (!before) continue;
        from = before;
        atBlock = bi;
        atIndex = i;
      }
      // The same threshold as `decideConnection` (§10.2). It used to sit
      // a lock stitch lower, as a reserve for stitches that were thought to
      // come afterwards — since 21.09.2026 `tieBlocks` runs BEFORE this stage
      // (`pipeline.ts`), so the distance measured here is already the one the
      // machine drives, and the reserve only cut jumps between 4,7 and 5,0 mm
      // that §10.2 deliberately leaves alone.
      if (dist(from, s) <= opts.jumpTrimMm) continue;
      // Only a LATER object can cover the line — the one being stitched is
      // where the needle already is (§10.2 uses `index + 1` for the same
      // reason).
      if (coveredBy(from, s, atBlock + 1, raw, block.threadIndex) !== undefined) continue;
      const carrier = out[atBlock]!;
      if (raw[atBlock]!.trimAfter === "never") continue;
      // Lock, cut, and lock again on the far side (§10.3) — this runs after the
      // lock stage, so it brings its own.
      const before = carrier.stitches[atIndex - 1];
      const beforeThat = carrier.stitches[atIndex - 2];
      const backwards = before && beforeThat ? direction(before, beforeThat) : undefined;
      const lead = backwards && before ? lockStitches(before, backwards) : [];
      const head = lead[lead.length - 1] ?? from;
      carrier.stitches.splice(atIndex, 0, ...lead, { x: head.x, y: head.y, cmd: "trim" });
      const shift = lead.length + 1;
      if (atBlock === bi) i += shift;
      const landed = bi === atBlock ? out[bi]!.stitches[i] : s;
      const after = nextMovement(out, bi, i);
      const forwards = landed && after ? direction(landed, after) : undefined;
      if (landed && forwards) out[bi]!.stitches.splice(i + 1, 0, ...lockStitches(landed, forwards));
      cut = true;
      from = undefined;
    }
  }
  return out;
}

/** The next stitch after this position — where the thread is anchored again. */
function nextMovement(out: StitchBlock[], bi: number, from: number): Stitch | undefined {
  for (let i = bi; i < out.length; i++) {
    const s = out[i]!.stitches;
    for (let k = i === bi ? from + 1 : 0; k < s.length; k++) {
      if (s[k]!.cmd === "stitch") return s[k];
    }
  }
  return undefined;
}

/** The last stitch or jump before this block — the needle carries on across. */
function lastMovement(out: StitchBlock[], before: number): Stitch | undefined {
  for (let i = before - 1; i >= 0; i--) {
    const s = out[i]!.stitches;
    for (let k = s.length - 1; k >= 0; k--) {
      const cur = s[k]!;
      if (cur.cmd === "stitch" || cur.cmd === "jump") return cur;
    }
  }
  return undefined;
}

/**
 * Raw point blocks to stitch blocks carrying commands. Trim and colour change
 * hang off the end of block A, jump and running connection off the start of
 * block B — the order in which the machine works through them.
 */
export function connectBlocks(
  raw: RawBlock[],
  opts: ConnectOptions = CONNECT_DEFAULTS,
): StitchBlock[] {
  const filled = raw.filter((b) => b.points.length > 0);
  if (filled.length === 0) return [];

  const out: StitchBlock[] = filled.map((b) => ({
    objectId: b.objectId,
    threadIndex: b.threadIndex,
    stitches: withInnerJumps(b),
  }));

  for (let i = 0; i + 1 < filled.length; i++) {
    const action = decideConnection(i, filled, opts);
    const a = out[i]!;
    const b = out[i + 1]!;
    const endA = a.stitches[a.stitches.length - 1]!;

    if (action.trim) a.stitches.push({ x: endA.x, y: endA.y, cmd: "trim" });
    if (action.color) a.stitches.push({ x: endA.x, y: endA.y, cmd: "color" });

    if (action.travel.length > 0) {
      // The last travel point IS the start of the block — drop the duplicate.
      b.stitches.splice(0, 1, ...action.travel.map(stitchAt));
    } else if (action.jump) {
      const first = b.stitches[0]!;
      b.stitches[0] = { x: first.x, y: first.y, cmd: "jump" };
    }
  }

  // Finish: `end` at the last position.
  const lastBlock = out[out.length - 1]!;
  const lastStitch = lastBlock.stitches[lastBlock.stitches.length - 1]!;
  lastBlock.stitches.push({ x: lastStitch.x, y: lastStitch.y, cmd: "end" });
  return out;
}
