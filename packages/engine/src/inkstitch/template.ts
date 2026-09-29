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
 */
import type { Point, Polygon, Polyline } from "@texma-stitch/geometry";
import { cumulativeLengths, simplify } from "@texma-stitch/geometry";
import type { ImportedShape } from "../import/svg.js";
import type { Preset } from "../presets.js";
import type { Warning } from "../types.js";
import { warn, WARNING } from "../warnings.js";
import { classifyShape, SATIN_NARROW_WARN_MM } from "./classify.js";
import type { SatinColumnPlan } from "./columns.js";
import { satinColumns, STAYS_TATAMI } from "./columns.js";
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

export type TemplateResult = {
  svg: string;
  /** One per source shape that became an object, in document order. */
  objects: TemplateObject[];
  /** Column ids of each run of neighbouring same-coloured satin objects — one `auto_satin` each. */
  satinRuns: string[][];
  warnings: Warning[];
};

export type TemplateOptions = {
  /** Page size of the source document, so the template lines up with it. */
  widthMm: number;
  heightMm: number;
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
  const objects: TemplateObject[] = [];
  const body: string[] = [];
  const satinRuns: string[][] = [];
  let run: { color: string; ids: string[] } | undefined;
  const closeRun = (): void => {
    if (run && run.ids.length > 0) satinRuns.push(run.ids);
    run = undefined;
  };

  const tatami = (shapeId: string, poly: Polygon, color: string, reason?: string): void => {
    closeRun();
    const id = xmlId(shapeId);
    body.push(
      `<path id="${xmlEscape(id)}" d="${polygonD(poly)}" style="fill:${xmlEscape(color)};stroke:none"` +
        `${inkAttrs({ row_spacing_mm: num(preset.fillRowSpacingMm) })}/>`,
    );
    objects.push({ id, kind: "tatami", shapeId, color, ...(reason ? { reason } : {}) });
  };
  const running = (shapeId: string, lines: Polyline[], color: string, reason?: string): void => {
    closeRun();
    const id = xmlId(shapeId);
    // Named explicitly: a plain stroke without a dash pattern is a narrow zigzag
    // to Ink/Stitch ("simple satin", 0.2-mm steps), not a running stitch.
    const attrs: Record<string, string> = {
      stroke_method: "running_stitch",
      running_stitch_length_mm: num(RUNNING_STITCH_MM),
    };
    body.push(
      `<path id="${xmlEscape(id)}" d="${lines.map(lineD).join(" ")}" ` +
        `style="fill:none;stroke:${xmlEscape(color)};stroke-width:0.1"${inkAttrs(attrs)}/>`,
    );
    objects.push({ id, kind: "running", shapeId, color, ...(reason ? { reason } : {}) });
  };

  for (const shape of shapes) {
    if (shape.kind === "line") {
      if (!shape.color || shape.polyline.length < 2) continue;
      const line = shape.closed ? [...shape.polyline, shape.polyline[0]!] : shape.polyline;
      running(shape.id, [line], shape.color);
      continue;
    }
    const cls = classifyShape(shape.polygon, shape.id);
    // A satin candidate's notes wait for its plan: where it ends up as a line, the
    // "tight column" note would describe a column that is never set.
    if (cls.shapeClass !== "satin") warnings.push(...cls.warnings);
    if (cls.shapeClass === "tatami") {
      tatami(shape.id, shape.polygon, shape.color);
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
        tatami(shape.id, shape.polygon, shape.color, "no axis for a running stitch");
        continue;
      }
      running(shape.id, lines, shape.color);
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
        running(shape.id, lines, shape.color, plan.reason);
        continue;
      }
    }
    warnings.push(...cls.warnings, ...plan.warnings);
    if (!plan.ok) {
      tatami(shape.id, shape.polygon, shape.color, plan.reason);
      continue;
    }
    if (!run || run.color !== shape.color) {
      closeRun();
      run = { color: shape.color, ids: [] };
    }
    const inner = plan.columns.map(
      (c) =>
        `<path id="${xmlEscape(c.id)}" d="${satinColumnD(c)}" ` +
        `style="fill:none;stroke:${xmlEscape(shape.color)};stroke-width:0.1"` +
        `${inkAttrs(satinColumnAttributes(c.widthMm, preset))}/>`,
    );
    body.push(`<g id="${xmlEscape(id)}">${inner.join("")}</g>`);
    run.ids.push(...plan.columns.map((c) => c.id));
    objects.push({
      id,
      kind: "satin",
      shapeId: shape.id,
      color: shape.color,
      columnIds: plan.columns.map((c) => c.id),
      coverage: plan.coverage,
      smoothedMm: plan.smoothedMm,
    });
  }
  closeRun();

  const svg =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkstitch="http://inkstitch.org/namespace" ` +
    `width="${num(opts.widthMm)}mm" height="${num(opts.heightMm)}mm" ` +
    `viewBox="0 0 ${num(opts.widthMm)} ${num(opts.heightMm)}">` +
    body.join("") +
    `</svg>\n`;
  return { svg, objects, satinRuns, warnings };
}
