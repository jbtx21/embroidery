/** "TEXMA" in 8 mm with a real Ink/Stitch font (spec §9, §16). */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { dist, initGeometry } from "@texma-stitch/geometry";
import type { InkstitchMeta } from "@texma-stitch/fonts";
import { fontRegistry, importInkstitchFont } from "@texma-stitch/fonts";
import { design, textObject } from "../test/fixtures/designs.js";
import { planDesign } from "./pipeline.js";
import { PRESETS } from "./presets.js";
import { MAX_STITCH_MM } from "./post.js";
import { expand } from "./expand.js";
import type { SatinObject } from "./types.js";

const here = dirname(fileURLToPath(import.meta.url));
const fontDir = resolve(here, "../../fonts/src/inkstitch/caffeine_tiny");
const font = importInkstitchFont(
  readFileSync(resolve(fontDir, "ltr.svg"), "utf8"),
  JSON.parse(readFileSync(resolve(fontDir, "font.json"), "utf8")) as InkstitchMeta,
  "caffeine_tiny",
);
const fonts = fontRegistry([font]);

beforeAll(async () => {
  await initGeometry();
});

describe('"TEXMA" in 8 mm with caffeine_tiny (spec §9)', () => {
  const text = textObject("t", "TEXMA", { x: 0, y: 30 }, { heightMm: 8, fontId: "caffeine_tiny" });

  it("expands into satin columns, one group per letter", () => {
    const r = expand([text], { preset: PRESETS.pique, fonts });
    expect(r.objects.length).toBeGreaterThanOrEqual(5);
    expect(r.objects.some((o) => o.type === "satin")).toBe(true);
    expect(r.warnings.map((w) => w.code)).not.toContain("UNSUPPORTED_GLYPH");
    expect(r.warnings.map((w) => w.code)).not.toContain("TEXT_TOO_SMALL");
  });

  it("stands 8 mm tall and reads left to right", () => {
    const r = expand([text], { preset: PRESETS.pique, fonts });
    const pts = r.objects.flatMap((o) =>
      o.type === "satin" ? [...(o as SatinObject).railA, ...(o as SatinObject).railB] : [],
    );
    const ys = pts.map((p) => p.y);
    // Cap height 8 mm below the origin at y = 30.
    expect(Math.max(...ys)).toBeCloseTo(30, 0);
    expect(Math.min(...ys)).toBeCloseTo(22, 0);
    const xs = pts.map((p) => p.x);
    // Five letters of caffeine_tiny at 8 mm: roughly 30 mm of line.
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(20);
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(45);
  });

  it("gives a plausible stitch count and no stitch over 1,5 x the length", () => {
    const plan = planDesign(design([text]), { fonts });
    // A 30 x 8 mm satin line at 0,38 mm spacing: a few thousand stitches.
    expect(plan.stats.stitches).toBeGreaterThan(800);
    expect(plan.stats.stitches).toBeLessThan(6000);
    // Measured along the needle path: a jump or a trim breaks the run, so two
    // stitches on either side of one are not a stitch.
    let worst = 0;
    let prev: { x: number; y: number } | undefined;
    for (const s of plan.blocks.flatMap((b) => b.stitches)) {
      if (s.cmd !== "stitch") {
        prev = undefined;
        continue;
      }
      if (prev) worst = Math.max(worst, dist(prev, s));
      prev = s;
    }
    expect(worst).toBeLessThanOrEqual(MAX_STITCH_MM);
  });

  it("warns below the minimum height of the font", () => {
    const tiny = textObject(
      "t",
      "TEXMA",
      { x: 0, y: 30 },
      { heightMm: 2, fontId: "caffeine_tiny" },
    );
    const r = expand([tiny], { preset: PRESETS.pique, fonts });
    expect(r.warnings.map((w) => w.code)).toContain("TEXT_TOO_SMALL");
  });
});
