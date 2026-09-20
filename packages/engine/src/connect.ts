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

  const out: StitchBlock[] = filled.map((b) => {
    const stitches = b.points.map(stitchAt);
    // Inside a block a jump is a move the object asked for, not a connection.
    for (const i of b.jumpAt ?? []) {
      const s = stitches[i];
      if (s) s.cmd = "jump";
    }
    return { objectId: b.objectId, threadIndex: b.threadIndex, stitches };
  });

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
