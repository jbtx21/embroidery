/**
 * Shapes with a narrow part next to a wide one, for the split of spec §7.8.7
 * (`packages/engine/src/inkstitch/split.ts`): a stick with a head — the lollipop, the plug
 * with its cable — and the shapes that look like one and must stay whole.
 *
 * They are built with the polygon clipper, so every function here needs `initGeometry()` to
 * have run (call them inside a test or a `beforeAll`, not at import).
 *
 * New fixtures belong here, not inline in a test (CLAUDE.md, "Testdaten").
 */
import type { Polygon, Polyline } from "@texma-stitch/geometry";
import { offsetPolyline, orient, union } from "@texma-stitch/geometry";
import { circle, polygonOf, pt, rect } from "./shapes.js";

/** One stick of `headWithSticks`: a bar along +x from the head, `centreY` off the head's axis. */
export type StickSpec = { centreY?: number; widthMm: number; lengthMm: number };

/**
 * A round head of `headMm` across, centred at the origin, with bars sticking out to the right
 * (+x), each `widthMm` thick and reaching `lengthMm` beyond the head's rim. The first piece of the
 * union — one shape.
 */
export function headWithSticks(headMm: number, sticks: StickSpec[]): Polygon {
  const r = headMm / 2;
  const parts = [
    polygonOf(circle(0, 0, r, 120)),
    // From the middle of the head, so that no gap opens where a bar meets the rim.
    ...sticks.map((s) =>
      polygonOf(rect(0, (s.centreY ?? 0) - s.widthMm / 2, r + s.lengthMm, s.widthMm)),
    ),
  ];
  return union(parts)[0]!;
}

/** The lollipop: a head of 12 mm and one bar of 2.4 mm and 40 mm — what the split is for. */
export const stickWithHead = (headMm = 12, stickMm = 2.4, lengthMm = 40): Polygon =>
  headWithSticks(headMm, [{ widthMm: stickMm, lengthMm }]);

/** A head with two parallel bars, 7 mm apart: two bands. */
export const forkWithHead = (): Polygon =>
  headWithSticks(14, [
    { centreY: -3.5, widthMm: 2.4, lengthMm: 40 },
    { centreY: 3.5, widthMm: 2.4, lengthMm: 40 },
  ]);

/** The stick is a stub: 14 mm long on a 2.4-mm bar, under six widths. */
export const stubbyStick = (): Polygon => stickWithHead(12, 2.4, 14);

/** The bar is a hairline of 0.9 mm: a running stitch's business, not a satin column's. */
export const hairStick = (): Polygon => stickWithHead(12, 0.9, 40);

/**
 * A strip along a centre line, `widthAt(t)` wide at the fraction `t` of the line's points, the ends
 * cut square across the line. Not for lines that turn tighter than half the width.
 */
export function stripAlong(line: Polyline, widthAt: (t: number) => number): Polygon {
  const shifted = offsetPolyline(line, 1);
  const normals = line.map((o, i) => {
    const dx = shifted[i]!.x - o.x;
    const dy = shifted[i]!.y - o.y;
    const l = Math.hypot(dx, dy) || 1;
    return pt(dx / l, dy / l);
  });
  const half = (i: number): number => widthAt(i / Math.max(1, line.length - 1)) / 2;
  const left = line.map((o, i) => pt(o.x + normals[i]!.x * half(i), o.y + normals[i]!.y * half(i)));
  const right = line.map((o, i) =>
    pt(o.x - normals[i]!.x * half(i), o.y - normals[i]!.y * half(i)),
  );
  return polygonOf(orient([...left, ...right.reverse()], true));
}

/**
 * A horse's leg: a block 20 x 16 mm and a bar hanging off its lower edge that tapers from 3.0 mm
 * at the body to 1.0 mm at the foot, `lengthMm` long (40: the proportion of a band). The bar is
 * long enough for a band and wide enough to be satin; only its width varies.
 */
export function taperedLeg(lengthMm = 40): Polygon {
  const block = polygonOf(rect(0, 0, 20, 16));
  const leg = stripAlong(
    [pt(10, 15), pt(10, 15 + lengthMm / 2), pt(10, 15 + lengthMm)],
    (t) => 3.0 - 2.0 * t,
  );
  return union([block, leg])[0]!;
}

/**
 * A lens, 36 mm long and 8 mm at its widest, pointed at both ends — the leaf of the Eislingen logo.
 * What lies outside its wide part are the two tips, and they taper to nothing.
 */
export function lens(lengthMm = 36, widthMm = 8, segments = 60): Polygon {
  const half = lengthMm / 2;
  const top: Polyline = [];
  const bottom: Polyline = [];
  for (let i = 1; i < segments; i++) {
    const x = -half + (i * lengthMm) / segments;
    const h = (widthMm / 2) * (1 - (x / half) ** 2);
    top.push(pt(x, -h));
    bottom.push(pt(x, h));
  }
  return polygonOf(orient([pt(-half, 0), ...top, pt(half, 0), ...bottom.reverse()], true));
}

/**
 * A square plate of 40 mm with a round hole of 36.5 mm: the plate behind the badge of the Köln
 * logo. Four corners are wide; between them run strips 1.75 mm thick at their middle that widen
 * towards the corners.
 */
export function plateWithHole(sideMm = 40, holeMm = 36.5): Polygon {
  const hole = circle(sideMm / 2, sideMm / 2, holeMm / 2, 120);
  return polygonOf(rect(0, 0, sideMm, sideMm), [orient(hole, false)]);
}

/**
 * The cable of the Yer logo, in small: a half ellipse of 11 x 14 mm for the plug, its flat side to
 * the right, and a bar of 2.4 mm that leaves its tip to the left, turns a half circle of radius 6
 * and runs back beneath it, 40 mm to the right. The plug is 121 mm², the bar about 60 mm long.
 */
export function plugAndCable(): Polygon {
  const dome: Polyline = [];
  for (let i = 0; i <= 80; i++) {
    const a = Math.PI / 2 + (Math.PI * i) / 80; // bottom, round the left tip, to the top
    dome.push(pt(11 * Math.cos(a), 7 * Math.sin(a)));
  }
  const head = polygonOf(orient(dome, true));
  // From inside the plug, so that bar and plug are one shape.
  const line: Polyline = [pt(-9.5, 0), pt(-13, 0)];
  for (let i = 1; i <= 24; i++) {
    const a = -Math.PI / 2 - (Math.PI * i) / 24;
    line.push(pt(-13 + 6 * Math.cos(a), 6 + 6 * Math.sin(a)));
  }
  line.push(pt(7, 12), pt(27, 12));
  return union([head, stripAlong(line, () => 2.4)])[0]!;
}
