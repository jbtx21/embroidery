/**
 * Fineness and minimum size, checked BEFORE stitching (spec §5.2): which elements
 * of a logo are too fine at the ordered size, and from what logo width they hold.
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
 *   is a gap narrower than `GAP_MIN_MM`; its width is the median width of that
 *   piece (`medianShapeWidthMm`).
 *
 * The width where an element holds is the ordered width times the limit over the
 * measured width — a logo made larger makes every width larger in proportion. The
 * minimum size is the largest of these, and the element that sets it is named.
 *
 * Known limits, measured on the customer logos (29.09.2026) and reported rather
 * than bent (see `docs/backlog.md`): the piece width comes from a medial axis that
 * samples the outline no finer than every 0.3 mm, which reads a 0.3 mm strip as
 * 0.42 mm and a 0.1 mm strip as having no axis at all — so thin gaps are measured
 * a little wide (the width they hold from a little small), and hairline seams
 * between abutting shapes are seen or not seen by the size of that sampling.
 */
import type { Point, Polygon, Rect } from "@texma-stitch/geometry";
import {
  difference,
  intersect,
  offset,
  offsetAll,
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
 * A closing piece smaller than this is computing noise and does not count (spec §5.2):
 * what the round joins of the offset leave along an edge that is not straight.
 */
export const GAP_NOISE_MM2 = 0.02;

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
   * colour in reading order (top to bottom, left to right) among every piece the closing added.
   */
  id: string;
  kind: MinimumSizeKind;
  color: string;
  /** Width measured at the ordered size, mm. */
  measuredMm: number;
  /** The limit it falls under, mm. */
  limitMm: number;
  /** Logo width, mm, from which the element holds: ordered width × limit ÷ measured width. */
  holdsFromWidthMm: number;
  /** The shape (satin stroke) or the piece the closing added (gap): what a preview marks. */
  polygon: Polygon;
  /** Centre of the polygon's bounding box, mm — where to look. */
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

/** What the gap check saw and did not count — every piece the closing added is in one of these or a finding. */
export type MinimumSizeIgnored = {
  /** Pieces under `GAP_NOISE_MM2`. */
  noise: number;
  /**
   * Pieces with no median width that are not a hole: mostly the rounding of a concave
   * corner (a quarter circle of half the limit leaves 0.04 mm² in a right angle), also a
   * short gap between small shapes. `medianShapeWidthMm` counts a shape without a medial
   * axis as wide, and so does this check.
   */
  compact: number;
  /** Pieces whose median width reads at or above the limit (the measure reads thin strips a little wide). */
  wide: number;
  /** Gaps under the limit that a later shape of another colour covers completely. */
  covered: number;
};

export type MinimumSizeResult = {
  /** The ordered logo width the check ran at, mm. */
  widthMm: number;
  /** The limits it ran with, mm — the options, or their defaults. */
  limits: { satinMinMm: number; gapMinMm: number };
  /** Largest `holdsFromWidthMm` first. */
  findings: MinimumSizeFinding[];
  /** Logo width from which every finding holds, mm: the largest `holdsFromWidthMm`. Absent without findings. */
  minimumWidthMm?: number;
  /** The finding that sets `minimumWidthMm`. */
  decisive?: MinimumSizeFinding;
  /** Every piece the closing added, over all colours. */
  gapPieces: number;
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

const boxesOverlap = (a: Rect, b: Rect): boolean =>
  a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY;

const grow = (box: Rect, by: number): Rect => ({
  minX: box.minX - by,
  minY: box.minY - by,
  maxX: box.maxX + by,
  maxY: box.maxY + by,
});

const totalArea = (polys: Polygon[]): number => polys.reduce((sum, p) => sum + polygonArea(p), 0);

function satinStrokes(areas: Area[], widthMm: number, limitMm: number): MinimumSizeFinding[] {
  const out: MinimumSizeFinding[] = [];
  for (const { shape, box } of areas) {
    const cls = classifyShape(shape.polygon, shape.id);
    if (cls.shapeClass !== "satin" || cls.widthMm >= limitMm) continue;
    out.push({
      id: shape.id,
      kind: "satin-stroke",
      color: shape.color,
      measuredMm: cls.widthMm,
      limitMm,
      holdsFromWidthMm: holdsFromWidth(widthMm, limitMm, cls.widthMm),
      polygon: shape.polygon,
      at: centre(box),
      runningAlternative: cls.widthMm < SATIN_STROKE_MIN_MM,
    });
  }
  return out;
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
 * Width of a closing piece: its median width (spec §5.2). A shape with no medial axis has
 * none — `medianShapeWidthMm` counts it as wide, which is right for a corner and wrong for a
 * counter, a hole filled whole: a round or square one of 0.5 mm has no axis either. A counter
 * is measured by the circle that fits in it. Anything else without an axis is `undefined`.
 */
function gapWidthMm(piece: Polygon, holes: Polygon[]): number | undefined {
  const median = medianShapeWidthMm(piece);
  if (Number.isFinite(median)) return median;
  return isFilledHole(piece, holes) ? inscribedDiameterMm(piece) : undefined;
}

/**
 * Does a later shape of another colour cover the gap completely (spec §5.2)? Later means
 * after the last shape of the gap's own colour that borders it: that is what lies over the
 * seam, like an outline stitched last. A form stitched before a bordering shape lies under
 * it and shows through the gap — a real gap. A gap covered in part is still a gap.
 */
function coveredByLater(
  piece: Polygon,
  box: Rect,
  color: string,
  areas: Area[],
  lastOfColour: number,
): boolean {
  const reach = grow(box, BORDER_REACH_MM);
  const grown = offset(piece, BORDER_REACH_MM);
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
    [piece],
    later.map((a) => a.shape.polygon),
  );
  return totalArea(left) < GAP_NOISE_MM2;
}

/** A colour as it goes into an id: letters and digits, the rest an underscore. */
const idOfColour = (color: string): string => color.replace(/^#/, "").replace(/[^A-Za-z0-9]/g, "_");

function gaps(
  areas: Area[],
  widthMm: number,
  limitMm: number,
): { findings: MinimumSizeFinding[]; pieces: number; ignored: MinimumSizeIgnored } {
  const findings: MinimumSizeFinding[] = [];
  const ignored: MinimumSizeIgnored = { noise: 0, compact: 0, wide: 0, covered: 0 };
  let pieces = 0;

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
    // Reading order, on a grid of 10 µm so that the noise of the last digit does not decide.
    const boxed = closing.pieces
      .map((piece) => ({ piece, box: polygonBbox(piece) }))
      .sort(
        (p, q) =>
          Math.round(p.box.minY * 100) - Math.round(q.box.minY * 100) ||
          Math.round(p.box.minX * 100) - Math.round(q.box.minX * 100),
      );
    const lastOfColour = group.reduce((m, a) => Math.max(m, a.index), -1);
    pieces += boxed.length;

    boxed.forEach(({ piece, box }, i) => {
      if (polygonArea(piece) < GAP_NOISE_MM2) {
        ignored.noise++;
        return;
      }
      const measured = gapWidthMm(piece, closing.holes);
      if (measured === undefined) {
        ignored.compact++;
        return;
      }
      if (measured >= limitMm) {
        ignored.wide++;
        return;
      }
      if (coveredByLater(piece, box, color, areas, lastOfColour)) {
        ignored.covered++;
        return;
      }
      findings.push({
        id: `gap-${idOfColour(color)}-${String(i + 1).padStart(3, "0")}`,
        kind: "gap",
        color,
        measuredMm: measured,
        limitMm,
        holdsFromWidthMm: holdsFromWidth(widthMm, limitMm, measured),
        polygon: piece,
        at: centre(box),
        runningAlternative: false,
      });
    });
  }
  return { findings, pieces, ignored };
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

  const gapResult = gaps(areas, widthMm, gapMinMm);
  // Largest first; ties by kind and id, never by the order the geometry happened to come in.
  const findings = [...satinStrokes(areas, widthMm, satinMinMm), ...gapResult.findings].sort(
    (p, q) =>
      q.holdsFromWidthMm - p.holdsFromWidthMm ||
      (p.kind < q.kind ? -1 : p.kind > q.kind ? 1 : 0) ||
      (p.id < q.id ? -1 : p.id > q.id ? 1 : 0),
  );
  const decisive = findings[0];
  return {
    widthMm,
    limits: { satinMinMm, gapMinMm },
    findings,
    ...(decisive ? { minimumWidthMm: decisive.holdsFromWidthMm, decisive } : {}),
    gapPieces: gapResult.pieces,
    ignored: gapResult.ignored,
  };
}
