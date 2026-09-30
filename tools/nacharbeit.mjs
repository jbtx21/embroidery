/**
 * The Nacharbeit file of a run (docs/Engine-Spezifikation.md §13.4), called at the end of
 * tools/inkstitch.mjs once the DST is written: the document Ink/Stitch stitched from, set up for
 * rework in Inkscape — a layer per colour block, names, a hidden layer of check points — plus PES,
 * the colour sequence as text and a preview in thread colours with the check points marked.
 *
 *   out/<name>.nacharbeit.svg    layers, names, the layer "Prüfstellen" (packages/engine/src/inkstitch/nacharbeit.ts)
 *   out/<name>.pes               Ink/Stitch `output --format=pes` on that very file
 *   out/<name>.farbfolge.txt     needle occupancy per stop
 *   out/<name>.nacharbeit.png    the stitches in thread colours, check points as numbered circles
 *
 * **The file stitches as the run did, also when Inkscape opens it.** Ink/Stitch takes a document older than
 * its format (`inkstitch_svg_version` in the metadata, `lib/update.py`) for a legacy document and updates it
 * on opening — attributes of fills and strokes change, for an unversioned one Inkscape asks first — so a
 * file without the current version would stitch otherwise than the DST beside it. The document of the run
 * comes out of an Ink/Stitch extension (`jump_to_trim`) and carries the version, updates done; this is
 * checked at the end with Ink/Stitch itself (`settleUpdate`: `update_svg` saves only what it changed) and
 * a file that would still change is replaced by the updated one.
 *
 * The check points are what the run already knows, nothing is measured again: the findings of the
 * fineness check (§5.2) with their place; the shapes that did not hold as satin and went to tatami or
 * a running stitch (§7.8.5); satin on a smoothed outline (§7.8.4); areas that became a line under
 * 0.7 mm; tatami without the grid underlay (§8.8); columns under 1.0 mm (§7.8.3); and from the DST
 * itself: needle pile-ups, dense cells and jumps over 5 mm without a thread cut (§11, §10.2).
 *
 * **DST and page.** Ink/Stitch moves the design before writing so that the middle of the box of its
 * stitches is the origin of the DST (`lib/output.py`, `get_origin`). The box of the stitches on the page
 * is not known here — the stitches are not — but the box of the paths they are made along is, and
 * the stitches exceed it by the pull compensation, 0.4 mm at most on a side. So the page position of
 * a DST point is that point plus the middle of the box of the paths (error: 0.2 mm at most).
 * Measured on Hofbräu 110 mm against the box Ink/Stitch itself computes (probe on `get_origin`): the
 * middles differ by 0.10 mm in x and 0.04 mm in y. The mapping is checked on every run: block by block
 * the DST has to sit on the layer of its colour with the same offset (`mapDst`); where it does not,
 * the points taken from the DST are left out and the output says so.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildReworkSvg,
  colourName,
  CONNECT_DEFAULTS,
  DENSITY_ERROR,
  densitySpots,
  elementCentres,
  elementKinds,
  farbfolge,
  importShapes,
  INKSTITCH_SVG_VERSION,
  inkstitchSvgVersion,
  NEEDLE_GRID_MM,
  NEEDLE_WARN,
  needleSpots,
  openJumps,
  pageSizeMm,
} from "@texma-stitch/engine";
import { renderPlanSvg } from "@texma-stitch/render";
import { svgZuPng } from "./feinheit.mjs";
import { runInkstitch } from "./inkstitch-lauf.mjs";

/** `1.3` as "1,3": what a puncher reads; `digits` decimals. */
export const komma = (n, digits = 1) => n.toFixed(digits).replace(".", ",");

/** Ids as XML allows them — the same rule as the template (`xmlId` in template.ts). */
const xmlId = (id) => id.replace(/[^A-Za-z0-9_.-]/g, "_");

/** The middle of a box. */
const middle = (b) => ({ x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 });

/**
 * The order the check points are numbered in: what stops a file from being sewn first, then what the
 * fineness check found, then what the template decided by itself.
 */
const PRIORITY = [
  "Sprung ohne Fadenschnitt",
  "Nadelhäufung",
  "Stichdichte",
  "Satinstrich zu schmal",
  "Säule unter 1,0 mm",
  "Rückfall Tatami",
  "Rückfall Laufstich",
  "Fläche als Laufstich",
  "Satin auf geglätteter Kontur",
  "Tatami ohne Gitterunterlage",
  "Lücke",
  "Stofflücke",
];

/** Colour names of a fabric gap's shapes: "#d1b35a+#d2060d" is "Gold und Rot". */
const gapColours = (joined) =>
  joined === ""
    ? ""
    : joined
        .split("+")
        .map((c) => colourName(c))
        .join(" und ");

/** What a tatami area without the grid underlay lacks, from the number of pieces its inset fell into. */
const underlayWhy = (pieces) =>
  pieces === 0
    ? "zu schmal für einen Einzug"
    : pieces === 1
      ? "Band oder keine Reihe erreicht sie"
      : `Einzug zerfällt in ${pieces} Stücke`;

/**
 * The check points of a run, in the order they are numbered (PRIORITY), each with its place on the
 * page. What has no place — an id the template SVG does not know — is returned apart, not dropped.
 *
 * @param {object} known what the run knows
 * @param {Map<string, {x:number,y:number}>} known.centres centre of every object and group of the template, by id
 * @param {Map<string, string>} known.kinds what every object of the template is ("Laufstich", …), by id
 * @param {Set<string>} known.areaIds ids (as XML) of the source shapes that are areas
 * @param {object[]} [known.findings] the findings of the fineness check (§5.2)
 * @param {{id:string, reason?:string}[]} [known.fallbacks] tatami objects meant for satin, with the reason
 * @param {{id:string, reason?:string}[]} [known.narrowLines] running stitches meant for satin, with the reason
 * @param {{id:string, smoothedMm:number, coverage:number}[]} [known.smoothed] satin on a smoothed outline
 * @param {{narrowAtGap:string[], gaps:{id:string,gapMm:number}[]}} [known.railPull] §7.8.3
 * @param {{without:{id:string,pieces:number}[]}} [known.underlay] §8.6
 * @param {{needle:object[], density:object[], jumps:object[]}} [known.dst] from the DST, already on the page
 * @returns {{ spots: {xMm:number,yMm:number,art:string,text:string}[], withoutPlace: {art:string,id:string}[] }}
 */
export function collectSpots(known) {
  const { centres, kinds, areaIds } = known;
  const found = [];
  const withoutPlace = [];
  const at = (art, id, text) => {
    const c = centres.get(id);
    if (c === undefined) withoutPlace.push({ art, id });
    else found.push({ xMm: c.x, yMm: c.y, art, text });
  };
  const put = (art, x, y, text) => found.push({ xMm: x, yMm: y, art, text });

  for (const j of known.dst?.jumps ?? []) {
    put(
      "Sprung ohne Fadenschnitt",
      (j.from.x + j.to.x) / 2,
      (j.from.y + j.to.y) / 2,
      `${komma(j.lengthMm)} mm, der Faden liegt auf dem Stoff · Fadenschnitt setzen`,
    );
  }
  for (const n of known.dst?.needle ?? []) {
    put(
      "Nadelhäufung",
      n.x,
      n.y,
      `${n.count} Einstiche in ${komma(NEEDLE_GRID_MM)} mm (ab ${NEEDLE_WARN})` +
        `${n.cells > 1 ? `, ${n.cells} Zellen` : ""} · Überlappung oder Unterlage prüfen`,
    );
  }
  for (const d of known.dst?.density ?? []) {
    put(
      "Stichdichte",
      d.x,
      d.y,
      `${d.count} Stiche je mm² (Grenze ${DENSITY_ERROR})${d.cells > 1 ? `, ${d.cells} Zellen` : ""} · Dichte senken`,
    );
  }

  for (const f of known.findings ?? []) {
    const limit = komma(f.limitMm);
    const measured = komma(f.measuredMm, 2);
    const holds = `${Math.ceil(f.holdsFromWidthMm)} mm`;
    if (f.kind === "satin-stroke") {
      put(
        "Satinstrich zu schmal",
        f.at.x,
        f.at.y,
        `${f.id}: ${measured} mm statt ${limit} mm, hält ab ${holds} · größer sticken` +
          `${f.runningAlternative ? " oder als Laufstich" : ""}`,
      );
    } else if (f.kind === "gap") {
      put(
        "Lücke",
        f.at.x,
        f.at.y,
        `${measured} mm statt ${limit} mm, offen ab ${holds} · Form schmaler oder zusticken lassen`,
      );
    } else {
      const between = gapColours(f.color);
      put(
        "Stofflücke",
        f.at.x,
        f.at.y,
        `${measured} mm statt ${limit} mm${between === "" ? "" : ` zwischen ${between}`}, offen ab ${holds}`,
      );
    }
  }

  const gapOf = new Map();
  for (const g of known.railPull?.gaps ?? []) {
    gapOf.set(g.id, Math.min(gapOf.get(g.id) ?? Infinity, g.gapMm));
  }
  for (const id of known.railPull?.narrowAtGap ?? []) {
    const gap = gapOf.get(id);
    at(
      "Säule unter 1,0 mm",
      id,
      `${gap === undefined ? "" : `Stoffspalt ${komma(gap, 2)} mm, `}ohne Zugausgleich · so schmal gestickt wie gezeichnet`,
    );
  }
  for (const o of known.fallbacks ?? [])
    at("Rückfall Tatami", o.id, `Satin hielt nicht: ${o.reason}`);
  const reasoned = new Set();
  for (const o of known.narrowLines ?? []) {
    reasoned.add(o.id);
    at("Rückfall Laufstich", o.id, `Satin hielt nicht, unter 1 mm: ${o.reason}`);
  }
  // A line that comes from an area without a reason: the area was under 0.7 mm wide and is stitched as a line.
  for (const [id, art] of kinds) {
    if (art !== "Laufstich") continue;
    const base = id.replace(/_l\d+$/, "");
    if (base !== id || !areaIds.has(base) || reasoned.has(base)) continue;
    at("Fläche als Laufstich", id, "unter 0,7 mm breit · als Linie gestickt");
  }
  for (const s of known.smoothed ?? []) {
    at(
      "Satin auf geglätteter Kontur",
      s.id,
      `um ${komma(s.smoothedMm)} mm geglättet, Deckung ${Math.round(s.coverage * 100)} %`,
    );
  }
  for (const w of known.underlay?.without ?? []) {
    at("Tatami ohne Gitterunterlage", w.id, `${underlayWhy(w.pieces)} · Deckstich allein`);
  }

  // Stable: within a kind the order stays as found (by importance for the DST and the fineness check,
  // in stitch order for the template).
  const rank = (spot) => PRIORITY.indexOf(spot.art);
  const spots = found
    .map((spot, i) => ({ spot, i }))
    .sort((a, b) => rank(a.spot) - rank(b.spot) || a.i - b.i)
    .map(({ spot }) => spot);
  return { spots, withoutPlace };
}

/**
 * The box of the stitches of a block, undefined for a block without any. Jump records do not count: a long
 * jump is written as several records along the way from one block to the next (and the first one from the
 * origin of the DST, the middle of the design), so they lie between the blocks and belong to none — counted,
 * they pulled the box of a block by up to 13 mm towards the block before it.
 */
function boxOf(stitches) {
  let box;
  for (const s of stitches) {
    if (s.cmd !== "stitch") continue;
    box =
      box === undefined
        ? { minX: s.x, minY: s.y, maxX: s.x, maxY: s.y }
        : {
            minX: Math.min(box.minX, s.x),
            minY: Math.min(box.minY, s.y),
            maxX: Math.max(box.maxX, s.x),
            maxY: Math.max(box.maxY, s.y),
          };
  }
  return box;
}

const unionOf = (boxes) =>
  boxes.reduce(
    (u, b) =>
      u === undefined
        ? b
        : {
            minX: Math.min(u.minX, b.minX),
            minY: Math.min(u.minY, b.minY),
            maxX: Math.max(u.maxX, b.maxX),
            maxY: Math.max(u.maxY, b.maxY),
          },
    undefined,
  );

/**
 * The stitches exceed the paths they are made along by the pull compensation, 0.4 mm on a side at
 * most (spec §7.2): the size of the box may differ by that, twice, and by the rounding of the DST.
 */
export const SIZE_SLACK_MM = 1.0;
/**
 * The middle of a block's box and of its layer's box differ by half what the box exceeds on one side against
 * the other — 0.2 mm at most on a large block, more on a small one (measured, largest deviation of a block on
 * each motif: Hofbräu 0.21 mm, STUTTGART 0.14, Köln 0.19, Atzensport 0.72 on four small white shapes) — and by
 * the rounding of the DST (0.05 mm). The offset of a block may differ from the offset of the whole by this
 * much before the mapping is not believed. A mirrored or shifted DST differs by the distance between the blocks, several millimetres up
 * to the size of the motif.
 */
export const OFFSET_SPREAD_MM = 1.5;

/**
 * Where the DST lies on the page: the offset that turns a point of the DST into one on the page, from
 * the middle of the box of all stitches and of all paths (module doc), checked block by block.
 *
 * @param {{stitches: object[]}[]} blocks the colour blocks of the DST, in stitch order
 * @param {{bounds?: object}[]} layers the layers of the Nacharbeit file, in stitch order
 * @returns {{ dx:number, dy:number, ok:boolean, checked:boolean, spreadMm:number, sizeMm:{dw:number,dh:number}|undefined, why?:string }}
 */
export function mapDst(blocks, layers) {
  const dst = unionOf(blocks.map((b) => boxOf(b.stitches)).filter((b) => b !== undefined));
  const page = unionOf(layers.map((l) => l.bounds).filter((b) => b !== undefined));
  if (dst === undefined || page === undefined) {
    return {
      dx: 0,
      dy: 0,
      ok: false,
      checked: false,
      spreadMm: NaN,
      sizeMm: undefined,
      why: "kein Stich oder kein Pfad",
    };
  }
  const a = middle(dst);
  const b = middle(page);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const sizeMm = {
    dw: dst.maxX - dst.minX - (page.maxX - page.minX),
    dh: dst.maxY - dst.minY - (page.maxY - page.minY),
  };
  const sizeOk = Math.abs(sizeMm.dw) <= SIZE_SLACK_MM && Math.abs(sizeMm.dh) <= SIZE_SLACK_MM;

  // Block by block: the DST of a colour has to sit on the layer of that colour with the offset of the whole.
  const pairable = blocks.length === layers.length && layers.every((l) => l.bounds !== undefined);
  let spreadMm = NaN;
  if (pairable) {
    spreadMm = 0;
    blocks.forEach((block, i) => {
      const box = boxOf(block.stitches);
      if (box === undefined) return;
      const m = middle(layers[i].bounds);
      const n = middle(box);
      spreadMm = Math.max(spreadMm, Math.hypot(m.x - n.x - dx, m.y - n.y - dy));
    });
  }
  const spreadOk = !pairable || spreadMm <= OFFSET_SPREAD_MM;
  const why = !sizeOk
    ? `die Größe der Stiche (${komma(dst.maxX - dst.minX)} × ${komma(dst.maxY - dst.minY)} mm) passt nicht zu der der Pfade (${komma(page.maxX - page.minX)} × ${komma(page.maxY - page.minY)} mm)`
    : !spreadOk
      ? `die Farbblöcke liegen je Ebene um bis zu ${komma(spreadMm, 2)} mm verschieden (Grenze ${OFFSET_SPREAD_MM} mm)`
      : undefined;
  return {
    dx,
    dy,
    ok: sizeOk && spreadOk,
    checked: pairable,
    spreadMm,
    sizeMm,
    ...(why === undefined ? {} : { why }),
  };
}

const PREVIEW_FALLBACK = ["#c8102e", "#101820", "#0072ce", "#ffb81c", "#00843d", "#7d3f98"];

/**
 * The stitches in the thread colours of the colour sequence, the check points as numbered circles with a
 * white edge (readable on any thread). Drawn as SVG by packages/render and turned into PNG.
 */
export async function previewPng({ blocks, stats, stops, spots, offset, widthMm }) {
  const threads = blocks.map((_, i) => ({
    brand: "madeira",
    number: String(i),
    hex: stops[i]?.hex ?? PREVIEW_FALLBACK[i % PREVIEW_FALLBACK.length],
    name: stops[i]?.name ?? `Block ${i}`,
  }));
  const pxPerMm = Math.min(12, Math.max(4, 1600 / Math.max(stats.bboxMm.w + 8, 1)));
  const svg = renderPlanSvg({ blocks, stats, warnings: [] }, { threads, pxPerMm });
  const r = Math.max(1, Math.min(3, widthMm / 100));
  const font = r * 1.3;
  const num = (n) => (Math.round(n * 1e3) / 1e3).toString();
  const marks = [];
  for (const spot of spots) {
    const x = spot.xMm - offset.dx;
    const y = spot.yMm - offset.dy;
    marks.push(
      `<circle cx="${num(x)}" cy="${num(y)}" r="${num(r)}" fill="none" stroke="#fff" stroke-width="${num(r * 0.5)}"/>` +
        `<circle cx="${num(x)}" cy="${num(y)}" r="${num(r)}" fill="none" stroke="#d40000" stroke-width="${num(r * 0.2)}"/>`,
    );
  }
  const label = (x, y, text, pass) =>
    `<text x="${num(x)}" y="${num(y)}" ${pass === 0 ? `fill="#fff" stroke="#fff" stroke-width="${num(font * 0.3)}" stroke-linejoin="round"` : `fill="#8a0000"`}>${text}</text>`;
  for (const pass of [0, 1]) {
    marks.push(
      `<g font-family="sans-serif" font-size="${num(font)}" font-weight="bold" text-anchor="start">`,
    );
    spots.forEach((spot, i) => {
      marks.push(
        label(
          spot.xMm - offset.dx + r * 1.3,
          spot.yMm - offset.dy + font * 0.35,
          String(i + 1),
          pass,
        ),
      );
    });
    marks.push("</g>");
  }
  const withMarks = svg.replace(/<\/svg>\s*$/, `${marks.join("")}</svg>`);
  return svgZuPng(withMarks);
}

/** How many check points of each kind, in the order of `PRIORITY`: `[["Nadelhäufung", 3], …]`. */
export const spotCounts = (spots) => {
  const counts = new Map();
  for (const s of spots) counts.set(s.art, (counts.get(s.art) ?? 0) + 1);
  return PRIORITY.filter((art) => counts.has(art)).map((art) => [art, counts.get(art)]);
};

/**
 * Lets Ink/Stitch open the file the way Inkscape will (`update_svg --update-from=<current version>`: load,
 * update a legacy document, save — and save only if something changed). Nothing written means nothing
 * would change on opening, and that is the proof; a document that comes back is the updated file, which
 * replaces it, and is asked once more.
 *
 * @returns {Promise<{checked:boolean, changed?:boolean, settled?:boolean, ms?:number, error?:string}>}
 */
export async function settleUpdate(path) {
  const ask = () =>
    runInkstitch({
      extension: "update_svg",
      options: { "update-from": INKSTITCH_SVG_VERSION },
      svg: path,
    });
  try {
    const first = await ask();
    if (first.stdout.length === 0)
      return { checked: true, changed: false, settled: true, ms: first.ms };
    writeFileSync(path, first.stdout);
    const again = await ask();
    return {
      checked: true,
      changed: true,
      settled:
        again.stdout.length === 0 &&
        inkstitchSvgVersion(first.stdout.toString("utf8")) === INKSTITCH_SVG_VERSION,
      ms: first.ms + again.ms,
    };
  } catch (err) {
    return { checked: false, error: err.message.split("\n")[0] };
  }
}

/**
 * Writes the four files of the Nacharbeit (module doc) and says what it did. Does not print; the
 * caller prints `reportLines(report)`.
 *
 * @param {object} run what the run knows
 * @param {string} run.name file name of the run, without extension
 * @param {string} run.outDir where the files go
 * @param {string} run.svgPath the SVG the DST was made from (after auto_satin and jump_to_trim)
 * @param {string} run.templatePath the template the run wrote (ids and places of its objects)
 * @param {string} run.sourceSvg the source SVG as the run read it
 * @param {string} run.presetName
 * @param {object[]} run.stitches the DST read back, in mm
 * @param {object[]} run.blocks the colour blocks of those stitches
 * @param {object} run.stats what analyze() said of them (stitches, bboxMm)
 * @param {object} [run.feinheit] the result of the fineness check
 * @param {object[]} [run.fallbacks] see collectSpots
 * @param {object[]} [run.narrowLines]
 * @param {object[]} [run.smoothed]
 * @param {object} [run.railPull]
 * @param {object} [run.underlay]
 */
export async function writeRework(run) {
  const svgText = readFileSync(run.svgPath, "utf8");
  const templateText = readFileSync(run.templatePath, "utf8");
  // The page the run stitched on is the page of its template: whatever size the gate and --breite made.
  const page = pageSizeMm(templateText);
  if (page === undefined || !(page.widthMm > 0 && page.heightMm > 0)) {
    return { skipped: "Die Vorlage nennt keine Größe in mm: ohne Seite keine Nacharbeit-Datei." };
  }

  // The layers first, without check points: their boxes say where the DST lies on the page.
  const plain = buildReworkSvg(svgText, { widthMm: page.widthMm, heightMm: page.heightMm });
  const mapping = mapDst(run.blocks, plain.layers);
  const onPage = (p) => ({ x: p.x + mapping.dx, y: p.y + mapping.dy });
  const dst = mapping.ok
    ? {
        needle: needleSpots(run.stitches).map((s) => ({ ...s, ...onPage(s) })),
        density: densitySpots(run.stitches).map((s) => ({ ...s, ...onPage(s) })),
        jumps: openJumps(run.stitches, CONNECT_DEFAULTS.jumpTrimMm).map((j) => ({
          ...j,
          from: onPage(j.from),
          to: onPage(j.to),
        })),
      }
    : { needle: [], density: [], jumps: [] };

  const areaIds = new Set(
    importShapes(run.sourceSvg)
      .shapes.filter((s) => s.kind === "area")
      .map((s) => xmlId(s.id)),
  );
  const { spots, withoutPlace } = collectSpots({
    centres: elementCentres(templateText),
    kinds: elementKinds(templateText),
    areaIds,
    findings: run.feinheit?.findings,
    fallbacks: run.fallbacks,
    narrowLines: run.narrowLines,
    smoothed: run.smoothed,
    railPull: run.railPull,
    underlay: run.underlay,
    dst,
  });

  const rework = buildReworkSvg(svgText, { widthMm: page.widthMm, heightMm: page.heightMm, spots });
  const files = {
    svg: resolve(run.outDir, `${run.name}.nacharbeit.svg`),
    pes: resolve(run.outDir, `${run.name}.pes`),
    farbfolge: resolve(run.outDir, `${run.name}.farbfolge.txt`),
    png: resolve(run.outDir, `${run.name}.nacharbeit.png`),
  };
  writeFileSync(files.svg, rework.svg);
  const update = await settleUpdate(files.svg);

  const pes = await runInkstitch({
    extension: "output",
    options: { format: "pes" },
    svg: files.svg,
  });
  writeFileSync(files.pes, pes.stdout);

  writeFileSync(
    files.farbfolge,
    farbfolge({
      name: run.name,
      widthMm: run.stats.bboxMm.w,
      heightMm: run.stats.bboxMm.h,
      stitches: run.stats.stitches,
      preset: run.presetName,
      stops: rework.stops,
    }),
  );

  writeFileSync(
    files.png,
    await previewPng({
      blocks: run.blocks,
      stats: run.stats,
      stops: rework.stops,
      spots,
      offset: mapping,
      widthMm: page.widthMm,
    }),
  );

  return {
    files,
    rework,
    mapping,
    spots,
    withoutPlace,
    update,
    pesStderr: pes.stderr,
    pesMs: pes.ms,
    blocks: run.blocks.length,
  };
}

/** What the run says about the Nacharbeit, as lines for the console. */
export function reportLines(report) {
  if (report.skipped !== undefined) return [`Nacharbeit   ${report.skipped}`];
  const { rework, mapping, spots, withoutPlace, files } = report;
  const rel = (p) => `out/${p.split("/").pop()}`;
  const lines = [
    "Nacharbeit (Spec §13.4)",
    `  Datei       ${rel(files.svg)} (${rework.layers.length} Ebenen, ${spots.length} Prüfstellen)`,
    `  PES         ${rel(files.pes)}`,
    `  Farbfolge   ${rel(files.farbfolge)}`,
    `  Vorschau    ${rel(files.png)}`,
  ];
  for (const l of rework.layers) {
    lines.push(
      `              ${l.label}: ${l.elements} Objekte in ${l.units.length} Gruppen oder Formen`,
    );
  }
  const counts = spotCounts(spots);
  lines.push(
    counts.length === 0
      ? "  Prüfstellen keine"
      : `  Prüfstellen ${counts.map(([art, n]) => `${art} ${n}`).join(" · ")}`,
  );
  if (withoutPlace.length > 0) {
    lines.push(
      `  Ohne Lage   ${withoutPlace.length} Prüfstellen, die Vorlage kennt ihre Kennung nicht: ` +
        withoutPlace
          .slice(0, 6)
          .map((w) => `${w.art} ${w.id}`)
          .join(", ") +
        (withoutPlace.length > 6 ? ", …" : ""),
    );
  }
  for (const n of rework.notes) lines.push(`  Hinweis     ${n.message}`);
  if (report.blocks !== rework.stops.length) {
    lines.push(
      `  Hinweis     Die DST hat ${report.blocks} Farbblöcke, die Ebenen ergeben ${rework.stops.length} Farbwechsel-Stopps: ` +
        `die Farben der Vorschau stimmen nicht sicher`,
    );
  }
  lines.push(
    `  DST → Seite um ${komma(mapping.dx, 2)} / ${komma(mapping.dy, 2)} mm verschoben` +
      (mapping.checked
        ? `, je Farbblock geprüft (Abweichung bis ${komma(mapping.spreadMm, 2)} mm, Grenze ${OFFSET_SPREAD_MM} mm)`
        : ", nicht je Farbblock prüfbar (Blöcke und Ebenen passen nicht zueinander)"),
  );
  if (!mapping.ok) {
    lines.push(
      `  Hinweis     Die Abbildung der DST auf die Seite hält nicht (${mapping.why ?? "unbekannt"}): ` +
        `Nadelhäufung, Stichdichte und Sprünge fehlen in den Prüfstellen`,
    );
  }
  const u = report.update;
  if (u !== undefined) {
    if (!u.checked) {
      lines.push(
        `  Hinweis     Ob Ink/Stitch die Datei beim Öffnen ändert, ließ sich nicht prüfen (${u.error ?? "unbekannt"}): ` +
          `Version ${rework.inkstitchSvgVersion ?? "fehlt"} im Dokument`,
      );
    } else if (!u.changed) {
      lines.push(
        `  Dokument    inkstitch_svg_version ${rework.inkstitchSvgVersion}: Ink/Stitch ändert die Datei beim Öffnen nicht`,
      );
    } else {
      lines.push(
        `  Dokument    Ink/Stitch hat die Datei beim Öffnen geändert (Altdokument, Version ` +
          `${rework.inkstitchSvgVersion ?? "fehlte"}): die aktualisierte Fassung ist die Datei` +
          `${u.settled ? ", ein weiteres Öffnen ändert nichts mehr" : ", ein weiteres Öffnen ändert noch immer etwas"}`,
      );
    }
  }
  if (report.pesStderr.trim()) {
    lines.push("  Ink/Stitch-Hinweise zum PES (stderr)");
    for (const l of report.pesStderr.trim().split("\n")) lines.push(`    ${l}`);
  }
  lines.push(`  Laufzeit PES ${(report.pesMs / 1000).toFixed(1)} s`);
  return lines;
}
