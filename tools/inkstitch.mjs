/**
 * Ink/Stitch as the stitch generator, TEXMA Stitch as template prep + result
 * check (docs/adr/0001-inkstitch-als-stich-engine.md, decision 28.09.2026).
 *
 *   pnpm inkstitch <svg> [preset] [--tatami] [--ueberlappung <mm2>]
 *
 * --ueberlappung <mm2> lets overlaps under that area go in the colour order — the
 * standard is spec §10.1: any overlap binds. It is a variant for a look at the
 * result, not a setting: the output lists the overlaps whose order it turns round
 * (ids, colours, area, place), and out/<name>.tausch.json has all of them.
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
 *    The objects are stitched by colour as far as their overlaps allow
 *    (spec §10.1: two overlapping objects are never turned round), and covered
 *    tatami areas are cut out of the ones below them (knockdown, spec §4.1).
 *    Every tatami gets the preset's values as attributes and its stitch angle
 *    (spec §14, §5.1, §8.2), its outline compensated for pull along the rows and
 *    push across them (§8.1.1), and the grid underlay where it holds (§8.6) —
 *    packages/engine/src/inkstitch/tatami.ts says why not everywhere.
 * 2. Routes every run of neighbouring same-coloured satin columns with
 *    Ink/Stitch's auto_satin (--preserve_order=true: what ends under a
 *    stroke is stitched first; --trim=true), one call per run, each call on
 *    the previous call's result -> out/<name>.routed.svg.
 * 3. Sets the thread cuts with Ink/Stitch's jump_to_trim
 *    -> out/<name>.trimmed.svg. Without `inkstitch:trim_after` a jump between
 *    two objects of one colour stays a jump (Ink/Stitch ties off and on around
 *    it, but the thread lies on top of the fabric); with it the DST carries a
 *    trim (three jump records, +2/+2, -4/-4, +2/+2, which readDst reads back as
 *    one trim). Where a fill ends and the next object begins is known only to
 *    Ink/Stitch — a fill ends towards the next object, but not exactly — so the
 *    extension measures it on the real stitches and sets `trim_after` where the
 *    jump is at least the threshold of spec §10.2 (CONNECT_DEFAULTS.jumpTrimMm,
 *    5 mm). Up to 3 mm (its collapse length) Ink/Stitch does not even jump.
 * 4. output --format=dst -> out/<name>.dst.
 *
 * --tatami keeps the pure tatami run: the source SVG as drawn, with the
 * preset's row spacing on every path (withPresetAttributes), straight to
 * output. It is the baseline the satin run is measured against.
 *
 * Either way -- before any stitch is made -- the template is checked for fineness
 * (spec §5.2, packages/engine/src/inkstitch/min-size.ts): the minimum logo width, the
 * findings per kind and the five largest are printed under "Feinheit". It only reports;
 * `pnpm mindestgroesse <svg>` lists every finding and draws them.
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
  checkMinimumSize,
  CONNECT_DEFAULTS,
  densityProfile,
  importShapes,
  initEngine,
  needleClusters,
  PRESETS,
  untrimmedJumps,
} from "@texma-stitch/engine";
import { readDst, unitsToMm } from "@texma-stitch/formats";
import { renderPlanPng } from "@texma-stitch/render";
import { zeile } from "./archiv.mjs";
import { befundZeilen, zusammenfassung } from "./feinheit.mjs";
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

/** How many tatami areas run at which `inkstitch:angle`, e.g. "-45° ×12, 45° ×3, andere ×2". */
function angleSummary(svg) {
  const counts = new Map();
  for (const m of svg.matchAll(/ inkstitch:angle="(-?[\d.]+)"/g)) {
    counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
  }
  const usual = ["-45", "45"];
  const other = [...counts].filter(([a]) => !usual.includes(a)).reduce((n, [, c]) => n + c, 0);
  const parts = usual.filter((a) => counts.has(a)).map((a) => `${a}° ×${counts.get(a)}`);
  if (other > 0) parts.push(`andere ×${other}`);
  return parts.length > 0 ? parts.join(", ") : "keine Tatami";
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

/** Spec §5.2 on the shapes of the SVG; without a size in the SVG there is no ordered width to hold from. */
const pruefeFeinheit = (imported) =>
  imported.widthMm > 0
    ? checkMinimumSize(imported.shapes, { widthMm: imported.widthMm })
    : undefined;

const VALUE_FLAGS = ["--ueberlappung"];
const args = process.argv.slice(2);
const tatamiOnly = args.includes("--tatami");
const [svgArg, presetArg = "pique"] = args.filter(
  (a, i) => !a.startsWith("--") && !VALUE_FLAGS.includes(args[i - 1]),
);

/** The number after a switch, or undefined without the switch; a wrong one ends the run. */
function numberFlag(flag, { min }) {
  const at = args.indexOf(flag);
  if (at < 0) return undefined;
  const value = Number(args[at + 1]);
  if (args[at + 1] === undefined || !Number.isFinite(value) || value < min) {
    console.error(
      `${flag} braucht eine Zahl${min > 0 ? " über 0" : " ab 0"}, nicht "${args[at + 1] ?? ""}"`,
    );
    process.exit(1);
  }
  return value;
}
const minOverlapMm2 = numberFlag("--ueberlappung", { min: 0 });

if (!svgArg) {
  console.error("Aufruf: pnpm inkstitch <svg> [preset] [--tatami] [--ueberlappung <mm2>]");
  console.error(`Presets: ${Object.keys(PRESETS).join(", ")}`);
  process.exit(1);
}
if (!(presetArg in PRESETS)) {
  console.error(`Unbekanntes Preset "${presetArg}". Bekannt: ${Object.keys(PRESETS).join(", ")}`);
  process.exit(1);
}
if (tatamiOnly && minOverlapMm2 !== undefined) {
  console.error("--ueberlappung gilt für die Farbfolge der Vorlage und nicht mit --tatami");
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
let orderVariant;
let underlay;
let compensation;
let feinheit;
let templateMs = 0;
let outputInput = templatePath;

if (tatamiOnly) {
  const { text, pathCount } = withPresetAttributes(sourceSvg, {
    rowSpacingMm: preset.fillRowSpacingMm,
  });
  writeFileSync(templatePath, text);
  summary = [`Tatami-Lauf (--tatami): ${pathCount} Pfade wie gezeichnet`];
  await initEngine();
  feinheit = pruefeFeinheit(importShapes(sourceSvg));
} else {
  await initEngine();
  const started = performance.now();
  const imported = importShapes(sourceSvg);
  const template = buildInkstitchTemplate(imported.shapes, preset, {
    widthMm: imported.widthMm,
    heightMm: imported.heightMm,
    order: "colour",
    knockdown: true,
    ...(minOverlapMm2 === undefined ? {} : { minOverlapMm2 }),
  });
  templateMs = performance.now() - started;
  writeFileSync(templatePath, template.svg);
  feinheit = pruefeFeinheit(imported);

  const count = (kind) => template.objects.filter((o) => o.kind === kind).length;
  const columns = template.objects.reduce(
    (n, o) => n + (o.kind === "satin" ? o.columnIds.length : 0),
    0,
  );
  summary = [
    `Satin ${count("satin")} Formen (${columns} Säulen), Laufstich ${count("running")}, ` +
      `Tatami ${count("tatami")}`,
    `${template.satinRuns.length} Satin-Folgen für auto_satin`,
    `${template.colourBlocks} Farbblöcke in der Vorlage, Untergrenze aus den Überdeckungen ` +
      `${template.colourBlocksLowerBound}`,
    `Tatami-Winkel (Ink/Stitch, gegen den Uhrzeigersinn): ${angleSummary(template.svg)}`,
    `Zug ${preset.pullCompMm} mm entlang, Schub ${preset.pushCompMm} mm quer zu den Reihen ` +
      `in die Tatami-Flächen gerechnet (Spec §8.1.1)`,
  ];
  fallbacks = template.objects.filter((o) => o.kind === "tatami" && o.reason);
  narrowLines = template.objects.filter((o) => o.kind === "running" && o.reason);
  smoothed = template.objects.filter((o) => o.kind === "satin" && o.smoothedMm > 0);
  knockdown = template.knockdown;
  if (template.orderSwaps !== undefined) {
    orderVariant = {
      minOverlapMm2,
      colourBlocksStandard: template.colourBlocksStandard,
      colourBlocks: template.colourBlocks,
      swaps: template.orderSwaps,
    };
    writeFileSync(
      resolve(outDir, `${name}.tausch.json`),
      `${JSON.stringify(orderVariant, null, 1)}\n`,
    );
    summary.push(
      `Überlappungen unter ${minOverlapMm2} mm² binden die Reihenfolge nicht (--ueberlappung): ` +
        `${template.colourBlocksStandard} → ${template.colourBlocks} Farbblöcke, ` +
        `${template.orderSwaps.length} Überlappungen drehen um`,
    );
  }
  underlay = template.underlay;
  compensation = template.compensation;
  if (underlay.grid + underlay.without.length > 0) {
    summary.push(
      `Gitterunterlage bei ${underlay.grid} von ${underlay.grid + underlay.without.length} ` +
        `Tatami-Flächen`,
    );
  }

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

  // The thread cuts (module doc, step 3): the extension sets trim_after where the
  // jump to the next object is at least the trim threshold of spec §10.2.
  const trimmed = await inkstitch({
    extension: "jump_to_trim",
    options: { "minimum-jump-length": CONNECT_DEFAULTS.jumpTrimMm },
    svg: current,
  });
  const before = (readFileSync(current, "utf8").match(/inkstitch:trim_after="/gi) ?? []).length;
  const after = (trimmed.stdout.toString("utf8").match(/inkstitch:trim_after="/gi) ?? []).length;
  calls.push({ what: "jump_to_trim", ms: trimmed.ms });
  if (trimmed.stderr.trim()) {
    stderrLines.push(
      ...trimmed.stderr
        .trim()
        .split("\n")
        .map((l) => `jump_to_trim: ${l}`),
    );
  }
  outputInput = resolve(outDir, `${name}.trimmed.svg`);
  writeFileSync(outputInput, trimmed.stdout);
  summary.push(
    `${after - before} Fadenschnitte gesetzt (Sprung ab ${CONNECT_DEFAULTS.jumpTrimMm} mm), ` +
      `${after} Objekte mit trim_after`,
  );
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
const offen = untrimmedJumps(foreignStitches, CONNECT_DEFAULTS.jumpTrimMm);
const flaeche = Math.max(stats.bboxMm.w * stats.bboxMm.h, 1);

console.log(`Datei       ${svgPath}`);
console.log(
  `Preset      ${presetArg} (Reihenabstand ${preset.fillRowSpacingMm} mm, ` +
    `Satin-Abstand ${preset.satinSpacingMm} mm)`,
);
console.log(`Vorlage     out/${name}.inkstitch.svg`);
if (!tatamiOnly && outputInput !== templatePath) {
  console.log(`Geroutet    out/${name}.routed.svg`);
  console.log(`Fadenschnitte out/${name}.trimmed.svg`);
}
console.log(`DST         out/${name}.dst`);
console.log(`Vorschau    out/${name}.png`);
for (const line of summary) console.log(`            ${line}`);

console.log("\nFeinheit (Spec §5.2)");
if (!feinheit) {
  console.log("  Die SVG nennt keine Größe in mm — ohne die bestellte Breite kein „hält ab“.");
} else {
  for (const line of zusammenfassung(feinheit)) console.log(`  ${line}`);
  if (feinheit.findings.length > 0) {
    console.log("\n  Die fünf größten Befunde (alle: pnpm mindestgroesse <svg>)");
    for (const line of befundZeilen(feinheit.findings, { max: 5 })) console.log(`  ${line}`);
  }
}

if (fallbacks.length > 0) {
  console.log(`\nBleibt Tatami (als Satin oder Laufstich vorgesehen, ${fallbacks.length})`);
  for (const f of fallbacks) console.log(`  ${f.shapeId}: ${f.reason}`);
}
if (knockdown) {
  console.log(
    `\nKnockdown (Spec §4.1, §4.2): ${knockdown.changed} Tatami-Flächen verändert, ` +
      `${knockdown.covered.length} ganz verdeckt, ${knockdown.split.length} in Teile zerfallen`,
  );
  console.log(
    `  Tatami-Fläche ${knockdown.areaMm2.before.toFixed(0)} → ${knockdown.areaMm2.after.toFixed(0)} mm²`,
  );
  for (const id of knockdown.covered) console.log(`  FILL_COVERED  ${id} (nicht gestickt)`);
  for (const f of knockdown.split) console.log(`  SHAPE_SPLIT   ${f.id}: ${f.parts} Teile`);
  if (knockdown.satin.length > 0) {
    const mm2 = knockdown.satin.reduce((sum, c) => sum + c.mm2, 0);
    console.log(
      `  Satin spart aus (Spec §4.2): ${knockdown.satin.length} Tatami-Flächen, ${mm2.toFixed(0)} mm²`,
    );
    for (const c of knockdown.satin.slice(0, 12)) {
      console.log(`    ${c.id}: ${c.mm2.toFixed(1)} mm² ausgespart`);
    }
    if (knockdown.satin.length > 12) {
      console.log(`    … und ${knockdown.satin.length - 12} weitere (nicht aufgelistet)`);
    }
  }
}
if (orderVariant) {
  const { swaps } = orderVariant;
  console.log(
    `\nReihenfolge (--ueberlappung ${minOverlapMm2} mm²; der Standard ist §10.1: jede ` +
      `Überlappung bindet): ${swaps.length} Überlappungen drehen um`,
  );
  const mm = (v) => v.toFixed(1);
  for (const w of swaps.slice(0, 15)) {
    console.log(
      `  ${w.under.id} (${w.under.colour}) und ${w.over.id} (${w.over.colour}): ` +
        `${w.overlapMm2.toFixed(1)} mm² bei x ${mm(w.at.x)}, y ${mm(w.at.y)} ` +
        `(${mm(w.at.w)} × ${mm(w.at.h)} mm)` +
        (w.pieces > 1
          ? `, ${w.pieces} Stücke, das größte bei x ${mm(w.largest.x)}, y ${mm(w.largest.y)}`
          : "") +
        ` — jetzt liegt ${w.under.id} oben`,
    );
  }
  if (swaps.length > 15) {
    console.log(`  … und ${swaps.length - 15} weitere (alle in out/${name}.tausch.json)`);
  }
}
if (underlay && underlay.without.length > 0) {
  const shown = underlay.without.slice(0, 12);
  console.log(
    `\nOhne Gitterunterlage (Spec §8.6, Einzug hält nicht als ein Stück, ${underlay.without.length})`,
  );
  for (const w of shown) {
    const why =
      w.pieces === 0
        ? "zu schmal für einen Einzug"
        : w.pieces === 1
          ? "Band oder keine Reihe erreicht sie"
          : `Einzug zerfällt in ${w.pieces} Stücke`;
    console.log(`  ${w.id}: ${why}`);
  }
  if (underlay.without.length > shown.length) {
    console.log(`  … und ${underlay.without.length - shown.length} weitere (nicht aufgelistet)`);
  }
}
if (compensation && compensation.pulledOnly.length + compensation.vanished.length > 0) {
  console.log(
    `\nZug und Schub (Spec §8.1.1): ${compensation.pulledOnly.length} Flächen nur mit Zug ` +
      `(der Schub würde sie zerlegen), ${compensation.vanished.length} verschwinden darunter ` +
      `(ohne Ausgleich gestickt)`,
  );
  for (const c of compensation.pulledOnly.slice(0, 12)) {
    console.log(`  ${c.id}: der Schub würde sie in ${c.parts} Teile zerlegen`);
  }
  if (compensation.pulledOnly.length > 12) {
    console.log(`  … und ${compensation.pulledOnly.length - 12} weitere (nicht aufgelistet)`);
  }
  for (const id of compensation.vanished.slice(0, 12)) console.log(`  ${id}: verschwindet`);
  if (compensation.vanished.length > 12) {
    console.log(`  … und ${compensation.vanished.length - 12} weitere (nicht aufgelistet)`);
  }
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
console.log(
  `  ${"Fäden auf dem Stoff".padEnd(22)} ${String(offen.count).padStart(8)} Sprünge über ` +
    `${CONNECT_DEFAULTS.jumpTrimMm} mm ohne Fadenschnitt` +
    `${offen.count > 0 ? `, längster ${offen.longestMm.toFixed(1)} mm` : ""}`,
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
