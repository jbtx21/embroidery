/**
 * Bruecke zu Clipper2 (WASM). Einzige Fremdabhaengigkeit der Engine (Kap. 2).
 *
 * Clipper rechnet ganzzahlig; wir skalieren Millimeter mit 1/1000 mm. Das ist zwei
 * Groessenordnungen feiner als die DST-Einheit (0,1 mm) — Rundung hier faellt im
 * Export nicht auf, und die Skalierung ist fest, also deterministisch.
 *
 * Das Modul muss einmal geladen werden: `await initGeometry()`. Danach sind alle
 * Geometriefunktionen synchron — die Engine bleibt damit frei von Promises.
 */
import ClipperFactory, {
  type Clipper2Module,
  type Paths64,
} from "clipper2-wasm/dist/es/clipper2z.js";
import type { Point, Polygon, Polyline } from "./types.js";
import { openRing, orient, pointInRing, signedArea } from "./polygon.js";

/** Clipper-Einheiten je Millimeter. */
export const SCALE = 1000;

/** Bogentoleranz fuer runde Ecken beim Offset, in Millimetern. */
const ARC_TOLERANCE_MM = 0.02;

let mod: Clipper2Module | undefined;
let loading: Promise<void> | undefined;

/** Laedt das WASM-Modul. Mehrfachaufrufe teilen sich denselben Ladevorgang. */
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
    throw new Error(
      "Geometrie nicht initialisiert — vor dem ersten Aufruf `await initGeometry()` ausfuehren.",
    );
  }
  return mod;
}

const toUnit = (v: number): number => Math.round(v * SCALE);

/** Ring zu flachem Koordinatenarray in Clipper-Einheiten. */
function ringToCoords(ring: Polyline): number[] {
  const out: number[] = [];
  for (const p of ring) {
    out.push(toUnit(p.x), toUnit(p.y));
  }
  return out;
}

/**
 * Ringe zu Paths64. Der Aufrufer muss das Ergebnis mit `.delete()` freigeben —
 * dafuer gibt es `withPaths`.
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

/** Paths64 zurueck zu Ringen in Millimetern. */
export function pathsToRings(paths: Paths64): Polyline[] {
  const out: Polyline[] = [];
  for (let i = 0; i < paths.size(); i++) {
    const path = paths.get(i);
    const view = path.view(); // x, y, z im Dreierschritt
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

/** Fuehrt `fn` aus und gibt alle uebergebenen Paths64 danach zuverlaessig frei. */
export function withPaths<T>(paths: Paths64[], fn: () => T): T {
  try {
    return fn();
  } finally {
    for (const p of paths) p.delete();
  }
}

/**
 * Flache Ringliste zurueck in Polygone mit Loechern buendeln.
 *
 * Verschachtelungstiefe per Punkt-in-Ring: gerade Tiefe = Aussenring, ungerade =
 * Loch. Jedes Loch gehoert zum kleinsten Ring, der es enthaelt. O(n^2), aber n ist
 * die Zahl der Ringe einer Stickform — zweistellig, nicht mehr.
 */
export function ringsToPolygons(ringList: Polyline[]): Polygon[] {
  const usable = ringList.filter((r) => r.length >= 3 && Math.abs(signedArea(r)) > 1e-9);
  const areas = usable.map((r) => Math.abs(signedArea(r)));

  const depth = usable.map((ring, i) => {
    const probe = ringPoint(ring);
    let d = 0;
    for (let j = 0; j < usable.length; j++) {
      if (i === j) continue;
      if (areas[j]! > areas[i]! && pointInRing(usable[j]!, probe)) d++;
    }
    return d;
  });

  const polygons: Polygon[] = [];
  const indexOfOuter = new Map<number, number>();
  for (let i = 0; i < usable.length; i++) {
    if (depth[i]! % 2 === 0) {
      indexOfOuter.set(i, polygons.length);
      polygons.push({ outer: orient(usable[i]!, true), holes: [] });
    }
  }
  for (let i = 0; i < usable.length; i++) {
    if (depth[i]! % 2 === 0) continue;
    const probe = ringPoint(usable[i]!);
    let bestOuter = -1;
    for (let j = 0; j < usable.length; j++) {
      if (depth[j]! % 2 !== 0 || j === i) continue;
      if (!pointInRing(usable[j]!, probe)) continue;
      if (bestOuter === -1 || areas[j]! < areas[bestOuter]!) bestOuter = j;
    }
    if (bestOuter === -1) continue; // Loch ohne Huelle — verwerfen statt raten
    polygons[indexOfOuter.get(bestOuter)!]!.holes.push(orient(usable[i]!, false));
  }
  return polygons;
}

/**
 * Ein Punkt, der sicher im Inneren des Rings liegt: der Schwerpunkt taugt bei
 * konkaven Formen nicht, deshalb der Mittelpunkt eines Diagonalstrahls.
 */
function ringPoint(ring: Polyline): Point {
  // Mittelpunkt der ersten Kante leicht nach innen versetzt ist fuer die reine
  // Verschachtelungsfrage genau genug, solange er nicht auf einer anderen Kante
  // liegt — dafuer der kleine Versatz entlang der Innennormalen.
  const a = ring[0]!;
  const b = ring[1]!;
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l = Math.hypot(dx, dy) || 1;
  // Innen liegt bei positiver Flaeche (Uhrzeigersinn im SVG-System) links.
  const s = signedArea(ring) > 0 ? 1 : -1;
  const eps = 1e-4;
  return { x: mx + (s * -dy * eps) / l, y: my + (s * dx * eps) / l };
}

export const arcToleranceUnits = (): number => ARC_TOLERANCE_MM * SCALE;
