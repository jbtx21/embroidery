import { beforeAll, describe, expect, it } from "vitest";
import { initGeometry } from "@texma-stitch/geometry";
import { fontRegistry } from "@texma-stitch/fonts";
import { circle, polygonOf, pt, rect } from "../test/fixtures/shapes.js";
import {
  design,
  fillObject,
  runningObject,
  satinObject,
  textObject,
} from "../test/fixtures/designs.js";
import { TEST_FONT } from "../test/fixtures/font.js";
import { selfIntersects, validate } from "./validate.js";
import { expand } from "./expand.js";
import { stableHash } from "./hash.js";
import { createCache, generateObject, planDesign } from "./pipeline.js";
import { PRESETS } from "./presets.js";
import type { SatinObject } from "./types.js";

beforeAll(async () => {
  await initGeometry();
});

describe("validate", () => {
  it("detects self-intersection", () => {
    expect(selfIntersects([pt(0, 0), pt(10, 10), pt(10, 0), pt(0, 10)])).toBe(true);
    expect(selfIntersects([pt(0, 0), pt(10, 0), pt(10, 10)])).toBe(false);
  });

  it("allows a closed ring to touch itself at the seam", () => {
    expect(selfIntersects([pt(0, 0), pt(10, 0), pt(10, 10), pt(0, 10), pt(0, 0)])).toBe(false);
  });

  it("reports a missing thread and skips the object", () => {
    const v = validate(design([runningObject("r", [pt(0, 0), pt(10, 0)], { threadIndex: 7 })]));
    expect(v.objects).toHaveLength(0);
    expect(v.warnings[0]!.code).toBe("THREAD_MISSING");
    expect(v.warnings[0]!.severity).toBe("error");
  });

  it("stitches every piece of a self-intersecting area instead of guessing one", () => {
    const eight = polygonOf([pt(0, 0), pt(10, 10), pt(10, 0), pt(0, 10)]);
    const v = validate(design([fillObject("f", eight)]));
    expect(v.objects).toHaveLength(2);
    expect(v.objects.map((o) => o.id)).toEqual(["f#0", "f#1"]);
    expect(v.warnings.find((w) => w.code === "INVALID_GEOMETRY")?.severity).toBe("info");
  });

  it("errors on a degenerate area", () => {
    const v = validate(design([fillObject("f", polygonOf([pt(0, 0), pt(1, 0), pt(2, 0)]))]));
    expect(v.objects).toHaveLength(0);
    expect(v.warnings[0]!.severity).toBe("error");
  });

  it("warns about self-intersecting rails but keeps the object", () => {
    const v = validate(
      design([
        satinObject("s", [pt(0, 0), pt(10, 10), pt(10, 0), pt(0, 10)], [pt(0, 12), pt(10, 12)]),
      ]),
    );
    expect(v.objects).toHaveLength(1);
    expect(v.warnings.map((w) => w.code)).toContain("SELF_INTERSECTING_RAILS");
  });

  it("skips invisible and empty objects", () => {
    expect(
      validate(design([runningObject("r", [pt(0, 0), pt(10, 0)], { visible: false })])).objects,
    ).toHaveLength(0);
    expect(validate(design([runningObject("r", [pt(1, 1)])])).objects).toHaveLength(0);
    expect(validate(design([textObject("t", "   ", pt(0, 0))])).objects).toHaveLength(0);
  });
});

describe("text (spec §9)", () => {
  const fonts = fontRegistry([TEST_FONT]);

  it("expands letters into satin columns", () => {
    const r = expand([textObject("t", "II", pt(0, 20))], { preset: PRESETS.pique, fonts });
    expect(r.objects).toHaveLength(2);
    expect(r.objects[0]!.type).toBe("satin");
    const a = r.objects[0]! as SatinObject;
    const b = r.objects[1]! as SatinObject;
    expect(b.railA[0]!.x).toBeGreaterThan(a.railA[0]!.x);
    // Height 10 mm: a cap height of 1.0 runs from y=20 to y=10
    expect(a.railA[1]!.y).toBeCloseTo(10, 6);
  });

  it("applies kerning and letter spacing", () => {
    const tight = expand([textObject("t", "II", pt(0, 0), { letterSpacing: 0 })], {
      preset: PRESETS.pique,
      fonts,
    });
    const loose = expand([textObject("t", "II", pt(0, 0), { letterSpacing: 0.5 })], {
      preset: PRESETS.pique,
      fonts,
    });
    const x = (r: { objects: unknown[] }, i: number) => (r.objects[i] as SatinObject).railA[0]!.x;
    expect(x(loose, 1)).toBeGreaterThan(x(tight, 1));
  });

  it("makes running stitches from stroke glyphs", () => {
    const r = expand([textObject("t", ".", pt(0, 0))], { preset: PRESETS.pique, fonts });
    expect(r.objects[0]!.type).toBe("running");
  });

  it("advances over a space and cuts between words", () => {
    const r = expand([textObject("t", "I I", pt(0, 0))], { preset: PRESETS.pique, fonts });
    expect(r.objects).toHaveLength(2);
    expect(r.objects[0]!.trimAfter).toBe("always");
  });

  it("places text along a path", () => {
    const straight = expand([textObject("t", "I", pt(0, 0))], { preset: PRESETS.pique, fonts });
    const curved = expand([textObject("t", "I", pt(0, 0), { onPath: [pt(0, 50), pt(50, 50)] })], {
      preset: PRESETS.pique,
      fonts,
    });
    expect((curved.objects[0] as SatinObject).railA[0]!.y).not.toBeCloseTo(
      (straight.objects[0] as SatinObject).railA[0]!.y,
      3,
    );
  });

  it("warns below the minimum height", () => {
    const r = expand([textObject("t", "I", pt(0, 0), { heightMm: 3 })], {
      preset: PRESETS.pique,
      fonts,
    });
    expect(r.warnings.map((w) => w.code)).toContain("TEXT_TOO_SMALL");
  });

  it("names an unknown glyph instead of dropping it silently", () => {
    const r = expand([textObject("t", "IX", pt(0, 0))], { preset: PRESETS.pique, fonts });
    expect(r.warnings.map((w) => w.code)).toContain("UNSUPPORTED_GLYPH");
    expect(r.objects).toHaveLength(1);
  });

  it("reports a missing font rather than stitching nothing", () => {
    const r = expand([textObject("t", "I", pt(0, 0), { fontId: "nope" })], {
      preset: PRESETS.pique,
      fonts,
    });
    expect(r.objects).toHaveLength(0);
    expect(r.warnings[0]!.code).toBe("FONT_MISSING");
    expect(r.warnings[0]!.severity).toBe("error");
  });

  it("passes other objects through untouched", () => {
    const obj = runningObject("r", [pt(0, 0), pt(1, 0)]);
    expect(expand([obj], { preset: PRESETS.pique }).objects[0]).toBe(obj);
  });
});

describe("hash (spec §4)", () => {
  it("is stable and reacts to changes", () => {
    const a = fillObject("f", polygonOf(rect(0, 0, 10, 10)));
    const b = fillObject("f", polygonOf(rect(0, 0, 10, 10)));
    expect(stableHash(a, "pique")).toBe(stableHash(b, "pique"));
    expect(stableHash(a, "pique")).not.toBe(stableHash(a, "fleece"));
    expect(stableHash(a, "pique")).not.toBe(stableHash({ ...a, rowSpacingMm: 0.3 }, "pique"));
  });

  it("ignores key order and undefined values", () => {
    expect(stableHash({ a: 1, b: 2 })).toBe(stableHash({ b: 2, a: 1 }));
    expect(stableHash({ a: 1, b: undefined })).toBe(stableHash({ a: 1 }));
  });

  it("survives non-finite numbers", () => {
    expect(stableHash({ a: Number.NaN })).toBe(stableHash({ a: null }));
  });
});

describe("generateObject", () => {
  it("handles every object type", () => {
    expect(generateObject(runningObject("r", [pt(0, 0), pt(10, 0)])).points.length).toBeGreaterThan(
      1,
    );
    expect(
      generateObject(satinObject("s", [pt(0, 0), pt(10, 0)], [pt(0, 3), pt(10, 3)])).points.length,
    ).toBeGreaterThan(1);
    expect(
      generateObject(fillObject("f", polygonOf(rect(0, 0, 10, 10)))).points.length,
    ).toBeGreaterThan(1);
  });

  it("calls out text that was not expanded", () => {
    const r = generateObject(textObject("t", "I", pt(0, 0)));
    expect(r.points).toHaveLength(0);
    expect(r.warnings[0]!.code).toBe("NOT_IMPLEMENTED");
  });
});

describe("pipeline (spec §4)", () => {
  it("plans a design all the way to the stitch plan", () => {
    const plan = planDesign(
      design([
        fillObject("f", polygonOf(rect(0, 0, 20, 20))),
        satinObject("s", [pt(30, 0), pt(30, 20)], [pt(34, 0), pt(34, 20)], { threadIndex: 1 }),
      ]),
    );
    expect(plan.blocks).toHaveLength(2);
    expect(plan.stats.stitches).toBeGreaterThan(500);
    expect(plan.stats.colorChanges).toBe(1);
    const all = plan.blocks.flatMap((b) => b.stitches);
    expect(all[all.length - 1]!.cmd).toBe("end");

    let vx = all[0]!.x;
    let vy = all[0]!.y;
    for (const s of all.slice(1)) {
      if (s.cmd === "stitch" || s.cmd === "jump") {
        expect(Math.hypot(s.x - vx, s.y - vy)).toBeLessThanOrEqual(12.1 + 1e-6);
      }
      vx = s.x;
      vy = s.y;
    }
  });

  it("is deterministic", () => {
    const d = design([fillObject("f", polygonOf(circle(10, 10, 8)))]);
    expect(JSON.stringify(planDesign(d).blocks)).toBe(JSON.stringify(planDesign(d).blocks));
  });

  it("takes the auto order when asked", () => {
    const d = design([
      runningObject("outline", [pt(0, 0), pt(10, 0)]),
      fillObject("area", polygonOf(rect(0, 0, 10, 10))),
    ]);
    expect(planDesign(d, { order: "auto" }).blocks.map((b) => b.objectId)).toEqual([
      "area",
      "outline",
    ]);
    expect(planDesign(d).blocks.map((b) => b.objectId)).toEqual(["outline", "area"]);
  });

  it("uses the cache for unchanged objects", () => {
    const cache = createCache();
    const d = design([fillObject("f", polygonOf(rect(0, 0, 20, 20)))]);
    expect(planDesign(d, { cache }).stats.stitches).toBe(planDesign(d, { cache }).stats.stitches);
  });

  it("returns an empty plan for an empty design", () => {
    const plan = planDesign(design([]));
    expect(plan.blocks).toHaveLength(0);
    expect(plan.stats.stitches).toBe(0);
  });

  it("expands text when a font is supplied", () => {
    const plan = planDesign(design([textObject("t", "II", pt(0, 20))]), {
      fonts: fontRegistry([TEST_FONT]),
    });
    expect(plan.blocks.length).toBeGreaterThan(0);
    expect(plan.stats.stitches).toBeGreaterThan(10);
  });
});
