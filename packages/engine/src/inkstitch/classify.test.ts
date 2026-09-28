import { beforeAll, describe, expect, it } from "vitest";
import { initGeometry } from "@texma-stitch/geometry";
import { polygonOf, rect } from "../../test/fixtures/shapes.js";
import { GLYPHS } from "../../test/fixtures/glyphs.js";
import { AUTOSATIN_MAX_WIDTH_MM, SINGLE_PASS_MAX_MM } from "../import/svg.js";
import { classifyShape, SATIN_FROM_MM, SATIN_NARROW_WARN_MM } from "./classify.js";

beforeAll(async () => {
  await initGeometry();
});

const bar = (widthMm: number, lenMm = 40): ReturnType<typeof polygonOf> =>
  polygonOf(rect(0, 0, lenMm, widthMm));

describe("classifyShape (satin-prep, part 1, item 2)", () => {
  it("classifies a hairline as running with one pass", () => {
    const r = classifyShape(bar(0.5));
    expect(r.shapeClass).toBe("running");
    expect(r.repeats).toBe(1);
    expect(r.widthMm).toBeLessThan(SINGLE_PASS_MAX_MM);
  });

  it("classifies a wider-but-still-under-satin sliver as running with three passes", () => {
    const r = classifyShape(bar(0.75));
    expect(r.shapeClass).toBe("running");
    expect(r.repeats).toBe(3);
    expect(r.widthMm).toBeGreaterThan(SINGLE_PASS_MAX_MM);
    expect(r.widthMm).toBeLessThan(SATIN_FROM_MM);
  });

  it("classifies a column at the satin floor as satin, flagged narrow", () => {
    const r = classifyShape(bar(0.9));
    expect(r.shapeClass).toBe("satin");
    expect(r.widthMm).toBeGreaterThanOrEqual(SATIN_FROM_MM);
    expect(r.widthMm).toBeLessThan(SATIN_NARROW_WARN_MM);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]!.code).toBe("SATIN_TOO_NARROW");
    expect(r.warnings[0]!.severity).toBe("warn");
  });

  it("classifies a comfortable column as satin without a warning", () => {
    const r = classifyShape(bar(2));
    expect(r.shapeClass).toBe("satin");
    expect(r.warnings).toHaveLength(0);
  });

  it("classifies a wide plate as tatami", () => {
    const r = classifyShape(bar(8, 8));
    expect(r.shapeClass).toBe("tatami");
    expect(r.widthMm).toBeGreaterThanOrEqual(AUTOSATIN_MAX_WIDTH_MM);
  });

  it("puts an id on the narrow-satin warning when given one", () => {
    const r = classifyShape(bar(0.9), "buchstabe-x");
    expect(r.warnings[0]!.objectId).toBe("buchstabe-x");
  });

  it("classifies the CYS SPORTS stroke width (0.89-1.22 mm measured) as satin", () => {
    // Comment in classify.ts explains why 0.8 mm and not spec §7.4's 0.6/1.2:
    // this word mark's strokes must come out as ONE closed satin column.
    expect(classifyShape(bar(0.89)).shapeClass).toBe("satin");
    expect(classifyShape(bar(1.22)).shapeClass).toBe("satin");
    // Its thinner serif remnants (0.44-0.62 mm measured) stay running.
    expect(classifyShape(bar(0.44)).shapeClass).toBe("running");
    expect(classifyShape(bar(0.62)).shapeClass).toBe("running");
  });

  it("classifies the block-letter fixtures as satin (all comfortably above the floor)", () => {
    for (const ch of ["T", "L", "E", "K", "X"]) {
      const r = classifyShape(GLYPHS[ch]!, ch);
      expect(r.shapeClass, `${ch}: ${r.widthMm.toFixed(2)} mm`).toBe("satin");
    }
  });
});
