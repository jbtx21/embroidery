/**
 * Stichplan als SVG ansehen, ohne Editor.
 *
 *   node tools/vorschau.mjs [ziel.svg]
 *
 * Zeigt das Probemotiv aus `beispielDesign`. Wer ein eigenes Design ansehen will,
 * legt es dort hinein — der Rest bleibt gleich.
 */
import { writeFileSync } from "node:fs";
import {
  initEngine,
  planDesign,
  design,
  fillObjekt,
  satinObjekt,
  runningObjekt,
} from "@texma-stitch/engine";
import { renderPlanSvg } from "@texma-stitch/render";
import { annulus, circle, closeRing, rect, polygonOf } from "@texma-stitch/geometry";

const GARNE = [
  { brand: "madeira", number: "1000", hex: "#1b1b1f", name: "Schwarz" },
  { brand: "madeira", number: "1147", hex: "#c8102e", name: "Rot" },
  { brand: "madeira", number: "1070", hex: "#d8a326", name: "Gold" },
];

function beispielDesign() {
  return design(
    [
      fillObjekt("ring", annulus(32, 32, 26, 15), {
        rowSpacingMm: 0.25,
        underlay: { contour: true, fill: "single", spacingMm: 2, insetMm: 0.4 },
      }),
      // Rails geschlossen — eine offene Polyline ergaebe eine Spalte mit Luecke,
      // und genau so wuerde sie auch gestickt.
      satinObjekt("aussenrand", closeRing(circle(32, 32, 27.2, 96)), closeRing(circle(32, 32, 29.2, 96)), {
        threadIndex: 1,
        pullCompMm: 0.2,
        underlay: { center: true, contour: false, zigzag: false, insetMm: 0.4, zigzagSpacingMm: 3 },
      }),
      fillObjekt("balken", polygonOf(rect(20, 28.5, 24, 7)), {
        threadIndex: 2,
        angleDeg: 90,
        rowSpacingMm: 0.25,
      }),
      runningObjekt("unterstrich", [
        { x: 8, y: 68 },
        { x: 56, y: 68 },
      ], { threadIndex: 1, repeats: 3 }),
    ],
    { threads: GARNE, widthMm: 70, heightMm: 75 },
  );
}

await initEngine();
const d = beispielDesign();
const plan = planDesign(d);

const ziel = process.argv[2] ?? "vorschau.svg";
writeFileSync(ziel, renderPlanSvg(plan, { threads: d.threads, pxProMm: 8 }));

const { stitches, jumps, trims, colorChanges, bboxMm, runtimeSec, densityMax } = plan.stats;
console.log(`Stiche      ${stitches}`);
console.log(`Spruenge    ${jumps}`);
console.log(`Trims       ${trims}`);
console.log(`Farbwechsel ${colorChanges}`);
console.log(`Groesse     ${bboxMm.w.toFixed(1)} x ${bboxMm.h.toFixed(1)} mm`);
console.log(`Laufzeit    ${Math.round(runtimeSec)} s`);
console.log(`Dichte max  ${densityMax} Stiche/mm²`);
console.log(
  `Warnungen   ${plan.warnings.length === 0 ? "keine" : plan.warnings.map((w) => `${w.code} (${w.severity})`).join(", ")}`,
);
console.log(`\nGeschrieben: ${ziel}`);
