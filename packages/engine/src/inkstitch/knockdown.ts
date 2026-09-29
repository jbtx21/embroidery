/**
 * Knockdown for the Ink/Stitch template (spec §4.1, §4.2): what a later tatami
 * area covers is cut out of the earlier ones, so the spot is not stitched twice.
 *
 * The rules — the later one cuts whatever the colour, 20 mm² threshold, the lower
 * area stays 0.8 mm under the upper one, areas that only touch grow under each
 * other — are those of `resolveOverlaps` and are not rebuilt here. This is the
 * adapter from the template's areas onto the fill objects it works on, with the
 * reach for touching areas the template asks for (`TEMPLATE_TOUCH_UNDERLAP_MM`,
 * §4.2 rule 2). Only tatami reaches it, in stitch order: a satin shape or a
 * running stitch cuts nothing out of another fill there (§4.1 rule 1).
 *
 * The one thing §4.2 adds — a later satin shape spares its place out of the tatami
 * beneath it (rule 1) — is `cutOutSatin`, on the parts `knockdownAreas` left.
 */
import type { Polygon } from "@texma-stitch/geometry";
import { bbox, difference, intersect, offset, polygonArea } from "@texma-stitch/geometry";
import { KNOCKDOWN_MIN_MM2, resolveOverlaps } from "../resolve-overlaps.js";
import type { FillObject, Warning } from "../types.js";

/**
 * How far an area grows under a later one it only touches, in the template
 * (spec §4.2 rule 2). §4.1 says 0.8 mm; 0.3 mm holds against a gap at the seam
 * until the trial stitch shows whether more is needed.
 */
export const TEMPLATE_TOUCH_UNDERLAP_MM = 0.3;

export type KnockdownOptions = {
  /** Reach under a later area that is only touched. Default: `resolveOverlaps`' own (0.8 mm). */
  touchUnderlapMm?: number;
};

/** One tatami area, as the template has it. */
export type KnockdownItem = { id: string; polygon: Polygon };

export type KnockdownResult = {
  /**
   * What every area is stitched as afterwards, in the order given: one polygon
   * for an area the cut left whole, several for one it split. An area covered
   * completely is missing.
   */
  areas: Map<string, Polygon[]>;
  /** Areas covered completely by later ones — not stitched (`FILL_COVERED`, info). */
  covered: string[];
  warnings: Warning[];
};

/**
 * `resolveOverlaps` only reads the shape, the id and `cutsBelow`; the rest is
 * what the type asks for. The id is the position in the list, so a split part
 * (`"3#1"`) leads back to its area without trusting anybody's naming.
 */
function asFill(index: number, polygon: Polygon): FillObject {
  return {
    id: String(index),
    type: "fill",
    threadIndex: 0,
    visible: true,
    locked: false,
    trimAfter: "auto",
    shape: polygon,
    angleDeg: 0,
    rowSpacingMm: 0.4,
    stitchLengthMm: 4,
    staggerRows: 4,
    pullCompMm: 0,
    pushCompMm: 0,
    underlapMm: 0,
    cutsBelow: "auto",
    underlay: { contour: false, fill: "none", spacingMm: 2, insetMm: 0.4 },
  };
}

/** Cuts the areas, later out of earlier (module doc). `items` are in stitch order. */
export function knockdownAreas(
  items: KnockdownItem[],
  opts: KnockdownOptions = {},
): KnockdownResult {
  const resolved = resolveOverlaps(
    items.map((it, i) => asFill(i, it.polygon)),
    opts.touchUnderlapMm === undefined ? {} : { touchUnderlapMm: opts.touchUnderlapMm },
  );

  const parts = new Map<number, Polygon[]>();
  for (const o of resolved.objects) {
    const at = Number(String(o.id).split("#")[0]);
    if (o.type !== "fill") continue;
    const list = parts.get(at) ?? [];
    list.push(o.shape);
    parts.set(at, list);
  }

  const areas = new Map<string, Polygon[]>();
  const covered: string[] = [];
  items.forEach((it, i) => {
    const list = parts.get(i);
    if (list === undefined) covered.push(it.id);
    else areas.set(it.id, list);
  });

  // The warnings name the position; the caller knows the ids.
  const warnings = resolved.warnings.map((w) =>
    w.objectId === undefined ? w : { ...w, objectId: items[Number(w.objectId)]!.id },
  );
  return { areas, covered, warnings };
}

export type SatinCutout = {
  /** What is left of the area — the very same list where nothing was cut. */
  parts: Polygon[];
  /** What the satin shapes cover of the area together, mm²: what the threshold is measured on. */
  coveredMm2: number;
  /** What was taken out, mm²; 0 where nothing was cut. */
  cutMm2: number;
};

const totalArea = (parts: Polygon[]): number => parts.reduce((s, p) => s + polygonArea(p), 0);

const boxesTouch = (a: Polygon, b: Polygon): boolean => {
  const ba = bbox(a.outer);
  const bb = bbox(b.outer);
  return ba.minX <= bb.maxX && bb.minX <= ba.maxX && ba.minY <= bb.maxY && bb.minY <= ba.maxY;
};

/**
 * A later satin shape spares its place out of the tatami beneath it (spec §4.2
 * rule 1). `parts` is the area as the tatami knockdown left it, `satins` the
 * shapes of the satin objects stitched after it. What they cover of the area
 * together is measured against the 20 mm² of §4.1 rule 3 — a lettering on a
 * banner cuts, a single stroke grazing an area does not — and if it is enough,
 * each shape is cut out shrunk by `underlapMm`, so the area still runs that far
 * under the edge of the satin (§4.1 rule 4, but with the preset's underlap:
 * 0.8 mm would spare nothing out of a stroke 1 mm wide).
 *
 * A running stitch never gets here: it cuts nothing (§4.2 rule 1).
 */
export function cutOutSatin(
  parts: Polygon[],
  satins: Polygon[],
  underlapMm: number,
  minMm2 = KNOCKDOWN_MIN_MM2,
): SatinCutout {
  const untouched: SatinCutout = { parts, coveredMm2: 0, cutMm2: 0 };
  if (parts.length === 0) return untouched;
  const near = satins.filter((s) => parts.some((p) => boxesTouch(p, s)));
  if (near.length === 0) return untouched;

  const coveredMm2 = totalArea(intersect(parts, near));
  if (coveredMm2 < minMm2) return { parts, coveredMm2, cutMm2: 0 };

  const cutters = near.flatMap((s) => (underlapMm > 0 ? offset(s, -underlapMm) : [s]));
  if (cutters.length === 0) return { parts, coveredMm2, cutMm2: 0 };
  const left = difference(parts, cutters);
  return { parts: left, coveredMm2, cutMm2: totalArea(parts) - totalArea(left) };
}
