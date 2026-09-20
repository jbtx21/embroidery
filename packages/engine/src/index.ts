/** TEXMA Stitch — engine (spec §4 to §11). */
export * from "./types.js";
export * from "./presets.js";
export * from "./warnings.js";
export * from "./running.js";
export * from "./satin.js";
export * from "./auto-satin.js";
export * from "./fill.js";
export * from "./order.js";
export * from "./object.js";
export * from "./connect.js";
export * from "./tie.js";
export * from "./post.js";
export * from "./analyze.js";
export * from "./validate.js";
export * from "./resolve-overlaps.js";
export * from "./expand.js";
export * from "./font-choice.js";
export * from "./hash.js";
export * from "./pipeline.js";
export * from "./import/svg.js";

import { initGeometry } from "@texma-stitch/geometry";

/**
 * Loads what the engine needs in WASM. Must run once before the first
 * `planDesign` — everything is synchronous afterwards.
 */
export const initEngine = (): Promise<void> => initGeometry();
