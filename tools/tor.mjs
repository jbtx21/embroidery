/**
 * Das Tor der Mindestgröße (docs/Engine-Spezifikation.md §5.2, „Tor“): für eine SVG-Datei die
 * kleinste Größe ab der bestellten, in der die Prüfung keinen Satinstrich unter seiner Grenze
 * findet — und wie die Ausgabe es sagt. Gerechnet wird in
 * packages/engine/src/inkstitch/min-size-search.ts; hier steht, wie die Datei in einer anderen Größe
 * gelesen wird (neu importiert, wie `--breite` sie liest, tools/breite.mjs), was der Lauf daraus
 * macht und wie es aussieht.
 *
 * Die **bestellte Größe** ist die Breite der SVG oder `--breite`. Ist die Mindestgröße größer, wird
 * in ihr erzeugt — auf ganze Millimeter aufgerundet, proportional vergrößert — und die Ausgabe sagt
 * es als erste Zeile; die Dateien tragen die erzeugte Breite im Namen. `--ohne-tor` schaltet die
 * Vergrößerung für Vergleichsmessungen ab: liegt die bestellte Größe unter der Mindestgröße, tragen
 * die Dateien `_unter-mindestgroesse` im Namen, und die Ausgabe warnt. Zahlen mit Punkt, wie in den
 * übrigen Werkzeugen.
 */
import {
  findMinimumSize,
  importShapes,
  mergeRanges,
  SEARCH_MAX_FACTOR,
} from "@texma-stitch/engine";
import { scaleSvgToWidth } from "./breite.mjs";

/** Was hinter den Namen einer Datei kommt, die unter der Mindestgröße erzeugt wurde (`--ohne-tor`). */
export const UNTER_SUFFIX = "_unter-mindestgroesse";

/** Die Beschriftungen der Zeilen unter der ersten sind gleich breit, wie in tools/feinheit.mjs. */
const spalte = (name) => name.padEnd(17);
/** Millimeter mit Punkt. */
const mm = (value, digits = 2) => value.toFixed(digits);
/** Logobreiten: ganze Millimeter ohne Komma, sonst eine Stelle („110.8“). */
const breite = (value) => (Number.isInteger(value) ? String(value) : value.toFixed(1));
/** Eine Logobreite, ab der etwas gilt, als ganze Millimeter: „ab 141 mm“ ist dann wahr. */
const ab = (value) => Math.ceil(value);

/** Wie viele Schattenlinien und wie viele Bereiche die Zeilen höchstens nennen, ohne `alle`. */
const SCHATTEN_MAX = 5;
const BEREICHE_MAX = 6;

/**
 * Die Formen der SVG in der Breite `widthMm`: in der Breite der Datei die eingelesenen selbst, sonst
 * die Datei neu importiert mit umgeschriebener Breite — so liest auch der Lauf sie, und was von der
 * Größe abhängt (was §5.1 als zu klein weglässt, die Glättung der Kurven), wird in dieser Größe
 * entschieden. Wirft, wo die Datei keine Größe oder keine viewBox hat (`scaleSvgToWidth`).
 */
export function formenBei(svgText, original) {
  return (widthMm) =>
    Math.abs(widthMm - original.widthMm) < 1e-9
      ? original.shapes
      : importShapes(scaleSvgToWidth(svgText, widthMm, original).text).shapes;
}

/** Warum die Suche aufgegeben hat, als Text. */
function aufgabeGrund(search) {
  if (search.reason === "factor") {
    const grenze = search.orderedWidthMm * SEARCH_MAX_FACTOR;
    return `über dem ${SEARCH_MAX_FACTOR}-fachen der bestellten Größe (${breite(grenze)} mm)`;
  }
  return (
    `nach ${search.steps.length} Prüfungen (${search.steps.map((s) => breite(s.widthMm)).join(" → ")} mm) ` +
    `hält noch nicht jeder Strich`
  );
}

/**
 * Das Tor für eine SVG-Datei. `original` ist `importShapes(svgText)`; `bestelltMm` die bestellte
 * Breite (die der SVG oder `--breite`). Gibt zurück:
 *
 * - `search`: das Ergebnis der Suche (Engine, `MinimumSizeSearch`) — fehlt nur bei `fehler`;
 * - `erzeugtMm`: die Breite, in der der Lauf erzeugt. Mit `ohneTor` die bestellte; sonst die
 *   Mindestgröße. Fehlt, wo der Lauf nicht erzeugen darf (`fehler`);
 * - `vergroessert`: der Lauf skaliert die Quelle auf `erzeugtMm`;
 * - `unterMindestgroesse`: `--ohne-tor`, und die bestellte Größe liegt unter der Mindestgröße;
 * - `fehler`: warum der Lauf abbrechen muss (die Suche fand keine Größe, und das Tor ist an; oder
 *   die Datei lässt sich nicht in einer anderen Größe lesen).
 *
 * `suche` reicht `maxSteps` und `maxFactor` an die Suche durch.
 */
export function sucheTor(svgText, original, { bestelltMm, preset, ohneTor = false, suche = {} }) {
  const basis = { bestelltMm, ohneTor };
  let search;
  try {
    search = findMinimumSize(formenBei(svgText, original), {
      orderedWidthMm: bestelltMm,
      ...(preset === undefined ? {} : { preset }),
      ...suche,
    });
  } catch (err) {
    return { ...basis, fehler: err.message, vergroessert: false, unterMindestgroesse: false };
  }
  const unterMindestgroesse = ohneTor && search.belowMinimum;
  if (ohneTor) {
    return { ...basis, search, erzeugtMm: bestelltMm, vergroessert: false, unterMindestgroesse };
  }
  if (!search.found) {
    return {
      ...basis,
      search,
      vergroessert: false,
      unterMindestgroesse: false,
      fehler: `Keine Mindestgröße gefunden: ${aufgabeGrund(search)}. Erzeugt wird nichts.`,
    };
  }
  return {
    ...basis,
    search,
    erzeugtMm: search.widthMm,
    vergroessert: search.enlarged,
    unterMindestgroesse: false,
  };
}

/** „bestimmt von z04 (1.24 mm bei 240 mm, Grenze 1.3 mm)“ — das Element, das die Größe bestimmt. */
const bestimmtVon = (d) =>
  ` — bestimmt von ${d.id} (${mm(d.measuredMm)} mm bei ${breite(d.atWidthMm)} mm, Grenze ${d.limitMm} mm)`;

/**
 * Die erste Zeile der Ausgabe (und, wo die Datei unter der Mindestgröße bleibt, die Warnung
 * darunter): bestellt, stickbar ab, erzeugt, und das Element, das die Mindestgröße bestimmt. Als
 * `meldung` (für `pnpm mindestgroesse`, das nichts erzeugt) ohne das Erzeugte: bestellt, stickbar ab,
 * bestimmendes Element.
 */
export function torKopf(tor, { meldung = false } = {}) {
  const { search: s, ohneTor } = tor;
  const bestellt = `Bestellt ${breite(tor.bestelltMm)} mm`;
  const marke = ohneTor ? " (--ohne-tor)" : "";
  if (meldung) {
    if (!s.found) return [`${bestellt} · keine Mindestgröße gefunden (${aufgabeGrund(s)})`];
    return [
      s.enlarged
        ? `${bestellt} · stickbar ab ${breite(s.widthMm)} mm${s.decisive === undefined ? "" : bestimmtVon(s.decisive)}`
        : `${bestellt} · stickbar in dieser Größe`,
    ];
  }
  if (!s.found) {
    const erzeugt = ohneTor ? ` · erzeugt in ${breite(tor.bestelltMm)} mm${marke}` : "";
    const lines = [`${bestellt} · keine Mindestgröße gefunden (${aufgabeGrund(s)})${erzeugt}`];
    if (ohneTor && tor.unterMindestgroesse) lines.push(warnung(tor.bestelltMm));
    return lines;
  }
  const von = s.decisive === undefined ? "" : bestimmtVon(s.decisive);
  if (!s.enlarged) {
    return [
      `${bestellt} · stickbar in dieser Größe · erzeugt in ${breite(tor.erzeugtMm)} mm${marke}`,
    ];
  }
  if (ohneTor) {
    return [
      `${bestellt} · stickbar ab ${breite(s.widthMm)} mm · erzeugt in ${breite(tor.bestelltMm)} mm ` +
        `(--ohne-tor: nicht vergrößert)${von}`,
      warnung(tor.bestelltMm, s.widthMm),
    ];
  }
  return [
    `${bestellt} · stickbar ab ${breite(s.widthMm)} mm · erzeugt in ${breite(tor.erzeugtMm)} mm${von}`,
  ];
}

/** Die Mindestgröße in einer kurzen Zeile, für den Kopf des Vorschaubilds (tools/feinheit.mjs). */
export function torKurz(tor) {
  const s = tor.search;
  if (!s.found) return "keine Mindestgröße gefunden";
  if (!s.enlarged) return `Mindestgröße: die bestellten ${breite(tor.bestelltMm)} mm halten`;
  const d = s.decisive;
  const von =
    d === undefined
      ? ""
      : ` · bestimmt von ${d.id}, ${mm(d.measuredMm)} mm bei ${breite(d.atWidthMm)} mm`;
  return `Mindestgröße ${breite(s.widthMm)} mm (bestellt ${breite(tor.bestelltMm)} mm${von})`;
}

/** Die Warnung unter der ersten Zeile, wo mit `--ohne-tor` unter der Mindestgröße erzeugt wird. */
function warnung(bestelltMm, mindestMm) {
  const unter =
    mindestMm === undefined
      ? `${breite(bestelltMm)} mm liegt unter der Mindestgröße`
      : `${breite(bestelltMm)} mm liegt unter der Mindestgröße von ${breite(mindestMm)} mm`;
  return (
    `WARNUNG: ${unter}. Die Dateien tragen „${UNTER_SUFFIX}“ im Namen — eine ` +
    `Vergleichsmessung, kein Stickprogramm für einen Auftrag.`
  );
}

/** Die Elemente einer Liste: die ersten `max`, und wie viele weitere es gibt. */
function elemente(ids, max) {
  if (ids.length <= max) return ids.join(", ");
  const rest = ids.length - max;
  return `${ids.slice(0, max).join(", ")} … und ${rest} ${rest === 1 ? "weiteres" : "weitere"}`;
}

/** Was ein Bereich über der gefundenen Größe sagt: das Element, wie es heute ist, und wo es zu schmal wird. */
function beschreibung(r) {
  const heute = `${mm(r.measuredMm)} mm bei ${breite(r.atWidthMm)} mm`;
  if (r.kind === "loses-shadow") {
    return (
      `Schattenlinie, ${heute}: ab ${ab(r.fromMm)} mm ohne Stoffspalt unter 1.0 mm, ` +
      `hält ab ${ab(r.toMm)} mm`
    );
  }
  return `Laufstich, ${heute}: ab ${ab(r.fromMm)} mm Satin, hält ab ${ab(r.toMm)} mm`;
}

/**
 * Die Zeilen unter der ersten (für `pnpm mindestgroesse` und den Abschnitt „Feinheit“ von
 * `pnpm inkstitch`): die Schattenlinien, der Weg der Suche, und die Bereiche über der gefundenen
 * Größe, in denen ein Strich zu schmal wird. Ohne `alle` sind die Listen gekürzt und sagen es.
 */
export function torDetails(tor, { alle = false } = {}) {
  const s = tor.search;
  const lines = [];
  const l = s.limits;
  const regel = `Grenze ${l.shadowMinMm} mm statt ${l.satinMinMm} mm, Rail an einem Stoffspalt unter 1.0 mm`;

  lines.push(
    s.shadowLines.length === 0
      ? `${spalte("Schattenlinien")}keine (${regel})`
      : `${spalte("Schattenlinien")}${s.shadowLines.length} (${regel}): ` +
          elemente(s.shadowLines, alle ? Infinity : SCHATTEN_MAX),
  );

  lines.push(
    `${spalte("Suche")}${s.steps.map((x) => breite(x.widthMm)).join(" → ")} mm ` +
      `(${s.steps.length} ${s.steps.length === 1 ? "Prüfung" : "Prüfungen"}), ` +
      `Striche unter der Grenze: ${s.steps.map((x) => x.under).join(" → ")}`,
  );

  if (!s.found) return lines;
  if (s.above.length === 0) {
    lines.push(
      `${spalte("Bereich darüber")}keiner: ab ${breite(s.widthMm)} mm wird in keiner größeren Größe ` +
        `ein Strich zu schmal`,
    );
    return lines;
  }
  const spans = mergeRanges(s.above);
  lines.push(
    `${spalte("Bereich darüber")}` +
      (spans.length === 1
        ? `1 Bereich, in dem ein Strich zu schmal wird (von … bis unter …):`
        : `${spans.length} Bereiche, in denen ein Strich zu schmal wird (von … bis unter …):`),
  );
  const shown = alle ? spans : spans.slice(0, BEREICHE_MAX);
  for (const span of shown) {
    const ids = span.ranges.map((r) => r.id);
    const was =
      span.ranges.length === 1 ? `${ids[0]} (${beschreibung(span.ranges[0])})` : elemente(ids, 3);
    lines.push(`${" ".repeat(19)}${ab(span.fromMm)}–${ab(span.toMm)} mm  ${was}`);
  }
  if (shown.length < spans.length) {
    lines.push(
      `${" ".repeat(19)}… und ${spans.length - shown.length} weitere Bereiche (alle: --alle)`,
    );
  }
  return lines;
}

/**
 * Der Name der Ausgabedateien ohne Endung: der der SVG, die erzeugte Breite als `-<N>mm`, wo die
 * Quelle skaliert wurde (`--breite` oder das Tor; `scaled` ist das Ergebnis von `scaleSvgToWidth`),
 * und `_unter-mindestgroesse`, wo mit `--ohne-tor` unter der Mindestgröße erzeugt wird.
 */
export function dateiname(basis, scaled, tor) {
  return (
    basis +
    (scaled === undefined ? "" : `-${scaled.to.widthMm}mm`) +
    (tor?.unterMindestgroesse ? UNTER_SUFFIX : "")
  );
}
