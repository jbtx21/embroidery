/**
 * The parameter matrix, a test pattern per fabric (docs/probesticks.md, "Testmuster je Stoff"):
 *
 *   pnpm testmuster <preset> [--reihenabstand a,b,c] [--stichlaenge a,b,c]
 *                            [--satinbreite a,b,c] [--satinabstand a,b,c]
 *
 * One DST that stitches the stitch parameters side by side, so that the piece itself shows which values
 * suit the fabric of the preset (packages/engine/src/inkstitch/testmuster.ts says what lies where):
 *
 * - block A, tatami 3 × 3: rows by row spacing (default 0.19 / 0.21 / 0.24 mm, `--reihenabstand`),
 *   columns by stitch length (3 / 4 / 5 mm, `--stichlaenge`);
 * - block B, satin 3 × 3: columns by width (1 / 2.5 / 4.5 mm, `--satinbreite`), rows by zigzag spacing
 *   (0.34 / 0.38 / 0.42 mm, `--satinabstand`);
 * - block C, pull compensation: four 20 × 20 mm squares to measure with a caliper.
 *
 * Every list is three numbers, with a dot as the decimal mark and commas between. Everything else in a
 * field is the preset's, as in an order. Writes to out/:
 *
 *   testmuster-<preset>.svg          the template Ink/Stitch stitches
 *   testmuster-<preset>.dst          Ink/Stitch `output --format=dst`, a thread cut after every field
 *   testmuster-<preset>.png          the preview
 *   testmuster-<preset>.legende.txt  what lies where, with the values of every field
 *
 * Every run gets a stitch-plan cache of its own (inkstitch/README.md, "Versionswechsel"): what an earlier
 * run left behind cannot answer for this one. The module exports what the smoke test and the report use;
 * run as a script it does the whole job.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  buildTestPattern,
  initEngine,
  PRESETS,
  TEST_PATTERN_LAYOUT,
  testPatternLegend,
} from "@texma-stitch/engine";
import { readDst, unitsToMm } from "@texma-stitch/formats";
import { renderPlanPng } from "@texma-stitch/render";
import { isInkstitchReady, runInkstitch, SETUP_HINT } from "./inkstitch-lauf.mjs";
import { analysiere } from "./tor.mjs";

/** Pixels per millimetre of the preview: finer than the other previews, the fields are small. */
const PREVIEW_PX_PER_MM = 10;

/** The switches that take a list of three numbers, and the option of the pattern each one sets. */
export const LIST_FLAGS = {
  "--reihenabstand": "rowSpacingsMm",
  "--stichlaenge": "stitchLengthsMm",
  "--satinbreite": "satinWidthsMm",
  "--satinabstand": "satinSpacingsMm",
};

export const USAGE =
  "Aufruf: pnpm testmuster <preset> [--reihenabstand a,b,c] [--stichlaenge a,b,c] " +
  "[--satinbreite a,b,c] [--satinabstand a,b,c]\n" +
  `Presets: ${Object.keys(PRESETS).join(", ")}\n` +
  "Je Liste drei Zahlen mit Punkt als Dezimalzeichen, z. B. --reihenabstand 0.19,0.21,0.24";

/** A call that is wrong: the message says how, and the script prints the usage under it. */
export class UsageError extends Error {}

/**
 * One list of three numbers over 0 (a satin width up to the cell it stands in), or a UsageError that says
 * what was given.
 */
function parseList(flag, text) {
  const shown = text === undefined ? "" : text;
  const parts = shown.split(",");
  const numbers = parts.map((p) => (p.trim() === "" ? Number.NaN : Number(p)));
  const max = flag === "--satinbreite" ? TEST_PATTERN_LAYOUT.cellMm : Number.POSITIVE_INFINITY;
  if (parts.length !== 3 || !numbers.every((n) => Number.isFinite(n) && n > 0 && n <= max)) {
    throw new UsageError(
      `${flag} braucht drei Zahlen über 0${max < Number.POSITIVE_INFINITY ? ` und bis ${max}` : ""}, ` +
        `mit Komma getrennt und mit Punkt als Dezimalzeichen (z. B. 0.19,0.21,0.24), nicht "${shown}"`,
    );
  }
  return numbers;
}

/**
 * The preset and the options of the pattern from the command line (module doc). A wrong call is a
 * UsageError: no preset, an unknown one, an unknown switch, a switch twice or without its list.
 */
export function parseArgs(argv) {
  const options = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const key = LIST_FLAGS[arg];
    if (key === undefined) {
      throw new UsageError(
        `Unbekannte Option ${arg}. Bekannt: ${Object.keys(LIST_FLAGS).join(", ")}`,
      );
    }
    if (key in options) throw new UsageError(`${arg} steht zweimal da`);
    options[key] = parseList(arg, argv[++i]);
  }
  if (positional.length === 0) throw new UsageError("Es fehlt das Preset");
  if (positional.length > 1) {
    throw new UsageError(`Nur ein Preset, nicht: ${positional.join(" ")}`);
  }
  const presetId = positional[0];
  if (!(presetId in PRESETS)) {
    throw new UsageError(
      `Unbekanntes Preset "${presetId}". Bekannt: ${Object.keys(PRESETS).join(", ")}`,
    );
  }
  return { presetId, options };
}

/** Runs `fn` with an Ink/Stitch stitch-plan cache of its own, gone again afterwards. */
async function inFreshCache(fn) {
  const dir = mkdtempSync(join(tmpdir(), "texma-testmuster-"));
  const before = process.env.XDG_CONFIG_HOME;
  process.env.XDG_CONFIG_HOME = dir;
  try {
    return await fn();
  } finally {
    if (before === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = before;
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Builds the pattern of a preset, stitches it with Ink/Stitch and writes the four files into `outDir`
 * (module doc). Rejects where Ink/Stitch is not set up or fails; nothing is mended.
 *
 * @param {object} args
 * @param {string} args.presetId One of PRESETS.
 * @param {import("@texma-stitch/engine").TestPatternOptions} [args.options] Values of the matrix.
 * @param {string} [args.outDir] Default ./out.
 */
export async function writeTestPattern({ presetId, options = {}, outDir = resolve("out") }) {
  const preset = PRESETS[presetId];
  if (preset === undefined) {
    throw new UsageError(
      `Unbekanntes Preset "${presetId}". Bekannt: ${Object.keys(PRESETS).join(", ")}`,
    );
  }
  if (!isInkstitchReady()) throw new Error(SETUP_HINT);
  await initEngine();
  const pattern = buildTestPattern(preset, options);

  const name = `testmuster-${presetId}`;
  mkdirSync(outDir, { recursive: true });
  const paths = {
    svg: resolve(outDir, `${name}.svg`),
    dst: resolve(outDir, `${name}.dst`),
    png: resolve(outDir, `${name}.png`),
    legend: resolve(outDir, `${name}.legende.txt`),
  };
  writeFileSync(paths.svg, pattern.svg);
  const run = await inFreshCache(() =>
    runInkstitch({ extension: "output", options: { format: "dst" }, svg: paths.svg }),
  );
  writeFileSync(paths.dst, run.stdout);

  // One colour is one block of stitches: the DST carries no thread colours.
  const stitches = unitsToMm(readDst(new Uint8Array(run.stdout)).stitches);
  const blocks = [{ objectId: name, threadIndex: 0, stitches }];
  const { stats, warnings } = analysiere(blocks, preset);

  const threads = [{ brand: "madeira", number: "0", hex: pattern.colour, name: "Testmuster" }];
  writeFileSync(
    paths.png,
    await renderPlanPng({ blocks, stats, warnings }, { threads, pxPerMm: PREVIEW_PX_PER_MM }),
  );
  writeFileSync(
    paths.legend,
    testPatternLegend(pattern, preset, {
      name,
      stitches: stats.stitches,
      trims: stats.trims,
      widthMm: stats.bboxMm.w,
      heightMm: stats.bboxMm.h,
    }),
  );
  return {
    name,
    presetId,
    preset,
    pattern,
    paths,
    stats,
    warnings,
    stderr: run.stderr,
    inkstitchMs: run.ms,
  };
}

/** What the script prints (module doc): the files, then stitches, cuts, size and what Ink/Stitch said. */
export function reportLines(result, { base = process.cwd() } = {}) {
  const { pattern, paths, stats, warnings } = result;
  const shown = (path) => relative(base, path);
  const count = (block) => pattern.fields.filter((f) => f.block === block).length;
  const lines = [
    `Preset      ${result.presetId} (${result.preset.label})`,
    `Felder      ${pattern.fields.length} (Block A ${count("A")}, Block B ${count("B")}, ` +
      `Block C ${count("C")}) und die Lagemarke oben links`,
    `Vorlage     ${shown(paths.svg)}`,
    `DST         ${shown(paths.dst)}`,
    `Vorschau    ${shown(paths.png)}`,
    `Legende     ${shown(paths.legend)}`,
    "",
    `${result.name}  (${stats.bboxMm.w.toFixed(1)} × ${stats.bboxMm.h.toFixed(1)} mm)`,
    `  Stiche                 ${stats.stitches}`,
    `  Schnitte               ${stats.trims} (die Lagemarke und ${pattern.fields.length} Felder)`,
    `  Sprünge                ${stats.jumps}`,
    `  Größe                  ${stats.bboxMm.w.toFixed(1)} × ${stats.bboxMm.h.toFixed(1)} mm`,
    `  Laufzeit (Ink/Stitch)  ${(result.inkstitchMs / 1000).toFixed(1)} s`,
  ];
  if (warnings.length === 0) {
    lines.push("", "Warnungen   keine (eigene Prüfung, analyze())");
  } else {
    lines.push("", "Warnungen (eigene Prüfung, analyze())");
    for (const w of warnings) {
      lines.push(
        `  ${w.severity.padEnd(5)} ${w.code}${w.objectId ? ` (${w.objectId})` : ""}: ${w.message}`,
      );
    }
  }
  const hints = result.stderr.trim();
  if (hints === "") lines.push("", "Ink/Stitch  keine Hinweise (stderr leer)");
  else lines.push("", "Ink/Stitch-Hinweise (stderr)", ...hints.split("\n").map((l) => `  ${l}`));
  return lines;
}

// Run as a script; imported (smoke test, unit test) it only offers the functions above.
if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const { presetId, options } = parseArgs(process.argv.slice(2));
    const result = await writeTestPattern({ presetId, options });
    for (const line of reportLines(result)) console.log(line);
  } catch (err) {
    console.error(`FEHLER: ${err.message}`);
    if (err instanceof UsageError) console.error(USAGE);
    process.exit(1);
  }
}
