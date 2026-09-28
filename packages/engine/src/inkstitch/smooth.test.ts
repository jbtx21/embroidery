import { beforeAll, describe, expect, it } from "vitest";
import { initGeometry, polygonArea } from "@texma-stitch/geometry";
import { polygonOf, rect, TEXTURED_BAR } from "../../test/fixtures/shapes.js";
import { orient } from "@texma-stitch/geometry";
import {
  CLEAN_FILL_MAX,
  isTextureSmoothing,
  smoothingChange,
  smoothOutline,
  TEXTURE_EDGE_MIN,
} from "./smooth.js";

beforeAll(async () => {
  await initGeometry();
});

describe("smoothOutline", () => {
  it("leaves the shape alone at radius 0", () => {
    expect(smoothOutline(TEXTURED_BAR, 0)).toEqual([TEXTURED_BAR]);
  });

  it("closes texture holes under twice the radius and keeps the stroke", () => {
    const [bar, ...rest] = smoothOutline(TEXTURED_BAR, 0.2);
    expect(rest).toEqual([]);
    expect(bar!.holes).toEqual([]);
    // The stroke itself survives: 20 x 1.6 mm, less a little at the corners.
    expect(Math.abs(polygonArea(bar!))).toBeGreaterThan(0.98 * 20 * 1.6);
  });

  it("takes off a hairline between two strokes: two pieces", () => {
    const dumbbell = polygonOf([
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 5, y: 2.4 },
      { x: 10, y: 2.4 },
      { x: 10, y: 0 },
      { x: 15, y: 0 },
      { x: 15, y: 5 },
      { x: 10, y: 5 },
      { x: 10, y: 2.6 },
      { x: 5, y: 2.6 },
      { x: 5, y: 5 },
      { x: 0, y: 5 },
    ]);
    expect(smoothOutline(dumbbell, 0.2)).toHaveLength(2);
  });

  it("leaves nothing of a shape no wider than twice the radius", () => {
    expect(smoothOutline(polygonOf(rect(0, 0, 10, 0.3)), 0.2)).toEqual([]);
  });
});

describe("smoothingChange and isTextureSmoothing", () => {
  it("measures what smoothing adds and takes, as shares of the shape", () => {
    const change = smoothingChange(TEXTURED_BAR, smoothOutline(TEXTURED_BAR, 0.2));
    // Eight holes of 0.25 x 0.25 mm in 20 x 1.6 mm: 1.6 % added.
    expect(change.added).toBeCloseTo((8 * 0.0625) / 32, 2);
    expect(change.taken).toBeLessThan(TEXTURE_EDGE_MIN);
    expect(isTextureSmoothing(change)).toBe(true);
  });

  it("keeps drawn holes in a clean outline: no smoothing that fills them", () => {
    // A band with three slits cut out — narrow enough for the closing, drawn on purpose.
    const band = polygonOf(
      rect(0, 0, 10, 5),
      [1, 4.5, 8].map((x) => orient(rect(x, 1, 0.4, 3), false)),
    );
    const change = smoothingChange(band, smoothOutline(band, 0.3));
    expect(change.added).toBeGreaterThan(CLEAN_FILL_MAX);
    expect(change.taken).toBeLessThan(TEXTURE_EDGE_MIN);
    expect(isTextureSmoothing(change)).toBe(false);
  });

  it("allows a rough outline to lose its texture", () => {
    expect(isTextureSmoothing({ added: 0.2, taken: 0.02 })).toBe(true);
  });
});
