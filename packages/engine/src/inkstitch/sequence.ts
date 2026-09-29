/**
 * Stitch order of the Ink/Stitch template by colour (spec §10.1): the same
 * colour is stitched in one block wherever the overlaps allow it.
 *
 * Two objects that overlap keep their order from the design (the later one lies
 * on top — the knockdown of §4.1 builds on that), whatever their colours;
 * everything else may be regrouped. That makes the order a topological sort over
 * the overlaps, and the question is how few colour blocks one can have.
 *
 * Inside one block the outcome does not depend on the order: a block takes every
 * object of its colour that is free to go, and what it frees goes with it. So the
 * fewest blocks are found by looking at the colour sequences — breadth first over
 * the sets of objects done, which is a small space for a logo (a few colours, a
 * hundred objects) and gives the exact minimum where a greedy choice of the next
 * colour does not. Inside a block the order is `autoOrder`'s (spec §10.1): areas
 * before satin before lines, and among those the nearest object next — nearest
 * measured from outline to outline, because a fill ends towards the next object
 * and touching objects need no jump at all.
 */
import type { Polygon } from "@texma-stitch/geometry";
import { pointInPolygon, rings } from "@texma-stitch/geometry";
import { coverPrecedence } from "../order.js";

/** One object of the template, as far as its order goes. */
export type SequenceNode = {
  /** The colour it is stitched in. */
  colour: string;
  /** Stage within a colour (spec §10.1): 0 areas, 1 satin, 3 lines. */
  rank: number;
  /** What it lies on — the outline of its shape; `undefined` binds nothing. */
  cover: Polygon | undefined;
};

export type SequenceOptions = {
  /** An overlap under this area (mm²) does not bind the order. Default: any overlap does (spec §10.1). */
  minOverlapMm2?: number;
};

export type SequenceResult = {
  /** Indices into the nodes, in stitch order. */
  order: number[];
  /** Colour blocks the order makes. */
  blocks: number;
  /** The fewest blocks any order can make, given the overlaps (`blockLowerBound`). */
  lowerBound: number;
};

/** Two spellings of one colour are one colour: `#BEBEBE`, `#bebebe`, `#BBB`→`#bbbbbb`. */
export function colourKey(colour: string): string {
  const c = colour.trim().toLowerCase();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(c);
  return short ? `#${short[1]!.repeat(2)}${short[2]!.repeat(2)}${short[3]!.repeat(2)}` : c;
}

/** Colour blocks of a list of colours in stitch order: a run of one colour is one block. */
export function colourBlockCount(colours: string[]): number {
  let blocks = 0;
  let last: string | undefined;
  for (const colour of colours) {
    const key = colourKey(colour);
    if (key !== last) blocks++;
    last = key;
  }
  return blocks;
}

/**
 * The fewest colour blocks any order can make. Along a chain of overlaps the
 * order is fixed, and every change of colour on it is a block boundary; so it is
 * one more than the most changes on one chain — and never fewer than there are
 * colours. `colourOf` numbers the colours, `after[i]` lists what has to come
 * after `i`.
 */
export function blockLowerBound(colourOf: number[], after: number[][]): number {
  const n = colourOf.length;
  if (n === 0) return 0;
  const indegree = new Array<number>(n).fill(0);
  for (const list of after) for (const j of list) indegree[j]!++;
  const changes = new Array<number>(n).fill(0);
  const queue: number[] = [];
  for (let i = 0; i < n; i++) if (indegree[i] === 0) queue.push(i);
  let most = 0;
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head]!;
    most = Math.max(most, changes[i]!);
    for (const j of after[i]!) {
      changes[j] = Math.max(changes[j]!, changes[i]! + (colourOf[i] === colourOf[j] ? 0 : 1));
      if (--indegree[j]! === 0) queue.push(j);
    }
  }
  return Math.max(new Set(colourOf).size, most + 1);
}

/** More states than this in one step and the least advanced are dropped (a logo has far fewer). */
const MAX_STATES = 5000;

/**
 * The colour of every block, in order, for the fewest blocks (module doc).
 * `colourOf` numbers the colours (the order they first appear in is the order
 * they are tried, which decides between equally good plans), `after[i]` lists
 * what has to come after `i`. Empty when the overlaps contradict each other.
 */
export function blockPlan(colourOf: number[], after: number[][]): number[] {
  const n = colourOf.length;
  if (n === 0) return [];
  const before: number[][] = colourOf.map(() => []);
  after.forEach((list, i) => list.forEach((j) => before[j]!.push(i)));
  const colours = [...new Set(colourOf)];

  /** Everything of colour `c` that can go from `done` on with no other colour in between. */
  const block = (done: Uint8Array, c: number): Uint8Array | undefined => {
    const next = done.slice();
    let added = false;
    for (let changed = true; changed;) {
      changed = false;
      for (let i = 0; i < n; i++) {
        if (colourOf[i] !== c || next[i] === 1) continue;
        if (!before[i]!.every((p) => next[p] === 1)) continue;
        next[i] = 1;
        added = true;
        changed = true;
      }
    }
    return added ? next : undefined;
  };

  type State = { key: string; done: Uint8Array };
  const start = new Uint8Array(n);
  const startKey = start.join("");
  const seen = new Map<string, { parent: string; colour: number }>();
  let layer: State[] = [{ key: startKey, done: start }];
  while (layer.length > 0) {
    const next: State[] = [];
    for (const state of layer) {
      for (const c of colours) {
        const grown = block(state.done, c);
        if (grown === undefined) continue;
        const key = grown.join("");
        if (key === startKey || seen.has(key)) continue;
        seen.set(key, { parent: state.key, colour: c });
        if (grown.every((v) => v === 1)) {
          const plan: number[] = [];
          for (let k: string = key; k !== startKey; k = seen.get(k)!.parent) {
            plan.push(seen.get(k)!.colour);
          }
          return plan.reverse();
        }
        next.push({ key, done: grown });
      }
    }
    if (next.length > MAX_STATES) {
      const count = (d: Uint8Array): number => d.reduce((sum, v) => sum + v, 0);
      layer = next
        .map((s, i) => ({ s, i, done: count(s.done) }))
        .sort((a, b) => b.done - a.done || a.i - b.i)
        .slice(0, MAX_STATES)
        .map((x) => x.s);
    } else layer = next;
  }
  return [];
}

// ---------------------------------------------------------------------------
// Nearness
// ---------------------------------------------------------------------------

type Pt = { x: number; y: number };
type Box = { minX: number; minY: number; maxX: number; maxY: number };
type Ring = { pts: Pt[]; box: Box };
type Shape = { polygon: Polygon; rings: Ring[]; box: Box; centre: Pt };

const boxOf = (pts: Pt[]): Box => {
  const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const p of pts) {
    box.minX = Math.min(box.minX, p.x);
    box.minY = Math.min(box.minY, p.y);
    box.maxX = Math.max(box.maxX, p.x);
    box.maxY = Math.max(box.maxY, p.y);
  }
  return box;
};

/** How far two boxes are apart, 0 where they meet. */
const boxGap = (a: Box, b: Box): number =>
  Math.hypot(
    Math.max(0, a.minX - b.maxX, b.minX - a.maxX),
    Math.max(0, a.minY - b.maxY, b.minY - a.maxY),
  );

const distToBox = (p: Pt, b: Box): number =>
  Math.hypot(Math.max(0, b.minX - p.x, p.x - b.maxX), Math.max(0, b.minY - p.y, p.y - b.maxY));

function shapeOf(polygon: Polygon): Shape {
  const rs = rings(polygon).map((pts) => ({ pts, box: boxOf(pts) }));
  const box = boxOf(polygon.outer);
  return {
    polygon,
    rings: rs,
    box,
    centre: { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 },
  };
}

function pointToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 < 1e-18 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** A ring this long is measured from this many of its corners, evenly spread — a logo's outline has thousands. */
const MAX_QUERY_POINTS = 96;

/**
 * Shortest distance between two closed rings that do not cross — always at a
 * corner of one of them — or `below`, if that is less. Long rings are measured
 * from a spread of their corners: the answer is off by at most the spacing of
 * those, which is plenty to say what is near.
 */
function ringGap(a: Ring, b: Ring, below: number): number {
  if (boxGap(a.box, b.box) >= below) return below;
  let best = below;
  for (const [from, to] of [
    [a, b],
    [b, a],
  ] as const) {
    const step = Math.max(1, Math.ceil(from.pts.length / MAX_QUERY_POINTS));
    for (let k = 0; k < from.pts.length; k += step) {
      const p = from.pts[k]!;
      if (distToBox(p, to.box) >= best) continue;
      for (let i = 0; i < to.pts.length; i++) {
        best = Math.min(best, pointToSegment(p, to.pts[i]!, to.pts[(i + 1) % to.pts.length]!));
        if (best < 1e-9) return 0;
      }
    }
  }
  return best;
}

/**
 * Distance between the outlines of two shapes, 0 where they overlap, touch or
 * one lies on the other. Rings that cross without a corner inside the other read
 * as a small distance instead of 0 — good enough to say what is near.
 */
function shapeGap(a: Shape, b: Shape): number {
  if (pointInPolygon(b.polygon, a.polygon.outer[0]!)) return 0;
  if (pointInPolygon(a.polygon, b.polygon.outer[0]!)) return 0;
  let best = Infinity;
  for (const ra of a.rings) {
    for (const rb of b.rings) best = ringGap(ra, rb, best);
    if (best === 0) return 0;
  }
  return best;
}

/**
 * The order of the objects by colour (module doc). Deterministic: equal
 * choices fall to the earlier object of the design.
 */
export function sequenceByColour(
  nodes: SequenceNode[],
  opts: SequenceOptions = {},
): SequenceResult {
  const n = nodes.length;
  if (n === 0) return { order: [], blocks: 0, lowerBound: 0 };

  const after = coverPrecedence(
    nodes.map((x) => x.cover),
    opts.minOverlapMm2,
  );
  const numbers = new Map<string, number>();
  const colourOf = nodes.map((x) => {
    const key = colourKey(x.colour);
    if (!numbers.has(key)) numbers.set(key, numbers.size);
    return numbers.get(key)!;
  });
  const plan = blockPlan(colourOf, after);
  const lowerBound = blockLowerBound(colourOf, after);

  const shapes = nodes.map((x) => (x.cover === undefined ? undefined : shapeOf(x.cover)));
  const gaps = new Map<number, number>();
  const gap = (i: number, j: number): number => {
    const a = shapes[i];
    const b = shapes[j];
    if (a === undefined || b === undefined) return 0;
    const key = Math.min(i, j) * n + Math.max(i, j);
    let g = gaps.get(key);
    if (g === undefined) {
      g = shapeGap(a, b);
      gaps.set(key, g);
    }
    return g;
  };
  /** A lower bound of `gap`, cheap: the boxes. */
  const nearest = (i: number, j: number): number => {
    const a = shapes[i];
    const b = shapes[j];
    return a === undefined || b === undefined ? 0 : boxGap(a.box, b.box);
  };
  const centreGap = (i: number, j: number): number => {
    const a = shapes[i];
    const b = shapes[j];
    return a === undefined || b === undefined
      ? 0
      : Math.hypot(a.centre.x - b.centre.x, a.centre.y - b.centre.y);
  };

  const indegree = new Array<number>(n).fill(0);
  for (const list of after) for (const j of list) indegree[j]!++;
  const done = new Array<boolean>(n).fill(false);
  const order: number[] = [];
  let cursor = -1;
  const take = (i: number): void => {
    done[i] = true;
    order.push(i);
    cursor = i;
    for (const j of after[i]!) indegree[j]!--;
  };

  for (const c of plan) {
    for (;;) {
      // Everything of this colour that is free to go, at the lowest stage there is.
      let stage = Infinity;
      for (let i = 0; i < n; i++) {
        if (!done[i] && indegree[i] === 0 && colourOf[i] === c)
          stage = Math.min(stage, nodes[i]!.rank);
      }
      const free: number[] = [];
      for (let i = 0; i < n; i++) {
        if (!done[i] && indegree[i] === 0 && colourOf[i] === c && nodes[i]!.rank === stage)
          free.push(i);
      }
      if (free.length === 0) break;
      if (cursor < 0) {
        take(free[0]!);
        continue;
      }
      // The nearest one, the outlines measured: the exact gap is only worked out for those
      // whose boxes are not already farther than the best found.
      free.sort((i, j) => nearest(cursor, i) - nearest(cursor, j) || i - j);
      let bestGap = Infinity;
      let tied: number[] = [];
      for (const i of free) {
        if (nearest(cursor, i) > bestGap + 1e-9) break;
        const g = gap(cursor, i);
        if (g < bestGap - 1e-9) {
          bestGap = g;
          tied = [i];
        } else if (Math.abs(g - bestGap) <= 1e-9) tied.push(i);
      }
      // Level in distance: the nearer centre, then the earlier object of the design.
      tied.sort((i, j) => centreGap(cursor, i) - centreGap(cursor, j) || i - j);
      take(tied[0]!);
    }
  }
  // Only a contradiction in the overlaps leaves anything: the design order is the honest rest.
  for (let i = 0; i < n; i++) if (!done[i]) order.push(i);

  return {
    order,
    blocks: colourBlockCount(order.map((i) => nodes[i]!.colour)),
    lowerBound,
  };
}
