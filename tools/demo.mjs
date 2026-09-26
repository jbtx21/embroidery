/**
 * SVG through the pipeline and out to the machine (spec §16, week 1).
 *
 *   pnpm demo <svg> [preset]
 *
 * Writes out/<name>.dst, out/<name>.png and out/<name>.json and prints the
 * statistics. Vectorisation is not part of the engine — the SVG has to contain
 * paths already.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import { importSvg, initEngine, planDesign, PRESETS } from "@texma-stitch/engine";
import { toNeutralJson, stringifyNeutralJson, writeDst } from "@texma-stitch/formats";
import { renderPlanPng } from "@texma-stitch/render";

const [, , svgArg, presetArg = "pique"] = process.argv;

if (!svgArg) {
  console.error("Aufruf: pnpm demo <svg> [preset]");
  console.error(`Presets: ${Object.keys(PRESETS).join(", ")}`);
  process.exit(1);
}
if (!(presetArg in PRESETS)) {
  console.error(`Unbekanntes Preset "${presetArg}". Bekannt: ${Object.keys(PRESETS).join(", ")}`);
  process.exit(1);
}

const svgPath = resolve(svgArg);
const name = basename(svgPath, extname(svgPath));
const outDir = resolve("out");
mkdirSync(outDir, { recursive: true });

await initEngine();

const {
  design,
  warnings: importWarnings,
  mmPerUnit,
} = importSvg(readFileSync(svgPath, "utf8"), {
  preset: presetArg,
  designId: name,
});
const plan = planDesign(design);

writeFileSync(resolve(outDir, `${name}.dst`), writeDst(plan, { label: name }));
writeFileSync(
  resolve(outDir, `${name}.json`),
  stringifyNeutralJson(toNeutralJson(plan, name, design.threads), 2),
);
writeFileSync(
  resolve(outDir, `${name}.png`),
  await renderPlanPng(plan, { threads: design.threads }),
);

const {
  stitches,
  jumps,
  trims,
  colorChanges,
  bboxMm,
  runtimeSec,
  densityMax,
  needleMax,
  needleCells,
} = plan.stats;
console.log(`Datei       ${svgPath}`);
console.log(`Preset      ${presetArg}`);
console.log(`Maßstab     ${mmPerUnit.toFixed(4)} mm je SVG-Einheit`);
console.log(`Objekte     ${design.objects.length}`);
console.log(`Stiche      ${stitches}`);
console.log(`Sprünge     ${jumps}`);
console.log(`Trims       ${trims}`);
console.log(`Farbwechsel ${colorChanges}`);
console.log(`Größe       ${bboxMm.w.toFixed(1)} × ${bboxMm.h.toFixed(1)} mm`);
console.log(`Laufzeit    ${Math.round(runtimeSec)} s`);
console.log(`Dichte max  ${densityMax} Stiche/mm²`);
console.log(`Nadel max   ${needleMax} Einstiche je 0,2 mm, ${needleCells} Zellen ab 6`);

const allWarnings = [...importWarnings, ...plan.warnings];
if (allWarnings.length === 0) {
  console.log("Warnungen   keine");
} else {
  console.log("Warnungen");
  for (const w of allWarnings) {
    console.log(
      `  ${w.severity.padEnd(5)} ${w.code}${w.objectId ? ` (${w.objectId})` : ""}: ${w.message}`,
    );
  }
}
console.log(`\nGeschrieben: out/${name}.dst, out/${name}.png, out/${name}.json`);
