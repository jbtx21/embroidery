/**
 * Feinheit und Mindestgröße vor dem Sticken (docs/Engine-Spezifikation.md §5.2).
 *
 *   pnpm mindestgroesse <svg> [--alle]
 *
 * Liest die SVG in der bestellten Größe (Breite der SVG in mm) und meldet, welche Elemente des
 * Logos zu fein sind — Satinstriche unter 1,3 mm, Lücken innerhalb einer Farbe unter 0,8 mm und
 * Stofflücken zwischen Farben (Stoff, der zwischen zwei Elementen offen bleibt, etwa der Spalt
 * zwischen Buchstabe und Schatten; ebenfalls unter 0,8 mm) — und ab welcher Logobreite sie halten.
 * Druckt zwei Zahlen, jede mit dem Element, das sie bestimmt: die **Mindestgröße** aus den
 * Satinstrichen allein (ab dieser Breite sind alle mindestens 1,3 mm) und „**Lücken offen ab**“
 * aus den Lücken und Stofflücken (feine Zierkanäle treiben sie weit darüber; ob sie zusticken
 * dürfen, entscheidet der Nutzer). Danach die Befunde nach der Breite, ab der sie halten, größte
 * zuerst. Ändert nichts an der Vorlage.
 *
 * Schreibt out/<name>.feinheit.svg — alle Formen hellgrau, die Befunde rot, die größten und die
 * bestimmenden beschriftet (S Satinstrich, L Lücke, F Stofflücke) — und daneben
 * out/<name>.feinheit.png (tools/feinheit.mjs).
 *
 * Die Liste ist auf 40 Befunde gekürzt und sagt es; --alle druckt jeden. Das Bild zeigt sie alle.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import { checkMinimumSize, importShapes, initEngine } from "@texma-stitch/engine";
import { befundZeilen, feinheitSvg, svgZuPng, zusammenfassung } from "./feinheit.mjs";

const LISTE_MAX = 40;

const args = process.argv.slice(2);
const alle = args.includes("--alle");
const [svgArg] = args.filter((a) => !a.startsWith("--"));

if (!svgArg) {
  console.error("Aufruf: pnpm mindestgroesse <svg> [--alle]");
  process.exit(1);
}

const svgPath = resolve(svgArg);
const name = basename(svgPath, extname(svgPath));
const outDir = resolve("out");
mkdirSync(outDir, { recursive: true });

await initEngine();
const started = performance.now();
const imported = importShapes(readFileSync(svgPath, "utf8"));
if (!(imported.widthMm > 0)) {
  console.error(
    `FEHLER: ${svgPath} nennt keine Größe in mm (width am <svg> mit Einheit). Ohne die bestellte ` +
      `Breite gibt es kein „hält ab“.`,
  );
  process.exit(1);
}
const result = checkMinimumSize(imported.shapes, { widthMm: imported.widthMm });
const sekunden = (performance.now() - started) / 1000;

const svg = feinheitSvg(imported.shapes, result, { name, heightMm: imported.heightMm });
const svgOut = resolve(outDir, `${name}.feinheit.svg`);
const pngOut = resolve(outDir, `${name}.feinheit.png`);
writeFileSync(svgOut, svg);
writeFileSync(pngOut, await svgZuPng(svg));

console.log(`Datei         ${svgPath}`);
console.log(
  `Logo-Breite   ${imported.widthMm.toFixed(1)} mm` +
    (imported.heightMm > 0 ? ` × ${imported.heightMm.toFixed(1)} mm` : "") +
    ` (Größe der SVG), ${imported.shapes.length} Formen`,
);
console.log(`Vorschau      out/${name}.feinheit.svg, out/${name}.feinheit.png`);
console.log(`\nFeinheit (Spec §5.2) · ${sekunden.toFixed(1)} s`);
for (const line of zusammenfassung(result)) console.log(`  ${line}`);

if (result.findings.length > 0) {
  console.log("");
  for (const line of befundZeilen(result.findings, { max: alle ? Infinity : LISTE_MAX })) {
    console.log(`  ${line}`);
  }
}
