/**
 * Polygon-Grundlagen: Flaeche, Orientierung, Bounding-Box, Punkt-in-Polygon.
 *
 * Orientierung im SVG-System (y nach unten): die Shoelace-Formel liefert fuer
 * einen visuell IM Uhrzeigersinn laufenden Ring ein positives Vorzeichen. Die
 * Normierung aus Kap. 5 (Aussenring im Uhrzeigersinn, Loecher gegen) heisst hier
 * also: `signedArea(outer) > 0`, `signedArea(hole) < 0`.
 */
import type { Point, Polygon, Polyline, Rect } from "./types.js";

/** Positiv = Uhrzeigersinn im SVG-System (y nach unten). Ring schliesst implizit. */
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

/** Flaeche des Polygons abzueglich seiner Loecher. */
export function polygonArea(poly: Polygon): number {
  let a = area(poly.outer);
  for (const h of poly.holes) a -= area(h);
  return Math.max(0, a);
}

export const isClockwise = (ring: Polyline): boolean => signedArea(ring) > 0;

export function reverse(ring: Polyline): Polyline {
  return ring.slice().reverse();
}

/** Ring auf die gewuenschte Drehrichtung bringen, ohne ihn sonst anzufassen. */
export function orient(ring: Polyline, clockwise: boolean): Polyline {
  return isClockwise(ring) === clockwise ? ring.slice() : reverse(ring);
}

/** Schlusspunkt entfernen, falls er den Startpunkt wiederholt. */
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

/** Ray-Casting gegen einen einzelnen Ring. Punkte auf der Kante gelten als innen. */
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

/** Innen heisst: im Aussenring und in keinem Loch. */
export function pointInPolygon(poly: Polygon, p: Point): boolean {
  if (!pointInRing(poly.outer, p)) return false;
  for (const h of poly.holes) if (pointInRing(h, p)) return false;
  return true;
}

/** Alle Ringe eines Polygons — Aussenring zuerst. */
export function rings(poly: Polygon): Polyline[] {
  return [poly.outer, ...poly.holes];
}

/** Ring als geschlossene Polyline (Startpunkt wiederholt) — fuer Laufstiche. */
export function closeRing(ring: Polyline): Polyline {
  if (ring.length === 0) return [];
  return [...ring.map((p) => ({ ...p })), { ...ring[0]! }];
}
