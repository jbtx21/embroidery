/**
 * `pnpm inkstitch <svg> --breite <mm>` (tools/breite.mjs): the motif scaled to a target width.
 * Own shapes, no customer logos.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { importShapes, initEngine } from "@texma-stitch/engine";
import { scaleSvgToWidth } from "../tools/breite.mjs";

beforeAll(async () => {
  await initEngine();
});

const bar = `<path id="a" d="M 0,0 L 40,0 L 40,20 L 0,20 Z" style="fill:#1f3a93;stroke:none"/>`;
const svg = (attrs: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${bar}</svg>`;
const SIZE = { widthMm: 80, heightMm: 40 };

describe("scaleSvgToWidth (--breite)", () => {
  it("rewrites width and height of the root to the target, keeping the proportions and the viewBox", () => {
    const r = scaleSvgToWidth(svg('width="80mm" height="40mm" viewBox="0 0 80 40"'), 120, SIZE);
    expect(r.factor).toBeCloseTo(1.5, 9);
    expect(r.text).toContain('width="120mm"');
    expect(r.text).toContain('height="60mm"');
    expect(r.text).toContain('viewBox="0 0 80 40"');
    expect(r.from).toEqual({ widthMm: 80, heightMm: 40 });
    expect(r.to).toEqual({ widthMm: 120, heightMm: 60 });
  });

  it("gives the geometry the factor: what the import reads is the size asked for", () => {
    const source = svg('width="80mm" height="40mm" viewBox="0 0 80 40"');
    const scaled = scaleSvgToWidth(source, 120, SIZE).text;
    const a = importShapes(source);
    const b = importShapes(scaled);
    expect(a.widthMm).toBeCloseTo(80, 6);
    expect(b.widthMm).toBeCloseTo(120, 6);
    expect(b.heightMm).toBeCloseTo(60, 6);
    const width = (shapes: typeof a.shapes): number => {
      const s = shapes[0]!;
      if (s.kind !== "area") throw new Error("area expected");
      const xs = s.polygon.outer.map((p) => p.x);
      return Math.max(...xs) - Math.min(...xs);
    };
    expect(width(a.shapes)).toBeCloseTo(40, 6);
    expect(width(b.shapes)).toBeCloseTo(60, 6);
  });

  it("scales down as well, and keeps a factor of 1 for the width it already has", () => {
    const source = svg('width="80mm" height="40mm" viewBox="0 0 80 40"');
    const small = scaleSvgToWidth(source, 40, SIZE);
    expect(small.factor).toBeCloseTo(0.5, 9);
    expect(small.to).toEqual({ widthMm: 40, heightMm: 20 });
    expect(scaleSvgToWidth(source, 80, SIZE).factor).toBe(1);
  });

  it("writes a size that is not a round number to four decimals", () => {
    const r = scaleSvgToWidth(svg('width="80mm" height="74.564mm" viewBox="0 0 80 74.564"'), 120, {
      widthMm: 80,
      heightMm: 74.564,
    });
    expect(r.text).toContain('height="111.846mm"');
    expect(r.to.heightMm).toBeCloseTo(111.846, 6);
  });

  it("reads the size in other units from the import, and writes millimetres", () => {
    const px = svg('width="302.362px" height="151.181px" viewBox="0 0 80 40"');
    const r = scaleSvgToWidth(px, 120, SIZE);
    expect(r.text).toContain('width="120mm"');
    expect(r.text).not.toContain("px");
  });

  it("leaves every other attribute and the whole document as it is — a stroke-width is not a width", () => {
    const source =
      `<svg xmlns="http://www.w3.org/2000/svg" stroke-width="2" width='80mm' height='40mm' ` +
      `viewBox="0 0 80 40" id="x">${bar}<g stroke-width="3" width="7"/></svg>`;
    const r = scaleSvgToWidth(source, 160, SIZE);
    expect(r.text).toContain('stroke-width="2"');
    expect(r.text).toContain('id="x"');
    expect(r.text).toContain(`${bar}<g stroke-width="3" width="7"/>`);
    expect(r.text).toMatch(/width=['"]160mm['"]/);
    expect(r.text).toMatch(/height=['"]80mm['"]/);
  });

  it("refuses an SVG without a viewBox: the drawing would not follow the size", () => {
    expect(() => scaleSvgToWidth(svg('width="80mm" height="40mm"'), 120, SIZE)).toThrow(/viewBox/);
  });

  it("refuses a target that is no positive number, and a source that has no size", () => {
    const source = svg('width="80mm" height="40mm" viewBox="0 0 80 40"');
    expect(() => scaleSvgToWidth(source, 0, SIZE)).toThrow(/positive/);
    expect(() => scaleSvgToWidth(source, -5, SIZE)).toThrow(/positive/);
    expect(() => scaleSvgToWidth(source, Number.NaN, SIZE)).toThrow(/positive/);
    expect(() => scaleSvgToWidth(source, 120, { widthMm: 0, heightMm: 0 })).toThrow(/Größe/);
    expect(() => scaleSvgToWidth("<g/>", 120, SIZE)).toThrow(/svg/);
  });
});
