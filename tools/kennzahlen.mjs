/**
 * Ein Lauf gegen das TEXMA-Archiv (docs/verfahren-aus-open-source.md §1).
 *
 *   pnpm kennzahlen <svg...> [--preset pique]
 *
 * Druckt die Zahlen, an denen sich eine Datei messen lassen muss: Trims und
 * Sprünge je 1000 Stiche, Stiche je mm², Dichtespitze, Nadelhäufung — jeweils
 * mit der Einordnung gegen 192 Produktionsdateien. Die Dateien selbst liegen
 * nicht im Repo (Kundenlogos); hier stehen nur ihre Perzentile.
 */
import { readFileSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import {
  densityProfile,
  importSvg,
  initEngine,
  needleClusters,
  planDesign,
  PRESETS,
} from "@texma-stitch/engine";

/** Perzentile aus dem TEXMA-Archiv 2016–2025, 192 Dateien. */
const ARCHIV = {
  trimsPer1000: { p10: 0.3, median: 1.9, p90: 5.6, max: 10.1 },
  jumpsPer1000: { p10: 3.1, median: 7.8, p90: 18.9, max: 67.7 },
  stitchesPerMm2: { p10: 0.63, median: 1.22, p90: 2.37, max: 4.36 },
  densityMax: { p10: 11, median: 15, p90: 24, max: 44 },
  /** Einstiche je 0,2-mm-Zelle: gemessen an vier Archivdateien (§11). */
  needleMax: { p10: 4, median: 6, p90: 8, max: 8 },
};

/** Wo ein Wert im Archiv steht — das ist die eigentliche Aussage. */
function einordnen(wert, { p10, median, p90, max }) {
  if (wert <= p10) return "unter p10";
  if (wert <= median) return "bis Median";
  if (wert <= p90) return "bis p90";
  if (wert <= max) return "über p90";
  return "ÜBER ALLEM";
}

const args = process.argv.slice(2);
const presetArg = args.includes("--preset") ? args[args.indexOf("--preset") + 1] : "pique";
const files = args.filter((a) => a.endsWith(".svg"));

if (files.length === 0 || !(presetArg in PRESETS)) {
  console.error("Aufruf: pnpm kennzahlen <svg...> [--preset pique]");
  console.error(`Presets: ${Object.keys(PRESETS).join(", ")}`);
  process.exit(1);
}

await initEngine();

const zeile = (name, wert, einheit, feld) =>
  `  ${name.padEnd(22)} ${wert.padStart(8)} ${einheit.padEnd(14)} Archiv ${String(
    ARCHIV[feld].median,
  ).padStart(5)} (Median) · ${einordnen(Number(wert), ARCHIV[feld])}`;

for (const file of files) {
  const path = resolve(file);
  const name = basename(path, extname(path));
  const { design } = importSvg(readFileSync(path, "utf8"), { preset: presetArg, designId: name });
  const started = performance.now();
  const plan = planDesign(design);
  const sekunden = (performance.now() - started) / 1000;

  const all = plan.blocks.flatMap((b) => b.stitches);
  const dichte = densityProfile(all);
  const nadel = needleClusters(all);
  const { stitches, jumps, trims, bboxMm } = plan.stats;
  const flaeche = Math.max(bboxMm.w * bboxMm.h, 1);

  console.log(
    `\n${name}  (${bboxMm.w.toFixed(0)} × ${bboxMm.h.toFixed(0)} mm, ${stitches} Stiche)`,
  );
  console.log(zeile("Trims", ((trims / stitches) * 1000).toFixed(2), "je 1000", "trimsPer1000"));
  console.log(zeile("Sprünge", ((jumps / stitches) * 1000).toFixed(2), "je 1000", "jumpsPer1000"));
  console.log(zeile("Stichmenge", (stitches / flaeche).toFixed(2), "je mm²", "stitchesPerMm2"));
  console.log(zeile("Dichtespitze", String(dichte.max), "je mm²", "densityMax"));
  console.log(zeile("Nadelhäufung", String(nadel.max), "je 0,2 mm", "needleMax"));
  console.log(
    `  ${"Zellen über 18".padEnd(22)} ${String(dichte.overError).padStart(8)} von ${dichte.cells}` +
      `        ${nadel.cells} Zellen ab 6 Einstichen · ${sekunden.toFixed(1)} s Rechenzeit`,
  );
}
