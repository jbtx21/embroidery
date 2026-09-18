/**
 * Presets (Kap. 14) und Maschinenprofile. Startwerte — in Phase 5 gegen
 * Probestickungen justieren.
 */
import type { FillUnderlay, PresetId, SatinUnderlay } from "./types.js";

export type Preset = {
  id: PresetId;
  label: string;
  /** Reihenabstand des Fill = Dichte. */
  fillRowSpacingMm: number;
  fillStitchLengthMm: number;
  fillStaggerRows: number;
  satinSpacingMm: number;
  pullCompMm: number;
  fillUnderlay: FillUnderlay;
  satinUnderlay: SatinUnderlay;
  hinweis?: string;
};

const fillUnterlage = (
  fill: FillUnderlay["fill"],
  insetMm = 0.4,
  spacingMm = 2.0,
): FillUnderlay => ({ contour: true, fill, spacingMm, insetMm });

const satinUnterlage = (
  opts: Partial<SatinUnderlay> = {},
): SatinUnderlay => ({
  center: false,
  contour: true,
  zigzag: true,
  insetMm: 0.4,
  zigzagSpacingMm: 3.0,
  ...opts,
});

export const PRESETS: Record<PresetId, Preset> = {
  pique: {
    id: "pique",
    label: "Piqué",
    fillRowSpacingMm: 0.25,
    fillStitchLengthMm: 3.0,
    fillStaggerRows: 4,
    satinSpacingMm: 0.38,
    pullCompMm: 0.2,
    fillUnderlay: fillUnterlage("single"),
    satinUnderlay: satinUnterlage(),
    hinweis: "Standard",
  },
  softshell: {
    id: "softshell",
    label: "Softshell",
    fillRowSpacingMm: 0.27,
    fillStitchLengthMm: 3.0,
    fillStaggerRows: 4,
    satinSpacingMm: 0.4,
    pullCompMm: 0.25,
    fillUnderlay: fillUnterlage("single"),
    satinUnderlay: satinUnterlage(),
  },
  fleece: {
    id: "fleece",
    label: "Fleece",
    fillRowSpacingMm: 0.28,
    fillStitchLengthMm: 3.0,
    fillStaggerRows: 4,
    satinSpacingMm: 0.4,
    pullCompMm: 0.3,
    fillUnderlay: fillUnterlage("double"),
    satinUnderlay: satinUnterlage({ insetMm: 0.3 }),
    hinweis: "Topping empfohlen",
  },
  cap: {
    id: "cap",
    label: "Cap",
    fillRowSpacingMm: 0.25,
    fillStitchLengthMm: 3.0,
    fillStaggerRows: 4,
    satinSpacingMm: 0.38,
    pullCompMm: 0.15,
    fillUnderlay: fillUnterlage("single"),
    satinUnderlay: satinUnterlage({ center: true, zigzag: false }),
    hinweis: "Reihenfolge Mitte → außen, unten → oben",
  },
  frottee: {
    id: "frottee",
    label: "Frottee",
    fillRowSpacingMm: 0.25,
    fillStitchLengthMm: 3.0,
    fillStaggerRows: 4,
    satinSpacingMm: 0.35,
    pullCompMm: 0.2,
    fillUnderlay: fillUnterlage("double"),
    satinUnderlay: satinUnterlage(),
    hinweis: "Knockdown-Fill unter Motiv, Topping",
  },
};

export type MachineProfile = {
  id: string;
  label: string;
  rpm: number;
  hoopWMm: number;
  hoopHMm: number;
  maxJumpMm: number;
};

export const MASCHINE_STANDARD: MachineProfile = {
  id: "standard",
  label: "Standard 800 U/min",
  rpm: 800,
  hoopWMm: 360,
  hoopHMm: 200,
  maxJumpMm: 12.1,
};

export const MASCHINE_CAP: MachineProfile = {
  id: "cap",
  label: "Cap-Rahmen",
  rpm: 700,
  hoopWMm: 130,
  hoopHMm: 60,
  maxJumpMm: 12.1,
};

export const MASCHINEN: Record<string, MachineProfile> = {
  standard: MASCHINE_STANDARD,
  cap: MASCHINE_CAP,
};

export const preset = (id: PresetId): Preset => PRESETS[id];
