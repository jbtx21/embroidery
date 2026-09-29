/**
 * Fineness and minimum size, checked BEFORE stitching (spec §5.2, second version): which
 * elements of a logo are too fine at the ordered size, and from what logo width they hold.
 *
 * A logo that works as a print is not clean in every size when stitched: a satin
 * stroke that is too narrow sinks into the fabric, a gap that is too narrow sews
 * shut. This module only reports. It changes nothing in the template (rule 8, no
 * silent repairs) — sewing it larger, simplifying it or leaving it is the user's
 * decision. It reads the shapes `importShapes` returns, in document order (the
 * stacking order), at the size of the SVG.
 *
 * - **Satin stroke**: a shape the template classifies as satin (`classifyShape`,
 *   spec §7.8.1) whose median width is under `SATIN_STROKE_MIN_MM`.
 * - **Gap**: the shapes of one colour are united and closed by half the limit
 *   (out and back, as `smoothOutline` does, spec §7.8.4). What the closing adds
 *   is a gap narrower than `GAP_MIN_MM`, unless a later shape covers it whole.
 *
 * The width where an element holds is the ordered width times the limit over the
 * measured width — a logo made larger makes every width larger in proportion. There are
 * two numbers, not one:
 *
 * - the **minimum size** comes from the satin strokes alone: the width from which all are at
 *   least `SATIN_STROKE_MIN_MM`, with the narrowest stroke named. Where every stroke holds it is
 *   below the ordered width — how far the logo could shrink;
 * - **all gaps open from** the largest width any gap holds from, with that gap named. Fine
 *   channels (the 0.25 mm between rim and body of varsity lettering) push it far above the
 *   minimum size; whether they may sew shut is the user's call.
 *
 * **The filter for gaps** (spec §5.2, second version). Vectorised logos have hairline slits
 * between shapes of one colour, roundings of every concave corner and slivers a micrometre
 * thin; none is a gap on the fabric. What the closing adds goes through four steps, and
 * each piece that falls out is counted (`ignored`), never dropped silently:
 *
 * 1. Slivers thinner than `GAP_SLIVER_MM` come off before anything is measured: the piece is
 *    opened by half of it. A piece that is nothing but sliver is gone (`slivers`).
 * 2. The width is read every `GAP_SAMPLE_MM` (`medianShapeWidthMm` with `sampleMm`), because
 *    the standard sampling reads a strip of 0.2 mm as 0.32 mm.
 * 3. A piece under `GAP_THIN_MM` — the DST resolution — does not count (`thin`).
 * 4. A piece without a medial axis does not count (`compact`): the rounding of a concave
 *    corner, a short gap between small shapes. Only a hole the closing fills whole, a
 *    counter, is measured by the circle that fits in it, and counts from that circle up.
 *
 * "Without a medial axis" is what `medianShapeWidthMm` finds at its STANDARD sampling. The
 * rule says roundings have none; at 0.1 mm every rounding has one (a right angle rounded at
 * 0.4 mm reads 0.12 mm) and would count as a gap 0.12 mm wide. On six customer logos that is
 * 134, 374, 294, 173, 124 and 2744 gaps instead of 49, 109, 186, 74, 57 and 1153, and "all gaps
 * open from" pinned at eight times the ordered width (the width the 0.1 mm limit allows). So the
 * axis is looked for as the engine always looks for it, and only the width is read finer. The
 * price: a strip between 0.1 and 0.15 mm has no axis at the standard sampling and is left out (a
 * blind band), and so is a compact gap under a millimetre across.
 *
 * Known limits (measured 29.09.2026 on six customer logos):
 *
 * - Small pieces that do have an axis — the wedge where three shapes meet, the tip of a notch,
 *   a hole of 0.1 mm; under a millimetre across, read 0.1 to 0.25 mm — still count, and set
 *   "all gaps open from" on five of the six logos (on the sixth, a slit hole of 0.1 × 1.85 mm).
 *   The channels that matter are 3 mm long or more: with that as a minimum the number would be
 *   163 to 522 mm instead of 365 to 1598 mm.
 * - A strip of 0.05 to 0.1 mm still reads 0.10 to 0.14 mm at 0.1 mm sampling and passes step 3.
 * - The standard sampling grows with the perimeter of a piece (perimeter / 300, up to 2 mm), so
 *   a large piece may lose its axis where a small one of the same width keeps it.
 * - A gap that a later shape covers only in part is reported whole.
 */
import type { Point, Polygon, Rect } from "@texma-stitch/geometry";
import {
  difference,
  intersect,
  offset,
  offsetAll,
  pointInPolygon,
  polygonArea,
  polygonBbox,
  union,
} from "@texma-stitch/geometry";
import type { ImportedAreaShape, ImportedShape } from "../import/svg.js";
import { medianShapeWidthMm } from "../import/svg.js";
import { classifyShape } from "./classify.js";

/**
 * A satin stroke narrower than this is too fine (spec §5.2, decided 29.09.2026).
 * Origin: the TEXMA archive — mean satin width per file over 192 production files,
 * p5 1.29 mm (minimum 1.05, median 1.98).
 */
export const SATIN_STROKE_MIN_MM = 1.3;
/**
 * A gap within one colour narrower than this sews shut (spec §5.2, decided 29.09.2026).
 * ESTIMATE, not a measurement: twice the pull compensation (0.2 mm per side, spec §7.2)
 * plus one thread strand (0.4 mm, `SINGLE_PASS_MAX_MM`). To be measured against
 * professional files and the trial stitch-out.
 */
export const GAP_MIN_MM = 0.8;
/**
 * Slivers thinner than this are taken off a closing piece before it is measured (spec §5.2,
 * second version): the piece is opened by half of it. What the polygon clipper leaves along
 * an edge, and the hairline seams between abutting shapes, are thinner than this.
 */
export const GAP_SLIVER_MM = 0.01;
/**
 * The width of a closing piece is read with the outline sampled this finely (spec §5.2, second
 * version). The standard sampling of `medianShapeWidthMm` reads a strip of 0.2 mm as 0.32 mm.
 */
export const GAP_SAMPLE_MM = 0.1;
/**
 * A closing piece narrower than this is not a gap (spec §5.2, second version): 0.1 mm is the
 * DST resolution, the fabric shows nothing finer.
 */
export const GAP_THIN_MM = 0.1;

/** Reach for "this shape borders the piece": the piece lies on the edges of its neighbours. */
const BORDER_REACH_MM = 0.05;
/** Overlap above this (mm²) is an overlap, not a rounding of the polygon clipper. */
const OVERLAP_MIN_MM2 = 1e-6;
/** A piece is the very hole it fills where area and box agree this closely. */
const HOLE_MATCH_MM = 1e-3;
/** Bisection steps for the inscribed circle: 0.4 mm down to well under a micrometre. */
const INSCRIBED_STEPS = 20;

export type MinimumSizeKind = "satin-stroke" | "gap";

export type MinimumSizeFinding = {
  /**
   * The shape's id for a satin stroke; `gap-<colour>-<nnn>` for a gap, numbered per
   * colour in reading order (top to bottom, left to right) among every piece the closing added,
   * with `-2`, `-3` for the further parts of a piece the opening fell apart.
   */
  id: string;
  kind: MinimumSizeKind;
  color: string;
  /** Width measured at the ordered size, mm. */
  measuredMm: number;
  /**
   * How it was measured: the median width of the shape (spec §5.2), or, for a hole the closing
   * fills whole — a counter, which has no medial axis — the circle that fits in it.
   */
  measure: "median" | "inscribed-circle";
  /** The limit it falls under, mm. */
  limitMm: number;
  /** Logo width, mm, from which the element holds: ordered width × limit ÷ measured width. */
  holdsFromWidthMm: number;
  /**
   * The shape (satin stroke) or the piece the closing added, slivers off (gap): what a preview
   * marks.
   */
  polygon: Polygon;
  /**
   * Where to look, mm: the centre of the polygon's bounding box where that lies on the polygon,
   * else — a ring, a channel round a body — the vertex of its outline nearest to it.
   */
  at: Point;
  /**
   * A satin stroke of 0.7 to 1.3 mm may be a thin decorative line, better set as a running
   * stitch (spec §5.2). The check names the possibility; the user decides.
   */
  runningAlternative: boolean;
};

export type MinimumSizeOptions = {
  /** The ordered logo width: the width of the SVG, mm. */
  widthMm: number;
  /** Default `SATIN_STROKE_MIN_MM`. */
  satinMinMm?: number;
  /** Default `GAP_MIN_MM`. */
  gapMinMm?: number;
};

/** What the gap filter took out — every part that was measured is in one of these or a finding. */
export type MinimumSizeIgnored = {
  /** Pieces of the closing that the opening took off whole: thinner than `GAP_SLIVER_MM` everywhere. */
  slivers: number;
  /** Parts narrower than `GAP_THIN_MM`, or a counter whose circle is. */
  thin: number;
  /**
   * Parts without a medial axis that are not a hole: the rounding of a concave corner (a
   * quarter circle of half the limit leaves (1 − π/4)·0.4² = 0.034 mm² in a right angle), a short
   * gap between small shapes, a hairline too thin for an axis.
   */
  compact: number;
  /** Parts whose median width reads at or above the limit. */
  wide: number;
  /** Gaps under the limit that a later shape of another colour covers completely. */
  covered: number;
};

export type MinimumSizeResult = {
  /** The ordered logo width the check ran at, mm. */
  widthMm: number;
  /** The limits it ran with, mm — the options, or their defaults. */
  limits: { satinMinMm: number; gapMinMm: number };
  /** Both kinds, the largest `holdsFromWidthMm` first. */
  findings: MinimumSizeFinding[];
  /**
   * The minimum size, mm: the logo width from which every satin stroke is at least
   * `limits.satinMinMm` wide. Above `widthMm` where a stroke is too fine, below it where
   * every one holds. Absent for a logo without a satin stroke.
   */
  minimumWidthMm?: number;
  /**
   * The narrowest satin stroke, which sets `minimumWidthMm`. It is in `findings` where it is
   * too fine; otherwise it is the stroke the logo could shrink down to.
   */
  decisive?: MinimumSizeFinding;
  /**
   * The width from which all gaps stay open, mm: the largest `holdsFromWidthMm` of the gap
   * findings. Absent without a gap finding.
   */
  gapsOpenFromWidthMm?: number;
  /** The gap that sets `gapsOpenFromWidthMm`. */
  decisiveGap?: MinimumSizeFinding;
  /** Every piece the closing added, over all colours — before the filter. */
  gapPieces: number;
  /** The parts of those pieces that were measured, once the opening took the slivers off. */
  gapParts: number;
  ignored: MinimumSizeIgnored;
};

/** Logo width from which an element of `measuredMm` holds its `limitMm` (module doc). */
export const holdsFromWidth = (
  orderedWidthMm: number,
  limitMm: number,
  measuredMm: number,
): number => (orderedWidthMm * limitMm) / measuredMm;

/** An area shape with its place in the document and its box. */
type Area = { index: number; shape: ImportedAreaShape; box: Rect };

const centre = (box: Rect): Point => ({
  x: (box.minX + box.maxX) / 2,
  y: (box.minY + box.maxY) / 2,
});

/** A point of the polygon's own to mark it by: the centre of its box, if that is on it (module doc). */
function anchor(polygon: Polygon, box: Rect): Point {
  const c = centre(box);
  if (pointInPolygon(polygon, c)) return c;
  let best = polygon.outer[0] ?? c;
  let bestD = Infinity;
  for (const ring of [polygon.outer, ...polygon.holes]) {
    for (const p of ring) {
      const d = (p.x - c.x) ** 2 + (p.y - c.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
  }
  return best;
}

const boxesOverlap = (a: Rect, b: Rect): boolean =>
  a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY;

const grow = (box: Rect, by: number): Rect => ({
  minX: box.minX - by,
  minY: box.minY - by,
  maxX: box.maxX + by,
  maxY: box.maxY + by,
});

const totalArea = (polys: Polygon[]): number => polys.reduce((sum, p) => sum + polygonArea(p), 0);

/** Reading order, on a grid of 10 µm so that the noise of the last digit does not decide. */
const readingOrder = (p: { box: Rect }, q: { box: Rect }): number =>
  Math.round(p.box.minY * 100) - Math.round(q.box.minY * 100) ||
  Math.round(p.box.minX * 100) - Math.round(q.box.minX * 100);

function satinStrokes(
  areas: Area[],
  widthMm: number,
  limitMm: number,
): { findings: MinimumSizeFinding[]; narrowest: MinimumSizeFinding | undefined } {
  const findings: MinimumSizeFinding[] = [];
  let narrowest: MinimumSizeFinding | undefined;
  for (const { shape, box } of areas) {
    const cls = classifyShape(shape.polygon, shape.id);
    if (cls.shapeClass !== "satin") continue;
    const stroke: MinimumSizeFinding = {
      id: shape.id,
      kind: "satin-stroke",
      color: shape.color,
      measuredMm: cls.widthMm,
      measure: "median",
      limitMm,
      holdsFromWidthMm: holdsFromWidth(widthMm, limitMm, cls.widthMm),
      polygon: shape.polygon,
      at: anchor(shape.polygon, box),
      runningAlternative: cls.widthMm < SATIN_STROKE_MIN_MM,
    };
    // The first of equals stays the narrowest: the same input names the same stroke.
    if (narrowest === undefined || cls.widthMm < narrowest.measuredMm) narrowest = stroke;
    if (cls.widthMm < limitMm) findings.push(stroke);
  }
  return { findings, narrowest };
}

/**
 * What closing by `radiusMm` adds to the united shapes, and the holes of the union.
 *
 * The offsets of separate polygons do not see each other, so the grown polygons are
 * united before they are shrunk — only then does the closing bridge the space between
 * two letters, or between a rim and the body inside it.
 */
function closingPieces(
  polygons: Polygon[],
  radiusMm: number,
): { pieces: Polygon[]; holes: Polygon[] } {
  const united = union(polygons);
  const closed = offsetAll(union(offsetAll(united, radiusMm)), -radiusMm);
  return {
    pieces: difference(closed, united),
    holes: united.flatMap((p) => p.holes.map((ring) => ({ outer: ring, holes: [] }))),
  };
}

/**
 * What is left of the polygons when everything thinner than `GAP_SLIVER_MM` is taken off:
 * an opening (in, then out) by half of it. May be nothing, or fall apart into several parts.
 */
function withoutSlivers(polys: Polygon[]): Polygon[] {
  const r = GAP_SLIVER_MM / 2;
  return offsetAll(offsetAll(polys, -r), r).filter((p) => polygonArea(p) > OVERLAP_MIN_MM2);
}

/** Is the piece exactly a hole of the united shapes, filled whole — a counter, not a gap between shapes? */
function isFilledHole(piece: Polygon, holes: Polygon[]): boolean {
  if (piece.holes.length > 0) return false;
  const box = polygonBbox(piece);
  const area = polygonArea(piece);
  return holes.some((hole) => {
    const h = polygonBbox(hole);
    return (
      Math.abs(box.minX - h.minX) < HOLE_MATCH_MM &&
      Math.abs(box.minY - h.minY) < HOLE_MATCH_MM &&
      Math.abs(box.maxX - h.maxX) < HOLE_MATCH_MM &&
      Math.abs(box.maxY - h.maxY) < HOLE_MATCH_MM &&
      Math.abs(area - polygonArea(hole)) <= HOLE_MATCH_MM * Math.max(1, area)
    );
  });
}

/** Diameter of the largest circle in the piece: the deepest erosion that leaves something. */
function inscribedDiameterMm(piece: Polygon): number {
  const box = polygonBbox(piece);
  let lo = 0;
  let hi = Math.min(box.maxX - box.minX, box.maxY - box.minY) / 2;
  for (let i = 0; i < INSCRIBED_STEPS; i++) {
    const mid = (lo + hi) / 2;
    if (offset(piece, -mid).some((p) => polygonArea(p) > OVERLAP_MIN_MM2)) lo = mid;
    else hi = mid;
  }
  return 2 * lo;
}

/**
 * Width of a part of a closing piece (module doc, steps 2 and 4): its median width, read
 * every `GAP_SAMPLE_MM` — if it has a medial axis, as the engine's own measure finds it. A
 * hole filled whole has none where it is round or square, and is measured by the circle that
 * fits in it. Anything else without an axis is `undefined`.
 */
function gapWidthMm(
  part: Polygon,
  isHole: boolean,
): { widthMm: number; measure: MinimumSizeFinding["measure"] } | undefined {
  if (Number.isFinite(medianShapeWidthMm(part))) {
    const fine = medianShapeWidthMm(part, { sampleMm: GAP_SAMPLE_MM });
    if (Number.isFinite(fine)) return { widthMm: fine, measure: "median" };
  }
  return isHole ? { widthMm: inscribedDiameterMm(part), measure: "inscribed-circle" } : undefined;
}

/**
 * Does a later shape of another colour cover the gap completely (spec §5.2)? Later means
 * after the last shape of the gap's own colour that borders it: that is what lies over the
 * seam, like an outline stitched last. A form stitched before a bordering shape lies under
 * it and shows through the gap — a real gap. A gap covered in part is still a gap; what is
 * left over of it must be more than a sliver.
 */
function coveredByLater(
  part: Polygon,
  box: Rect,
  color: string,
  areas: Area[],
  lastOfColour: number,
): boolean {
  const reach = grow(box, BORDER_REACH_MM);
  const grown = offset(part, BORDER_REACH_MM);
  let last = -1;
  for (const a of areas) {
    if (a.shape.color !== color || !boxesOverlap(a.box, reach)) continue;
    if (totalArea(intersect(grown, [a.shape.polygon])) > OVERLAP_MIN_MM2)
      last = Math.max(last, a.index);
  }
  // Nothing found touching it (cannot be, the piece lies on their edges): count every form
  // after the colour's last shape — fewer covers, never more.
  if (last < 0) last = lastOfColour;
  const later = areas.filter(
    (a) => a.index > last && a.shape.color !== color && boxesOverlap(a.box, box),
  );
  if (later.length === 0) return false;
  const left = difference(
    [part],
    later.map((a) => a.shape.polygon),
  );
  return totalArea(withoutSlivers(left)) < OVERLAP_MIN_MM2;
}

/** A colour as it goes into an id: letters and digits, the rest an underscore. */
const idOfColour = (color: string): string => color.replace(/^#/, "").replace(/[^A-Za-z0-9]/g, "_");

function gaps(
  areas: Area[],
  widthMm: number,
  limitMm: number,
): {
  findings: MinimumSizeFinding[];
  pieces: number;
  parts: number;
  ignored: MinimumSizeIgnored;
} {
  const findings: MinimumSizeFinding[] = [];
  const ignored: MinimumSizeIgnored = { slivers: 0, thin: 0, compact: 0, wide: 0, covered: 0 };
  let pieces = 0;
  let parts = 0;

  // Colours in the order they first appear: the same input gives the same numbering.
  const byColour = new Map<string, Area[]>();
  for (const a of areas) {
    const list = byColour.get(a.shape.color) ?? [];
    list.push(a);
    byColour.set(a.shape.color, list);
  }

  for (const [color, group] of byColour) {
    const closing = closingPieces(
      group.map((a) => a.shape.polygon),
      limitMm / 2,
    );
    const boxed = closing.pieces
      .map((piece) => ({ piece, box: polygonBbox(piece) }))
      .sort(readingOrder);
    const lastOfColour = group.reduce((m, a) => Math.max(m, a.index), -1);
    pieces += boxed.length;

    boxed.forEach(({ piece }, i) => {
      // Whether the piece is a counter is decided on the piece as the closing left it: the
      // opening rounds its corners by a few micrometres, which its match with the hole would not survive.
      const isHole = isFilledHole(piece, closing.holes);
      const rest = withoutSlivers([piece])
        .map((part) => ({ part, box: polygonBbox(part) }))
        .sort(readingOrder);
      if (rest.length === 0) {
        ignored.slivers++;
        return;
      }
      rest.forEach(({ part, box }, k) => {
        parts++;
        const measured = gapWidthMm(part, isHole);
        if (measured === undefined) {
          ignored.compact++;
          return;
        }
        if (measured.widthMm < GAP_THIN_MM) {
          ignored.thin++;
          return;
        }
        if (measured.widthMm >= limitMm) {
          ignored.wide++;
          return;
        }
        if (coveredByLater(part, box, color, areas, lastOfColour)) {
          ignored.covered++;
          return;
        }
        const id = `gap-${idOfColour(color)}-${String(i + 1).padStart(3, "0")}`;
        findings.push({
          id: k === 0 ? id : `${id}-${k + 1}`,
          kind: "gap",
          color,
          measuredMm: measured.widthMm,
          measure: measured.measure,
          limitMm,
          holdsFromWidthMm: holdsFromWidth(widthMm, limitMm, measured.widthMm),
          polygon: part,
          at: anchor(part, box),
          runningAlternative: false,
        });
      });
    });
  }
  return { findings, pieces, parts, ignored };
}

function requirePositive(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive number of millimetres, got ${value}`);
  }
}

/**
 * The fineness check of spec §5.2 (module doc) on the shapes of an SVG, in document order,
 * at the ordered width. Stroked lines are not areas: they neither make a gap nor cover one.
 */
export function checkMinimumSize(
  shapes: ImportedShape[],
  opts: MinimumSizeOptions,
): MinimumSizeResult {
  const { widthMm } = opts;
  const satinMinMm = opts.satinMinMm ?? SATIN_STROKE_MIN_MM;
  const gapMinMm = opts.gapMinMm ?? GAP_MIN_MM;
  requirePositive("widthMm", widthMm);
  requirePositive("satinMinMm", satinMinMm);
  requirePositive("gapMinMm", gapMinMm);

  const areas: Area[] = shapes.flatMap((shape, index) =>
    shape.kind === "area" ? [{ index, shape, box: polygonBbox(shape.polygon) }] : [],
  );

  const satin = satinStrokes(areas, widthMm, satinMinMm);
  const gapResult = gaps(areas, widthMm, gapMinMm);
  // Largest first; ties by kind and id, never by the order the geometry happened to come in.
  const findings = [...satin.findings, ...gapResult.findings].sort(
    (p, q) =>
      q.holdsFromWidthMm - p.holdsFromWidthMm ||
      (p.kind < q.kind ? -1 : p.kind > q.kind ? 1 : 0) ||
      (p.id < q.id ? -1 : p.id > q.id ? 1 : 0),
  );
  // The findings are sorted, so the first gap is the gap that asks for the most.
  const decisiveGap = findings.find((f) => f.kind === "gap");
  return {
    widthMm,
    limits: { satinMinMm, gapMinMm },
    findings,
    ...(satin.narrowest
      ? { minimumWidthMm: satin.narrowest.holdsFromWidthMm, decisive: satin.narrowest }
      : {}),
    ...(decisiveGap ? { gapsOpenFromWidthMm: decisiveGap.holdsFromWidthMm, decisiveGap } : {}),
    gapPieces: gapResult.pieces,
    gapParts: gapResult.parts,
    ignored: gapResult.ignored,
  };
}
