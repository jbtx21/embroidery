/**
 * Text zu Satin aufloesen (Kap. 4 `expand()`, Kap. 9).
 *
 * Glyphen sitzen auf der Grundlinie oder auf einem Pfad, werden auf `heightMm`
 * skaliert und bekommen die Satin-Parameter aus dem Preset. Die Verbindung
 * zwischen den Buchstaben entscheidet spaeter `connect()` — hier wird nur
 * festgelegt, wo getrennt werden MUSS (zwischen Woertern, wenn gewuenscht).
 */
import type { Point, Polyline } from "@texma-stitch/geometry";
import { cumulativeLengths, pointAt, tangentAt } from "@texma-stitch/geometry";
import type { Font, FontRegistry } from "./font.js";
import { kerningOf } from "./font.js";
import type { Preset } from "./presets.js";
import type { RunningObject, SatinObject, StitchObject, TextObject, Warning } from "./types.js";
import { warne, WARNUNG } from "./warnings.js";

/** Standard-Wortabstand in Versalhoehen, wenn die Schrift kein Leerzeichen hat. */
const LEERZEICHEN_ADVANCE = 0.35;
/** Split-Satin-Schwelle fuer erzeugte Buchstaben (Kap. 7.4). */
const TEXT_MAX_WIDTH_MM = 7;

export type ExpandKontext = { preset: Preset; fonts?: FontRegistry };

/** Setzt Glyph-Koordinaten (Versalhoehen) an ihre Stelle im Design. */
type Platzierung = (p: Point) => Point;

function grundlinie(origin: Point, scale: number, versatz: number): Platzierung {
  return (p) => ({ x: origin.x + (p.x + versatz) * scale, y: origin.y + p.y * scale });
}

/**
 * Auf einem Pfad: x wandert als Bogenlaenge am Pfad entlang, y steht senkrecht
 * dazu. Dadurch kippen die Buchstaben mit der Kurve.
 */
function aufPfad(path: Polyline, scale: number): Platzierung {
  const cum = cumulativeLengths(path);
  return (p) => {
    const s = p.x * scale;
    const basis = pointAt(path, s, cum);
    const t = tangentAt(path, s, cum);
    // Linke Normale; y zeigt im SVG-System nach unten, also derselbe Dreh wie
    // auf der Grundlinie.
    return { x: basis.x - t.y * p.y * scale, y: basis.y + t.x * p.y * scale };
  };
}

function satinAus(
  obj: TextObject,
  preset: Preset,
  id: string,
  spalte: { railA: Polyline; railB: Polyline; rungs: [Point, Point][] },
  setze: Platzierung,
  trimAfter: SatinObject["trimAfter"],
): SatinObject {
  return {
    id,
    type: "satin",
    threadIndex: obj.threadIndex,
    visible: true,
    locked: false,
    trimAfter,
    railA: spalte.railA.map(setze),
    railB: spalte.railB.map(setze),
    rungs: spalte.rungs.map((r) => [setze(r[0]), setze(r[1])] as [Point, Point]),
    spacingMm: preset.satinSpacingMm,
    pullCompMm: preset.pullCompMm,
    maxWidthMm: TEXT_MAX_WIDTH_MM,
    underlay: preset.satinUnderlay,
    shortStitches: true,
    reverse: false,
  };
}

function laufstichAus(
  obj: TextObject,
  id: string,
  stroke: Polyline,
  setze: Platzierung,
  trimAfter: RunningObject["trimAfter"],
): RunningObject {
  return {
    id,
    type: "running",
    threadIndex: obj.threadIndex,
    visible: true,
    locked: false,
    trimAfter,
    path: stroke.map(setze),
    closed: false,
    stitchLengthMm: 2.5,
    repeats: 1,
  };
}

function textAufloesen(
  obj: TextObject,
  font: Font,
  ctx: ExpandKontext,
): { objects: StitchObject[]; warnings: Warning[] } {
  const warnings: Warning[] = [];
  const objects: StitchObject[] = [];

  if (obj.heightMm < font.minHeightMm) {
    warnings.push(
      warne(
        WARNUNG.TEXT_TOO_SMALL,
        `${obj.heightMm} mm liegen unter der Mindesthoehe ${font.minHeightMm} mm von "${font.name}".`,
        "warn",
        obj.id,
      ),
    );
  }

  const scale = obj.heightMm;
  const setzeBasis: Platzierung | undefined = obj.onPath
    ? aufPfad(obj.onPath, scale)
    : undefined;

  let stift = 0;
  const zeichen = [...obj.text];
  for (let i = 0; i < zeichen.length; i++) {
    const c = zeichen[i]!;
    const vorher = zeichen[i - 1];
    if (vorher) stift += kerningOf(font, vorher, c);

    const glyph = font.glyphs[c];
    if (!glyph) {
      if (c === " ") {
        stift += LEERZEICHEN_ADVANCE + obj.letterSpacing;
        continue;
      }
      warnings.push(
        warne(
          WARNUNG.UNSUPPORTED_OBJECT,
          `Schrift "${font.name}" kennt das Zeichen "${c}" nicht.`,
          "warn",
          obj.id,
        ),
      );
      continue;
    }

    // Trennen, wenn das naechste Zeichen ein Leerzeichen ist und der Nutzer
    // zwischen Woertern trennen will (Kap. 9).
    const naechstes = zeichen[i + 1];
    const trimAfter: SatinObject["trimAfter"] =
      obj.trimBetweenWords && (naechstes === " " || naechstes === undefined) ? "always" : "auto";

    const versatz = stift;
    const setze: Platzierung = setzeBasis
      ? (p) => setzeBasis({ x: p.x + versatz, y: p.y })
      : grundlinie(obj.origin, scale, versatz);

    glyph.columns.forEach((spalte, k) => {
      objects.push(satinAus(obj, ctx.preset, `${obj.id}:${i}:s${k}`, spalte, setze, trimAfter));
    });
    (glyph.strokes ?? []).forEach((stroke, k) => {
      objects.push(laufstichAus(obj, `${obj.id}:${i}:l${k}`, stroke, setze, trimAfter));
    });

    stift += glyph.advance + obj.letterSpacing;
  }

  return { objects, warnings };
}

export function expand(
  objects: StitchObject[],
  ctx: ExpandKontext,
): { objects: StitchObject[]; warnings: Warning[] } {
  const out: StitchObject[] = [];
  const warnings: Warning[] = [];

  for (const obj of objects) {
    if (obj.type !== "text") {
      out.push(obj);
      continue;
    }
    const font = ctx.fonts?.get(obj.fontId);
    if (!font) {
      warnings.push(
        warne(
          WARNUNG.UNSUPPORTED_OBJECT,
          `Schrift "${obj.fontId}" ist nicht geladen — der Text wird nicht gestickt.`,
          "error",
          obj.id,
        ),
      );
      continue;
    }
    const ergebnis = textAufloesen(obj, font, ctx);
    out.push(...ergebnis.objects);
    warnings.push(...ergebnis.warnings);
  }

  return { objects: out, warnings };
}
