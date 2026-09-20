/**
 * Simple shapes for unit tests (spec §15): rectangle 20x10, circle r=10, ring
 * r=10/6, arc, S-curve — each as a Bezier path and as a polygon.
 *
 * New fixtures belong here, not inline in a test (CLAUDE.md, "Testdaten").
 */
import type { PathSegment, Point, Polygon, Polyline } from "@texma-stitch/geometry";
import { flattenPath, orient } from "@texma-stitch/geometry";

export const pt = (x: number, y: number): Point => ({ x, y });

/** Control-point distance for a quarter circle drawn as a cubic Bezier. */
const KAPPA = 0.5522847498307936;

export type BezierPath = { start: Point; segments: PathSegment[] };

export const polygonOf = (outer: Polyline, holes: Polyline[] = []): Polygon => ({ outer, holes });

// ---------------------------------------------------------------------------
// Rectangle 20 x 10
// ---------------------------------------------------------------------------

export function rectPath(x = 0, y = 0, w = 20, h = 10): BezierPath {
  return {
    start: pt(x, y),
    segments: [
      { kind: "line", to: pt(x + w, y) },
      { kind: "line", to: pt(x + w, y + h) },
      { kind: "line", to: pt(x, y + h) },
      { kind: "line", to: pt(x, y) },
    ],
  };
}

/** Rectangle as an outer ring, normalised clockwise (SVG system). */
export function rect(x = 0, y = 0, w = 20, h = 10): Polyline {
  return orient([pt(x, y), pt(x + w, y), pt(x + w, y + h), pt(x, y + h)], true);
}

export const RECT_20_10 = rect(0, 0, 20, 10);
export const RECT_20_10_PATH = rectPath(0, 0, 20, 10);

// ---------------------------------------------------------------------------
// Circle r = 10
// ---------------------------------------------------------------------------

/** Circle as four cubic Bezier quarters — the way a vector editor writes it. */
export function circlePath(cx = 0, cy = 0, r = 10): BezierPath {
  const k = KAPPA * r;
  return {
    start: pt(cx + r, cy),
    segments: [
      { kind: "cubic", c1: pt(cx + r, cy + k), c2: pt(cx + k, cy + r), to: pt(cx, cy + r) },
      { kind: "cubic", c1: pt(cx - k, cy + r), c2: pt(cx - r, cy + k), to: pt(cx - r, cy) },
      { kind: "cubic", c1: pt(cx - r, cy - k), c2: pt(cx - k, cy - r), to: pt(cx, cy - r) },
      { kind: "cubic", c1: pt(cx + k, cy - r), c2: pt(cx + r, cy - k), to: pt(cx + r, cy) },
    ],
  };
}

/** Circle with `segments` corners. Fixed start angle — deterministic. */
export function circle(cx = 0, cy = 0, r = 10, segments = 64): Polyline {
  const ring: Polyline = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    ring.push(pt(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
  }
  return orient(ring, true);
}

export const CIRCLE_R10 = circle(0, 0, 10);
export const CIRCLE_R10_PATH = circlePath(0, 0, 10);

// ---------------------------------------------------------------------------
// Ring r = 10 / 6
// ---------------------------------------------------------------------------

/** Annulus: outer circle with a hole. */
export function annulus(cx = 0, cy = 0, rOuter = 10, rInner = 6): Polygon {
  return {
    outer: circle(cx, cy, rOuter),
    holes: [orient(circle(cx, cy, rInner), false)],
  };
}

export const RING_10_6 = annulus(0, 0, 10, 6);
/** The ring as two Bezier paths — outer and hole. */
export const RING_10_6_PATH: BezierPath[] = [circlePath(0, 0, 10), circlePath(0, 0, 6)];

// ---------------------------------------------------------------------------
// Arc
// ---------------------------------------------------------------------------

/** Open circular arc as a polyline. */
export function arc(cx = 0, cy = 0, r = 10, fromDeg = 0, toDeg = 180, segments = 32): Polyline {
  const out: Polyline = [];
  for (let i = 0; i <= segments; i++) {
    const a = ((fromDeg + ((toDeg - fromDeg) * i) / segments) * Math.PI) / 180;
    out.push(pt(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
  }
  return out;
}

/** Half arc (0 to 180 degrees) as two cubic quarters. */
export function arcPath(cx = 0, cy = 0, r = 10): BezierPath {
  const k = KAPPA * r;
  return {
    start: pt(cx + r, cy),
    segments: [
      { kind: "cubic", c1: pt(cx + r, cy + k), c2: pt(cx + k, cy + r), to: pt(cx, cy + r) },
      { kind: "cubic", c1: pt(cx - k, cy + r), c2: pt(cx - r, cy + k), to: pt(cx - r, cy) },
    ],
  };
}

export const ARC_R10 = arc(0, 0, 10, 0, 180);
export const ARC_R10_PATH = arcPath(0, 0, 10);

// ---------------------------------------------------------------------------
// S-curve
// ---------------------------------------------------------------------------

/** S-curve from two half circles — the classic satin test case. */
export function sCurve(x = 0, y = 0, r = 10, segments = 32): Polyline {
  const top = arc(x + r, y + r, r, 180, 360, segments);
  const bottom = arc(x + r, y + 3 * r, r, 180, 0, segments).reverse();
  return [...top, ...bottom.slice(1)];
}

export function sCurvePath(x = 0, y = 0, r = 10): BezierPath {
  const k = KAPPA * r;
  return {
    start: pt(x, y + r),
    segments: [
      { kind: "cubic", c1: pt(x, y + r - k), c2: pt(x + r - k, y), to: pt(x + r, y) },
      {
        kind: "cubic",
        c1: pt(x + r + k, y),
        c2: pt(x + 2 * r, y + r - k),
        to: pt(x + 2 * r, y + r),
      },
      {
        kind: "cubic",
        c1: pt(x + 2 * r, y + r + k),
        c2: pt(x + r + k, y + 2 * r),
        to: pt(x + r, y + 2 * r),
      },
      {
        kind: "cubic",
        c1: pt(x + r - k, y + 2 * r),
        c2: pt(x, y + 2 * r + k),
        to: pt(x, y + 3 * r),
      },
    ],
  };
}

export const S_CURVE = sCurve(0, 0, 10);
export const S_CURVE_PATH = sCurvePath(0, 0, 10);

// ---------------------------------------------------------------------------
// U shape — travel paths (spec §8.5)
// ---------------------------------------------------------------------------

/** Rectangle with a slot cut in from the top. */
export function uShape(w = 20, h = 20, slot = 8): Polygon {
  const left = (w - slot) / 2;
  return {
    outer: orient(
      [
        pt(0, 0),
        pt(left, 0),
        pt(left, h - 4),
        pt(left + slot, h - 4),
        pt(left + slot, 0),
        pt(w, 0),
        pt(w, h),
        pt(0, h),
      ],
      true,
    ),
    holes: [],
  };
}

export const U_SHAPE = uShape();

// ---------------------------------------------------------------------------
// L shape — two arms meeting at a reflex corner (auto-satin, spec §7.7)
// ---------------------------------------------------------------------------

/** L with arms of width `arm`, legs of length `leg`. */
export function lShape(leg = 30, arm = 8): Polygon {
  return {
    outer: orient(
      [pt(0, 0), pt(leg, 0), pt(leg, arm), pt(arm, arm), pt(arm, leg), pt(0, leg)],
      true,
    ),
    holes: [],
  };
}

export const L_SHAPE = lShape();

/** Flatten a fixture path to a polyline — the Bezier and polygon forms should agree. */
export const flattenFixture = (p: BezierPath): Polyline => flattenPath(p.start, p.segments);

// ---------------------------------------------------------------------------
// Letter shapes — the case auto-satin has to survive (spec §7.7.1)
// ---------------------------------------------------------------------------

/** Outline of a stroke of constant width along a polyline, as a closed ring. */
function strokeRing(centre: Polyline, widthMm: number, closed = false): Polyline {
  const h = widthMm / 2;
  const normalAt = (i: number): Point => {
    const a = centre[Math.max(0, i - 1)]!;
    const b = centre[Math.min(centre.length - 1, i + 1)]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: -dy / len, y: dx / len };
  };
  const left = centre.map((p, i) => {
    const n = normalAt(i);
    return pt(p.x + n.x * h, p.y + n.y * h);
  });
  const right = centre.map((p, i) => {
    const n = normalAt(i);
    return pt(p.x - n.x * h, p.y - n.y * h);
  });
  return closed ? left.concat(right.reverse()) : left.concat(right.reverse());
}

/** "T": a crossbar and a stem, one shape, two branches meeting in a junction. */
export function letterT(h = 14, w = 10, stroke = 2.4): Polygon {
  const half = stroke / 2;
  return {
    outer: orient(
      [
        pt(0, 0),
        pt(w, 0),
        pt(w, stroke),
        pt(w / 2 + half, stroke),
        pt(w / 2 + half, h),
        pt(w / 2 - half, h),
        pt(w / 2 - half, stroke),
        pt(0, stroke),
      ],
      true,
    ),
    holes: [],
  };
}

/** "S": one stroke that curves back on itself — the case that broke the old rails. */
export function letterS(h = 14, w = 10, stroke = 2.2, segments = 14): Polygon {
  const spine: Polyline = [];
  // Two half circles stacked, the classic S spine.
  const r = h / 4;
  for (let i = 0; i <= segments; i++) {
    const a = Math.PI * (0.25 + i / segments); // upper bowl, opening right
    spine.push(pt(w / 2 + r * Math.cos(a), h - r + r * Math.sin(a)));
  }
  for (let i = 0; i <= segments; i++) {
    const a = Math.PI * (1.25 + i / segments); // lower bowl, opening left
    spine.push(pt(w / 2 + r * Math.cos(a), r + r * Math.sin(a)));
  }
  return { outer: orient(strokeRing(spine, stroke), true), holes: [] };
}

/** "R": a stem, a bowl and a leg — three branches and a hole. */
export function letterR(h = 14, w = 10, stroke = 2.4): Polygon {
  const half = stroke / 2;
  return {
    outer: orient(
      [
        pt(0, 0),
        pt(stroke, 0),
        pt(stroke, h / 2 - half),
        pt(w - stroke, h / 2 - half),
        pt(w, 0),
        pt(w + stroke, 0),
        pt(w - stroke + half, h / 2),
        pt(w, h / 2 + half),
        pt(w, h),
        pt(0, h),
      ],
      true,
    ),
    holes: [
      orient(
        [
          pt(stroke, h - stroke),
          pt(w - stroke, h - stroke),
          pt(w - stroke, h / 2 + half),
          pt(stroke, h / 2 + half),
        ],
        false,
      ),
    ],
  };
}

export const LETTER_T = letterT();
export const LETTER_S = letterS();
export const LETTER_R = letterR();
