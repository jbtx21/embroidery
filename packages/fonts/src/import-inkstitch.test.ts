import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { capHeightUnits, importInkstitchFont, parseGlyphLayers } from "./import-inkstitch.js";
import { columnsOf, strokesOf } from "./types.js";
import type { InkstitchMeta } from "./import-inkstitch.js";

const here = dirname(fileURLToPath(import.meta.url));
const fontDir = resolve(here, "inkstitch/caffeine_tiny");
const svg = readFileSync(resolve(fontDir, "ltr.svg"), "utf8");
const meta = JSON.parse(readFileSync(resolve(fontDir, "font.json"), "utf8")) as InkstitchMeta;

describe("capHeightUnits (spec §9)", () => {
  it("reads the cap height from the baseline and caps guides", () => {
    // caps at 114, baseline at 49,9 in the Inkscape system — 64,1 units apart.
    expect(capHeightUnits(svg)).toBeCloseTo(64.1, 1);
  });

  it("says so when the guides are missing", () => {
    expect(() => capHeightUnits("<svg></svg>")).toThrow(/guide/i);
  });
});

describe("parseGlyphLayers (spec §9)", () => {
  const layers = parseGlyphLayers(svg);

  it("finds one layer per glyph", () => {
    expect(layers.size).toBe(118);
    for (const c of "TEXMA") expect(layers.has(c)).toBe(true);
  });

  it("unescapes the XML in a label", () => {
    expect(layers.has("&")).toBe(true);
  });
});

describe("importInkstitchFont (spec §9)", () => {
  const font = importInkstitchFont(svg, meta, "caffeine_tiny");

  it("carries name, id and the minimum height", () => {
    expect(font.id).toBe("caffeine_tiny");
    expect(font.name).toBe("Caffeine tiny");
    // min_scale 0,25 of a 16,2 mm em, of which the cap height is 64,1 %.
    expect(font.minHeightMm).toBeCloseTo(2.6, 1);
  });

  it("puts the baseline at y = 0 and the cap height at -1", () => {
    const I = font.glyphs["I"]!;
    const ys = columnsOf(I)
      .flatMap((c) => [...c.railA, ...c.railB])
      .map((p) => p.y);
    expect(Math.max(...ys)).toBeCloseTo(0, 1);
    expect(Math.min(...ys)).toBeCloseTo(-1, 1);
  });

  it("reads the satin columns with their rungs", () => {
    const I = font.glyphs["I"]!;
    expect(columnsOf(I).length).toBeGreaterThanOrEqual(2);
    for (const c of columnsOf(I)) {
      expect(c.railA.length).toBeGreaterThanOrEqual(2);
      expect(c.railB.length).toBeGreaterThanOrEqual(2);
      for (const r of c.rungs) expect(r).toHaveLength(2);
    }
  });

  it("keeps the running stitches that connect the columns", () => {
    expect(strokesOf(font.glyphs["I"]!).length).toBeGreaterThan(0);
  });

  it("carries the stitch parameters the font states (spec §9.2)", () => {
    const col = columnsOf(font.glyphs["I"]!)[0]!;
    // caffeine_tiny states 0,05 mm pull and 0,25 mm zigzag at every column.
    expect(col.pullCompMm).toBeCloseTo(0.05, 6);
    expect(col.spacingMm).toBeCloseTo(0.25, 6);
    expect(col.shortStitchMm).toBeCloseTo(0.17, 6);
  });

  it("leaves the parameters out where the font says nothing", () => {
    const stripped = svg.replace(/inkstitch:pull_compensation_mm="[^"]*"/g, "");
    const f = importInkstitchFont(stripped, meta, "x");
    expect(columnsOf(f.glyphs["I"]!)[0]!.pullCompMm).toBeUndefined();
  });

  it("takes the advance from the metadata, in cap heights", () => {
    // "I" advances 16 of 64,1 units.
    expect(font.glyphs["I"]!.advance).toBeCloseTo(16 / 64.1, 3);
    expect(font.glyphs[" "]!.advance).toBeCloseTo(22 / 64.1, 3);
  });

  it("falls back to the default advance for a glyph without one", () => {
    const bare = importInkstitchFont(svg, { ...meta, horiz_adv_x: {} }, "x");
    expect(bare.glyphs["T"]!.advance).toBeCloseTo(45 / 64.1, 3);
  });

  it("is deterministic", () => {
    expect(JSON.stringify(importInkstitchFont(svg, meta, "a"))).toBe(
      JSON.stringify(importInkstitchFont(svg, meta, "a")),
    );
  });
});

describe("glyph order (spec §9.3)", () => {
  it("keeps columns and connectors interleaved, as the font draws them", () => {
    const font = importInkstitchFont(svg, meta, "c");
    const kinds = font.glyphs["I"]!.parts.map((p) => (p.kind === "column" ? "S" : "r")).join("");
    // The font walks in: run, column, run, column — not all columns first.
    expect(kinds).toMatch(/rS/);
    expect(kinds).not.toBe("S".repeat(kinds.length));
  });
});
