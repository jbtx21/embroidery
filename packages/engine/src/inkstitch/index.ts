/**
 * The Ink/Stitch template (ADR 0001): classify imported shapes, read the
 * strokes of every letter and narrow shape off its medial axis, set them as
 * native satin columns the way a puncher would, and write the SVG Ink/Stitch
 * stitches.
 *
 * Ink/Stitch generates the stitches (28.09.2026 decision); this module only
 * prepares its input and measures it. `packages/engine/src/import/svg.ts`
 * still owns `importShapes`/`importSvg` and the (frozen) auto-satin path.
 */
export * from "./classify.js";
export * from "./strokes.js";
export * from "./columns.js";
export * from "./smooth.js";
export * from "./tatami.js";
export * from "./template.js";
