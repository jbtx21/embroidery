/**
 * Stickschriften (Kap. 9).
 *
 * Ein Glyph ist eine Liste von Satin-Spalten (Rails + Sprossen) in Einheiten der
 * Versalhoehe 1,0, dazu `advance` und optionales Kerning. Beim Setzen wird auf
 * `heightMm` skaliert; die Satin-Parameter kommen aus dem Preset.
 *
 * Die Quelle sind Ink/Stitch-Fonts (SVG mit Satin-Spalten). Der Konverter
 * `fonts/import-inkstitch.ts` schreibt genau dieses JSON — er ist noch nicht
 * gebaut, das Format steht aber fest, damit Engine und Konverter sich nicht
 * gegenseitig blockieren.
 */
import type { Point, Polyline } from "@texma-stitch/geometry";

export type GlyphColumn = {
  railA: Polyline;
  railB: Polyline;
  rungs: [Point, Point][];
};

export type Glyph = {
  /** Satin-Spalten des Buchstabens. */
  columns: GlyphColumn[];
  /** Duenne Teile als Laufstich (Punkte, Akzente). */
  strokes?: Polyline[];
  /** Vorschub bis zum naechsten Buchstaben, in Versalhoehen. */
  advance: number;
};

export type Font = {
  id: string;
  name: string;
  /** Unter dieser Hoehe warnt die Engine (Kap. 9, typisch 5 mm). */
  minHeightMm: number;
  glyphs: Record<string, Glyph>;
  /** Paarweises Kerning, Schluessel "AV", in Versalhoehen. */
  kerning?: Record<string, number>;
};

export type FontRegistry = { get(id: string): Font | undefined };

export function fontRegistry(fonts: Font[]): FontRegistry {
  const map = new Map(fonts.map((f) => [f.id, f]));
  return { get: (id) => map.get(id) };
}

export function kerningOf(font: Font, links: string, rechts: string): number {
  return font.kerning?.[`${links}${rechts}`] ?? 0;
}
