/**
 * Reihenfolge (Kap. 10.1).
 *
 * Standard ist die Objektliste des Designs. `autoOrder` ist ein VORSCHLAG: nach
 * Farbe gruppieren (Farbwechsel minimieren), innerhalb einer Farbe Flaechen vor
 * Konturen und dann nach Distanz. Der Nutzer nimmt ihn an oder nicht — die
 * Engine ordnet nie von sich aus um.
 */
import { dist } from "@texma-stitch/geometry";
import { objektStart, ordnungsRang } from "./objekt.js";
import type { StitchObject } from "./types.js";

export function autoOrder(objects: StitchObject[]): StitchObject[] {
  // Farbgruppen in der Reihenfolge ihres ersten Auftretens — das haelt den
  // Vorschlag nah an dem, was der Nutzer schon sieht.
  const gruppen = new Map<number, StitchObject[]>();
  for (const obj of objects) {
    const liste = gruppen.get(obj.threadIndex);
    if (liste) liste.push(obj);
    else gruppen.set(obj.threadIndex, [obj]);
  }

  const out: StitchObject[] = [];
  let cursor = objects.length > 0 ? objektStart(objects[0]!) : { x: 0, y: 0 };
  for (const [, liste] of gruppen) {
    const offen = [...liste];
    while (offen.length > 0) {
      let besterIndex = 0;
      let besterWert = Infinity;
      for (let i = 0; i < offen.length; i++) {
        const o = offen[i]!;
        // Rang schlaegt Distanz: Unterlagen und Flaechen zuerst, Konturen zuletzt.
        const wert = ordnungsRang(o) * 1e6 + dist(cursor, objektStart(o));
        if (wert < besterWert) {
          besterWert = wert;
          besterIndex = i;
        }
      }
      const gewaehlt = offen.splice(besterIndex, 1)[0]!;
      out.push(gewaehlt);
      cursor = objektStart(gewaehlt);
    }
  }
  return out;
}
