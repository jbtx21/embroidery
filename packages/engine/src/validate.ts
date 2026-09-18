/**
 * Geometrie pruefen, reparieren oder markieren (Kap. 4, erste Stufe).
 *
 * Reparieren heisst hier: Selbstschnitte per Clipper aufloesen und Orientierung
 * normieren. Was sich nicht reparieren laesst, wird markiert statt geraten.
 */
import type { Polyline } from "@texma-stitch/geometry";
import { dedupe, normalizePolygon, polygonArea } from "@texma-stitch/geometry";
import type { Design, StitchObject, Warning } from "./types.js";
import { warne, WARNUNG } from "./warnings.js";

/** Schneidet sich die Polyline selbst? Nicht benachbarte Segmente, echte Kreuzung. */
export function selbstschnitt(line: Polyline): boolean {
  const eps = 1e-9;
  const ersterPunkt = line[0];
  const letzterPunkt = line[line.length - 1];
  // Nur bei einer TATSAECHLICH geschlossenen Polyline duerfen sich erstes und
  // letztes Segment beruehren — sonst ist genau das der Selbstschnitt.
  const geschlossen =
    line.length > 2 &&
    ersterPunkt !== undefined &&
    letzterPunkt !== undefined &&
    Math.hypot(letzterPunkt.x - ersterPunkt.x, letzterPunkt.y - ersterPunkt.y) < 1e-9;
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i]!;
    const b = line[i + 1]!;
    for (let j = i + 2; j + 1 < line.length; j++) {
      if (geschlossen && i === 0 && j + 2 === line.length) continue;
      const c = line[j]!;
      const d = line[j + 1]!;
      const r = { x: b.x - a.x, y: b.y - a.y };
      const s = { x: d.x - c.x, y: d.y - c.y };
      const denom = r.x * s.y - r.y * s.x;
      if (Math.abs(denom) < eps) continue;
      const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / denom;
      const u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / denom;
      if (t > eps && t < 1 - eps && u > eps && u < 1 - eps) return true;
    }
  }
  return false;
}

export type ValidateErgebnis = { objects: StitchObject[]; warnings: Warning[] };

export function validate(design: Design): ValidateErgebnis {
  const warnings: Warning[] = [];
  const objects: StitchObject[] = [];

  for (const obj of design.objects) {
    if (!obj.visible) continue;

    if (obj.threadIndex < 0 || obj.threadIndex >= design.threads.length) {
      warnings.push(
        warne(
          WARNUNG.THREAD_MISSING,
          `Garn ${obj.threadIndex} ist im Design nicht hinterlegt.`,
          "error",
          obj.id,
        ),
      );
      continue;
    }

    switch (obj.type) {
      case "fill": {
        const teile = normalizePolygon(obj.shape);
        if (teile.length === 0) {
          warnings.push(
            warne(WARNUNG.INVALID_GEOMETRY, "Flaeche ist leer oder entartet.", "error", obj.id),
          );
          continue;
        }
        if (teile.length > 1) {
          warnings.push(
            warne(
              WARNUNG.INVALID_GEOMETRY,
              `Flaeche zerfaellt in ${teile.length} Teile — nur das groesste wird gestickt.`,
              "warn",
              obj.id,
            ),
          );
        }
        const groesstes = teile.reduce((a, b) => (polygonArea(b) > polygonArea(a) ? b : a));
        objects.push({ ...obj, shape: groesstes });
        break;
      }
      case "satin": {
        const railA = dedupe(obj.railA, 1e-6);
        const railB = dedupe(obj.railB, 1e-6);
        if (railA.length < 2 || railB.length < 2) {
          warnings.push(
            warne(WARNUNG.EMPTY_OBJECT, "Satin braucht zwei Rails.", "error", obj.id),
          );
          continue;
        }
        if (selbstschnitt(railA) || selbstschnitt(railB)) {
          warnings.push(
            warne(
              WARNUNG.SELF_INTERSECTING_RAILS,
              "Rail schneidet sich selbst — Sprossen setzen oder Pfad teilen.",
              "warn",
              obj.id,
            ),
          );
        }
        objects.push({ ...obj, railA, railB });
        break;
      }
      case "running": {
        const path = dedupe(obj.path, 1e-6);
        if (path.length < 2) {
          warnings.push(
            warne(WARNUNG.EMPTY_OBJECT, "Laufstich ohne Pfad.", "error", obj.id),
          );
          continue;
        }
        objects.push({ ...obj, path });
        break;
      }
      case "text": {
        if (obj.text.trim().length === 0) {
          warnings.push(warne(WARNUNG.EMPTY_OBJECT, "Text ist leer.", "warn", obj.id));
          continue;
        }
        objects.push(obj);
        break;
      }
    }
  }

  return { objects, warnings };
}
