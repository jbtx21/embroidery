/**
 * Tiny probe font: "I" is a straight satin column, "." a running-stitch dot.
 *
 * Enough to check layout, kerning and warnings — real fonts come through the
 * Ink/Stitch converter (spec §9).
 */
import type { Font } from "@texma-stitch/fonts";

export const TEST_FONT: Font = {
  id: "test",
  name: "Probe",
  minHeightMm: 5,
  glyphs: {
    I: {
      columns: [
        {
          railA: [
            { x: 0.1, y: 0 },
            { x: 0.1, y: -1 },
          ],
          railB: [
            { x: 0.35, y: 0 },
            { x: 0.35, y: -1 },
          ],
          rungs: [],
        },
      ],
      advance: 0.5,
    },
    ".": {
      columns: [],
      strokes: [
        [
          { x: 0.1, y: 0 },
          { x: 0.2, y: 0 },
        ],
      ],
      advance: 0.3,
    },
  },
  kerning: { II: -0.02 },
};
