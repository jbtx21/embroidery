/**
 * SVG preview of the stitch plan.
 *
 * Not part of spec §12, which says Canvas. This output is the way to look at a
 * plan WITHOUT a browser: for visual checks, for the stitch report (spec §13.3)
 * and for image diffs in CI. It uses the same decomposition as the canvas
 * renderer, so it shows the same thing.
 */
import type { StitchPlan, Thread } from "@texma-stitch/engine";
import { darken } from "./color.js";
import { decomposePlan, planBbox } from "./render.js";

export type SvgOptions = {
  threads?: Thread[];
  stitchWidthMm?: number;
  upToStitch?: number;
  showJumps?: boolean;
  showTrims?: boolean;
  /** Padding around the design in millimetres. */
  paddingMm?: number;
  /** Pixels per millimetre. */
  pxPerMm?: number;
  background?: string;
};

const num = (v: number): string => (Math.round(v * 1000) / 1000).toString();

const pathData = (points: { x: number; y: number }[]): string =>
  points.map((p, i) => `${i === 0 ? "M" : "L"}${num(p.x)} ${num(p.y)}`).join(" ");

export function renderPlanSvg(plan: StitchPlan, opts: SvgOptions = {}): string {
  const width = opts.stitchWidthMm ?? 0.4;
  const padding = opts.paddingMm ?? 4;
  const px = opts.pxPerMm ?? 4;
  const b = planBbox(plan);
  const w = b.maxX - b.minX + 2 * padding;
  const h = b.maxY - b.minY + 2 * padding;
  const parts = decomposePlan(plan, opts.threads, opts.upToStitch);

  const out: string[] = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${num(w * px)}" height="${num(h * px)}" viewBox="${num(b.minX - padding)} ${num(b.minY - padding)} ${num(w)} ${num(h)}">`,
  );
  out.push(
    `<rect x="${num(b.minX - padding)}" y="${num(b.minY - padding)}" width="${num(w)}" height="${num(h)}" fill="${opts.background ?? "#f4f1ea"}"/>`,
  );

  // Shadow first so the thread lies on top — same order as the canvas renderer.
  out.push(`<g fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="0.5">`);
  for (const run of parts.runs) {
    if (run.points.length < 2) continue;
    out.push(
      `<path d="${pathData(run.points)}" stroke="${darken(run.color, 0.55)}" stroke-width="${num(width * 1.25)}"/>`,
    );
  }
  out.push(`</g>`);

  out.push(`<g fill="none" stroke-linecap="round" stroke-linejoin="round">`);
  for (const run of parts.runs) {
    if (run.points.length < 2) continue;
    out.push(
      `<path d="${pathData(run.points)}" stroke="${run.color}" stroke-width="${num(width)}"/>`,
    );
  }
  out.push(`</g>`);

  if (opts.showJumps !== false && parts.jumps.length > 0) {
    const d = parts.jumps
      .map(([from, to]) => `M${num(from.x)} ${num(from.y)}L${num(to.x)} ${num(to.y)}`)
      .join(" ");
    out.push(
      `<path d="${d}" fill="none" stroke="#8a8a8a" stroke-width="${num(width * 0.4)}" stroke-dasharray="0.8 0.8"/>`,
    );
  }

  if (opts.showTrims !== false && parts.trims.length > 0) {
    const r = width * 1.5;
    const d = parts.trims
      .map(
        (t) =>
          `M${num(t.x - r)} ${num(t.y - r)}L${num(t.x + r)} ${num(t.y + r)}M${num(t.x + r)} ${num(t.y - r)}L${num(t.x - r)} ${num(t.y + r)}`,
      )
      .join(" ");
    out.push(`<path d="${d}" fill="none" stroke="#c0392b" stroke-width="${num(width * 0.5)}"/>`);
  }

  out.push(`</svg>`);
  return out.join("\n");
}
