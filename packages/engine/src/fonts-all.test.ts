/** Every font in the repo goes through the converter (spec §9, §9.4). */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { initGeometry } from "@texma-stitch/geometry";
import type { Font, InkstitchMeta } from "@texma-stitch/fonts";
import { columnsOf, fontRegistry, importInkstitchFont, strokesOf } from "@texma-stitch/fonts";
import { design, textObject } from "../test/fixtures/designs.js";
import { expand } from "./expand.js";
import { FONT_SMALL_ID, FONT_SWITCH_MM, fontForHeight, fontIdForHeight } from "./font-choice.js";
import { planDesign } from "./pipeline.js";
import { PRESETS } from "./presets.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../fonts/src/inkstitch");
const ids = readdirSync(root, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();

const load = (id: string): Font =>
  importInkstitchFont(
    readFileSync(resolve(root, id, "ltr.svg"), "utf8"),
    JSON.parse(readFileSync(resolve(root, id, "font.json"), "utf8")) as InkstitchMeta,
    id,
  );

beforeAll(async () => {
  await initGeometry();
});

describe("all fonts in the repo (spec §9)", () => {
  it("finds six of them, each with a licence", () => {
    expect(ids).toHaveLength(6);
    for (const id of ids) {
      expect(readdirSync(resolve(root, id))).toContain("LICENSE");
    }
  });

  it.each(ids)("imports %s", (id) => {
    const font = load(id);
    expect(Object.keys(font.glyphs).length).toBeGreaterThan(40);
    expect(font.minHeightMm).toBeGreaterThan(0);
    expect(font.maxHeightMm).toBeGreaterThan(font.minHeightMm);
    // Baseline at 0, cap height at -1 — for the capital letters at least.
    for (const c of "AEHT") {
      const g = font.glyphs[c];
      if (!g) continue;
      const ys = [...columnsOf(g).flatMap((k) => [...k.railA, ...k.railB]), ...strokesOf(g).flat()]
        .map((p) => p.y)
        .filter((y) => Number.isFinite(y));
      if (ys.length === 0) continue;
      expect(Math.min(...ys)).toBeGreaterThan(-1.6);
      expect(Math.max(...ys)).toBeLessThan(0.6);
    }
  });

  it.each(ids)("sets TEXMA in %s without a missing glyph", (id) => {
    const font = load(id);
    const height = Math.min(Math.max(8, font.minHeightMm), font.maxHeightMm ?? 8);
    const r = expand(
      [textObject("t", "TEXMA", { x: 0, y: 30 }, { heightMm: height, fontId: id })],
      {
        preset: PRESETS.pique,
        fonts: fontRegistry([font]),
      },
    );
    expect(r.warnings.map((w) => w.code)).not.toContain("UNSUPPORTED_GLYPH");
    expect(r.objects.length).toBeGreaterThan(4);
  });
});

describe("font choice by height (spec §9.4)", () => {
  const fonts = ids.map(load);
  const registry = fontRegistry(fonts);

  it("takes caffeine_tiny up to 9 mm and caffeine_KOR above", () => {
    expect(fontIdForHeight(5)).toBe("caffeine_tiny");
    expect(fontIdForHeight(FONT_SWITCH_MM)).toBe("caffeine_tiny");
    expect(fontIdForHeight(9.1)).toBe("caffeine_KOR");
    expect(fontForHeight(registry, 6, fonts)!.id).toBe("caffeine_tiny");
    expect(fontForHeight(registry, 14, fonts)!.id).toBe("caffeine_KOR");
  });

  it("says it as info when the house rule scales past what the font declares (spec §9.4)", () => {
    // caffeine_tiny tops out at 5,7 mm, so 8 mm is past its own range. Scaling a
    // satin font up widens the columns, so this is a note, not a complaint.
    const id = fontIdForHeight(8);
    const r = expand([textObject("t", "TEX", { x: 0, y: 30 }, { heightMm: 8, fontId: id })], {
      preset: PRESETS.pique,
      fonts: registry,
    });
    const above = r.warnings.find((w) => w.code === "TEXT_ABOVE_FONT_MAX");
    expect(above).toBeDefined();
    expect(above!.severity).toBe("info");
  });

  it("keeps scaling below min_scale a warning (spec §9.4)", () => {
    // Down there the columns get too narrow — that one stays a complaint.
    const r = expand(
      [textObject("t", "TEX", { x: 0, y: 30 }, { heightMm: 1.5, fontId: FONT_SMALL_ID })],
      { preset: PRESETS.pique, fonts: registry },
    );
    const below = r.warnings.find((w) => w.code === "TEXT_TOO_SMALL");
    expect(below).toBeDefined();
    expect(below!.severity).toBe("warn");
  });

  it("plans a line in the large font all the way through", () => {
    const text = textObject(
      "t",
      "TEXMA",
      { x: 0, y: 40 },
      { heightMm: 14, fontId: "caffeine_KOR" },
    );
    const plan = planDesign(design([text]), { fonts: registry });
    expect(plan.stats.stitches).toBeGreaterThan(500);
    expect(plan.warnings.map((w) => w.code)).not.toContain("TEXT_ABOVE_FONT_MAX");
    expect(plan.warnings.map((w) => w.code)).not.toContain("TEXT_TOO_SMALL");
  });
});
