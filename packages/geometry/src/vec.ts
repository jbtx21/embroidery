/** Vector helpers. Plain and allocation-friendly enough for our volumes. */
import type { Point } from "./types.js";

export const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Point, f: number): Point => ({ x: a.x * f, y: a.y * f });
export const dot = (a: Point, b: Point): number => a.x * b.x + a.y * b.y;
/** z component of the cross product — its sign gives the turn direction. */
export const cross = (a: Point, b: Point): number => a.x * b.y - a.y * b.x;
export const len = (a: Point): number => Math.hypot(a.x, a.y);
export const dist = (a: Point, b: Point): number => Math.hypot(b.x - a.x, b.y - a.y);
export const distSq = (a: Point, b: Point): number => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return dx * dx + dy * dy;
};
export const lerp = (a: Point, b: Point, t: number): Point => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

export function normalize(a: Point): Point {
  const l = len(a);
  return l === 0 ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l };
}

/** Left-hand normal (90 degrees counter-clockwise in the SVG system). */
export const normal = (a: Point): Point => ({ x: a.y, y: -a.x });

export const equals = (a: Point, b: Point, eps = 1e-9): boolean =>
  Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps;

/** Angle between two direction vectors in degrees, 0 to 180. */
export function angleBetweenDeg(a: Point, b: Point): number {
  const la = len(a);
  const lb = len(b);
  if (la === 0 || lb === 0) return 0;
  const c = Math.min(1, Math.max(-1, dot(a, b) / (la * lb)));
  return (Math.acos(c) * 180) / Math.PI;
}
