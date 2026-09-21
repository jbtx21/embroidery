/**
 * Auto-satin: shape to satin columns (spec §7.7).
 *
 * 1. `medialAxis(shape)` gives the skeleton, already split at its junctions.
 * 2. Per branch the rails are the nearest stretch of outline to the left and to
 *    the right, walked in step with the branch.
 * 3. Median width along the branch above `maxWidthMm` means a fill, not a satin.
 * 4. The columns come back ordered along the skeleton.
 * 5. The editor shows this as a proposal; the user corrects rails and rungs.
 *
 * Where a branch is too wide, the whole shape is proposed as one fill. Splitting
 * the shape per branch is not specified anywhere and would be guesswork — and a
 * design that is half satin columns and half unclaimed area cannot be stitched.
 * See docs/backlog.md.
 */
import type { MedialBranch, Point, Polygon, Polyline } from "@texma-stitch/geometry";
import {
  boundarySampleMm,
  closeRing,
  cross,
  cumulativeLengths,
  dedupe,
  dist,
  distSq,
  medialAxis,
  pointAt,
  polygonBbox,
  rings,
  simplify,
} from "@texma-stitch/geometry";
import { PRESETS } from "./presets.js";
import type { FillObject, SatinObject, SatinUnderlay, StitchObject, Warning } from "./types.js";
import { warn, WARNING } from "./warnings.js";

/** Rungs are placed roughly this far apart along the branch (spec §7.1). */
const RUNG_SPACING_MM = 2;
/** Rails are smoothed by this much to take the sampling noise off them. */
const RAIL_SIMPLIFY_MM = 0.08;
/** How far a rung sticks out past each rail, as a share of the column width. */
const RUNG_OVERSHOOT = 0.15;

export type AutoSatinOptions = {
  /** Above this median width a branch becomes a fill (spec §7.4, default 7). */
  maxWidthMm?: number;
  spacingMm?: number;
  /** Explicit compensation in mm; without one the percentage below applies. */
  pullCompMm?: number;
  pullCompPct?: number;
  pullCompMaxMm?: number;
  underlay?: SatinUnderlay;
  threadIndex?: number;
  /** Ids become `${idPrefix}-0`, `${idPrefix}-1`, … */
  idPrefix?: string;
  /** Boundary sampling distance; defaults to the one the skeleton uses. */
  sampleMm?: number;
  /**
   * Passed through to the skeleton. Raising it drops the short branches a
   * rectangle has towards its corners, which gives fewer and longer columns —
   * at the price of leaving the very ends of the shape uncovered. The editor
   * decides; see docs/backlog.md.
   */
  pruneFactor?: number;
};

export type AutoSatinResult = { objects: StitchObject[]; warnings: Warning[] };

export type BranchRails = { railA: Polyline; railB: Polyline; widths: number[] };

/**
 * The two rails of a branch: for every point on the axis the nearest sample of
 * the outline on each side. Which side is which follows the branch direction, so
 * the two rails stay apart instead of swapping halfway along.
 */
/** How far past its own radius a boundary point may sit and still belong to a branch. */
const BELONGS_FACTOR = 1.4;
/**
 * A branch shorter than this multiple of its own clearance is a corner, not a
 * column (spec §7.7.1).
 *
 * The medial axis of a rectangle is a roof with a spur running into each corner
 * — five branches for a plain bar, nine for a T. Every spur would cut its own
 * pair of rails out of the same outline, and the columns would stitch each
 * other. The corners stay covered: the rails of the long branch run the whole
 * ring anyway.
 */
const SPUR_FACTOR = 1.5;

/**
 * Is this branch a column of its own, or a corner of a bigger one?
 *
 * Measured against the WIDEST point of the branch, not the average: a spur
 * running from a junction into a corner lies inside the clearance disc of that
 * junction, so it is shorter than the radius it starts from.
 */
export function isColumnBranch(branch: MedialBranch): boolean {
  if (branch.points.length < 2) return false;
  const length = cumulativeLengths(branch.points).slice(-1)[0] ?? 0;
  const widest = Math.max(0, ...branch.radii);
  return length >= Math.max(widest, 1e-6) * SPUR_FACTOR;
}

/** Sampled boundary of one ring, with its cumulative lengths. */
type Ring = { points: Polyline; cum: number[]; total: number };

/** Every ring of the shape, sampled at the same spacing as the skeleton. */
export function sampledRings(poly: Polygon, spacingMm: number): Ring[] {
  const out: Ring[] = [];
  for (const ring of rings(poly)) {
    if (ring.length < 3) continue;
    const closed = closeRing(ring);
    const cum = cumulativeLengths(closed);
    const total = cum[cum.length - 1]!;
    if (total < spacingMm) continue;
    const n = Math.max(3, Math.round(total / spacingMm));
    const points: Polyline = [];
    for (let i = 0; i < n; i++) points.push(pointAt(closed, (i * total) / n, cum));
    const rc = cumulativeLengths([...points, points[0]!]);
    out.push({ points, cum: rc, total: rc[rc.length - 1]! });
  }
  return out;
}

/** Index of the ring point nearest to p. */
function nearestIndex(ring: Ring, p: Point): number {
  let best = 0;
  let bestD = Infinity;
  for (const [i, q] of ring.points.entries()) {
    const d = distSq(p, q);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** Rotate a closed chain so it begins at the point nearest `p`. */
function alignStart(chain: Polyline, p: Point): Polyline {
  let best = 0;
  let bestD = Infinity;
  for (const [i, q] of chain.entries()) {
    const d = distSq(p, q);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return [...chain.slice(best), ...chain.slice(0, best)];
}

/**
 * Nearest position on the branch, as a fraction of its length, plus the
 * distance to it and the radius there.
 */
function projectOnBranch(
  branch: MedialBranch,
  p: Point,
): { t: number; distance: number; radius: number; foot: Point; tangent: Point } {
  let best = {
    t: 0,
    distance: Infinity,
    radius: 0,
    foot: branch.points[0]!,
    tangent: { x: 1, y: 0 },
  };
  const pts = branch.points;
  const cum = cumulativeLengths(pts);
  const total = cum[cum.length - 1] ?? 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    const u = l2 < 1e-12 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
    const q = { x: a.x + dx * u, y: a.y + dy * u };
    const d = dist(p, q);
    if (d < best.distance) {
      const along = (cum[i]! + u * Math.hypot(dx, dy)) / (total || 1);
      const len = Math.hypot(dx, dy) || 1;
      best = {
        t: along,
        distance: d,
        radius: (branch.radii[i] ?? 0) * (1 - u) + (branch.radii[i + 1] ?? 0) * u,
        foot: q,
        tangent: { x: dx / len, y: dy / len },
      };
    }
  }
  return best;
}

/**
 * Widths sampled at matching arc-length fractions — the same pairing the satin
 * itself uses without rungs (spec §7.1).
 */
function withWidths(railA: Polyline, railB: Polyline): BranchRails {
  const cumA = cumulativeLengths(railA);
  const cumB = cumulativeLengths(railB);
  const lenA = cumA[cumA.length - 1] ?? 0;
  const lenB = cumB[cumB.length - 1] ?? 0;
  const widths: number[] = [];
  const steps = Math.max(4, Math.min(64, Math.max(railA.length, railB.length)));
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    widths.push(dist(pointAt(railA, f * lenA, cumA), pointAt(railB, f * lenB, cumB)));
  }
  return { railA, railB, widths };
}

/**
 * Rails for one branch, cut out of the outline (spec §7.7.1).
 *
 * The outline IS the rail. Every boundary point is projected onto the branch:
 * the ones within their own clearance belong to it, and the sign of the cross
 * product with the LOCAL tangent says which side. Sorted along the branch, each
 * side is a rail.
 *
 * Reading it the other way round — for each axis point the nearest boundary
 * point on each side — is what made the rail wind: on a curve the side flips
 * between neighbouring axis points, and the column stitches the same spot
 * twice. Measured on a letter of 10 x 13 mm: rails 38 mm long, 92 stitches in
 * one square millimetre.
 */
export function railsForBranch(branch: MedialBranch, boundary: Ring[]): BranchRails {
  const empty: BranchRails = { railA: [], railB: [], widths: [] };
  const pts = branch.points;
  if (pts.length < 2 || boundary.length === 0) return empty;

  const head = pts[0]!;
  const tail = pts[pts.length - 1]!;

  // A closed branch — the axis of a ring — has no two ends. Its rails are two
  // different rings of the shape: the outline and the hole.
  if (dist(head, tail) < 1e-6) {
    if (boundary.length < 2) return empty;
    const byDistance = [...boundary].sort(
      (a, b) =>
        distSq(head, a.points[nearestIndex(a, head)]!) -
        distSq(head, b.points[nearestIndex(b, head)]!),
    );
    const outer = byDistance[0]!.points.map((p) => ({ ...p }));
    const inner = byDistance[1]!.points.map((p) => ({ ...p })).reverse();
    return withWidths(outer, alignStart(inner, outer[0]!));
  }

  return railsForBranches([branch], boundary)[0] ?? empty;
}

type Claim = { t: number; p: Point; side: number };

/**
 * How well a boundary point fits a branch, and on which side (spec §7.7.1).
 *
 * `undefined` where it does not belong at all: too far for the clearance there,
 * or BEHIND an end of the branch — that stretch belongs to whatever comes next,
 * the neighbouring branch at a junction or nothing at all at a tip.
 */
function claimFor(branch: MedialBranch, p: Point): { score: number; claim: Claim } | undefined {
  const pr = projectOnBranch(branch, p);
  const toPoint = { x: p.x - pr.foot.x, y: p.y - pr.foot.y };
  const ahead = toPoint.x * pr.tangent.x + toPoint.y * pr.tangent.y;
  if (pr.t <= 1e-9 && ahead < 0) return undefined;
  if (pr.t >= 1 - 1e-9 && ahead > 0) return undefined;
  const side = cross(pr.tangent, toPoint);
  if (Math.abs(side) < 1e-12) return undefined;
  return {
    score: pr.distance / Math.max(pr.radius, 1e-6),
    claim: { t: pr.t, p: { ...p }, side },
  };
}

/**
 * Rails for every branch at once (spec §7.7.1).
 *
 * Each boundary point goes to ONE branch — the one whose clearance fits it
 * best. That way the branches divide the outline between them instead of
 * fighting over it at the junctions, and the rails of a shape can never add up
 * to more than its outline.
 */
export function railsForBranches(branches: MedialBranch[], boundary: Ring[]): BranchRails[] {
  const empty: BranchRails = { railA: [], railB: [], widths: [] };
  const claims: Claim[][] = branches.map(() => []);

  for (const ring of boundary) {
    for (const p of ring.points) {
      let best = -1;
      let bestScore = BELONGS_FACTOR;
      let bestClaim: Claim | undefined;
      for (const [i, branch] of branches.entries()) {
        const c = claimFor(branch, p);
        if (!c || c.score >= bestScore) continue;
        bestScore = c.score;
        best = i;
        bestClaim = c.claim;
      }
      if (best >= 0 && bestClaim) claims[best]!.push(bestClaim);
    }
  }

  return claims.map((list) => {
    const left = list.filter((c) => c.side > 0);
    const right = list.filter((c) => c.side < 0);
    if (left.length < 2 || right.length < 2) return empty;
    const along = (xs: Claim[]): Polyline => [...xs].sort((a, b) => a.t - b.t).map((x) => x.p);
    return withWidths(along(left), along(right));
  });
}

export function medianWidth(widths: number[]): number {
  if (widths.length === 0) return 0;
  const sorted = [...widths].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * Rungs straight from the pairing the axis produced — the editor can move them.
 *
 * They are stretched a little past both rails on purpose. A rung has to CROSS
 * the rails to cut them into sections (spec §7.1); one that stops exactly on a
 * rail point misses as soon as the rail is simplified, and the pairing falls
 * back to plain arc length — which is what the rungs were there to prevent.
 *
 * Auto-satin itself no longer needs them since 21.09.2026: its rails are cut
 * from the outline and run the same way, so the arc-length pairing of §7.1 is
 * already right (spec §7.7.1). The function stays for the editor, where the
 * user pins a pairing by hand.
 */
export function rungsFrom(railA: Polyline, railB: Polyline): [Point, Point][] {
  const out: [Point, Point][] = [];
  let since = Infinity;
  for (let i = 0; i < railA.length && i < railB.length; i++) {
    if (i > 0) since += dist(railA[i - 1]!, railA[i]!);
    if (since < RUNG_SPACING_MM) continue;
    since = 0;
    const a = railA[i]!;
    const b = railB[i]!;
    const width = dist(a, b);
    if (width < 1e-9) continue;
    const overshoot = Math.max(width * RUNG_OVERSHOOT, 0.05) / width;
    out.push([
      { x: a.x - (b.x - a.x) * overshoot, y: a.y - (b.y - a.y) * overshoot },
      { x: b.x + (b.x - a.x) * overshoot, y: b.y + (b.y - a.y) * overshoot },
    ]);
  }
  return out;
}

/** Greedy chain along the skeleton (spec §7.7 step 4). */
export function orderBranches(rails: BranchRails[], start: Point): BranchRails[] {
  const open = [...rails];
  const out: BranchRails[] = [];
  let cursor = start;
  while (open.length > 0) {
    let bestIndex = 0;
    let bestDistance = Infinity;
    let flip = false;
    open.forEach((r, i) => {
      const head = r.railA[0];
      const tail = r.railA[r.railA.length - 1];
      if (head) {
        const d = dist(cursor, head);
        if (d < bestDistance) {
          bestDistance = d;
          bestIndex = i;
          flip = false;
        }
      }
      if (tail) {
        const d = dist(cursor, tail);
        if (d < bestDistance) {
          bestDistance = d;
          bestIndex = i;
          flip = true;
        }
      }
    });
    const chosen = open.splice(bestIndex, 1)[0]!;
    const oriented = flip
      ? {
          railA: [...chosen.railA].reverse(),
          railB: [...chosen.railB].reverse(),
          widths: [...chosen.widths].reverse(),
        }
      : chosen;
    out.push(oriented);
    cursor = oriented.railA[oriented.railA.length - 1] ?? cursor;
  }
  return out;
}

function fillProposal(shape: Polygon, opts: AutoSatinOptions): FillObject {
  const preset = PRESETS.pique;
  return {
    id: `${opts.idPrefix ?? "auto"}-fill`,
    type: "fill",
    threadIndex: opts.threadIndex ?? 0,
    visible: true,
    locked: false,
    trimAfter: "auto",
    shape,
    angleDeg: 0,
    rowSpacingMm: preset.fillRowSpacingMm,
    stitchLengthMm: preset.fillStitchLengthMm,
    staggerRows: preset.fillStaggerRows,
    pullCompMm: 0,
    pushCompMm: 0,
    underlapMm: 0,
    cutsBelow: "auto",
    underlay: preset.fillUnderlay,
  };
}

export function autoSatin(shape: Polygon, opts: AutoSatinOptions = {}): AutoSatinResult {
  const warnings: Warning[] = [];
  const maxWidthMm = opts.maxWidthMm ?? 7;
  const idPrefix = opts.idPrefix ?? "auto";
  const sampleMm = opts.sampleMm ?? boundarySampleMm(shape);

  const axis = medialAxis(shape, {
    sampleMm,
    ...(opts.pruneFactor === undefined ? {} : { pruneFactor: opts.pruneFactor }),
  });
  if (axis.branches.length === 0) {
    warnings.push(
      warn(
        WARNING.SATIN_TOO_WIDE,
        "The shape has no usable axis — it is round rather than column-shaped. Proposed as a fill.",
        "info",
      ),
    );
    return { objects: [fillProposal(shape, opts)], warnings };
  }

  const boundary = sampledRings(shape, sampleMm);
  const branches = axis.branches.filter(isColumnBranch);
  if (branches.length === 0) {
    warnings.push(
      warn(
        WARNING.SATIN_TOO_NARROW,
        "Every branch of the skeleton is shorter than its own width — this is a blob, not a column. Proposed as a fill.",
        "info",
      ),
    );
    return { objects: [fillProposal(shape, opts)], warnings };
  }
  const rails = railsForBranches(branches, boundary).filter(
    (r) => r.railA.length >= 2 && r.railB.length >= 2,
  );

  if (rails.length === 0) {
    warnings.push(
      warn(WARNING.INVALID_GEOMETRY, "No rails could be read off the skeleton.", "error"),
    );
    return { objects: [], warnings };
  }

  const tooWide = rails.filter((r) => medianWidth(r.widths) > maxWidthMm);
  if (tooWide.length > 0) {
    const widest = Math.max(...tooWide.map((r) => medianWidth(r.widths)));
    warnings.push(
      warn(
        WARNING.SATIN_TOO_WIDE,
        `${tooWide.length} of ${rails.length} branches are wider than ${maxWidthMm} mm (up to ${widest.toFixed(1)} mm). Proposed as a fill.`,
        "info",
      ),
    );
    return { objects: [fillProposal(shape, opts)], warnings };
  }

  const box = polygonBbox(shape);
  const preset = PRESETS.pique;
  // Simplifying can collapse a rail that still had two points on the skeleton —
  // a branch so short that both its rail points land on the same spot. Such a
  // column is not stitchable, and it is dropped WITH a warning, not silently
  // (rule 8).
  const usable = orderBranches(rails, { x: box.minX, y: box.maxY })
    .map((r) => ({
      railA: dedupe(simplify(r.railA, RAIL_SIMPLIFY_MM), 1e-6),
      railB: dedupe(simplify(r.railB, RAIL_SIMPLIFY_MM), 1e-6),
      raw: r,
    }))
    .filter((r) => r.railA.length >= 2 && r.railB.length >= 2);

  const collapsed = rails.length - usable.length;
  if (collapsed > 0) {
    warnings.push(
      warn(
        WARNING.SATIN_TOO_NARROW,
        `${collapsed} of ${rails.length} branches collapse to a point once simplified — ` +
          `they are left out of the proposal.`,
        "warn",
      ),
    );
  }
  if (usable.length === 0) {
    warnings.push(warn(WARNING.INVALID_GEOMETRY, "No rails survive simplification.", "error"));
    return { objects: [], warnings };
  }

  const objects: StitchObject[] = usable.map(({ railA, railB }, i): SatinObject => {
    return {
      id: `${idPrefix}-${i}`,
      type: "satin",
      threadIndex: opts.threadIndex ?? 0,
      visible: true,
      locked: false,
      trimAfter: "auto",
      railA,
      railB,
      // No rungs: both rails were cut from the outline and run the same way, so
      // the arc-length pairing of §7.1 is already the right one (spec §7.7.1).
      rungs: [],
      spacingMm: opts.spacingMm ?? preset.satinSpacingMm,
      // A percentage of the column width, unless the caller names millimetres
      // (spec §7.2).
      ...(opts.pullCompMm !== undefined ? { pullCompMm: opts.pullCompMm } : {}),
      pullCompPct: opts.pullCompPct ?? preset.pullCompPct,
      pullCompMaxMm: opts.pullCompMaxMm ?? preset.pullCompMaxMm,
      maxWidthMm,
      underlay: opts.underlay ?? preset.satinUnderlay,
      shortStitches: true,
      reverse: false,
    };
  });

  return { objects, warnings };
}
