/**
 * Engine data model (spec §3).
 *
 * Only objects are stored, never stitches (spec §1). All lengths in millimetres,
 * angles in degrees, coordinates as in SVG (y down).
 */
import type { Point, Polygon, Polyline } from "@texma-stitch/geometry";

export type { Point, Polygon, Polyline };

export type Thread = {
  brand: "madeira" | "isacord";
  number: string;
  hex: string;
  name: string;
};

export type PresetId = "pique" | "softshell" | "fleece" | "cap" | "frottee";

export type TrimAfter = "auto" | "always" | "never";

export type Base = {
  id: string;
  threadIndex: number;
  visible: boolean;
  locked: boolean;
  trimAfter: TrimAfter;
};

export type FillUnderlay = {
  contour: boolean;
  fill: "none" | "single" | "double";
  spacingMm: number;
  insetMm: number;
};

export type FillObject = Base & {
  type: "fill";
  shape: Polygon;
  /** Stitch direction. */
  angleDeg: number;
  /** Row spacing, i.e. density. */
  rowSpacingMm: number;
  stitchLengthMm: number;
  /** Stagger across n rows. */
  staggerRows: number;
  /** Offset outwards (+) or inwards (-). */
  pullCompMm: number;
  underlay: FillUnderlay;
  startPoint?: Point;
  endPoint?: Point;
};

export type SatinUnderlay = {
  center: boolean;
  contour: boolean;
  zigzag: boolean;
  insetMm: number;
  zigzagSpacingMm: number;
};

export type SatinObject = Base & {
  type: "satin";
  railA: Polyline;
  railB: Polyline;
  /** Optional rungs steering the pairing — the tool against twisting (spec §7.1). */
  rungs: [Point, Point][];
  /** Zigzag spacing, peak to peak on the same rail. */
  spacingMm: number;
  pullCompMm: number;
  /** Above this width, split satin kicks in (spec §7.4). */
  maxWidthMm: number;
  underlay: SatinUnderlay;
  /** Short stitches in tight curves (spec §7.5). */
  shortStitches: boolean;
  /** Stitch the column from the other end. */
  reverse: boolean;
};

export type RunningObject = Base & {
  type: "running";
  path: Polyline;
  closed: boolean;
  stitchLengthMm: number;
  /** 1 = running stitch, 3/5 = bean stitch. */
  repeats: 1 | 3 | 5;
};

export type TextObject = Base & {
  type: "text";
  text: string;
  fontId: string;
  heightMm: number;
  letterSpacing: number;
  origin: Point;
  onPath?: Polyline;
  trimBetweenWords: boolean;
};

export type StitchObject = FillObject | SatinObject | RunningObject | TextObject;

export type Design = {
  id: string;
  widthMm: number;
  heightMm: number;
  preset: PresetId;
  /** Order of the list is the stitching order. */
  objects: StitchObject[];
  threads: Thread[];
};

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export type StitchCommand = "stitch" | "jump" | "trim" | "color" | "stop" | "end";

export type Stitch = {
  x: number;
  y: number;
  cmd: StitchCommand;
  /**
   * Lock stitch (spec §10.3). Extension beyond spec §3: post-processing removes
   * tiny stitches (spec §11) and would otherwise throw away exactly the lock
   * stitches it is meant to protect — those are 0.3 mm short by definition.
   */
  tie?: true;
};

export type StitchBlock = {
  objectId: string;
  threadIndex: number;
  stitches: Stitch[];
};

export type Stats = {
  stitches: number;
  jumps: number;
  trims: number;
  colorChanges: number;
  bboxMm: { w: number; h: number };
  /** Estimate (spec §11). */
  runtimeSec: number;
  /** Stitches per mm^2 in the densest 1 mm cell. */
  densityMax: number;
};

export type WarningSeverity = "info" | "warn" | "error";

export type Warning = {
  objectId?: string;
  code: string;
  message: string;
  severity: WarningSeverity;
};

export type StitchPlan = {
  blocks: StitchBlock[];
  stats: Stats;
  warnings: Warning[];
};
