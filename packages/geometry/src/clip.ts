/**
 * Schnitt einer Geraden mit einem Polygon inklusive Loechern (Kap. 5).
 *
 * Halboffene Zaehlregel an den Ecken: eine Kante zaehlt als Kreuzung, wenn ihre
 * Endpunkte auf verschiedenen Seiten der Geraden liegen, wobei "auf der Geraden"
 * konsequent zur negativen Seite gerechnet wird. Damit erzeugt ein Scheitelpunkt
 * genau auf der Scanline keine Doppelkreuzung — die Quelle vieler Loecher in
 * Flaechenstichen.
 */
import type { Point, Polygon } from "./types.js";
import { rings } from "./polygon.js";

export type LineHit = {
  a: Point;
  b: Point;
  /** Parameter entlang `dir` ab `origin` — aufsteigend sortiert, ta < tb. */
  ta: number;
  tb: number;
};

/**
 * @param origin Aufpunkt der Geraden
 * @param dir    Richtung (muss nicht normiert sein; t bezieht sich auf |dir| = 1,
 *               wenn dir normiert ist)
 */
export function clipLine(origin: Point, dir: Point, poly: Polygon): LineHit[] {
  const dl = Math.hypot(dir.x, dir.y);
  if (dl < 1e-12) return [];
  const ux = dir.x / dl;
  const uy = dir.y / dl;
  // Normale der Geraden: f(p) = (p - origin) . n
  const nx = -uy;
  const ny = ux;

  const ts: number[] = [];
  for (const ring of rings(poly)) {
    if (ring.length < 3) continue;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!;
      const b = ring[(i + 1) % ring.length]!;
      const fa = (a.x - origin.x) * nx + (a.y - origin.y) * ny;
      const fb = (b.x - origin.x) * nx + (b.y - origin.y) * ny;
      if (fa <= 0 === fb <= 0) continue; // keine Kreuzung (halboffen)
      const t = fa / (fa - fb); // Anteil auf der Kante
      const px = a.x + (b.x - a.x) * t;
      const py = a.y + (b.y - a.y) * t;
      ts.push((px - origin.x) * ux + (py - origin.y) * uy);
    }
  }
  if (ts.length < 2) return [];
  ts.sort((p, q) => p - q);

  const out: LineHit[] = [];
  for (let i = 0; i + 1 < ts.length; i += 2) {
    const ta = ts[i]!;
    const tb = ts[i + 1]!;
    if (tb - ta < 1e-9) continue; // Beruehrung, kein Segment
    out.push({
      a: { x: origin.x + ux * ta, y: origin.y + uy * ta },
      b: { x: origin.x + ux * tb, y: origin.y + uy * tb },
      ta,
      tb,
    });
  }
  return out;
}

/** Waagerechte Scanline bei y — der Fall, den der Fill nach dem Drehen braucht. */
export function clipHorizontal(y: number, poly: Polygon): LineHit[] {
  return clipLine({ x: 0, y }, { x: 1, y: 0 }, poly);
}
