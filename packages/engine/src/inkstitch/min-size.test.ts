import { beforeAll, describe, expect, it } from "vitest";
import type { Polygon } from "@texma-stitch/geometry";
import { initGeometry, intersect, polygonArea } from "@texma-stitch/geometry";
import {
  areaShape,
  gapBlocks,
  L_SHAPE,
  letterT,
  lineShape,
  polygonOf,
  pinwheel,
  pt,
  punzeDisc,
  rect,
  rimAndBody,
  slotBlock,
} from "../../test/fixtures/shapes.js";
import {
  aloneScene,
  barAt,
  fadingScene,
  lineNeighbourScene,
  scaledAt,
  shadowScene,
  tScene,
} from "../../test/fixtures/gate.js";
import { PRESETS } from "../presets.js";
import { classifyShape, SATIN_FROM_MM } from "./classify.js";
import { satinColumns } from "./columns.js";
import {
  checkMinimumSize,
  GAP_MIN_MM,
  GAP_SAMPLE_MM,
  GAP_SLIVER_MM,
  GAP_THIN_MM,
  holdsFromWidth,
  measureShapes,
  SATIN_STROKE_MIN_MM,
  SHADOW_LINE_MIN_MM,
} from "./min-size.js";
import { buildInkstitchTemplate } from "./template.js";

beforeAll(async () => {
  await initGeometry();
});

const GRAY = "#bebebe";
const BLACK = "#000000";
/** The ordered logo width the cases are run at. */
const B = 80;

const bar = (widthMm: number, lenMm = 40): Polygon => polygonOf(rect(0, 0, lenMm, widthMm));
const shift = (poly: Polygon, dx: number, dy: number): Polygon => ({
  outer: poly.outer.map((p) => pt(p.x + dx, p.y + dy)),
  holes: poly.holes.map((h) => h.map((p) => pt(p.x + dx, p.y + dy))),
});
/** A black form over the gap of `gapBlocks(0.5)`: x 9 to 12 covers 10 to 10.5 with room. */
const coverOverGap = (h = 7): Polygon => polygonOf(rect(9, -1, 3, h));

describe("constants (spec §5.2)", () => {
  it("carries the decided limits and the filter values of the second version", () => {
    expect(SATIN_STROKE_MIN_MM).toBe(1.3);
    expect(GAP_MIN_MM).toBe(0.8);
    // Slivers under 0.01 mm come off (an opening by half of it), the width is read every 0.1 mm,
    // and a piece under 0.1 mm — the DST resolution — is not a gap.
    expect(GAP_SLIVER_MM).toBe(0.01);
    expect(GAP_SAMPLE_MM).toBe(0.1);
    expect(GAP_THIN_MM).toBe(0.1);
  });

  it("carries the limit of a shadow line, 30.09.2026: 0.7 mm — where satin starts, so it always holds", () => {
    expect(SHADOW_LINE_MIN_MM).toBe(0.7);
    expect(SHADOW_LINE_MIN_MM).toBe(SATIN_FROM_MM);
  });
});

describe("holdsFromWidth", () => {
  it("is the ordered width times the limit over the measured width", () => {
    expect(holdsFromWidth(80, 1.3, 0.88)).toBeCloseTo(118.1818, 3);
    expect(holdsFromWidth(80, 0.8, 0.5)).toBeCloseTo(128, 9);
  });

  it("is the ordered width itself where the element measures exactly the limit", () => {
    expect(holdsFromWidth(80, 1.3, 1.3)).toBeCloseTo(80, 9);
  });
});

describe("checkMinimumSize — satin strokes and the minimum size", () => {
  it("flags a satin stroke under 1.3 mm and names the width it holds from", () => {
    const r = checkMinimumSize([areaShape("balken", bar(1.0))], { widthMm: B });
    expect(r.findings).toHaveLength(1);
    const f = r.findings[0]!;
    expect(f.kind).toBe("satin-stroke");
    expect(f.id).toBe("balken");
    expect(f.color).toBe(BLACK);
    expect(f.limitMm).toBe(1.3);
    expect(f.measure).toBe("median");
    expect(f.measuredMm).toBeGreaterThan(0.95);
    expect(f.measuredMm).toBeLessThan(1.1);
    expect(f.holdsFromWidthMm).toBeCloseTo((B * 1.3) / f.measuredMm, 9);
    // What the finding carries for the preview: the shape itself, and where it is.
    expect(polygonArea(f.polygon)).toBeCloseTo(40 * 1.0, 6);
    expect(f.at.x).toBeCloseTo(20, 6);
    expect(f.at.y).toBeCloseTo(0.5, 6);
  });

  it("takes the minimum size from the satin strokes: the width from which all are 1.3 mm", () => {
    const r = checkMinimumSize([areaShape("balken", bar(1.0))], { widthMm: B });
    const f = r.findings[0]!;
    expect(r.minimumWidthMm).toBe(f.holdsFromWidthMm);
    expect(r.minimumWidthMm!).toBeGreaterThan(B);
    // The stroke that sets it is named.
    expect(r.decisive).toBe(f);
  });

  it("lets the narrowest of several strokes decide", () => {
    const r = checkMinimumSize(
      [
        areaShape("breit", shift(bar(1.2), 0, 10)),
        areaShape("schmal", bar(0.9)),
        areaShape("gut", shift(bar(2.0), 0, 20)),
      ],
      { widthMm: B },
    );
    expect(r.findings.map((f) => f.id)).toEqual(["schmal", "breit"]);
    expect(r.decisive!.id).toBe("schmal");
    expect(r.minimumWidthMm).toBe(r.findings[0]!.holdsFromWidthMm);
  });

  it("measures it the way the classification does, one width for both", () => {
    const shape = bar(1.1);
    const r = checkMinimumSize([areaShape("balken", shape)], { widthMm: B });
    expect(r.findings[0]!.measuredMm).toBe(classifyShape(shape, "balken").widthMm);
  });

  it("names a thin satin stroke as a possible decorative line, better as a running stitch", () => {
    const r = checkMinimumSize([areaShape("zier", bar(0.9))], { widthMm: B });
    expect(r.findings[0]!.runningAlternative).toBe(true);
  });

  it("leaves a stroke of 1.5 mm alone and says how far the logo could shrink", () => {
    const r = checkMinimumSize([areaShape("balken", bar(1.5))], { widthMm: B });
    expect(r.findings).toEqual([]);
    // Every stroke holds at the ordered width; the minimum is where the narrowest reaches 1.3 mm.
    expect(r.decisive!.id).toBe("balken");
    expect(r.minimumWidthMm).toBeCloseTo(holdsFromWidth(B, 1.3, r.decisive!.measuredMm), 9);
    expect(r.minimumWidthMm!).toBeGreaterThan(65);
    expect(r.minimumWidthMm!).toBeLessThan(72);
  });

  it("does not count a hairline: under 0.7 mm it is a running stitch, not a satin stroke", () => {
    const r = checkMinimumSize([areaShape("haar", bar(0.5))], { widthMm: B });
    expect(r.findings).toEqual([]);
    expect(r.minimumWidthMm).toBeUndefined();
    expect(r.decisive).toBeUndefined();
  });

  it("does not count a wide area", () => {
    const r = checkMinimumSize([areaShape("platte", bar(8, 8))], { widthMm: B });
    expect(r.findings).toEqual([]);
    expect(r.minimumWidthMm).toBeUndefined();
  });

  it("has a minimum size for a logo without any stroke of its own: none", () => {
    const r = checkMinimumSize([], { widthMm: B });
    expect(r.minimumWidthMm).toBeUndefined();
    expect(r.decisive).toBeUndefined();
    expect(r.widthMm).toBe(B);
  });

  it("holds from a larger width the larger the logo was ordered — the formula is linear", () => {
    const shapes = [areaShape("balken", bar(1.0))];
    const at80 = checkMinimumSize(shapes, { widthMm: 80 });
    const at160 = checkMinimumSize(shapes, { widthMm: 160 });
    expect(at160.minimumWidthMm).toBeCloseTo(2 * at80.minimumWidthMm!, 6);
  });
});

describe("checkMinimumSize — shadow lines: limit 0.7 mm instead of 1.3 mm (spec §5.2, 30.09.2026)", () => {
  type Result = ReturnType<typeof checkMinimumSize>;
  const strokes = (r: Result) => r.findings.filter((f) => f.kind === "satin-stroke");

  it("leaves a bar of 0.9 mm alone when another form lies 0.5 mm from it: a shadow line", () => {
    const r = checkMinimumSize(shadowScene(0.5), { widthMm: B });
    expect(strokes(r)).toEqual([]);
    expect(r.shadowLines).toEqual(["schatten"]);
  });

  it("flags the same bar standing alone, against 1.3 mm", () => {
    const r = checkMinimumSize(aloneScene(), { widthMm: B });
    expect(strokes(r)).toHaveLength(1);
    expect(strokes(r)[0]!.id).toBe("schatten");
    expect(strokes(r)[0]!.limitMm).toBe(1.3);
    expect(strokes(r)[0]!.shadowLine).toBe(false);
    expect(r.shadowLines).toEqual([]);
  });

  it("does not hang the limit on the width: a stroke of 1.2 mm is a finding alone and none at a gap", () => {
    expect(strokes(checkMinimumSize(aloneScene(1.2), { widthMm: B }))).toHaveLength(1);
    const beside = checkMinimumSize(shadowScene(0.5, 1.2), { widthMm: B });
    expect(strokes(beside)).toEqual([]);
    expect(beside.shadowLines).toEqual(["schatten"]);
  });

  it("measures the gap like §7.8.3 rule 1: under 1.0 mm is a gap, 1.0 mm and more is none", () => {
    expect(strokes(checkMinimumSize(shadowScene(0.95), { widthMm: B }))).toEqual([]);
    expect(strokes(checkMinimumSize(shadowScene(1.05), { widthMm: B }))).toHaveLength(1);
  });

  it("does not count a form that touches or overlaps, nor a gap under 0.1 mm: no fabric to keep open", () => {
    for (const gap of [0, 0.05]) {
      const r = checkMinimumSize(shadowScene(gap), { widthMm: B });
      expect(strokes(r), `gap ${gap}`).toHaveLength(1);
      expect(r.shadowLines, `gap ${gap}`).toEqual([]);
    }
    const over = [
      areaShape("schatten", barAt(0, 0, 40, 0.9), "#d1b35a"),
      areaShape("buchstabe", barAt(0, 0.5, 40, 3), "#c8102e"),
    ];
    expect(strokes(checkMinimumSize(over, { widthMm: B }))).toHaveLength(1);
    // From 0.15 mm on the gap counts.
    expect(strokes(checkMinimumSize(shadowScene(0.15), { widthMm: B }))).toEqual([]);
  });

  it("takes a neighbour of the same colour, and of any other: 'gleich welcher Farbe, nicht dieselbe Form'", () => {
    const same = shadowScene(0.5).map((s) => (s.kind === "area" ? { ...s, color: "#d1b35a" } : s));
    const r = checkMinimumSize(same, { widthMm: B });
    expect(strokes(r)).toEqual([]);
    expect(r.shadowLines).toEqual(["schatten"]);
  });

  it("takes a stroked line for a form, as the template does (its cover is a strip of 0.5 mm)", () => {
    expect(strokes(checkMinimumSize(lineNeighbourScene(0.5), { widthMm: B }))).toEqual([]);
    expect(strokes(checkMinimumSize(lineNeighbourScene(1.2), { widthMm: B }))).toHaveLength(1);
  });

  it("does not depend on the order of the shapes in the document", () => {
    const reversed = [...shadowScene(0.5)].reverse();
    const r = checkMinimumSize(reversed, { widthMm: B });
    expect(strokes(r)).toEqual([]);
    expect(r.shadowLines).toEqual(["schatten"]);
  });

  it("needs only one column of a shape with several at a fabric gap: the stem of a T, or its crossbar", () => {
    // The T has two columns; the block lies at a gap from one of them and 1.1 mm from the other.
    const plan = satinColumns(letterT(14, 10, 0.9), { underlapMm: PRESETS.pique.underlapMm });
    expect(plan.columns).toHaveLength(2);
    for (const near of ["stem", "bar"] as const) {
      const r = checkMinimumSize(tScene(near), { widthMm: B });
      expect(strokes(r), near).toEqual([]);
      expect(r.shadowLines, near).toEqual(["t"]);
    }
    const free = checkMinimumSize(tScene("none"), { widthMm: B });
    expect(strokes(free)).toHaveLength(1);
    expect(strokes(free)[0]!.id).toBe("t");
  });

  it("takes the limit of a shadow line as the limit of the stroke: the minimum size is where it is 0.7 mm wide", () => {
    const r = checkMinimumSize(shadowScene(0.5), { widthMm: B });
    const d = r.decisive!;
    expect(d.id).toBe("schatten");
    expect(d.shadowLine).toBe(true);
    expect(d.limitMm).toBe(0.7);
    expect(d.holdsFromWidthMm).toBeCloseTo((B * 0.7) / d.measuredMm, 9);
    expect(r.minimumWidthMm).toBe(d.holdsFromWidthMm);
    // It holds already: the logo could shrink to about three quarters of its size.
    expect(r.minimumWidthMm!).toBeLessThan(B);
  });

  it("lets the stroke that asks for the most decide — not the narrowest, where the limits differ", () => {
    // A shadow line of 0.75 mm holds from ~0.93 times the size; a free stroke of 1.0 mm from 1.3 times.
    const r = checkMinimumSize(
      [...shadowScene(0.5, 0.75), areaShape("frei", barAt(0, 30, 40, 1.0), "#000000")],
      { widthMm: B },
    );
    expect(r.decisive!.id).toBe("frei");
    expect(r.minimumWidthMm).toBe(r.decisive!.holdsFromWidthMm);
    expect(r.minimumWidthMm!).toBeGreaterThan(B);
  });

  it("takes the limit of a shadow line as an option, and says so on the finding", () => {
    const r = checkMinimumSize(shadowScene(0.5), { widthMm: B, shadowMinMm: 1.0 });
    expect(strokes(r)).toHaveLength(1);
    expect(strokes(r)[0]!.limitMm).toBe(1.0);
    expect(strokes(r)[0]!.shadowLine).toBe(true);
    expect(r.limits.shadowMinMm).toBe(1.0);
  });

  it("counts only the strokes the lower limit matters for: a wide stroke at a gap is no shadow line", () => {
    // The red letter stroke of 3 mm has a rail at the gap as well; its limit is 1.3 mm either way.
    const r = checkMinimumSize(shadowScene(0.5), { widthMm: B });
    expect(r.shadowLines).toEqual(["schatten"]);
  });

  it("loses the lower limit where the drawing grows and the gap with it: 0.9 mm at 80 mm, 1.01 mm at 90 mm", () => {
    // The gap is measured in the millimetres of the size the check runs at — a shadow line at one
    // size is an ordinary stroke at another, and too narrow for a while after it (spec §5.2).
    const shapes = fadingScene();
    const at80 = checkMinimumSize(shapes, { widthMm: 80 });
    expect(strokes(at80)).toEqual([]);
    expect(at80.shadowLines).toEqual(["schatten"]);
    const at90 = checkMinimumSize(scaledAt(shapes)(90), { widthMm: 90 });
    expect(at90.shadowLines).toEqual([]);
    expect(strokes(at90)).toHaveLength(1);
    expect(strokes(at90)[0]!.limitMm).toBe(1.3);
  });

  it("agrees with the template: a stroke is a shadow line where the template leaves a rail without compensation", () => {
    for (const gap of [0, 0.05, 0.15, 0.5, 0.95, 1.05, 2]) {
      const shapes = shadowScene(gap);
      const r = checkMinimumSize(shapes, { widthMm: B });
      const template = buildInkstitchTemplate(shapes, PRESETS.pique, {
        widthMm: B,
        heightMm: 30,
        order: "colour",
        knockdown: true,
      });
      const atGap = template.railPull!.gaps.some((g) => g.id.startsWith("schatten"));
      expect(r.shadowLines.includes("schatten"), `gap ${gap}`).toBe(atGap);
    }
  });

  it("agrees with the template for the shapes that have several columns, and for a line as neighbour", () => {
    for (const shapes of [
      tScene("stem"),
      tScene("bar"),
      tScene("none"),
      lineNeighbourScene(0.5),
      lineNeighbourScene(1.2),
    ]) {
      const id = shapes[0]!.id;
      const r = checkMinimumSize(shapes, { widthMm: B });
      const template = buildInkstitchTemplate(shapes, PRESETS.pique, {
        widthMm: B,
        heightMm: 30,
        order: "colour",
        knockdown: true,
      });
      const atGap = template.railPull!.gaps.some((g) => g.id.startsWith(`${id}-`));
      expect(r.shadowLines.includes(id), JSON.stringify(shapes.map((s) => s.id))).toBe(atGap);
    }
  });

  it("finds the same again for the same input", () => {
    const shapes = [...tScene("stem"), ...shadowScene(0.5).map((s) => ({ ...s, id: `x${s.id}` }))];
    expect(checkMinimumSize(shapes, { widthMm: B })).toEqual(checkMinimumSize(shapes, { widthMm: B }));
  });
});

describe("measureShapes (what the check reads of every area shape at the size it runs at)", () => {
  it("gives class and median width of every area shape, in document order; lines are left out", () => {
    const shapes = [
      areaShape("lauf", barAt(0, 0, 40, 0.5)),
      areaShape("satin", barAt(0, 10, 40, 2.0)),
      areaShape("tatami", barAt(0, 20, 40, 8)),
      lineShape("linie", [pt(0, 40), pt(40, 40)]),
    ];
    const m = measureShapes(shapes, {});
    expect(m.map((x) => [x.id, x.shapeClass])).toEqual([
      ["lauf", "running"],
      ["satin", "satin"],
      ["tatami", "tatami"],
    ]);
    expect(m[0]!.widthMm).toBeGreaterThan(0.45);
    expect(m[0]!.widthMm).toBeLessThan(0.7);
    expect(m[1]!.widthMm).toBeCloseTo(classifyShape(barAt(0, 10, 40, 2.0), "satin").widthMm, 9);
    expect(m[2]!.widthMm).toBeGreaterThanOrEqual(5);
  });

  it("finds the rail gaps of a satin stroke: the one rail at the neighbour, not the free one", () => {
    const m = measureShapes(shadowScene(0.5), {});
    const schatten = m.find((x) => x.id === "schatten")!;
    expect(schatten.shadowLine).toBe(true);
    expect(schatten.railGapsMm).toHaveLength(1);
    expect(schatten.railGapsMm[0]!).toBeCloseTo(0.5, 2);
    // The neighbour's rail at the same gap counts for it too: the flag says nothing of the width.
    expect(m.find((x) => x.id === "buchstabe")!.shadowLine).toBe(true);
  });

  it("has no rail gap for a stroke alone, and does not look for columns of a wide shape", () => {
    const m = measureShapes([...aloneScene(), areaShape("platte", barAt(0, 20, 8, 8))], {});
    expect(m.every((x) => !x.shadowLine && x.railGapsMm.length === 0)).toBe(true);
  });

  it("leaves a running stitch without columns unless asked: a stroke that is no satin has no rails", () => {
    const shapes = [
      areaShape("lauf", barAt(0, 0, 40, 0.5), "#d1b35a"),
      areaShape("buchstabe", barAt(0, 1.0, 40, 3), "#c8102e"),
    ];
    const plain = measureShapes(shapes, {});
    expect(plain[0]!.shapeClass).toBe("running");
    expect(plain[0]!.shadowLine).toBe(false);
    expect(plain[0]!.railGapsMm).toEqual([]);
    expect(plain[0]!.hypothetical).toBe(false);
  });

  it("with `running`, reads what a running stitch would have as a satin stroke: its rails as a hypothesis", () => {
    const shapes = [
      areaShape("lauf", barAt(0, 0, 40, 0.5), "#d1b35a"),
      areaShape("buchstabe", barAt(0, 1.0, 40, 3), "#c8102e"),
    ];
    const m = measureShapes(shapes, { running: true });
    expect(m[0]!.shapeClass).toBe("running");
    expect(m[0]!.hypothetical).toBe(true);
    expect(m[0]!.railGapsMm).toHaveLength(1);
    expect(m[0]!.railGapsMm[0]!).toBeCloseTo(0.5, 2);
    // A satin shape is not a hypothesis.
    expect(m[1]!.hypothetical).toBe(false);
  });

  it("reads the fading shadow line: a gap of 0.9 mm is a rail gap today, and is what it loses the limit at", () => {
    const m = measureShapes(fadingScene(), {});
    const s = m.find((x) => x.id === "schatten")!;
    expect(s.shadowLine).toBe(true);
    expect(s.railGapsMm[0]!).toBeCloseTo(0.9, 2);
  });
});

describe("checkMinimumSize — gaps within a colour", () => {
  it("finds the gap between two blocks of one colour, narrower than 0.8 mm", () => {
    const [a, b] = gapBlocks(0.5);
    const r = checkMinimumSize([areaShape("a", a, GRAY), areaShape("b", b, GRAY)], { widthMm: B });
    expect(r.findings).toHaveLength(1);
    const f = r.findings[0]!;
    expect(f.kind).toBe("gap");
    expect(f.color).toBe(GRAY);
    expect(f.id).toBe("gap-bebebe-001");
    expect(f.limitMm).toBe(0.8);
    expect(f.measure).toBe("median");
    // The median width of the piece, read every 0.1 mm: a strip of 0.5 mm reads 0.51.
    expect(f.measuredMm).toBeGreaterThan(0.47);
    expect(f.measuredMm).toBeLessThan(0.56);
    expect(f.holdsFromWidthMm).toBeCloseTo((B * 0.8) / f.measuredMm, 9);
    expect(f.runningAlternative).toBe(false);
    // The piece is the strip between the blocks: 0.5 mm wide, the height of the blocks.
    expect(polygonArea(f.polygon)).toBeGreaterThan(0.9 * 0.5 * 5);
    expect(polygonArea(f.polygon)).toBeLessThan(0.5 * 5 + 1e-6);
    expect(f.at.x).toBeCloseTo(10.25, 1);
    expect(f.at.y).toBeCloseTo(2.5, 1);
  });

  it("reads a gap of 0.2 mm as 0.22, not as the 0.32 the standard sampling reads", () => {
    const [a, b] = gapBlocks(0.2);
    const r = checkMinimumSize([areaShape("a", a, GRAY), areaShape("b", b, GRAY)], { widthMm: B });
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]!.measuredMm).toBeGreaterThan(0.19);
    expect(r.findings[0]!.measuredMm).toBeLessThan(0.26);
    expect(r.gapsOpenFromWidthMm).toBeGreaterThan(B * 3);
  });

  it("leaves a gap of 0.9 mm alone", () => {
    const [a, b] = gapBlocks(0.9);
    const r = checkMinimumSize([areaShape("a", a, GRAY), areaShape("b", b, GRAY)], { widthMm: B });
    expect(r.findings).toEqual([]);
  });

  it("looks per colour: the same gap between two colours is no gap of a colour", () => {
    // Fabric between two colours is looked for over all shapes together (see below): it is
    // not the gap of either colour, and it is reported as its own kind.
    const [a, b] = gapBlocks(0.5);
    const r = checkMinimumSize([areaShape("a", a, GRAY), areaShape("b", b, "#c8102e")], {
      widthMm: B,
    });
    expect(r.findings.filter((f) => f.kind === "gap")).toEqual([]);
    expect(r.findings.map((f) => f.kind)).toEqual(["fabric-gap"]);
  });

  it("does not see a gap where two shapes of one colour overlap", () => {
    const r = checkMinimumSize(
      [
        areaShape("a", polygonOf(rect(0, 0, 10, 5)), GRAY),
        areaShape("b", polygonOf(rect(9, 0, 10, 5)), GRAY),
      ],
      { widthMm: B },
    );
    expect(r.findings).toEqual([]);
  });

  it("finds the channel between a rim and its body — 0.25 mm all the way round", () => {
    // The double contour of varsity lettering (STUTTGART, 80 mm): the fabric shows through.
    const [rim, body] = rimAndBody(0.25);
    const r = checkMinimumSize([areaShape("rand", rim, GRAY), areaShape("koerper", body, GRAY)], {
      widthMm: B,
    });
    expect(r.findings).toHaveLength(1);
    const f = r.findings[0]!;
    expect(f.kind).toBe("gap");
    expect(f.polygon.holes).toHaveLength(1); // a ring: the body stands in it
    expect(f.measuredMm).toBeGreaterThan(0.22);
    expect(f.measuredMm).toBeLessThan(0.3);
    // 80 mm × 0.8 ÷ 0.25: the logo would have to be about 256 mm wide.
    expect(f.holdsFromWidthMm).toBeGreaterThan(200);
    expect(f.holdsFromWidthMm).toBeLessThan(290);
  });

  it("puts the mark of a ring on the ring, not in its empty middle", () => {
    // The centre of the box of a channel that runs round a body is inside the body; `at` is
    // where to look, so it is a point of the piece — the same for a satin ring.
    const [rim, body] = rimAndBody(0.25);
    const r = checkMinimumSize([areaShape("rand", rim, GRAY), areaShape("koerper", body, GRAY)], {
      widthMm: B,
    });
    const gap = r.findings[0]!;
    const onOutline = (f: (typeof r.findings)[number]): boolean =>
      [f.polygon.outer, ...f.polygon.holes].some((ring) =>
        ring.some((p) => p.x === f.at.x && p.y === f.at.y),
      );
    expect(gap.polygon.holes).toHaveLength(1);
    expect(onOutline(gap)).toBe(true);

    const thin = polygonOf(rect(0, 0, 20, 12), [rect(1, 1, 18, 10).reverse()]); // a wall of 1 mm
    const stroke = checkMinimumSize([areaShape("wand", thin)], { widthMm: B }).findings[0]!;
    expect(stroke.kind).toBe("satin-stroke");
    expect(onOutline(stroke)).toBe(true);
  });

  it("keeps the centre of the box where it lies on the piece", () => {
    const [a, b] = gapBlocks(0.5);
    const r = checkMinimumSize([areaShape("a", a, GRAY), areaShape("b", b, GRAY)], { widthMm: B });
    expect(r.findings[0]!.at.x).toBeCloseTo(10.25, 6);
    expect(r.findings[0]!.at.y).toBeCloseTo(2.5, 1);
  });

  it("leaves a channel of 0.9 mm open", () => {
    const [rim, body] = rimAndBody(0.9);
    const r = checkMinimumSize([areaShape("rand", rim, GRAY), areaShape("koerper", body, GRAY)], {
      widthMm: B,
    });
    expect(r.findings).toEqual([]);
  });

  it("finds the slit between the legs of an R — 0.44 mm wide, a little over a millimetre deep", () => {
    const r = checkMinimumSize([areaShape("r", slotBlock(0.44, 1.2), GRAY)], { widthMm: B });
    expect(r.findings).toHaveLength(1);
    const f = r.findings[0]!;
    expect(f.measure).toBe("median");
    expect(f.measuredMm).toBeGreaterThan(0.4);
    expect(f.measuredMm).toBeLessThan(0.52);
    expect(f.at.x).toBeCloseTo(5, 1);
  });

  it("finds a counter of 0.5 mm in a ring — a hole has no median width, its width is the inscribed one", () => {
    const r = checkMinimumSize([areaShape("ring", punzeDisc(0.5), GRAY)], { widthMm: B });
    expect(r.findings).toHaveLength(1);
    const f = r.findings[0]!;
    expect(f.kind).toBe("gap");
    // Said out loud: this width is the circle that fits in the hole, not a median width.
    expect(f.measure).toBe("inscribed-circle");
    expect(f.measuredMm).toBeGreaterThan(0.48);
    expect(f.measuredMm).toBeLessThan(0.52);
    expect(f.holdsFromWidthMm).toBeCloseTo((B * 0.8) / f.measuredMm, 9);
    expect(f.at.x).toBeCloseTo(0, 2);
    expect(f.at.y).toBeCloseTo(0, 2);
  });

  it("leaves a counter of 0.9 mm alone", () => {
    const r = checkMinimumSize([areaShape("ring", punzeDisc(0.9), GRAY)], { widthMm: B });
    expect(r.findings).toEqual([]);
  });

  it("counts a counter of 0.15 mm — its circle reaches the 0.1 mm the fabric can show", () => {
    const r = checkMinimumSize([areaShape("ring", punzeDisc(0.15), GRAY)], { widthMm: B });
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]!.measure).toBe("inscribed-circle");
    expect(r.findings[0]!.measuredMm).toBeCloseTo(0.15, 1);
  });

  it("does not count a counter of 0.08 mm — under 0.1 mm there is nothing on the fabric", () => {
    const r = checkMinimumSize([areaShape("ring", punzeDisc(0.08), GRAY)], { widthMm: B });
    expect(r.findings).toEqual([]);
    expect(r.ignored.thin).toBe(1);
  });

  it("takes a sliver off before measuring: a gap of 0.008 mm is a seam, not a gap", () => {
    // Two blocks that meet with a hairline between them, as vectorised logos have. Closed, the
    // seam is a strip of 0.04 mm² — more than the old area floor let through. The opening by
    // 0.005 mm leaves nothing of it.
    const [a, b] = gapBlocks(0.008);
    const r = checkMinimumSize([areaShape("a", a, GRAY), areaShape("b", b, GRAY)], { widthMm: B });
    expect(r.findings).toEqual([]);
    expect(r.gapPieces).toBe(1);
    expect(r.ignored.slivers).toBe(1);
    expect(r.gapParts).toBe(0);
  });

  it("does not count a hairline of 0.02 mm either: it has no medial axis", () => {
    // Wider than a sliver, so it survives the opening — but at the standard sampling there is
    // no axis in a strip this thin, and a piece without one does not count (spec §5.2, rule 4).
    const [a, b] = gapBlocks(0.02);
    const r = checkMinimumSize([areaShape("a", a, GRAY), areaShape("b", b, GRAY)], { widthMm: B });
    expect(r.findings).toEqual([]);
    expect(r.ignored.slivers).toBe(0);
    expect(r.ignored.compact).toBe(1);
  });

  it("does not take the rounding of a concave corner for a gap, and says it left it out", () => {
    // The closing rounds the inner corner of an L with a quarter circle of 0.4 mm: 0.03 to 0.04 mm²
    // of area — but a corner, a piece without a medial axis.
    const r = checkMinimumSize([areaShape("l", L_SHAPE, GRAY)], { widthMm: B });
    expect(r.findings).toEqual([]);
    expect(r.gapPieces).toBe(1);
    expect(r.ignored).toEqual({ slivers: 0, thin: 0, compact: 1, wide: 0, covered: 0 });
  });

  it("does not count a short gap between two small shapes: no medial axis (a blind spot)", () => {
    // 0.5 mm apart, but each shape only 1 mm across: the piece is 0.5 × 1 mm and has no axis.
    const r = checkMinimumSize(
      [
        areaShape("a", polygonOf(rect(0, 0, 1, 1)), GRAY),
        areaShape("b", polygonOf(rect(1.5, 0, 1, 1)), GRAY),
      ],
      { widthMm: B },
    );
    expect(r.findings).toEqual([]);
    expect(r.ignored.compact).toBe(1);
  });

  it("does not count a strip of 0.12 mm: the standard sampling finds no axis in it (a blind band)", () => {
    // Between 0.1 and 0.15 mm a real gap is left out, because the axis is looked for at the
    // standard sampling and only the width is read at 0.1 mm.
    const [a, b] = gapBlocks(0.12);
    const r = checkMinimumSize([areaShape("a", a, GRAY), areaShape("b", b, GRAY)], { widthMm: B });
    expect(r.findings).toEqual([]);
    expect(r.ignored.compact).toBe(1);
  });

  it("does not count a gap that a later form covers completely", () => {
    const [a, b] = gapBlocks(0.5);
    const r = checkMinimumSize(
      [
        areaShape("a", a, GRAY),
        areaShape("b", b, GRAY),
        areaShape("kontur", coverOverGap(), BLACK),
      ],
      { widthMm: B },
    );
    expect(r.findings).toEqual([]);
    expect(r.ignored.covered).toBe(1);
  });

  it("counts the same gap where the form lies under it — stitched earlier, it shows through", () => {
    const [a, b] = gapBlocks(0.5);
    const r = checkMinimumSize(
      [areaShape("grund", coverOverGap(), BLACK), areaShape("a", a, GRAY), areaShape("b", b, GRAY)],
      { widthMm: B },
    );
    expect(r.findings).toHaveLength(1);
    expect(r.ignored.covered).toBe(0);
  });

  it("counts a gap that a later form covers only in part", () => {
    const [a, b] = gapBlocks(0.5);
    const r = checkMinimumSize(
      [
        areaShape("a", a, GRAY),
        areaShape("b", b, GRAY),
        areaShape("kontur", coverOverGap(3), BLACK), // y -1 to 2 of a gap running 0 to 5
      ],
      { widthMm: B },
    );
    expect(r.findings).toHaveLength(1);
    expect(r.ignored.covered).toBe(0);
  });

  it("takes only areas for forms — a stroked line covers no gap and makes none", () => {
    const [a, b] = gapBlocks(0.5);
    const line = lineShape("linie", [pt(10.25, -1), pt(10.25, 6)], BLACK);
    const r = checkMinimumSize([areaShape("a", a, GRAY), areaShape("b", b, GRAY), line], {
      widthMm: B,
    });
    expect(r.findings).toHaveLength(1);
    expect(checkMinimumSize([line], { widthMm: B }).findings).toEqual([]);
  });

  it("numbers the pieces of a colour in reading order, whatever the filters do", () => {
    const [a, b] = gapBlocks(0.5);
    const [c, d] = gapBlocks(0.5);
    const r = checkMinimumSize(
      [
        areaShape("c", shift(c, 0, 20), GRAY),
        areaShape("d", shift(d, 0, 20), GRAY),
        areaShape("a", a, GRAY),
        areaShape("b", b, GRAY),
      ],
      { widthMm: B },
    );
    // The upper piece is `001` although the shapes of the lower one come first in the document.
    const byId = new Map(r.findings.map((f) => [f.id, f]));
    expect(byId.get("gap-bebebe-001")!.at.y).toBeCloseTo(2.5, 1);
    expect(byId.get("gap-bebebe-002")!.at.y).toBeCloseTo(22.5, 1);
  });
});

describe("checkMinimumSize — fabric gaps between colours (spec §5.2)", () => {
  const RED = "#c8102e";
  const GOLD = "#d1b35a";
  /** Area (mm²) that two polygons share. */
  const overlapMm2 = (p: Polygon, q: Polygon): number =>
    intersect([p], [q]).reduce((sum, x) => sum + polygonArea(x), 0);
  const gray = (id: string, poly: Polygon): ReturnType<typeof areaShape> =>
    areaShape(id, poly, GRAY);
  const red = (id: string, poly: Polygon): ReturnType<typeof areaShape> => areaShape(id, poly, RED);

  it("finds the fabric between two blocks of different colours 0.5 mm apart", () => {
    const [a, b] = gapBlocks(0.5);
    const r = checkMinimumSize([gray("a", a), red("b", b)], { widthMm: B });
    expect(r.findings).toHaveLength(1);
    const f = r.findings[0]!;
    expect(f.kind).toBe("fabric-gap");
    expect(f.id).toBe("fabric-001");
    // The colours it lies between, in the order of the document.
    expect(f.color).toBe(`${GRAY}+${RED}`);
    expect(f.limitMm).toBe(0.8);
    expect(f.measure).toBe("median");
    // Read every 0.1 mm like a gap within a colour: a strip of 0.5 mm reads 0.51.
    expect(f.measuredMm).toBeGreaterThan(0.47);
    expect(f.measuredMm).toBeLessThan(0.56);
    expect(f.holdsFromWidthMm).toBeCloseTo((B * 0.8) / f.measuredMm, 9);
    expect(f.runningAlternative).toBe(false);
    // The piece is the strip between the blocks: 0.5 mm wide, the height of the blocks.
    expect(polygonArea(f.polygon)).toBeGreaterThan(0.9 * 0.5 * 5);
    expect(polygonArea(f.polygon)).toBeLessThan(0.5 * 5 + 1e-6);
    expect(f.at.x).toBeCloseTo(10.25, 1);
    expect(f.at.y).toBeCloseTo(2.5, 1);
    // No colour has a gap of its own here.
    expect(r.gapPieces).toBe(0);
    expect(r.fabricPieces).toBe(1);
    expect(r.fabricParts).toBe(1);
  });

  it("leaves 1.0 mm of fabric between two colours alone", () => {
    const [a, b] = gapBlocks(1.0);
    const r = checkMinimumSize([gray("a", a), red("b", b)], { widthMm: B });
    expect(r.findings).toEqual([]);
    expect(r.fabricPieces).toBe(0);
  });

  it("sees no fabric where two colours overlap or abut", () => {
    const overlap = checkMinimumSize(
      [gray("a", polygonOf(rect(0, 0, 10, 5))), red("b", polygonOf(rect(9, 0, 10, 5)))],
      { widthMm: B },
    );
    const [a, b] = gapBlocks(0);
    const abut = checkMinimumSize([gray("a", a), red("b", b)], { widthMm: B });
    expect(overlap.findings).toEqual([]);
    expect(abut.findings).toEqual([]);
  });

  it("reports a place once that is the gap of a colour and fabric at the same time", () => {
    // The gap between two grey blocks. A red bar far away makes "all shapes" differ from grey,
    // but the strip between the blocks is the same in both closings — one finding, not two.
    const [a, b] = gapBlocks(0.5);
    const r = checkMinimumSize(
      [gray("a", a), gray("b", b), red("balken", shift(bar(3, 20), 0, 30))],
      {
        widthMm: B,
      },
    );
    expect(r.findings.map((f) => f.kind)).toEqual(["gap"]);
    expect(r.findings[0]!.id).toBe("gap-bebebe-001");
    // The closing of all shapes found the strip too, and left it to the colour.
    expect(r.fabricPieces).toBe(1);
    expect(r.fabricParts).toBe(0);
    expect(r.fabricIgnored.duplicate).toBe(1);
  });

  it("reports the strip between two grey blocks as the gap of grey and the channel over them as fabric", () => {
    // A red bar 0.5 mm above two grey blocks that are 0.5 mm apart: closed together the three
    // shapes leave a T. Its stem is the gap of grey; the bar of the T is new.
    const [a, b] = gapBlocks(0.5);
    const r = checkMinimumSize(
      [gray("a", a), gray("b", b), red("balken", polygonOf(rect(0, -3.5, 20.5, 3)))],
      { widthMm: B },
    );
    expect(r.findings.map((f) => f.kind).sort()).toEqual(["fabric-gap", "gap"]);
    const gap = r.findings.find((f) => f.kind === "gap")!;
    const fabric = r.findings.find((f) => f.kind === "fabric-gap")!;
    expect(gap.at.y).toBeCloseTo(2.5, 1);
    // The channel runs over both blocks, 0.5 mm high; the stem is not part of it.
    expect(fabric.at.x).toBeCloseTo(10.25, 1);
    expect(fabric.at.y).toBeCloseTo(-0.25, 1);
    expect(polygonArea(fabric.polygon)).toBeGreaterThan(0.9 * 0.5 * 20.5);
    expect(polygonArea(fabric.polygon)).toBeLessThan(0.5 * 20.5 + 0.02);
    expect(fabric.color).toBe(`${GRAY}+${RED}`);
    // Not a square millimetre is reported twice.
    expect(overlapMm2(fabric.polygon, gap.polygon)).toBeLessThan(1e-3);
    // The fabric piece was not a duplicate: only part of it belonged to the gap of grey.
    expect(r.fabricIgnored.duplicate).toBe(0);
  });

  it("finds the channel between a rim of one colour and a body of another — a ring", () => {
    const [rim, body] = rimAndBody(0.25);
    const r = checkMinimumSize([gray("rand", rim), red("koerper", body)], { widthMm: B });
    expect(r.findings).toHaveLength(1);
    const f = r.findings[0]!;
    expect(f.kind).toBe("fabric-gap");
    expect(f.polygon.holes).toHaveLength(1);
    expect(f.measuredMm).toBeGreaterThan(0.22);
    expect(f.measuredMm).toBeLessThan(0.3);
    expect(f.color).toBe(`${GRAY}+${RED}`);
  });

  it("finds the gap beside the shadow line of a letter — 0.53 mm between red and gold (Hofbräu, 110 mm)", () => {
    const r = checkMinimumSize(
      [
        red("buchstabe", polygonOf(rect(0, 0, 30, 2.4))),
        areaShape("schatten", polygonOf(rect(0, 2.93, 30, 0.75)), GOLD),
      ],
      { widthMm: 110 },
    );
    const fabric = r.findings.filter((f) => f.kind === "fabric-gap");
    expect(fabric).toHaveLength(1);
    expect(fabric[0]!.color).toBe(`${RED}+${GOLD}`);
    expect(fabric[0]!.measuredMm).toBeGreaterThan(0.5);
    expect(fabric[0]!.measuredMm).toBeLessThan(0.58);
    // 110 mm × 0.8 ÷ 0.53: the fabric between them stays open from about 166 mm.
    expect(r.gapsOpenFromWidthMm!).toBeGreaterThan(150);
    expect(r.gapsOpenFromWidthMm!).toBeLessThan(180);
    // The shadow line itself is a satin stroke of 0.75 mm. Until 30.09.2026 that was the other kind
    // of finding; with a rail at a fabric gap under 1.0 mm it is a shadow line, held to 0.7 mm.
    expect(r.findings.some((f) => f.kind === "satin-stroke")).toBe(false);
    expect(r.shadowLines).toEqual(["schatten"]);
  });

  it("finds the hole that four colours enclose together — measured by the circle that fits in it", () => {
    const [top, right, bottom, left] = pinwheel(0.5);
    const r = checkMinimumSize(
      [
        areaShape("o", top, "#111111"),
        areaShape("r", right, "#222222"),
        areaShape("u", bottom, "#333333"),
        areaShape("l", left, "#444444"),
      ],
      { widthMm: B },
    );
    expect(r.findings).toHaveLength(1);
    const f = r.findings[0]!;
    expect(f.kind).toBe("fabric-gap");
    expect(f.measure).toBe("inscribed-circle");
    expect(f.measuredMm).toBeGreaterThan(0.48);
    expect(f.measuredMm).toBeLessThan(0.52);
    expect(f.color).toBe("#111111+#222222+#333333+#444444");
    expect(f.at.x).toBeCloseTo(0.25, 2);
    expect(f.at.y).toBeCloseTo(0.25, 2);
  });

  it("calls the same hole the counter of a colour where one colour encloses it, and says so once", () => {
    const [top, right, bottom, left] = pinwheel(0.5);
    const r = checkMinimumSize(
      [gray("o", top), gray("r", right), gray("u", bottom), gray("l", left)],
      { widthMm: B },
    );
    expect(r.findings.map((f) => f.kind)).toEqual(["gap"]);
    expect(r.findings[0]!.measure).toBe("inscribed-circle");
    expect(r.fabricIgnored.duplicate).toBe(1);
    expect(r.fabricParts).toBe(0);
  });

  it("takes the same noise out: a seam of 0.008 mm between two colours is no fabric", () => {
    const [a, b] = gapBlocks(0.008);
    const r = checkMinimumSize([gray("a", a), red("b", b)], { widthMm: B });
    expect(r.findings).toEqual([]);
    expect(r.fabricPieces).toBe(1);
    expect(r.fabricIgnored.slivers).toBe(1);
    expect(r.fabricParts).toBe(0);
  });

  it("does not count a hairline of 0.02 mm between two colours either: no medial axis", () => {
    const [a, b] = gapBlocks(0.02);
    const r = checkMinimumSize([gray("a", a), red("b", b)], { widthMm: B });
    expect(r.findings).toEqual([]);
    expect(r.fabricIgnored.slivers).toBe(0);
    expect(r.fabricIgnored.compact).toBe(1);
  });

  it("does not take the rounding of an inner corner where two colours meet for fabric", () => {
    // The L of `lShape`, cut into its two arms: one grey, one red.
    const r = checkMinimumSize(
      [
        gray("waagrecht", polygonOf(rect(0, 0, 30, 8))),
        red("senkrecht", polygonOf(rect(0, 8, 8, 22))),
      ],
      { widthMm: B },
    );
    expect(r.findings).toEqual([]);
    expect(r.fabricPieces).toBe(1);
    expect(r.fabricIgnored.compact).toBe(1);
  });

  it("does not count a hole of 0.08 mm — under 0.1 mm there is nothing on the fabric", () => {
    const [top, right, bottom, left] = pinwheel(0.08);
    const r = checkMinimumSize(
      [
        areaShape("o", top, "#111111"),
        areaShape("r", right, "#222222"),
        areaShape("u", bottom, "#333333"),
        areaShape("l", left, "#444444"),
      ],
      { widthMm: B },
    );
    expect(r.findings).toEqual([]);
    expect(r.fabricIgnored.thin).toBe(1);
  });

  it("sees no fabric where a third shape lies over the gap, whatever its colour or place in the order", () => {
    const [a, b] = gapBlocks(0.5);
    const over = checkMinimumSize(
      [gray("a", a), red("b", b), areaShape("kontur", coverOverGap(), BLACK)],
      { widthMm: B },
    );
    const under = checkMinimumSize(
      [areaShape("grund", coverOverGap(), BLACK), gray("a", a), red("b", b)],
      { widthMm: B },
    );
    expect(over.findings).toEqual([]);
    expect(under.findings).toEqual([]);
  });

  it("takes only areas for shapes — a stroked line neither fills the fabric nor makes a gap", () => {
    const [a, b] = gapBlocks(0.5);
    const line = lineShape("linie", [pt(10.25, -1), pt(10.25, 6)], BLACK);
    const r = checkMinimumSize([gray("a", a), red("b", b), line], { widthMm: B });
    expect(r.findings.map((f) => f.kind)).toEqual(["fabric-gap"]);
    expect(checkMinimumSize([line], { widthMm: B }).fabricPieces).toBe(0);
  });

  it("numbers the pieces in reading order over all colours, whatever the document order", () => {
    const [a, b] = gapBlocks(0.5);
    const [c, d] = gapBlocks(0.5);
    const r = checkMinimumSize(
      [gray("c", shift(c, 0, 20)), red("d", shift(d, 0, 20)), gray("a", a), red("b", b)],
      { widthMm: B },
    );
    const byId = new Map(r.findings.map((f) => [f.id, f]));
    expect(byId.get("fabric-001")!.at.y).toBeCloseTo(2.5, 1);
    expect(byId.get("fabric-002")!.at.y).toBeCloseTo(22.5, 1);
  });

  it("counts toward the second number, and leaves the minimum size to the satin strokes", () => {
    // Fabric of 0.5 mm between grey and red; a gap of 0.7 mm within grey elsewhere; a stroke of 1.0 mm.
    const [a, b] = gapBlocks(0.5, 10, 8);
    const [c, d] = gapBlocks(0.7, 10, 8);
    const r = checkMinimumSize(
      [
        gray("a", a),
        red("b", b),
        gray("c", shift(c, 0, 30)),
        gray("d", shift(d, 0, 30)),
        areaShape("zier", shift(bar(1.0), 0, 60), BLACK),
      ],
      { widthMm: B },
    );
    // By the width they hold from, the largest first: fabric 0.5 mm → 125 mm, stroke 1.0 mm →
    // 104 mm, gap 0.7 mm → 91 mm.
    expect(r.findings.map((f) => f.kind)).toEqual(["fabric-gap", "satin-stroke", "gap"]);
    const [fabric, stroke] = r.findings as [
      (typeof r.findings)[number],
      (typeof r.findings)[number],
    ];
    expect(r.decisiveGap).toBe(fabric);
    expect(r.gapsOpenFromWidthMm).toBe(fabric.holdsFromWidthMm);
    // The strokes alone set the minimum size — although the fabric asks for more.
    expect(r.decisive).toBe(stroke);
    expect(r.minimumWidthMm).toBe(stroke.holdsFromWidthMm);
    expect(r.gapsOpenFromWidthMm!).toBeGreaterThan(r.minimumWidthMm!);
  });

  it("is the gap that decides where no colour has a gap at all", () => {
    const [a, b] = gapBlocks(0.5, 10, 8);
    const r = checkMinimumSize([gray("a", a), red("b", b)], { widthMm: B });
    expect(r.decisiveGap!.kind).toBe("fabric-gap");
    expect(r.gapsOpenFromWidthMm).toBe(r.findings[0]!.holdsFromWidthMm);
    expect(r.minimumWidthMm).toBeUndefined();
  });

  it("takes the gap limit as its own", () => {
    const [a, b] = gapBlocks(0.5);
    // Closed by 0.2 mm, a gap of 0.5 mm stays open.
    expect(
      checkMinimumSize([gray("a", a), red("b", b)], { widthMm: B, gapMinMm: 0.4 }).findings,
    ).toEqual([]);
    const [c, d] = gapBlocks(0.9);
    const wide = checkMinimumSize([gray("c", c), red("d", d)], { widthMm: B, gapMinMm: 1.0 });
    expect(wide.findings.map((f) => f.kind)).toEqual(["fabric-gap"]);
    expect(wide.findings[0]!.limitMm).toBe(1.0);
  });

  it("accounts for every piece the closing of all shapes added: found, or said to be left out", () => {
    const [a, b] = gapBlocks(0.5); // fabric: found
    const [c, d] = gapBlocks(0.5); // one colour: the gap of a colour, so a duplicate
    const [e, f] = gapBlocks(0.008); // a seam: a sliver
    const [t, u, v, w] = pinwheel(0.08); // a hole under 0.1 mm: thin
    const at = (poly: Polygon): Polygon => shift(poly, 60, 100);
    const r = checkMinimumSize(
      [
        gray("a", a),
        red("b", b),
        gray("c", shift(c, 0, 30)),
        gray("d", shift(d, 0, 30)),
        gray("e", shift(e, 0, 60)),
        red("f", shift(f, 0, 60)),
        areaShape("t", at(t), "#111111"),
        areaShape("u", at(u), "#222222"),
        areaShape("v", at(v), "#333333"),
        areaShape("w", at(w), "#444444"),
        gray("waagrecht", shift(polygonOf(rect(0, 0, 30, 8)), 60, 30)), // an inner corner: compact
        red("senkrecht", shift(polygonOf(rect(0, 8, 8, 22)), 60, 30)),
      ],
      { widthMm: B },
    );
    const fabric = r.findings.filter((x) => x.kind === "fabric-gap").length;
    expect(fabric).toBe(1);
    expect(r.fabricIgnored).toEqual({ slivers: 1, thin: 1, compact: 1, wide: 0, duplicate: 1 });
    // Every part that was measured is a finding or one of the three left-out kinds; a piece the
    // opening took whole, or that a gap of a colour already holds whole, has no part at all.
    const { thin, compact, wide, slivers, duplicate } = r.fabricIgnored;
    expect(r.fabricParts).toBe(fabric + thin + compact + wide);
    expect(r.fabricPieces).toBe(r.fabricParts + slivers + duplicate);
  });

  it("accounts for nothing where there is nothing, and gives the same result for the same input", () => {
    const none = checkMinimumSize([], { widthMm: B });
    expect(none.fabricPieces).toBe(0);
    expect(none.fabricParts).toBe(0);
    expect(none.fabricIgnored).toEqual({ slivers: 0, thin: 0, compact: 0, wide: 0, duplicate: 0 });

    const [a, b] = gapBlocks(0.5);
    const shapes = [gray("a", a), red("b", b), areaShape("zier", shift(bar(1.0), 0, 20), BLACK)];
    expect(checkMinimumSize(shapes, { widthMm: B })).toEqual(
      checkMinimumSize(shapes, { widthMm: B }),
    );
  });
});

describe("checkMinimumSize — the second number: all gaps open from", () => {
  const scene = (gapMm: number, barMm: number) => {
    const [a, b] = gapBlocks(gapMm);
    return [
      areaShape("a", a, GRAY),
      areaShape("b", b, GRAY),
      areaShape("zier", shift(bar(barMm), 0, 20), BLACK),
    ];
  };

  it("comes from the gaps alone and does not move the minimum size, which the strokes set", () => {
    const r = checkMinimumSize(scene(0.5, 1.0), { widthMm: B });
    expect(r.findings).toHaveLength(2);
    const stroke = r.findings.find((f) => f.kind === "satin-stroke")!;
    const gap = r.findings.find((f) => f.kind === "gap")!;
    // The minimum size is the stroke's — although the gap asks for more.
    expect(r.decisive).toBe(stroke);
    expect(r.minimumWidthMm).toBe(stroke.holdsFromWidthMm);
    expect(r.gapsOpenFromWidthMm).toBe(gap.holdsFromWidthMm);
    expect(r.decisiveGap).toBe(gap);
    expect(r.gapsOpenFromWidthMm!).toBeGreaterThan(r.minimumWidthMm!);
  });

  it("names the narrowest gap of several", () => {
    const [a, b] = gapBlocks(0.5);
    const [c, d] = gapBlocks(0.7);
    const r = checkMinimumSize(
      [
        areaShape("a", a, GRAY),
        areaShape("b", b, GRAY),
        areaShape("c", shift(c, 0, 20), GRAY),
        areaShape("d", shift(d, 0, 20), GRAY),
      ],
      { widthMm: B },
    );
    expect(r.findings).toHaveLength(2);
    expect(r.decisiveGap!.at.y).toBeCloseTo(2.5, 1);
    expect(r.gapsOpenFromWidthMm).toBe(Math.max(...r.findings.map((f) => f.holdsFromWidthMm)));
  });

  it("is absent where no gap is too fine, and the minimum size stays where it was", () => {
    const r = checkMinimumSize([areaShape("balken", bar(1.0))], { widthMm: B });
    expect(r.gapsOpenFromWidthMm).toBeUndefined();
    expect(r.decisiveGap).toBeUndefined();
    expect(r.minimumWidthMm).toBeDefined();
  });

  it("is there where the logo has no satin stroke at all", () => {
    // Blocks 8 mm high are areas, not strokes (a shape under 5 mm is satin).
    const [a, b] = gapBlocks(0.5, 10, 8);
    const r = checkMinimumSize([areaShape("a", a, GRAY), areaShape("b", b, GRAY)], { widthMm: B });
    expect(r.minimumWidthMm).toBeUndefined();
    expect(r.gapsOpenFromWidthMm).toBeDefined();
  });

  it("lists the findings of both kinds by the width they hold from, the largest first", () => {
    const r = checkMinimumSize(scene(0.5, 1.0), { widthMm: B });
    const widths = r.findings.map((f) => f.holdsFromWidthMm);
    expect(widths).toEqual([...widths].sort((x, y) => y - x));
    expect(r.findings[0]!.kind).toBe("gap");
  });

  it("scales with the ordered width like the minimum size does", () => {
    const at80 = checkMinimumSize(scene(0.5, 1.0), { widthMm: 80 });
    const at160 = checkMinimumSize(scene(0.5, 1.0), { widthMm: 160 });
    expect(at160.gapsOpenFromWidthMm).toBeCloseTo(2 * at80.gapsOpenFromWidthMm!, 6);
    expect(at160.minimumWidthMm).toBeCloseTo(2 * at80.minimumWidthMm!, 6);
  });
});

describe("checkMinimumSize — options, input, accounting", () => {
  it("takes the limits as options", () => {
    const [a, b] = gapBlocks(0.5);
    const shapes = [areaShape("a", a, GRAY), areaShape("b", b, GRAY)];
    // Closed by 0.2 mm, a gap of 0.5 mm stays open.
    expect(checkMinimumSize(shapes, { widthMm: B, gapMinMm: 0.4 }).findings).toEqual([]);
    // A gap of 0.9 mm is one under a limit of 1.0 mm.
    const [c, d] = gapBlocks(0.9);
    const wide = checkMinimumSize([areaShape("c", c, GRAY), areaShape("d", d, GRAY)], {
      widthMm: B,
      gapMinMm: 1.0,
    });
    expect(wide.findings).toHaveLength(1);
    expect(wide.findings[0]!.limitMm).toBe(1.0);

    const stroke = checkMinimumSize([areaShape("balken", bar(1.5))], {
      widthMm: B,
      satinMinMm: 2,
    });
    expect(stroke.findings).toHaveLength(1);
    expect(stroke.findings[0]!.limitMm).toBe(2);
    expect(stroke.findings[0]!.holdsFromWidthMm).toBeCloseTo(
      (B * 2) / stroke.findings[0]!.measuredMm,
      9,
    );
    // The decorative-line remark is the spec's 0.7 to 1.3 mm, not whatever limit was passed.
    expect(stroke.findings[0]!.runningAlternative).toBe(false);
  });

  it("says which limits it ran with", () => {
    expect(checkMinimumSize([], { widthMm: B }).limits).toEqual({
      satinMinMm: 1.3,
      gapMinMm: 0.8,
      shadowMinMm: 0.7,
    });
    const custom = checkMinimumSize([], {
      widthMm: B,
      satinMinMm: 1.5,
      gapMinMm: 0.6,
      shadowMinMm: 0.9,
    });
    expect(custom.limits).toEqual({ satinMinMm: 1.5, gapMinMm: 0.6, shadowMinMm: 0.9 });
  });

  it("refuses an ordered width it cannot divide by", () => {
    for (const widthMm of [0, -80, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => checkMinimumSize([], { widthMm })).toThrow(RangeError);
    }
    expect(() => checkMinimumSize([], { widthMm: B, satinMinMm: 0 })).toThrow(RangeError);
    expect(() => checkMinimumSize([], { widthMm: B, gapMinMm: -1 })).toThrow(RangeError);
    expect(() => checkMinimumSize([], { widthMm: B, shadowMinMm: 0 })).toThrow(RangeError);
  });

  it("finds nothing in nothing", () => {
    const r = checkMinimumSize([], { widthMm: B });
    expect(r.findings).toEqual([]);
    expect(r.gapPieces).toBe(0);
    expect(r.gapParts).toBe(0);
    expect(r.ignored).toEqual({ slivers: 0, thin: 0, compact: 0, wide: 0, covered: 0 });
  });

  it("accounts for every piece the closing added: found, or said to be left out", () => {
    const [a, b] = gapBlocks(0.5);
    const [c, d] = gapBlocks(0.5);
    const [e, f] = gapBlocks(0.008);
    const r = checkMinimumSize(
      [
        areaShape("a", a, GRAY),
        areaShape("b", b, GRAY),
        areaShape("l", shift(L_SHAPE, 60, 30), GRAY), // a corner: compact
        areaShape("ring", shift(punzeDisc(0.08), 40, 0), GRAY), // a counter under 0.1 mm: thin
        areaShape("c", shift(c, 0, 60), GRAY),
        areaShape("d", shift(d, 0, 60), GRAY),
        areaShape("kontur", shift(coverOverGap(), 0, 60), BLACK), // covers c and d: covered
        areaShape("e", shift(e, 0, 90), GRAY), // a seam: a sliver
        areaShape("f", shift(f, 0, 90), GRAY),
      ],
      { widthMm: B },
    );
    const gaps = r.findings.filter((x) => x.kind === "gap").length;
    expect(gaps).toBe(1);
    // The seam is a sliver; the arcs of the round joins leave a few more along the edge of the disc.
    expect(r.ignored.slivers).toBeGreaterThanOrEqual(1);
    expect(r.ignored).toMatchObject({ thin: 1, compact: 1, wide: 0, covered: 1 });
    // Every part that was measured is a finding or one of the four left-out kinds; a piece the
    // opening took whole has no part at all.
    const { thin, compact, wide, covered, slivers } = r.ignored;
    expect(r.gapParts).toBe(gaps + thin + compact + wide + covered);
    expect(r.gapPieces).toBe(r.gapParts + slivers);
  });

  it("gives the same result for the same input", () => {
    const [a, b] = gapBlocks(0.5);
    const shapes = [
      areaShape("a", a, GRAY),
      areaShape("b", b, GRAY),
      areaShape("zier", shift(bar(1.0), 0, 20), BLACK),
    ];
    expect(checkMinimumSize(shapes, { widthMm: B })).toEqual(
      checkMinimumSize(shapes, { widthMm: B }),
    );
  });
});
