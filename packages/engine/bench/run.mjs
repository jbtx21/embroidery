/**
 * Benchmarks from spec §15.
 *
 *   pnpm bench
 *
 * Budget (CLAUDE.md, rule 9): recomputing one object with 10,000 stitches under
 * 100 ms, a full run under 300 ms. Measure before optimising.
 */
import { performance } from "node:perf_hooks";
import {
  initEngine,
  planDesign,
  generateFill,
  generateSatin,
  createCache,
} from "@texma-stitch/engine";
import { orient } from "@texma-stitch/geometry";

// The bench builds its own shapes: the test fixtures are test-only and are not
// part of any package's public surface.
const rect = (x, y, w, h) =>
  orient(
    [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
    ],
    true,
  );
const circle = (cx, cy, r, segments) =>
  orient(
    Array.from({ length: segments }, (_, i) => {
      const a = (i / segments) * Math.PI * 2;
      return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
    }),
    true,
  );
const closeRing = (ring) => [...ring, { ...ring[0] }];
const polygonOf = (outer, holes = []) => ({ outer, holes });

const PRESET_OBJECT = {
  id: "area",
  type: "fill",
  threadIndex: 0,
  visible: true,
  locked: false,
  trimAfter: "auto",
  shape: polygonOf(rect(0, 0, 100, 60)),
  angleDeg: 0,
  rowSpacingMm: 0.25,
  stitchLengthMm: 2,
  staggerRows: 4,
  pullCompMm: 0,
  underlay: { contour: false, fill: "none", spacingMm: 2, insetMm: 0.4 },
};

const SATIN_OBJECT = {
  id: "border",
  type: "satin",
  threadIndex: 1,
  visible: true,
  locked: false,
  trimAfter: "auto",
  railA: closeRing(circle(50, 30, 28, 128)),
  railB: closeRing(circle(50, 30, 30, 128)),
  rungs: [],
  spacingMm: 0.38,
  pullCompMm: 0.2,
  maxWidthMm: 7,
  underlay: { center: false, contour: true, zigzag: true, insetMm: 0.4, zigzagSpacingMm: 3 },
  shortStitches: true,
  reverse: false,
};

const DESIGN = {
  id: "bench",
  widthMm: 120,
  heightMm: 80,
  preset: "pique",
  objects: [PRESET_OBJECT, SATIN_OBJECT],
  threads: [
    { brand: "madeira", number: "1000", hex: "#101010", name: "Schwarz" },
    { brand: "madeira", number: "1147", hex: "#c8102e", name: "Rot" },
  ],
};

function measure(label, runs, fn) {
  fn(); // warm up: WASM, JIT
  const times = [];
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    fn();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  const median = times[Math.floor(times.length / 2)];
  const worst = times[times.length - 1];
  return { label, median, worst };
}

function report({ label, median, worst }, budgetMs) {
  const ok = median <= budgetMs;
  const mark = ok ? "ok  " : "FAIL";
  console.log(
    `${mark} ${label.padEnd(34)} median ${median.toFixed(1).padStart(7)} ms   worst ${worst.toFixed(1).padStart(7)} ms   budget ${budgetMs} ms`,
  );
  return ok;
}

await initEngine();

const plan = planDesign(DESIGN);
console.log(`Design: ${plan.stats.stitches} stitches, ${plan.stats.colorChanges} colour changes\n`);

const results = [
  [measure("one fill object (spec §15)", 7, () => generateFill(PRESET_OBJECT)), 100],
  [measure("one satin object", 7, () => generateSatin(SATIN_OBJECT)), 100],
  [measure("full run (spec §15)", 5, () => planDesign(DESIGN)), 300],
  [
    measure("full run, warm cache", 5, () => {
      const cache = createCache();
      planDesign(DESIGN, { cache });
      planDesign(DESIGN, { cache });
    }),
    300,
  ],
];

let allOk = true;
for (const [result, budget] of results) allOk = report(result, budget) && allOk;

if (!allOk) {
  console.error("\nBudget exceeded — see CLAUDE.md rule 9.");
  process.exit(1);
}
