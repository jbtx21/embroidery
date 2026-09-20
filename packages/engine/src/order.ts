/**
 * Stitching order (spec §10.1).
 *
 * `autoOrder` is the default since 20.09.2026 (spec §10.1): group by colour
 * (minimising colour changes), then background before details before outlines,
 * and within a stage the shortest path.
 *
 * What it may NOT do is turn two overlapping objects around. Stitched later
 * means lying on top, which is what the knockdown of §4.1 builds on — grouping
 * the colours of the STUTTGART logo put the black shield after the grey horse,
 * and the knockdown then cut the horse away. So the grouping runs as a
 * topological sort over the overlaps, and regroups only what is free to move.
 *
 * `centreOut` turns on the cap rule: from the centre outwards and from the
 * bottom up. Stitching pushes the fabric ahead of itself, and on the round cap
 * frame the direction is not optional — a cap stitched like flat goods from left
 * to right shifts under the design. It costs jumps, so on flat goods the
 * shortest path wins instead (spec §10.1).
 */
import type { Polygon } from "@texma-stitch/geometry";
import { dist, intersect, polygonArea, polygonBbox } from "@texma-stitch/geometry";
import { coverPolygon, objectStart, orderRank } from "./object.js";
import type { Point, StitchObject } from "./types.js";

/** Overlap smaller than this is not worth a constraint (mm²). */
const OVERLAP_EPS_MM2 = 1e-6;

/**
 * Who must stay under whom (spec §10.1).
 *
 * Stitched later means lying on top — that is the whole basis of the knockdown
 * in §4.1. So the order may not turn two OVERLAPPING objects around: grouping
 * the colours of the STUTTGART logo put the black shield after the grey horse,
 * and the knockdown then cut the horse away, exactly as it was told to.
 * Objects that do not overlap may be reordered freely.
 */
export function precedence(objects: StitchObject[]): number[][] {
  const covers = objects.map((o) => coverPolygon(o));
  const after: number[][] = objects.map(() => []);

  // A sequence is the maker's own order — a text knows where its connectors go,
  // an auto-satin proposal knows the way through its columns (spec §10.1).
  const lastOf = new Map<string, number>();
  for (const [i, o] of objects.entries()) {
    if (o.sequence === undefined) continue;
    const prev = lastOf.get(o.sequence);
    if (prev !== undefined) after[prev]!.push(i);
    lastOf.set(o.sequence, i);
  }

  const boxes = covers.map((c) => (c === undefined ? undefined : polygonBbox(c)));

  for (let i = 0; i < objects.length; i++) {
    const ci = covers[i];
    const bi = boxes[i];
    if (ci === undefined || bi === undefined) continue;
    for (let j = i + 1; j < objects.length; j++) {
      const cj = covers[j];
      const bj = boxes[j];
      if (cj === undefined || bj === undefined) continue;
      if (bi.maxX < bj.minX || bj.maxX < bi.minX) continue;
      if (bi.maxY < bj.minY || bj.maxY < bi.minY) continue;
      const shared = intersect([ci as Polygon], [cj as Polygon]).reduce(
        (sum, p) => sum + polygonArea(p),
        0,
      );
      if (shared > OVERLAP_EPS_MM2) after[i]!.push(j);
    }
  }
  return after;
}

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

export type OrderOptions = {
  /** Cap rule: work outwards from the centre and upwards from the bottom. */
  centreOut?: boolean;
};

export function autoOrder(objects: StitchObject[], opts: OrderOptions = {}): StitchObject[] {
  const n = objects.length;
  if (n === 0) return [];

  // Overlapping objects keep their order; everything else may be regrouped.
  const after = precedence(objects);
  const indegree = new Array<number>(n).fill(0);
  for (const list of after) for (const j of list) indegree[j]!++;

  const centre = designCentre(objects);
  const entries = objects.map((obj) => {
    const start = objectStart(obj);
    return { obj, start, rank: orderRank(obj), radius: dist(centre, start) };
  });
  const bandMm = bandWidth(Math.max(0, ...entries.map((e) => e.radius)));

  const done = new Array<boolean>(n).fill(false);
  const out: StitchObject[] = [];
  let colour: number | undefined;
  let cursor: Point | undefined;

  while (out.length < n) {
    const ready: number[] = [];
    for (let i = 0; i < n; i++) if (!done[i] && indegree[i] === 0) ready.push(i);
    if (ready.length === 0) {
      // A cycle can only come from geometry that overlaps both ways. Keeping the
      // design order for the rest is the honest answer.
      for (let i = 0; i < n; i++) if (!done[i]) out.push(objects[i]!);
      break;
    }

    // Stay on the colour in the needle for as long as the constraints allow.
    let pool =
      colour === undefined ? ready : ready.filter((i) => objects[i]!.threadIndex === colour);
    if (pool.length === 0) {
      colour = undefined;
      cursor = undefined;
      pool = ready;
    }
    if (colour === undefined) {
      // A fresh colour: take the one the design would have reached first.
      let first = pool[0]!;
      for (const i of pool) {
        if (
          entries[i]!.rank < entries[first]!.rank ||
          (entries[i]!.rank === entries[first]!.rank && i < first)
        ) {
          first = i;
        }
      }
      colour = objects[first]!.threadIndex;
      pool = pool.filter((i) => objects[i]!.threadIndex === colour);
    }

    // Background before details before outlines (§10.1).
    const rank = Math.min(...pool.map((i) => entries[i]!.rank));
    const inRank = pool.filter((i) => entries[i]!.rank === rank);
    // The cap rule works in rings; on flat goods the whole stage is one ring.
    const inner = Math.min(...inRank.map((i) => entries[i]!.radius));
    const band = opts.centreOut
      ? inRank.filter((i) => entries[i]!.radius <= inner + bandMm)
      : inRank;

    let best = band[0]!;
    if (cursor === undefined && opts.centreOut) {
      // "From the bottom up": the lowest object of the ring, and at equal height
      // the one nearest the centre. y points down (§1).
      for (const i of band) {
        const e = entries[i]!;
        const b = entries[best]!;
        if (e.start.y > b.start.y || (e.start.y === b.start.y && e.radius < b.radius)) best = i;
      }
    } else {
      const from = cursor ?? entries[best]!.start;
      let bestDist = dist(from, entries[best]!.start);
      for (const i of band) {
        const d = dist(from, entries[i]!.start);
        if (
          d < bestDist - 1e-9 ||
          (Math.abs(d - bestDist) <= 1e-9 && entries[i]!.start.y > entries[best]!.start.y)
        ) {
          best = i;
          bestDist = d;
        }
      }
    }

    done[best] = true;
    out.push(objects[best]!);
    cursor = entries[best]!.start;
    for (const j of after[best]!) indegree[j]!--;
  }

  return out;
}
