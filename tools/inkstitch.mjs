/**
 * Ink/Stitch as the stitch generator, TEXMA Stitch as template prep + result
 * check (docs/adr/0001-inkstitch-als-stich-engine.md, decision 28.09.2026).
 *
 *   pnpm inkstitch <svg> [preset] [--tatami]
 *
 * Satin (default) — lettering and narrow shapes set the way a puncher sets
 * them:
 *
 * 1. Imports <svg> (importShapes) and writes the template
 *    out/<name>.inkstitch.svg (@texma-stitch/engine buildInkstitchTemplate):
 *    every shape classified by width — running stitch, native Ink/Stitch
 *    satin columns (one per stroke of a letter: rails, rungs, the preset's
 *    parameters), or tatami — plus the reason for every shape that was meant
 *    for satin and stays tatami, or, under 1 mm, is set as a running stitch.
 *    Covered tatami areas are cut out of the ones below them (knockdown, spec
 *    §4.1).
 * 2. Routes every run of neighbouring same-coloured satin columns with
 *    Ink/Stitch's auto_satin (--preserve_order=true: what ends under a
 *    stroke is stitched first; --trim=true), one call per run, each call on
 *    the previous call's result -> out/<name>.routed.svg.
 * 3. output --format=dst -> out/<name>.dst.
 *
 * --tatami keeps the pure tatami run: the source SVG as drawn, with the
 * preset's row spacing on every path (withPresetAttributes), straight to
 * output. It is the baseline the satin run is measured against.
 *
 * Either way the DST is read back with @texma-stitch/formats, rendered to
 * out/<name>.png with @texma-stitch/render, and measured: the archive-relative
 * metrics `pnpm kennzahlen` prints (tools/archiv.mjs), our own analyze()
 * warnings (the "prüft das Ergebnis" half of the 28.09.2026 decision), the
 * time every Ink/Stitch call took, and whatever Ink/Stitch wrote to stderr.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import {
  analyze,
  buildInkstitchTemplate,
  densityProfile,
  importShapes,
  initEngine,
  needleClusters,
  PRESETS,
} from "@texma-stitch/engine";
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

/** One Ink/Stitch call; a failure ends the run with its message (no guessed result). */
async function inkstitch(args) {
  try {
    return await runInkstitch(args);
  } catch (err) {
    console.error(`FEHLER: ${err.message}`);
    process.exit(1);
  }
}

const args = process.argv.slice(2);
const tatamiOnly = args.includes("--tatami");
const [svgArg, presetArg = "pique"] = args.filter((a) => !a.startsWith("--"));

if (!svgArg) {
  console.error("Aufruf: pnpm inkstitch <svg> [preset] [--tatami]");
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
const templatePath = resolve(outDir, `${name}.inkstitch.svg`);
const sourceSvg = readFileSync(svgPath, "utf8");
/** Every Ink/Stitch call: what it did and how long it took. */
const calls = [];
const stderrLines = [];
let summary = [];
let fallbacks = [];
let narrowLines = [];
let smoothed = [];
let knockdown;
let templateMs = 0;
let outputInput = templatePath;

if (tatamiOnly) {
  const { text, pathCount } = withPresetAttributes(sourceSvg, {
    rowSpacingMm: preset.fillRowSpacingMm,
  });
  writeFileSync(templatePath, text);
  summary = [`Tatami-Lauf (--tatami): ${pathCount} Pfade wie gezeichnet`];
} else {
  await initEngine();
  const started = performance.now();
  const imported = importShapes(sourceSvg);
  const template = buildInkstitchTemplate(imported.shapes, preset, {
    widthMm: imported.widthMm,
    heightMm: imported.heightMm,
    knockdown: true,
  });
  templateMs = performance.now() - started;
  writeFileSync(templatePath, template.svg);

  const count = (kind) => template.objects.filter((o) => o.kind === kind).length;
  const columns = template.objects.reduce(
    (n, o) => n + (o.kind === "satin" ? o.columnIds.length : 0),
    0,
  );
  summary = [
    `Satin ${count("satin")} Formen (${columns} Säulen), Laufstich ${count("running")}, ` +
      `Tatami ${count("tatami")}`,
    `${template.satinRuns.length} Satin-Folgen für auto_satin`,
  ];
  fallbacks = template.objects.filter((o) => o.kind === "tatami" && o.reason);
  narrowLines = template.objects.filter((o) => o.kind === "running" && o.reason);
  smoothed = template.objects.filter((o) => o.kind === "satin" && o.smoothedMm > 0);
  knockdown = template.knockdown;

  let current = templatePath;
  for (const [i, ids] of template.satinRuns.entries()) {
    const { stdout, stderr, ms } = await inkstitch({
      extension: "auto_satin",
      ids,
      options: { preserve_order: true, trim: true },
      svg: current,
    });
    calls.push({
      what: `auto_satin ${i + 1}/${template.satinRuns.length} (${ids.length} Säulen)`,
      ms,
    });
    if (stderr.trim())
      stderrLines.push(
        ...stderr
          .trim()
          .split("\n")
          .map((l) => `auto_satin: ${l}`),
      );
    current = resolve(outDir, `${name}.routed.svg`);
    writeFileSync(current, stdout);
  }
  outputInput = current;
}

const {
  stdout,
  stderr,
  ms: outputMs,
} = await inkstitch({
  extension: "output",
  options: { format: "dst" },
  svg: outputInput,
});
calls.push({ what: "output --format=dst", ms: outputMs });
if (stderr.trim()) stderrLines.push(...stderr.trim().split("\n"));

const dstPath = resolve(outDir, `${name}.dst`);
writeFileSync(dstPath, stdout);

const inkstitchMs = calls.reduce((sum, c) => sum + c.ms, 0);
const foreignStitches = unitsToMm(readDst(new Uint8Array(stdout)).stitches);
const blocks = blocksFromForeignStitches(foreignStitches);
const { stats: analyzedStats, warnings } = analyze(blocks);
const stats = { ...analyzedStats, runtimeSec: inkstitchMs / 1000 };
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
  `Preset      ${presetArg} (Reihenabstand ${preset.fillRowSpacingMm} mm, ` +
    `Satin-Abstand ${preset.satinSpacingMm} mm)`,
);
console.log(`Vorlage     out/${name}.inkstitch.svg`);
if (!tatamiOnly && outputInput !== templatePath) console.log(`Geroutet    out/${name}.routed.svg`);
console.log(`DST         out/${name}.dst`);
console.log(`Vorschau    out/${name}.png`);
for (const line of summary) console.log(`            ${line}`);

if (fallbacks.length > 0) {
  console.log(`\nBleibt Tatami (als Satin oder Laufstich vorgesehen, ${fallbacks.length})`);
  for (const f of fallbacks) console.log(`  ${f.shapeId}: ${f.reason}`);
}
if (knockdown) {
  console.log(
    `\nKnockdown (Spec §4.1): ${knockdown.changed} Tatami-Flächen verändert, ` +
      `${knockdown.covered.length} ganz verdeckt, ${knockdown.split.length} in Teile zerfallen`,
  );
  console.log(
    `  Tatami-Fläche ${knockdown.areaMm2.before.toFixed(0)} → ${knockdown.areaMm2.after.toFixed(0)} mm²`,
  );
  for (const id of knockdown.covered) console.log(`  FILL_COVERED  ${id} (nicht gestickt)`);
  for (const f of knockdown.split) console.log(`  SHAPE_SPLIT   ${f.id}: ${f.parts} Teile`);
}
if (narrowLines.length > 0) {
  console.log(`\nLaufstich statt Satinsäule (unter 1 mm, ${narrowLines.length})`);
  for (const f of narrowLines) console.log(`  ${f.shapeId}: ${f.reason}`);
}
if (smoothed.length > 0) {
  console.log(`\nSatin auf geglätteter Kontur (${smoothed.length})`);
  for (const s of smoothed) {
    console.log(
      `  ${s.shapeId}: um ${s.smoothedMm} mm geglättet, Deckung ${(s.coverage * 100).toFixed(1)} %`,
    );
  }
}

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
if (!tatamiOnly) console.log(`  Laufzeit Vorlage       ${(templateMs / 1000).toFixed(1)} s`);
console.log(`  Laufzeit (Ink/Stitch)  ${(inkstitchMs / 1000).toFixed(1)} s`);
for (const c of calls) console.log(`    ${c.what.padEnd(34)} ${(c.ms / 1000).toFixed(1)} s`);

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

if (stderrLines.length === 0) {
  console.log("\nInk/Stitch  keine Hinweise (stderr leer)");
} else {
  console.log("\nInk/Stitch-Hinweise (stderr)");
  for (const line of stderrLines) console.log(`  ${line}`);
}
