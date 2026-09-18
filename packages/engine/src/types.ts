/**
 * Datenmodell der Engine (Kap. 3).
 *
 * Gespeichert werden nur Objekte, nie Stiche (Kap. 1). Alle Laengen in
 * Millimetern, Winkel in Grad, Koordinaten wie SVG (y nach unten).
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
  /** Stichrichtung. */
  angleDeg: number;
  /** Reihenabstand = Dichte. */
  rowSpacingMm: number;
  stitchLengthMm: number;
  /** Versatz ueber n Reihen. */
  staggerRows: number;
  /** Offset nach aussen (+) oder innen (-). */
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
  /** Optionale Sprossen zur Paarung — das Werkzeug gegen Verdrehen (Kap. 7.1). */
  rungs: [Point, Point][];
  /** Zickzack-Abstand, Spitze zu Spitze auf derselben Rail. */
  spacingMm: number;
  pullCompMm: number;
  /** Darueber Split-Satin (Kap. 7.4). */
  maxWidthMm: number;
  underlay: SatinUnderlay;
  /** Kurzstiche in engen Kurven (Kap. 7.5). */
  shortStitches: boolean;
  /** Spalte vom anderen Ende her sticken. */
  reverse: boolean;
};

export type RunningObject = Base & {
  type: "running";
  path: Polyline;
  closed: boolean;
  stitchLengthMm: number;
  /** 1 = Laufstich, 3/5 = Bean Stitch. */
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
  /** Reihenfolge = Stickreihenfolge. */
  objects: StitchObject[];
  threads: Thread[];
};

// ---------------------------------------------------------------------------
// Ausgabe
// ---------------------------------------------------------------------------

export type StitchCommand = "stitch" | "jump" | "trim" | "color" | "stop" | "end";

export type Stitch = {
  x: number;
  y: number;
  cmd: StitchCommand;
  /**
   * Verriegelungsstich (Kap. 10.3). Erweiterung ueber Kap. 3 hinaus: das
   * Nachbearbeiten entfernt Ministiche (Kap. 11) und wuerde sonst genau die
   * Verriegelung wegwerfen, die sie schuetzen soll.
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
  /** Schaetzung (Kap. 11). */
  runtimeSec: number;
  /** Stiche pro mm^2 im dichtesten 1-mm-Raster. */
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
