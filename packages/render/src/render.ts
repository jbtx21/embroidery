/**
 * Renderer (spec §12).
 *
 * A stitch is a line, 0.4 mm wide in WORLD coordinates, round caps, with a light
 * shadow for the thread look. Jumps dashed grey, trims as a cross, colour
 * changes as a dot. Modes: thread, lines, points, plus the sequence slider
 * (`upToStitch`).
 *
 * Speed comes from batching: consecutive stitches of one colour become a single
 * path drawn with two stroke calls (shadow, then thread) — not two per stitch.
 * At 50,000 stitches that is the difference between 100,000 calls and a few
 * dozen.
 */
import type { Stitch, StitchPlan, Thread } from "@texma-stitch/engine";
import type { Ctx2D, View } from "./context.js";
import { darken, FALLBACK_COLOR } from "./color.js";

export type RenderMode = "thread" | "lines" | "points";

export type RenderOptions = {
  mode?: RenderMode;
  threads?: Thread[];
  view: View;
  /** Draw only the first n stitches — the sequence slider from spec §12. */
  upToStitch?: number;
  showJumps?: boolean;
  showTrims?: boolean;
  showColorChanges?: boolean;
  /** Stitch width in millimetres. */
  stitchWidthMm?: number;
  /** Area cleared before drawing, in pixels. */
  clear?: { w: number; h: number };
};

export type RenderStats = {
  /** Stitches drawn. */
  stitches: number;
  /** Stroke calls — the measure of how well the batching works. */
  strokes: number;
};

/** A run of one colour: connected stitches drawn in a single go. */
export type Run = { color: string; points: Stitch[] };

const JUMP_COLOR = "#8a8a8a";
const TRIM_COLOR = "#c0392b";
const COLOR_CHANGE_COLOR = "#2d6cdf";

function colorOf(threads: Thread[] | undefined, index: number): string {
  return threads?.[index]?.hex ?? FALLBACK_COLOR;
}

export type Decomposed = {
  runs: Run[];
  jumps: [Stitch, Stitch][];
  trims: Stitch[];
  colorChanges: Stitch[];
  drawn: number;
};

/**
 * Splits the plan into runs, jumps, trims and colour changes. A pure function —
 * this is where the work happens, drawing afterwards is just output.
 */
export function decomposePlan(
  plan: StitchPlan,
  threads: Thread[] | undefined,
  upToStitch?: number,
): Decomposed {
  const runs: Run[] = [];
  const jumps: [Stitch, Stitch][] = [];
  const trims: Stitch[] = [];
  const colorChanges: Stitch[] = [];

  const limit = upToStitch ?? Number.POSITIVE_INFINITY;
  let counted = 0;
  let current: Run | undefined;
  let last: Stitch | undefined;

  for (const block of plan.blocks) {
    const color = colorOf(threads, block.threadIndex);
    for (const s of block.stitches) {
      if (s.cmd === "stitch" || s.cmd === "jump") {
        if (counted >= limit) return { runs, jumps, trims, colorChanges, drawn: counted };
        counted++;
      }

      switch (s.cmd) {
        case "stitch": {
          if (!current || current.color !== color) {
            current = { color, points: [] };
            runs.push(current);
            // The run starts where the needle is — otherwise the first stitch
            // after a jump would be missing.
            if (last) current.points.push(last);
          }
          current.points.push(s);
          last = s;
          break;
        }
        case "jump": {
          if (last) jumps.push([last, s]);
          current = undefined; // a jump breaks the run
          last = s;
          break;
        }
        case "trim":
          trims.push(s);
          current = undefined;
          break;
        case "color":
          colorChanges.push(s);
          current = undefined;
          break;
        case "stop":
        case "end":
          current = undefined;
          break;
      }
    }
  }

  return { runs, jumps, trims, colorChanges, drawn: counted };
}

function strokeRun(ctx: Ctx2D, run: Run): void {
  ctx.beginPath();
  const first = run.points[0]!;
  ctx.moveTo(first.x, first.y);
  for (let i = 1; i < run.points.length; i++) {
    const p = run.points[i]!;
    ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
}

export function renderPlan(ctx: Ctx2D, plan: StitchPlan, opts: RenderOptions): RenderStats {
  const mode = opts.mode ?? "thread";
  const width = opts.stitchWidthMm ?? 0.4;
  const { view } = opts;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (opts.clear) ctx.clearRect(0, 0, opts.clear.w, opts.clear.h);
  ctx.setTransform(view.scale, 0, 0, view.scale, view.offsetX, view.offsetY);

  const parts = decomposePlan(plan, opts.threads, opts.upToStitch);
  let strokes = 0;

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.setLineDash([]);

  if (mode === "points") {
    const r = width * 0.6;
    for (const run of parts.runs) {
      ctx.fillStyle = run.color;
      ctx.beginPath();
      for (const p of run.points) {
        ctx.moveTo(p.x + r, p.y);
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      }
      ctx.fill();
    }
  } else {
    for (const run of parts.runs) {
      if (run.points.length < 2) continue;
      if (mode === "thread") {
        // Shadow: the same path, darker and a touch wider. The thread goes on
        // top afterwards — that gives the roundness without shading per stitch.
        ctx.lineWidth = width * 1.25;
        ctx.strokeStyle = darken(run.color, 0.55);
        ctx.globalAlpha = 0.5;
        strokeRun(ctx, run);
        strokes++;
        ctx.globalAlpha = 1;
      }
      ctx.lineWidth = mode === "thread" ? width : width * 0.25;
      ctx.strokeStyle = run.color;
      strokeRun(ctx, run);
      strokes++;
    }
  }

  if (opts.showJumps !== false && parts.jumps.length > 0) {
    ctx.globalAlpha = 1;
    ctx.lineWidth = width * 0.4;
    ctx.strokeStyle = JUMP_COLOR;
    ctx.setLineDash([0.8, 0.8]);
    ctx.beginPath();
    for (const [from, to] of parts.jumps) {
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
    }
    ctx.stroke();
    strokes++;
    ctx.setLineDash([]);
  }

  if (opts.showTrims !== false && parts.trims.length > 0) {
    const r = width * 1.5;
    ctx.lineWidth = width * 0.5;
    ctx.strokeStyle = TRIM_COLOR;
    ctx.beginPath();
    for (const t of parts.trims) {
      ctx.moveTo(t.x - r, t.y - r);
      ctx.lineTo(t.x + r, t.y + r);
      ctx.moveTo(t.x + r, t.y - r);
      ctx.lineTo(t.x - r, t.y + r);
    }
    ctx.stroke();
    strokes++;
  }

  if (opts.showColorChanges !== false && parts.colorChanges.length > 0) {
    const r = width * 1.2;
    ctx.fillStyle = COLOR_CHANGE_COLOR;
    ctx.beginPath();
    for (const c of parts.colorChanges) {
      ctx.moveTo(c.x + r, c.y);
      ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    }
    ctx.fill();
  }

  ctx.restore();
  return { stitches: parts.drawn, strokes };
}

/** Bounding box of every stitch in millimetres — the basis for `fitView`. */
export function planBbox(plan: StitchPlan): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of plan.blocks) {
    for (const s of b.stitches) {
      if (s.cmd !== "stitch" && s.cmd !== "jump") continue;
      if (s.x < minX) minX = s.x;
      if (s.y < minY) minY = s.y;
      if (s.x > maxX) maxX = s.x;
      if (s.y > maxY) maxY = s.y;
    }
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return { minX, minY, maxX, maxY };
}
