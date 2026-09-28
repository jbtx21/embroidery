/**
 * Ink/Stitch as the stitch generator, TEXMA Stitch as template prep + result
 * check (docs/adr/0001-inkstitch-als-stich-engine.md, decision 28.09.2026).
 *
 *   pnpm inkstitch <svg> [preset]
 *
 * 1. Copies <svg> to out/<name>.inkstitch.svg with the preset's fill row
 *    spacing set on every path (xmlns:inkstitch, inkstitch:row_spacing_mm --
 *    see withPresetAttributes below; today the only preset attribute this
 *    sets, matching the scratchpad probe run).
 * 2. Runs it through Ink/Stitch itself (--extension=output --format=dst, via
 *    tools/inkstitch-lauf.mjs -- a separate process, see inkstitch/README.md).
 * 3. Reads the resulting DST with @texma-stitch/formats and renders it to a
 *    PNG with @texma-stitch/render, so the result can be eyeballed like any
 *    of our own `pnpm demo` output.
 * 4. Prints the same archive-relative metrics `pnpm kennzahlen` does
 *    (tools/archiv.mjs) plus our own analyze() warnings over the result (the
 *    "prüft das Ergebnis" half of the 28.09.2026 decision) and whatever
 *    Ink/Stitch itself wrote to stderr, as hints.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import { analyze, densityProfile, needleClusters, PRESETS } from "@texma-stitch/engine";
import { readDst, unitsToMm } from "@texma-stitch/formats";
import { renderPlanPng } from "@texma-stitch/render";
import { zeile } from "./archiv.mjs";
import { isInkstitchReady, runInkstitch, SETUP_HINT } from "./inkstitch-lauf.mjs";

const INKSTITCH_NS = "http://inkstitch.org/namespace";

/** Cosmetic only: DST carries no thread colours, so the preview just needs
 * distinct hues per colour block, cycled if there are more blocks than colours. */
const PREVIEW_PALETTE = [
  "#c8102e",
  "#101820",
  "#0072ce",
  "#ffb81c",
  "#00843d",
  "#7d3f98",
  "#e8751a",
  "#5b6770",
];

/**
 * Sets the namespace and `inkstitch:row_spacing_mm` on every `<path>` that
 * does not already carry it -- mirrors make_pique_variant.py from the
 * scratchpad probe run (simple, regex-based: our own templates are
 * well-formed SVG with plain `<path .../>` tags; a full XML parser is not
 * worth a new dependency for one attribute).
 */
function withPresetAttributes(svgText, { rowSpacingMm }) {
  let text = svgText;

  if (!/xmlns:inkstitch\s*=/.test(text)) {
    const before = text;
    text = text.replace(/<svg\b/, `<svg xmlns:inkstitch="${INKSTITCH_NS}"`);
    if (text === before) throw new Error("kein <svg>-Starttag gefunden");
  }

  let pathCount = 0;
  text = text.replace(/<path\b[^>]*>/g, (tag) => {
    if (/inkstitch:row_spacing_mm\s*=/.test(tag)) return tag;
    pathCount++;
    return tag.replace(/<path\b/, `<path inkstitch:row_spacing_mm="${rowSpacingMm}"`);
  });

  return { text, pathCount };
}

/**
 * A flat Ink/Stitch stitch stream has no block boundaries of its own -- only
 * `cmd: "color"` markers in the middle of the stream. @texma-stitch/render
 * colours a whole StitchBlock at once (block.threadIndex), so this splits the
 * stream into one block per colour, which is also what a colour-change count
 * actually means: n colour changes = n + 1 blocks ("Farbblöcke").
 */
function blocksFromForeignStitches(stitches) {
  const blocks = [];
  let current = { objectId: "ink-0", threadIndex: 0, stitches: [] };
  blocks.push(current);
  for (const s of stitches) {
    current.stitches.push(s);
    if (s.cmd === "color") {
      current = { objectId: `ink-${blocks.length}`, threadIndex: blocks.length, stitches: [] };
      blocks.push(current);
    }
  }
  return blocks.filter((b) => b.stitches.length > 0);
}

const [, , svgArg, presetArg = "pique"] = process.argv;

if (!svgArg) {
  console.error("Aufruf: pnpm inkstitch <svg> [preset]");
  console.error(`Presets: ${Object.keys(PRESETS).join(", ")}`);
  process.exit(1);
}
if (!(presetArg in PRESETS)) {
  console.error(`Unbekanntes Preset "${presetArg}". Bekannt: ${Object.keys(PRESETS).join(", ")}`);
  process.exit(1);
}
if (!isInkstitchReady()) {
  console.error(SETUP_HINT);
  process.exit(1);
}

const svgPath = resolve(svgArg);
const name = basename(svgPath, extname(svgPath));
const outDir = resolve("out");
mkdirSync(outDir, { recursive: true });

const preset = PRESETS[presetArg];
const { text: templateSvg, pathCount } = withPresetAttributes(readFileSync(svgPath, "utf8"), {
  rowSpacingMm: preset.fillRowSpacingMm,
});
const templatePath = resolve(outDir, `${name}.inkstitch.svg`);
writeFileSync(templatePath, templateSvg);

let stdout, stderr, ms;
try {
  ({ stdout, stderr, ms } = await runInkstitch({
    extension: "output",
    options: { format: "dst" },
    svg: templatePath,
  }));
} catch (err) {
  console.error(`FEHLER: ${err.message}`);
  process.exit(1);
}

const dstPath = resolve(outDir, `${name}.dst`);
writeFileSync(dstPath, stdout);

const foreignStitches = unitsToMm(readDst(new Uint8Array(stdout)).stitches);
const blocks = blocksFromForeignStitches(foreignStitches);
const { stats: analyzedStats, warnings } = analyze(blocks);
const stats = { ...analyzedStats, runtimeSec: ms / 1000 };
const farbbloecke = stats.colorChanges + 1;

const threads = blocks.map((_, i) => ({
  brand: "madeira",
  number: String(i),
  hex: PREVIEW_PALETTE[i % PREVIEW_PALETTE.length],
  name: `Block ${i}`,
}));
writeFileSync(
  resolve(outDir, `${name}.png`),
  await renderPlanPng({ blocks, stats, warnings }, { threads }),
);

const dichte = densityProfile(foreignStitches);
const nadel = needleClusters(foreignStitches);
const flaeche = Math.max(stats.bboxMm.w * stats.bboxMm.h, 1);

console.log(`Datei       ${svgPath}`);
console.log(
  `Preset      ${presetArg} (Reihenabstand ${preset.fillRowSpacingMm} mm, ${pathCount} Pfade)`,
);
console.log(`Vorlage     out/${name}.inkstitch.svg`);
console.log(`DST         out/${name}.dst`);
console.log(`Vorschau    out/${name}.png`);
console.log(`\n${name}  (${stats.bboxMm.w.toFixed(1)} × ${stats.bboxMm.h.toFixed(1)} mm)`);
console.log(`  Stiche                 ${stats.stitches}`);
console.log(`  Sprünge                ${stats.jumps}`);
console.log(`  Trims                  ${stats.trims}`);
console.log(`  Farbblöcke             ${farbbloecke} (${stats.colorChanges} Farbwechsel)`);
console.log(
  zeile("Trims", ((stats.trims / stats.stitches) * 1000).toFixed(2), "je 1000", "trimsPer1000"),
);
console.log(
  zeile("Sprünge", ((stats.jumps / stats.stitches) * 1000).toFixed(2), "je 1000", "jumpsPer1000"),
);
console.log(zeile("Stichmenge", (stats.stitches / flaeche).toFixed(2), "je mm²", "stitchesPerMm2"));
console.log(zeile("Dichtespitze", String(dichte.max), "je mm²", "densityMax"));
console.log(zeile("Nadelhäufung", String(nadel.max), "je 0,2 mm", "needleMax"));
console.log(
  `  ${"Zellen über 18".padEnd(22)} ${String(dichte.overError).padStart(8)} von ${dichte.cells}` +
    `        ${nadel.cells} Zellen ab 6 Einstichen`,
);
console.log(`  Laufzeit (Ink/Stitch)  ${(ms / 1000).toFixed(1)} s`);

if (warnings.length === 0) {
  console.log("\nWarnungen   keine (eigene Prüfung, analyze())");
} else {
  console.log("\nWarnungen (eigene Prüfung, analyze())");
  for (const w of warnings) {
    console.log(
      `  ${w.severity.padEnd(5)} ${w.code}${w.objectId ? ` (${w.objectId})` : ""}: ${w.message}`,
    );
  }
}

const stderrText = stderr.trim();
if (stderrText.length === 0) {
  console.log("\nInk/Stitch  keine Hinweise (stderr leer)");
} else {
  console.log("\nInk/Stitch-Hinweise (stderr)");
  for (const line of stderrText.split("\n")) console.log(`  ${line}`);
}
