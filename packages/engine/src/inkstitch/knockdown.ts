/**
 * Knockdown for the Ink/Stitch template (spec §4.1): what a later tatami area
 * covers is cut out of the earlier ones, so the spot is not stitched twice.
 *
 * The rules — only fills cut and only out of fills, the later one cuts whatever
 * the colour, 20 mm² threshold, the lower area stays 0.8 mm under the upper one,
 * areas that only touch grow under each other — are those of `resolveOverlaps`
 * and are not rebuilt here. This is the adapter from the template's areas onto
 * the fill objects it works on. Satin and running stitch never reach it: they
 * neither cut nor get cut (rule 1), which is why the caller hands over the
 * tatami areas only, in their stitch order.
 */
import type { Polygon } from "@texma-stitch/geometry";
import { resolveOverlaps } from "../resolve-overlaps.js";
import type { FillObject, Warning } from "../types.js";

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
export function knockdownAreas(items: KnockdownItem[]): KnockdownResult {
  const resolved = resolveOverlaps(items.map((it, i) => asFill(i, it.polygon)));

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
