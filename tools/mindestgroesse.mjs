/**
 * Feinheit und Mindestgröße vor dem Sticken (docs/Engine-Spezifikation.md §5.2).
 *
 *   pnpm mindestgroesse <svg> [preset] [--breite <mm>] [--alle]
 *
 * Liest die SVG in der bestellten Größe (Breite der SVG in mm, oder `--breite`) und meldet zuerst
 * das **Tor** (tools/tor.mjs): die kleinste Größe ab der bestellten, ab der jeder Satinstrich der
 * bestellten Größe seine Grenze hält (1,0 mm, Schattenlinien 0,7 mm; welche Formen Satin und welche
 * Schattenlinien sind, wird in der bestellten Größe festgelegt und bleibt), und der Strich, der sie
 * bestimmt — gesucht über die Größe, nicht aus der bestellten hochgerechnet: nach der Proportion,
 * dann in ganzen Millimetern nach unten (Zeile „Nach unten“) —, dazu die Zahl der
 * gezählten Striche und die Schattenlinien. Passt das Motiv in dieser Größe nicht in den Rahmen des
 * Presets, auch gedreht nicht, steht gleich unter der ersten Zeile die Rahmenwarnung. Nichts davon
 * ändert die Vorlage; `pnpm inkstitch` erzeugt in der Mindestgröße.
 *
 * Danach die **Prüfstellen in der erzeugten Größe** (Spec §5.2, §13.4): Formen, die erst in dieser
 * Größe Satin werden und unter ihrer Grenze liegen — sie bestimmen die Größe nicht —, und Satinstriche
 * von 1,0 bis unter 1,3 mm, der üblichen Säule des Archivs; je mit Kennung, gemessen, Grenze. Dieselben
 * stehen als Prüfstellen in der Nacharbeit-Datei von `pnpm inkstitch`.
 *
 * Danach die Feinheit **in der bestellten Größe**: welche Elemente zu fein sind — Satinstriche
 * unter ihrer Grenze (1,0 mm, Schattenlinien 0,7 mm), Lücken innerhalb einer Farbe unter 0,8 mm und
 * Stofflücken zwischen Farben (Stoff, der zwischen zwei Elementen offen bleibt, etwa der Spalt
 * zwischen Buchstabe und Schatten; ebenfalls unter 0,8 mm) — und ab welcher Logobreite sie halten.
 * Die Lücken ergeben eine zweite Zahl, „**Lücken offen ab**“ (feine Zierkanäle treiben sie weit
 * über die Mindestgröße; ob sie zusticken dürfen, entscheidet der Nutzer). Danach die Befunde nach
 * der Breite, ab der sie halten, größte zuerst.
 *
 * Schreibt out/<name>.feinheit.svg — alle Formen hellgrau, die Befunde rot, die größten und die
 * bestimmenden beschriftet (S Satinstrich, L Lücke, F Stofflücke) — und daneben
 * out/<name>.feinheit.png (tools/feinheit.mjs).
 *
 * Die Listen sind auf 40 Zeilen gekürzt und sagen es; --alle druckt jede (und alle Schattenlinien).
 * Das Bild zeigt alle Befunde.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import {
  checkMinimumSize,
  importShapes,
  initEngine,
  PRESETS,
  reviewSatin,
  SATIN_TYPICAL_MM,
} from "@texma-stitch/engine";
import {
  befundZeilen,
  feinheitSvg,
  pruefstellenZeile,
  svgZuPng,
  zusammenfassung,
} from "./feinheit.mjs";
import { sucheTor, torDetails, torKopf, torKurz } from "./tor.mjs";

const LISTE_MAX = 40;

const VALUE_FLAGS = ["--breite"];
const args = process.argv.slice(2);
const alle = args.includes("--alle");
const [svgArg, presetArg = "pique"] = args.filter(
  (a, i) => !a.startsWith("--") && !VALUE_FLAGS.includes(args[i - 1]),
);

/** Die Zahl hinter `--breite`, oder undefined ohne den Schalter; eine falsche beendet den Lauf. */
function breiteFlag() {
  const at = args.indexOf("--breite");
  if (at < 0) return undefined;
  const value = Number(args[at + 1]);
  if (args[at + 1] === undefined || !Number.isFinite(value) || value <= 0) {
    console.error(`--breite braucht eine Zahl über 0, nicht "${args[at + 1] ?? ""}"`);
    process.exit(1);
  }
  return value;
}
const breiteMm = breiteFlag();

if (!svgArg) {
  console.error("Aufruf: pnpm mindestgroesse <svg> [preset] [--breite <mm>] [--alle]");
  console.error(`Presets: ${Object.keys(PRESETS).join(", ")}`);
  process.exit(1);
}
if (!(presetArg in PRESETS)) {
  console.error(`Unbekanntes Preset "${presetArg}". Bekannt: ${Object.keys(PRESETS).join(", ")}`);
  process.exit(1);
}
const preset = PRESETS[presetArg];

const svgPath = resolve(svgArg);
const svgText = readFileSync(svgPath, "utf8");
const name = basename(svgPath, extname(svgPath)) + (breiteMm === undefined ? "" : `-${breiteMm}mm`);
const outDir = resolve("out");
mkdirSync(outDir, { recursive: true });

await initEngine();
const started = performance.now();
const original = importShapes(svgText);
const bestelltMm = breiteMm ?? original.widthMm;
if (!(bestelltMm > 0)) {
  console.error(
    `FEHLER: ${svgPath} nennt keine Größe in mm (width am <svg> mit Einheit). Ohne die bestellte ` +
      `Breite gibt es kein „hält ab“ — --breite <mm> gibt sie vor.`,
  );
  process.exit(1);
}

// Das Tor: die Mindestgröße, gesucht über die Größe.
const tor = sucheTor(svgText, original, { bestelltMm, preset });
if (tor.search === undefined) {
  console.error(`FEHLER: ${tor.fehler}`);
  process.exit(1);
}
const torSekunden = (performance.now() - started) / 1000;
for (const line of torKopf(tor, { meldung: true })) console.log(line);

// Die Prüfstellen des Tors in der Größe, in der erzeugt würde: die Formen in dieser Größe, wie der Lauf sie liest.
const pruefstart = performance.now();
const erzeugtMm = tor.search.found ? tor.search.widthMm : undefined;
const pruefstellen =
  erzeugtMm === undefined
    ? undefined
    : reviewSatin(tor.formen(erzeugtMm), {
        widthMm: erzeugtMm,
        ordered: tor.search.ordered,
        preset,
      });
const pruefSekunden = (performance.now() - pruefstart) / 1000;

// Die Feinheit in der bestellten Größe: die Formen in dieser Größe, wie der Lauf sie liest.
const shapes = tor.formen(bestelltMm);
const feinheitStart = performance.now();
const result = checkMinimumSize(shapes, { widthMm: bestelltMm, preset });
const feinheitSekunden = (performance.now() - feinheitStart) / 1000;

const heightMm =
  original.widthMm > 0 && original.heightMm > 0
    ? (original.heightMm * bestelltMm) / original.widthMm
    : 0;
const svg = feinheitSvg(shapes, result, { name, heightMm, mindest: torKurz(tor) });
const svgOut = resolve(outDir, `${name}.feinheit.svg`);
const pngOut = resolve(outDir, `${name}.feinheit.png`);
writeFileSync(svgOut, svg);
writeFileSync(pngOut, await svgZuPng(svg));

console.log(`Datei         ${svgPath}`);
console.log(
  `Logo-Breite   ${bestelltMm.toFixed(1)} mm` +
    (heightMm > 0 ? ` × ${heightMm.toFixed(1)} mm` : "") +
    (breiteMm === undefined
      ? " (Größe der SVG)"
      : ` (--breite, die SVG ist ${original.widthMm.toFixed(1)} mm breit)`) +
    `, ${shapes.length} Formen, Preset ${presetArg}`,
);
console.log(`Vorschau      out/${name}.feinheit.svg, out/${name}.feinheit.png`);

console.log(`\nMindestgröße (Spec §5.2, Tor) · ${torSekunden.toFixed(1)} s`);
for (const line of torDetails(tor, { alle })) console.log(`  ${line}`);

if (pruefstellen === undefined) {
  console.log(
    "\nPrüfstellen (Spec §5.2, §13.4): ohne gefundene Mindestgröße gibt es keine Größe, in der erzeugt würde",
  );
} else {
  console.log(
    `\nPrüfstellen in ${Number(erzeugtMm.toFixed(1))} mm, der Größe, in der erzeugt würde ` +
      `(Spec §5.2, §13.4) · ${pruefSekunden.toFixed(1)} s`,
  );
  const limits = { satinMinMm: tor.search.limits.satinMinMm, typicalMm: SATIN_TYPICAL_MM };
  console.log(`  ${pruefstellenZeile(pruefstellen, { breiteMm: erzeugtMm, limits })}`);
  if (pruefstellen.length > 0) {
    console.log("  (eigene Nummern, nicht die der Befunde unten und des Vorschaubilds)");
    for (const line of befundZeilen(pruefstellen, { max: alle ? Infinity : LISTE_MAX })) {
      console.log(`  ${line}`);
    }
  }
}

console.log(
  `\nFeinheit (Spec §5.2) in ${Number(bestelltMm.toFixed(1))} mm · ${feinheitSekunden.toFixed(1)} s`,
);
for (const line of zusammenfassung(result, { ohneMindestgroesse: true })) console.log(`  ${line}`);

if (result.findings.length > 0) {
  console.log("");
  for (const line of befundZeilen(result.findings, { max: alle ? Infinity : LISTE_MAX })) {
    console.log(`  ${line}`);
  }
}
