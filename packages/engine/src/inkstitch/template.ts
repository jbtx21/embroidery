/**
 * The template Ink/Stitch stitches (ADR 0001): every imported shape as the
 * object a puncher would set it as — satin columns for lettering and narrow
 * shapes, running stitch for hairlines, tatami for areas.
 *
 * - **running** (`classifyShape`, under `SATIN_FROM_MM`): one stroked path
 *   along the strokes of the shape's axis (`strokeGraph`), joined where they
 *   meet — a single pass, since one thread covers up to that width (spec §7.4).
 * - **satin**: `satinColumns`, one native Ink/Stitch satin column per stroke —
 *   rails and rungs in one path, `inkstitch:satin_column` — with the preset's
 *   parameters (spec §7.2 pull compensation from the column's own width, §7.3
 *   zigzag spacing, §7.4 split above 7 mm, §7.6 underlay by width). Where the
 *   columns do not hold (`SatinColumnsResult.reason`), the shape stays tatami
 *   and the reason goes into the warnings and the object list — unless it is
 *   under `SATIN_NARROW_WARN_MM`: a shape that thin is a line, and a fill of it
 *   is rows of one or two stitches (Köln: density peak 30 → 34). It is set as a
 *   running stitch along its axis then, with the reason.
 * - **tatami**: the outline as a fill, `inkstitch:row_spacing_mm` from the
 *   preset.
 *
 * Objects keep the document order of their source shapes (the stacking order,
 * spec §5.1); the columns of one shape come in their stitch order (what ends
 * under a stroke first). Satin columns of neighbouring shapes in the same
 * colour form a run — one `auto_satin` call each routes it, so the travel
 * between columns runs under the satin and never across a colour or an
 * object stitched in between.
 *
 * `TemplateOptions.order` groups the colours as far as the overlaps allow
 * (spec §10.1, `sequence.ts`), and `TemplateOptions.knockdown` cuts what a later
 * tatami covers out of the tatami below it (spec §4.1, `knockdown.ts`) — the
 * stitch order decides which is which, so the order comes first.
 */
import type { Point, Polygon, Polyline } from "@texma-stitch/geometry";
import {
  cumulativeLengths,
  normalizeRing,
  offsetPolyline,
  polygonArea,
  simplify,
} from "@texma-stitch/geometry";
import type { ImportedShape } from "../import/svg.js";
import type { Preset } from "../presets.js";
import type { Warning } from "../types.js";
import { warn, WARNING } from "../warnings.js";
import { classifyShape, SATIN_NARROW_WARN_MM } from "./classify.js";
import type { SatinColumnPlan } from "./columns.js";
import { satinColumns, STAYS_TATAMI } from "./columns.js";
import { knockdownAreas } from "./knockdown.js";
import { colourBlockCount, sequenceByColour } from "./sequence.js";
import { strokeGraph } from "./strokes.js";

/** Satin wider than this is split into staggered stitches (spec §7.4, `maxWidthMm`). */
export const SATIN_SPLIT_MM = 7;
/** Below this width a column gets a centre walk, from it contour and zigzag (spec §7.6). */
export const UNDERLAY_WIDE_FROM_MM = 3;
/** Centre walk stitch length (spec §7.6). */
export const CENTER_WALK_STITCH_MM = 2.5;
/** Running stitch length for hairlines and lines. */
export const RUNNING_STITCH_MM = 2.0;
/**
 * A hairline's axis is read off a sampled outline and wobbles by about a tenth
 * of a millimetre every few tenths; a running stitch along it would carry the
 * wobble into its needle points. So the line is averaged over this much of its
 * length either side first…
 */
export const RUNNING_SMOOTH_MM = 0.5;
/** …and then straightened within this tolerance — well under a thread's width. */
export const RUNNING_SIMPLIFY_MM = 0.05;

/** Moving average over `reach` mm of arc length either side; the ends stay. */
function smoothLine(line: Polyline, reach: number): Polyline {
  if (line.length < 3) return line;
  const cum = cumulativeLengths(line);
  return line.map((p, i) => {
    if (i === 0 || i === line.length - 1) return p;
    const lo = Math.max(0, cum[i]! - reach);
    const hi = Math.min(cum[cum.length - 1]!, cum[i]! + reach);
    let x = 0;
    let y = 0;
    let n = 0;
    for (let j = 0; j < line.length; j++) {
      if (cum[j]! < lo || cum[j]! > hi) continue;
      x += line[j]!.x;
      y += line[j]!.y;
      n++;
    }
    return n > 0 ? { x: x / n, y: y / n } : p;
  });
}

export type TemplateObject =
  | { id: string; kind: "tatami"; shapeId: string; color: string; reason?: string }
  | {
      id: string;
      kind: "running";
      shapeId: string;
      color: string;
      /** Set for a shape meant for satin that no column held and that is too narrow for a fill. */
      reason?: string;
    }
  | {
      id: string;
      kind: "satin";
      shapeId: string;
      color: string;
      columnIds: string[];
      coverage: number;
      smoothedMm: number;
    };

/** What the knockdown did to the tatami areas (spec §4.1). */
export type KnockdownReport = {
  /** Tatami areas whose outline changed: cut, split, grown under a neighbour, or left out. */
  changed: number;
  /** Areas that later ones cover completely — not stitched (`FILL_COVERED`). */
  covered: string[];
  /** Areas the cut fell apart into, with the number of parts — each part is an object. */
  split: { id: string; parts: number }[];
  /** Tatami area before and after, mm². */
  areaMm2: { before: number; after: number };
};

export type TemplateResult = {
  svg: string;
  /** One per source shape that became an object (a split tatami: one per part), in stitch order. */
  objects: TemplateObject[];
  /** Column ids of each run of neighbouring same-coloured satin objects — one `auto_satin` each. */
  satinRuns: string[][];
  warnings: Warning[];
  /** Colour blocks of the stitch order (a run of one colour is one block). */
  colourBlocks: number;
  /** The fewest blocks the overlaps allow — present when `TemplateOptions.order` is `"colour"`. */
  colourBlocksLowerBound?: number;
  /** Present when `TemplateOptions.knockdown` was on. */
  knockdown?: KnockdownReport;
};

export type TemplateOptions = {
  /** Page size of the source document, so the template lines up with it. */
  widthMm: number;
  heightMm: number;
  /**
   * Stitch order: `"document"` keeps the stacking order of the source, `"colour"` groups the
   * colours as far as the overlaps allow (spec §10.1). Default: `"document"`.
   */
  order?: "document" | "colour";
  /** Cut what later tatami areas cover out of the earlier ones (spec §4.1). Default: off. */
  knockdown?: boolean;
};

const num = (n: number): string => (Math.round(n * 1e4) / 1e4).toString();
/** Ids as XML allows them (`importShapes` numbers split paths `id:n`). */
const xmlId = (id: string): string => id.replace(/[^A-Za-z0-9_.-]/g, "_");
const xmlEscape = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const lineD = (line: Polyline): string =>
  line.length === 0 ? "" : `M ${line.map((p) => `${num(p.x)},${num(p.y)}`).join(" L ")}`;
const polygonD = (poly: Polygon): string =>
  [poly.outer, ...poly.holes]
    .filter((r) => r.length >= 3)
    .map((r) => `${lineD(r)} Z`)
    .join(" ");

/** Pull compensation per side (spec §7.2): a share of the column's width, clamped. */
export function satinPullCompMm(widthMm: number, preset: Preset): number {
  const pct = (preset.pullCompPct / 100) * widthMm;
  return Math.min(preset.pullCompMaxMm, Math.max(preset.pullCompMinMm, pct));
}

/** The Ink/Stitch parameters of one satin column (module doc). */
export function satinColumnAttributes(widthMm: number, preset: Preset): Record<string, string> {
  const u = preset.satinUnderlay;
  const underlay: Record<string, string> =
    widthMm < UNDERLAY_WIDE_FROM_MM
      ? {
          center_walk_underlay: "true",
          center_walk_underlay_stitch_length_mm: num(CENTER_WALK_STITCH_MM),
        }
      : {
          contour_underlay: "true",
          contour_underlay_inset_mm: num(u.insetMm),
          zigzag_underlay: "true",
          zigzag_underlay_spacing_mm: num(u.zigzagSpacingMm),
          zigzag_underlay_inset_mm: num(u.insetMm),
        };
  return {
    satin_column: "true",
    zigzag_spacing_mm: num(preset.satinSpacingMm),
    pull_compensation_mm: num(satinPullCompMm(widthMm, preset)),
    max_stitch_length_mm: num(SATIN_SPLIT_MM),
    ...underlay,
  };
}

const inkAttrs = (attrs: Record<string, string>): string =>
  Object.entries(attrs)
    .map(([k, v]) => ` inkstitch:${k}="${xmlEscape(v)}"`)
    .join("");

/** One path: both rails, then the rungs, each its own sub-path (Ink/Stitch's satin format). */
export function satinColumnD(column: SatinColumnPlan): string {
  return [lineD(column.railA), lineD(column.railB), ...column.rungs.map((r) => lineD(r))].join(" ");
}

/**
 * Lines whose ends meet (within `gap`) joined into one — a running stitch
 * follows a zigzag hairline (the heartbeat line of the Köln logo) in one go,
 * not stroke by stroke: every separate line is a stitch group of its own, tied
 * in and off at both ends. Greedy, in order.
 */
export function joinLines(lines: Polyline[], gap: number): Polyline[] {
  const rest = lines.map((l) => l.slice());
  const out: Polyline[] = [];
  const d = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);
  while (rest.length > 0) {
    let cur = rest.shift()!;
    for (;;) {
      let best = -1;
      let bestD = gap;
      let mode: "endStart" | "endEnd" | "startEnd" | "startStart" = "endStart";
      rest.forEach((l, i) => {
        const tries = [
          ["endStart", d(cur[cur.length - 1]!, l[0]!)],
          ["endEnd", d(cur[cur.length - 1]!, l[l.length - 1]!)],
          ["startEnd", d(cur[0]!, l[l.length - 1]!)],
          ["startStart", d(cur[0]!, l[0]!)],
        ] as const;
        for (const [m, dist] of tries) {
          if (dist < bestD) {
            bestD = dist;
            best = i;
            mode = m;
          }
        }
      });
      if (best < 0) break;
      const l = rest.splice(best, 1)[0]!;
      if (mode === "endStart") cur = [...cur, ...l];
      else if (mode === "endEnd") cur = [...cur, ...l.reverse()];
      else if (mode === "startEnd") cur = [...l, ...cur];
      else cur = [...l.reverse(), ...cur];
    }
    out.push(cur);
  }
  return out;
}

/** The axis strokes of a hairline shape, as the lines a running stitch follows. */
function runningLines(shape: Polygon, id: string): Polyline[] {
  const graph = strokeGraph(shape, id);
  const widest = Math.max(0.1, ...graph.strokes.flatMap((s) => s.radii));
  const lines = graph.strokes.map((s) => (s.closed ? [...s.points, s.points[0]!] : s.points));
  return joinLines(lines, 2 * widest)
    .map((pts) => simplify(smoothLine(pts, RUNNING_SMOOTH_MM), RUNNING_SIMPLIFY_MM))
    .filter((pts) => pts.length >= 2);
}

/** Half the width of the strip a stroked line is taken to lie on when the order asks what it covers. */
export const LINE_COVER_HALF_MM = 0.25;

/** The strip a stroked line lies on, for the order — the largest piece if it folds back on itself. */
function lineCover(line: Polyline): Polygon | undefined {
  const strip = normalizeRing([
    ...offsetPolyline(line, LINE_COVER_HALF_MM),
    ...offsetPolyline(line, -LINE_COVER_HALF_MM).reverse(),
  ]);
  return strip.sort((a, b) => polygonArea(b) - polygonArea(a))[0];
}

/** A shape planned as an object, before anything is cut, ordered or written. */
type PlannedBase = {
  id: string;
  shapeId: string;
  color: string;
  /** What the object lies on, for the order: the outline of its shape. */
  cover: Polygon | undefined;
  /**
   * The source asked for a trim after this object (`inkstitch:trim_after`). Carried over
   * for tatami and running stitch; a satin column is routed by `auto_satin`, which trims
   * where its own routing needs it and would repeat the attribute on every piece it cuts.
   */
  trimAfter: boolean;
};
type PlannedTatami = PlannedBase & { kind: "tatami"; polygon: Polygon; reason?: string };
type PlannedRunning = PlannedBase & { kind: "running"; lines: Polyline[]; reason?: string };
type PlannedSatin = PlannedBase & {
  kind: "satin";
  columns: SatinColumnPlan[];
  coverage: number;
  smoothedMm: number;
};
type Planned = PlannedTatami | PlannedRunning | PlannedSatin;

/** Decides what every shape becomes (module doc), in document order. */
function planShapes(shapes: ImportedShape[], preset: Preset, warnings: Warning[]): Planned[] {
  const planned: Planned[] = [];
  const tatami = (shape: ImportedShape, color: string, polygon: Polygon, reason?: string): void => {
    planned.push({
      kind: "tatami",
      id: xmlId(shape.id),
      shapeId: shape.id,
      color,
      cover: polygon,
      trimAfter: shape.trimAfter === "always",
      polygon,
      ...(reason ? { reason } : {}),
    });
  };
  const running = (
    shape: ImportedShape,
    color: string,
    lines: Polyline[],
    cover: Polygon | undefined,
    reason?: string,
  ): void => {
    planned.push({
      kind: "running",
      id: xmlId(shape.id),
      shapeId: shape.id,
      color,
      cover,
      trimAfter: shape.trimAfter === "always",
      lines,
      ...(reason ? { reason } : {}),
    });
  };

  for (const shape of shapes) {
    if (shape.kind === "line") {
      if (!shape.color || shape.polyline.length < 2) continue;
      const line = shape.closed ? [...shape.polyline, shape.polyline[0]!] : shape.polyline;
      running(shape, shape.color, [line], lineCover(line));
      continue;
    }
    const cls = classifyShape(shape.polygon, shape.id);
    // A satin candidate's notes wait for its plan: where it ends up as a line, the
    // "tight column" note would describe a column that is never set.
    if (cls.shapeClass !== "satin") warnings.push(...cls.warnings);
    if (cls.shapeClass === "tatami") {
      tatami(shape, shape.color, shape.polygon);
      continue;
    }
    if (cls.shapeClass === "running") {
      const lines = runningLines(shape.polygon, shape.id);
      if (lines.length === 0) {
        warnings.push(
          warn(
            WARNING.INVALID_GEOMETRY,
            `"${shape.id}" has no axis for a running stitch — stitched as tatami.`,
            "warn",
            shape.id,
          ),
        );
        tatami(shape, shape.color, shape.polygon, "no axis for a running stitch");
        continue;
      }
      running(shape, shape.color, lines, shape.polygon);
      continue;
    }
    const id = xmlId(shape.id);
    const plan = satinColumns(shape.polygon, { underlapMm: preset.underlapMm, idPrefix: id });
    if (!plan.ok && cls.widthMm < SATIN_NARROW_WARN_MM) {
      // Too narrow for a fill and not held as a column: a line along the axis.
      const lines = runningLines(shape.polygon, shape.id);
      if (lines.length > 0) {
        warnings.push(
          ...plan.warnings.filter((w) => !w.message.endsWith(STAYS_TATAMI)),
          warn(
            WARNING.AUTOSATIN_MIXED,
            `"${id}": ${plan.reason} — ${cls.widthMm.toFixed(2)} mm wide, under ` +
              `${SATIN_NARROW_WARN_MM} mm: stitched as a running stitch along its axis.`,
            "info",
            id,
          ),
        );
        running(shape, shape.color, lines, shape.polygon, plan.reason);
        continue;
      }
    }
    warnings.push(...cls.warnings, ...plan.warnings);
    if (!plan.ok) {
      tatami(shape, shape.color, shape.polygon, plan.reason);
      continue;
    }
    planned.push({
      kind: "satin",
      id,
      shapeId: shape.id,
      color: shape.color,
      cover: shape.polygon,
      trimAfter: false,
      columns: plan.columns,
      coverage: plan.coverage,
      smoothedMm: plan.smoothedMm,
    });
  }
  return planned;
}

const tatamiArea = (planned: Planned[]): number =>
  planned.reduce((sum, p) => (p.kind === "tatami" ? sum + polygonArea(p.polygon) : sum), 0);

/** Stage within a colour (spec §10.1): areas, then satin, then lines. */
const stageOf = (p: Planned): number => (p.kind === "tatami" ? 0 : p.kind === "satin" ? 1 : 3);

/** The objects grouped by colour where the overlaps allow it (`sequence.ts`). */
function orderByColour(planned: Planned[]): { planned: Planned[]; lowerBound: number } {
  const result = sequenceByColour(
    planned.map((p) => ({ colour: p.color, rank: stageOf(p), cover: p.cover })),
  );
  return { planned: result.order.map((i) => planned[i]!), lowerBound: result.lowerBound };
}

/**
 * Cuts the tatami areas, later out of earlier (spec §4.1, `knockdown.ts`). An
 * area the cut splits becomes one object per part, each in the place of the
 * whole; one that is covered completely is left out, and says so.
 */
function applyKnockdown(
  planned: Planned[],
  warnings: Warning[],
): { planned: Planned[]; report: KnockdownReport } {
  const items = planned.flatMap((p) =>
    p.kind === "tatami" ? [{ id: p.id, polygon: p.polygon }] : [],
  );
  const result = knockdownAreas(items);
  warnings.push(...result.warnings);

  const out: Planned[] = [];
  const split: KnockdownReport["split"] = [];
  let changed = 0;
  for (const p of planned) {
    if (p.kind !== "tatami") {
      out.push(p);
      continue;
    }
    const parts = result.areas.get(p.id);
    if (parts === undefined) {
      changed++;
    } else if (parts.length === 1) {
      // The very same polygon comes back for an area nothing touched.
      if (parts[0] === p.polygon) out.push(p);
      else {
        changed++;
        out.push({ ...p, polygon: parts[0]! });
      }
    } else {
      changed++;
      split.push({ id: p.id, parts: parts.length });
      // The object ends with its last part — that is where a trim after it belongs.
      parts.forEach((polygon, i) =>
        out.push({
          ...p,
          id: `${p.id}_p${i}`,
          polygon,
          trimAfter: p.trimAfter && i === parts.length - 1,
        }),
      );
    }
  }
  return {
    planned: out,
    report: {
      changed,
      covered: result.covered,
      split,
      areaMm2: { before: tatamiArea(planned), after: tatamiArea(out) },
    },
  };
}

const trimAttr = (p: { trimAfter: boolean }): Record<string, string> =>
  p.trimAfter ? { trim_after: "true" } : {};

/** Writes the planned objects, in their order, as the SVG body (module doc). */
function emitTemplate(
  planned: Planned[],
  preset: Preset,
): { body: string; objects: TemplateObject[]; satinRuns: string[][] } {
  const objects: TemplateObject[] = [];
  const body: string[] = [];
  const satinRuns: string[][] = [];
  let run: { color: string; ids: string[] } | undefined;
  const closeRun = (): void => {
    if (run && run.ids.length > 0) satinRuns.push(run.ids);
    run = undefined;
  };

  for (const p of planned) {
    if (p.kind === "tatami") {
      closeRun();
      body.push(
        `<path id="${xmlEscape(p.id)}" d="${polygonD(p.polygon)}" style="fill:${xmlEscape(p.color)};stroke:none"` +
          `${inkAttrs({ row_spacing_mm: num(preset.fillRowSpacingMm), ...trimAttr(p) })}/>`,
      );
      objects.push({
        id: p.id,
        kind: "tatami",
        shapeId: p.shapeId,
        color: p.color,
        ...(p.reason ? { reason: p.reason } : {}),
      });
    } else if (p.kind === "running") {
      closeRun();
      // Named explicitly: a plain stroke without a dash pattern is a narrow zigzag
      // to Ink/Stitch ("simple satin", 0.2-mm steps), not a running stitch.
      const attrs: Record<string, string> = {
        stroke_method: "running_stitch",
        running_stitch_length_mm: num(RUNNING_STITCH_MM),
      };
      // One element per line: Ink/Stitch cuts after an element and never between the lines
      // of one, so the jumps between the lines of a hairline with a junction would stay open
      // (a trim after the shape, if the source asks for it, goes on the last).
      p.lines.forEach((line, k) => {
        const last = k === p.lines.length - 1;
        body.push(
          `<path id="${xmlEscape(k === 0 ? p.id : `${p.id}_l${k}`)}" d="${lineD(line)}" ` +
            `style="fill:none;stroke:${xmlEscape(p.color)};stroke-width:0.1"` +
            `${inkAttrs({ ...attrs, ...(last ? trimAttr(p) : {}) })}/>`,
        );
      });
      objects.push({
        id: p.id,
        kind: "running",
        shapeId: p.shapeId,
        color: p.color,
        ...(p.reason ? { reason: p.reason } : {}),
      });
    } else {
      if (!run || run.color !== p.color) {
        closeRun();
        run = { color: p.color, ids: [] };
      }
      const inner = p.columns.map(
        (c) =>
          `<path id="${xmlEscape(c.id)}" d="${satinColumnD(c)}" ` +
          `style="fill:none;stroke:${xmlEscape(p.color)};stroke-width:0.1"` +
          `${inkAttrs(satinColumnAttributes(c.widthMm, preset))}/>`,
      );
      body.push(`<g id="${xmlEscape(p.id)}">${inner.join("")}</g>`);
      run.ids.push(...p.columns.map((c) => c.id));
      objects.push({
        id: p.id,
        kind: "satin",
        shapeId: p.shapeId,
        color: p.color,
        columnIds: p.columns.map((c) => c.id),
        coverage: p.coverage,
        smoothedMm: p.smoothedMm,
      });
    }
  }
  closeRun();
  return { body: body.join(""), objects, satinRuns };
}

/**
 * The template for a set of imported shapes (module doc). `preset` supplies
 * the densities and compensations; nothing else is guessed.
 */
export function buildInkstitchTemplate(
  shapes: ImportedShape[],
  preset: Preset,
  opts: TemplateOptions,
): TemplateResult {
  const warnings: Warning[] = [];
  let planned = planShapes(shapes, preset, warnings);
  let lowerBound: number | undefined;
  if (opts.order === "colour") {
    const ordered = orderByColour(planned);
    planned = ordered.planned;
    lowerBound = ordered.lowerBound;
  }
  let knockdown: KnockdownReport | undefined;
  if (opts.knockdown) {
    const cut = applyKnockdown(planned, warnings);
    planned = cut.planned;
    knockdown = cut.report;
  }
  const { body, objects, satinRuns } = emitTemplate(planned, preset);

  const svg =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkstitch="http://inkstitch.org/namespace" ` +
    `width="${num(opts.widthMm)}mm" height="${num(opts.heightMm)}mm" ` +
    `viewBox="0 0 ${num(opts.widthMm)} ${num(opts.heightMm)}">` +
    body +
    `</svg>\n`;
  return {
    svg,
    objects,
    satinRuns,
    warnings,
    colourBlocks: colourBlockCount(objects.map((o) => o.color)),
    ...(lowerBound === undefined ? {} : { colourBlocksLowerBound: lowerBound }),
    ...(knockdown ? { knockdown } : {}),
  };
}
