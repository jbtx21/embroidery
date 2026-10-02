import { beforeAll, describe, expect, it } from "vitest";
import { initGeometry, orient, pointInPolygon, polygonArea } from "@texma-stitch/geometry";
import { scaledAt, svgOf } from "../../test/fixtures/gate.js";
import { areaShape, polygonOf, pt, rect } from "../../test/fixtures/shapes.js";
import {
  BLACK,
  BROWN,
  counterBlock,
  crownBand,
  debrisHole,
  grainBar,
  partAt,
  satinGrainBar,
  splinterScene,
  squareHole,
  WHITE,
} from "../../test/fixtures/texture.js";
import { classifyShape } from "../inkstitch/classify.js";
import { buildInkstitchTemplate } from "../inkstitch/template.js";
import { findMinimumSize } from "../inkstitch/min-size-search.js";
import { PRESETS } from "../presets.js";
import { WARNING } from "../warnings.js";
import type { ImportedAreaShape, ImportedShape } from "./svg.js";
import { importShapes, medianShapeWidthMm } from "./svg.js";
import {
  cleanTexture,
  SPECK_MAX_MM2,
  SPLINTER_MAX_MM2,
  SPLINTER_REACH_MM,
  TEXTURE_EVIDENCE_HOLES,
  TEXTURE_EVIDENCE_MAX_MM2,
  TEXTURE_EVIDENCE_MIN_MM2,
  TEXTURE_HOLE_MAX_MM2,
} from "./texture.js";

beforeAll(async () => {
  await initGeometry();
});

const area = (s: ImportedShape): ImportedAreaShape => {
  if (s.kind !== "area") throw new Error("area expected");
  return s;
};
const byId = (shapes: { id: string }[], id: string) => shapes.find((s) => s.id === id);

/** A bar of `w` × 1.6 mm with `n` grains of `grainMm2`, starting at (x, y). */
const bar = (id: string, n: number, y = 0, x = 0, w = 30, grainMm2 = 0.02) =>
  areaShape(id, grainBar(w, 1.6, n, grainMm2, x, y), WHITE);

describe("the limits (spec §5.3)", () => {
  it("are the ones the spec names", () => {
    expect(TEXTURE_EVIDENCE_MIN_MM2).toBe(0.001);
    expect(TEXTURE_EVIDENCE_MAX_MM2).toBe(0.05);
    expect(TEXTURE_EVIDENCE_HOLES).toBe(3);
    expect(TEXTURE_HOLE_MAX_MM2).toBe(0.5);
    expect(SPECK_MAX_MM2).toBe(0.05);
    expect(SPLINTER_MAX_MM2).toBe(4);
    expect(SPLINTER_REACH_MM).toBe(0.4);
  });
});

describe("cleanTexture — evidence and holes (spec §5.3, steps 1 and 2)", () => {
  it("fills every hole under 0.5 mm² of a shape that carries grains, and no larger one", () => {
    // 100 grains of 0.02 mm², one hole of 0.3 mm², one drawn counter of 3 mm².
    const polygon = grainBar(30, 6, 100, 0.02, 0, 0, 20);
    polygon.holes.push(squareHole(23, 3, 0.3), squareHole(27, 3, 3));
    const input = [areaShape("letter", polygon, WHITE)];
    const out = cleanTexture(input);
    const letter = area(out.shapes[0]!);
    expect(letter.polygon.holes).toHaveLength(1);
    expect(polygonArea({ outer: letter.polygon.holes[0]!, holes: [] })).toBeCloseTo(3, 6);
    expect(out.report.textured).toEqual([{ id: "letter", grains: 100 }]);
    expect(out.report.holes.filled).toBe(101);
    expect(out.report.holes.areaMm2).toBeCloseTo(100 * 0.02 + 0.3, 6);
    // the material grew by exactly what the holes took
    expect(polygonArea(letter.polygon)).toBeCloseTo(30 * 6 - 3, 6);
  });

  it("leaves a shape with fewer than three grains alone", () => {
    const input = [bar("zwei", 2)];
    input[0]!.polygon.holes.push(squareHole(20, 0.8, 0.3));
    const out = cleanTexture(input);
    expect(out.shapes[0]).toBe(input[0]);
    expect(out.report.textured).toEqual([]);
    expect(out.warnings).toEqual([]);
  });

  it("does not count rounding debris as grains: a ring of 5·10⁻⁶ mm² is none", () => {
    const polygon = polygonOf(rect(0, 0, 30, 6), [
      ...Array.from({ length: 40 }, (_, i) => debrisHole(1 + i * 0.7, 3)),
      squareHole(15, 1, 0.3),
    ]);
    const input = [areaShape("rest", polygon, WHITE)];
    const out = cleanTexture(input);
    expect(out.shapes[0]).toBe(input[0]);
    expect(out.report.textured).toEqual([]);
  });

  it("counts a hole from 0.001 mm² up to, but not including, 0.05 mm²", () => {
    const withGrains = (a: number) =>
      areaShape(
        "g",
        polygonOf(rect(0, 0, 20, 6), [
          squareHole(3, 3, a),
          squareHole(6, 3, a),
          squareHole(9, 3, a),
        ]),
        WHITE,
      );
    expect(cleanTexture([withGrains(0.0011)]).report.textured).toHaveLength(1);
    expect(cleanTexture([withGrains(0.049)]).report.textured).toHaveLength(1);
    expect(cleanTexture([withGrains(0.0009)]).report.textured).toHaveLength(0);
    expect(cleanTexture([withGrains(0.0501)]).report.textured).toHaveLength(0);
  });

  it("leaves the drawn holes of a crown band: every one is above 0.05 mm²", () => {
    const input = [areaShape("band", crownBand(), "#f0060b")];
    const out = cleanTexture(input);
    expect(out.shapes[0]).toBe(input[0]);
    expect(out.report.textured).toEqual([]);
  });

  it("leaves the counters of small lettering: a shape with holes of 0.3 and 0.4 mm² and no grain", () => {
    const input = [areaShape("zeichen", counterBlock(), "#bebebe")];
    const out = cleanTexture(input);
    expect(out.shapes[0]).toBe(input[0]);
    expect(area(out.shapes[0]!).polygon.holes).toHaveLength(3);
  });

  it("does not spread by neighbourhood: a clean shape beside a textured one is left alone", () => {
    const input = [bar("textur", 40), areaShape("sauber", counterBlock(), WHITE)];
    const out = cleanTexture(input);
    expect(out.shapes[1]).toBe(input[1]);
  });
});

describe("cleanTexture — specks (step 3)", () => {
  it("drops every part under 0.05 mm² and reports what it took", () => {
    const out = cleanTexture(splinterScene());
    expect(byId(out.shapes, "speck")).toBeUndefined();
    expect(byId(out.shapes, "speck-tiny")).toBeUndefined();
    expect(out.report.specks.dropped).toBe(2);
    expect(out.report.specks.ids).toEqual(["speck", "speck-tiny"]);
    expect(out.report.specks.areaMm2).toBeCloseTo(0.05, 6);
    expect(out.report.specks.largestMm2).toBeCloseTo(0.04, 6);
  });

  it("keeps a part from 0.05 mm² up: the small pieces of an eye are drawing", () => {
    const out = cleanTexture(splinterScene());
    expect(byId(out.shapes, "eye")).toBeDefined();
  });

  it("drops a speck in any colour and any scene — and leaves the clean shape beside it as it was", () => {
    const clean = areaShape("sauber", counterBlock(), BLACK);
    const input = [areaShape("staub", partAt(0, 0, 0.2, 0.2), BROWN), clean];
    const out = cleanTexture(input);
    expect(out.shapes).toHaveLength(1);
    expect(out.shapes[0]).toBe(clean);
    expect(out.report.specks.dropped).toBe(1);
  });

  it("measures a part by its material after the holes are filled: 0.048 mm² raw, 0.06 mm² filled", () => {
    // 0.2 × 0.3 mm with three grains of 0.004 mm²: raw 0.048 mm² of material, under the limit; the grains
    // are texture (three of them, from 0.001 mm²), so the part is judged as 0.06 mm² and stays
    const part = areaShape(
      "klein",
      polygonOf(rect(0, 0, 0.2, 0.3), [
        squareHole(0.1, 0.07, 0.004),
        squareHole(0.1, 0.15, 0.004),
        squareHole(0.1, 0.23, 0.004),
      ]),
      WHITE,
    );
    const out = cleanTexture([part]);
    expect(out.shapes).toHaveLength(1);
    expect(out.report.specks.dropped).toBe(0);
    expect(area(out.shapes[0]!).polygon.holes).toHaveLength(0);
  });
});

describe("cleanTexture — splinters (step 4)", () => {
  it("closes a splinter 0.15 mm off a textured bar into it, bridge included", () => {
    const out = cleanTexture(splinterScene());
    expect(byId(out.shapes, "splinter")).toBeUndefined();
    const merged = area(byId(out.shapes, "bar")!);
    // the bar with its holes filled is 48 mm²; the splinter (0.8) and the chain (0.36) come with the
    // two gaps between them (about 1.0 × 0.15 and 0.6 × 0.3 mm²)
    expect(polygonArea(merged.polygon)).toBeGreaterThan(48 + 0.8 + 0.36 + 0.15 + 0.18 - 0.1);
    expect(polygonArea(merged.polygon)).toBeLessThan(48 + 0.8 + 0.36 + 0.15 + 0.18 + 0.1);
    // one piece: where the splinter was, and the gap to the bar, are material of the bar now
    expect(pointInPolygon(merged.polygon, pt(3.5, 2.2))).toBe(true);
    expect(pointInPolygon(merged.polygon, pt(3.5, 1.67))).toBe(true);
  });

  it("follows a chain: a part within reach of the splinter, not of the bar", () => {
    const out = cleanTexture(splinterScene());
    expect(byId(out.shapes, "chain")).toBeUndefined();
    const merged = area(byId(out.shapes, "bar")!);
    expect(pointInPolygon(merged.polygon, pt(3.3, 3.15))).toBe(true);
    expect(out.report.splinters.merged).toBe(2);
    expect(out.report.splinters.areaMm2).toBeCloseTo(0.8 + 0.36, 6);
    expect(out.report.splinters.into).toEqual([{ id: "bar", merged: ["splinter", "chain"] }]);
  });

  it("leaves a part beyond the reach: an i-dot 0.66 mm off its stem", () => {
    const input = splinterScene();
    const out = cleanTexture(input);
    expect(byId(out.shapes, "dot")).toBe(byId(input, "dot"));
  });

  it("leaves a part that lies on another colour", () => {
    const input = splinterScene();
    const out = cleanTexture(input);
    expect(byId(out.shapes, "on-brown")).toBe(byId(input, "on-brown"));
    expect(byId(out.shapes, "brown")).toBe(byId(input, "brown"));
  });

  it("leaves a part over 4 mm², however near", () => {
    const input = splinterScene();
    const out = cleanTexture(input);
    expect(byId(out.shapes, "big")).toBe(byId(input, "big"));
  });

  it("keeps the ids and the order of what is left", () => {
    const out = cleanTexture(splinterScene());
    expect(out.shapes.map((s) => s.id)).toEqual(["bar", "dot", "brown", "on-brown", "big", "eye"]);
  });

  it("closes only the gap: a notch of the bar beyond the splinter's reach stays open", () => {
    // a bar with a notch 0.2 mm wide and 0.8 mm deep cut up from its lower edge, 0.5 mm beyond the
    // splinter's end: a closing of the whole bar would fill it (it is narrower than twice the half reach)
    const withNotch = polygonOf(
      orient(
        [
          pt(0, 0),
          pt(30, 0),
          pt(30, 1.6),
          pt(4.7, 1.6),
          pt(4.7, 0.8),
          pt(4.5, 0.8),
          pt(4.5, 1.6),
          pt(0, 1.6),
        ],
        true,
      ),
      grainBar(20, 1.6, 6, 0.02, 8, 0).holes,
    );
    const input = [
      areaShape("bar", withNotch, WHITE),
      areaShape("splitter", partAt(3, 1.75, 1.0, 0.8), WHITE),
    ];
    const out = cleanTexture(input);
    expect(out.shapes).toHaveLength(1);
    const merged = area(out.shapes[0]!);
    expect(pointInPolygon(merged.polygon, pt(3.5, 1.67))).toBe(true);
    expect(pointInPolygon(merged.polygon, pt(4.6, 1.2))).toBe(false);
    expect(pointInPolygon(merged.polygon, pt(4.6, 1.55))).toBe(false);
  });

  it("goes into the nearer of two textured shapes", () => {
    // A ends at y = 1.6, the splinter spans y = 1.8 to 2.6 (0.2 below A), B starts at y = 2.9 (0.3 below it)
    const a = bar("a", 40, 0);
    const b = bar("b", 40, 2.9);
    const splinter = areaShape("s", partAt(5, 1.8, 1.0, 0.8), WHITE);
    const out = cleanTexture([a, splinter, b]);
    expect(out.shapes.map((s) => s.id)).toEqual(["a", "b"]);
    expect(out.report.splinters.into).toEqual([{ id: "a", merged: ["s"] }]);
    // B kept its own outline: its area is the plain bar
    expect(polygonArea(area(out.shapes[1]!).polygon)).toBeCloseTo(30 * 1.6, 6);
  });

  it("takes a small textured shape into a larger textured one", () => {
    const small = areaShape(
      "klein",
      polygonOf(rect(5, 1.8, 1.4, 0.9), [
        squareHole(5.5, 2.2, 0.02),
        squareHole(5.9, 2.2, 0.02),
        squareHole(6.3, 2.2, 0.02),
      ]),
      WHITE,
    );
    const out = cleanTexture([bar("gross", 40, 0), small]);
    expect(out.shapes.map((s) => s.id)).toEqual(["gross"]);
    expect(area(out.shapes[0]!).polygon.holes).toHaveLength(0);
  });

  it("leaves a splinter beside a shape without evidence (the six logos without texture)", () => {
    const clean = areaShape("sauber", polygonOf(rect(0, 0, 30, 1.6)), WHITE);
    const part = areaShape("teil", partAt(3, 1.75, 1.0, 0.8), WHITE);
    const out = cleanTexture([clean, part]);
    expect(out.shapes[0]).toBe(clean);
    expect(out.shapes[1]).toBe(part);
  });

  it("does not take a part larger than the shape", () => {
    const small = areaShape(
      "klein",
      polygonOf(rect(0, 0, 1.2, 1.2), [
        squareHole(0.3, 0.6, 0.02),
        squareHole(0.6, 0.6, 0.02),
        squareHole(0.9, 0.6, 0.02),
      ]),
      WHITE,
    );
    const larger = areaShape("groesser", partAt(0, 1.4, 2, 1.5), WHITE);
    const out = cleanTexture([small, larger]);
    expect(out.shapes.map((s) => s.id)).toEqual(["klein", "groesser"]);
    expect(out.shapes[1]).toBe(larger);
  });
});

describe("cleanTexture — the ordered size decides (spec §5.3)", () => {
  it("decides the same at another size when told the ratio: areas by λ², lengths by λ", () => {
    const base = cleanTexture(splinterScene());
    const large = cleanTexture(scaledAt(splinterScene(), 80)(240), { scale: 3 });
    expect(large.shapes.map((s) => s.id)).toEqual(base.shapes.map((s) => s.id));
    expect(large.report.holes.filled).toBe(base.report.holes.filled);
    expect(large.report.specks.ids).toEqual(base.report.specks.ids);
    expect(large.report.splinters.into).toEqual(base.report.splinters.into);
    expect(large.report.scale).toBe(3);
    expect(large.report.limits.speckMm2).toBeCloseTo(SPECK_MAX_MM2 * 9, 9);
  });

  it("with the thresholds fixed, the same grains at three times the size are no grains any more", () => {
    const large = scaledAt(splinterScene(), 80)(240);
    const out = cleanTexture(large);
    expect(out.report.textured).toEqual([]);
    expect(out.shapes[0]).toBe(large[0]);
  });

  it("lets the gate see the bar as it is: 80 mm holds where the raw bar asks for 113 mm", () => {
    const raw = [areaShape("strich", satinGrainBar(), WHITE)];
    expect(medianShapeWidthMm(raw[0]!.polygon)).toBeLessThan(1.0);
    const rawSearch = findMinimumSize(scaledAt(raw, 80), { orderedWidthMm: 80 });
    expect(rawSearch.enlarged).toBe(true);
    expect(rawSearch.widthMm).toBeGreaterThan(100);

    const cleanedAt = (w: number) => cleanTexture(scaledAt(raw, 80)(w), { scale: w / 80 }).shapes;
    const search = findMinimumSize(cleanedAt, { orderedWidthMm: 80 });
    expect(search.found).toBe(true);
    expect(search.enlarged).toBe(false);
    expect(search.widthMm).toBe(80);
  });
});

describe("cleanTexture — what the cleaning is for", () => {
  it("makes a letter stroke read as wide as it is: 0.58 mm raw is a running stitch, 1.6 mm cleaned a satin", () => {
    const raw = grainBar();
    expect(classifyShape(raw).shapeClass).toBe("running");
    const out = cleanTexture([areaShape("buchstabe", raw, WHITE)]);
    const cleaned = area(out.shapes[0]!).polygon;
    expect(classifyShape(cleaned).shapeClass).toBe("satin");
    expect(medianShapeWidthMm(cleaned)).toBeGreaterThan(1.4);
  });
});

describe("cleanTexture — a plain function of its input", () => {
  it("gives the same result for the same input", () => {
    const a = JSON.stringify(cleanTexture(splinterScene()));
    const b = JSON.stringify(cleanTexture(splinterScene()));
    expect(a).toBe(b);
  });

  it("is idempotent: the cleaned shapes show no evidence and nothing to close", () => {
    const once = cleanTexture(splinterScene());
    const twice = cleanTexture(once.shapes);
    expect(twice.shapes).toHaveLength(once.shapes.length);
    twice.shapes.forEach((s, i) => expect(s).toBe(once.shapes[i]));
    expect(twice.report.textured).toEqual([]);
    expect(
      twice.report.holes.filled + twice.report.specks.dropped + twice.report.splinters.merged,
    ).toBe(0);
    expect(twice.warnings).toEqual([]);
  });

  it("returns the very shapes it did not touch", () => {
    const input = splinterScene();
    const out = cleanTexture(input);
    expect(byId(out.shapes, "eye")).toBe(byId(input, "eye"));
  });

  it("passes lines through", () => {
    const line = {
      kind: "line" as const,
      id: "linie",
      polyline: [pt(0, 0), pt(5, 0)],
      closed: false,
      color: "#000000",
      attrs: {},
      trimAfter: "auto" as const,
    };
    const out = cleanTexture([line, ...splinterScene()]);
    expect(out.shapes[0]).toBe(line);
  });

  it("rejects a ratio that is no positive number", () => {
    expect(() => cleanTexture([], { scale: 0 })).toThrow(RangeError);
    expect(() => cleanTexture([], { scale: Number.NaN })).toThrow(RangeError);
  });
});

describe("cleanTexture — the warning (rule 8: nothing is cleaned silently)", () => {
  it("names the numbers", () => {
    const { warnings } = cleanTexture(splinterScene());
    expect(warnings).toHaveLength(1);
    const w = warnings[0]!;
    expect(w.code).toBe(WARNING.IMPORT_TEXTURE_CLEANED);
    expect(w.severity).toBe("warn");
    expect(w.message).toContain("1 shape with texture");
    expect(w.message).toContain("101 holes filled");
    expect(w.message).toContain("2 parts under 0.05 mm² left out");
    expect(w.message).toContain("2 splinters closed into their shape");
  });

  it("is silent where there is nothing to clean", () => {
    const { warnings, report } = cleanTexture([areaShape("sauber", counterBlock(), BLACK)]);
    expect(warnings).toEqual([]);
    expect(report.holes.filled).toBe(0);
  });
});

describe("importShapes with the cleaning (spec §5.3, where it sits)", () => {
  const scene = splinterScene();
  const text = svgOf(scene, 40, 20);

  it("cleans what it reads and reports it: before the shapes reach anyone", () => {
    const { shapes, warnings, texture } = importShapes(text);
    expect(shapes.map((s) => s.id)).toEqual(["bar", "dot", "brown", "on-brown", "big", "eye"]);
    expect(texture?.holes.filled).toBe(101);
    expect(warnings.map((w) => w.code)).toContain(WARNING.IMPORT_TEXTURE_CLEANED);
  });

  it("can be switched off: the shapes come as drawn", () => {
    const { shapes, texture, warnings } = importShapes(text, { texture: false });
    expect(shapes).toHaveLength(scene.length);
    expect(area(shapes[0]!).polygon.holes).toHaveLength(101);
    expect(texture).toBeUndefined();
    expect(warnings).toEqual([]);
  });

  it("leaves a file without texture as it reads it: the same shapes, no warning", () => {
    const clean = svgOf(
      [areaShape("sauber", counterBlock(), BLACK), areaShape("band", crownBand(), BROWN)],
      40,
      20,
    );
    const a = importShapes(clean);
    const b = importShapes(clean, { texture: false });
    expect(a.shapes).toEqual(b.shapes);
    expect(a.warnings).toEqual([]);
  });

  it("reads a file at another size with the thresholds of the ordered one", () => {
    // the same scene three times as large: 120 mm wide. Ordered at 40 mm the grains are still grains;
    // read on its own, the 120 mm file shows grains of 0.18 mm² and no evidence.
    const large = svgOf(scaledAt(scene, 40)(120), 120, 60);
    const told = importShapes(large, { orderedWidthMm: 40 });
    const own = importShapes(large);
    expect(told.texture?.scale).toBeCloseTo(3, 9);
    expect(told.shapes.map((s) => s.id)).toEqual(["bar", "dot", "brown", "on-brown", "big", "eye"]);
    expect(own.texture?.textured).toEqual([]);
    expect(own.texture?.scale).toBe(1);
    expect(own.shapes).toHaveLength(scene.length);
  });

  it("takes the size of the file as the ordered one where none is given", () => {
    expect(importShapes(text).texture?.scale).toBe(1);
  });

  it("rejects an ordered width that is no positive number", () => {
    expect(() => importShapes(text, { orderedWidthMm: 0 })).toThrow(RangeError);
    expect(() => importShapes(text, { orderedWidthMm: -80 })).toThrow(RangeError);
  });
});

describe("what the template makes of the cleaned scene (spec §5.3: before the shapes are classified)", () => {
  // the grain bar of 30 × 1.6 mm (0.58 mm read raw), a splinter beside it and a speck far from it
  const shapes = [
    areaShape("bar", grainBar(), WHITE),
    areaShape("splinter", partAt(3, 1.75, 1.0, 0.8), WHITE),
    areaShape("speck", partAt(20, 6, 0.2, 0.2), WHITE),
  ];
  const text = svgOf(shapes, 40, 20);
  const template = (texture: boolean) =>
    buildInkstitchTemplate(importShapes(text, { texture }).shapes, PRESETS.pique, {
      widthMm: 40,
      heightMm: 20,
      order: "colour",
    });

  it("sets the bar as the satin column it is, not as a running line, and sets fewer objects", () => {
    const raw = template(false);
    const cleaned = template(true);
    // raw: the grains thin the bar to 0.58 mm, so it is a running line; the splinter is another
    // running line and the speck a tatami block of its own
    expect(
      raw.objects.map((o) => `${o.shapeId}:${o.kind}`).sort((a, b) => a.localeCompare(b)),
    ).toEqual(["bar:running", "speck:tatami", "splinter:running"]);
    expect(cleaned.objects.map((o) => `${o.shapeId}:${o.kind}`)).toEqual(["bar:satin"]);
  });
});
