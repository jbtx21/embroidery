/**
 * 2x3 affine matrices in SVG order: x' = a*x + c*y + e, y' = b*x + d*y + f.
 *
 * Own implementation rather than a library: the engine must stay free of DOM
 * types and of extra dependencies (CLAUDE.md, stack).
 */
import type { Point } from "@texma-stitch/geometry";

export type Matrix = [number, number, number, number, number, number];

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** m1 then m2 applied to a point means multiply(m1, m2). */
export function multiply(m1: Matrix, m2: Matrix): Matrix {
  const [a1, b1, c1, d1, e1, f1] = m1;
  const [a2, b2, c2, d2, e2, f2] = m2;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

export const applyMatrix = (m: Matrix, p: Point): Point => ({
  x: m[0] * p.x + m[2] * p.y + m[4],
  y: m[1] * p.x + m[3] * p.y + m[5],
});

const deg = (v: number): number => (v * Math.PI) / 180;

/**
 * Parse an SVG `transform` attribute. Unknown functions are ignored rather than
 * guessed at — a wrong matrix moves the whole design.
 */
export function parseTransform(value: string): Matrix {
  let out: Matrix = IDENTITY;
  const re = /([a-zA-Z]+)\s*\(([^)]*)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(value)) !== null) {
    const name = m[1]!.toLowerCase();
    const args = (m[2] ?? "")
      .split(/[\s,]+/)
      .filter((s) => s.length > 0)
      .map(Number)
      .filter((n) => Number.isFinite(n));
    const a = (i: number, fallback = 0): number => args[i] ?? fallback;

    let next: Matrix | undefined;
    switch (name) {
      case "matrix":
        if (args.length >= 6) next = [a(0), a(1), a(2), a(3), a(4), a(5)];
        break;
      case "translate":
        next = [1, 0, 0, 1, a(0), a(1)];
        break;
      case "scale": {
        const sx = a(0, 1);
        next = [sx, 0, 0, args.length > 1 ? a(1, 1) : sx, 0, 0];
        break;
      }
      case "rotate": {
        const r = deg(a(0));
        const cos = Math.cos(r);
        const sin = Math.sin(r);
        const rot: Matrix = [cos, sin, -sin, cos, 0, 0];
        if (args.length >= 3) {
          const cx = a(1);
          const cy = a(2);
          next = multiply(multiply([1, 0, 0, 1, cx, cy], rot), [1, 0, 0, 1, -cx, -cy]);
        } else {
          next = rot;
        }
        break;
      }
      case "skewx":
        next = [1, 0, Math.tan(deg(a(0))), 1, 0, 0];
        break;
      case "skewy":
        next = [1, Math.tan(deg(a(0))), 0, 1, 0, 0];
        break;
      default:
        next = undefined; // unknown function: ignore
    }
    if (next) out = multiply(out, next);
  }
  return out;
}
