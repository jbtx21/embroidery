/**
 * PNG output in Node via node-canvas.
 *
 * `canvas` is a devDependency of this package only — the engine must not depend
 * on it (CLAUDE.md, spec §2). The import is dynamic so that a browser bundle
 * never pulls it in: the module is only loaded when someone actually asks for a
 * PNG.
 */
import type { StitchPlan } from "@texma-stitch/engine";
import type { Ctx2D } from "./context.js";
import { fitView } from "./context.js";
import type { RenderOptions } from "./render.js";
import { planBbox, renderPlan } from "./render.js";

export type PngOptions = Omit<RenderOptions, "view" | "clear"> & {
  /** Pixels per millimetre. */
  pxPerMm?: number;
  paddingPx?: number;
  background?: string;
};

type NodeCanvas = {
  getContext(kind: "2d"): unknown;
  toBuffer(mime: "image/png"): Uint8Array;
};
type CanvasModule = { createCanvas(w: number, h: number): NodeCanvas };

/** Renders the plan and returns the PNG bytes. */
export async function renderPlanPng(plan: StitchPlan, opts: PngOptions = {}): Promise<Uint8Array> {
  const mod = (await import("canvas")) as unknown as CanvasModule;

  const px = opts.pxPerMm ?? 8;
  const padding = opts.paddingPx ?? 24;
  const b = planBbox(plan);
  const w = Math.max(1, Math.ceil((b.maxX - b.minX) * px) + 2 * padding);
  const h = Math.max(1, Math.ceil((b.maxY - b.minY) * px) + 2 * padding);

  const canvas = mod.createCanvas(w, h);
  const ctx = canvas.getContext("2d") as Ctx2D;

  ctx.fillStyle = opts.background ?? "#f4f1ea";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(w, 0);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.fill();

  renderPlan(ctx, plan, { ...opts, view: fitView(b, w, h, padding) });
  return canvas.toBuffer("image/png");
}
