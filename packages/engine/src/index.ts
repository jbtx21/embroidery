/** TEXMA Stitch — Engine (Kap. 4 bis 11). */
export * from "./types.js";
export * from "./presets.js";
export * from "./warnings.js";
export * from "./running.js";
export * from "./satin.js";
export * from "./fill.js";
export * from "./order.js";
export * from "./objekt.js";
export * from "./connect.js";
export * from "./tie.js";
export * from "./post.js";
export * from "./analyze.js";
export * from "./validate.js";
export * from "./expand.js";
export * from "./font.js";
export * from "./hash.js";
export * from "./pipeline.js";
// Bausteine fuer Tests und Probelaeufe (Kap. 15) — mit ausgeliefert, damit
// Formate, Renderer und CI dieselben Designs benutzen wie die Engine-Tests.
export * from "./testdesign.js";

import { initGeometry } from "@texma-stitch/geometry";

/**
 * Laedt, was die Engine an WASM braucht. Muss einmal vor dem ersten `planDesign`
 * laufen — danach ist alles synchron.
 */
export const initEngine = (): Promise<void> => initGeometry();
