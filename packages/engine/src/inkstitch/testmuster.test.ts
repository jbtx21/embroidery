/**
 * The parameter matrix, a test pattern per fabric (`testmuster.ts`; docs/probesticks.md, "Testmuster
 * je Stoff"): 22 fields that stitch one stitch parameter against another side by side, each written
 * the way an order's shape of that kind is written (`template.ts`) — so what the fabric shows is what
 * an order with those values would show.
 *
 * Own shapes, no customer logos. The stitching itself is in `test/testmuster.smoke.test.ts`
 * (RUN_INKSTITCH_TESTS=1); here the document is read.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { initGeometry } from "@texma-stitch/geometry";
import type { Polygon } from "@texma-stitch/geometry";
import { polygonOf, rect } from "../../test/fixtures/shapes.js";
import { DEFAULT_ANGLE_DEG } from "../import/svg.js";
import { PRESETS } from "../presets.js";
import type { Preset } from "../presets.js";
import { compensateArea, gridUnderlay, inkstitchAngleDeg, tatamiAttributes } from "./tatami.js";
import {
  buildInkstitchTemplate,
  CENTER_WALK_STITCH_MM,
  INKSTITCH_MIN_STITCH_MM,
  RUNNING_STITCH_MM,
  satinColumnAttributes,
  satinPullCompMm,
  tieAttributes,
  UNDERLAY_WIDE_FROM_MM,
} from "./template.js";
import {
  buildTestPattern,
  TEST_PATTERN_COLOUR,
  TEST_PATTERN_LAYOUT,
  TEST_PATTERN_ROW_SPACINGS_MM,
  TEST_PATTERN_SATIN_SPACINGS_MM,
  TEST_PATTERN_SATIN_WIDTHS_MM,
  TEST_PATTERN_STITCH_LENGTHS_MM,
  testPatternLegend,
} from "./testmuster.js";
import type { TestPattern, TestPatternField } from "./testmuster.js";
import type { XmlElement } from "./xml.js";
import { childElements, getAttr, parseXml } from "./xml.js";

beforeAll(async () => {
  await initGeometry();
});

const pique = PRESETS.pique;

// ---------------------------------------------------------------------------
// Reading the document
// ---------------------------------------------------------------------------

const rootOf = (svg: string): XmlElement => parseXml(svg).root;

/** Every `<path>` in document order, the ones inside a group too. */
function pathsOf(svg: string): XmlElement[] {
  const out: XmlElement[] = [];
  const walk = (el: XmlElement): void => {
    for (const c of childElements(el)) {
      if (c.name === "path") out.push(c);
      else walk(c);
    }
  };
  walk(rootOf(svg));
  return out;
}

const pathById = (svg: string, id: string): XmlElement => {
  const hit = pathsOf(svg).find((p) => getAttr(p, "id") === id);
  if (hit === undefined) throw new Error(`no path ${id}`);
  return hit;
};

/** The `inkstitch:` attributes of an element, without the prefix, as written. */
function inkOf(el: XmlElement): Record<string, string> {
  const out: Record<string, string> = {};
  for (const a of el.attrs) {
    if (a.name.startsWith("inkstitch:"))
      out[a.name.slice("inkstitch:".length)] = getAttr(el, a.name)!;
  }
  return out;
}

/** Without the cut: what the object is, not what comes after it. */
const withoutTrim = (attrs: Record<string, string>): Record<string, string> => {
  const { trim_after: _trim, ...rest } = attrs;
  return rest;
};

const numbersOf = (d: string): number[] => (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);

/** The box of the points a path writes. */
function boxOf(d: string): { minX: number; minY: number; maxX: number; maxY: number } {
  const n = numbersOf(d);
  const xs = n.filter((_, i) => i % 2 === 0);
  const ys = n.filter((_, i) => i % 2 === 1);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

/** The sub-paths of a `d` (rails and rungs of a satin column), each as its points. */
const subPaths = (d: string): { x: number; y: number }[][] =>
  d
    .split("M")
    .map((s) => s.trim())
    .filter((s) => s !== "")
    .map((s) => {
      const n = numbersOf(s);
      const pts: { x: number; y: number }[] = [];
      for (let i = 0; i + 1 < n.length; i += 2) pts.push({ x: n[i]!, y: n[i + 1]! });
      return pts;
    });

const field = (p: TestPattern, id: string): TestPatternField => {
  const hit = p.fields.find((f) => f.id === id);
  if (hit === undefined) throw new Error(`no field ${id}`);
  return hit;
};
const fieldsOf = (p: TestPattern, block: "A" | "B" | "C"): TestPatternField[] =>
  p.fields.filter((f) => f.block === block);

const square = (x: number, y: number, size: number): Polygon => polygonOf(rect(x, y, size, size));

// ---------------------------------------------------------------------------

describe("the matrix", () => {
  let p: TestPattern;
  beforeAll(() => {
    p = buildTestPattern(pique);
  });

  it("has 22 fields: A1 to A9, B1 to B9 and C1 to C4, in the order they are stitched", () => {
    expect(p.fields.map((f) => f.id)).toEqual([
      ...Array.from({ length: 9 }, (_, i) => `A${i + 1}`),
      ...Array.from({ length: 9 }, (_, i) => `B${i + 1}`),
      ...Array.from({ length: 4 }, (_, i) => `C${i + 1}`),
    ]);
    expect(fieldsOf(p, "A")).toHaveLength(9);
    expect(fieldsOf(p, "B")).toHaveLength(9);
    expect(fieldsOf(p, "C")).toHaveLength(4);
  });

  it("lays block A out from (5, 5), block B from x = 60 and block C from y = 60, mm", () => {
    // 15-mm cells, 3 mm apart: the centres are 18 mm apart.
    const centre = (id: string): [number, number] => [field(p, id).centre.x, field(p, id).centre.y];
    expect(centre("A1")).toEqual([12.5, 12.5]);
    expect(centre("A2")).toEqual([30.5, 12.5]);
    expect(centre("A4")).toEqual([12.5, 30.5]);
    expect(centre("A9")).toEqual([48.5, 48.5]);
    expect(centre("B1")).toEqual([67.5, 12.5]);
    expect(centre("B3")).toEqual([103.5, 12.5]);
    expect(centre("B7")).toEqual([67.5, 48.5]);
    expect(centre("B9")).toEqual([103.5, 48.5]);
    // Four squares of 20 mm, 3 mm apart, their tops at y = 60.
    expect(["C1", "C2", "C3", "C4"].map(centre)).toEqual([
      [15, 70],
      [38, 70],
      [61, 70],
      [84, 70],
    ]);
    expect(TEST_PATTERN_LAYOUT.satinFromX).toBe(60);
    expect(TEST_PATTERN_LAYOUT.compFromY).toBe(60);
  });

  it("sizes the page to the layout: 5 mm round everything", () => {
    expect([p.widthMm, p.heightMm]).toEqual([116, 85]);
  });

  it("keeps the fields apart (3 mm and more) and inside the page", () => {
    const boxes = p.fields.map((f) => ({
      id: f.id,
      minX: f.centre.x - f.size.widthMm / 2,
      maxX: f.centre.x + f.size.widthMm / 2,
      minY: f.centre.y - f.size.heightMm / 2,
      maxY: f.centre.y + f.size.heightMm / 2,
    }));
    for (const b of boxes) {
      expect(b.minX, b.id).toBeGreaterThanOrEqual(0);
      expect(b.minY, b.id).toBeGreaterThanOrEqual(0);
      expect(b.maxX, b.id).toBeLessThanOrEqual(p.widthMm);
      expect(b.maxY, b.id).toBeLessThanOrEqual(p.heightMm);
    }
    for (const [i, a] of boxes.entries()) {
      for (const b of boxes.slice(i + 1)) {
        const dx = Math.max(a.minX - b.maxX, b.minX - a.maxX);
        const dy = Math.max(a.minY - b.maxY, b.minY - a.maxY);
        expect(Math.max(dx, dy), `${a.id} / ${b.id}`).toBeGreaterThanOrEqual(3 - 1e-9);
      }
    }
  });

  it("says what is stitched: the bounds reach from the mark at the page corner to the last column and the squares", () => {
    expect(p.bounds.minX).toBe(0);
    expect(p.bounds.minY).toBe(0);
    // Block B ends at the last column's edge and its pull compensation; block C at the squares' bottom.
    expect(p.bounds.maxX).toBeCloseTo(103.5 + 4.5 / 2 + satinPullCompMm(4.5, pique), 6);
    expect(p.bounds.maxY).toBeCloseTo(80, 1);
  });

  it("is the same document for the same input (CLAUDE.md rule 3)", () => {
    expect(buildTestPattern(pique).svg).toBe(p.svg);
    expect(buildTestPattern(pique, {}).fields).toEqual(p.fields);
  });
});

describe("what each block varies", () => {
  let p: TestPattern;
  beforeAll(() => {
    p = buildTestPattern(pique);
  });

  it("block A: rows by row spacing (0.19 / 0.21 / 0.24), columns by stitch length (3 / 4 / 5)", () => {
    expect(TEST_PATTERN_ROW_SPACINGS_MM).toEqual([0.19, 0.21, 0.24]);
    expect(TEST_PATTERN_STITCH_LENGTHS_MM).toEqual([3, 4, 5]);
    expect(fieldsOf(p, "A").map((f) => f.values)).toEqual(
      [0.19, 0.21, 0.24].flatMap((rowSpacingMm) =>
        [3, 4, 5].map((stitchLengthMm) => ({ rowSpacingMm, stitchLengthMm })),
      ),
    );
    expect(field(p, "A1").size).toEqual({ widthMm: 15, heightMm: 15 });
  });

  it("block B: rows by zigzag spacing (0.34 / 0.38 / 0.42), columns by width (1.0 / 2.5 / 4.5)", () => {
    expect(TEST_PATTERN_SATIN_WIDTHS_MM).toEqual([1, 2.5, 4.5]);
    expect(TEST_PATTERN_SATIN_SPACINGS_MM).toEqual([0.34, 0.38, 0.42]);
    expect(fieldsOf(p, "B").map((f) => f.values)).toEqual(
      [0.34, 0.38, 0.42].flatMap((spacingMm) =>
        [1, 2.5, 4.5].map((widthMm) => ({ widthMm, spacingMm })),
      ),
    );
    // The column is as wide as it says and 15 mm long.
    expect(field(p, "B2").size).toEqual({ widthMm: 2.5, heightMm: 15 });
  });

  it("block C: pull and push of 0 / 0, 0.20 / 0, the preset's own, 0.30 / 0", () => {
    expect(fieldsOf(p, "C").map((f) => f.values)).toEqual([
      { pullMm: 0, pushMm: 0 },
      { pullMm: 0.2, pushMm: 0 },
      { pullMm: pique.pullCompMm, pushMm: pique.pushCompMm },
      { pullMm: 0.3, pushMm: 0 },
    ]);
    const fleece = buildTestPattern(PRESETS.fleece);
    expect(field(fleece, "C3").values).toEqual({
      pullMm: PRESETS.fleece.pullCompMm,
      pushMm: PRESETS.fleece.pushCompMm,
    });
    expect(field(p, "C1").size).toEqual({ widthMm: 20, heightMm: 20 });
  });

  it("takes other values for the matrix, in the same places", () => {
    const q = buildTestPattern(pique, {
      rowSpacingsMm: [0.2, 0.22, 0.25],
      stitchLengthsMm: [2.5, 3.5, 4.5],
      satinWidthsMm: [1.2, 2, 3],
      satinSpacingsMm: [0.3, 0.36, 0.44],
    });
    expect(field(q, "A2").values).toEqual({ rowSpacingMm: 0.2, stitchLengthMm: 3.5 });
    expect(field(q, "A9").values).toEqual({ rowSpacingMm: 0.25, stitchLengthMm: 4.5 });
    expect(field(q, "B3").values).toEqual({ widthMm: 3, spacingMm: 0.3 });
    expect(field(q, "B7").values).toEqual({ widthMm: 1.2, spacingMm: 0.44 });
    // Nothing moves: the layout does not depend on the values (block B's centres are the cells').
    expect(field(q, "B3").centre).toEqual(field(p, "B3").centre);
    expect(q.fields.map((f) => f.id)).toEqual(p.fields.map((f) => f.id));
  });

  it("refuses values that are not three numbers over 0 — nothing is mended", () => {
    const bad = (options: Parameters<typeof buildTestPattern>[1]): void =>
      expect(() => buildTestPattern(pique, options)).toThrow(RangeError);
    bad({ rowSpacingsMm: [0.19, 0.21] as unknown as [number, number, number] });
    bad({ rowSpacingsMm: [0.19, 0.21, 0.24, 0.3] as unknown as [number, number, number] });
    bad({ stitchLengthsMm: [3, 0, 5] });
    bad({ stitchLengthsMm: [3, -1, 5] });
    bad({ satinSpacingsMm: [0.3, Number.NaN, 0.4] });
    bad({ satinWidthsMm: [1, 2, Number.POSITIVE_INFINITY] });
    // A column wider than its 15-mm cell would run into the next field.
    bad({ satinWidthsMm: [1, 2, 16] });
    bad({ colour: "blue" });
    bad({ colour: "#12345" });
  });
});

describe("the document", () => {
  let p: TestPattern;
  beforeAll(() => {
    p = buildTestPattern(pique);
  });

  it("is a document of the template's own kind: the same head, mm page, the minimum stitch length — and no document version", () => {
    // `buildInkstitchTemplate` of nothing is just the head of its documents.
    const head = buildInkstitchTemplate([], pique, {
      widthMm: p.widthMm,
      heightMm: p.heightMm,
    }).svg;
    expect(p.svg.startsWith(head.replace("</svg>\n", ""))).toBe(true);
    expect(p.svg).toContain(
      `<inkstitch:min_stitch_len_mm>${INKSTITCH_MIN_STITCH_MM}</inkstitch:min_stitch_len_mm>`,
    );
    // The template carries none (docs/backlog.md: measured, not taken over): Ink/Stitch treats both alike.
    expect(p.svg).not.toContain("inkstitch_svg_version");
    expect(p.svg.endsWith("</svg>\n")).toBe(true);
  });

  it("stitches one colour throughout", () => {
    expect(p.colour).toBe(TEST_PATTERN_COLOUR);
    const colours = new Set(
      pathsOf(p.svg).map((el) => /(?:fill|stroke):(#[0-9a-f]{6})/.exec(getAttr(el, "style")!)![1]),
    );
    expect([...colours]).toEqual([TEST_PATTERN_COLOUR]);
    expect(buildTestPattern(pique, { colour: "#c8102e" }).colour).toBe("#c8102e");
    expect(buildTestPattern(pique, { colour: "#c8102e" }).svg).not.toContain(TEST_PATTERN_COLOUR);
  });

  it("writes the mark first and then the 22 fields in their order, 23 objects", () => {
    const ids = pathsOf(p.svg).map((el) => getAttr(el, "id"));
    expect(ids).toEqual([
      "mark",
      ...Array.from({ length: 9 }, (_, i) => `A${i + 1}`),
      ...Array.from({ length: 9 }, (_, i) => `B${i + 1}-0`),
      ...Array.from({ length: 4 }, (_, i) => `C${i + 1}`),
    ]);
  });

  it("cuts the thread after every object, the mark and every field", () => {
    for (const el of pathsOf(p.svg)) {
      expect(inkOf(el).trim_after, getAttr(el, "id")).toBe("true");
    }
  });

  it("ties every object the way the template does (§10.3)", () => {
    for (const el of pathsOf(p.svg)) {
      const attrs = inkOf(el);
      for (const [key, value] of Object.entries(tieAttributes())) {
        expect(attrs[key], `${getAttr(el, "id")} ${key}`).toBe(value);
      }
    }
  });

  it("marks the top left with a running stitch: two legs of 5 mm meeting at the page corner", () => {
    const mark = pathById(p.svg, "mark");
    const attrs = inkOf(mark);
    expect(attrs.stroke_method).toBe("running_stitch");
    expect(attrs.running_stitch_length_mm).toBe(String(RUNNING_STITCH_MM));
    const [line] = subPaths(getAttr(mark, "d")!);
    expect(line).toEqual([
      { x: 5, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 5 },
    ]);
    expect(getAttr(mark, "style")).toBe(`fill:none;stroke:${TEST_PATTERN_COLOUR};stroke-width:0.1`);
  });
});

describe("block A: tatami", () => {
  let p: TestPattern;
  beforeAll(() => {
    p = buildTestPattern(pique);
  });

  /** The area as the template compensates it for the rows of an order's shape (angle 45°). */
  const compensated = (id: string): Polygon => {
    const f = field(p, id);
    return compensateArea(square(f.centre.x - 7.5, f.centre.y - 7.5, 15), DEFAULT_ANGLE_DEG, pique)
      .polygon;
  };

  it("sets the row spacing and the stitch length of the field, and the angle an order's area gets", () => {
    const a1 = inkOf(pathById(p.svg, "A1"));
    expect(a1.row_spacing_mm).toBe("0.19");
    expect(a1.max_stitch_length_mm).toBe("3");
    const a9 = inkOf(pathById(p.svg, "A9"));
    expect(a9.row_spacing_mm).toBe("0.24");
    expect(a9.max_stitch_length_mm).toBe("5");
    // DEFAULT_ANGLE_DEG on the page is -45 for Ink/Stitch. The legend words the 45° as "von links oben
    // nach rechts unten" (measured in the DST, test/testmuster.smoke.test.ts): another angle needs other words.
    expect(DEFAULT_ANGLE_DEG).toBe(45);
    expect(inkOf(pathById(p.svg, "A5")).angle).toBe(String(inkstitchAngleDeg(DEFAULT_ANGLE_DEG)));
    expect(inkOf(pathById(p.svg, "A5")).angle).toBe("-45");
  });

  it("takes everything else from the preset: stagger, underlay, and pull and push in the outline", () => {
    for (const f of fieldsOf(p, "A")) {
      if (f.block !== "A") continue;
      const own: Preset = {
        ...pique,
        fillRowSpacingMm: f.values.rowSpacingMm,
        fillStitchLengthMm: f.values.stitchLengthMm,
      };
      const grid = gridUnderlay(compensated(f.id), own, DEFAULT_ANGLE_DEG).grid;
      expect(withoutTrim(inkOf(pathById(p.svg, f.id)))).toEqual({
        ...tatamiAttributes(own, DEFAULT_ANGLE_DEG, grid),
        ...tieAttributes(),
      });
    }
    const a = inkOf(pathById(p.svg, "A1"));
    expect(a.staggers).toBe("4");
    expect(a.fill_underlay).toBe("true");
    expect(a.fill_underlay_row_spacing_mm).toBe("2");
    expect(a).not.toHaveProperty("pull_compensation_mm");
    // The compensation is in the outline, as in an order: a little over 15 mm, and not a plain square.
    const box = boxOf(getAttr(pathById(p.svg, "A1"), "d")!);
    expect(box.maxX - box.minX).toBeGreaterThan(15);
    expect(box.maxX - box.minX).toBeLessThan(15.4);
    expect(getAttr(pathById(p.svg, "A1"), "d")).toBe(
      `M ${compensated("A1")
        .outer.map((q) => `${Math.round(q.x * 1e4) / 1e4},${Math.round(q.y * 1e4) / 1e4}`)
        .join(" L ")} Z`,
    );
  });

  it("follows the preset's underlay: a double one for fleece, none where the preset has none", () => {
    const fleece = buildTestPattern(PRESETS.fleece);
    expect(inkOf(pathById(fleece.svg, "A1")).fill_underlay_angle).toBe("0 90");
    const bare: Preset = { ...pique, fillUnderlay: { ...pique.fillUnderlay, fill: "none" } };
    const none = inkOf(pathById(buildTestPattern(bare).svg, "A1"));
    expect(none.fill_underlay).toBe("false");
  });
});

describe("block B: satin", () => {
  let p: TestPattern;
  beforeAll(() => {
    p = buildTestPattern(pique);
  });

  it("sets a native satin column in a group of its own, 15 mm long, the field's width and spacing", () => {
    const b2 = pathById(p.svg, "B2-0");
    const attrs = inkOf(b2);
    expect(attrs.satin_column).toBe("true");
    expect(attrs.zigzag_spacing_mm).toBe("0.34");
    expect(inkOf(pathById(p.svg, "B8-0")).zigzag_spacing_mm).toBe("0.42");
    expect(getAttr(b2, "style")).toBe(`fill:none;stroke:${TEST_PATTERN_COLOUR};stroke-width:0.1`);
    const group = childElements(rootOf(p.svg)).find((el) => getAttr(el, "id") === "B2");
    expect(group?.name).toBe("g");

    const [railA, railB, ...rungs] = subPaths(getAttr(b2, "d")!);
    // Vertical rails, the field's width apart, from the cell's top to 15 mm below it.
    const f = field(p, "B2");
    for (const rail of [railA!, railB!]) {
      expect(rail).toHaveLength(2);
      expect(rail[0]!.x).toBe(rail[1]!.x);
      expect(Math.abs(rail[1]!.y - rail[0]!.y)).toBeCloseTo(15, 6);
      expect(Math.min(rail[0]!.y, rail[1]!.y)).toBeCloseTo(f.centre.y - 7.5, 6);
    }
    expect(Math.abs(railB![0]!.x - railA![0]!.x)).toBeCloseTo(2.5, 6);
    expect((railA![0]!.x + railB![0]!.x) / 2).toBeCloseTo(f.centre.x, 6);
    // Rungs across, level, a little past the rails, within the column's length.
    expect(rungs.length).toBeGreaterThan(5);
    for (const rung of rungs) {
      expect(rung).toHaveLength(2);
      expect(rung[0]!.y).toBe(rung[1]!.y);
      expect(Math.abs(rung[1]!.x - rung[0]!.x)).toBeCloseTo(2.5 + 0.1, 6);
      expect(rung[0]!.y).toBeGreaterThan(f.centre.y - 7.5);
      expect(rung[0]!.y).toBeLessThan(f.centre.y + 7.5);
    }
  });

  it("gives underlay and pull compensation as `satinColumnAttributes` does for that width", () => {
    for (const f of fieldsOf(p, "B")) {
      if (f.block !== "B") continue;
      const own: Preset = { ...pique, satinSpacingMm: f.values.spacingMm };
      expect(withoutTrim(inkOf(pathById(p.svg, `${f.id}-0`)))).toEqual({
        ...satinColumnAttributes(f.values.widthMm, own),
        ...tieAttributes(),
      });
    }
    // 1.0 and 2.5 mm: a centre walk, 4.5 mm: contour and zigzag (spec §7.6); 3 % a side, not under 0.05 mm (§7.2).
    expect(UNDERLAY_WIDE_FROM_MM).toBeGreaterThan(2.5);
    expect(UNDERLAY_WIDE_FROM_MM).toBeLessThan(4.5);
    const narrow = inkOf(pathById(p.svg, "B1-0"));
    expect(narrow.center_walk_underlay).toBe("true");
    expect(narrow.center_walk_underlay_stitch_length_mm).toBe(String(CENTER_WALK_STITCH_MM));
    expect(narrow.pull_compensation_mm).toBe("0.05");
    expect(inkOf(pathById(p.svg, "B2-0")).pull_compensation_mm).toBe("0.075");
    const wide = inkOf(pathById(p.svg, "B3-0"));
    expect(wide.contour_underlay).toBe("true");
    expect(wide.zigzag_underlay).toBe("true");
    expect(wide).not.toHaveProperty("center_walk_underlay");
    expect(wide.pull_compensation_mm).toBe("0.135");
    // One value for both rails: nothing lies near enough to take one side's compensation away (§7.8.3).
    expect(wide.pull_compensation_mm).not.toContain(" ");
  });
});

describe("block C: pull compensation", () => {
  let p: TestPattern;
  beforeAll(() => {
    p = buildTestPattern(pique);
  });
  const sizeOf = (id: string): { w: number; h: number } => {
    const box = boxOf(getAttr(pathById(p.svg, id), "d")!);
    return { w: box.maxX - box.minX, h: box.maxY - box.minY };
  };

  it("stitches the rows level (0°), so the width is along the rows and the height across them", () => {
    for (const id of ["C1", "C2", "C3", "C4"]) {
      const attrs = inkOf(pathById(p.svg, id));
      expect(attrs.angle, id).toBe("0");
      expect(attrs.fill_underlay_angle, id).toBe("90");
      // The preset's row spacing and stitch length, the same for all four.
      expect(attrs.row_spacing_mm, id).toBe(String(pique.fillRowSpacingMm));
      expect(attrs.max_stitch_length_mm, id).toBe(String(pique.fillStitchLengthMm));
    }
  });

  it("writes the squares as 20 × 20 mm grown along the rows by the pull and cut across them by the push", () => {
    // Pull is per side, so the width gains twice the pull; push likewise takes twice from the height.
    // (The offset is an ellipse 40 times as flat on the other axis: a few µm, under the DST's 0.1 mm.)
    expect(sizeOf("C1").w).toBeCloseTo(20, 6);
    expect(sizeOf("C1").h).toBeCloseTo(20, 6);
    expect(sizeOf("C2").w).toBeCloseTo(20.4, 1);
    expect(sizeOf("C2").h).toBeCloseTo(20, 1);
    expect(sizeOf("C3").w).toBeCloseTo(20 + 2 * pique.pullCompMm, 1);
    expect(sizeOf("C3").h).toBeCloseTo(20 - 2 * pique.pushCompMm, 1);
    expect(sizeOf("C4").w).toBeCloseTo(20.6, 1);
    expect(sizeOf("C4").h).toBeCloseTo(20, 1);
  });

  it("compensates as an order does: `compensateArea` at 0°, with the field's pull and push", () => {
    const f = field(p, "C3");
    const own: Preset = { ...pique, pullCompMm: 0.2, pushCompMm: 0.1 };
    const area = compensateArea(square(f.centre.x - 10, f.centre.y - 10, 20), 0, own).polygon;
    const box = boxOf(getAttr(pathById(p.svg, "C3"), "d")!);
    const want = {
      minX: Math.min(...area.outer.map((q) => q.x)),
      maxX: Math.max(...area.outer.map((q) => q.x)),
    };
    expect(box.minX).toBeCloseTo(want.minX, 3);
    expect(box.maxX).toBeCloseTo(want.maxX, 3);
  });
});

describe("a field with the preset's own values is written as an order's shape of that kind", () => {
  it("tatami: the attributes and the outline of a 15 × 15 mm square run through `buildInkstitchTemplate`", () => {
    // The matrix with the preset's row spacing and stitch length in every place: A1 is the square an order
    // would stitch at that place, so the template's own writing must come out the same.
    const own = buildTestPattern(pique, {
      rowSpacingsMm: [pique.fillRowSpacingMm, pique.fillRowSpacingMm, pique.fillRowSpacingMm],
      stitchLengthsMm: [
        pique.fillStitchLengthMm,
        pique.fillStitchLengthMm,
        pique.fillStitchLengthMm,
      ],
    });
    const template = buildInkstitchTemplate(
      [
        {
          kind: "area",
          id: "r",
          polygon: square(5, 5, 15),
          color: TEST_PATTERN_COLOUR,
          attrs: {},
          trimAfter: "auto",
        },
      ],
      pique,
      { widthMm: 116, heightMm: 85 },
    );
    expect(template.objects[0]).toMatchObject({ kind: "tatami" });
    const wanted = pathsOf(template.svg)[0]!;
    const a1 = pathById(own.svg, "A1");
    expect(withoutTrim(inkOf(a1))).toEqual(inkOf(wanted));
    expect(getAttr(a1, "d")).toBe(getAttr(wanted, "d"));
    expect(getAttr(a1, "style")).toBe(getAttr(wanted, "style"));
  });

  it.each([1, 4.5])(
    "satin: a column of %s mm is what an order's 15-mm bar of that width becomes (without the routing)",
    (width) => {
      const own = buildTestPattern(pique, {
        satinWidthsMm: [width, width, width],
        satinSpacingsMm: [pique.satinSpacingMm, pique.satinSpacingMm, pique.satinSpacingMm],
      });
      const template = buildInkstitchTemplate(
        [
          {
            kind: "area",
            id: "r",
            polygon: polygonOf(rect(10, 10, width, 15)),
            color: TEST_PATTERN_COLOUR,
            attrs: {},
            trimAfter: "auto",
          },
        ],
        pique,
        { widthMm: 30, heightMm: 40 },
      );
      expect(template.objects[0]).toMatchObject({ kind: "satin" });
      const wanted = pathsOf(template.svg)[0]!;
      expect(withoutTrim(inkOf(pathById(own.svg, "B1-0")))).toEqual(inkOf(wanted));
      expect(getAttr(pathById(own.svg, "B1-0"), "style")).toBe(getAttr(wanted, "style"));
    },
  );
});

describe("other presets", () => {
  it("builds all six: the same layout, the preset's own values where the matrix leaves them", () => {
    for (const preset of Object.values(PRESETS)) {
      const q = buildTestPattern(preset);
      expect(q.fields, preset.id).toHaveLength(22);
      expect([q.widthMm, q.heightMm], preset.id).toEqual([116, 85]);
      expect(field(q, "C3").values, preset.id).toEqual({
        pullMm: preset.pullCompMm,
        pushMm: preset.pushCompMm,
      });
      expect(inkOf(pathById(q.svg, "A1")).staggers, preset.id).toBe(String(preset.fillStaggerRows));
      // 22 fields and the mark, each cut.
      expect(
        pathsOf(q.svg).filter((el) => inkOf(el).trim_after === "true"),
        preset.id,
      ).toHaveLength(23);
    }
  });
});

// ---------------------------------------------------------------------------
// The legend
// ---------------------------------------------------------------------------

describe("testPatternLegend", () => {
  const run = { name: "testmuster-pique", stitches: 8077, trims: 23, widthMm: 105.8, heightMm: 80 };
  let p: TestPattern;
  let lines: string[];
  beforeAll(() => {
    p = buildTestPattern(pique);
    lines = testPatternLegend(p, pique, run).split("\n");
  });

  it("heads it with the name, size, stitches, cuts and the preset — the German way, decimal comma", () => {
    expect(lines[0]).toBe(
      "testmuster-pique   105,8 × 80,0 mm   8.077 Stiche   23 Fadenschnitte   Preset pique",
    );
  });

  it("names the preset's backing or topping where it has one, and says nothing where it has none", () => {
    expect(lines.join("\n")).not.toContain("Stoffhinweis");
    const jersey = testPatternLegend(buildTestPattern(PRESETS.jersey), PRESETS.jersey, {
      ...run,
      name: "testmuster-jersey",
    }).split("\n");
    expect(jersey[1]).toBe("  Stoffhinweis: Schneidvlies");
    const fleece = testPatternLegend(buildTestPattern(PRESETS.fleece), PRESETS.fleece, run);
    expect(fleece).toContain("Stoffhinweis: Topping (wasserlösliche Folie) empfohlen");
  });

  it("lists every field once with its id, its place and its values", () => {
    for (const f of p.fields) {
      const own = lines.filter((l) => l.startsWith(`  ${f.id} `));
      expect(own, f.id).toHaveLength(1);
      expect(own[0], f.id).toContain(f.place);
      expect(own[0], f.id).toContain(f.text);
    }
    expect(field(p, "A1").place).toBe("Block A, oben links");
    expect(field(p, "A2").place).toBe("Block A, oben Mitte");
    expect(field(p, "A5").place).toBe("Block A, Mitte");
    expect(field(p, "A6").place).toBe("Block A, Mitte rechts");
    expect(field(p, "B9").place).toBe("Block B, unten rechts");
    expect(field(p, "C1").place).toBe("Block C, 1. von links");
    expect(field(p, "C4").place).toBe("Block C, 4. von links");
    expect(field(p, "A1").text).toBe("Reihenabstand 0,19 mm, Stichlänge 3,0 mm");
    expect(field(p, "A9").text).toBe("Reihenabstand 0,24 mm, Stichlänge 5,0 mm");
    expect(field(p, "B1").text).toBe(
      "Breite 1,0 mm, Abstand 0,34 mm (Zugausgleich 0,05 mm je Seite, Mittellauf)",
    );
    expect(field(p, "B3").text).toBe(
      "Breite 4,5 mm, Abstand 0,34 mm (Zugausgleich 0,135 mm je Seite, Kontur + Zickzack)",
    );
    expect(field(p, "C1").text).toBe("Zug 0,00 mm, Schub 0,00 mm");
    expect(field(p, "C3").text).toBe("Zug 0,20 mm, Schub 0,10 mm (Werte des Presets)");
  });

  it("tells how block C is read: caliper, width along the rows and height across, target 20.0 × 20.0 mm", () => {
    expect(lines).toContain(
      "  Breite (entlang der Reihen) und Höhe (quer) mit dem Messschieber messen; Soll 20,0 × 20,0 mm.",
    );
  });

  it("says where the matrix lies: the mark, and which blocks read in which direction", () => {
    const text = lines.join("\n");
    expect(text).toContain("Lagemarke");
    expect(text).toContain(
      "Quadrate 15 × 15 mm, Reihen unter 45° (von links oben nach rechts unten)",
    );
    expect(text).toContain("Zeilen (von oben nach unten): Reihenabstand 0,19 / 0,21 / 0,24 mm");
    expect(text).toContain("Spalten (von links nach rechts): Stichlänge 3,0 / 4,0 / 5,0 mm");
    expect(text).toContain("Zeilen (von oben nach unten): Zickzack-Abstand 0,34 / 0,38 / 0,42 mm");
    expect(text).toContain("Spalten (von links nach rechts): Breite 1,0 / 2,5 / 4,5 mm");
  });

  it("reads the hoop of the preset against the size: fits the standard hoop, not the cap frame", () => {
    expect(lines.join("\n")).toContain("Rahmen: passt in 360 × 200 mm (Standard 800 U/min)");
    const cap = testPatternLegend(buildTestPattern(PRESETS.cap), PRESETS.cap, {
      ...run,
      name: "testmuster-cap",
    });
    expect(cap).toContain("Rahmen: passt NICHT in 130 × 60 mm (Cap-Rahmen), auch gedreht nicht");
    // 300 × 190 mm stands in a 360 × 200 mm hoop only turned by 90°.
    const turned = testPatternLegend(p, pique, { ...run, widthMm: 190, heightMm: 300 });
    expect(turned).toContain(
      "Rahmen: passt nur um 90° gedreht in 360 × 200 mm (Standard 800 U/min)",
    );
  });

  it("leaves room to write the results down, and ends with a line break", () => {
    const text = lines.join("\n");
    expect(text).toContain("gemessen: Breite ______ mm, Höhe ______ mm");
    expect(text).toContain("Bestes Feld");
    expect(text.endsWith("\n")).toBe(true);
  });

  it("is the same text for the same input", () => {
    expect(testPatternLegend(p, pique, run)).toBe(testPatternLegend(p, pique, run));
  });
});
