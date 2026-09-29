import { beforeAll, describe, expect, it } from "vitest";
import type { Polygon } from "@texma-stitch/geometry";
import { initGeometry, polygonArea } from "@texma-stitch/geometry";
import {
  areaShape,
  gapBlocks,
  L_SHAPE,
  lineShape,
  polygonOf,
  pt,
  punzeDisc,
  rect,
  rimAndBody,
  slotBlock,
} from "../../test/fixtures/shapes.js";
import { classifyShape } from "./classify.js";
import {
  checkMinimumSize,
  GAP_MIN_MM,
  GAP_SAMPLE_MM,
  GAP_SLIVER_MM,
  GAP_THIN_MM,
  holdsFromWidth,
  SATIN_STROKE_MIN_MM,
} from "./min-size.js";

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

  it("looks per colour: the same gap between two colours is no gap", () => {
    const [a, b] = gapBlocks(0.5);
    const r = checkMinimumSize([areaShape("a", a, GRAY), areaShape("b", b, "#c8102e")], {
      widthMm: B,
    });
    expect(r.findings).toEqual([]);
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
    expect(checkMinimumSize([], { widthMm: B }).limits).toEqual({ satinMinMm: 1.3, gapMinMm: 0.8 });
    const custom = checkMinimumSize([], { widthMm: B, satinMinMm: 1.5, gapMinMm: 0.6 });
    expect(custom.limits).toEqual({ satinMinMm: 1.5, gapMinMm: 0.6 });
  });

  it("refuses an ordered width it cannot divide by", () => {
    for (const widthMm of [0, -80, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => checkMinimumSize([], { widthMm })).toThrow(RangeError);
    }
    expect(() => checkMinimumSize([], { widthMm: B, satinMinMm: 0 })).toThrow(RangeError);
    expect(() => checkMinimumSize([], { widthMm: B, gapMinMm: -1 })).toThrow(RangeError);
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
