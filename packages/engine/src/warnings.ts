/** Warnungscodes (Kap. 11). Ein Ort fuer Code, Text und Schwere. */
import type { Warning, WarningSeverity } from "./types.js";

export const WARNUNG = {
  SATIN_TOO_NARROW: "SATIN_TOO_NARROW",
  SATIN_TOO_WIDE: "SATIN_TOO_WIDE",
  FILL_TINY: "FILL_TINY",
  TEXT_TOO_SMALL: "TEXT_TOO_SMALL",
  DENSITY_HIGH: "DENSITY_HIGH",
  MANY_COLOR_CHANGES: "MANY_COLOR_CHANGES",
  LONG_JUMP: "LONG_JUMP",
  SELF_INTERSECTING_RAILS: "SELF_INTERSECTING_RAILS",
  OBJECT_OUTSIDE_HOOP: "OBJECT_OUTSIDE_HOOP",
  EMPTY_OBJECT: "EMPTY_OBJECT",
  INVALID_GEOMETRY: "INVALID_GEOMETRY",
  THREAD_MISSING: "THREAD_MISSING",
  UNSUPPORTED_OBJECT: "UNSUPPORTED_OBJECT",
} as const;

export type WarnungsCode = (typeof WARNUNG)[keyof typeof WARNUNG];

export function warne(
  code: WarnungsCode,
  message: string,
  severity: WarningSeverity = "warn",
  objectId?: string,
): Warning {
  return objectId === undefined ? { code, message, severity } : { objectId, code, message, severity };
}
