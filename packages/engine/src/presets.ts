/**
 * Presets (spec §14) and machine profiles. Starting values — to be adjusted
 * against test sew-outs in phase 5.
 *
 * Row spacing follows commercial practice for 40-weight thread: 0.40 mm as the
 * standard, 0.35 mm on heavy goods (caps, jackets). Fleece and terry are our own
 * mapping, not taken from the trade rule — both are thick and lofty, so the
 * stitches sink in and need the coverage of heavy goods. They are the two to
 * check first on a test sew-out.
 */
import type { FillUnderlay, PresetId, SatinUnderlay } from "./types.js";

export type Preset = {
  id: PresetId;
  label: string;
  /** Fill row spacing, i.e. density. */
  fillRowSpacingMm: number;
  fillStitchLengthMm: number;
  fillStaggerRows: number;
  satinSpacingMm: number;
  pullCompMm: number;
  fillUnderlay: FillUnderlay;
  satinUnderlay: SatinUnderlay;
  note?: string;
};

const fillUnderlayOf = (
  fill: FillUnderlay["fill"],
  insetMm = 0.4,
  spacingMm = 2.0,
): FillUnderlay => ({ contour: true, fill, spacingMm, insetMm });

const satinUnderlayOf = (opts: Partial<SatinUnderlay> = {}): SatinUnderlay => ({
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
    fillRowSpacingMm: 0.4,
    fillStitchLengthMm: 3.0,
    fillStaggerRows: 4,
    satinSpacingMm: 0.38,
    pullCompMm: 0.2,
    fillUnderlay: fillUnderlayOf("single"),
    satinUnderlay: satinUnderlayOf(),
    note: "Standard",
  },
  softshell: {
    id: "softshell",
    label: "Softshell",
    fillRowSpacingMm: 0.35,
    fillStitchLengthMm: 3.0,
    fillStaggerRows: 4,
    satinSpacingMm: 0.4,
    pullCompMm: 0.25,
    fillUnderlay: fillUnderlayOf("single"),
    satinUnderlay: satinUnderlayOf(),
  },
  fleece: {
    id: "fleece",
    label: "Fleece",
    fillRowSpacingMm: 0.35,
    fillStitchLengthMm: 3.0,
    fillStaggerRows: 4,
    satinSpacingMm: 0.4,
    pullCompMm: 0.3,
    fillUnderlay: fillUnderlayOf("double"),
    satinUnderlay: satinUnderlayOf({ insetMm: 0.3 }),
    note: "Topping empfohlen",
  },
  cap: {
    id: "cap",
    label: "Cap",
    fillRowSpacingMm: 0.35,
    fillStitchLengthMm: 3.0,
    fillStaggerRows: 4,
    satinSpacingMm: 0.38,
    pullCompMm: 0.15,
    fillUnderlay: fillUnderlayOf("single"),
    satinUnderlay: satinUnderlayOf({ center: true, zigzag: false }),
    note: "Reihenfolge Mitte → außen, unten → oben",
  },
  frottee: {
    id: "frottee",
    label: "Frottee",
    fillRowSpacingMm: 0.35,
    fillStitchLengthMm: 3.0,
    fillStaggerRows: 4,
    satinSpacingMm: 0.35,
    pullCompMm: 0.2,
    fillUnderlay: fillUnderlayOf("double"),
    satinUnderlay: satinUnderlayOf(),
    note: "Knockdown-Fill unter Motiv, Topping",
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

export const MACHINE_DEFAULT: MachineProfile = {
  id: "standard",
  label: "Standard 800 U/min",
  rpm: 800,
  hoopWMm: 360,
  hoopHMm: 200,
  maxJumpMm: 12.1,
};

export const MACHINE_CAP: MachineProfile = {
  id: "cap",
  label: "Cap-Rahmen",
  rpm: 700,
  hoopWMm: 130,
  hoopHMm: 60,
  maxJumpMm: 12.1,
};

export const MACHINES: Record<string, MachineProfile> = {
  standard: MACHINE_DEFAULT,
  cap: MACHINE_CAP,
};

export const preset = (id: PresetId): Preset => PRESETS[id];
