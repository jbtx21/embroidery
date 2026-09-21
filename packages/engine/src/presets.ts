/**
 * Presets (spec §14) and machine profiles. Starting values — to be adjusted
 * against test sew-outs in phase 5.
 *
 * Row spacing and stitch length follow the production values of ZSK EPCwin
 * (0.4-0.6 mm spacing, 4-5 mm stitch length) — 21.09.2026. Before that the
 * spacings ran down to 0.35 mm and the stitch length was 3.0 mm, which is
 * denser and shorter than a production file needs: more needle holes for the
 * same coverage. Fleece and terry are our own mapping, not taken from the
 * rule — both are thick and lofty, so the stitches sink in. They are the two to
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
  /** Fill: along the thread direction, outwards (spec §8.1.1). */
  pullCompMm: number;
  /** Satin: pull compensation per side as a percentage of the column width (§7.2). */
  pullCompPct: number;
  /** Satin: upper limit of that compensation in mm (§7.2). */
  pullCompMaxMm: number;
  /** Across the thread direction, inwards (spec §8.1.1). */
  pushCompMm: number;
  /** Overlap under the neighbouring outline (spec §8.1.2). */
  underlapMm: number;
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
    fillStitchLengthMm: 4.0,
    fillStaggerRows: 4,
    satinSpacingMm: 0.38,
    pullCompMm: 0.2,
    pullCompPct: 12,
    pullCompMaxMm: 0.4,
    pushCompMm: 0.1,
    underlapMm: 0.2,
    fillUnderlay: fillUnderlayOf("single"),
    satinUnderlay: satinUnderlayOf(),
    note: "Standard",
  },
  jersey: {
    id: "jersey",
    label: "Jersey",
    fillRowSpacingMm: 0.45,
    fillStitchLengthMm: 4.0,
    fillStaggerRows: 4,
    satinSpacingMm: 0.4,
    pullCompMm: 0.25,
    pullCompPct: 12,
    pullCompMaxMm: 0.4,
    pushCompMm: 0.15,
    underlapMm: 0.25,
    fillUnderlay: fillUnderlayOf("single"),
    satinUnderlay: satinUnderlayOf(),
    note: "dünne Shirtware, Schneidvlies",
  },
  softshell: {
    id: "softshell",
    label: "Softshell",
    fillRowSpacingMm: 0.42,
    fillStitchLengthMm: 4.0,
    fillStaggerRows: 4,
    satinSpacingMm: 0.4,
    pullCompMm: 0.25,
    pullCompPct: 12,
    pullCompMaxMm: 0.4,
    pushCompMm: 0.1,
    underlapMm: 0.2,
    fillUnderlay: fillUnderlayOf("single"),
    satinUnderlay: satinUnderlayOf(),
  },
  fleece: {
    id: "fleece",
    label: "Fleece",
    fillRowSpacingMm: 0.4,
    fillStitchLengthMm: 4.0,
    fillStaggerRows: 4,
    satinSpacingMm: 0.4,
    pullCompMm: 0.3,
    pullCompPct: 12,
    pullCompMaxMm: 0.4,
    pushCompMm: 0.15,
    underlapMm: 0.25,
    fillUnderlay: fillUnderlayOf("double"),
    satinUnderlay: satinUnderlayOf({ insetMm: 0.3 }),
    note: "Topping empfohlen",
  },
  cap: {
    id: "cap",
    label: "Cap",
    fillRowSpacingMm: 0.38,
    fillStitchLengthMm: 4.0,
    fillStaggerRows: 4,
    satinSpacingMm: 0.35,
    pullCompMm: 0.2,
    pullCompPct: 12,
    pullCompMaxMm: 0.4,
    pushCompMm: 0.1,
    underlapMm: 0.2,
    fillUnderlay: fillUnderlayOf("single"),
    satinUnderlay: satinUnderlayOf({ center: true, zigzag: false }),
    note: "Reihenfolge Mitte → außen, unten → oben",
  },
  frottee: {
    id: "frottee",
    label: "Frottee",
    fillRowSpacingMm: 0.38,
    fillStitchLengthMm: 4.0,
    fillStaggerRows: 4,
    satinSpacingMm: 0.35,
    pullCompMm: 0.2,
    pullCompPct: 12,
    pullCompMaxMm: 0.4,
    pushCompMm: 0.15,
    underlapMm: 0.3,
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
  /** Shortest stitch the machine should be asked for (spec §11). */
  minStitchMm: number;
  /** What is on the spool, not a property of the design (spec §14). */
  threadWeight: 40 | 60;
};

export const MACHINE_DEFAULT: MachineProfile = {
  id: "standard",
  label: "Standard 800 U/min",
  rpm: 800,
  hoopWMm: 360,
  hoopHMm: 200,
  maxJumpMm: 12.1,
  minStitchMm: 0.6,
  threadWeight: 40,
};

export const MACHINE_CAP: MachineProfile = {
  id: "cap",
  label: "Cap-Rahmen",
  rpm: 700,
  hoopWMm: 130,
  hoopHMm: 60,
  maxJumpMm: 12.1,
  minStitchMm: 0.6,
  threadWeight: 40,
};

export const MACHINES: Record<string, MachineProfile> = {
  standard: MACHINE_DEFAULT,
  cap: MACHINE_CAP,
};

export const preset = (id: PresetId): Preset => PRESETS[id];

/**
 * 60 weight thread is thinner and covers a narrower line, so the rows have to
 * stand closer or the fabric shows through (spec §14).
 */
export const densityFactor = (machine: MachineProfile): number =>
  machine.threadWeight === 60 ? 0.8 : 1;

/**
 * The same thread carries finer shapes, so a font may go smaller: a font asking
 * for 5 mm comes down to the 3.5 mm the trade rule names (spec §14).
 */
export const textMinFactor = (machine: MachineProfile): number =>
  machine.threadWeight === 60 ? 0.7 : 1;

/** The preset as the thread on the machine makes it (spec §14). */
export function presetForMachine(id: PresetId, machine: MachineProfile): Preset {
  const base = PRESETS[id];
  const f = densityFactor(machine);
  if (f === 1) return base;
  return {
    ...base,
    fillRowSpacingMm: base.fillRowSpacingMm * f,
    satinSpacingMm: base.satinSpacingMm * f,
  };
}
