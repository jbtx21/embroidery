/** Geometrie-Modul (Kap. 5). Einheit: Millimeter, SVG-Koordinaten (y nach unten). */
export type { Point, Polyline, Polygon, Rect } from "./types.js";
export * from "./vec.js";
export * from "./flatten.js";
export * from "./simplify.js";
export * from "./measure.js";
export * from "./resample.js";
export * from "./polygon.js";
export * from "./transform.js";
export * from "./clip.js";
export * from "./boolean.js";
export * from "./offset.js";
export * from "./travel.js";
export { initGeometry, isGeometryReady, SCALE } from "./clipper.js";
// Pruefformen (Kap. 15) — bewusst mit ausgeliefert, damit Engine-Tests und
// Probelaeufe dieselben Formen benutzen wie die Geometrie-Tests.
export * from "./testformen.js";
