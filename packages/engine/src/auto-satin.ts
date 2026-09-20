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
  cross,
  dedupe,
  dist,
  medialAxis,
  polygonBbox,
  samplePolygonBoundary,
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
  pullCompMm?: number;
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

/** Direction of the branch at point i, from its neighbours. */
function tangentAtIndex(points: Polyline, i: number): Point {
  const before = points[Math.max(0, i - 1)]!;
  const after = points[Math.min(points.length - 1, i + 1)]!;
  const dx = after.x - before.x;
  const dy = after.y - before.y;
  const l = Math.hypot(dx, dy);
  return l < 1e-12 ? { x: 1, y: 0 } : { x: dx / l, y: dy / l };
}

/**
 * The two rails of a branch: for every point on the axis the nearest sample of
 * the outline on each side. Which side is which follows the branch direction, so
 * the two rails stay apart instead of swapping halfway along.
 */
export function railsForBranch(branch: MedialBranch, boundary: Point[]): BranchRails {
  const railA: Polyline = [];
  const railB: Polyline = [];
  const widths: number[] = [];

  for (let i = 0; i < branch.points.length; i++) {
    const p = branch.points[i]!;
    const t = tangentAtIndex(branch.points, i);
    let left: Point | undefined;
    let leftDist = Infinity;
    let right: Point | undefined;
    let rightDist = Infinity;

    for (const q of boundary) {
      const to = { x: q.x - p.x, y: q.y - p.y };
      const side = cross(t, to);
      const d = Math.hypot(to.x, to.y);
      if (side > 0) {
        if (d < leftDist) {
          leftDist = d;
          left = q;
        }
      } else if (side < 0) {
        if (d < rightDist) {
          rightDist = d;
          right = q;
        }
      }
    }

    if (!left || !right) continue;
    railA.push({ ...left });
    railB.push({ ...right });
    widths.push(dist(left, right));
  }

  return { railA, railB, widths };
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
 */
function rungsFrom(railA: Polyline, railB: Polyline): [Point, Point][] {
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

  const boundary = samplePolygonBoundary(shape, sampleMm);
  const rails = axis.branches
    .map((branch) => railsForBranch(branch, boundary))
    .filter((r) => r.railA.length >= 2 && r.railB.length >= 2);

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

  const objects: StitchObject[] = usable.map(({ railA, railB, raw: r }, i): SatinObject => {
    return {
      id: `${idPrefix}-${i}`,
      type: "satin",
      threadIndex: opts.threadIndex ?? 0,
      visible: true,
      locked: false,
      trimAfter: "auto",
      railA,
      railB,
      rungs: rungsFrom(r.railA, r.railB),
      spacingMm: opts.spacingMm ?? preset.satinSpacingMm,
      pullCompMm: opts.pullCompMm ?? preset.pullCompMm,
      maxWidthMm,
      underlay: opts.underlay ?? preset.satinUnderlay,
      shortStitches: true,
      reverse: false,
    };
  });

  return { objects, warnings };
}
