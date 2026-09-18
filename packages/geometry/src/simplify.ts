/** Douglas-Peucker (spec §5, tolerance 0.02 mm). */
import type { Point, Polyline } from "./types.js";

export const SIMPLIFY_TOLERANCE_MM = 0.02;

/** Squared distance from p to the segment a-b. */
function segDistSq(p: Point, a: Point, b: Point): number {
  let x = a.x;
  let y = a.y;
  let dx = b.x - x;
  let dy = b.y - y;
  if (dx !== 0 || dy !== 0) {
    const t = ((p.x - x) * dx + (p.y - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = b.x;
      y = b.y;
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }
  dx = p.x - x;
  dy = p.y - y;
  return dx * dx + dy * dy;
}

export function simplify(points: Polyline, tolerance = SIMPLIFY_TOLERANCE_MM): Polyline {
  if (points.length <= 2) return points.slice();
  const tolSq = tolerance * tolerance;
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;

  // Iterative rather than recursive — long paths would blow the stack.
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop()!;
    let maxSq = 0;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const d = segDistSq(points[i]!, points[first]!, points[last]!);
      if (d > maxSq) {
        maxSq = d;
        index = i;
      }
    }
    if (maxSq > tolSq && index > 0) {
      keep[index] = true;
      stack.push([first, index], [index, last]);
    }
  }

  const out: Polyline = [];
  for (let i = 0; i < points.length; i++) if (keep[i]) out.push(points[i]!);
  return out;
}
