import { beforeAll, describe, expect, it } from "vitest";
import type { Polygon } from "@texma-stitch/geometry";
import { initGeometry, offset, offsetDirectional, polygonArea } from "@texma-stitch/geometry";
import { dumbbell, hourglass, polygonOf, rect, U_SHAPE } from "../../test/fixtures/shapes.js";
import { bestFillAngle } from "../fill.js";
import { DEFAULT_ANGLE_DEG } from "../import/svg.js";
import { PRESETS } from "../presets.js";
import {
  compensateArea,
  FILL_UNDERLAY_STITCH_MM,
  fillAngles,
  gridUnderlay,
  inkstitchAngleDeg,
  tatamiAttributes,
} from "./tatami.js";
import type { AngleNode } from "./tatami.js";

beforeAll(async () => {
  await initGeometry();
});

const pique = PRESETS.pique;

describe("inkstitchAngleDeg", () => {
  it("turns the direction round: Ink/Stitch counts counter-clockwise, the fill clockwise on the page", () => {
    expect(inkstitchAngleDeg(45)).toBe(-45);
    expect(inkstitchAngleDeg(-45)).toBe(45);
    expect(inkstitchAngleDeg(30)).toBe(-30);
    expect(inkstitchAngleDeg(0)).toBe(0);
  });

  it("keeps it in (-90, 90] — rows have no direction, 135 degrees are -45", () => {
    expect(inkstitchAngleDeg(135)).toBe(45);
    expect(inkstitchAngleDeg(165)).toBe(15);
    expect(inkstitchAngleDeg(90)).toBe(90);
    expect(inkstitchAngleDeg(-90)).toBe(90);
    expect(Object.is(inkstitchAngleDeg(0), 0)).toBe(true);
    expect(Object.is(inkstitchAngleDeg(180), 0)).toBe(true);
  });
});

describe("tatamiAttributes (spec §14 preset values as Ink/Stitch attributes)", () => {
  it("sets density, stitch length, stagger, angle and the single underlay — and no pull compensation", () => {
    // The pull goes into the area's outline instead (`template.ts`, spec §8.1.1).
    expect(tatamiAttributes(pique, 45)).toEqual({
      row_spacing_mm: "0.4",
      max_stitch_length_mm: "4",
      staggers: "4",
      angle: "-45",
      fill_underlay: "true",
      fill_underlay_angle: "45",
      fill_underlay_row_spacing_mm: "2",
      fill_underlay_inset_mm: "0.4",
      fill_underlay_max_stitch_length_mm: String(FILL_UNDERLAY_STITCH_MM),
    });
  });

  it("puts the underlay across the rows: the fill angle plus 90 degrees, in Ink/Stitch's direction", () => {
    expect(tatamiAttributes(pique, -45).angle).toBe("45");
    expect(tatamiAttributes(pique, -45).fill_underlay_angle).toBe("-45");
    expect(tatamiAttributes(pique, 0).fill_underlay_angle).toBe("90");
    expect(tatamiAttributes(pique, 15).fill_underlay_angle).toBe("75");
  });

  it("sets a double underlay as two layers, 45 degrees either side of the rows (spec §8.6)", () => {
    const fleece = tatamiAttributes(PRESETS.fleece, 45);
    expect(fleece.fill_underlay).toBe("true");
    // Ink/Stitch's angle is -45: the layers lie at 0 and 90 — 45 either side.
    expect(fleece.fill_underlay_angle).toBe("0 90");
    expect(fleece.fill_underlay_row_spacing_mm).toBe("2");
  });

  it("switches the underlay off, and says nothing more about it", () => {
    const bare = { ...pique, fillUnderlay: { ...pique.fillUnderlay, fill: "none" as const } };
    const a = tatamiAttributes(bare, 45);
    expect(a.fill_underlay).toBe("false");
    expect(Object.keys(a).filter((k) => k.startsWith("fill_underlay"))).toEqual(["fill_underlay"]);
  });

  it("switches the underlay off where the area does not hold one (`grid` false)", () => {
    const a = tatamiAttributes(pique, 45, false);
    expect(a.fill_underlay).toBe("false");
    expect(Object.keys(a).filter((k) => k.startsWith("fill_underlay"))).toEqual(["fill_underlay"]);
    expect(a.row_spacing_mm).toBe("0.4");
  });

  it("follows the preset: row spacing, stitch length, stagger", () => {
    const jersey = tatamiAttributes(PRESETS.jersey, 45);
    expect(jersey).toMatchObject({
      row_spacing_mm: "0.45",
      max_stitch_length_mm: "4",
      staggers: String(PRESETS.jersey.fillStaggerRows),
    });
  });
});

describe("fillAngles (spec §5.1 and §8.2)", () => {
  const spacing = pique.fillRowSpacingMm;
  const tatami = (shapeId: string, polygon: Polygon): AngleNode => ({
    shapeId,
    polygon,
    cover: polygon,
  });
  const other = (shapeId: string, cover: Polygon): AngleNode => ({
    shapeId,
    polygon: undefined,
    cover,
  });
  const square = (x: number, y: number): Polygon => polygonOf(rect(x, y, 10, 10));

  it("gives a shape where no angle is better the diagonal of §5.1", () => {
    expect(fillAngles([tatami("a", square(0, 0))], spacing)).toEqual([DEFAULT_ANGLE_DEG]);
  });

  it("turns a shape that touches or covers an earlier one to -45 degrees, so the rows cross at the seam", () => {
    const touching = fillAngles([tatami("a", square(0, 0)), tatami("b", square(10, 0))], spacing);
    expect(touching).toEqual([DEFAULT_ANGLE_DEG, -DEFAULT_ANGLE_DEG]);
    const covering = fillAngles([tatami("a", square(0, 0)), tatami("b", square(5, 5))], spacing);
    expect(covering).toEqual([DEFAULT_ANGLE_DEG, -DEFAULT_ANGLE_DEG]);
    const apart = fillAngles([tatami("a", square(0, 0)), tatami("b", square(50, 0))], spacing);
    expect(apart).toEqual([DEFAULT_ANGLE_DEG, DEFAULT_ANGLE_DEG]);
  });

  it("goes by what was stitched earlier, not by what comes later", () => {
    // The later one is turned, the earlier one is not — whichever is which.
    const angles = fillAngles([tatami("a", square(10, 0)), tatami("b", square(0, 0))], spacing);
    expect(angles).toEqual([DEFAULT_ANGLE_DEG, -DEFAULT_ANGLE_DEG]);
  });

  it("counts a satin or a line lying earlier as something to cross, and skips the shape's own parts", () => {
    const angles = fillAngles([other("letter", square(0, 0)), tatami("b", square(10, 0))], spacing);
    expect(angles).toEqual([undefined, -DEFAULT_ANGLE_DEG]);
    // Two parts of one shape touch each other and do not cross: they were one area.
    const parts = fillAngles([tatami("s", square(0, 0)), tatami("s", square(10, 0))], spacing);
    expect(parts).toEqual([DEFAULT_ANGLE_DEG, DEFAULT_ANGLE_DEG]);
  });

  it("takes the angle at which the rows break least, where that is plainly better", () => {
    // A U with its slot up breaks every diagonal row across the slot; rows along the arms break none.
    const best = bestFillAngle(U_SHAPE, spacing, DEFAULT_ANGLE_DEG);
    expect(best).not.toBe(DEFAULT_ANGLE_DEG);
    expect(fillAngles([tatami("u", U_SHAPE)], spacing)).toEqual([best]);
  });

  it("lets the row-break rule win over the crossing rule where it speaks", () => {
    const angles = fillAngles([tatami("a", square(-10, 0)), tatami("u", U_SHAPE)], spacing);
    expect(angles[1]).toBe(bestFillAngle(U_SHAPE, spacing, DEFAULT_ANGLE_DEG));
  });

  it("is empty for nothing, and gives nothing for what is no tatami", () => {
    expect(fillAngles([], spacing)).toEqual([]);
    expect(fillAngles([other("l", square(0, 0))], spacing)).toEqual([undefined]);
  });
});

describe("gridUnderlay (Ink/Stitch's grid underlay only where it holds, spec §8.6)", () => {
  it("gives a compact area the grid underlay: its inset is one piece", () => {
    expect(gridUnderlay(polygonOf(rect(0, 0, 30, 20)), pique, 45)).toEqual({
      grid: true,
      pieces: 1,
    });
  });

  it("keeps it for an area with a hole — the inset is still one piece", () => {
    const framed = polygonOf(rect(0, 0, 30, 20), [rect(10, 5, 10, 10)]);
    expect(gridUnderlay(framed, pique, 45)).toEqual({ grid: true, pieces: 1 });
  });

  it("gives none where the preset has none", () => {
    const bare = { ...pique, fillUnderlay: { ...pique.fillUnderlay, fill: "none" as const } };
    expect(gridUnderlay(polygonOf(rect(0, 0, 30, 20)), bare, 45)).toEqual({
      grid: false,
      pieces: 0,
    });
  });

  it("gives none where the inset falls apart: Ink/Stitch walks the pieces in its own order and jumps across", () => {
    // Two blocks joined by a waist of 0.6 mm: the inset of 0.4 mm on either side cuts it.
    expect(gridUnderlay(hourglass(0.6), pique, 45)).toEqual({ grid: false, pieces: 2 });
    // The same shape with a waist that holds is one piece again.
    expect(gridUnderlay(hourglass(2), pique, 45)).toEqual({ grid: true, pieces: 1 });
  });

  it("gives none where a neck on the edge could go either way: the inset a little deeper falls apart", () => {
    // A waist of 0.84 mm: the inset of 0.4 mm still holds it in one piece, 0.43 mm cuts it — and
    // Ink/Stitch's shapely rounds its arcs differently from our Clipper.
    expect(offset(hourglass(0.84), -0.4)).toHaveLength(1);
    expect(offset(hourglass(0.84), -0.43)).toHaveLength(2);
    expect(gridUnderlay(hourglass(0.84), pique, 45)).toEqual({ grid: false, pieces: 2 });
    expect(gridUnderlay(hourglass(0.95), pique, 45)).toEqual({ grid: true, pieces: 1 });
  });

  it("gives none to a band: the inset of a band is a band whose two edges are one needle track", () => {
    // 1.2 mm wide: 0.4 mm of it is left, under the 0.8 mm a needle needs for two tracks.
    expect(gridUnderlay(polygonOf(rect(0, 0, 20, 1.2)), pique, 45)).toEqual({
      grid: false,
      pieces: 1,
    });
    expect(gridUnderlay(polygonOf(rect(0, 0, 20, 2)), pique, 45)).toEqual({
      grid: true,
      pieces: 1,
    });
  });

  it("gives none to an area too narrow for an inset at all — Ink/Stitch would underlay the whole of it", () => {
    expect(gridUnderlay(polygonOf(rect(0, 0, 20, 0.6)), pique, 45)).toEqual({
      grid: false,
      pieces: 0,
    });
  });

  it("gives none to a piece that no row of the grid reaches — Ink/Stitch would stitch a ring round it", () => {
    // Fill angle 0: the underlay rows are vertical lines at multiples of the 2 mm spacing.
    // The inset of this square lies between x = 0.6 and 1.5 — no line in it.
    expect(gridUnderlay(polygonOf(rect(0.2, 0.2, 1.7, 1.7)), pique, 0)).toEqual({
      grid: false,
      pieces: 1,
    });
    // Moved so that the line at x = 0 runs through it, the same square holds one.
    expect(gridUnderlay(polygonOf(rect(-0.8, 0.2, 1.7, 1.7)), pique, 0)).toEqual({
      grid: true,
      pieces: 1,
    });
  });

  it("wants a row in every layer of a double underlay", () => {
    const fleece = PRESETS.fleece;
    // Layers at -45 and 45 degrees to the rows; a big area has rows in both.
    expect(gridUnderlay(polygonOf(rect(0, 0, 30, 20)), fleece, 0)).toEqual({
      grid: true,
      pieces: 1,
    });
  });
});

describe("compensateArea (pull and push, spec §8.1.1)", () => {
  const only = (pullCompMm: number, pushCompMm: number) => ({ ...pique, pullCompMm, pushCompMm });
  const block = polygonOf(rect(0, 0, 30, 20));

  it("is the offset fill.ts applies: out along the rows, in across them", () => {
    const c = compensateArea(block, 45, pique);
    const expected = offsetDirectional(block, pique.pullCompMm, pique.pushCompMm, 45);
    expect(c.how).toBe("full");
    expect(c.parts).toBe(1);
    // Snapped to the 1 µm grid, so not to the last digit.
    expect(polygonArea(c.polygon)).toBeCloseTo(polygonArea(expected[0]!), 1);
  });

  it("puts the outline on the 1 µm grid — a spike thinner than the SVG holds must not turn into a crossing", () => {
    const c = compensateArea(polygonOf(rect(0, 0, 30, 20)), 45, pique);
    const onGrid = (v: number): boolean => Math.abs(v * 1000 - Math.round(v * 1000)) < 1e-6;
    const points = [c.polygon.outer, ...c.polygon.holes].flat();
    expect(points.length).toBeGreaterThan(4);
    for (const p of points) {
      expect(onGrid(p.x)).toBe(true);
      expect(onGrid(p.y)).toBe(true);
    }
  });

  it("hands back the very same area where there is nothing to compensate", () => {
    const c = compensateArea(block, 45, only(0, 0));
    expect(c).toEqual({ polygon: block, how: "full", parts: 1 });
    expect(c.polygon).toBe(block);
  });

  it("grows the area by the pull alone and takes it in by the push alone", () => {
    const area = polygonArea(block);
    expect(polygonArea(compensateArea(block, 0, only(0.5, 0)).polygon)).toBeGreaterThan(area);
    expect(polygonArea(compensateArea(block, 0, only(0, 0.5)).polygon)).toBeLessThan(area);
  });

  it("leaves an area that vanishes as it is, and says so", () => {
    const dot = polygonOf(rect(0, 0, 3, 3));
    expect(compensateArea(dot, 0, only(0, 3))).toEqual({ polygon: dot, how: "none", parts: 0 });
  });

  it("gives an area the push would cut apart the pull alone", () => {
    // Rows along the bar (0 degrees): a push of 0.4 mm either side takes the 0.6 mm bar away.
    const bell = dumbbell(0.6);
    expect(offsetDirectional(bell, 0.2, 0.4, 0)).toHaveLength(2);
    const c = compensateArea(bell, 0, only(0.2, 0.4));
    expect(c.how).toBe("pull");
    expect(c.parts).toBe(2);
    expect(polygonArea(c.polygon)).toBeGreaterThan(polygonArea(bell));
    // One piece: the bar is still there.
    expect(offsetDirectional(c.polygon, 0, 0, 0)).toHaveLength(1);
  });
});
