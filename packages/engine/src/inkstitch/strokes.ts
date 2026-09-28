/**
 * The strokes of a letter, read off its medial axis — the plan a puncher makes
 * before setting satin columns (ADR 0001, spec §7.7 as reference).
 *
 * A letter is a handful of strokes. Where strokes meet, the pair that runs on
 * most nearly straight passes through (T: the crossbar), everything else ends
 * there and is set under it. Where no pair runs on (L, the top and bottom of an
 * E), the longer stroke runs to the outer edge and the other one ends under it.
 * `columns.ts` turns that plan into rails; this module only decides it.
 *
 * Built from EVERY branch of the axis, not just the long ones. A branch shorter
 * than its own width (`isColumnBranch`) is no stroke of its own — a corner of a
 * square end, a serif, a bump in a vectorised outline — but its outline still
 * belongs to somebody: to the stroke it hangs off (an "appendage"). And a short
 * branch that carries a stroke straight on is that stroke's own tail: the foot
 * of a "4" under its crossbar is shorter than it is wide, and without it the
 * stem would stop at the crossbar.
 *
 * Steps:
 *
 * 0. On request (`splitSharpBends`), a branch that turns sharply — by
 *    `SHARP_BEND_DEG` or more within `SHARP_BEND_REACH` clearances either side,
 *    round a corner of the outline rather than a curve — is two strokes meeting
 *    there. The bottoms of a "w" with blunt feet have no spur into them, only
 *    such a bend.
 * 1. Branch ends that coincide form a node; nodes joined by a branch shorter
 *    than their clearance form ONE junction. The waist of an "8" is two nodes
 *    and a stub between them in the axis, one crossing on paper.
 * 2. A branch that leaves a junction and comes back to it is a ring (O, the
 *    two bowls of an 8).
 * 3. At every junction the most opposing pair of branches passes through, as
 *    long as they meet at `PASS_THROUGH_MIN_DEG` or more; repeated while pairs
 *    are left (an X passes two pairs).
 * 4. Maximal chains are strokes if they are long enough to be a column
 *    (`isStrokeChain`), else appendages of the stroke they hang off. A chain
 *    that comes back to the junction it started from, with no other stroke
 *    there, is a ring with a corner in it.
 * 5. Every stroke end is free (a leaf), abuts a stroke that passes through
 *    there, or meets others at a corner — then the longest one runs on
 *    (`corner`) and the rest abut it. Abutting orders the stitching: what ends
 *    under a stroke is stitched before it.
 */
import type { MedialBranch, Point, Polygon } from "@texma-stitch/geometry";
import {
  angleBetweenDeg,
  arcLength,
  cumulativeLengths,
  dot,
  medialAxis,
  normalize,
  pointAt,
  sub,
} from "@texma-stitch/geometry";
import { isColumnBranch } from "../auto-satin.js";
import type { Warning } from "../types.js";
import { warn, WARNING } from "../warnings.js";

/**
 * Two branches pass through a junction as one stroke when they leave it at
 * least this far apart (part 1 of the satin preparation, measured on T and E:
 * the crossbar of a T runs on at ~161°, the arms of an E meet their stem at
 * 93–100°).
 */
export const PASS_THROUGH_MIN_DEG = 140;
/**
 * Where three or more strokes meet and none runs straight on, the smoothest
 * pair still runs through if it turns by no more than this much less than a
 * straight line: the bowl of an R turns into its bar at ~129°, the arm of a
 * K would never reach it. Two strokes alone at a corner never pair this way —
 * that is an L.
 */
export const SMOOTH_TURN_MIN_DEG = 120;
/**
 * Two strokes that end at the same junction run into each other before the
 * through stroke when they arrive at less than this angle to each other — the
 * arm and leg of a K arrive at ~90°. Arriving from opposite sides they would
 * have passed through as one stroke.
 */
export const CONVERGE_MAX_DEG = 150;
/**
 * A branch between two junctions shorter than their clearance is no stroke,
 * just the gap between two nodes of one crossing: the arm and leg of a K meet a
 * little off the stem, the medial axis of an X or of the crossing in a "4"
 * splits it in two. Only when strokes hang off both nodes, though — the foot of
 * a "4" is just as short, and its far node holds nothing but the corners of its
 * own end (`TINY_MERGE_FACTOR` catches the hair-thin splits regardless).
 */
export const JUNCTION_MERGE_FACTOR = 1.0;
const TINY_MERGE_FACTOR = 0.5;
/**
 * The waist of an "8" is longer than that, but it is the shortest of three
 * branches between the same two nodes — the other two are the bowls. Two nodes
 * joined by several branches are one crossing when the shortest of them is under
 * this multiple of their clearance.
 */
export const LOOP_MERGE_FACTOR = 2.5;
/**
 * A branch turning by this much or more (step 0) — a straight line would be 0° —
 * within `SHARP_BEND_REACH` times its clearance either side turns round a
 * corner of the outline. Round a counter it turns more slowly. Measured: the
 * test glyphs stay under 92° (S 88°, 8 91°), the square-cornered S of "CYS
 * SPORTS" under 99°; the blunt feet of the "w" in the Köln lettering turn by
 * 123–126°.
 */
export const SHARP_BEND_DEG = 110;
export const SHARP_BEND_REACH = 2.5;
/**
 * A chain of branches is a stroke when it is at least this many times as long as
 * its widest clearance — `isColumnBranch`'s rule, applied to the whole chain:
 * the crossbar of a slab-serif "T" is two short branches either side of the stem.
 */
export const STROKE_CHAIN_FACTOR = 1.5;
/** How far along a branch its direction at a junction is sampled, at least (mm)… */
const DIRECTION_REACH_MIN_MM = 1;
/** …and at most this multiple of the clearance there. */
const DIRECTION_REACH_RADIUS_FACTOR = 2;

export type AxisBranch = MedialBranch & {
  /** Long enough to be a column of its own (`isColumnBranch`). */
  primary: boolean;
  length: number;
};

type PortEnd = "start" | "end";
export type Port = { branch: number; end: PortEnd };

export type Junction = {
  point: Point;
  /** Largest clearance of its nodes. */
  radius: number;
  ports: Port[];
  /** Short branches inside the junction (step 1). Their outline belongs to no stroke. */
  inner: number[];
};

export type StrokeEnd =
  /** A leaf: the stroke ends in its own end cap. */
  | { kind: "free" }
  /** Longest stroke at a corner: runs on to the outer edge like a free end. */
  | { kind: "corner" }
  /** Ends `underlapMm` under stroke `onto`, which is stitched later. */
  | { kind: "abut"; onto: number };

export type LetterStroke = {
  index: number;
  /** Branch traversals in walking order. */
  path: { branch: number; reversed: boolean }[];
  closed: boolean;
  /** The axis, walked from start to end. */
  points: Point[];
  radii: number[];
  length: number;
  /** Junction at either end (undefined for a closed stroke). */
  startJunction?: number;
  endJunction?: number;
  /** Junctions the stroke passes straight through. */
  through: number[];
  start: StrokeEnd;
  end: StrokeEnd;
};

export type StrokeGraph = {
  branches: AxisBranch[];
  junctions: Junction[];
  strokes: LetterStroke[];
  /** For every branch the stroke whose outline it carries; -1 inside a junction. */
  branchStroke: number[];
  /** [a, b]: stroke a ends under stroke b and is stitched before it. */
  before: [number, number][];
  /** Sharp bends in the axis (step 0), split or not. */
  sharpBendCount: number;
  warnings: Warning[];
};

const nodeKey = (p: Point): string => `${Math.round(p.x * 1e4)}:${Math.round(p.y * 1e4)}`;
const portKey = (p: Port): string => `${p.branch}:${p.end}`;
const otherEnd = (end: PortEnd): PortEnd => (end === "start" ? "end" : "start");

/** Unit direction leaving the junction along `port`'s branch. */
function portDirection(branches: AxisBranch[], port: Port): Point {
  const b = branches[port.branch]!;
  const pts = port.end === "start" ? b.points : [...b.points].reverse();
  const radii = port.end === "start" ? b.radii : [...b.radii].reverse();
  const reach = Math.max(DIRECTION_REACH_RADIUS_FACTOR * (radii[0] ?? 0), DIRECTION_REACH_MIN_MM);
  const cum = cumulativeLengths(pts);
  const total = cum[cum.length - 1] ?? 0;
  return normalize(sub(pointAt(pts, Math.min(reach, total), cum), pts[0]!));
}

/**
 * Where a branch turns round a corner of the outline (step 0): the local
 * maxima of runs turning by `SHARP_BEND_DEG` or more. Only where the whole
 * reach lies on the branch — near its ends the axis bends into a junction.
 */
export function sharpBends(branch: MedialBranch): number[] {
  const pts = branch.points;
  const cum = cumulativeLengths(pts);
  const total = cum[cum.length - 1] ?? 0;
  const turn = pts.map((p, i) => {
    const reach = SHARP_BEND_REACH * (branch.radii[i] ?? 0);
    const s = cum[i]!;
    if (reach <= 0 || s - reach < 0 || s + reach > total) return 0;
    const before = pointAt(pts, s - reach, cum);
    const after = pointAt(pts, s + reach, cum);
    return angleBetweenDeg(sub(p, before), sub(after, p));
  });
  const out: number[] = [];
  for (let i = 0; i < pts.length;) {
    if (turn[i]! < SHARP_BEND_DEG) {
      i++;
      continue;
    }
    let best = i;
    let j = i;
    for (; j < pts.length && turn[j]! >= SHARP_BEND_DEG; j++) if (turn[j]! > turn[best]!) best = j;
    out.push(best);
    i = j;
  }
  return out;
}

/** Every branch cut at its sharp bends; the pieces share the point at the bend. */
function splitAtSharpBends(branches: MedialBranch[]): MedialBranch[] {
  return branches.flatMap((b) => {
    const cuts = sharpBends(b);
    if (cuts.length === 0) return [b];
    const out: MedialBranch[] = [];
    let from = 0;
    for (const c of [...cuts, b.points.length - 1]) {
      if (c <= from) continue;
      out.push({ points: b.points.slice(from, c + 1), radii: b.radii.slice(from, c + 1) });
      from = c;
    }
    return out;
  });
}

/** Nodes (coincident branch ends) grouped into junctions (step 1). */
function buildJunctions(branches: AxisBranch[]): {
  junctions: Junction[];
  portJunction: Map<string, number>;
  leafBranch: Set<number>;
} {
  type Node = { point: Point; radius: number; ports: Port[] };
  const nodes: Node[] = [];
  const nodeIndex = new Map<string, number>();
  const portNode = new Map<string, number>();
  branches.forEach((b, bi) => {
    if (b.points.length < 2) return;
    for (const end of ["start", "end"] as PortEnd[]) {
      const i = end === "start" ? 0 : b.points.length - 1;
      const p = b.points[i]!;
      const key = nodeKey(p);
      let ni = nodeIndex.get(key);
      if (ni === undefined) {
        ni = nodes.length;
        nodes.push({ point: p, radius: 0, ports: [] });
        nodeIndex.set(key, ni);
      }
      const node = nodes[ni]!;
      node.ports.push({ branch: bi, end });
      node.radius = Math.max(node.radius, b.radii[i] ?? 0);
      portNode.set(portKey({ branch: bi, end }), ni);
    }
  });

  // Union-find over nodes joined by a short inner branch.
  const parent = nodes.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]!]!;
      i = parent[i]!;
    }
    return i;
  };
  const ends = (bi: number): [number, number] => [
    portNode.get(portKey({ branch: bi, end: "start" }))!,
    portNode.get(portKey({ branch: bi, end: "end" }))!,
  ];
  const inner = new Set<number>();
  branches.forEach((b, bi) => {
    if (b.points.length < 2) return;
    const [na, nb] = ends(bi);
    if (na === nb) return;
    if (nodes[na]!.ports.length < 3 || nodes[nb]!.ports.length < 3) return;
    const clearance = Math.max(nodes[na]!.radius, nodes[nb]!.radius);
    const parallel = branches.filter((_, oi) => {
      if (oi === bi || branches[oi]!.points.length < 2) return false;
      const [oa, ob] = ends(oi);
      return (oa === na && ob === nb) || (oa === nb && ob === na);
    });
    const shortest = parallel.every((o) => o.length > b.length);
    const carriesStroke = (ni: number): boolean =>
      nodes[ni]!.ports.some((p) => p.branch !== bi && branches[p.branch]!.primary);
    const tiny = b.length < TINY_MERGE_FACTOR * clearance;
    const joint =
      b.length < JUNCTION_MERGE_FACTOR * clearance && carriesStroke(na) && carriesStroke(nb);
    const waist = parallel.length > 0 && shortest && b.length < LOOP_MERGE_FACTOR * clearance;
    if (!tiny && !joint && !waist) return;
    inner.add(bi);
    const ra = find(na);
    const rb = find(nb);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  });

  const junctionOfRoot = new Map<number, number>();
  const junctions: Junction[] = [];
  const members: number[][] = [];
  nodes.forEach((_, ni) => {
    const root = find(ni);
    let ji = junctionOfRoot.get(root);
    if (ji === undefined) {
      ji = junctions.length;
      junctionOfRoot.set(root, ji);
      junctions.push({ point: { x: 0, y: 0 }, radius: 0, ports: [], inner: [] });
      members.push([]);
    }
    members[ji]!.push(ni);
  });
  // A branch with an end in open air is a leaf: the corner spurs of a square
  // end, a serif. It carries no stroke on through a junction.
  const leafBranch = new Set<number>();
  nodes.forEach((n) => {
    if (n.ports.length === 1) leafBranch.add(n.ports[0]!.branch);
  });
  const portJunction = new Map<string, number>();
  junctions.forEach((j, ji) => {
    const ms = members[ji]!;
    j.point = {
      x: ms.reduce((s, ni) => s + nodes[ni]!.point.x, 0) / ms.length,
      y: ms.reduce((s, ni) => s + nodes[ni]!.point.y, 0) / ms.length,
    };
    j.radius = Math.max(...ms.map((ni) => nodes[ni]!.radius));
    for (const ni of ms) {
      for (const port of nodes[ni]!.ports) {
        portJunction.set(portKey(port), ji);
        if (inner.has(port.branch)) {
          if (!j.inner.includes(port.branch)) j.inner.push(port.branch);
          continue;
        }
        j.ports.push(port);
      }
    }
  });
  return { junctions, portJunction, leafBranch };
}

/** Pairs the ports of one junction (steps 2 and 3). */
function pairPorts(
  branches: AxisBranch[],
  junction: Junction,
  leafBranch: Set<number>,
): [Port, Port][] {
  const pairs: [Port, Port][] = [];
  const used = new Set<string>();
  // Step 2: a long branch that leaves and comes back is a ring.
  for (const p of junction.ports) {
    if (p.end !== "start" || !branches[p.branch]!.primary) continue;
    const back = junction.ports.find((q) => q.branch === p.branch && q.end === "end");
    if (!back) continue;
    pairs.push([p, back]);
    used.add(portKey(p));
    used.add(portKey(back));
  }
  // Step 3: the most opposing pair passes through, while one is left.
  // A short leaf is a corner or a serif, not the way on (module doc).
  const pool = junction.ports
    .filter((p) => !used.has(portKey(p)))
    .filter((p) => branches[p.branch]!.primary || !leafBranch.has(p.branch))
    .map((port) => ({ port, dir: portDirection(branches, port) }));
  const taken = new Set<number>();
  const primaries = pool.filter((p) => branches[p.port.branch]!.primary).length;
  let threshold = PASS_THROUGH_MIN_DEG;
  for (;;) {
    let best: [number, number] | undefined;
    let bestAngle = threshold;
    for (let i = 0; i < pool.length; i++) {
      if (taken.has(i)) continue;
      for (let j = i + 1; j < pool.length; j++) {
        if (taken.has(j)) continue;
        if (pool[i]!.port.branch === pool[j]!.port.branch) continue;
        const angle = angleBetweenDeg(pool[i]!.dir, pool[j]!.dir);
        if (angle >= bestAngle) {
          bestAngle = angle;
          best = [i, j];
        }
      }
    }
    if (!best) {
      // Nothing straight: at a junction of three strokes or more the smoothest pair.
      if (threshold === PASS_THROUGH_MIN_DEG && taken.size === 0 && primaries >= 3) {
        threshold = SMOOTH_TURN_MIN_DEG;
        continue;
      }
      break;
    }
    if (threshold !== PASS_THROUGH_MIN_DEG) threshold = Infinity; // one smooth pair at most
    taken.add(best[0]);
    taken.add(best[1]);
    pairs.push([pool[best[0]]!.port, pool[best[1]]!.port]);
  }
  return pairs;
}

type Chain = {
  path: { branch: number; reversed: boolean }[];
  closed: boolean;
  startPort?: Port;
  endPort?: Port;
  /** Junctions the chain passes straight through. */
  through: number[];
};

/** All maximal chains through the pairs (step 4). */
function walkChains(
  branches: AxisBranch[],
  junctions: Junction[],
  portJunction: Map<string, number>,
  partner: Map<string, Port>,
): Chain[] {
  const used = new Set<number>();
  const inner = new Set(junctions.flatMap((j) => j.inner));
  const chains: Chain[] = [];

  const walk = (from: Port, closedStart = false): Chain => {
    const path: Chain["path"] = [];
    const through: number[] = [];
    let cur: Port = from;
    for (;;) {
      path.push({ branch: cur.branch, reversed: cur.end === "end" });
      used.add(cur.branch);
      const far: Port = { branch: cur.branch, end: otherEnd(cur.end) };
      const next = partner.get(portKey(far));
      if (!next) return { path, closed: false, startPort: from, endPort: far, through };
      const j = portJunction.get(portKey(far));
      if (j !== undefined) through.push(j);
      if (next.branch === from.branch && next.end === from.end) {
        return { path, closed: true, through };
      }
      if (used.has(next.branch) && !(closedStart && next.branch === from.branch)) {
        // Came back onto a branch walked already by another route — stop here.
        return { path, closed: false, startPort: from, endPort: far, through };
      }
      cur = next;
    }
  };

  // Chains with loose ends, from every port that lost the pairing.
  junctions.forEach((j) => {
    for (const port of j.ports) {
      if (used.has(port.branch) || inner.has(port.branch)) continue;
      if (partner.has(portKey(port))) continue;
      chains.push(walk(port));
    }
  });
  // Leaves: branch ends that are no junction port (a free end in open air).
  branches.forEach((b, bi) => {
    if (used.has(bi) || inner.has(bi) || b.points.length < 2) return;
    for (const end of ["start", "end"] as PortEnd[]) {
      const port = { branch: bi, end };
      if (used.has(bi)) break;
      if (partner.has(portKey(port))) continue;
      chains.push(walk(port));
    }
  });
  // What is left is closed: rings and loops of pairs.
  branches.forEach((b, bi) => {
    if (used.has(bi) || inner.has(bi) || b.points.length < 2) return;
    chains.push(walk({ branch: bi, end: "start" }, true));
  });
  return chains;
}

/** Long enough to be a column of its own (step 4). */
function isStrokeChain(branches: AxisBranch[], chain: Chain): boolean {
  if (chain.path.some((p) => branches[p.branch]!.primary)) return true;
  const length = chain.path.reduce((sum, p) => sum + branches[p.branch]!.length, 0);
  const widest = Math.max(0, ...chain.path.flatMap((p) => branches[p.branch]!.radii));
  return length >= Math.max(widest, 1e-6) * STROKE_CHAIN_FACTOR;
}

function chainAxis(branches: AxisBranch[], chain: Chain): { points: Point[]; radii: number[] } {
  const points: Point[] = [];
  const radii: number[] = [];
  for (const { branch, reversed } of chain.path) {
    const b = branches[branch]!;
    const pts = reversed ? [...b.points].reverse() : b.points;
    const rs = reversed ? [...b.radii].reverse() : b.radii;
    for (let i = points.length > 0 ? 1 : 0; i < pts.length; i++) {
      points.push(pts[i]!);
      radii.push(rs[i]!);
    }
  }
  if (chain.closed && points.length > 1) {
    // The walk ends where it began; the ring closes implicitly.
    const first = points[0]!;
    const last = points[points.length - 1]!;
    if (Math.hypot(first.x - last.x, first.y - last.y) < 1e-6) {
      points.pop();
      radii.pop();
    }
  }
  return { points, radii };
}

/** Direction in which a stroke arrives at its end (`atEnd`) or start, pointing out of it. */
function arrivalDirection(stroke: LetterStroke, atEnd: boolean): Point {
  const pts = atEnd ? [...stroke.points].reverse() : stroke.points;
  const radii = atEnd ? [...stroke.radii].reverse() : stroke.radii;
  const reach = Math.max(DIRECTION_REACH_RADIUS_FACTOR * (radii[0] ?? 0), DIRECTION_REACH_MIN_MM);
  const cum = cumulativeLengths(pts);
  const total = cum[cum.length - 1] ?? 0;
  // From inside the stroke towards the end: the way it would run on.
  return normalize(sub(pts[0]!, pointAt(pts, Math.min(reach, total), cum)));
}

/** Kahn's algorithm; undefined when the constraints hold a cycle. */
export function stitchOrder(count: number, before: [number, number][]): number[] | undefined {
  const indegree = new Array<number>(count).fill(0);
  const next: number[][] = Array.from({ length: count }, () => []);
  for (const [a, b] of before) {
    next[a]!.push(b);
    indegree[b]! += 1;
  }
  const ready = indegree.flatMap((d, i) => (d === 0 ? [i] : []));
  const order: number[] = [];
  while (ready.length > 0) {
    ready.sort((a, b) => a - b);
    const i = ready.shift()!;
    order.push(i);
    for (const j of next[i]!) {
      indegree[j]! -= 1;
      if (indegree[j] === 0) ready.push(j);
    }
  }
  return order.length === count ? order : undefined;
}

export type StrokeGraphOptions = {
  /**
   * Cut the axis at its sharp bends (step 0). Off by default: whether a bend is
   * a corner or a tight curve is decided by the result (`satinColumns` tries
   * both when there is a sharp bend at all).
   */
  splitSharpBends?: boolean;
};

/**
 * The stroke plan of one letter (module doc). Deterministic: ties go to the
 * lower index, which follows the order of the medial axis.
 */
export function strokeGraph(
  shape: Polygon,
  id?: string,
  opts: StrokeGraphOptions = {},
): StrokeGraph {
  const warnings: Warning[] = [];
  const axis = medialAxis(shape).branches;
  const sharpBendCount = axis.reduce((n, b) => n + sharpBends(b).length, 0);
  const branches: AxisBranch[] = (opts.splitSharpBends ? splitAtSharpBends(axis) : axis).map(
    (b) => ({
      ...b,
      primary: isColumnBranch(b),
      length: arcLength(b.points),
    }),
  );
  const empty: StrokeGraph = {
    branches,
    junctions: [],
    strokes: [],
    branchStroke: branches.map(() => -1),
    before: [],
    sharpBendCount,
    warnings,
  };
  if (!branches.some((b) => b.primary)) {
    warnings.push(
      warn(
        WARNING.SATIN_TOO_NARROW,
        "No branch of the axis is longer than it is wide.",
        "info",
        id,
      ),
    );
    return empty;
  }

  const { junctions, portJunction, leafBranch } = buildJunctions(branches);
  const partner = new Map<string, Port>();
  const throughAt: number[][] = junctions.map(() => []); // stroke indices, filled below
  for (const j of junctions) {
    for (const [a, b] of pairPorts(branches, j, leafBranch)) {
      partner.set(portKey(a), b);
      partner.set(portKey(b), a);
    }
  }
  const chains = walkChains(branches, junctions, portJunction, partner);
  const isStroke = chains.map((c) => isStrokeChain(branches, c));
  const junctionOf = (p?: Port): number | undefined =>
    p ? portJunction.get(portKey(p)) : undefined;
  // A stroke back at the junction it started from, alone there: a ring with a
  // corner in it (step 4) — nothing to end under, nothing to run on past.
  chains.forEach((c, ci) => {
    if (!isStroke[ci] || c.closed) return;
    const j = junctionOf(c.startPort);
    if (j === undefined || j !== junctionOf(c.endPort)) return;
    const shared = chains.some(
      (o, oi) =>
        oi !== ci &&
        isStroke[oi] &&
        (o.through.includes(j) || junctionOf(o.startPort) === j || junctionOf(o.endPort) === j),
    );
    if (shared) return;
    c.closed = true;
    c.through.push(j);
    c.startPort = undefined;
    c.endPort = undefined;
  });

  // Strokes: chains long enough to be a column. Appendages: the rest.
  const strokes: LetterStroke[] = [];
  const chainStroke: number[] = [];
  chains.forEach((chain, ci) => {
    if (!isStroke[ci]) {
      chainStroke.push(-1);
      return;
    }
    const { points, radii } = chainAxis(branches, chain);
    const stroke: LetterStroke = {
      index: strokes.length,
      path: chain.path,
      closed: chain.closed,
      points,
      radii,
      length: arcLength(chain.closed ? [...points, points[0]!] : points),
      startJunction: chain.startPort ? portJunction.get(portKey(chain.startPort)) : undefined,
      endJunction: chain.endPort ? portJunction.get(portKey(chain.endPort)) : undefined,
      through: [...new Set(chain.through)],
      start: { kind: "free" },
      end: { kind: "free" },
    };
    chainStroke.push(stroke.index);
    strokes.push(stroke);
  });
  chains.forEach((chain, ci) => {
    const si = chainStroke[ci]!;
    if (si < 0) return;
    for (const j of chain.through) if (!throughAt[j]!.includes(si)) throughAt[j]!.push(si);
  });

  // LetterStroke ends (step 5).
  type EndRef = { stroke: number; atEnd: boolean };
  const endingAt: EndRef[][] = junctions.map(() => []);
  for (const s of strokes) {
    if (s.startJunction !== undefined)
      endingAt[s.startJunction]!.push({ stroke: s.index, atEnd: false });
    if (s.endJunction !== undefined)
      endingAt[s.endJunction]!.push({ stroke: s.index, atEnd: true });
  }
  const setEnd = (ref: EndRef, value: StrokeEnd): void => {
    if (ref.atEnd) strokes[ref.stroke]!.end = value;
    else strokes[ref.stroke]!.start = value;
  };
  const dominantAt = new Map<number, number>();
  const cornerGroups: { junction: number; ends: EndRef[] }[] = [];
  junctions.forEach((_, ji) => {
    const ending = endingAt[ji]!;
    const through = throughAt[ji]!;
    if (ending.length === 0) return;
    if (through.length > 0) {
      const ontoOf = (ref: EndRef): number => {
        const arriving = arrivalDirection(strokes[ref.stroke]!, ref.atEnd);
        // Onto the through stroke it meets most squarely.
        let onto = through[0]!;
        let bestSquare = Infinity;
        for (const t of through) {
          if (t === ref.stroke) continue;
          const tangent = throughTangent(strokes[t]!, junctions[ji]!.point);
          const square = Math.abs(dot(arriving, tangent));
          if (square < bestSquare) {
            bestSquare = square;
            onto = t;
          }
        }
        return onto;
      };
      // Strokes that end here and run into each other before they reach the
      // through stroke (the arm and leg of a K): the longest goes on to it,
      // the others end under that one.
      const sorted = [...ending].sort(
        (a, b) => strokes[b.stroke]!.length - strokes[a.stroke]!.length || a.stroke - b.stroke,
      );
      const leader = sorted[0]!;
      const leaderDir = arrivalDirection(strokes[leader.stroke]!, leader.atEnd);
      for (const ref of sorted) {
        const onto = ontoOf(ref);
        if (onto === ref.stroke) {
          setEnd(ref, { kind: "free" });
          continue;
        }
        const dir = arrivalDirection(strokes[ref.stroke]!, ref.atEnd);
        const converges =
          ref !== leader &&
          ref.stroke !== leader.stroke &&
          angleBetweenDeg(dir, leaderDir) < CONVERGE_MAX_DEG;
        setEnd(ref, { kind: "abut", onto: converges ? leader.stroke : onto });
      }
      return;
    }
    const distinct = new Set(ending.map((r) => r.stroke));
    if (distinct.size < 2) {
      for (const ref of ending) setEnd(ref, { kind: "free" });
      return;
    }
    cornerGroups.push({ junction: ji, ends: ending });
  });

  // Corners: the longest stroke runs on — unless that would make the stitch
  // order go round in a circle (B, P, D: the stem abuts the bowl at a corner
  // while the bowl abuts the stem further down). Then the next one.
  const assignCorners = (choice: number[]): [number, number][] => {
    const before: [number, number][] = [];
    for (const s of strokes) {
      for (const e of [s.start, s.end]) if (e.kind === "abut") before.push([s.index, e.onto]);
    }
    cornerGroups.forEach((g, gi) => {
      const dominant = choice[gi]!;
      for (const ref of g.ends) {
        if (ref.stroke === dominant) continue;
        before.push([ref.stroke, dominant]);
      }
    });
    return before;
  };
  // A stroke that runs through a junction or that others end under is the
  // letter's backbone (the stem of a B, P, R, the stem and crossbar of a 4): it
  // keeps the corner too. Then length.
  const carries = (si: number): boolean =>
    strokes[si]!.through.length > 0 ||
    strokes.some((o) => [o.start, o.end].some((e) => e.kind === "abut" && e.onto === si));
  const candidates = cornerGroups.map((g) =>
    [...new Set(g.ends.map((r) => r.stroke))].sort(
      (a, b) =>
        Number(carries(b)) - Number(carries(a)) || strokes[b]!.length - strokes[a]!.length || a - b,
    ),
  );
  let choice = candidates.map((c) => c[0]!);
  let before = assignCorners(choice);
  if (!stitchOrder(strokes.length, before)) {
    let fixed = false;
    // Try the corners one at a time, then in pairs — letters have few corners.
    for (let gi = 0; gi < cornerGroups.length && !fixed; gi++) {
      for (const alt of candidates[gi]!.slice(1)) {
        const trial = choice.slice();
        trial[gi] = alt;
        const b = assignCorners(trial);
        if (stitchOrder(strokes.length, b)) {
          choice = trial;
          before = b;
          fixed = true;
          break;
        }
      }
    }
    if (!fixed) {
      warnings.push(
        warn(
          WARNING.INVALID_GEOMETRY,
          "The strokes cannot all end under the one they meet — the stitch order runs in a circle.",
          "warn",
          id,
        ),
      );
    }
  }
  cornerGroups.forEach((g, gi) => {
    const dominant = choice[gi]!;
    dominantAt.set(g.junction, dominant);
    for (const ref of g.ends) {
      setEnd(ref, ref.stroke === dominant ? { kind: "corner" } : { kind: "abut", onto: dominant });
    }
  });

  // Which stroke carries each branch's outline.
  const branchStroke = branches.map(() => -1);
  chains.forEach((chain, ci) => {
    const si = chainStroke[ci]!;
    if (si >= 0) for (const p of chain.path) branchStroke[p.branch] = si;
  });
  // An appendage belongs to the stroke at the junction it hangs off — or, hung
  // off other appendages only (the corner spurs at the end of a short bar), to
  // theirs.
  const appendageOwner = new Map<number, number>(); // junction → owner via an appendage
  for (let pass = 0; pass < chains.length; pass++) {
    let changed = false;
    chains.forEach((chain, ci) => {
      if (chainStroke[ci]! >= 0 || branchStroke[chain.path[0]!.branch]! >= 0) return;
      const ends = [junctionOf(chain.startPort), junctionOf(chain.endPort)];
      let owner = -1;
      for (const ji of ends) {
        if (ji === undefined) continue;
        owner =
          throughAt[ji]![0] ??
          dominantAt.get(ji) ??
          (endingAt[ji]!.length > 0 ? endingAt[ji]![0]!.stroke : undefined) ??
          appendageOwner.get(ji) ??
          -1;
        if (owner >= 0) break;
      }
      if (owner < 0) return;
      for (const p of chain.path) branchStroke[p.branch] = owner;
      for (const ji of ends)
        if (ji !== undefined && !appendageOwner.has(ji)) appendageOwner.set(ji, owner);
      changed = true;
    });
    if (!changed) break;
  }

  return { branches, junctions, strokes, branchStroke, before, sharpBendCount, warnings };
}

/** Tangent of a stroke where it passes nearest to `p`. */
function throughTangent(stroke: LetterStroke, p: Point): Point {
  let best = 0;
  let bestD = Infinity;
  stroke.points.forEach((q, i) => {
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  const a = stroke.points[Math.max(0, best - 2)]!;
  const b = stroke.points[Math.min(stroke.points.length - 1, best + 2)]!;
  return normalize(sub(b, a));
}
