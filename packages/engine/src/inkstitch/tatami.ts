/**
 * The tatami areas of the Ink/Stitch template: the preset's values as
 * `inkstitch:` attributes (spec §14) and the stitch angle of every area
 * (spec §5.1, §8.2).
 *
 * Ink/Stitch reads a parameter by its attribute name and ignores one it does
 * not know — a misspelt name changes nothing and says nothing. Every name here
 * is one of `lib/elements/fill_stitch.py` (Ink/Stitch commit d59c9ab), and
 * `test/inkstitch.smoke.test.ts` shows for each that it changes the stitches.
 *
 * Three things stay out, or are set only where they hold, and are said so:
 *
 * - **A contour underlay** (`fillUnderlay.contour`, spec §8.6): Ink/Stitch's fill
 *   has the grid underlay only.
 * - **The pull and push compensation** (spec §8.1.1) go into the outline of the
 *   area instead (`template.ts`, the same offset `fill.ts` applies). Ink/Stitch does
 *   have `pull_compensation_mm`, and it works — the rows come out longer by the
 *   amount at either end — but it rebuilds the area from its rows on every stitch
 *   plan (each row buffered, all united, the outline smoothed point by point in
 *   Python), `pnpm inkstitch` computes two plans, and it has no push. Measured with
 *   the `pique` preset: STUTTGART 80 mm 64 s → 325 s, Köln 90 mm 245 s → 989 s,
 *   STUTTGART 250 mm still in the first plan after 40 minutes (the whole run takes
 *   6 minutes without the attribute).
 * - **The grid underlay where it does not hold** (`gridUnderlay`): Ink/Stitch insets
 *   the area and stitches every piece the inset falls apart into as a stitch group
 *   of its own — in the order its geometry library hands them over, one after the
 *   other with no trim between, and a piece no row reaches as a ring of stitches
 *   round it. On a ragged outline that is hundreds of pieces. Measured with the
 *   attribute set everywhere: threads over 5 mm left uncut on the fabric, none
 *   before, in five of the six customer logos (4 to 55, the longest 79 mm), and up
 *   to 14 needle penetrations in a 0,2 mm cell where there had been 10.
 */
import type { Polygon } from "@texma-stitch/geometry";
import { applyToPolygon, offset, offsetDirectional, rotator, union } from "@texma-stitch/geometry";
import { bestFillAngle, CONTOUR_MIN_WIDTH_MM, keepWide, scanlines } from "../fill.js";
import { DEFAULT_ANGLE_DEG, touchesOrCovers } from "../import/svg.js";
import type { Preset } from "../presets.js";

/** Stitch length of the grid underlay (spec §8.6: 3.0 mm, as `fill.ts` sets it). */
export const FILL_UNDERLAY_STITCH_MM = 3.0;

/** Same as `template.ts`: four decimals, no trailing zeros. */
const num = (n: number): string => (Math.round(n * 1e4) / 1e4).toString();

/** An angle as a line has it: rows have no direction, so 135 degrees are -45. In (-90, 90]. */
function wrapLine(deg: number): number {
  let x = ((deg % 180) + 180) % 180;
  if (x > 90) x -= 180;
  return x === 0 ? 0 : x;
}

/**
 * The stitch angle of a fill (`fill.ts`, clockwise on the y-down page) as
 * Ink/Stitch's `inkstitch:angle` has it: counter-clockwise. The same rows, the
 * opposite sign.
 */
export function inkstitchAngleDeg(angleDeg: number): number {
  return wrapLine(-angleDeg);
}

/**
 * The Ink/Stitch parameters of one tatami area (module doc). `angleDeg` is the
 * fill's own angle (`fillAngles`). The underlay follows §8.6: a single layer
 * across the rows, or two layers 45 degrees either side of them — unless `grid`
 * is false (`gridUnderlay`), which switches it off.
 */
export function tatamiAttributes(
  preset: Preset,
  angleDeg: number,
  grid = true,
): Record<string, string> {
  const angle = inkstitchAngleDeg(angleDeg);
  const u = preset.fillUnderlay;
  const underlay: Record<string, string> =
    u.fill === "none" || !grid
      ? { fill_underlay: "false" }
      : {
          fill_underlay: "true",
          fill_underlay_angle:
            u.fill === "double"
              ? `${num(wrapLine(angle + 45))} ${num(wrapLine(angle - 45))}`
              : num(wrapLine(angle + 90)),
          fill_underlay_row_spacing_mm: num(u.spacingMm),
          fill_underlay_inset_mm: num(u.insetMm),
          fill_underlay_max_stitch_length_mm: num(FILL_UNDERLAY_STITCH_MM),
        };
  return {
    row_spacing_mm: num(preset.fillRowSpacingMm),
    max_stitch_length_mm: num(preset.fillStitchLengthMm),
    staggers: num(preset.fillStaggerRows),
    angle: num(angle),
    ...underlay,
  };
}

/** The stitch angles of the underlay layers, in `fill.ts` direction (spec §8.6). */
function underlayAngles(preset: Preset, angleDeg: number): number[] {
  return preset.fillUnderlay.fill === "double" ? [angleDeg - 45, angleDeg + 45] : [angleDeg + 90];
}

/** Whether the grid underlay of an area is set, and into how many pieces its inset falls. */
export type GridUnderlay = {
  grid: boolean;
  /** Pieces of the inset outline: 0 where the area is too narrow for an inset, 1 where it holds. */
  pieces: number;
};

/**
 * How far the inset may differ before the pieces it falls into are counted again
 * (`gridUnderlay`): Ink/Stitch insets with shapely, we with Clipper, whose arcs stray
 * by up to 0,02 mm (`ARC_TOLERANCE_MM`). A neck 0,8 mm wide is one piece in ours and
 * two in theirs — measured on Atzensport 80 mm: a jump of 72 mm between two underlay
 * pieces. With 0,03 mm the six customer logos come out at no such jump; 0,05 mm
 * would take the underlay off the large areas of Eislingen and Atzensport 200 mm as
 * well (12 and 58 % of their tatami area instead of 96 and 99 %).
 */
export const UNDERLAY_INSET_MARGIN_MM = 0.03;

/**
 * Whether Ink/Stitch's grid underlay suits an area (module doc): the inset outline
 * has to be ONE piece — at the preset's inset and a little either side of it
 * (`UNDERLAY_INSET_MARGIN_MM`), so that a neck on the edge does not decide — wide
 * enough for two needle tracks somewhere (spec §8.6, `CONTOUR_MIN_WIDTH_MM`: the inset
 * of a band is a band whose two edges are the same track, and an underlay there only
 * perforates it), and every layer's rows have to reach it.
 *
 * Where it does not hold, the cover stitches carry the area alone — as spec §8.6
 * says of a web, which the top stitches hold anyway.
 */
export function gridUnderlay(polygon: Polygon, preset: Preset, angleDeg: number): GridUnderlay {
  const u = preset.fillUnderlay;
  if (u.fill === "none") return { grid: false, pieces: 0 };
  const inset = Math.abs(u.insetMm);
  const inner = offset(polygon, -inset);
  if (inner.length !== 1) return { grid: false, pieces: inner.length };
  const around = [inset - UNDERLAY_INSET_MARGIN_MM, inset + UNDERLAY_INSET_MARGIN_MM].map(
    (d) => offset(polygon, -Math.max(d, 0)).length,
  );
  if (around.some((n) => n > 1)) return { grid: false, pieces: Math.max(...around) };
  const piece = inner[0]!;
  const wide = keepWide([piece], CONTOUR_MIN_WIDTH_MM).length > 0;
  const rows = underlayAngles(preset, angleDeg).every(
    (angle) => scanlines(applyToPolygon(rotator(-angle), piece), u.spacingMm).length > 0,
  );
  return { grid: wide && rows, pieces: 1 };
}

/** An area after its pull and push compensation (`compensateArea`). */
export type Compensation = {
  polygon: Polygon;
  /**
   * `full`: pull and push. `pull`: the push would have cut the area apart, so only the pull was
   * applied. `none`: the compensation would have made the area vanish (or, for a pull that
   * shrinks, cut it apart), so it stays as it is.
   */
  how: "full" | "pull" | "none";
  /** Parts the full compensation gave: 1 where it held, 0 where the area vanished. */
  parts: number;
};

/**
 * Pull and push compensation of one area, in the direction of its rows (spec §8.1.1):
 * out by `pullCompMm` along `angleDeg`, in by `pushCompMm` across it — the very offset
 * `fill.ts` applies (`offsetDirectional`).
 *
 * An area the compensation makes vanish stays as it is (spec §8.1.1). One the push cuts
 * apart gets the pull alone: `fill.ts` stitches the parts one after the other, but as
 * objects of the template every part is a trim and a jump of its own — measured on
 * Eislingen 200 mm, two hairline areas of 42 and 18 mm² fell into 55 and 110 parts
 * (108 of them under 1 mm²) and took the run from 4,1 to 6,6 trims per 1000 stitches.
 * A pull only grows the area, so it never cuts one.
 *
 * The outline is put on the 1 µm grid Clipper works on (`union`). The offset leaves
 * coordinates of any precision, with spikes thinner than the four decimals the SVG
 * holds; rounded, such a spike crosses itself, and Ink/Stitch's shapely mends that
 * into several polygons with jumps between them — measured on Atzensport 80 mm: one
 * open jump of 72 mm.
 */
export function compensateArea(polygon: Polygon, angleDeg: number, preset: Preset): Compensation {
  const { pullCompMm, pushCompMm } = preset;
  if (pullCompMm === 0 && pushCompMm === 0) return { polygon, how: "full", parts: 1 };
  const full = union(offsetDirectional(polygon, pullCompMm, pushCompMm, angleDeg));
  if (full.length === 1) return { polygon: full[0]!, how: "full", parts: 1 };
  if (full.length === 0) return { polygon, how: "none", parts: 0 };
  const pulled = union(offsetDirectional(polygon, pullCompMm, 0, angleDeg));
  return pulled.length === 1
    ? { polygon: pulled[0]!, how: "pull", parts: full.length }
    : { polygon, how: "none", parts: full.length };
}

/** One object of the template, as far as its stitch angle goes. */
export type AngleNode = {
  /** The source shape — the parts a knockdown cuts one shape into share it and do not cross. */
  shapeId: string;
  /** What the object lies on: the outline of its source shape. */
  cover: Polygon | undefined;
  /** The area as it is stitched — set for a tatami, which is what gets an angle. */
  polygon: Polygon | undefined;
};

/**
 * The stitch angle of every tatami, in the stitch order (`fill.ts` direction;
 * `undefined` for what is no tatami).
 *
 * The angle at which the rows break least, where that is plainly better
 * (`bestFillAngle`, spec §8.2), else the diagonal of §5.1 — and a shape that
 * covers or touches one stitched before it takes -45 degrees instead of 45, so
 * the directions cross at the seam instead of running side by side.
 */
export function fillAngles(nodes: AngleNode[], rowSpacingMm: number): (number | undefined)[] {
  return nodes.map((node, k) => {
    const area = node.polygon;
    if (area === undefined) return undefined;
    const crosses = nodes
      .slice(0, k)
      .some(
        (before) =>
          before.shapeId !== node.shapeId &&
          before.cover !== undefined &&
          touchesOrCovers(before.cover, area),
      );
    const fewest = bestFillAngle(area, rowSpacingMm, DEFAULT_ANGLE_DEG);
    return fewest === DEFAULT_ANGLE_DEG && crosses ? -DEFAULT_ANGLE_DEG : fewest;
  });
}
