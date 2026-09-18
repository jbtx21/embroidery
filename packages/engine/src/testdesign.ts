/** Bausteine fuer Tests und Probelaeufe (Kap. 15). */
import type { Point, Polygon, Polyline } from "@texma-stitch/geometry";
import type {
  Design,
  FillObject,
  RunningObject,
  SatinObject,
  Thread,
  TextObject,
} from "./types.js";
import { PRESETS } from "./presets.js";
import type { Font } from "./font.js";

export const GARN_SCHWARZ: Thread = {
  brand: "madeira",
  number: "1000",
  hex: "#101010",
  name: "Schwarz",
};
export const GARN_ROT: Thread = {
  brand: "madeira",
  number: "1147",
  hex: "#c8102e",
  name: "Rot",
};

const basis = (id: string, threadIndex = 0) => ({
  id,
  threadIndex,
  visible: true,
  locked: false,
  trimAfter: "auto" as const,
});

export function fillObjekt(
  id: string,
  shape: Polygon,
  ueber: Partial<FillObject> = {},
): FillObject {
  const p = PRESETS.pique;
  return {
    ...basis(id),
    type: "fill",
    shape,
    angleDeg: 0,
    rowSpacingMm: p.fillRowSpacingMm,
    stitchLengthMm: p.fillStitchLengthMm,
    staggerRows: p.fillStaggerRows,
    pullCompMm: 0,
    underlay: { contour: false, fill: "none", spacingMm: 2, insetMm: 0.4 },
    ...ueber,
  };
}

export function satinObjekt(
  id: string,
  railA: Polyline,
  railB: Polyline,
  ueber: Partial<SatinObject> = {},
): SatinObject {
  const p = PRESETS.pique;
  return {
    ...basis(id),
    type: "satin",
    railA,
    railB,
    rungs: [],
    spacingMm: p.satinSpacingMm,
    pullCompMm: 0,
    maxWidthMm: 7,
    underlay: { center: false, contour: false, zigzag: false, insetMm: 0.4, zigzagSpacingMm: 3 },
    shortStitches: false,
    reverse: false,
    ...ueber,
  };
}

export function runningObjekt(
  id: string,
  path: Polyline,
  ueber: Partial<RunningObject> = {},
): RunningObject {
  return {
    ...basis(id),
    type: "running",
    path,
    closed: false,
    stitchLengthMm: 2.5,
    repeats: 1,
    ...ueber,
  };
}

export function textObjekt(
  id: string,
  text: string,
  origin: Point,
  ueber: Partial<TextObject> = {},
): TextObject {
  return {
    ...basis(id),
    type: "text",
    text,
    fontId: "test",
    heightMm: 10,
    letterSpacing: 0.05,
    origin,
    trimBetweenWords: true,
    ...ueber,
  };
}

export function design(objects: Design["objects"], ueber: Partial<Design> = {}): Design {
  return {
    id: "test",
    widthMm: 100,
    heightMm: 100,
    preset: "pique",
    objects,
    threads: [GARN_SCHWARZ, GARN_ROT],
    ...ueber,
  };
}

/**
 * Winzige Pruefschrift: "I" ist eine gerade Satin-Spalte, "." ein Laufstich-Punkt.
 * Reicht, um Satz, Kerning und Warnungen zu pruefen — echte Schriften kommen
 * ueber den Ink/Stitch-Konverter (Kap. 9).
 */
export const TEST_FONT: Font = {
  id: "test",
  name: "Pruefschrift",
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
