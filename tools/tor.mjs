/**
 * Das Tor der Mindestgröße (docs/Engine-Spezifikation.md §5.2, „Tor“): für eine SVG-Datei die
 * kleinste Größe ab der bestellten, in der jeder Satinstrich der bestellten Größe seine Grenze hält —
 * und wie die Ausgabe es sagt. Gerechnet wird in packages/engine/src/inkstitch/min-size-search.ts; hier
 * steht, wie die Datei in einer anderen Größe gelesen wird (neu importiert, wie `--breite` sie liest,
 * tools/breite.mjs), was der Lauf daraus macht und wie es aussieht.
 *
 * Die **bestellte Größe** ist die Breite der SVG oder `--breite`. In ihr wird festgelegt, welche Formen
 * Satin und welche Schattenlinien sind (Grenze 1,0 mm, Schattenlinien 0,7 mm); die Suche hält jeden
 * dieser Striche in jeder größeren Größe an seine Grenze (Stand 01.10.2026). Ist die Mindestgröße
 * größer als die bestellte, wird in ihr erzeugt — auf ganze Millimeter aufgerundet, proportional
 * vergrößert — und die Ausgabe sagt es als erste Zeile; die Dateien tragen die erzeugte Breite im Namen.
 * Was erst beim Vergrößern Satin wird, bestimmt die Größe nicht: es ist eine Prüfstelle in der
 * Nacharbeit-Datei (tools/nacharbeit.mjs) und in der Liste von `pnpm mindestgroesse`.
 *
 * Die Mindestgröße ist die **kleinste** Größe, ab der jede hält: die Suche nach der Proportion endet
 * bei einer Größe, die hält; von da an wird in ganzen Millimetern nach unten geprüft, solange jeder
 * Strich hält (die Zeile „Nach unten“ unter den Details). Die Breite kleiner Formen springt, die
 * Proportion schießt dann über die kleinste Größe hinaus (Köln 90 mm: 144 → 134 mm).
 *
 * **Rahmen**: passt das Motiv in der erzeugten Größe nicht in den Rahmen des Presets, auch um 90°
 * gedreht nicht, wird trotzdem erzeugt; eine eigene Zeile gleich unter der ersten warnt (`rahmenZeile`),
 * auch wo die erzeugte Größe die bestellte ist.
 *
 * `--ohne-tor` schaltet die Vergrößerung für Vergleichsmessungen ab: liegt die bestellte Größe unter
 * der Mindestgröße, tragen die Dateien `_unter-mindestgroesse` im Namen, und die Ausgabe warnt. Zahlen
 * mit Punkt, wie in den übrigen Werkzeugen.
 */
import {
  analyze,
  designSize,
  findMinimumSize,
  fitHoop,
  importShapes,
  machineOfPreset,
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
/** Eine Grenze: „1.0“, „0.7“, „0.65“ — ganze Zahlen mit einer Stelle, sonst so, wie sie ist. */
const grenze = (value) => (Number.isInteger(value) ? value.toFixed(1) : String(value));
/** Maße des Motivs und des Rahmens: eine Stelle nach dem Punkt, wo sie nötig ist („233“, „201.6“). */
const eine = (value) => String(Number(value.toFixed(1)));

/** Wie viele Schattenlinien die Zeile höchstens nennt, ohne `alle`. */
const SCHATTEN_MAX = 5;

/**
 * Die Formen der SVG in der Breite `widthMm`: in der Breite der Datei die eingelesenen selbst, sonst
 * die Datei neu importiert mit umgeschriebener Breite — so liest auch der Lauf sie, und was von der
 * Größe abhängt (was §5.1 als zu klein weglässt, die Glättung der Kurven), wird in dieser Größe
 * entschieden. Jede Größe wird nur einmal gelesen: die Suche, die Rahmenprüfung und die Prüfstellen
 * fragen nach derselben. Wirft, wo die Datei keine Größe oder keine viewBox hat (`scaleSvgToWidth`).
 *
 * `bestelltMm` ist die bestellte Breite, in der die Textur bereinigt wird (Spec §5.3): in jeder anderen
 * Größe gelten dieselben Schwellen mit dem Verhältnis der Größen, so sehen die Suche und der Lauf in
 * jeder Größe dieselben Formen. Ohne die Angabe ist es die Breite der Datei. Die Funktion trägt
 * `.textur(widthMm)`: den Bericht der Bereinigung in dieser Größe, wo sie gelesen wurde.
 */
export function formenBei(svgText, original, bestelltMm = original.widthMm) {
  const gelesen = new Map();
  const berichte = new Map();
  const eigene = (widthMm) =>
    Math.abs(widthMm - original.widthMm) < 1e-9 && Math.abs(bestelltMm - original.widthMm) < 1e-9;
  const formen = (widthMm) => {
    if (eigene(widthMm)) return original.shapes;
    if (!gelesen.has(widthMm)) {
      const imported = importShapes(scaleSvgToWidth(svgText, widthMm, original).text, {
        ...(bestelltMm > 0 ? { orderedWidthMm: bestelltMm } : {}),
      });
      gelesen.set(widthMm, imported.shapes);
      berichte.set(widthMm, imported.texture);
    }
    return gelesen.get(widthMm);
  };
  formen.textur = (widthMm) => (eigene(widthMm) ? original.texture : berichte.get(widthMm));
  return formen;
}

/** `Prüfung` oder `Prüfungen`, je nach Zahl. */
const pruefungen = (n) => `${n} ${n === 1 ? "Prüfung" : "Prüfungen"}`;

/** Warum die Suche aufgegeben hat, als Text. */
function aufgabeGrund(search) {
  if (search.reason === "factor") {
    const faktor = Number((search.maxWidthMm / search.orderedWidthMm).toFixed(2));
    return `über dem ${faktor}-fachen der bestellten Größe (${breite(search.maxWidthMm)} mm)`;
  }
  return (
    `nach ${pruefungen(search.steps.length)} (${search.steps.map((s) => breite(s.widthMm)).join(" → ")} mm) ` +
    `hält noch nicht jeder Strich`
  );
}

/** Der Rahmen eines Presets: die Maschine, für die es gemacht ist (Cap-Rahmen oder Standard). */
const rahmenDes = (preset) => machineOfPreset(preset?.id ?? "pique");

/** Der Rahmen des Presets und das Motiv in der Größe `erzeugtMm`; `undefined`, wo es nichts zu sticken gibt. */
function rahmenBei(formen, erzeugtMm, preset) {
  let groesse;
  try {
    groesse = designSize(formen(erzeugtMm));
  } catch {
    return undefined;
  }
  if (groesse === undefined) return undefined;
  return { ...fitHoop(groesse, rahmenDes(preset)), breiteMm: erzeugtMm };
}

/**
 * `analyze()` am Ende des Laufs, auf den Stichen der gelesenen DST: mit demselben Rahmen wie die
 * Rahmenzeile — dem des Presets, und auch um 90° gedreht gültig (Spec §5.2, „Rahmen“). Sonst widerspräche
 * die Ausgabe sich: die Rahmenzeile schwiege bei einem Motiv, das nur gedreht passt, und `analyze()` meldete
 * es als außerhalb — oder, beim Cap-Preset, mit dem Rahmen der Standardmaschine. Die Engine selbst
 * ändert sich nicht: ohne den Parameter misst `analyze()` wie bisher mit dem Standardrahmen, ungedreht.
 * Gemessen wird hier an den Stichen, dort an den Umrissen der Formen: ein Motiv, das den Rahmen um
 * weniger als den Zugausgleich (bis 0,4 mm je Seite) unterschreitet, kann hier noch außerhalb liegen.
 */
export const analysiere = (blocks, preset) =>
  analyze(blocks, rahmenDes(preset), { allowTurned: true });

/**
 * Das Tor für eine SVG-Datei. `original` ist `importShapes(svgText)`; `bestelltMm` die bestellte
 * Breite (die der SVG oder `--breite`). Gibt zurück:
 *
 * - `search`: das Ergebnis der Suche (Engine, `MinimumSizeSearch`) — fehlt nur bei `fehler`;
 * - `erzeugtMm`: die Breite, in der der Lauf erzeugt. Mit `ohneTor` die bestellte; sonst die
 *   Mindestgröße. Fehlt, wo der Lauf nicht erzeugen darf (`fehler`);
 * - `vergroessert`: der Lauf skaliert die Quelle auf `erzeugtMm`;
 * - `unterMindestgroesse`: `--ohne-tor`, und die bestellte Größe liegt unter der Mindestgröße;
 * - `rahmen`: ob das Motiv in `erzeugtMm` in den Rahmen des Presets passt (Engine, `fitHoop`, mit der
 *   Breite, in der gemessen wurde: `breiteMm`). Fehlt, wo nicht erzeugt wird;
 * - `formen`: die Formen der SVG je Größe (`formenBei`), für alles, was danach noch in einer Größe lesen will;
 * - `fehler`: warum der Lauf abbrechen muss (die Suche fand keine Größe, und das Tor ist an; oder
 *   die Datei lässt sich nicht in einer anderen Größe lesen).
 *
 * `suche` reicht `maxSteps` und `maxFactor` an die Suche durch.
 */
export function sucheTor(svgText, original, { bestelltMm, preset, ohneTor = false, suche = {} }) {
  const formen = formenBei(svgText, original, bestelltMm);
  const basis = { bestelltMm, ohneTor, formen };
  let search;
  try {
    search = findMinimumSize(formen, {
      orderedWidthMm: bestelltMm,
      ...(preset === undefined ? {} : { preset }),
      ...suche,
    });
  } catch (err) {
    return { ...basis, fehler: err.message, vergroessert: false, unterMindestgroesse: false };
  }
  const unterMindestgroesse = ohneTor && search.belowMinimum;
  if (ohneTor) {
    return {
      ...basis,
      search,
      erzeugtMm: bestelltMm,
      vergroessert: false,
      unterMindestgroesse,
      rahmen: rahmenBei(formen, bestelltMm, preset),
    };
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
    rahmen: rahmenBei(formen, search.widthMm, preset),
  };
}

/**
 * „bestimmt von z13-bebebe-012 (0.88 mm bei 80 mm, Grenze 1.0 mm)“ — der Strich, der die Größe bestimmt,
 * mit der Breite, die er in der bestellten Größe hat, und der Grenze, an die er dort gehalten wird.
 */
const bestimmtVon = (d, bestelltMm) =>
  ` — bestimmt von ${d.id} (${mm(d.orderedMm)} mm bei ${breite(bestelltMm)} mm, Grenze ${grenze(d.limitMm)} mm)`;

/**
 * Die Warnung, wo das Motiv in der erzeugten Größe nicht in den Rahmen des Presets passt (Spec §5.2,
 * „Rahmen“): die Größe, der Rahmen mit seinen Maßen, und dass trotzdem erzeugt wird. `rahmen` ist das
 * Ergebnis von `fitHoop` mit `breiteMm`.
 */
export function rahmenZeile(rahmen) {
  const m = rahmen.machine;
  return (
    `WARNUNG Rahmen: Das Motiv ist in ${breite(rahmen.breiteMm)} mm ${eine(rahmen.widthMm)} × ${eine(rahmen.heightMm)} mm ` +
    `groß, der Rahmen „${m.label}“ fasst ${eine(m.hoopWMm)} × ${eine(m.hoopHMm)} mm — auch um 90° gedreht ` +
    `passt es nicht. Erzeugt wird trotzdem: der Rahmen ist eine Frage der Maschine (größerer Rahmen, ` +
    `Teilung), das Motiv selbst ist in dieser Größe stickbar.`
  );
}

/**
 * Die erste Zeile der Ausgabe, gleich darunter die Rahmenwarnung (wo das Motiv nicht in den Rahmen
 * passt) und, wo die Datei unter der Mindestgröße bleibt, die Warnung vor den Dateien: bestellt,
 * stickbar ab, erzeugt, und der Strich, der die Mindestgröße bestimmt. Als `meldung` (für
 * `pnpm mindestgroesse`, das nichts erzeugt) ohne das Erzeugte: bestellt, stickbar ab, bestimmender Strich.
 */
export function torKopf(tor, { meldung = false } = {}) {
  const { search: s, ohneTor } = tor;
  const bestellt = `Bestellt ${breite(tor.bestelltMm)} mm`;
  const marke = ohneTor ? " (--ohne-tor)" : "";
  const rahmen = tor.rahmen !== undefined && !tor.rahmen.fits ? [rahmenZeile(tor.rahmen)] : [];
  if (meldung) {
    if (!s.found) return [`${bestellt} · keine Mindestgröße gefunden (${aufgabeGrund(s)})`];
    return [
      s.enlarged
        ? `${bestellt} · stickbar ab ${breite(s.widthMm)} mm${s.decisive === undefined ? "" : bestimmtVon(s.decisive, tor.bestelltMm)}`
        : `${bestellt} · stickbar in dieser Größe`,
      ...rahmen,
    ];
  }
  if (!s.found) {
    const erzeugt = ohneTor ? ` · erzeugt in ${breite(tor.bestelltMm)} mm${marke}` : "";
    const lines = [
      `${bestellt} · keine Mindestgröße gefunden (${aufgabeGrund(s)})${erzeugt}`,
      ...rahmen,
    ];
    if (ohneTor && tor.unterMindestgroesse) lines.push(warnung(tor.bestelltMm));
    return lines;
  }
  const von = s.decisive === undefined ? "" : bestimmtVon(s.decisive, tor.bestelltMm);
  if (!s.enlarged) {
    return [
      `${bestellt} · stickbar in dieser Größe · erzeugt in ${breite(tor.erzeugtMm)} mm${marke}`,
      ...rahmen,
    ];
  }
  if (ohneTor) {
    return [
      `${bestellt} · stickbar ab ${breite(s.widthMm)} mm · erzeugt in ${breite(tor.bestelltMm)} mm ` +
        `(--ohne-tor: nicht vergrößert)${von}`,
      ...rahmen,
      warnung(tor.bestelltMm, s.widthMm),
    ];
  }
  return [
    `${bestellt} · stickbar ab ${breite(s.widthMm)} mm · erzeugt in ${breite(tor.erzeugtMm)} mm${von}`,
    ...rahmen,
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
      : ` · bestimmt von ${d.id}, ${mm(d.orderedMm)} mm bei ${breite(tor.bestelltMm)} mm`;
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

/**
 * Die Zeilen unter der ersten (für `pnpm mindestgroesse` und den Abschnitt „Feinheit“ von
 * `pnpm inkstitch`): wie viele Satinstriche die bestellte Größe zählt, die Schattenlinien darunter
 * (beides in der bestellten Größe bestimmt), der Weg der Suche und, wo die Mindestgröße unter der
 * ersten Größe liegt, die hielt, die Prüfung nach unten. Ohne `alle` ist die Liste der
 * Schattenlinien gekürzt und sagt es. Einen Bereich darüber gibt es nicht mehr: die Suche ist monoton.
 */
export function torDetails(tor, { alle = false } = {}) {
  const s = tor.search;
  const lines = [];
  const l = s.limits;
  const bestellt = breite(s.orderedWidthMm);
  // Wo mit --ohne-tor unter der Mindestgröße erzeugt wird, sagt es auch dieser Abschnitt: er steht
  // weit unter der ersten Zeile, und die Warnung dort ist beim Lesen des Endes nicht zu sehen.
  if (tor.unterMindestgroesse && s.found) {
    lines.push(
      `${spalte("Mindestgröße")}${breite(s.widthMm)} mm — diese Dateien (${breite(tor.bestelltMm)} mm) ` +
        `liegen darunter`,
    );
  }

  const n = s.ordered.length;
  lines.push(
    n === 0
      ? `${spalte("Gezählt")}keine Satinstriche in der bestellten Größe (${bestellt} mm)`
      : `${spalte("Gezählt")}${n} ${n === 1 ? "Satinstrich" : "Satinstriche"} der bestellten Größe ` +
          `(${bestellt} mm), jeder mit seiner Grenze: ${grenze(l.satinMinMm)} mm, ` +
          `Schattenlinien ${grenze(l.shadowMinMm)} mm`,
  );

  const regel = `Grenze ${grenze(l.shadowMinMm)} mm statt ${grenze(l.satinMinMm)} mm, Rail an einem Stoffspalt unter 1.0 mm`;
  lines.push(
    s.shadowLines.length === 0
      ? `${spalte("Schattenlinien")}keine (${regel})`
      : `${spalte("Schattenlinien")}${s.shadowLines.length} (${regel}, in ${bestellt} mm bestimmt): ` +
          elemente(s.shadowLines, alle ? Infinity : SCHATTEN_MAX),
  );

  lines.push(
    `${spalte("Suche")}${s.steps.map((x) => breite(x.widthMm)).join(" → ")} mm ` +
      `(${pruefungen(s.steps.length)}), ` +
      `Striche unter der Grenze: ${s.steps.map((x) => x.under).join(" → ")}`,
  );
  const unten = nachUnten(s);
  if (unten !== undefined) lines.push(unten);
  return lines;
}

/** „liegt 1 Strich“, „liegen 2 Striche“ — unter der Grenze. */
const liegen = (n) => (n === 1 ? "liegt 1 Strich" : `liegen ${n} Striche`);

/**
 * Die Zeile „Nach unten“: was die Suche unter der ersten Größe geprüft hat, die hielt — die Größen,
 * die ebenfalls halten (von der Größe darunter bis zur Mindestgröße), und die erste, die nicht hält.
 * An ihr liegt es, dass die Mindestgröße die kleinste ist: eine neue Prüfung, oder die letzte Größe
 * der Suche, die schon durchfiel (sie wird nicht noch einmal gelesen). `undefined`, wo nichts zu
 * prüfen war (die erste Größe, die hielt, folgt direkt auf die letzte, die durchfiel) und wo die Suche
 * keine Größe fand.
 */
function nachUnten(s) {
  const geprueft = s.refinement ?? [];
  if (!s.found || geprueft.length === 0) return undefined;
  const haelt = geprueft.filter((x) => x.under === 0);
  const letzte = geprueft[geprueft.length - 1];
  const inDerSuche = letzte.under === 0;
  const darunter = inDerSuche ? s.steps[s.steps.length - 2] : letzte;
  const ebenfalls =
    haelt.length === 0
      ? ""
      : haelt.length === 1
        ? `${breite(haelt[0].widthMm)} mm hält ebenfalls, `
        : `${breite(haelt[0].widthMm)} → ${breite(haelt[haelt.length - 1].widthMm)} mm halten ebenfalls, `;
  return (
    `${spalte("Nach unten")}${ebenfalls}bei ${breite(darunter.widthMm)} mm` +
    `${inDerSuche ? " (schon in der Suche geprüft)" : ""} ${liegen(darunter.under)} unter der Grenze ` +
    `(${pruefungen(geprueft.length)})`
  );
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
