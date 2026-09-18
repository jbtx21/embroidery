/** Set operations on polygons via Clipper2 (spec §5). */
import type { Polygon, Polyline } from "./types.js";
import { clipper, pathsToRings, ringsToPaths, ringsToPolygons, withPaths } from "./clipper.js";
import { rings } from "./polygon.js";

const allRings = (polys: Polygon[]): Polyline[] => polys.flatMap(rings);

/** Union. Also resolves self-intersections — hence its use by `normalizePolygon`. */
export function union(subjects: Polygon[], clips: Polygon[] = []): Polygon[] {
  const c = clipper();
  const subj = ringsToPaths(allRings(subjects));
  const clip = ringsToPaths(allRings(clips));
  return withPaths([subj, clip], () => {
    const res = c.Union64(subj, clip, c.FillRule.NonZero);
    return withPaths([res], () => ringsToPolygons(pathsToRings(res)));
  });
}

export function difference(subjects: Polygon[], clips: Polygon[]): Polygon[] {
  const c = clipper();
  const subj = ringsToPaths(allRings(subjects));
  const clip = ringsToPaths(allRings(clips));
  return withPaths([subj, clip], () => {
    const res = c.Difference64(subj, clip, c.FillRule.NonZero);
    return withPaths([res], () => ringsToPolygons(pathsToRings(res)));
  });
}

export function intersect(subjects: Polygon[], clips: Polygon[]): Polygon[] {
  const c = clipper();
  const subj = ringsToPaths(allRings(subjects));
  const clip = ringsToPaths(allRings(clips));
  return withPaths([subj, clip], () => {
    const res = c.Intersect64(subj, clip, c.FillRule.NonZero);
    return withPaths([res], () => ringsToPolygons(pathsToRings(res)));
  });
}

/**
 * Import normalisation (spec §5): resolve self-intersections via union, set the
 * winding (outer ring clockwise, holes counter-clockwise), assign holes.
 *
 * Returns a list, because a self-intersecting ring can fall apart into several
 * areas. The caller decides whether that is one broken object or all the pieces.
 */
export function normalizePolygon(poly: Polygon): Polygon[] {
  const c = clipper();
  const subj = ringsToPaths(rings(poly));
  return withPaths([subj], () => {
    // EvenOdd: on import the rings carry no reliable winding yet, so the fill
    // rule must not depend on it.
    const res = c.UnionSelf64(subj, c.FillRule.EvenOdd);
    return withPaths([res], () => ringsToPolygons(pathsToRings(res)));
  });
}

/** Like `normalizePolygon`, but for a single ring without holes. */
export function normalizeRing(ring: Polyline): Polygon[] {
  return normalizePolygon({ outer: ring, holes: [] });
}
