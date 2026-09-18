/**
 * Bridge to Clipper2 (WASM). The only third-party dependency of the engine
 * (spec §2).
 *
 * Clipper works on integers; we scale millimetres by 1/1000 mm. That is two
 * orders of magnitude finer than the DST unit (0.1 mm), so rounding here never
 * shows up in the export, and the scale is fixed, hence deterministic.
 *
 * The module must be loaded once via `await initGeometry()`. After that every
 * geometry function is synchronous — which keeps the engine free of promises.
 */
import ClipperFactory, {
  type Clipper2Module,
  type Paths64,
} from "clipper2-wasm/dist/es/clipper2z.js";
import type { Point, Polygon, Polyline } from "./types.js";
import { openRing, orient, pointInRing, signedArea } from "./polygon.js";

/** Clipper units per millimetre. */
export const SCALE = 1000;

/** Arc tolerance for round joins on offsets, in millimetres. */
const ARC_TOLERANCE_MM = 0.02;

let mod: Clipper2Module | undefined;
let loading: Promise<void> | undefined;

/** Loads the WASM module. Repeated calls share the same load. */
export function initGeometry(): Promise<void> {
  if (mod) return Promise.resolve();
  loading ??= ClipperFactory().then((m) => {
    mod = m;
  });
  return loading;
}

export const isGeometryReady = (): boolean => mod !== undefined;

export function clipper(): Clipper2Module {
  if (!mod) {
    throw new Error("Geometry not initialised — call `await initGeometry()` before first use.");
  }
  return mod;
}

const toUnit = (v: number): number => Math.round(v * SCALE);

/** Ring to a flat coordinate array in Clipper units. */
function ringToCoords(ring: Polyline): number[] {
  const out: number[] = [];
  for (const p of ring) {
    out.push(toUnit(p.x), toUnit(p.y));
  }
  return out;
}

/**
 * Rings to Paths64. The caller must release the result with `.delete()` — that
 * is what `withPaths` is for.
 */
export function ringsToPaths(ringList: Polyline[]): Paths64 {
  const c = clipper();
  const paths = new c.Paths64();
  for (const ring of ringList) {
    const open = openRing(ring);
    if (open.length < 3) continue;
    const path = c.MakePath64(ringToCoords(open));
    paths.push_back(path);
    path.delete();
  }
  return paths;
}

/** Paths64 back to rings in millimetres. */
export function pathsToRings(paths: Paths64): Polyline[] {
  const out: Polyline[] = [];
  for (let i = 0; i < paths.size(); i++) {
    const path = paths.get(i);
    const view = path.view(); // x, y, z in steps of three
    const ring: Polyline = [];
    for (let j = 0; j + 2 < view.length; j += 3) {
      const x = view[j];
      const y = view[j + 1];
      if (x === undefined || y === undefined) break;
      ring.push({ x: Number(x) / SCALE, y: Number(y) / SCALE });
    }
    path.delete();
    if (ring.length >= 3) out.push(ring);
  }
  return out;
}

/** Runs `fn` and reliably releases every Paths64 handed in afterwards. */
export function withPaths<T>(paths: Paths64[], fn: () => T): T {
  try {
    return fn();
  } finally {
    for (const p of paths) p.delete();
  }
}

/**
 * Bundle a flat list of rings back into polygons with holes.
 *
 * Nesting depth via point-in-ring: even depth is an outer ring, odd is a hole.
 * Each hole belongs to the smallest ring containing it. O(n^2), but n is the
 * number of rings in an embroidery shape — two digits, not more.
 */
export function ringsToPolygons(ringList: Polyline[]): Polygon[] {
  const usable = ringList.filter((r) => r.length >= 3 && Math.abs(signedArea(r)) > 1e-9);
  const areas = usable.map((r) => Math.abs(signedArea(r)));

  const depth = usable.map((ring, i) => {
    const probe = ringProbePoint(ring);
    let d = 0;
    for (let j = 0; j < usable.length; j++) {
      if (i === j) continue;
      if (areas[j]! > areas[i]! && pointInRing(usable[j]!, probe)) d++;
    }
    return d;
  });

  const polygons: Polygon[] = [];
  const outerIndex = new Map<number, number>();
  for (let i = 0; i < usable.length; i++) {
    if (depth[i]! % 2 === 0) {
      outerIndex.set(i, polygons.length);
      polygons.push({ outer: orient(usable[i]!, true), holes: [] });
    }
  }
  for (let i = 0; i < usable.length; i++) {
    if (depth[i]! % 2 === 0) continue;
    const probe = ringProbePoint(usable[i]!);
    let bestOuter = -1;
    for (let j = 0; j < usable.length; j++) {
      if (depth[j]! % 2 !== 0 || j === i) continue;
      if (!pointInRing(usable[j]!, probe)) continue;
      if (bestOuter === -1 || areas[j]! < areas[bestOuter]!) bestOuter = j;
    }
    if (bestOuter === -1) continue; // hole without a shell — drop it rather than guess
    polygons[outerIndex.get(bestOuter)!]!.holes.push(orient(usable[i]!, false));
  }
  return polygons;
}

/**
 * A point safely inside the ring: the centroid fails on concave shapes, so we
 * take the midpoint of the first edge nudged along the inward normal.
 */
function ringProbePoint(ring: Polyline): Point {
  const a = ring[0]!;
  const b = ring[1]!;
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l = Math.hypot(dx, dy) || 1;
  // With a positive area (clockwise in the SVG system) the inside is on the left.
  const s = signedArea(ring) > 0 ? 1 : -1;
  const eps = 1e-4;
  return { x: mx + (s * -dy * eps) / l, y: my + (s * dx * eps) / l };
}

export const arcToleranceUnits = (): number => ARC_TOLERANCE_MM * SCALE;
