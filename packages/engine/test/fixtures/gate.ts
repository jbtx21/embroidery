/**
 * Fixtures for the minimum-size gate (spec §5.2, "Tor"): the shadow-line limit and the search
 * over the size. Own shapes, no customer logos.
 *
 * All scenes are drawn for a logo 80 mm wide (`ORDERED_MM`); `scaledAt` reads them at any other
 * width the way `importShapes` reads the same SVG at another size — every coordinate scaled.
 */
import type { Point, Polygon } from "@texma-stitch/geometry";
import type { ImportedShape } from "../../src/import/svg.js";
import { areaShape, letterT, lineShape, polygonOf, pt, rect } from "./shapes.js";

/** The width the scenes are drawn for, mm. */
export const ORDERED_MM = 80;

export const GOLD = "#d1b35a";
export const RED = "#c8102e";
export const GRAY = "#bebebe";

/** A bar `lenMm` long and `widthMm` wide, its upper left corner at (x, y). */
export const barAt = (x: number, y: number, lenMm: number, widthMm: number): Polygon =>
  polygonOf(rect(x, y, lenMm, widthMm));

/**
 * The gold shadow line of the Hofbräu motif in miniature (spec §5.2): a bar of `barMm` and, `gapMm`
 * below it, a red letter stroke of 3 mm — wide enough not to be a finding of its own.
 */
export function shadowScene(gapMm: number, barMm = 0.9): ImportedShape[] {
  return [
    areaShape("schatten", barAt(0, 0, 40, barMm), GOLD),
    areaShape("buchstabe", barAt(0, barMm + gapMm, 40, 3), RED),
  ];
}

/** The same bar with nothing near it. */
export const aloneScene = (barMm = 0.9): ImportedShape[] => [
  areaShape("schatten", barAt(0, 0, 40, barMm), GOLD),
];

/**
 * A "T" of 0.9 mm strokes — two columns: the crossbar and the stem — with a red block 0.5 mm from
 * ONE of them. `"stem"`: to the left of the stem; `"bar"`: above the crossbar. The block lies at least
 * 1.1 mm from the other column, so that only one column has a rail at a fabric gap.
 */
export function tScene(near: "stem" | "bar" | "none", strokeMm = 0.9): ImportedShape[] {
  const t = areaShape("t", letterT(14, 10, strokeMm), GOLD);
  if (near === "none") return [t];
  // The stem's left edge lies at 5 − stroke/2; the block ends 0.5 mm before it.
  const block =
    near === "stem" ? barAt(2, 2, 5 - strokeMm / 2 - 0.5 - 2, 10) : barAt(1, -3.5, 8, 3);
  return [t, areaShape("block", block, RED)];
}

/**
 * A stroke of 0.85 mm (satin and too narrow at 80 mm) and, far from it, a bar of `hairMm`: a
 * running stitch at 80 mm that turns satin as the logo grows — the case of the grey stroke in the
 * STUTTGART logo (0.47 mm at 80 mm, 0.70 mm at 120 mm). It is not one of the strokes of the ordered
 * size: it does not set the size the stroke sets, and in that size it is a check point.
 */
export function growScene(hairMm: number): ImportedShape[] {
  return [
    areaShape("strich", barAt(0, 0, 40, 0.85), GOLD),
    areaShape("haar", barAt(0, 20, 40, hairMm), GRAY),
  ];
}

/**
 * A stroke of `barMm` (0.8 mm) with a red block 0.9 mm below it: at 80 mm a shadow line (the gap is
 * under 1.0 mm), from 1.0 ÷ 0.9 = 1.11 times the size on an ordinary stroke again — as a drawing
 * measured in the size it is stitched in, not as the gate holds it (the gate keeps the status of
 * the ordered size, spec §5.2, Tor).
 */
export function fadingScene(barMm = 0.8): ImportedShape[] {
  return [
    areaShape("schatten", barAt(0, 0, 40, barMm), GOLD),
    areaShape("buchstabe", barAt(0, barMm + 0.9, 40, 3), RED),
  ];
}

/**
 * The shadow line that fades (`fadingScene`, 0.72 mm) and, far from it, a free stroke of 0.8 mm
 * that is too narrow at 80 mm and sets the size: where it holds (97 mm) the gap of the shadow line
 * is 1.09 mm — no gap any more — and the stroke 0.9 mm wide. Held to the limit it had at 80 mm
 * (a shadow line: 0.7 mm) it still holds; measured afresh it would be too narrow.
 */
export function frozenScene(): ImportedShape[] {
  return [...fadingScene(0.72), areaShape("frei", barAt(0, 30, 40, 0.8), GRAY)];
}

/**
 * A speck of 1.5 × 0.75 mm at 80 mm, the way a vectorisation leaves them. The median width of a shape
 * this small is no smooth function of the size: where its medial axis changes it jumps — 0.995 mm at
 * 103 mm, 0.842 mm at 104 mm, 1.002 mm at 105 mm, 0.987 mm at 110 mm, 1.057 mm at 111 mm. By proportion
 * the search asks for 104 mm, then for 124 mm and holds there. But every size from 111 mm holds and
 * 110 mm does not — and 105 to 109 mm hold on their own, with a failing size above them.
 */
export const jumpScene = (): ImportedShape[] => [
  areaShape("splitter", barAt(0, 0, 1.5, 0.75), GOLD),
];

/**
 * A speck of 1.8 × 0.88 mm: 0.992 mm at 87 mm, 0.999 mm at 89 mm, 0.872 mm at 90 mm, over 1.0 mm from
 * 91 mm on. The proportion goes 80 → 87 → 88 → 90 → 104; the last size it found failing is 90 mm, and
 * every size above it holds — the smallest is the one right above the last that failed.
 */
export const reachScene = (): ImportedShape[] => [
  areaShape("splitter", barAt(0, 0, 1.8, 0.88), GOLD),
];

/** A stroked line 0.5 mm from the bar: what the template counts as a form too (`lineCover`). */
export function lineNeighbourScene(gapMm: number, barMm = 0.9): ImportedShape[] {
  // The cover of a line is a strip of 0.5 mm: its edge lies half of it from the line.
  const y = barMm + gapMm + 0.25;
  return [
    areaShape("schatten", barAt(0, 0, 40, barMm), GOLD),
    lineShape("linie", [pt(0, y), pt(40, y)], RED),
  ];
}

const scaleRing = (ring: Point[], f: number): Point[] => ring.map((p) => pt(p.x * f, p.y * f));

/**
 * The shapes of a scene (drawn `orderedMm` wide) at another logo width: what `importShapes` reads
 * from the same SVG once its `width` is rewritten (`tools/breite.mjs`) — every coordinate scaled.
 */
export const scaledAt =
  (shapes: ImportedShape[], orderedMm = ORDERED_MM) =>
  (widthMm: number): ImportedShape[] => {
    const f = widthMm / orderedMm;
    return shapes.map((s) =>
      s.kind === "area"
        ? {
            ...s,
            polygon: {
              outer: scaleRing(s.polygon.outer, f),
              holes: s.polygon.holes.map((h) => scaleRing(h, f)),
            },
          }
        : { ...s, polyline: scaleRing(s.polyline, f) },
    );
  };

const pathD = (poly: Polygon): string =>
  [poly.outer, ...poly.holes]
    .map((ring) => `M ${ring.map((p) => `${p.x},${p.y}`).join(" L ")} Z`)
    .join(" ");

/**
 * A scene as an SVG document, `widthMm` × `heightMm` with a viewBox of the same numbers — the form a
 * customer file has, for the tools that read a file (`tools/tor.mjs`). Areas only.
 */
export function svgOf(shapes: ImportedShape[], widthMm = ORDERED_MM, heightMm = 30): string {
  const paths = shapes.flatMap((s) =>
    s.kind === "area"
      ? [
          `<path id="${s.id}" d="${pathD(s.polygon)}" fill-rule="evenodd" ` +
            `style="fill:${s.color};stroke:none"/>`,
        ]
      : [],
  );
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${widthMm}mm" height="${heightMm}mm" ` +
    `viewBox="0 0 ${widthMm} ${heightMm}">${paths.join("")}</svg>`
  );
}

/**
 * A strip of 0.9 mm as an SVG without a viewBox: the coordinates are pixels (3.4016 px = 0.9 mm), and
 * the file cannot be read at another size — `tools/breite.mjs` needs the viewBox to rewrite the width.
 */
export const SVG_NO_VIEWBOX =
  `<svg xmlns="http://www.w3.org/2000/svg" width="80mm" height="30mm">` +
  `<path id="strich" d="M 0,0 L 151.18,0 L 151.18,3.4016 L 0,3.4016 Z" ` +
  `style="fill:#d1b35a;stroke:none"/></svg>`;
