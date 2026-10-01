/**
 * The hoop check of the gate (spec §5.2, "Rahmen", 01.10.2026): the size of what is stitched, whether
 * it fits the hoop of the preset — as it stands or turned by 90° — and which hoop that is. A motif that
 * fits neither way is generated all the same and warned about; the check only says.
 */
import { describe, expect, it } from "vitest";
import { areaShape, lineShape, polygonOf, pt, rect } from "../../test/fixtures/shapes.js";
import { MACHINE_CAP, MACHINE_DEFAULT, PRESETS } from "../presets.js";
import { designSize, fitHoop, machineOfPreset } from "./hoop.js";

describe("designSize (the box of what is stitched, mm)", () => {
  it("is the box of the outlines of all areas", () => {
    const size = designSize([
      areaShape("a", polygonOf(rect(10, 5, 20, 8))),
      areaShape("b", polygonOf(rect(50, 20, 10, 10))),
    ]);
    expect(size).toEqual({ widthMm: 50, heightMm: 25 });
  });

  it("takes the points of a stroked line that has a colour as well", () => {
    const size = designSize([
      areaShape("a", polygonOf(rect(0, 0, 10, 10))),
      lineShape("linie", [pt(0, 20), pt(30, 40)], "#c8102e"),
    ]);
    expect(size).toEqual({ widthMm: 30, heightMm: 40 });
  });

  it("leaves out a line without a colour and one with a single point: the template plans no object for them", () => {
    const none = { ...lineShape("ohne-farbe", [pt(0, 0), pt(100, 100)]), color: undefined };
    const size = designSize([
      areaShape("a", polygonOf(rect(0, 0, 10, 10))),
      none,
      lineShape("ein-punkt", [pt(200, 200)], "#c8102e"),
    ]);
    expect(size).toEqual({ widthMm: 10, heightMm: 10 });
  });

  it("does not count the holes of an area: they lie inside its outline", () => {
    const withHole = {
      outer: rect(0, 0, 10, 10),
      holes: [rect(2, 2, 3, 3)],
    };
    expect(designSize([areaShape("ring", withHole)])).toEqual({ widthMm: 10, heightMm: 10 });
  });

  it("is undefined for nothing to stitch", () => {
    expect(designSize([])).toBeUndefined();
    const none = { ...lineShape("ohne-farbe", [pt(0, 0), pt(5, 5)]), color: undefined };
    expect(designSize([none])).toBeUndefined();
  });
});

describe("fitHoop (does it fit the hoop of the machine)", () => {
  it("fits where both sides are inside the hoop", () => {
    const fit = fitHoop({ widthMm: 118, heightMm: 110 }, MACHINE_DEFAULT);
    expect(fit).toMatchObject({ widthMm: 118, heightMm: 110, fits: true, turned: false });
    expect(fit.machine).toBe(MACHINE_DEFAULT);
  });

  it("fits turned by 90° where only that does: 142 × 201.6 mm in a hoop of 360 × 200 mm", () => {
    const fit = fitHoop({ widthMm: 142, heightMm: 201.6 }, MACHINE_DEFAULT);
    expect(fit.fits).toBe(true);
    expect(fit.turned).toBe(true);
  });

  it("does not fit where it does not even turned: 250 × 233 mm in 360 × 200 mm", () => {
    const fit = fitHoop({ widthMm: 250, heightMm: 233 }, MACHINE_DEFAULT);
    expect(fit.fits).toBe(false);
    expect(fit.turned).toBe(false);
  });

  it("lets a side that is exactly as long as the hoop fit: no clearance asked", () => {
    expect(fitHoop({ widthMm: 360, heightMm: 200 }, MACHINE_DEFAULT).fits).toBe(true);
    expect(fitHoop({ widthMm: 200, heightMm: 284 }, MACHINE_DEFAULT)).toMatchObject({
      fits: true,
      turned: true,
    });
    expect(fitHoop({ widthMm: 360.1, heightMm: 200 }, MACHINE_DEFAULT).fits).toBe(false);
  });

  it("measures against the hoop of the machine it is given: the cap frame is 130 × 60 mm", () => {
    expect(fitHoop({ widthMm: 110, heightMm: 51 }, MACHINE_CAP).fits).toBe(true);
    // 140 × 51 does not fit 130 × 60, and turned (51 × 140) it does not either.
    expect(fitHoop({ widthMm: 140, heightMm: 51 }, MACHINE_CAP).fits).toBe(false);
    expect(fitHoop({ widthMm: 55, heightMm: 120 }, MACHINE_CAP)).toMatchObject({
      fits: true,
      turned: true,
    });
  });
});

describe("machineOfPreset (the hoop a preset is meant for)", () => {
  it("is the cap frame for the cap preset", () => {
    expect(machineOfPreset("cap")).toBe(MACHINE_CAP);
    expect(MACHINE_CAP.hoopWMm).toBe(130);
    expect(MACHINE_CAP.hoopHMm).toBe(60);
  });

  it("is the standard machine for every other preset: 360 × 200 mm", () => {
    for (const id of Object.keys(PRESETS) as (keyof typeof PRESETS)[]) {
      if (id === "cap") continue;
      expect(machineOfPreset(id), id).toBe(MACHINE_DEFAULT);
    }
    expect(MACHINE_DEFAULT.hoopWMm).toBe(360);
    expect(MACHINE_DEFAULT.hoopHMm).toBe(200);
  });
});
