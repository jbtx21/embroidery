/**
 * The order of the objects inside one colour block, by what it does to the thread (spec §10.1, §10.2.1).
 *
 * `sequenceByColour` fixes the colour blocks and puts the objects of a block in the order of the nearest
 * outline next. What that order costs is decided later, by Ink/Stitch's stitches and the rule of §10.2.1:
 * a connection between two objects of one colour is not cut when it is hidden (at most 1 mm of it on bare
 * fabric) and at most 7 mm long. Where the objects begin and end is not the outline gap, though — Ink/Stitch
 * decides that from what it reads (`lib/stitches/auto_satin.py`, `lib/elements/fill_stitch.py`), and the
 * model below repeats it:
 *
 * - **satin**: neighbouring satin objects form a run, one `auto_satin` call. Inside it the jump between two
 *   columns is the shortest one between the 1 mm chunk nodes of their centre lines, so object X leaves from
 *   its LAST column towards the FIRST column of the next. A run starts at the leftmost node of its first
 *   column and ends at the rightmost node of its last column.
 * - **running**: the lines in their order, from the start of the first to the end of the last. The template
 *   may write them the other way round (`RouteResult.flip`), which swaps the two ends.
 * - **tatami**: starts at the point nearest to the end of the object before and ends at the point of its own
 *   shape nearest to the next object.
 *
 * The cost of the step X → Y is 1000 for a cut (more than `VISIBLE_MAX_MM` of the line from the end of X to the
 * start of Y on bare fabric, or longer than `HIDDEN_STITCH_MAX_MM`), 150 for a hidden jump with lock stitches
 * (over `PLAIN_STITCH_MM` up to `HIDDEN_JUMP_MAX_MM`), and the length in mm besides — the thresholds are the ones
 * `planTrims` decides by (`trims.ts`). "Bare" is what no later stitch and no earlier stitch of the same
 * colour covers; that does not depend on the order inside the block, so it is measured once per block on a
 * raster of 0.1 mm. Measured against what Ink/Stitch wrote for four logos (452 connections of 1 mm and more) the
 * model says cut or not cut right in 97 % of them.
 *
 * The order inside a block is then the cheapest one the constraints allow: overlapping objects keep their
 * order from the design (the overlap DAG of `coverPrecedence`), and the stage rule of §10.1 stays as
 * `sequenceByColour` applies it (an object may only go while no free object of a lower stage waits). The
 * search is deterministic: nearest neighbour from every possible start, then or-opt, reversal of a stretch
 * and the direction of running objects, first improvement in a fixed order, ties to the lower index.
 */
import type { Point, Polygon, Polyline } from "@texma-stitch/geometry";
import {
  cumulativeLengths,
  pointAtFraction,
  pointInPolygon,
  polygonBbox,
} from "@texma-stitch/geometry";
import { colourKey } from "./sequence.js";
import {
  HIDDEN_JUMP_MAX_MM,
  HIDDEN_STITCH_MAX_MM,
  PLAIN_STITCH_MM,
  THREAD_REACH_MM,
  VISIBLE_MAX_MM,
} from "./trims.js";

/** One object of the template, as far as the order of its connections goes. */
export type RouteNode = {
  kind: "tatami" | "satin" | "running";
  colour: string;
  /** Stage within a colour (spec §10.1): 0 areas, 1 satin, 3 lines. */
  rank: number;
  /** What it lies on — the outline of its shape. */
  cover: Polygon | undefined;
  /** running: the lines as they are stitched, the first first. */
  lines?: Polyline[];
  /** satin: the columns in stitch order. */
  columns?: { railA: Polyline; railB: Polyline }[];
};

export type RouteOptions = {
  /** Cost of a cut. Default 1000. */
  cutCost?: number;
  /** Cost of a hidden jump with lock stitches. Default 150. */
  jumpCost?: number;
  /**
   * Keep the stage rule of §10.1 (areas, then satin, then lines). Default true. Off, the stage only rules
   * where an overlap makes it so — a measurement, not what §10.1 says.
   */
  stageRule?: boolean;
};

/** One step between two objects of a block, as the model sees it (for checks against what Ink/Stitch wrote). */
export type RouteStep = {
  from: number;
  to: number;
  lengthMm: number;
  blankMm: number;
  cut: boolean;
};

export type RouteResult = {
  /** Indices into the nodes, in stitch order; the colour blocks are the ones of the order that came in. */
  order: number[];
  /** Per node: the running object is stitched from its last point to its first. */
  flip: boolean[];
  /** The cuts the model expects in the order that came in and in the one that comes out (steps between objects). */
  cuts: { before: number; after: number };
  /** Every step of the order that came in and of the one that comes out. */
  steps: { before: RouteStep[]; after: RouteStep[] };
};

/** Raster of the covered area, mm. */
const RES = 0.1;
/** What a stitch covers beyond the outline of its shape: a thread this close to it is hidden. */
const COVER_REACH_PX = 2;
/** Ink/Stitch cuts a satin into chunks of this length for its route. */
const NODE_MM = 1;

// ---------------------------------------------------------------------------
// The covered area, as a raster
// ---------------------------------------------------------------------------

class Mask {
  readonly data: Uint8Array;
  constructor(
    readonly x0: number,
    readonly y0: number,
    readonly w: number,
    readonly h: number,
  ) {
    this.data = new Uint8Array(w * h);
  }

  /** Even-odd scanline fill of a polygon with its holes. */
  paintPolygon(poly: Polygon): void {
    const bb = polygonBbox(poly);
    const j0 = Math.max(0, Math.ceil((bb.minY - this.y0) / RES));
    const j1 = Math.min(this.h - 1, Math.floor((bb.maxY - this.y0) / RES));
    if (j1 < j0) return;
    const rows: number[][] = Array.from({ length: j1 - j0 + 1 }, () => []);
    for (const ring of [poly.outer, ...poly.holes]) {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i]!;
        const b = ring[(i + 1) % ring.length]!;
        if (a.y === b.y) continue;
        const lo = Math.min(a.y, b.y);
        const hi = Math.max(a.y, b.y);
        const from = Math.max(j0, Math.ceil((lo - this.y0) / RES));
        const to = Math.min(j1, Math.floor((hi - this.y0) / RES));
        for (let j = from; j <= to; j++) {
          const y = this.y0 + j * RES;
          if (lo <= y && y < hi) rows[j - j0]!.push(a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y));
        }
      }
    }
    rows.forEach((xs, k) => {
      xs.sort((p, q) => p - q);
      const row = (j0 + k) * this.w;
      for (let m = 0; m + 1 < xs.length; m += 2) {
        const i0 = Math.max(0, Math.ceil((xs[m]! - this.x0) / RES));
        const i1 = Math.min(this.w - 1, Math.floor((xs[m + 1]! - this.x0) / RES));
        for (let i = i0; i <= i1; i++) this.data[row + i] = 1;
      }
    });
  }

  /** A stroke of the given half width along a polyline. */
  paintLine(line: Polyline, reach: number): void {
    const r2 = reach * reach;
    for (let s = 0; s + 1 < line.length; s++) {
      const a = line[s]!;
      const b = line[s + 1]!;
      const i0 = Math.max(0, Math.floor((Math.min(a.x, b.x) - reach - this.x0) / RES));
      const i1 = Math.min(this.w - 1, Math.ceil((Math.max(a.x, b.x) + reach - this.x0) / RES));
      const j0 = Math.max(0, Math.floor((Math.min(a.y, b.y) - reach - this.y0) / RES));
      const j1 = Math.min(this.h - 1, Math.ceil((Math.max(a.y, b.y) + reach - this.y0) / RES));
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const l2 = dx * dx + dy * dy;
      for (let j = j0; j <= j1; j++) {
        const y = this.y0 + j * RES;
        for (let i = i0; i <= i1; i++) {
          const x = this.x0 + i * RES;
          const t =
            l2 < 1e-18 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / l2));
          const ex = x - (a.x + t * dx);
          const ey = y - (a.y + t * dy);
          if (ex * ex + ey * ey <= r2) this.data[j * this.w + i] = 1;
        }
      }
    }
  }

  /** Grows what is set by `px` pixels in every direction (a square, two passes). */
  dilate(px: number): void {
    if (px <= 0) return;
    const { w, h } = this;
    const tmp = new Uint8Array(w * h);
    for (let j = 0; j < h; j++) {
      const row = j * w;
      // every pixel within px of a set one in its row
      let seen = -Infinity;
      for (let i = 0; i < w; i++) {
        if (this.data[row + i]) seen = i;
        if (i - seen <= px) tmp[row + i] = 1;
      }
      seen = Infinity;
      for (let i = w - 1; i >= 0; i--) {
        if (this.data[row + i]) seen = i;
        if (seen - i <= px) tmp[row + i] = 1;
      }
    }
    for (let i = 0; i < w; i++) {
      let seen = -Infinity;
      for (let j = 0; j < h; j++) {
        if (tmp[j * w + i]) seen = j;
        this.data[j * w + i] = j - seen <= px ? 1 : 0;
      }
      seen = Infinity;
      for (let j = h - 1; j >= 0; j--) {
        if (tmp[j * w + i]) seen = j;
        if (seen - j <= px) this.data[j * w + i] = 1;
      }
    }
  }

  or(other: Mask): void {
    for (let k = 0; k < this.data.length; k++) if (other.data[k]) this.data[k] = 1;
  }

  clone(): Mask {
    const m = new Mask(this.x0, this.y0, this.w, this.h);
    m.data.set(this.data);
    return m;
  }

  /** The length of the line from p to q that no stitch covers, mm. */
  blank(p: Point, q: Point): number {
    const n = Math.hypot(q.x - p.x, q.y - p.y);
    if (n < 1e-9) return 0;
    const steps = Math.max(2, Math.ceil(n / (RES / 2)));
    let bare = 0;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const i = Math.round((p.x + (q.x - p.x) * t - this.x0) / RES);
      const j = Math.round((p.y + (q.y - p.y) * t - this.y0) / RES);
      const covered =
        i >= 0 && i < this.w && j >= 0 && j < this.h && this.data[j * this.w + i] === 1;
      if (!covered) bare++;
    }
    return (bare / (steps + 1)) * n;
  }
}

// ---------------------------------------------------------------------------
// Ports: where an object begins and ends
// ---------------------------------------------------------------------------

type Prepared = {
  node: RouteNode;
  /** satin: the nodes of the first and of the last column's centre line. */
  first?: Point[];
  last?: Point[];
  /** running: first and last point as written. */
  start?: Point;
  end?: Point;
  /** The stitched area's outline points and edges, for the nearest point. */
  rings: Point[][];
  lines: Polyline[];
};

const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

function centreLine(railA: Polyline, railB: Polyline): Polyline {
  const lenOf = (r: Polyline): number => {
    const c = cumulativeLengths(r);
    return c[c.length - 1] ?? 0;
  };
  const m = Math.max(8, Math.ceil(Math.max(lenOf(railA), lenOf(railB)) / 0.25));
  const ca = cumulativeLengths(railA);
  const cb = cumulativeLengths(railB);
  const out: Polyline = [];
  for (let k = 0; k < m; k++) {
    const a = pointAtFraction(railA, k / (m - 1), ca);
    const b = pointAtFraction(railB, k / (m - 1), cb);
    out.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  }
  return out;
}

/** The chunk nodes `auto_satin` makes of a column: 1 mm apart or less, the ends included. */
function chunkNodes(line: Polyline): Point[] {
  const cum = cumulativeLengths(line);
  const total = cum[cum.length - 1] ?? 0;
  const n = Math.max(1, Math.ceil(total / NODE_MM));
  const out: Point[] = [];
  for (let k = 0; k <= n; k++) out.push(pointAtFraction(line, k / n, cum));
  return out;
}

function prepare(given: RouteNode): Prepared {
  // A satin without columns or a running object without lines has no ends of its own: it is an area then.
  const hasColumns =
    given.kind === "satin" && given.columns !== undefined && given.columns.length > 0;
  const hasLines =
    given.kind === "running" && given.lines !== undefined && given.lines.some((l) => l.length > 0);
  const node: RouteNode =
    given.kind === "tatami" || hasColumns || hasLines ? given : { ...given, kind: "tatami" };
  const rings = node.cover === undefined ? [] : [node.cover.outer, ...node.cover.holes];
  const p: Prepared = { node, rings, lines: node.lines ?? [] };
  if (hasColumns) {
    const cols = node.columns!;
    p.first = chunkNodes(centreLine(cols[0]!.railA, cols[0]!.railB));
    const lastCol = cols[cols.length - 1]!;
    p.last = chunkNodes(centreLine(lastCol.railA, lastCol.railB));
  }
  if (hasLines) {
    const lines = node.lines!.filter((l) => l.length > 0);
    p.start = lines[0]![0]!;
    const lastLine = lines[lines.length - 1]!;
    p.end = lastLine[lastLine.length - 1]!;
    p.lines = lines;
  }
  return p;
}

const leftmost = (pts: Point[]): Point => pts.reduce((b, p) => (p.x < b.x ? p : b));
const rightmost = (pts: Point[]): Point => pts.reduce((b, p) => (p.x > b.x ? p : b));

function nearestPair(a: Point[], b: Point[]): [Point, Point] {
  let best = Infinity;
  let pa = a[0]!;
  let pb = b[0]!;
  for (const p of a) {
    for (const q of b) {
      const d = (p.x - q.x) ** 2 + (p.y - q.y) ** 2;
      if (d < best) {
        best = d;
        pa = p;
        pb = q;
      }
    }
  }
  return [pa, pb];
}

function segmentNearest(p: Point, a: Point, b: Point): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 < 1e-18 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return { x: a.x + t * dx, y: a.y + t * dy };
}

/** The point of the object's stitched area nearest to `p` (`p` itself where it lies on it). */
function nearestOn(o: Prepared, p: Point): Point {
  if (o.node.kind !== "running" && o.node.cover !== undefined && pointInPolygon(o.node.cover, p))
    return p;
  let best = Infinity;
  let at = p;
  const visit = (a: Point, b: Point): void => {
    const q = segmentNearest(p, a, b);
    const d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
    if (d < best) {
      best = d;
      at = q;
    }
  };
  if (o.node.kind === "running") {
    for (const line of o.lines)
      for (let i = 0; i + 1 < line.length; i++) visit(line[i]!, line[i + 1]!);
  } else {
    for (const ring of o.rings)
      for (let i = 0; i < ring.length; i++) visit(ring[i]!, ring[(i + 1) % ring.length]!);
  }
  return at;
}

/** The two areas' nearest points — a long ring is measured from a spread of its corners. */
function nearestAreas(a: Prepared, b: Prepared): [Point, Point] {
  let best = Infinity;
  let pa: Point = a.rings[0]?.[0] ?? { x: 0, y: 0 };
  let pb: Point = b.rings[0]?.[0] ?? { x: 0, y: 0 };
  for (const [from, to, swap] of [
    [a, b, false],
    [b, a, true],
  ] as const) {
    for (const ring of from.rings) {
      const step = Math.max(1, Math.ceil(ring.length / 96));
      for (let k = 0; k < ring.length; k += step) {
        const q = nearestOn(to, ring[k]!);
        const d = (q.x - ring[k]!.x) ** 2 + (q.y - ring[k]!.y) ** 2;
        if (d < best) {
          best = d;
          if (swap) {
            pa = q;
            pb = ring[k]!;
          } else {
            pa = ring[k]!;
            pb = q;
          }
        }
      }
    }
  }
  return [pa, pb];
}

/** The last stitch of X and the first of Y, by the rules of the module doc. */
function connection(x: Prepared, y: Prepared, fx: boolean, fy: boolean): [Point, Point] {
  const xEnd = (): Point => (fx ? x.start! : x.end!);
  const yStart = (): Point => (fy ? y.end! : y.start!);
  if (x.node.kind === "satin" && y.node.kind === "satin") return nearestPair(x.last!, y.first!);
  if (x.node.kind === "satin") {
    const p = rightmost(x.last!);
    return [p, y.node.kind === "running" ? yStart() : nearestOn(y, p)];
  }
  if (y.node.kind === "satin") {
    const q = leftmost(y.first!);
    return [x.node.kind === "running" ? xEnd() : nearestOn(x, q), q];
  }
  if (x.node.kind === "running" && y.node.kind === "running") return [xEnd(), yStart()];
  if (x.node.kind === "running") return [xEnd(), nearestOn(y, xEnd())];
  if (y.node.kind === "running") return [nearestOn(x, yStart()), yStart()];
  return nearestAreas(x, y);
}

// ---------------------------------------------------------------------------
// One colour block
// ---------------------------------------------------------------------------

/** Transitive closure of "has to come before", as one row of booleans per node. */
function closure(n: number, edges: [number, number][]): Uint8Array {
  const reach = new Uint8Array(n * n);
  for (const [a, b] of edges) reach[a * n + b] = 1;
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < n; i++) {
      if (!reach[i * n + k]) continue;
      for (let j = 0; j < n; j++) if (reach[k * n + j]) reach[i * n + j] = 1;
    }
  }
  return reach;
}

class Block {
  readonly n: number;
  readonly reach: Uint8Array;
  readonly stage: number[];
  readonly flippable: boolean[];
  readonly ori: number[];
  /** Cost of a → b with a in orientation oa, b in ob: index ((a * n + b) * 2 + oa) * 2 + ob. */
  readonly c4: Float64Array;
  c: Float64Array;
  readonly cut: number;
  readonly stageRule: boolean;

  constructor(
    prepared: Prepared[],
    members: number[],
    after: number[][],
    mask: Mask,
    opts: Required<RouteOptions>,
  ) {
    const n = (this.n = members.length);
    const index = new Map(members.map((m, k) => [m, k]));
    const edges: [number, number][] = [];
    for (const m of members)
      for (const j of after[m]!) if (index.has(j)) edges.push([index.get(m)!, index.get(j)!]);
    this.reach = closure(n, edges);
    this.stage = members.map((m) => prepared[m]!.node.rank);
    this.flippable = members.map(
      (m) => prepared[m]!.node.kind === "running" && prepared[m]!.start !== undefined,
    );
    this.ori = new Array<number>(n).fill(0);
    this.cut = opts.cutCost;
    this.stageRule = opts.stageRule;
    this.c4 = new Float64Array(n * n * 4);
    for (let a = 0; a < n; a++) {
      for (let b = 0; b < n; b++) {
        if (a === b) continue;
        const x = prepared[members[a]!]!;
        const y = prepared[members[b]!]!;
        for (let oa = 0; oa < (this.flippable[a] ? 2 : 1); oa++) {
          for (let ob = 0; ob < (this.flippable[b] ? 2 : 1); ob++) {
            this.c4[((a * n + b) * 2 + oa) * 2 + ob] = this.step(
              x,
              y,
              oa === 1,
              ob === 1,
              mask,
              opts,
            );
          }
        }
        for (let oa = 0; oa < 2; oa++) {
          for (let ob = 0; ob < 2; ob++) {
            const sa = this.flippable[a] ? oa : 0;
            const sb = this.flippable[b] ? ob : 0;
            this.c4[((a * n + b) * 2 + oa) * 2 + ob] = this.c4[((a * n + b) * 2 + sa) * 2 + sb]!;
          }
        }
      }
    }
    this.c = new Float64Array(n * n);
    this.rebuild();
  }

  private step(
    x: Prepared,
    y: Prepared,
    fx: boolean,
    fy: boolean,
    mask: Mask,
    opts: Required<RouteOptions>,
  ): number {
    const [p, q] = connection(x, y, fx, fy);
    const len = dist(p, q);
    if (len > HIDDEN_STITCH_MAX_MM) return opts.cutCost + len;
    if (mask.blank(p, q) > VISIBLE_MAX_MM) return opts.cutCost + len;
    return (len > PLAIN_STITCH_MM && len <= HIDDEN_JUMP_MAX_MM ? opts.jumpCost : 0) + len;
  }

  /** Length and bare length of the step a → b in the orientations given. */
  measure(
    x: Prepared,
    y: Prepared,
    fx: boolean,
    fy: boolean,
    mask: Mask,
  ): { len: number; blank: number } {
    const [p, q] = connection(x, y, fx, fy);
    return { len: dist(p, q), blank: mask.blank(p, q) };
  }

  rebuild(): void {
    const n = this.n;
    for (let a = 0; a < n; a++) {
      for (let b = 0; b < n; b++) {
        if (a !== b)
          this.c[a * n + b] = this.c4[((a * n + b) * 2 + this.ori[a]!) * 2 + this.ori[b]!]!;
      }
    }
  }

  total(order: number[]): number {
    let sum = 0;
    for (let t = 0; t + 1 < order.length; t++) sum += this.c[order[t]! * this.n + order[t + 1]!]!;
    return sum;
  }

  cuts(order: number[]): number {
    let k = 0;
    for (let t = 0; t + 1 < order.length; t++)
      if (this.c[order[t]! * this.n + order[t + 1]!]! >= this.cut) k++;
    return k;
  }

  /** The stage rule of §10.1 as `sequenceByColour` applies it: nothing goes while a free object of a lower stage waits. */
  stageOk(order: number[]): boolean {
    if (!this.stageRule) return true;
    const n = this.n;
    const pos = new Array<number>(n).fill(0);
    order.forEach((v, t) => (pos[v] = t));
    for (let a = 0; a < n; a++) {
      let latest = -1;
      for (let u = 0; u < n; u++) if (this.reach[u * n + a] && pos[u]! > latest) latest = pos[u]!;
      for (let t = latest + 1; t < pos[a]!; t++)
        if (this.stage[order[t]!]! > this.stage[a]!) return false;
    }
    return true;
  }

  private hasPred(j: number, done: boolean[]): boolean {
    for (let i = 0; i < this.n; i++)
      if (i !== j && !done[i] && this.reach[i * this.n + j]) return true;
    return false;
  }

  /** Nearest neighbour: the cheapest of the free objects of the lowest stage next. */
  greedy(start: number | undefined): number[] {
    const n = this.n;
    const done = new Array<boolean>(n).fill(false);
    const order: number[] = [];
    let cur = -1;
    while (order.length < n) {
      let free: number[] = [];
      for (let j = 0; j < n; j++) if (!done[j] && !this.hasPred(j, done)) free.push(j);
      if (this.stageRule) {
        const low = Math.min(...free.map((j) => this.stage[j]!));
        free = free.filter((j) => this.stage[j] === low);
      }
      let next: number;
      if (cur < 0 && start !== undefined && free.includes(start)) next = start;
      else if (cur < 0) next = free[0]!;
      else {
        next = free[0]!;
        for (const j of free) if (this.c[cur * n + j]! < this.c[cur * n + next]!) next = j;
      }
      order.push(next);
      done[next] = true;
      cur = next;
    }
    return order;
  }

  private moveOk(order: number[], a: number, len: number, k: number): boolean {
    const n = this.n;
    const seg = order.slice(a, a + len);
    const jumped = k > a ? order.slice(a + len, k + len) : order.slice(k, a);
    for (const s of seg) {
      for (const x of jumped) {
        if (k > a ? this.reach[s * n + x] : this.reach[x * n + s]) return false;
      }
    }
    return true;
  }

  /** Or-opt and reversal, the best improving move that keeps the constraints, until none improves. */
  improve(start: number[]): number[] {
    const n = this.n;
    const C = this.c;
    let order = start.slice();
    for (let pass = 0; pass < 200; pass++) {
      const cands: { delta: number; kind: 0 | 1; a: number; b: number; k: number }[] = [];
      for (let len = 1; len <= 3; len++) {
        for (let a = 0; a + len <= n; a++) {
          const s0 = order[a]!;
          const s1 = order[a + len - 1]!;
          const p = a > 0 ? order[a - 1]! : -1;
          const nx = a + len < n ? order[a + len]! : -1;
          const rem = (p >= 0 ? C[p * n + s0]! : 0) + (nx >= 0 ? C[s1 * n + nx]! : 0);
          const add = p >= 0 && nx >= 0 ? C[p * n + nx]! : 0;
          const rest = order.slice(0, a).concat(order.slice(a + len));
          for (let k = 0; k <= rest.length; k++) {
            if (k === a) continue;
            const l = k > 0 ? rest[k - 1]! : -1;
            const r = k < rest.length ? rest[k]! : -1;
            const ins =
              (l >= 0 ? C[l * n + s0]! : 0) +
              (r >= 0 ? C[s1 * n + r]! : 0) -
              (l >= 0 && r >= 0 ? C[l * n + r]! : 0);
            const delta = ins + add - rem;
            if (delta < -1e-9) cands.push({ delta, kind: 0, a, b: len, k });
          }
        }
      }
      for (let a = 0; a + 1 < n; a++) {
        for (let b = a + 1; b < n; b++) {
          const p = a > 0 ? order[a - 1]! : -1;
          const nx = b + 1 < n ? order[b + 1]! : -1;
          const old = (p >= 0 ? C[p * n + order[a]!]! : 0) + (nx >= 0 ? C[order[b]! * n + nx]! : 0);
          const fresh =
            (p >= 0 ? C[p * n + order[b]!]! : 0) + (nx >= 0 ? C[order[a]! * n + nx]! : 0);
          let inOld = 0;
          let inNew = 0;
          for (let t = a; t < b; t++) {
            inOld += C[order[t]! * n + order[t + 1]!]!;
            inNew += C[order[t + 1]! * n + order[t]!]!;
          }
          const delta = fresh + inNew - old - inOld;
          if (delta < -1e-9) cands.push({ delta, kind: 1, a, b, k: 0 });
        }
      }
      cands.sort((p, q) => p.delta - q.delta);
      let applied = false;
      for (const c of cands.slice(0, 400)) {
        let cand: number[];
        if (c.kind === 0) {
          if (!this.moveOk(order, c.a, c.b, c.k)) continue;
          const seg = order.slice(c.a, c.a + c.b);
          const rest = order.slice(0, c.a).concat(order.slice(c.a + c.b));
          cand = rest.slice(0, c.k).concat(seg, rest.slice(c.k));
        } else {
          const seg = order.slice(c.a, c.b + 1);
          let bound = false;
          for (const u of seg) for (const v of seg) if (this.reach[u * n + v]) bound = true;
          if (bound) continue;
          cand = order.slice(0, c.a).concat(seg.reverse(), order.slice(c.b + 1));
        }
        if (!this.stageOk(cand)) continue;
        order = cand;
        applied = true;
        break;
      }
      if (!applied) break;
    }
    return order;
  }

  /** The best direction of every running object for a fixed order (Viterbi). */
  orient(order: number[]): void {
    const n = this.n;
    const states = order.map((v) => (this.flippable[v] ? [0, 1] : [0]));
    let cost = states[0]!.map(() => 0);
    const back: number[][] = [[]];
    for (let t = 1; t < order.length; t++) {
      const a = order[t - 1]!;
      const b = order[t]!;
      const next: number[] = [];
      const from: number[] = [];
      for (const ob of states[t]!) {
        let best = Infinity;
        let arg = 0;
        states[t - 1]!.forEach((oa, ia) => {
          const c = cost[ia]! + this.c4[((a * n + b) * 2 + oa) * 2 + ob]!;
          if (c < best - 1e-9) {
            best = c;
            arg = ia;
          }
        });
        next.push(best);
        from.push(arg);
      }
      cost = next;
      back.push(from);
    }
    let at = 0;
    for (let i = 1; i < cost.length; i++) if (cost[i]! < cost[at]! - 1e-9) at = i;
    for (let t = order.length - 1; t >= 0; t--) {
      this.ori[order[t]!] = states[t]![at]!;
      if (t > 0) at = back[t]![at]!;
    }
    this.rebuild();
  }

  solve(base: number[]): number[] {
    const n = this.n;
    const pool: number[][] = this.stageOk(base) ? [base] : [];
    const starts: (number | undefined)[] = [undefined];
    for (let j = 0; j < n; j++) {
      let source = true;
      for (let i = 0; i < n; i++) if (this.reach[i * n + j]) source = false;
      if (source) starts.push(j);
    }
    for (const s of starts) pool.push(this.greedy(s));
    let best: { cost: number; order: number[]; ori: number[] } | undefined;
    const seen = new Set<string>();
    for (const cand of pool) {
      const key = cand.join(",");
      if (seen.has(key)) continue;
      seen.add(key);
      let o = this.improve(cand);
      if (this.flippable.some((f) => f)) {
        for (let round = 0; round < 4; round++) {
          this.orient(o);
          const o2 = this.improve(o);
          if (o2.join(",") === o.join(",")) break;
          o = o2;
        }
        this.orient(o);
      }
      const cost = this.total(o);
      if (best === undefined || cost < best.cost - 1e-9)
        best = { cost, order: o, ori: this.ori.slice() };
    }
    this.ori.splice(0, n, ...best!.ori);
    this.rebuild();
    return best!.order;
  }
}

// ---------------------------------------------------------------------------
// All blocks
// ---------------------------------------------------------------------------

/**
 * Reorders the objects inside every colour block of `order` (module doc). `after[i]` lists what has to come after
 * `i` (the overlaps, `coverPrecedence`); the blocks, and with them the colour sequence, stay as they are.
 */
export function routeBlocks(
  nodes: RouteNode[],
  order: number[],
  after: number[][],
  options: RouteOptions = {},
): RouteResult {
  const opts: Required<RouteOptions> = {
    cutCost: 1000,
    jumpCost: 150,
    stageRule: true,
    ...options,
  };
  const flip = new Array<boolean>(nodes.length).fill(false);
  if (nodes.length === 0) {
    return { order: [], flip, cuts: { before: 0, after: 0 }, steps: { before: [], after: [] } };
  }

  // The blocks of the order that came in.
  const blocks: number[][] = [];
  let last: string | undefined;
  for (const i of order) {
    const key = colourKey(nodes[i]!.colour);
    if (key !== last) blocks.push([]);
    last = key;
    blocks[blocks.length - 1]!.push(i);
  }

  // Raster over everything.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const nd of nodes) {
    const pts = nd.kind === "running" ? (nd.lines ?? []).flat() : (nd.cover?.outer ?? []);
    for (const p of pts) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }
  const pad = 2;
  const make = (): Mask =>
    new Mask(
      minX - pad,
      minY - pad,
      Math.ceil((maxX - minX + 2 * pad) / RES) + 1,
      Math.ceil((maxY - minY + 2 * pad) / RES) + 1,
    );

  // One mask per block: what its objects cover. Thread of block k is hidden by the blocks from k on and by the earlier
  // blocks of its own colour.
  const masks = blocks.map((members) => {
    const m = make();
    const lines = make();
    for (const i of members) {
      const nd = nodes[i]!;
      if (nd.kind === "running")
        for (const l of nd.lines ?? []) lines.paintLine(l, THREAD_REACH_MM);
      else if (nd.cover !== undefined) m.paintPolygon(nd.cover);
    }
    m.dilate(COVER_REACH_PX);
    m.or(lines);
    return m;
  });
  const suffix: Mask[] = new Array<Mask>(blocks.length);
  for (let k = blocks.length - 1; k >= 0; k--) {
    const mask = masks[k]!.clone();
    if (k + 1 < blocks.length) mask.or(suffix[k + 1]!);
    suffix[k] = mask;
  }
  const byColour = new Map<string, Mask>();

  const prepared = nodes.map(prepare);
  const out: number[] = [];
  const stepsBefore: RouteStep[] = [];
  const stepsAfter: RouteStep[] = [];
  let before = 0;
  let afterCuts = 0;
  blocks.forEach((members, k) => {
    const key = colourKey(nodes[members[0]!]!.colour);
    const mask = suffix[k]!.clone();
    const earlier = byColour.get(key);
    if (earlier !== undefined) mask.or(earlier);
    const block = new Block(prepared, members, after, mask, opts);
    const base = members.map((_, i) => i);
    before += block.cuts(base);
    const explain = (seq: number[], ori: number[], into: RouteStep[]): void => {
      for (let t = 0; t + 1 < seq.length; t++) {
        const a = seq[t]!;
        const b = seq[t + 1]!;
        const m = block.measure(
          prepared[members[a]!]!,
          prepared[members[b]!]!,
          ori[a] === 1,
          ori[b] === 1,
          mask,
        );
        into.push({
          from: members[a]!,
          to: members[b]!,
          lengthMm: m.len,
          blankMm: m.blank,
          cut: m.len > HIDDEN_STITCH_MAX_MM || m.blank > VISIBLE_MAX_MM,
        });
      }
    };
    explain(
      base,
      base.map(() => 0),
      stepsBefore,
    );
    const best = members.length > 1 ? block.solve(base) : base;
    explain(best, block.ori, stepsAfter);
    afterCuts += block.cuts(best);
    for (const v of best) {
      out.push(members[v]!);
      flip[members[v]!] = block.ori[v] === 1;
    }
    const own = byColour.get(key) ?? make();
    own.or(masks[k]!);
    byColour.set(key, own);
  });
  return {
    order: out,
    flip,
    cuts: { before, after: afterCuts },
    steps: { before: stepsBefore, after: stepsAfter },
  };
}
