/**
 * Polygon basics: area, orientation, bounding box, point in polygon.
 *
 * Orientation in the SVG system (y down): the shoelace formula returns a
 * positive value for a ring that runs visually clockwise. So the normalisation
 * from spec §5 (outer ring clockwise, holes counter-clockwise) means
 * `signedArea(outer) > 0` and `signedArea(hole) < 0`.
 */
import type { Point, Polygon, Polyline, Rect } from "./types.js";

/** Positive means clockwise in the SVG system (y down). The ring closes implicitly. */
export function signedArea(ring: Polyline): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

export const area = (ring: Polyline): number => Math.abs(signedArea(ring));

/** Area of the polygon minus its holes. */
export function polygonArea(poly: Polygon): number {
  let a = area(poly.outer);
  for (const h of poly.holes) a -= area(h);
  return Math.max(0, a);
}

export const isClockwise = (ring: Polyline): boolean => signedArea(ring) > 0;

export function reverse(ring: Polyline): Polyline {
  return ring.slice().reverse();
}

/** Bring a ring to the requested winding without touching anything else. */
export function orient(ring: Polyline, clockwise: boolean): Polyline {
  return isClockwise(ring) === clockwise ? ring.slice() : reverse(ring);
}

/** Drop the closing point if it repeats the start point. */
export function openRing(ring: Polyline, eps = 1e-9): Polyline {
  if (ring.length < 2) return ring.slice();
  const a = ring[0]!;
  const b = ring[ring.length - 1]!;
  if (Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps) return ring.slice(0, -1);
  return ring.slice();
}

export function bbox(points: Polyline): Rect {
  if (points.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

export function polygonBbox(poly: Polygon): Rect {
  return bbox(poly.outer);
}

export function unionRect(a: Rect, b: Rect): Rect {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

/** Ray casting against a single ring. */
export function pointInRing(ring: Polyline, p: Point): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;
    if (a.y > p.y !== b.y > p.y) {
      const x = ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x;
      if (p.x < x) inside = !inside;
    }
  }
  return inside;
}

/** Inside means: within the outer ring and in none of the holes. */
export function pointInPolygon(poly: Polygon, p: Point): boolean {
  if (!pointInRing(poly.outer, p)) return false;
  for (const h of poly.holes) if (pointInRing(h, p)) return false;
  return true;
}

/** All rings of a polygon — outer ring first. */
export function rings(poly: Polygon): Polyline[] {
  return [poly.outer, ...poly.holes];
}

/** A ring as a closed polyline (start point repeated) — for running stitches. */
export function closeRing(ring: Polyline): Polyline {
  if (ring.length === 0) return [];
  return [...ring.map((p) => ({ ...p })), { ...ring[0]! }];
}
