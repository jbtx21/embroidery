/**
 * Stitching order (spec §10.1).
 *
 * The default is the object list of the design. `autoOrder` is a SUGGESTION:
 * group by colour (minimising colour changes), and within one colour put areas
 * before outlines, then work from the centre outwards and from the bottom up.
 * The user accepts it or not — the engine never reorders on its own.
 *
 * Why not by distance: stitching pushes the fabric ahead of itself. Starting in
 * a corner drags that distortion across the whole design; starting in the middle
 * spreads it evenly towards the edges. On the round cap frame it is not optional
 * — otherwise the cap shifts under the design. It costs jumps, and the rule
 * accepts that: fabric distortion is more expensive than machine time.
 */
import { dist } from "@texma-stitch/geometry";
import { objectStart, orderRank } from "./object.js";
import type { Point, StitchObject } from "./types.js";

/**
 * How wide a ring counts as "the same distance from the centre".
 *
 * Sorting strictly by radius makes the machine hop from one side of the design
 * to the other between two objects that happen to sit on the same circle — on
 * a real logo that tripled the jumps. A band keeps the centre-outwards order at
 * the scale where fabric distortion happens, and lets the travel path be short
 * inside it.
 */
const BAND_FRACTION = 0.2;
const BAND_MIN_MM = 5;

const bandWidth = (maxRadius: number): number => Math.max(BAND_MIN_MM, maxRadius * BAND_FRACTION);

/** Centre of the bounding box over all object start points. */
function designCentre(objects: StitchObject[]): Point {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const obj of objects) {
    const p = objectStart(obj);
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0 };
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}

export function autoOrder(objects: StitchObject[]): StitchObject[] {
  // Colour groups in order of first appearance — that keeps the suggestion close
  // to what the user already sees.
  const groups = new Map<number, StitchObject[]>();
  for (const obj of objects) {
    const list = groups.get(obj.threadIndex);
    if (list) list.push(obj);
    else groups.set(obj.threadIndex, [obj]);
  }

  const centre = designCentre(objects);
  const entries = objects.map((obj) => {
    const start = objectStart(obj);
    return { obj, start, rank: orderRank(obj), radius: dist(centre, start) };
  });
  const bandMm = bandWidth(Math.max(0, ...entries.map((e) => e.radius)));

  const out: StitchObject[] = [];
  for (const [, list] of groups) {
    const open = list.map((obj) => entries.find((e) => e.obj === obj)!);
    // Each colour starts afresh: after a trim the machine may begin anywhere,
    // so every colour begins at the bottom of its innermost band.
    let cursor: Point | undefined;
    while (open.length > 0) {
      // Rank first: underlays and areas before outlines (§10.1).
      const rank = Math.min(...open.map((e) => e.rank));
      const inRank = open.filter((e) => e.rank === rank);
      // Then the innermost band that still has something in it.
      const inner = Math.min(...inRank.map((e) => e.radius));
      const band = inRank.filter((e) => e.radius <= inner + bandMm);

      let best = band[0]!;
      if (cursor === undefined) {
        // "From the bottom up": start at the lowest object of the band, and at
        // equal height the one nearest the centre. y points down (§1).
        for (const e of band) {
          if (e.start.y > best.start.y || (e.start.y === best.start.y && e.radius < best.radius)) {
            best = e;
          }
        }
      } else {
        // Inside the band the travel path decides — at equal distance again the
        // lower object first.
        let bestDist = dist(cursor, best.start);
        for (const e of band) {
          const d = dist(cursor, e.start);
          if (d < bestDist - 1e-9 || (Math.abs(d - bestDist) <= 1e-9 && e.start.y > best.start.y)) {
            best = e;
            bestDist = d;
          }
        }
      }

      open.splice(open.indexOf(best), 1);
      out.push(best.obj);
      cursor = best.start;
    }
  }
  return out;
}
