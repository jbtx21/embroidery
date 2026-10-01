/**
 * The hoop check of the gate (spec §5.2, "Rahmen", 01.10.2026): does the motif, in the size the program
 * is made in, fit the hoop of the preset — as it stands or turned by 90°? Where it fits neither way the
 * program is made all the same and the output warns: the hoop is a question of the machine (a larger
 * hoop, splitting the file), the motif itself is stitchable in that size. The check only says; it
 * changes nothing (rule 8).
 *
 * The size is that of what is stitched: the box of the outlines of the areas and of the stroked lines
 * that have a colour (`designForms` takes the same, the template plans an object for no other). It
 * does not include the pull compensation (0.4 mm a side at most) nor any margin: a side exactly as
 * long as the hoop fits. The DST-based check of `analyze` (`OBJECT_OUTSIDE_HOOP`) runs on the stitches,
 * after the run, and does not turn the design.
 *
 * Pure: shapes in, numbers out, no IO (CLAUDE.md, rule 4).
 */
import type { ImportedShape } from "../import/svg.js";
import type { MachineProfile } from "../presets.js";
import { MACHINE_CAP, MACHINE_DEFAULT } from "../presets.js";
import type { PresetId } from "../types.js";

/** A side exactly as long as the hoop fits; this is only the noise of the last digit. */
const FIT_EPS_MM = 1e-9;

export type DesignSize = { widthMm: number; heightMm: number };

/**
 * The size of what is stitched, mm: the box of the outer rings of every area and of the points of every
 * stroked line that has a colour and two points at least. `undefined` for a design with nothing to stitch.
 */
export function designSize(shapes: ImportedShape[]): DesignSize | undefined {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const take = (points: { x: number; y: number }[]): void => {
    for (const p of points) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  };
  for (const shape of shapes) {
    if (shape.kind === "area") take(shape.polygon.outer);
    else if (shape.color !== undefined && shape.polyline.length >= 2) take(shape.polyline);
  }
  return minX > maxX ? undefined : { widthMm: maxX - minX, heightMm: maxY - minY };
}

export type HoopFit = DesignSize & {
  /** The hoop it was measured against. */
  machine: MachineProfile;
  /** It fits, as it stands or turned by 90°. */
  fits: boolean;
  /** It fits only turned by 90°. */
  turned: boolean;
};

/** Does a motif of this size fit the hoop of the machine — as it stands, or turned by 90°? */
export function fitHoop(size: DesignSize, machine: MachineProfile): HoopFit {
  const inside = (w: number, h: number): boolean =>
    w <= machine.hoopWMm + FIT_EPS_MM && h <= machine.hoopHMm + FIT_EPS_MM;
  const straight = inside(size.widthMm, size.heightMm);
  const turned = !straight && inside(size.heightMm, size.widthMm);
  return { ...size, machine, fits: straight || turned, turned };
}

/**
 * The machine a preset is made for: the cap preset sews on the cap frame (130 × 60 mm), every other on
 * the standard machine (360 × 200 mm) — `analyze` and the pipeline do not pick a machine from the
 * preset, they take the profile they are given.
 */
export const machineOfPreset = (id: PresetId): MachineProfile =>
  id === "cap" ? MACHINE_CAP : MACHINE_DEFAULT;
