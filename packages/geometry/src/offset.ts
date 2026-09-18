/**
 * Polygon-Offset via Clipper2 (Kap. 5): Join = round, positiv nach aussen.
 *
 * Nach aussen heisst hier wirklich nach aussen — Loecher schrumpfen dabei, weil
 * sie mit umgekehrter Orientierung mitlaufen. Das ist die Grundlage von
 * Zugausgleich (Kap. 7.2, 8.1) und Unterlagen-Inset (Kap. 7.6, 8.6).
 */
import type { Polygon, Polyline } from "./types.js";
import {
  arcToleranceUnits,
  clipper,
  pathsToRings,
  ringsToPaths,
  ringsToPolygons,
  SCALE,
  withPaths,
} from "./clipper.js";
import { rings } from "./polygon.js";

export function offset(poly: Polygon, deltaMm: number): Polygon[] {
  if (deltaMm === 0) return [{ outer: poly.outer.map((p) => ({ ...p })), holes: poly.holes.map((h) => h.map((p) => ({ ...p }))) }];
  const c = clipper();
  const paths = ringsToPaths(rings(poly));
  return withPaths([paths], () => {
    const res = c.InflatePaths64(
      paths,
      deltaMm * SCALE,
      c.JoinType.Round,
      c.EndType.Polygon,
      2,
      arcToleranceUnits(),
    );
    return withPaths([res], () => ringsToPolygons(pathsToRings(res)));
  });
}

/** Offset auf mehrere Polygone. */
export function offsetAll(polys: Polygon[], deltaMm: number): Polygon[] {
  return polys.flatMap((p) => offset(p, deltaMm));
}

/**
 * Offene Polyline seitlich versetzen — fuer den Satin-Zugausgleich auf den Rails
 * (Kap. 7.2). Clipper offsetet nur Flaechen, deshalb rechnen wir das direkt:
 * jeder Punkt wandert entlang der gemittelten Normalen seiner Nachbarsegmente.
 *
 * `deltaMm > 0` verschiebt nach links (im SVG-System gegen den Uhrzeigersinn).
 */
export function offsetPolyline(line: Polyline, deltaMm: number): Polyline {
  if (line.length < 2 || deltaMm === 0) return line.map((p) => ({ ...p }));
  const out: Polyline = [];
  for (let i = 0; i < line.length; i++) {
    const prev = line[i - 1];
    const cur = line[i]!;
    const next = line[i + 1];

    let nx = 0;
    let ny = 0;
    let count = 0;
    if (prev) {
      const dx = cur.x - prev.x;
      const dy = cur.y - prev.y;
      const l = Math.hypot(dx, dy);
      if (l > 1e-12) {
        nx += dy / l;
        ny += -dx / l;
        count++;
      }
    }
    if (next) {
      const dx = next.x - cur.x;
      const dy = next.y - cur.y;
      const l = Math.hypot(dx, dy);
      if (l > 1e-12) {
        nx += dy / l;
        ny += -dx / l;
        count++;
      }
    }
    if (count === 0) {
      out.push({ ...cur });
      continue;
    }
    const nl = Math.hypot(nx, ny);
    if (nl < 1e-9) {
      out.push({ ...cur }); // Kehrtwende: keine sinnvolle Normale
      continue;
    }
    // Miter-Korrektur: bei einer Ecke muss weiter geschoben werden, damit der
    // Versatz senkrecht zu BEIDEN Segmenten stimmt. Gedeckelt, damit spitze
    // Winkel keine Zacken werfen.
    const miter = Math.min(1 / Math.max(nl / count, 0.2), 4);
    out.push({ x: cur.x + (nx / nl) * deltaMm * miter, y: cur.y + (ny / nl) * deltaMm * miter });
  }
  return out;
}
