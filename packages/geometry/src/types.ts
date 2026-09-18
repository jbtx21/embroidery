/**
 * Grundtypen der Geometrie. Einheit ist durchgehend Millimeter (Fliesskomma),
 * Koordinatensystem wie SVG: Ursprung oben links, y nach unten (Kap. 1).
 */

export type Point = { x: number; y: number };

/** Geflachter Pfad. Offen, sofern nicht anders vermerkt. */
export type Polyline = Point[];

/**
 * Geschlossenes Polygon mit Loechern. Orientierung wird beim Import normiert:
 * Aussenring im Uhrzeigersinn, Loecher gegen den Uhrzeigersinn (Kap. 5).
 * Der erste Punkt wird NICHT wiederholt — der Ring schliesst implizit.
 */
export type Polygon = { outer: Polyline; holes: Polyline[] };

export type Rect = { minX: number; minY: number; maxX: number; maxY: number };
