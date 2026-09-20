/**
 * SVG path data (`d`) to subpaths of Bezier segments.
 *
 * Supports M, L, H, V, C, S, Q, T, A and Z in both cases. Arcs are converted to
 * cubics with the endpoint-to-centre parameterisation from the SVG spec, so the
 * rest of the engine only ever sees lines and cubics.
 */
import type { Point } from "./types.js";
import type { PathSegment } from "./flatten.js";

export type SubPath = { start: Point; segments: PathSegment[]; closed: boolean };

const COMMANDS = "MmLlHhVvCcSsQqTtAaZz";

/** Numbers and command letters, in the order they appear. */
function tokenize(d: string): (string | number)[] {
  const out: (string | number)[] = [];
  const re = /([MmLlHhVvCcSsQqTtAaZz])|(-?(?:\d*\.\d+|\d+)(?:[eE][+-]?\d+)?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d)) !== null) {
    if (m[1]) out.push(m[1]);
    else out.push(Number(m[2]));
  }
  return out;
}

/** Cubic approximation of an elliptical arc segment spanning at most 90 degrees. */
function arcSegmentToCubic(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  phi: number,
  theta1: number,
  dTheta: number,
): { c1: Point; c2: Point; to: Point } {
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const t = (4 / 3) * Math.tan(dTheta / 4);
  const theta2 = theta1 + dTheta;

  const at = (theta: number): Point => {
    const x = rx * Math.cos(theta);
    const y = ry * Math.sin(theta);
    return { x: cx + x * cosPhi - y * sinPhi, y: cy + x * sinPhi + y * cosPhi };
  };
  const deriv = (theta: number): Point => {
    const x = -rx * Math.sin(theta);
    const y = ry * Math.cos(theta);
    return { x: x * cosPhi - y * sinPhi, y: x * sinPhi + y * cosPhi };
  };

  const p1 = at(theta1);
  const p2 = at(theta2);
  const d1 = deriv(theta1);
  const d2 = deriv(theta2);
  return {
    c1: { x: p1.x + t * d1.x, y: p1.y + t * d1.y },
    c2: { x: p2.x - t * d2.x, y: p2.y - t * d2.y },
    to: p2,
  };
}

/** Elliptical arc (A command) to a sequence of cubic segments. */
function arcToCubics(
  from: Point,
  rxIn: number,
  ryIn: number,
  xAxisDeg: number,
  largeArc: boolean,
  sweep: boolean,
  to: Point,
): PathSegment[] {
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (rx < 1e-12 || ry < 1e-12) return [{ kind: "line", to }];

  const phi = (xAxisDeg * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);

  const dx2 = (from.x - to.x) / 2;
  const dy2 = (from.y - to.y) / 2;
  const x1 = cosPhi * dx2 + sinPhi * dy2;
  const y1 = -sinPhi * dx2 + cosPhi * dy2;

  // Scale the radii up when they are too small for the distance (SVG F.6.6).
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) {
    const s = Math.sqrt(lambda);
    rx *= s;
    ry *= s;
  }

  const sign = largeArc === sweep ? -1 : 1;
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  const co = den <= 0 ? 0 : sign * Math.sqrt(Math.max(0, num / den));
  const cx1 = (co * rx * y1) / ry;
  const cy1 = (-co * ry * x1) / rx;

  const cx = cosPhi * cx1 - sinPhi * cy1 + (from.x + to.x) / 2;
  const cy = sinPhi * cx1 + cosPhi * cy1 + (from.y + to.y) / 2;

  const angle = (ux: number, uy: number, vx: number, vy: number): number => {
    const dot = ux * vx + uy * vy;
    const len = Math.hypot(ux, uy) * Math.hypot(vx, vy);
    const a = Math.acos(Math.min(1, Math.max(-1, len === 0 ? 1 : dot / len)));
    return ux * vy - uy * vx < 0 ? -a : a;
  };

  const theta1 = angle(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
  let dTheta = angle((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
  if (!sweep && dTheta > 0) dTheta -= 2 * Math.PI;
  if (sweep && dTheta < 0) dTheta += 2 * Math.PI;

  // At most 90 degrees per cubic — beyond that the approximation drifts.
  const steps = Math.max(1, Math.ceil(Math.abs(dTheta) / (Math.PI / 2)));
  const step = dTheta / steps;
  const out: PathSegment[] = [];
  for (let i = 0; i < steps; i++) {
    const { c1, c2, to: end } = arcSegmentToCubic(cx, cy, rx, ry, phi, theta1 + i * step, step);
    out.push({ kind: "cubic", c1, c2, to: end });
  }
  return out;
}

export function parsePathData(d: string): SubPath[] {
  const tokens = tokenize(d);
  const out: SubPath[] = [];
  let current: SubPath | undefined;

  let cur: Point = { x: 0, y: 0 };
  let startOfSub: Point = { x: 0, y: 0 };
  let lastCubicControl: Point | undefined;
  let lastQuadControl: Point | undefined;
  let command = "";
  let i = 0;

  const num = (): number => {
    const t = tokens[i++];
    return typeof t === "number" ? t : 0;
  };
  const has = (n: number): boolean => {
    for (let k = 0; k < n; k++) if (typeof tokens[i + k] !== "number") return false;
    return true;
  };
  const push = (seg: PathSegment): void => {
    if (!current) {
      current = { start: { ...cur }, segments: [], closed: false };
      out.push(current);
    }
    current.segments.push(seg);
  };

  while (i < tokens.length) {
    const t = tokens[i];
    if (typeof t === "string") {
      command = t;
      i++;
      if (command === "Z" || command === "z") {
        if (current) {
          current.closed = true;
          current.segments.push({ kind: "line", to: { ...startOfSub } });
        }
        cur = { ...startOfSub };
        current = undefined;
        continue;
      }
    } else if (command === "" || !COMMANDS.includes(command)) {
      i++; // stray number without a command
      continue;
    }

    const rel = command === command.toLowerCase();
    const abs = (p: Point): Point => (rel ? { x: cur.x + p.x, y: cur.y + p.y } : p);

    switch (command.toUpperCase()) {
      case "M": {
        if (!has(2)) {
          i = tokens.length;
          break;
        }
        const to = abs({ x: num(), y: num() });
        cur = to;
        startOfSub = { ...to };
        current = { start: { ...to }, segments: [], closed: false };
        out.push(current);
        // Further coordinate pairs after an M behave like L.
        command = rel ? "l" : "L";
        lastCubicControl = undefined;
        lastQuadControl = undefined;
        break;
      }
      case "L": {
        if (!has(2)) {
          i = tokens.length;
          break;
        }
        const to = abs({ x: num(), y: num() });
        push({ kind: "line", to });
        cur = to;
        lastCubicControl = undefined;
        lastQuadControl = undefined;
        break;
      }
      case "H": {
        if (!has(1)) {
          i = tokens.length;
          break;
        }
        const x = num();
        const to = { x: rel ? cur.x + x : x, y: cur.y };
        push({ kind: "line", to });
        cur = to;
        lastCubicControl = undefined;
        lastQuadControl = undefined;
        break;
      }
      case "V": {
        if (!has(1)) {
          i = tokens.length;
          break;
        }
        const y = num();
        const to = { x: cur.x, y: rel ? cur.y + y : y };
        push({ kind: "line", to });
        cur = to;
        lastCubicControl = undefined;
        lastQuadControl = undefined;
        break;
      }
      case "C": {
        if (!has(6)) {
          i = tokens.length;
          break;
        }
        const c1 = abs({ x: num(), y: num() });
        const c2 = abs({ x: num(), y: num() });
        const to = abs({ x: num(), y: num() });
        push({ kind: "cubic", c1, c2, to });
        cur = to;
        lastCubicControl = c2;
        lastQuadControl = undefined;
        break;
      }
      case "S": {
        if (!has(4)) {
          i = tokens.length;
          break;
        }
        const c1 = lastCubicControl
          ? { x: 2 * cur.x - lastCubicControl.x, y: 2 * cur.y - lastCubicControl.y }
          : { ...cur };
        const c2 = abs({ x: num(), y: num() });
        const to = abs({ x: num(), y: num() });
        push({ kind: "cubic", c1, c2, to });
        cur = to;
        lastCubicControl = c2;
        lastQuadControl = undefined;
        break;
      }
      case "Q": {
        if (!has(4)) {
          i = tokens.length;
          break;
        }
        const c = abs({ x: num(), y: num() });
        const to = abs({ x: num(), y: num() });
        push({ kind: "quadratic", c, to });
        cur = to;
        lastQuadControl = c;
        lastCubicControl = undefined;
        break;
      }
      case "T": {
        if (!has(2)) {
          i = tokens.length;
          break;
        }
        const c = lastQuadControl
          ? { x: 2 * cur.x - lastQuadControl.x, y: 2 * cur.y - lastQuadControl.y }
          : { ...cur };
        const to = abs({ x: num(), y: num() });
        push({ kind: "quadratic", c, to });
        cur = to;
        lastQuadControl = c;
        lastCubicControl = undefined;
        break;
      }
      case "A": {
        if (!has(7)) {
          i = tokens.length;
          break;
        }
        const rx = num();
        const ry = num();
        const rot = num();
        const largeArc = num() !== 0;
        const sweep = num() !== 0;
        const to = abs({ x: num(), y: num() });
        for (const seg of arcToCubics(cur, rx, ry, rot, largeArc, sweep, to)) push(seg);
        cur = to;
        lastCubicControl = undefined;
        lastQuadControl = undefined;
        break;
      }
      default:
        i = tokens.length; // unknown command: stop rather than misread the rest
    }
  }

  return out.filter((s) => s.segments.length > 0);
}
