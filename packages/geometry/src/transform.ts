/** Verschieben, Drehen, Skalieren — gebraucht vom Fill (Kap. 8.1) und vom Text. */
import type { Point, Polygon, Polyline } from "./types.js";

export type Transform = (p: Point) => Point;

export function rotator(deg: number, about: Point = { x: 0, y: 0 }): Transform {
  const rad = (deg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return (p) => {
    const dx = p.x - about.x;
    const dy = p.y - about.y;
    return { x: about.x + dx * c - dy * s, y: about.y + dx * s + dy * c };
  };
}

export function translator(dx: number, dy: number): Transform {
  return (p) => ({ x: p.x + dx, y: p.y + dy });
}

export function scaler(fx: number, fy = fx, about: Point = { x: 0, y: 0 }): Transform {
  return (p) => ({ x: about.x + (p.x - about.x) * fx, y: about.y + (p.y - about.y) * fy });
}

export function compose(...ts: Transform[]): Transform {
  return (p) => ts.reduce((acc, t) => t(acc), p);
}

export const applyToPolyline = (t: Transform, poly: Polyline): Polyline => poly.map(t);

export const applyToPolygon = (t: Transform, poly: Polygon): Polygon => ({
  outer: poly.outer.map(t),
  holes: poly.holes.map((h) => h.map(t)),
});
