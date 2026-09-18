/** Design builders for tests and bench runs (spec §15). */
import type { Point, Polygon, Polyline } from "@texma-stitch/geometry";
import type {
  Design,
  FillObject,
  RunningObject,
  SatinObject,
  TextObject,
  Thread,
} from "../../src/types.js";
import { PRESETS } from "../../src/presets.js";

export const THREAD_BLACK: Thread = {
  brand: "madeira",
  number: "1000",
  hex: "#101010",
  name: "Schwarz",
};
export const THREAD_RED: Thread = {
  brand: "madeira",
  number: "1147",
  hex: "#c8102e",
  name: "Rot",
};

const base = (id: string, threadIndex = 0) => ({
  id,
  threadIndex,
  visible: true,
  locked: false,
  trimAfter: "auto" as const,
});

export function fillObject(id: string, shape: Polygon, over: Partial<FillObject> = {}): FillObject {
  const p = PRESETS.pique;
  return {
    ...base(id),
    type: "fill",
    shape,
    angleDeg: 0,
    rowSpacingMm: p.fillRowSpacingMm,
    stitchLengthMm: p.fillStitchLengthMm,
    staggerRows: p.fillStaggerRows,
    pullCompMm: 0,
    underlay: { contour: false, fill: "none", spacingMm: 2, insetMm: 0.4 },
    ...over,
  };
}

export function satinObject(
  id: string,
  railA: Polyline,
  railB: Polyline,
  over: Partial<SatinObject> = {},
): SatinObject {
  const p = PRESETS.pique;
  return {
    ...base(id),
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
    ...over,
  };
}

export function runningObject(
  id: string,
  path: Polyline,
  over: Partial<RunningObject> = {},
): RunningObject {
  return {
    ...base(id),
    type: "running",
    path,
    closed: false,
    stitchLengthMm: 2.5,
    repeats: 1,
    ...over,
  };
}

export function textObject(
  id: string,
  text: string,
  origin: Point,
  over: Partial<TextObject> = {},
): TextObject {
  return {
    ...base(id),
    type: "text",
    text,
    fontId: "test",
    heightMm: 10,
    letterSpacing: 0.05,
    origin,
    trimBetweenWords: true,
    ...over,
  };
}

export function design(objects: Design["objects"], over: Partial<Design> = {}): Design {
  return {
    id: "test",
    widthMm: 100,
    heightMm: 100,
    preset: "pique",
    objects,
    threads: [THREAD_BLACK, THREAD_RED],
    ...over,
  };
}
