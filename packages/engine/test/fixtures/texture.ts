/**
 * Fixtures for the texture cleaning (spec §5.3): own shapes, no customer logos. What they stand for:
 *
 * - `grainBar`: a letter stroke of an abrasion typeface — a bar with grains (tiny square holes) in it.
 * - `crownBand`, `counterBlock`: drawn small holes that are no texture (the crowns in the red band of a
 *   coat of arms, the counters of small lettering) — the cleaning must leave them.
 * - `splinterScene`: a textured bar with the parts the vector art leaves round it.
 *
 * All are drawn for the ordered size; `scaledAt` (gate.ts) reads them at another one.
 */
import type { Polygon, Polyline } from "@texma-stitch/geometry";
import { orient } from "@texma-stitch/geometry";
import type { ImportedAreaShape } from "../../src/import/svg.js";
import { areaShape, polygonOf, pt, rect } from "./shapes.js";

export const WHITE = "#ffffff";
export const BROWN = "#ce9d72";
export const BLACK = "#231f20";

/** A square hole of `areaMm2` centred on (cx, cy), wound as a hole. */
export function squareHole(cx: number, cy: number, areaMm2: number): Polyline {
  const s = Math.sqrt(areaMm2) / 2;
  return orient(
    [pt(cx - s, cy - s), pt(cx + s, cy - s), pt(cx + s, cy + s), pt(cx - s, cy + s)],
    false,
  );
}

/** A rectangular hole `w` × `h` centred on (cx, cy): a slit where one side is thin. */
export function slitHole(cx: number, cy: number, w: number, h: number): Polyline {
  return orient(
    [
      pt(cx - w / 2, cy - h / 2),
      pt(cx + w / 2, cy - h / 2),
      pt(cx + w / 2, cy + h / 2),
      pt(cx - w / 2, cy + h / 2),
    ],
    false,
  );
}

/**
 * A triangular hole of about 5·10⁻⁶ mm²: the rounding debris a path conversion leaves — three points a
 * few micrometres apart (measured 5·10⁻⁷ to 1.4·10⁻⁵ mm² in the customer logos).
 */
export function debrisHole(cx: number, cy: number): Polyline {
  return orient([pt(cx, cy), pt(cx + 0.003, cy), pt(cx, cy + 0.003)], false);
}

/**
 * A bar `lengthMm` × `widthMm` with `grains` square holes of `grainMm2` each, in two rows over the
 * first `spanMm` of its length. At 30 × 1.6 mm with 100 grains of 0.02 mm² the median width reads
 * 0.58 mm — a running stitch — where the bar is 1.6 mm wide and satin (measured in the engine,
 * 02.10.2026).
 */
export function grainBar(
  lengthMm = 30,
  widthMm = 1.6,
  grains = 100,
  grainMm2 = 0.02,
  x = 0,
  y = 0,
  spanMm = lengthMm,
): Polygon {
  const holes: Polyline[] = [];
  const perRow = Math.ceil(grains / 2);
  for (let i = 0; i < perRow; i++) {
    const gx = x + ((i + 1) * spanMm) / (perRow + 1);
    holes.push(squareHole(gx, y + widthMm * 0.33 + (i % 3) * 0.03, grainMm2));
    if (holes.length < grains) {
      holes.push(
        squareHole(gx + spanMm / (2 * (perRow + 1)), y + widthMm * 0.67 - (i % 3) * 0.03, grainMm2),
      );
    }
  }
  return polygonOf(rect(x, y, lengthMm, widthMm), holes);
}

/**
 * The bar the gate sees (spec §5.2, §5.3): 40 × 1.4 mm with 80 grains of 0.01 mm². Its median width
 * reads 0.71 mm — satin, under the limit of 1.0 mm — where the bar is 1.4 mm wide and holds. Left
 * as it is, the gate asks for 113 mm instead of 80 mm (measured in the engine, 02.10.2026).
 */
export const satinGrainBar = (): Polygon => grainBar(40, 1.4, 80, 0.01);

/**
 * A block with a drawn counter of 3 mm² and two small ones of 0.3 and 0.4 mm² — the counters of small
 * lettering (0.26 to 0.42 mm² in the STUTTGART logo): no grain, no texture.
 */
export function counterBlock(): Polygon {
  return polygonOf(rect(0, 0, 14, 8), [
    squareHole(4, 4, 3),
    squareHole(9, 2.5, 0.3),
    squareHole(9.5, 5.5, 0.4),
  ]);
}

/**
 * The red band of a coat of arms in miniature: 20 × 4 mm with eight drawn slits of 1.9 × 0.04 mm
 * (0.076 mm²) and six small windows of 0.44 × 0.73 mm (0.32 mm²) — the crowns. Every hole is above
 * 0.05 mm², the grain limit: the cleaning leaves them.
 */
export function crownBand(): Polygon {
  const holes: Polyline[] = [];
  for (let i = 0; i < 8; i++) holes.push(slitHole(2 + i * 2.2, 3.2, 1.9, 0.04));
  for (let i = 0; i < 6; i++) holes.push(slitHole(2.5 + i * 3, 1.2, 0.44, 0.73));
  return polygonOf(rect(0, 0, 20, 4), holes);
}

/** A part `w` × `h` with its upper left corner at (x, y). */
export const partAt = (x: number, y: number, w: number, h: number): Polygon =>
  polygonOf(rect(x, y, w, h));

/**
 * A textured bar (30 × 1.6 mm, 100 grains of 0.02 mm² over its first 24 mm, one medium hole of
 * 0.3 mm² further on) with what the vector art leaves round it. y = 0 is the bar's upper edge; its
 * lower edge is at y = 1.6.
 *
 * | id | what | why it goes or stays |
 * |---|---|---|
 * | `bar` | the textured shape | has grains: its holes under 0.5 mm² go |
 * | `splinter` | 1.0 × 0.8 mm below the bar, 0.15 mm off | a splinter: closes into the bar |
 * | `chain` | 0.6 × 0.6 mm, 0.3 mm below the splinter | within reach of the splinter, not of the bar: follows it |
 * | `dot` | 1.4 × 1.4 mm above the bar, 0.66 mm off | beyond the reach: an i-dot stays a part of its own |
 * | `on-brown` | 1.0 × 0.8 mm, 0.15 mm off, lying on a brown area | not on bare ground: stays |
 * | `big` | 3.0 × 2.0 mm (6 mm²), 0.15 mm off | over 4 mm²: stays |
 * | `speck`, `speck-tiny` | 0.2 × 0.2 mm (0.04 mm²), 0.1 × 0.1 mm | under 0.05 mm²: dropped |
 * | `eye` | 0.3 × 0.3 mm (0.09 mm²) alone | above 0.05 mm², no neighbour: stays |
 * | `brown` | the area `on-brown` lies on | another colour: untouched |
 */
export function splinterScene(): ImportedAreaShape[] {
  // the grains cover the first 24 mm; the medium hole sits where there are none
  const bar = grainBar(30, 1.6, 100, 0.02, 0, 0, 24);
  bar.holes.push(squareHole(27, 0.8, 0.3));
  return [
    areaShape("bar", bar, WHITE),
    areaShape("splinter", partAt(3, 1.75, 1.0, 0.8), WHITE),
    areaShape("chain", partAt(3, 2.85, 0.6, 0.6), WHITE),
    areaShape("dot", partAt(10, -2.06, 1.4, 1.4), WHITE),
    areaShape("brown", partAt(18, 2.1, 6, 4), BROWN),
    areaShape("on-brown", partAt(20, 1.75, 1.0, 0.8), WHITE),
    areaShape("big", polygonOf(rect(24, 1.75, 3, 2)), WHITE),
    areaShape("speck", partAt(8, 6, 0.2, 0.2), WHITE),
    areaShape("speck-tiny", partAt(9, 6, 0.1, 0.1), WHITE),
    areaShape("eye", partAt(12, 6, 0.3, 0.3), WHITE),
  ];
}
