/** Einfache Pruefformen (Kap. 15): Rechteck, Kreis, Ring, Bogen, S-Kurve. */
import type { Point, Polygon, Polyline } from "./types.js";
import { orient } from "./polygon.js";

/** Rechteck als Aussenring, normiert im Uhrzeigersinn (SVG-System). */
export function rect(x: number, y: number, w: number, h: number): Polyline {
  return orient(
    [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
    ],
    true,
  );
}

/** Kreis mit `segments` Ecken. Fester Startwinkel — deterministisch. */
export function circle(cx: number, cy: number, r: number, segments = 64): Polyline {
  const ring: Polyline = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    ring.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return orient(ring, true);
}

/** Kreisring: Aussenkreis mit Loch. */
export function annulus(cx: number, cy: number, rOuter: number, rInner: number): Polygon {
  return {
    outer: circle(cx, cy, rOuter),
    holes: [orient(circle(cx, cy, rInner), false)],
  };
}

/** Offener Kreisbogen als Polyline. */
export function arc(
  cx: number,
  cy: number,
  r: number,
  fromDeg: number,
  toDeg: number,
  segments = 32,
): Polyline {
  const out: Polyline = [];
  for (let i = 0; i <= segments; i++) {
    const a = ((fromDeg + ((toDeg - fromDeg) * i) / segments) * Math.PI) / 180;
    out.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return out;
}

/** S-Kurve aus zwei Halbkreisen — der klassische Satin-Pruefling. */
export function sCurve(x: number, y: number, r: number, segments = 32): Polyline {
  const top = arc(x + r, y + r, r, 180, 360, segments);
  const bottom = arc(x + r, y + 3 * r, r, 180, 0, segments).reverse();
  return [...top, ...bottom.slice(1)];
}

/** U-Form: Rechteck mit Ausschnitt von oben — testet Reisewege (Kap. 8.5). */
export function uShape(w = 20, h = 20, slot = 8): Polygon {
  const left = (w - slot) / 2;
  return {
    outer: orient(
      [
        { x: 0, y: 0 },
        { x: left, y: 0 },
        { x: left, y: h - 4 },
        { x: left + slot, y: h - 4 },
        { x: left + slot, y: 0 },
        { x: w, y: 0 },
        { x: w, y: h },
        { x: 0, y: h },
      ],
      true,
    ),
    holes: [],
  };
}

export const polygonOf = (outer: Polyline, holes: Polyline[] = []): Polygon => ({ outer, holes });

export const pt = (x: number, y: number): Point => ({ x, y });
