import { beforeAll, describe, expect, it } from "vitest";
import type { Polygon } from "@texma-stitch/geometry";
import { initGeometry } from "@texma-stitch/geometry";
import { GLYPHS } from "../../test/fixtures/glyphs.js";
import { polygonOf, pt, rect } from "../../test/fixtures/shapes.js";
import type { ImportedShape } from "../import/svg.js";
import { PRESETS } from "../presets.js";
import { satinColumns } from "./columns.js";
import {
  buildInkstitchTemplate,
  CENTER_WALK_STITCH_MM,
  joinLines,
  SATIN_SPLIT_MM,
  satinColumnAttributes,
  satinColumnD,
  satinPullCompMm,
  UNDERLAY_WIDE_FROM_MM,
} from "./template.js";
import type { TemplateResult } from "./template.js";

beforeAll(async () => {
  await initGeometry();
});

const pique = PRESETS.pique;
const PAGE = { widthMm: 200, heightMm: 30 };

const moved = (poly: Polygon, dx: number): Polygon => ({
  outer: poly.outer.map((p) => pt(p.x + dx, p.y + 2)),
  holes: poly.holes.map((h) => h.map((p) => pt(p.x + dx, p.y + 2))),
});
const area = (id: string, polygon: Polygon, color = "#1f3a93"): ImportedShape => ({
  kind: "area",
  id,
  polygon,
  color,
  attrs: {},
  trimAfter: "auto",
});

describe("satinPullCompMm (spec §7.2)", () => {
  it("is a share of the width, between the floor and the lid", () => {
    expect(satinPullCompMm(1, pique)).toBe(pique.pullCompMinMm);
    expect(satinPullCompMm(2.5, pique)).toBeCloseTo(0.3, 6);
    expect(satinPullCompMm(5, pique)).toBe(pique.pullCompMaxMm);
  });
});

describe("satinColumnAttributes", () => {
  it("sets a narrow column on a centre walk (spec §7.6)", () => {
    const a = satinColumnAttributes(2, pique);
    expect(a).toMatchObject({
      satin_column: "true",
      zigzag_spacing_mm: String(pique.satinSpacingMm),
      pull_compensation_mm: "0.24",
      max_stitch_length_mm: String(SATIN_SPLIT_MM),
      center_walk_underlay: "true",
      center_walk_underlay_stitch_length_mm: String(CENTER_WALK_STITCH_MM),
    });
    expect(a).not.toHaveProperty("contour_underlay");
  });

  it("sets a wide column on contour and zigzag underlay", () => {
    const a = satinColumnAttributes(UNDERLAY_WIDE_FROM_MM, pique);
    expect(a).toMatchObject({
      contour_underlay: "true",
      contour_underlay_inset_mm: String(pique.satinUnderlay.insetMm),
      zigzag_underlay: "true",
      zigzag_underlay_spacing_mm: String(pique.satinUnderlay.zigzagSpacingMm),
    });
    expect(a).not.toHaveProperty("center_walk_underlay");
  });
});

describe("satinColumnD", () => {
  it("writes both rails, then every rung, each as its own sub-path", () => {
    const column = satinColumns(GLYPHS.T!, { underlapMm: 0.2, idPrefix: "T" }).columns[0]!;
    const d = satinColumnD(column);
    expect(d.match(/M /g)).toHaveLength(2 + column.rungs.length);
    expect(d.startsWith(`M ${column.railA[0]!.x}`)).toBe(true);
  });
});

describe("joinLines", () => {
  it("joins lines whose ends meet into one, turning them round as needed", () => {
    const a = [pt(0, 0), pt(1, 1)];
    const b = [pt(2, 0), pt(1.05, 1)]; // meets a's end with its end
    const c = [pt(2.05, 0), pt(3, 1)]; // meets b's start with its start
    const far = [pt(10, 10), pt(11, 11)];
    const joined = joinLines([a, b, c, far], 0.2);
    expect(joined).toHaveLength(2);
    expect(joined[0]).toEqual([pt(0, 0), pt(1, 1), pt(1.05, 1), pt(2, 0), pt(2.05, 0), pt(3, 1)]);
    expect(joined[1]).toEqual(far);
  });
});

describe("buildInkstitchTemplate", () => {
  const shapes: ImportedShape[] = [
    area("letter-T", moved(GLYPHS.T!, 0)),
    area("letter-L", moved(GLYPHS.L!, 12)),
    area("hairline", polygonOf(rect(30, 2, 20, 0.5))),
    area("block", polygonOf(rect(60, 2, 20, 20))),
    area("letter-O", moved(GLYPHS.O!, 90)),
    area("letter-S", moved(GLYPHS.S!, 110), "#c8102e"),
    {
      kind: "line",
      id: "rule:1",
      polyline: [pt(0, 25), pt(100, 25)],
      closed: false,
      color: "#101820",
      attrs: {},
      trimAfter: "auto",
    },
    {
      kind: "line",
      id: "guide",
      polyline: [pt(0, 28), pt(100, 28)],
      closed: false,
      color: undefined,
      attrs: {},
      trimAfter: "auto",
    },
  ];
  let t: TemplateResult;
  beforeAll(() => {
    t = buildInkstitchTemplate(shapes, pique, PAGE);
  });

  it("sets every shape as what its width makes it, in document order", () => {
    expect(t.objects.map((o) => [o.shapeId, o.kind])).toEqual([
      ["letter-T", "satin"],
      ["letter-L", "satin"],
      ["hairline", "running"],
      ["block", "tatami"],
      ["letter-O", "satin"],
      ["letter-S", "satin"],
      ["rule:1", "running"],
    ]);
    const hairline = t.objects.find((o) => o.shapeId === "hairline")!;
    expect(hairline).toMatchObject({ kind: "running" });
    expect(t.svg).not.toContain("bean_stitch_repeats");
    // A straight hairline is one straight line, not every wobble of its axis.
    const d = /<path id="hairline" d="([^"]*)"/.exec(t.svg)![1]!;
    expect(d.split(" L ").length).toBeLessThanOrEqual(3);
  });

  it("writes native satin columns with the preset's parameters", () => {
    expect(t.svg).toContain('xmlns:inkstitch="http://inkstitch.org/namespace"');
    expect(t.svg).toContain('width="200mm" height="30mm" viewBox="0 0 200 30"');
    const columns = t.svg.match(/<path id="letter-T-\d+"[^>]*>/g)!;
    expect(columns).toHaveLength(2);
    for (const c of columns) {
      expect(c).toContain('inkstitch:satin_column="true"');
      expect(c).toContain(`inkstitch:zigzag_spacing_mm="${pique.satinSpacingMm}"`);
      expect(c).toContain("stroke:#1f3a93");
    }
    expect(t.svg).toMatch(/<path id="block"[^>]*fill:#1f3a93[^>]*inkstitch:row_spacing_mm="0.4"/);
    expect(t.svg).toMatch(/<path id="hairline"[^>]*inkstitch:stroke_method="running_stitch"/);
    expect(t.svg).toMatch(/<path id="hairline"[^>]*inkstitch:running_stitch_length_mm="2"/);
    expect(t.svg).toMatch(/<path id="rule_1"[^>]*inkstitch:stroke_method="running_stitch"/);
  });

  it("makes XML ids of split-path ids and skips unpainted lines", () => {
    expect(t.svg).toContain('id="rule_1"');
    expect(t.objects.find((o) => o.shapeId === "rule:1")!.id).toBe("rule_1");
    expect(t.svg).not.toContain("guide");
  });

  it("routes neighbouring same-coloured satin in runs, broken by other objects and colours", () => {
    const ids = (shape: string): string[] => {
      const o = t.objects.find((x) => x.shapeId === shape)!;
      return o.kind === "satin" ? o.columnIds : [];
    };
    expect(t.satinRuns).toEqual([
      [...ids("letter-T"), ...ids("letter-L")],
      ids("letter-O"),
      ids("letter-S"),
    ]);
  });

  it("gives the reason when a shape meant for satin stays tatami", () => {
    // Satin by its width, but a square dot has no stroke to set a column along.
    const dot = area("dot", polygonOf(rect(5, 5, 3, 3)));
    const r = buildInkstitchTemplate([dot], pique, PAGE);
    expect(r.objects).toEqual([
      { id: "dot", kind: "tatami", shapeId: "dot", color: "#1f3a93", reason: "no stroke found" },
    ]);
    expect(r.satinRuns).toEqual([]);
    expect(r.warnings.some((w) => w.objectId === "dot" && w.code === "AUTOSATIN_MIXED")).toBe(true);
  });
});
