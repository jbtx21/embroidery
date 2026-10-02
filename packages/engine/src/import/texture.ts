/**
 * Texture cleaning for the imported shapes (spec §5.3, 02.10.2026).
 *
 * Abrasion lettering and chalk strokes are drawn as one body per letter with thousands of grains
 * as holes in it and splinters beside it. A thread is 0.4 mm wide: none of that shows on fabric, but
 * every stage after the import reads it as a shape — the width measurement (the grains split the
 * medial axis: 0.95 mm read for letters that are 1.28 mm wide), the gate (§5.2), the template.
 * This runs inside `importShapes`, before any of them, so that all of them see the same shapes.
 *
 * Four steps, in this order, each a limit the thread sets (the numbers are measured on eight
 * customer logos, two with texture — see the spec):
 *
 * 1. **Evidence.** A shape has texture if it carries at least `TEXTURE_EVIDENCE_HOLES` holes from
 *    `TEXTURE_EVIDENCE_MIN_MM2` up to, but not including, `TEXTURE_EVIDENCE_MAX_MM2`. The six logos
 *    without texture show at most one such hole per shape; the Christliche letters 6 to 278. Below the
 *    lower limit a hole is rounding debris of the path conversion (triangles of 5·10⁻⁷ to
 *    1.4·10⁻⁵ mm²) and no evidence; filling it where there is no texture changed the classification
 *    of three shapes in the Köln logo and the minimum size of STUTTGART 80 mm, so no hole is touched
 *    in a shape without evidence.
 * 2. **Holes.** In a shape with evidence every hole under `TEXTURE_HOLE_MAX_MM2` is filled — the
 *    grains, and the larger holes of chalk. A hole under a circle of 0.8 mm does not stay open
 *    (§5.2). Larger holes are drawn: counters, eyes.
 * 3. **Specks.** A part under `SPECK_MAX_MM2` — measured after step 2 — is dropped, in every shape
 *    and colour: it fits in a circle of 0.25 mm and lies under any stitch. The Christliche letters have
 *    542 white parts under it and none from 0.05 to 0.2 mm².
 * 4. **Splinters.** A part of the same colour joins a shape with evidence if it is smaller than the
 *    shape, at most `SPLINTER_MAX_MM2`, lies on bare ground (no area of another colour touches it)
 *    and is at most `SPLINTER_REACH_MM` from the shape — or from a splinter that has joined already.
 *    It goes into the nearest. Only the gap between them is closed: the group is grown by half the
 *    reach, united, and shrunk back (as `smoothOutline` does), and of what that adds near the
 *    splinters only the pieces that touch two of the group join. The notches of the shape stay: a
 *    closing of the whole fills the slit of a "y" and the serif notches of a "w" (measured: 25 of
 *    4,587 pieces from 0.1 mm² on are drawn), and no area limit separates them from texture notches.
 *
 * **The ordered size decides.** Every area and length above is the one in the ordered size R. In
 * another size w — the gate reads the file at every step of its search, the run at the size it makes —
 * they apply with the ratio λ = w ÷ R: areas by λ², lengths by λ (`TextureOptions.scale`). Without that
 * a grain under 0.05 mm² at R is over it at 1.3 R, the holes come back, the letters read narrower, and
 * the gate runs away (Eislingen 200 mm: 333 mm instead of 274 mm).
 *
 * Nothing is cleaned silently (rule 8): the result carries a report with the numbers and ids, and a
 * warning. A shape without evidence is returned as the very same object, so a logo without texture
 * comes through unchanged.
 */
import type { Polygon, Polyline } from "@texma-stitch/geometry";
import {
  area as ringArea,
  difference,
  intersect,
  offset,
  offsetAll,
  pointInPolygon,
  polygonArea,
  polygonBbox,
  rings,
  union,
} from "@texma-stitch/geometry";
import type { Warning } from "../types.js";
import { warn, WARNING } from "../warnings.js";
import type { ImportedAreaShape, ImportedShape } from "./svg.js";

/** A hole of this area or more, under `TEXTURE_EVIDENCE_MAX_MM2`, is a grain (mm²). Below: rounding debris. */
export const TEXTURE_EVIDENCE_MIN_MM2 = 0.001;
/** A hole under this area, from `TEXTURE_EVIDENCE_MIN_MM2` up, is a grain (mm²). */
export const TEXTURE_EVIDENCE_MAX_MM2 = 0.05;
/** A shape with this many grains has texture. */
export const TEXTURE_EVIDENCE_HOLES = 3;
/** In a shape with texture every hole under this area is filled (mm²): a circle of 0.8 mm (§5.2). */
export const TEXTURE_HOLE_MAX_MM2 = 0.5;
/** A part under this area is dropped (mm²): it fits in a circle of 0.25 mm, thinner than a thread. */
export const SPECK_MAX_MM2 = 0.05;
/** A part up to this area can be a splinter (mm²): `FILL_TINY`, §11. */
export const SPLINTER_MAX_MM2 = 4;
/** A splinter lies at most this far from its shape (mm): the gap the pull compensation of both sides closes, 2 × 0.2 mm (§7.2). */
export const SPLINTER_REACH_MM = 0.4;

/** What a bridge piece has to overlap a shape by to count as touching it (mm²). */
const TOUCH_MIN_MM2 = 1e-7;
/** How far a bridge piece is grown to find the shapes it touches (mm): its edges lie on theirs. */
const TOUCH_GROW_MM = 0.02;
/** What of another colour a part may touch and still lie on bare ground (mm²). */
const BARE_GROUND_MM2 = 1e-6;
/** The share of a splinter that has to lie in the merged shape for it to have joined. */
const JOINED_SHARE = 0.9;

export type TextureOptions = {
  /**
   * The ratio of the size the shapes are read in to the ordered size, λ = w ÷ R: the limits apply with
   * λ² to areas and with λ to lengths (module doc). Default 1: the shapes are in the ordered size.
   */
  scale?: number;
};

/** The limits as they apply in the size read: the constants times λ² or λ. */
export type TextureLimits = {
  evidenceMinMm2: number;
  evidenceMaxMm2: number;
  holeMaxMm2: number;
  speckMm2: number;
  splinterMaxMm2: number;
  reachMm: number;
};

export type TextureReport = {
  /** λ: the size read over the ordered size. */
  scale: number;
  limits: TextureLimits;
  /** The shapes with texture, with the number of grains that showed it (a shape a larger one took in is listed too). */
  textured: { id: string; grains: number }[];
  /** Holes filled in them, with their area. */
  holes: { filled: number; areaMm2: number };
  /** Parts dropped for lying under a stitch: ids, total area, the largest. */
  specks: { dropped: number; areaMm2: number; largestMm2: number; ids: string[] };
  /** Splinters closed into a shape: how many, their area, and which went where. */
  splinters: { merged: number; areaMm2: number; into: { id: string; merged: string[] }[] };
};

export type TextureResult = {
  /** The shapes in document order, cleaned; lines and untouched shapes are the objects that came in. */
  shapes: ImportedShape[];
  report: TextureReport;
  /** One `IMPORT_TEXTURE_CLEANED` where anything was cleaned, none otherwise. */
  warnings: Warning[];
};

// ---------------------------------------------------------------------------
// Distance between two outlines
// ---------------------------------------------------------------------------

type Seg = { ax: number; ay: number; bx: number; by: number };

function pointToSegment(px: number, py: number, s: Seg): number {
  const dx = s.bx - s.ax;
  const dy = s.by - s.ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - s.ax) * dx + (py - s.ay) * dy) / l2));
  return Math.hypot(px - (s.ax + t * dx), py - (s.ay + t * dy));
}

const cross = (ox: number, oy: number, ax: number, ay: number, bx: number, by: number): number =>
  (ax - ox) * (by - oy) - (ay - oy) * (bx - ox);

/** Do the two segments cross (touching counts)? */
function segmentsCross(p: Seg, q: Seg): boolean {
  const d1 = cross(q.ax, q.ay, q.bx, q.by, p.ax, p.ay);
  const d2 = cross(q.ax, q.ay, q.bx, q.by, p.bx, p.by);
  const d3 = cross(p.ax, p.ay, p.bx, p.by, q.ax, q.ay);
  const d4 = cross(p.ax, p.ay, p.bx, p.by, q.bx, q.by);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

function segmentDistance(p: Seg, q: Seg): number {
  if (segmentsCross(p, q)) return 0;
  return Math.min(
    pointToSegment(p.ax, p.ay, q),
    pointToSegment(p.bx, p.by, q),
    pointToSegment(q.ax, q.ay, p),
    pointToSegment(q.bx, q.by, p),
  );
}

function segmentsOf(ring: Polyline): Seg[] {
  return ring.map((a, i) => {
    const b = ring[(i + 1) % ring.length]!;
    return { ax: a.x, ay: a.y, bx: b.x, by: b.y };
  });
}

/**
 * The distance between the outlines of two polygons where it is at most `limit` — 0 where they
 * overlap or one lies in the other's material — and `undefined` where it is more. Only the segments
 * of `b` near `a` are looked at: a letter has thousands, the splinter next to it a few.
 */
function distanceWithin(a: Polygon, b: Polygon, limit: number): number | undefined {
  const box = polygonBbox(a);
  const near = (s: Seg): boolean =>
    Math.max(s.ax, s.bx) >= box.minX - limit &&
    Math.min(s.ax, s.bx) <= box.maxX + limit &&
    Math.max(s.ay, s.by) >= box.minY - limit &&
    Math.min(s.ay, s.by) <= box.maxY + limit;
  const mine = rings(a).flatMap(segmentsOf);
  let best = Infinity;
  for (const ring of rings(b)) {
    for (const s of segmentsOf(ring)) {
      if (!near(s)) continue;
      for (const m of mine) {
        const d = segmentDistance(m, s);
        if (d < best) best = d;
      }
    }
  }
  if (best <= limit) return best;
  if (pointInPolygon(b, a.outer[0]!) || pointInPolygon(a, b.outer[0]!)) return 0;
  return undefined;
}

// ---------------------------------------------------------------------------
// The cleaning
// ---------------------------------------------------------------------------

const fmt = (v: number): string => String(Number(v.toPrecision(3)));

function limitsAt(scale: number): TextureLimits {
  const k2 = scale * scale;
  return {
    evidenceMinMm2: TEXTURE_EVIDENCE_MIN_MM2 * k2,
    evidenceMaxMm2: TEXTURE_EVIDENCE_MAX_MM2 * k2,
    holeMaxMm2: TEXTURE_HOLE_MAX_MM2 * k2,
    speckMm2: SPECK_MAX_MM2 * k2,
    splinterMaxMm2: SPLINTER_MAX_MM2 * k2,
    reachMm: SPLINTER_REACH_MM * scale,
  };
}

/** The sentence of the warning: what was cleaned, with numbers. Only what happened is named. */
function describe(r: TextureReport): string {
  const parts: string[] = [];
  const n = r.textured.length;
  if (n > 0) {
    parts.push(
      `${n} ${n === 1 ? "shape" : "shapes"} with texture (at least ${TEXTURE_EVIDENCE_HOLES} holes under ` +
        `${fmt(r.limits.evidenceMaxMm2)} mm²)`,
    );
  }
  if (r.holes.filled > 0) {
    parts.push(
      `${r.holes.filled} ${r.holes.filled === 1 ? "hole" : "holes"} filled (${fmt(r.holes.areaMm2)} mm²)`,
    );
  }
  if (r.specks.dropped > 0) {
    parts.push(
      `${r.specks.dropped} ${r.specks.dropped === 1 ? "part" : "parts"} under ${fmt(r.limits.speckMm2)} mm² ` +
        `left out (${fmt(r.specks.areaMm2)} mm², the largest ${fmt(r.specks.largestMm2)} mm²)`,
    );
  }
  if (r.splinters.merged > 0) {
    parts.push(
      `${r.splinters.merged} ${r.splinters.merged === 1 ? "splinter" : "splinters"} closed into their shape ` +
        `(${fmt(r.splinters.areaMm2)} mm², gap up to ${fmt(r.limits.reachMm)} mm)`,
    );
  }
  return `Texture cleaned: ${parts.join(", ")}.`;
}

/**
 * The cleaning of the module doc. `shapes` are the shapes of `importShapes` in document order;
 * the result has them in the same order with the same ids, minus the specks and the splinters that
 * joined a shape. Lines are not touched. Deterministic: a plain function of its input; and idempotent,
 * since cleaned shapes show no evidence and have no splinter left.
 */
export function cleanTexture(shapes: ImportedShape[], opts: TextureOptions = {}): TextureResult {
  const scale = opts.scale ?? 1;
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new RangeError(`scale must be a positive number, got ${scale}`);
  }
  const limits = limitsAt(scale);
  const n = shapes.length;
  const isArea = (i: number): boolean => shapes[i]!.kind === "area";
  const polys: Polygon[] = shapes.map((s) =>
    s.kind === "area" ? s.polygon : { outer: [], holes: [] },
  );

  // 1 + 2: evidence and holes
  const grains = new Map<number, number>();
  const filled = new Map<number, { count: number; areaMm2: number }>();
  for (let i = 0; i < n; i++) {
    if (!isArea(i)) continue;
    const holes = polys[i]!.holes;
    if (holes.length < TEXTURE_EVIDENCE_HOLES) continue;
    const areas = holes.map(ringArea);
    const found = areas.filter(
      (a) => a >= limits.evidenceMinMm2 && a < limits.evidenceMaxMm2,
    ).length;
    if (found < TEXTURE_EVIDENCE_HOLES) continue;
    grains.set(i, found);
    const keep: Polyline[] = [];
    const gone = { count: 0, areaMm2: 0 };
    holes.forEach((h, k) => {
      if (areas[k]! < limits.holeMaxMm2) {
        gone.count++;
        gone.areaMm2 += areas[k]!;
      } else keep.push(h);
    });
    filled.set(i, gone);
    polys[i] = { outer: polys[i]!.outer, holes: keep };
  }

  // 3: specks, judged on the material left after the holes
  const dropped = new Set<number>();
  const specks = { dropped: 0, areaMm2: 0, largestMm2: 0, ids: [] as string[] };
  for (let i = 0; i < n; i++) {
    if (!isArea(i)) continue;
    const a = polygonArea(polys[i]!);
    if (a >= limits.speckMm2) continue;
    dropped.add(i);
    specks.dropped++;
    specks.areaMm2 += a;
    specks.largestMm2 = Math.max(specks.largestMm2, a);
    specks.ids.push(shapes[i]!.id);
  }

  // 4: splinters
  const textured = [...grains.keys()].filter((i) => !dropped.has(i));
  const absorbed = new Map<number, number[]>(); // root shape → splinters that joined it, in document order
  const merged = new Map<number, Polygon>();
  const splinters = { merged: 0, areaMm2: 0, into: [] as { id: string; merged: string[] }[] };
  if (textured.length > 0) {
    const live = Array.from({ length: n }, (_, i) => i).filter((i) => isArea(i) && !dropped.has(i));
    const boxes = new Map(live.map((i) => [i, polygonBbox(polys[i]!)]));
    const areas = new Map(live.map((i) => [i, polygonArea(polys[i]!)]));
    const colour = (i: number): string => (shapes[i] as ImportedAreaShape).color;
    const isTextured = new Set(textured);
    const owner = new Map<number, number>();
    const rootOf = (i: number): number => {
      let r = i;
      while (owner.has(r)) r = owner.get(r)!;
      return r;
    };
    const reach = limits.reachMm;
    const boxesNear = (a: number, b: number): boolean => {
      const p = boxes.get(a)!;
      const q = boxes.get(b)!;
      return !(
        p.minX - reach > q.maxX ||
        q.minX - reach > p.maxX ||
        p.minY - reach > q.maxY ||
        q.minY - reach > p.maxY
      );
    };
    const bareGround = new Map<number, boolean>();
    const isOnBareGround = (c: number): boolean => {
      let bare = bareGround.get(c);
      if (bare !== undefined) return bare;
      bare = true;
      for (const j of live) {
        if (colour(j) === colour(c) || !boxesNear(c, j)) continue;
        const shared = intersect([polys[c]!], [polys[j]!]).reduce(
          (sum, p) => sum + polygonArea(p),
          0,
        );
        if (shared > BARE_GROUND_MM2) {
          bare = false;
          break;
        }
      }
      bareGround.set(c, bare);
      return bare;
    };

    const candidates = live.filter((i) => areas.get(i)! <= limits.splinterMaxMm2);
    let again = true;
    while (again) {
      again = false;
      for (const c of candidates) {
        if (owner.has(c) || bareGround.get(c) === false) continue;
        let best: { anchor: number; distance: number } | undefined;
        for (const t of live) {
          if (t === c || colour(t) !== colour(c)) continue;
          if (!isTextured.has(t) && !owner.has(t)) continue;
          const root = rootOf(t);
          if (root === c || areas.get(root)! <= areas.get(c)!) continue;
          if (!boxesNear(c, t)) continue;
          const d = distanceWithin(
            polys[c]!,
            polys[t]!,
            best === undefined ? reach : best.distance,
          );
          if (d !== undefined && (best === undefined || d < best.distance))
            best = { anchor: t, distance: d };
        }
        if (best === undefined || !isOnBareGround(c)) continue;
        owner.set(c, best.anchor);
        again = true;
      }
    }

    // each root closes its splinters into itself
    for (const root of textured) {
      const members = candidates.filter((c) => owner.has(c) && rootOf(c) === root);
      if (members.length === 0 || owner.has(root)) continue;
      const group = [polys[root]!, ...members.map((m) => polys[m]!)];
      const half = reach / 2;
      const closed = offsetAll(union(offsetAll(group, half)), -half);
      const zone = union(offsetAll(group.slice(1), reach));
      const added = difference(intersect(closed, zone), group);
      const bridges = added.filter((g) => {
        const grown = offset(g, TOUCH_GROW_MM);
        let touching = 0;
        for (const p of group) {
          if (intersect(grown, [p]).some((x) => polygonArea(x) > TOUCH_MIN_MM2)) touching++;
        }
        return touching >= 2;
      });
      const whole = union(group, bridges);
      let best: Polygon | undefined;
      let overlap = -1;
      for (const m of whole) {
        const o = intersect([m], [polys[root]!]).reduce((sum, p) => sum + polygonArea(p), 0);
        if (o > overlap) {
          overlap = o;
          best = m;
        }
      }
      if (best === undefined || overlap < 0.5 * areas.get(root)!) continue;
      const joined = members.filter((m) => {
        const inside = intersect([best!], [polys[m]!]).reduce((sum, p) => sum + polygonArea(p), 0);
        return inside >= JOINED_SHARE * areas.get(m)!;
      });
      if (joined.length === 0) continue;
      // holes the bridging closed round are small: they are texture too
      const keep = best.holes.filter((h) => ringArea(h) >= limits.holeMaxMm2);
      merged.set(root, { outer: best.outer, holes: keep });
      absorbed.set(root, joined);
      splinters.merged += joined.length;
      splinters.areaMm2 += joined.reduce((sum, m) => sum + areas.get(m)!, 0);
      splinters.into.push({ id: shapes[root]!.id, merged: joined.map((m) => shapes[m]!.id) });
    }
  }

  // assemble
  const gone = new Set<number>(dropped);
  for (const members of absorbed.values()) for (const m of members) gone.add(m);
  const out: ImportedShape[] = [];
  shapes.forEach((s, i) => {
    if (s.kind !== "area") {
      out.push(s);
      return;
    }
    if (gone.has(i)) return;
    const polygon = merged.get(i) ?? polys[i]!;
    out.push(polygon === s.polygon ? s : { ...s, polygon });
  });

  const report: TextureReport = {
    scale,
    limits,
    textured: textured.map((i) => ({ id: shapes[i]!.id, grains: grains.get(i)! })),
    holes: {
      filled: textured.reduce((sum, i) => sum + filled.get(i)!.count, 0),
      areaMm2: textured.reduce((sum, i) => sum + filled.get(i)!.areaMm2, 0),
    },
    specks,
    splinters,
  };
  const touched = report.holes.filled + specks.dropped + report.splinters.merged > 0;
  return {
    shapes: out,
    report,
    warnings: touched ? [warn(WARNING.IMPORT_TEXTURE_CLEANED, describe(report), "warn")] : [],
  };
}
