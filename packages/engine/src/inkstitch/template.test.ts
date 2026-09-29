import { beforeAll, describe, expect, it } from "vitest";
import type { Polygon, Polyline } from "@texma-stitch/geometry";
import { initGeometry, offsetDirectional, polygonArea } from "@texma-stitch/geometry";
import { GLYPHS } from "../../test/fixtures/glyphs.js";
import {
  annulus,
  HAIRLINE_H,
  HOLED_BAR,
  hourglass,
  polygonOf,
  pt,
  rect,
  U_SHAPE,
} from "../../test/fixtures/shapes.js";
import type { ImportedShape } from "../import/svg.js";
import { bestFillAngle } from "../fill.js";
import { DEFAULT_ANGLE_DEG } from "../import/svg.js";
import { PRESETS } from "../presets.js";
import { satinColumns } from "./columns.js";
import { inkstitchAngleDeg, tatamiAttributes } from "./tatami.js";
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

describe("narrow shapes no column holds", () => {
  const holed = area("holed", HOLED_BAR);

  it("sets a shape under 1 mm as a running stitch along its axis, with the reason", () => {
    const r = buildInkstitchTemplate([holed], pique, PAGE);
    expect(r.objects).toMatchObject([
      {
        id: "holed",
        kind: "running",
        shapeId: "holed",
        reason: expect.stringMatching(/rails cross/),
      },
    ]);
    expect(r.satinRuns).toEqual([]);
    // Written the way a hairline is: named running stitch, not a fill, not a column.
    expect(r.svg).toMatch(/<path id="holed"[^>]*inkstitch:stroke_method="running_stitch"/);
    expect(r.svg).not.toContain("satin_column");
    expect(r.svg).not.toContain("row_spacing_mm");
    // The line runs the length of the bar, on the bar.
    const d = /<path id="holed" d="([^"]*)"/.exec(r.svg)![1]!;
    const xs = [...d.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((m) => Number(m[1]));
    const ys = [...d.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((m) => Number(m[2]));
    expect(Math.min(...xs)).toBeLessThan(2);
    expect(Math.max(...xs)).toBeGreaterThan(18);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...ys)).toBeLessThanOrEqual(1);
  });

  it("says what it did: one note that names the running stitch, no claim of tatami or a tight column", () => {
    const r = buildInkstitchTemplate([holed], pique, PAGE);
    const mine = r.warnings.filter((w) => w.objectId === "holed");
    expect(mine.map((w) => w.code)).toEqual(["AUTOSATIN_MIXED"]);
    expect(mine[0]!.severity).toBe("info");
    expect(mine[0]!.message).toContain("running stitch");
    expect(mine.some((w) => w.message.includes("stays tatami"))).toBe(false);
    expect(mine.some((w) => w.code === "SATIN_TOO_NARROW")).toBe(false);
  });

  it("puts the fallback where the shape stands in the order, not with the columns", () => {
    const r = buildInkstitchTemplate(
      [area("before", moved(GLYPHS.T!, 0)), holed, area("after", moved(GLYPHS.L!, 40))],
      pique,
      PAGE,
    );
    expect(r.objects.map((o) => [o.shapeId, o.kind])).toEqual([
      ["before", "satin"],
      ["holed", "running"],
      ["after", "satin"],
    ]);
    // The running stitch breaks the run of satin: two runs, one column plan each.
    expect(r.satinRuns).toHaveLength(2);
  });

  it("keeps a shape from 1 mm up as tatami when no column holds it", () => {
    // 3 x 3 mm: median width 3 mm, no stroke — tatami, as before.
    const r = buildInkstitchTemplate([area("dot", polygonOf(rect(5, 5, 3, 3)))], pique, PAGE);
    expect(r.objects).toMatchObject([{ kind: "tatami", reason: "no stroke found" }]);
  });
});

describe("knockdown option (spec §4.1)", () => {
  const under = area("under", polygonOf(rect(0, 0, 40, 30)), "#1f3a93");
  const over = area("over", polygonOf(rect(10, 5, 20, 20)), "#c8102e");

  it("leaves the areas whole unless asked", () => {
    const t = buildInkstitchTemplate([under, over], pique, PAGE);
    expect(t.objects.map((o) => o.id)).toEqual(["under", "over"]);
    expect(t.knockdown).toBeUndefined();
    const d = /<path id="under" d="([^"]*)"/.exec(t.svg)![1]!;
    expect(d.match(/M /g)).toHaveLength(1); // no hole
  });

  it("cuts the later tatami out of the earlier one and says what it did", () => {
    const t = buildInkstitchTemplate([under, over], pique, { ...PAGE, knockdown: true });
    expect(t.objects.map((o) => [o.id, o.kind])).toEqual([
      ["under", "tatami"],
      ["over", "tatami"],
    ]);
    const d = /<path id="under" d="([^"]*)"/.exec(t.svg)![1]!;
    expect(d.match(/M /g)).toHaveLength(2); // the outline and the hole
    expect(t.knockdown).toMatchObject({ changed: 1, covered: [], split: [] });
    expect(t.knockdown!.areaMm2.after).toBeLessThan(t.knockdown!.areaMm2.before);
  });

  it("leaves out a tatami that a later one covers completely, with FILL_COVERED", () => {
    const hidden = area("hidden", polygonOf(rect(12, 7, 10, 10)), "#101820");
    const t = buildInkstitchTemplate([hidden, over], pique, { ...PAGE, knockdown: true });
    expect(t.objects.map((o) => o.id)).toEqual(["over"]);
    expect(t.svg).not.toContain('id="hidden"');
    expect(t.knockdown!.covered).toEqual(["hidden"]);
    expect(t.warnings).toContainEqual(
      expect.objectContaining({ code: "FILL_COVERED", severity: "info", objectId: "hidden" }),
    );
  });

  it("writes every part of an area the cut splits as a tatami of its own, in its place", () => {
    const bar = area("bar", polygonOf(rect(0, 0, 60, 10)));
    const post = area("post", polygonOf(rect(20, -5, 10, 20)), "#c8102e");
    const t = buildInkstitchTemplate([bar, post], pique, { ...PAGE, knockdown: true });
    expect(t.objects.map((o) => o.id)).toEqual(["bar_p0", "bar_p1", "post"]);
    expect(t.objects.slice(0, 2).every((o) => o.shapeId === "bar" && o.kind === "tatami")).toBe(
      true,
    );
    expect(t.knockdown!.split).toEqual([{ id: "bar", parts: 2 }]);
  });

  it("never cuts a satin column and never cuts out of one (rule 1)", () => {
    const letter = area("letter", moved(GLYPHS.T!, 5), "#c8102e");
    const ground = area("ground", polygonOf(rect(0, 0, 40, 30)), "#1f3a93");
    // A tatami under the letter is not touched by it…
    const a = buildInkstitchTemplate([ground, letter], pique, { ...PAGE, knockdown: true });
    expect(a.objects.map((o) => [o.shapeId, o.kind])).toEqual([
      ["ground", "tatami"],
      ["letter", "satin"],
    ]);
    expect(/<path id="ground" d="([^"]*)"/.exec(a.svg)![1]!.match(/M /g)).toHaveLength(1);
    // …and a tatami over the letter does not cut it.
    const b = buildInkstitchTemplate([letter, ground], pique, { ...PAGE, knockdown: true });
    expect(b.objects.map((o) => [o.shapeId, o.kind])).toEqual([
      ["letter", "satin"],
      ["ground", "tatami"],
    ]);
    expect(b.satinRuns).toHaveLength(1);
    expect(b.knockdown).toMatchObject({ changed: 0 });
  });
});

describe("order option (spec §10.1)", () => {
  const ground = area("ground", polygonOf(rect(0, 0, 40, 30)), "#1f3a93");
  const letter = area("letter", moved(GLYPHS.T!, 10), "#c8102e");
  const far = area("far", polygonOf(rect(80, 0, 20, 20)), "#1f3a93");

  it("keeps the document order unless asked, and counts its colour blocks", () => {
    const t = buildInkstitchTemplate([ground, letter, far], pique, PAGE);
    expect(t.objects.map((o) => o.shapeId)).toEqual(["ground", "letter", "far"]);
    expect(t.colourBlocks).toBe(3);
    expect(t.colourBlocksLowerBound).toBeUndefined();
  });

  it("groups the colours where nothing overlaps, and keeps the letter on its ground", () => {
    const t = buildInkstitchTemplate([ground, letter, far], pique, { ...PAGE, order: "colour" });
    expect(t.objects.map((o) => o.shapeId)).toEqual(["ground", "far", "letter"]);
    expect(t.colourBlocks).toBe(2);
    expect(t.colourBlocksLowerBound).toBe(2);
  });

  it("does not put what lies under another object after it", () => {
    // The letter is drawn first, the ground over it: the letter stays first.
    const t = buildInkstitchTemplate([letter, ground, far], pique, { ...PAGE, order: "colour" });
    expect(t.objects.map((o) => o.shapeId)).toEqual(["letter", "ground", "far"]);
  });

  it("lets a hairline and a stroked line bind like an area (an outline is drawn over what it outlines)", () => {
    // A hairline over the ground, and a fill over the hairline: blue, red, blue — three blocks.
    const hairline = area("hairline", polygonOf(rect(30, 2, 20, 0.5)), "#c8102e");
    const cover = area("cover", polygonOf(rect(45, 0, 10, 10)), "#1f3a93");
    const a = buildInkstitchTemplate([ground, hairline, cover], pique, {
      ...PAGE,
      order: "colour",
    });
    expect(a.objects.map((o) => o.shapeId)).toEqual(["ground", "hairline", "cover"]);
    expect(a.colourBlocks).toBe(3);
    // The same with a stroked line instead of a hairline.
    const line: ImportedShape = {
      kind: "line",
      id: "rule",
      polyline: [pt(30, 3), pt(50, 3)],
      closed: false,
      color: "#c8102e",
      attrs: {},
      trimAfter: "auto",
    };
    const b = buildInkstitchTemplate([ground, line, cover], pique, { ...PAGE, order: "colour" });
    expect(b.objects.map((o) => o.shapeId)).toEqual(["ground", "rule", "cover"]);
    expect(b.colourBlocks).toBe(3);
  });

  it("brings the satin of one colour together into one run", () => {
    const t = moved(GLYPHS.T!, 0);
    const l = moved(GLYPHS.L!, 40);
    const between = area("between", polygonOf(rect(20, 20, 12, 8)), "#1f3a93");
    const shapes = [area("T", t, "#c8102e"), between, area("L", l, "#c8102e")];
    expect(buildInkstitchTemplate(shapes, pique, PAGE).satinRuns).toHaveLength(2);
    const r = buildInkstitchTemplate(shapes, pique, { ...PAGE, order: "colour" });
    expect(r.objects.map((o) => o.shapeId)).toEqual(["T", "L", "between"]);
    expect(r.satinRuns).toHaveLength(1);
  });

  it("stitches areas before satin within a colour", () => {
    const shapes = [
      area("letter", moved(GLYPHS.T!, 0)),
      area("block", polygonOf(rect(60, 2, 20, 20))),
    ];
    const r = buildInkstitchTemplate(shapes, pique, { ...PAGE, order: "colour" });
    expect(r.objects.map((o) => o.shapeId)).toEqual(["block", "letter"]);
  });

  it("orders the areas before it cuts them, so the knockdown works on the stitch order", () => {
    const big = area("big", polygonOf(rect(0, 0, 40, 30)), "#1f3a93");
    const small = area("small", polygonOf(rect(10, 5, 20, 20)), "#c8102e");
    const other = area("other", polygonOf(rect(60, 0, 10, 10)), "#1f3a93");
    const r = buildInkstitchTemplate([big, small, other], pique, {
      ...PAGE,
      order: "colour",
      knockdown: true,
    });
    expect(r.objects.map((o) => o.shapeId)).toEqual(["big", "other", "small"]);
    // The big one is cut by the small one lying on it, as in the design.
    expect(r.knockdown!.changed).toBe(1);
    expect(/<path id="big" d="([^"]*)"/.exec(r.svg)![1]!.match(/M /g)).toHaveLength(2);
  });
});

describe("trim_after of the source (spec §10.2)", () => {
  const trimmed = (shape: ImportedShape): ImportedShape => ({ ...shape, trimAfter: "always" });
  const block = area("block", polygonOf(rect(0, 0, 20, 20)));
  const hairline = area("hairline", polygonOf(rect(30, 2, 20, 0.5)));

  it("carries an explicit trim after a tatami or a running stitch over to its path", () => {
    const t = buildInkstitchTemplate([trimmed(block), trimmed(hairline)], pique, PAGE);
    expect(t.svg).toMatch(/<path id="block"[^>]*inkstitch:trim_after="true"/);
    expect(t.svg).toMatch(/<path id="hairline"[^>]*inkstitch:trim_after="true"/);
  });

  it("adds none where the source has none", () => {
    const t = buildInkstitchTemplate([block, hairline], pique, PAGE);
    expect(t.svg).not.toContain("trim_after");
  });

  it("writes every line of a running stitch as a path of its own, and puts the trim on the last", () => {
    // Ink/Stitch cuts after an element, never between the lines of one: a hairline with a
    // junction goes in as one element per line, or the jumps between its lines stay open.
    const h = trimmed(area("H", HAIRLINE_H));
    const t = buildInkstitchTemplate([h], pique, PAGE);
    expect(t.objects.map((o) => [o.id, o.kind])).toEqual([["H", "running"]]);
    const paths = t.svg.match(/<path id="H[^"]*"[^>]*>/g)!;
    expect(paths.length).toBeGreaterThan(1);
    expect(paths.map((d) => /id="([^"]*)"/.exec(d)![1])).toEqual(
      paths.map((_, i) => (i === 0 ? "H" : `H_l${i}`)),
    );
    for (const d of paths) expect(d.match(/ M /g) ?? []).toHaveLength(0);
    for (const d of paths.slice(0, -1)) expect(d).not.toContain("trim_after");
    expect(paths[paths.length - 1]).toContain('inkstitch:trim_after="true"');
  });

  it("puts it on the last part of a tatami the knockdown split — where the object ends", () => {
    const bar = trimmed(area("bar", polygonOf(rect(0, 0, 60, 10))));
    const post = area("post", polygonOf(rect(20, -5, 10, 20)), "#c8102e");
    const t = buildInkstitchTemplate([bar, post], pique, { ...PAGE, knockdown: true });
    expect(t.objects.map((o) => o.id)).toEqual(["bar_p0", "bar_p1", "post"]);
    expect(t.svg).not.toMatch(/<path id="bar_p0"[^>]*trim_after/);
    expect(t.svg).toMatch(/<path id="bar_p1"[^>]*inkstitch:trim_after="true"/);
  });
});

describe("tatami attributes (spec §14)", () => {
  const pathOf = (svg: string, id: string): string =>
    new RegExp(`<path id="${id}"[^>]*>`).exec(svg)![0];
  const block = area("block", polygonOf(rect(60, 2, 20, 20)));

  it("sets the preset's values on every tatami", () => {
    const t = buildInkstitchTemplate([block], pique, PAGE);
    const path = pathOf(t.svg, "block");
    const expected = tatamiAttributes(pique, DEFAULT_ANGLE_DEG);
    for (const [name, value] of Object.entries(expected)) {
      expect(path, name).toContain(` inkstitch:${name}="${value}"`);
    }
  });

  it("follows the preset — fleece has a double underlay", () => {
    const t = buildInkstitchTemplate([block], PRESETS.fleece, PAGE);
    expect(pathOf(t.svg, "block")).toMatch(/inkstitch:fill_underlay_angle="0 90"/);
  });

  it("gives every part of a split area attributes of its own, angle included", () => {
    const bar = area("bar", polygonOf(rect(0, 0, 60, 10)));
    const post = area("post", polygonOf(rect(20, -5, 10, 20)), "#c8102e");
    const t = buildInkstitchTemplate([bar, post], pique, { ...PAGE, knockdown: true });
    for (const id of ["bar_p0", "bar_p1", "post"]) {
      expect(pathOf(t.svg, id), id).toMatch(/inkstitch:angle="-?\d+"/);
      expect(pathOf(t.svg, id), id).toContain("inkstitch:max_stitch_length_mm=");
    }
  });

  it("turns the angle to where the rows break least (spec §8.2)", () => {
    const u = area("u", U_SHAPE);
    const t = buildInkstitchTemplate([u], pique, PAGE);
    const best = bestFillAngle(U_SHAPE, pique.fillRowSpacingMm, DEFAULT_ANGLE_DEG);
    expect(best).not.toBe(DEFAULT_ANGLE_DEG);
    expect(pathOf(t.svg, "u")).toContain(`inkstitch:angle="${inkstitchAngleDeg(best)}"`);
  });

  it("crosses the rows at a seam: the later of two touching areas takes the other diagonal (spec §5.1)", () => {
    const left = area("left", polygonOf(rect(0, 0, 10, 10)));
    const right = area("right", polygonOf(rect(10, 0, 10, 10)), "#c8102e");
    const t = buildInkstitchTemplate([left, right], pique, PAGE);
    // fill.ts turns clockwise, Ink/Stitch counter-clockwise: 45 degrees there are -45 here.
    expect(pathOf(t.svg, "left")).toContain('inkstitch:angle="-45"');
    expect(pathOf(t.svg, "right")).toContain('inkstitch:angle="45"');
  });

  it("does not turn areas that lie apart", () => {
    const a = area("a", polygonOf(rect(0, 0, 10, 10)));
    const b = area("b", polygonOf(rect(50, 0, 10, 10)), "#c8102e");
    const t = buildInkstitchTemplate([a, b], pique, PAGE);
    expect(pathOf(t.svg, "a")).toContain('inkstitch:angle="-45"');
    expect(pathOf(t.svg, "b")).toContain('inkstitch:angle="-45"');
  });

  it("counts a satin lying earlier as something to cross", () => {
    const letter = area("letter", moved(GLYPHS.T!, 0));
    const under = area("under", polygonOf(rect(9, 2, 12, 8)), "#c8102e");
    const t = buildInkstitchTemplate([letter, under], pique, PAGE);
    expect(pathOf(t.svg, "under")).toContain('inkstitch:angle="45"');
  });
});

describe("grid underlay only where it holds (spec §8.6)", () => {
  const pathOf = (svg: string, id: string): string =>
    new RegExp(`<path id="${id}"[^>]*>`).exec(svg)![0];
  const block = area("block", polygonOf(rect(60, 2, 20, 20)));
  // Two blocks on a waist of 0.6 mm: the inset of 0.4 mm cuts it, two pieces. Without
  // compensation, which would widen the waist along the rows.
  const waist = area("waist", hourglass(0.6), "#c8102e");
  const flat = { ...pique, pullCompMm: 0, pushCompMm: 0 };

  it("sets it on a compact area and counts it", () => {
    const t = buildInkstitchTemplate([block], pique, PAGE);
    expect(pathOf(t.svg, "block")).toContain('inkstitch:fill_underlay="true"');
    expect(t.underlay).toEqual({ grid: 1, without: [] });
  });

  it("leaves it off where the inset falls apart, and says which area and how many pieces", () => {
    const t = buildInkstitchTemplate([block, waist], flat, PAGE);
    const path = pathOf(t.svg, "waist");
    expect(path).toContain('inkstitch:fill_underlay="false"');
    expect(path).not.toContain("fill_underlay_angle");
    // The rest of the area's parameters stay.
    expect(path).toContain('inkstitch:row_spacing_mm="0.4"');
    expect(t.underlay).toEqual({ grid: 1, without: [{ id: "waist", pieces: 2 }] });
  });

  it("judges every part of a split area for itself", () => {
    // A bar cut in three by two posts: the parts are compact, the posts too.
    const bar = area("bar", polygonOf(rect(0, 0, 60, 10)));
    const post = area("post", polygonOf(rect(20, -5, 10, 20)), "#c8102e");
    const t = buildInkstitchTemplate([bar, post], pique, { ...PAGE, knockdown: true });
    expect(t.underlay.grid).toBe(3);
    expect(t.underlay.without).toEqual([]);
  });

  it("reports nothing for a preset without an underlay", () => {
    const bare = { ...pique, fillUnderlay: { ...pique.fillUnderlay, fill: "none" as const } };
    const t = buildInkstitchTemplate([block, waist], bare, PAGE);
    expect(t.underlay).toEqual({ grid: 0, without: [] });
    expect(pathOf(t.svg, "block")).toContain('inkstitch:fill_underlay="false"');
  });
});

describe("pull and push compensation of the tatami areas (spec §8.1.1)", () => {
  const pathOf = (svg: string, id: string): string =>
    new RegExp(`<path id="${id}"[^>]*>`).exec(svg)![0];
  /** The polygon a path of the template draws. */
  const drawn = (svg: string, id: string): Polygon => {
    const d = new RegExp(`<path id="${id}" d="([^"]*)"`).exec(svg)![1]!;
    const rings: Polyline[] = d
      .split("Z")
      .map((r) => r.trim())
      .filter(Boolean)
      .map((r) =>
        r
          .replace(/^M /, "")
          .split(" L ")
          .map((q) => {
            const [x, y] = q.split(",").map(Number);
            return pt(x!, y!);
          }),
      );
    return { outer: rings[0]!, holes: rings.slice(1) };
  };
  const bar = area("bar", polygonOf(rect(60, 2, 20, 10)));
  const only = (pullCompMm: number, pushCompMm: number) => ({ ...pique, pullCompMm, pushCompMm });

  it("widens an area along its rows by the pull and takes it in across them by the push", () => {
    const flat = buildInkstitchTemplate([bar], only(0, 0), PAGE);
    const pulled = buildInkstitchTemplate([bar], only(1, 0), PAGE);
    const pushed = buildInkstitchTemplate([bar], only(0, 0.5), PAGE);
    expect(polygonArea(drawn(pulled.svg, "bar"))).toBeGreaterThan(
      polygonArea(drawn(flat.svg, "bar")),
    );
    expect(polygonArea(drawn(pushed.svg, "bar"))).toBeLessThan(polygonArea(drawn(flat.svg, "bar")));
  });

  it("is the same offset fill.ts applies, along the fill's own angle", () => {
    const t = buildInkstitchTemplate([bar], pique, PAGE);
    const angle = -Number(/inkstitch:angle="([^"]*)"/.exec(pathOf(t.svg, "bar"))![1]);
    const expected = offsetDirectional(bar.polygon, pique.pullCompMm, pique.pushCompMm, angle);
    expect(expected).toHaveLength(1);
    expect(polygonArea(drawn(t.svg, "bar"))).toBeCloseTo(polygonArea(expected[0]!), 2);
  });

  it("leaves the area as drawn where the preset has no compensation", () => {
    const t = buildInkstitchTemplate([bar], only(0, 0), PAGE);
    expect(polygonArea(drawn(t.svg, "bar"))).toBeCloseTo(200, 6);
    expect(pathOf(t.svg, "bar")).toContain('d="M 60,2 L');
    expect(t.compensation).toEqual({ pulledOnly: [], vanished: [] });
  });

  it("does not ask Ink/Stitch for a pull of its own — it would compensate twice, and rebuilds the area from its rows on every run", () => {
    const t = buildInkstitchTemplate([bar], pique, PAGE);
    expect(pathOf(t.svg, "bar")).not.toContain("pull_compensation");
  });

  it("stitches an area that vanishes under the compensation as it is, and says so", () => {
    // A 3 x 3 mm dot with a push of 3 mm either side: nothing is left.
    const dot = area("dot", polygonOf(rect(5, 5, 3, 3)));
    const t = buildInkstitchTemplate([dot], only(0, 3), PAGE);
    expect(polygonArea(drawn(t.svg, "dot"))).toBeCloseTo(9, 6);
    const w = t.warnings.find((x) => x.objectId === "dot" && x.code === "INVALID_GEOMETRY");
    expect(w?.severity).toBe("warn");
    expect(w?.message).toContain("vanish");
    expect(t.compensation).toEqual({ pulledOnly: [], vanished: ["dot"] });
  });

  it("compensates by the pull alone where the push would cut the area apart, and says so", () => {
    // A ring 10 mm wide with rows at 45 degrees. A push of 6 mm (far beyond any preset) takes it in
    // by 12 mm across the rows, so where its walls run along them nothing is left: two arcs. Every
    // part would be a trim and a jump of its own.
    const ring = area("ring", annulus(20, 15, 12, 2));
    const t = buildInkstitchTemplate([ring], only(0.2, 6), PAGE);
    expect(t.objects.map((o) => o.id)).toEqual(["ring"]);
    expect(t.compensation).toEqual({ pulledOnly: [{ id: "ring", parts: 2 }], vanished: [] });
    // Only the pull: the area grew along its rows and was not taken in across them.
    expect(polygonArea(drawn(t.svg, "ring"))).toBeGreaterThan(polygonArea(ring.polygon));
    const w = t.warnings.find((x) => x.objectId === "ring" && x.code === "INVALID_GEOMETRY");
    expect(w?.severity).toBe("info");
    expect(w?.message).toContain("2 parts");
  });

  it("works on what the knockdown left: each part compensated for itself", () => {
    const post = area("post", polygonOf(rect(20, -5, 10, 20)), "#c8102e");
    const wide = area("wide", polygonOf(rect(0, 0, 60, 10)));
    const t = buildInkstitchTemplate([wide, post], only(0.5, 0), { ...PAGE, knockdown: true });
    const ids = t.objects.map((o) => o.id);
    expect(ids).toEqual(["wide_p0", "wide_p1", "post"]);
    for (const id of ids) {
      const flat = buildInkstitchTemplate([wide, post], only(0, 0), { ...PAGE, knockdown: true });
      expect(polygonArea(drawn(t.svg, id)), id).toBeGreaterThan(polygonArea(drawn(flat.svg, id)));
    }
  });
});
