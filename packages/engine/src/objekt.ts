/** Gemeinsame Fragen an ein Stickobjekt: wo faengt es an, was deckt es ab. */
import type { Point, Polygon } from "@texma-stitch/geometry";
import { polygonBbox } from "@texma-stitch/geometry";
import { satinOutline } from "./satin.js";
import type { StitchObject } from "./types.js";

/** Grober Startpunkt — fuer Reihenfolge und Distanzen, nicht fuer Stiche. */
export function objektStart(obj: StitchObject): Point {
  switch (obj.type) {
    case "fill": {
      const b = polygonBbox(obj.shape);
      return obj.startPoint ?? { x: b.minX, y: b.maxY };
    }
    case "satin":
      return obj.railA[0] ?? { x: 0, y: 0 };
    case "running":
      return obj.path[0] ?? { x: 0, y: 0 };
    case "text":
      return obj.origin;
  }
}

/**
 * Flaeche, die dieses Objekt spaeter ueberdeckt. Laufstiche und Text decken
 * nichts ab — fuer sie gibt es kein Polygon.
 */
export function deckPolygon(obj: StitchObject): Polygon | undefined {
  switch (obj.type) {
    case "fill":
      return obj.shape;
    case "satin":
      return satinOutline(obj.railA, obj.railB);
    case "running":
    case "text":
      return undefined;
  }
}

/** Rang fuer die Reihenfolge: Flaechen zuerst, Konturen zuletzt (Kap. 10.1). */
export function ordnungsRang(obj: StitchObject): number {
  switch (obj.type) {
    case "fill":
      return 0;
    case "satin":
      return 1;
    case "text":
      return 2;
    case "running":
      return 3;
  }
}
