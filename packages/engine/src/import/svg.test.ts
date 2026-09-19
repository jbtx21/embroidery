import { describe, expect, it } from "vitest";
import { bbox } from "@texma-stitch/geometry";
import { SVG_ARC, SVG_FILLED, SVG_PIXELS, SVG_TWO_PATHS } from "../../test/fixtures/svg.js";
import { applyMatrix, IDENTITY, multiply, parseTransform } from "./matrix.js";
import { parsePathData } from "./path-data.js";
import { importSvg, lengthToMm, unitScale } from "./svg.js";
import type { FillObject, RunningObject } from "../types.js";
import { polygonArea } from "@texma-stitch/geometry";

describe("matrix", () => {
  it("parses the transform functions", () => {
    expect(parseTransform("translate(2,3)")).toEqual([1, 0, 0, 1, 2, 3]);
    expect(parseTransform("scale(2)")).toEqual([2, 0, 0, 2, 0, 0]);
    expect(parseTransform("scale(2 3)")).toEqual([2, 0, 0, 3, 0, 0]);
    expect(parseTransform("matrix(1 2 3 4 5 6)")).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("rotates about the origin and about a point", () => {
    const p = applyMatrix(parseTransform("rotate(90)"), { x: 1, y: 0 });
    expect(p.x).toBeCloseTo(0, 9);
    expect(p.y).toBeCloseTo(1, 9);
    const q = applyMatrix(parseTransform("rotate(180 5 0)"), { x: 6, y: 0 });
    expect(q.x).toBeCloseTo(4, 9);
  });

  it("skews", () => {
    expect(applyMatrix(parseTransform("skewX(45)"), { x: 0, y: 1 }).x).toBeCloseTo(1, 9);
    expect(applyMatrix(parseTransform("skewY(45)"), { x: 1, y: 0 }).y).toBeCloseTo(1, 9);
  });

  it("chains several functions left to right", () => {
    const p = applyMatrix(parseTransform("translate(10,0) scale(2)"), { x: 1, y: 0 });
    expect(p.x).toBeCloseTo(12, 9);
  });

  it("ignores unknown functions instead of guessing", () => {
    expect(parseTransform("wobble(3)")).toEqual(IDENTITY);
    expect(multiply(IDENTITY, IDENTITY)).toEqual(IDENTITY);
  });
});

describe("path data", () => {
  it("reads absolute and relative commands", () => {
    const [sub] = parsePathData("M 0 0 L 10 0 l 0 10");
    expect(sub!.segments).toHaveLength(2);
    expect(sub!.segments[1]).toMatchObject({ kind: "line", to: { x: 10, y: 10 } });
  });

  it("reads H and V", () => {
    const [sub] = parsePathData("M0 0 H10 V5 h-2 v-1");
    expect(sub!.segments).toHaveLength(4);
    expect(sub!.segments[2]).toMatchObject({ to: { x: 8, y: 5 } });
    expect(sub!.segments[3]).toMatchObject({ to: { x: 8, y: 4 } });
  });

  it("closes a subpath with Z", () => {
    const [sub] = parsePathData("M0 0 L10 0 L10 10 Z");
    expect(sub!.closed).toBe(true);
    expect(sub!.segments[sub!.segments.length - 1]).toMatchObject({ to: { x: 0, y: 0 } });
  });

  it("continues an M with implicit L", () => {
    const [sub] = parsePathData("M 0 0 10 0 20 0");
    expect(sub!.segments).toHaveLength(2);
  });

  it("mirrors the control point for S and T", () => {
    const [cubic] = parsePathData("M0 0 C 0 10 10 10 10 0 S 20 -10 20 0");
    expect(cubic!.segments[1]).toMatchObject({ c1: { x: 10, y: -10 } });
    const [quad] = parsePathData("M0 0 Q 5 10 10 0 T 20 0");
    expect(quad!.segments[1]).toMatchObject({ kind: "quadratic", c: { x: 15, y: -10 } });
  });

  it("turns an arc into cubics", () => {
    const [sub] = parsePathData("M 0 0 A 10 10 0 0 1 20 0");
    expect(sub!.segments.length).toBeGreaterThan(1);
    for (const s of sub!.segments) expect(s.kind).toBe("cubic");
  });

  it("treats a zero radius as a line", () => {
    const [sub] = parsePathData("M 0 0 A 0 0 0 0 1 20 0");
    expect(sub!.segments[0]).toMatchObject({ kind: "line" });
  });

  it("splits several subpaths", () => {
    expect(parsePathData("M0 0 L10 0 M20 0 L30 0")).toHaveLength(2);
  });

  it("survives broken input without inventing geometry", () => {
    expect(parsePathData("")).toHaveLength(0);
    expect(parsePathData("M 0")).toHaveLength(0);
    expect(parsePathData("K 1 2 3")).toHaveLength(0);
  });
});

describe("lengths", () => {
  it("converts the SVG units", () => {
    expect(lengthToMm("10mm")).toBe(10);
    expect(lengthToMm("1cm")).toBe(10);
    expect(lengthToMm("1in")).toBeCloseTo(25.4, 9);
    expect(lengthToMm("72pt")).toBeCloseTo(25.4, 9);
    expect(lengthToMm("6pc")).toBeCloseTo(25.4, 9);
    expect(lengthToMm("96")).toBeCloseTo(25.4, 9);
    expect(lengthToMm("50%")).toBeUndefined();
    expect(lengthToMm(undefined)).toBeUndefined();
  });

  it("derives the scale from width and viewBox", () => {
    expect(unitScale({ width: "100mm", viewbox: "0 0 100 50" })).toBeCloseTo(1, 9);
    expect(unitScale({ width: "200mm", viewbox: "0 0 100 50" })).toBeCloseTo(2, 9);
    expect(unitScale({ height: "50mm", viewbox: "0 0 100 50" })).toBeCloseTo(1, 9);
    expect(unitScale({})).toBeCloseTo(25.4 / 96, 9);
  });
});

describe("import (spec §4, week 1)", () => {
  it("reads paths, applies the group transform and scales to millimetres", () => {
    const { design, mmPerUnit } = importSvg(SVG_TWO_PATHS);
    expect(mmPerUnit).toBeCloseTo(1, 9);
    expect(design.objects).toHaveLength(2);

    const outline = design.objects.find((o) => o.id === "kontur")!;
    expect(outline.type).toBe("running");
    // translate(10,5) moved the triangle
    expect(bbox(outline.type === "running" ? outline.path : [])).toMatchObject({
      minX: expect.closeTo(10, 6),
      minY: expect.closeTo(5, 6),
    });
  });

  it("ends the group transform at the closing tag", () => {
    // `<path …/>` is self-closing; if the scanner misses that, everything after
    // `</g>` keeps the group transform.
    const { design } = importSvg(SVG_TWO_PATHS);
    const arcPath = design.objects.find((o) => o.id === "bogen")!;
    const box = bbox(arcPath.type === "running" ? arcPath.path : []);
    expect(box.minX).toBeCloseTo(0, 6);
    // Apex of the cubic at t = 0.5: y = 32.5, not the control point's 30
    expect(box.minY).toBeCloseTo(32.5, 1);
    expect(box.maxY).toBeCloseTo(40, 6);
  });

  it("maps the Ink/Stitch attributes and ignores unknown ones", () => {
    const { design } = importSvg(SVG_TWO_PATHS);
    const outline = design.objects.find((o) => o.id === "kontur")!;
    expect(outline.type === "running" && outline.stitchLengthMm).toBe(3);
    expect(outline.type === "running" && outline.repeats).toBe(3);
    expect(outline.trimAfter).toBe("always");
    expect(outline.type === "running" && outline.closed).toBe(true);
  });

  it("makes one thread per stroke colour", () => {
    const { design } = importSvg(SVG_TWO_PATHS);
    expect(design.threads).toHaveLength(2);
    expect(design.threads.map((t) => t.hex)).toContain("#c8102e");
    // style="stroke:#101010" is read as well
    expect(design.threads.map((t) => t.hex)).toContain("#101010");
  });

  it("falls back to the default stitch length", () => {
    const { design } = importSvg(SVG_TWO_PATHS, { stitchLengthMm: 1.8 });
    const arcPath = design.objects.find((o) => o.id === "bogen")!;
    expect(arcPath.type === "running" && arcPath.stitchLengthMm).toBe(1.8);
  });

  it("flattens arcs and relative commands", () => {
    const { design } = importSvg(SVG_ARC);
    const p = design.objects[0]!;
    expect(p.type === "running" && p.path.length).toBeGreaterThan(8);
    expect(bbox(p.type === "running" ? p.path : []).maxY).toBeCloseTo(14, 0);
  });

  it("treats user units as pixels without a viewBox", () => {
    const { design } = importSvg(SVG_PIXELS);
    const p = design.objects[0]!;
    expect(bbox(p.type === "running" ? p.path : []).maxX).toBeCloseTo(25.4, 6);
  });

  it("reports an SVG without paths instead of returning an empty design", () => {
    const { design, warnings } = importSvg('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    expect(design.objects).toHaveLength(0);
    expect(warnings[0]!.severity).toBe("error");
  });

  it("takes the preset and the design id from the options", () => {
    const { design } = importSvg(SVG_TWO_PATHS, { preset: "fleece", designId: "logo" });
    expect(design.preset).toBe("fleece");
    expect(design.id).toBe("logo");
  });
});

describe("filled paths", () => {
  const imported = () => importSvg(SVG_FILLED);
  const byId = (id: string) => imported().design.objects.find((o) => o.id === id);

  it("makes an area out of a filled path and takes the colour from the group", () => {
    const ring = byId("ring") as FillObject;
    expect(ring.type).toBe("fill");
    const { design } = imported();
    expect(design.threads[ring.threadIndex]!.hex).toBe("#c8102e");
  });

  it("reads even-odd sub-paths as holes, not as separate areas", () => {
    const ring = byId("ring") as FillObject;
    expect(ring.shape.holes).toHaveLength(1);
    // 20 x 20 outer minus 10 x 10 hole
    expect(polygonArea(ring.shape)).toBeCloseTo(400 - 100, 3);
  });

  it("splits a path with two separate outer rings into two areas", () => {
    const { design } = imported();
    const parts = design.objects.filter((o) => o.id.startsWith("zwei-flaechen"));
    expect(parts).toHaveLength(2);
    for (const p of parts) expect(polygonArea((p as FillObject).shape)).toBeCloseTo(64, 3);
  });

  it("maps the Ink/Stitch fill attributes", () => {
    const f = byId("mit-parametern") as FillObject;
    expect(f.angleDeg).toBe(45);
    expect(f.rowSpacingMm).toBe(0.4);
    expect(f.stitchLengthMm).toBe(2.5);
    expect(f.staggerRows).toBe(2);
  });

  it("falls back to the preset where no attribute says otherwise", () => {
    const ring = byId("ring") as FillObject;
    expect(ring.angleDeg).toBe(0);
    expect(ring.rowSpacingMm).toBe(0.4); // Piqué
    const fleece = importSvg(SVG_FILLED, { preset: "fleece" });
    const ringFleece = fleece.design.objects.find((o) => o.id === "ring") as FillObject;
    expect(ringFleece.rowSpacingMm).toBe(0.35);
  });

  it("keeps fill=none with a stroke a running stitch", () => {
    const line = byId("kontur") as RunningObject;
    expect(line.type).toBe("running");
    const { design } = imported();
    expect(design.threads[line.threadIndex]!.hex).toBe("#2e3192");
  });

  it("treats a path without any paint as an outline", () => {
    // SVG would render it as black fill; in an embroidery source an unmarked
    // path is an outline far more often, and that was the previous behaviour.
    expect(byId("ohne-farbe")!.type).toBe("running");
  });

  it("reads a fill out of the style attribute", () => {
    const f = byId("stil") as FillObject;
    expect(f.type).toBe("fill");
    const { design } = imported();
    expect(design.threads[f.threadIndex]!.hex).toBe("#fedd01");
  });

  it("makes one thread per distinct colour", () => {
    const { design } = imported();
    // #000000 is the fallback for the path that names no colour at all.
    expect(design.threads.map((t) => t.hex).sort()).toEqual(
      ["#000000", "#101010", "#2e3192", "#c8102e", "#fedd01"].sort(),
    );
  });

  it("keeps the document order, which is the stacking order", () => {
    const ids = imported().design.objects.map((o) => o.id);
    expect(ids.indexOf("ring")).toBeLessThan(ids.indexOf("mit-parametern"));
  });
});
