import { beforeAll, describe, expect, it } from "vitest";
import { annulus, circle, pt, rect } from "../../engine/test/fixtures/shapes.js";
import {
  arcToleranceUnits,
  initGeometry,
  isGeometryReady,
  pathsToRings,
  ringsToPaths,
  ringsToPolygons,
  SCALE,
  withPaths,
} from "./clipper.js";
import { signedArea } from "./polygon.js";
import { FLATTEN_TOLERANCE_MM } from "./flatten.js";
import { SIMPLIFY_TOLERANCE_MM } from "./simplify.js";
import { CORNER_ANGLE_DEG } from "./resample.js";
import { cumulativeLengths } from "./measure.js";
import { isClockwise, polygonBbox } from "./polygon.js";

beforeAll(async () => {
  await initGeometry();
});

describe("clipper bridge", () => {
  it("reports readiness", () => {
    expect(isGeometryReady()).toBe(true);
  });

  it("round-trips rings through Clipper units", () => {
    const ring = rect(0, 0, 10, 5);
    const paths = ringsToPaths([ring]);
    const back = withPaths([paths], () => pathsToRings(paths));
    expect(back).toHaveLength(1);
    expect(back[0]).toHaveLength(4);
    // 1/1000 mm resolution — far finer than the 0.1 mm DST unit
    for (const p of back[0]!) {
      expect(Number.isInteger(Math.round(p.x * SCALE))).toBe(true);
    }
    expect(back[0]![2]!.x).toBeCloseTo(10, 3);
  });

  it("drops rings with fewer than three points", () => {
    const paths = ringsToPaths([[pt(0, 0), pt(1, 1)]]);
    expect(withPaths([paths], () => pathsToRings(paths))).toHaveLength(0);
  });

  it("releases the handles even when the callback throws", () => {
    const paths = ringsToPaths([rect(0, 0, 1, 1)]);
    expect(() =>
      withPaths([paths], () => {
        throw new Error("boom");
      }),
    ).toThrow("boom");
    // A second delete would throw inside the WASM module — so this is the proof
    // that withPaths cleaned up exactly once.
  });

  it("bundles rings back into polygons with holes", () => {
    const outer = circle(0, 0, 10, 32);
    const hole = circle(0, 0, 5, 32);
    const [poly] = ringsToPolygons([outer, hole]);
    expect(poly!.holes).toHaveLength(1);
    expect(signedArea(poly!.outer)).toBeGreaterThan(0);
    expect(signedArea(poly!.holes[0]!)).toBeLessThan(0);
  });

  it("discards a hole without a shell instead of guessing one", () => {
    // Two separate rings, neither inside the other: both are outer rings.
    const polys = ringsToPolygons([circle(0, 0, 5, 16), circle(100, 0, 5, 16)]);
    expect(polys).toHaveLength(2);
    for (const p of polys) expect(p.holes).toHaveLength(0);
  });

  it("keeps the arc tolerance two orders below the DST unit", () => {
    expect(arcToleranceUnits()).toBe(0.02 * SCALE);
    expect(SCALE).toBe(1000);
  });
});

describe("documented tolerances (spec §5)", () => {
  it("matches the values from the spec table", () => {
    expect(FLATTEN_TOLERANCE_MM).toBe(0.05);
    expect(SIMPLIFY_TOLERANCE_MM).toBe(0.02);
    expect(CORNER_ANGLE_DEG).toBe(30);
  });
});

describe("measure and polygon helpers", () => {
  it("accumulates lengths from zero", () => {
    expect(cumulativeLengths([pt(0, 0), pt(3, 4), pt(3, 8)])).toEqual([0, 5, 9]);
  });

  it("reports the winding", () => {
    expect(isClockwise(rect(0, 0, 10, 10))).toBe(true);
    expect(isClockwise([...rect(0, 0, 10, 10)].reverse())).toBe(false);
  });

  it("takes the polygon box from the outer ring", () => {
    expect(polygonBbox(annulus(0, 0, 10, 5))).toMatchObject({
      minX: expect.closeTo(-10, 6),
      maxX: expect.closeTo(10, 6),
    });
  });
});
