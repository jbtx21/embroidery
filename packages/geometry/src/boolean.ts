/** Mengenoperationen auf Polygonen via Clipper2 (Kap. 5). */
import type { Polygon, Polyline } from "./types.js";
import { clipper, pathsToRings, ringsToPaths, ringsToPolygons, withPaths } from "./clipper.js";
import { rings } from "./polygon.js";

const allRings = (polys: Polygon[]): Polyline[] => polys.flatMap(rings);

/** Vereinigung. Loest nebenbei Selbstschnitte auf — daher auch fuer `normalize`. */
export function union(subjects: Polygon[], clips: Polygon[] = []): Polygon[] {
  const c = clipper();
  const subj = ringsToPaths(allRings(subjects));
  const clip = ringsToPaths(allRings(clips));
  return withPaths([subj, clip], () => {
    const res = c.Union64(subj, clip, c.FillRule.NonZero);
    return withPaths([res], () => ringsToPolygons(pathsToRings(res)));
  });
}

export function difference(subjects: Polygon[], clips: Polygon[]): Polygon[] {
  const c = clipper();
  const subj = ringsToPaths(allRings(subjects));
  const clip = ringsToPaths(allRings(clips));
  return withPaths([subj, clip], () => {
    const res = c.Difference64(subj, clip, c.FillRule.NonZero);
    return withPaths([res], () => ringsToPolygons(pathsToRings(res)));
  });
}

export function intersect(subjects: Polygon[], clips: Polygon[]): Polygon[] {
  const c = clipper();
  const subj = ringsToPaths(allRings(subjects));
  const clip = ringsToPaths(allRings(clips));
  return withPaths([subj, clip], () => {
    const res = c.Intersect64(subj, clip, c.FillRule.NonZero);
    return withPaths([res], () => ringsToPolygons(pathsToRings(res)));
  });
}

/**
 * Import-Normierung (Kap. 5): Selbstschnitte per Union aufloesen, Orientierung
 * setzen (Aussenring im Uhrzeigersinn, Loecher gegen), Loecher zuordnen.
 *
 * Gibt eine Liste zurueck, weil ein selbstschneidender Ring in mehrere Flaechen
 * zerfallen kann — der Aufrufer entscheidet, ob er das als einen Objektfehler
 * behandelt oder alle Teile nimmt.
 */
export function normalizePolygon(poly: Polygon): Polygon[] {
  const c = clipper();
  const subj = ringsToPaths(rings(poly));
  return withPaths([subj], () => {
    // EvenOdd: der Ring-Import weiss noch nichts ueber Orientierung, also darf
    // die Fuellregel nicht von ihr abhaengen.
    const res = c.UnionSelf64(subj, c.FillRule.EvenOdd);
    return withPaths([res], () => ringsToPolygons(pathsToRings(res)));
  });
}

/** Wie `normalizePolygon`, aber fuer einen einzelnen Ring ohne Loecher. */
export function normalizeRing(ring: Polyline): Polygon[] {
  return normalizePolygon({ outer: ring, holes: [] });
}
