/** Warning codes (spec §11). One place for code, message and severity. */
import type { Warning, WarningSeverity } from "./types.js";

export const WARNING = {
  SATIN_TOO_NARROW: "SATIN_TOO_NARROW",
  SATIN_TOO_WIDE: "SATIN_TOO_WIDE",
  FILL_TINY: "FILL_TINY",
  FILL_TOO_NARROW: "FILL_TOO_NARROW",
  EDGE_GAP_RISK: "EDGE_GAP_RISK",
  FILL_COVERED: "FILL_COVERED",
  AUTOSATIN_MIXED: "AUTOSATIN_MIXED",
  TEXT_TOO_SMALL: "TEXT_TOO_SMALL",
  DENSITY_HIGH: "DENSITY_HIGH",
  MANY_COLOR_CHANGES: "MANY_COLOR_CHANGES",
  LONG_JUMP: "LONG_JUMP",
  SELF_INTERSECTING_RAILS: "SELF_INTERSECTING_RAILS",
  OBJECT_OUTSIDE_HOOP: "OBJECT_OUTSIDE_HOOP",
  EMPTY_OBJECT: "EMPTY_OBJECT",
  INVALID_GEOMETRY: "INVALID_GEOMETRY",
  SHAPE_SPLIT: "SHAPE_SPLIT",
  THREAD_MISSING: "THREAD_MISSING",
  NOT_IMPLEMENTED: "NOT_IMPLEMENTED",
  UNSUPPORTED_GLYPH: "UNSUPPORTED_GLYPH",
  FONT_MISSING: "FONT_MISSING",
} as const;

export type WarningCode = (typeof WARNING)[keyof typeof WARNING];

export function warn(
  code: WarningCode,
  message: string,
  severity: WarningSeverity = "warn",
  objectId?: string,
): Warning {
  return objectId === undefined
    ? { code, message, severity }
    : { objectId, code, message, severity };
}
