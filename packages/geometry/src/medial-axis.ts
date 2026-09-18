/**
 * Medial axis of a polygon — the skeleton auto-satin needs (spec §5, §7.7).
 *
 * NOT IMPLEMENTED YET. Spec §5 schedules it for week 4 and §7.7 builds on it;
 * nothing before week 4 depends on it. The stub exists so that the seam is
 * visible and callers fail loudly instead of quietly doing something else.
 *
 * TODO (week 4): Voronoi diagram of the outline, keep the edges that lie inside,
 * cut the branches that run into convex corners, return the remaining tree.
 */
import type { Polygon, Polyline } from "./types.js";

/** Branches of the skeleton, each as a polyline from branch point to branch point. */
export type MedialAxis = { branches: Polyline[] };

export function medialAxis(_poly: Polygon): MedialAxis {
  throw new Error("medialAxis is not implemented yet (spec §5, week 4).");
}
