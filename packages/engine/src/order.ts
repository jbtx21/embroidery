/**
 * Stitching order (spec §10.1).
 *
 * The default is the object list of the design. `autoOrder` is a SUGGESTION:
 * group by colour (minimising colour changes), and within one colour put areas
 * before outlines, then sort by distance. The user accepts it or not — the
 * engine never reorders on its own.
 */
import { dist } from "@texma-stitch/geometry";
import { objectStart, orderRank } from "./object.js";
import type { StitchObject } from "./types.js";

export function autoOrder(objects: StitchObject[]): StitchObject[] {
  // Colour groups in order of first appearance — that keeps the suggestion close
  // to what the user already sees.
  const groups = new Map<number, StitchObject[]>();
  for (const obj of objects) {
    const list = groups.get(obj.threadIndex);
    if (list) list.push(obj);
    else groups.set(obj.threadIndex, [obj]);
  }

  const out: StitchObject[] = [];
  let cursor = objects.length > 0 ? objectStart(objects[0]!) : { x: 0, y: 0 };
  for (const [, list] of groups) {
    const open = [...list];
    while (open.length > 0) {
      let bestIndex = 0;
      let bestScore = Infinity;
      for (let i = 0; i < open.length; i++) {
        const o = open[i]!;
        // Rank beats distance: underlays and areas first, outlines last.
        const score = orderRank(o) * 1e6 + dist(cursor, objectStart(o));
        if (score < bestScore) {
          bestScore = score;
          bestIndex = i;
        }
      }
      const chosen = open.splice(bestIndex, 1)[0]!;
      out.push(chosen);
      cursor = objectStart(chosen);
    }
  }
  return out;
}
