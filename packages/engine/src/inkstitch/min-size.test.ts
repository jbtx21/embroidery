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
} from "../../test/fixtures/shapes.js";
import { classifyShape } from "./classify.js";
import {
  checkMinimumSize,
  GAP_MIN_MM,
  GAP_NOISE_MM2,
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
  it("carries the decided limits and the noise floor", () => {
    expect(SATIN_STROKE_MIN_MM).toBe(1.3);
    expect(GAP_MIN_MM).toBe(0.8);
    expect(GAP_NOISE_MM2).toBe(0.02);
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

describe("checkMinimumSize — satin strokes", () => {
  it("flags a satin stroke under 1.3 mm and names the width it holds from", () => {
    const r = checkMinimumSize([areaShape("balken", bar(1.0))], { widthMm: B });
    expect(r.findings).toHaveLength(1);
    const f = r.findings[0]!;
    expect(f.kind).toBe("satin-stroke");
    expect(f.id).toBe("balken");
    expect(f.color).toBe(BLACK);
    expect(f.limitMm).toBe(1.3);
    expect(f.measuredMm).toBeGreaterThan(0.95);
    expect(f.measuredMm).toBeLessThan(1.1);
    expect(f.holdsFromWidthMm).toBeCloseTo((B * 1.3) / f.measuredMm, 9);
    // What the finding carries for the preview: the shape itself, and where it is.
    expect(polygonArea(f.polygon)).toBeCloseTo(40 * 1.0, 6);
    expect(f.at.x).toBeCloseTo(20, 6);
    expect(f.at.y).toBeCloseTo(0.5, 6);
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

  it("leaves a stroke of 1.5 mm alone", () => {
    const r = checkMinimumSize([areaShape("balken", bar(1.5))], { widthMm: B });
    expect(r.findings).toEqual([]);
  });

  it("does not count a hairline: under 0.7 mm it is a running stitch, not a satin stroke", () => {
    const r = checkMinimumSize([areaShape("haar", bar(0.5))], { widthMm: B });
    expect(r.findings).toEqual([]);
  });

  it("does not count a wide area", () => {
    const r = checkMinimumSize([areaShape("platte", bar(8, 8))], { widthMm: B });
    expect(r.findings).toEqual([]);
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
    // The median width of the piece: the medial axis reads a strip of this size a little wide.
    expect(f.measuredMm).toBeGreaterThan(0.45);
    expect(f.measuredMm).toBeLessThan(0.65);
    expect(f.holdsFromWidthMm).toBeCloseTo((B * 0.8) / f.measuredMm, 9);
    expect(f.runningAlternative).toBe(false);
    // The piece is the strip between the blocks: 0.5 mm wide, the height of the blocks.
    expect(polygonArea(f.polygon)).toBeGreaterThan(0.9 * 0.5 * 5);
    expect(polygonArea(f.polygon)).toBeLessThan(0.5 * 5 + 1e-6);
    expect(f.at.x).toBeCloseTo(10.25, 1);
    expect(f.at.y).toBeCloseTo(2.5, 1);
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

  it("finds a counter of 0.5 mm in a ring — a hole has no median width, its width is the inscribed one", () => {
    const r = checkMinimumSize([areaShape("ring", punzeDisc(0.5), GRAY)], { widthMm: B });
    expect(r.findings).toHaveLength(1);
    const f = r.findings[0]!;
    expect(f.kind).toBe("gap");
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

  it("does not count a piece under 0.02 mm² — computing noise", () => {
    // A hole of 0.15 mm is 0.0177 mm², one of 0.2 mm is 0.0314 mm²: the floor tells them apart.
    const tiny = checkMinimumSize([areaShape("ring", punzeDisc(0.15), GRAY)], { widthMm: B });
    expect(tiny.findings).toEqual([]);
    expect(tiny.ignored.noise).toBeGreaterThanOrEqual(1);

    const small = checkMinimumSize([areaShape("ring", punzeDisc(0.2), GRAY)], { widthMm: B });
    expect(small.findings).toHaveLength(1);
    expect(small.findings[0]!.measuredMm).toBeCloseTo(0.2, 1);
  });

  it("does not take the rounding of a concave corner for a gap, and says it left it out", () => {
    // The closing rounds the inner corner of an L with a quarter circle of 0.4 mm: 0.03 to 0.04 mm²
    // of area, more than the noise floor, but a corner — a shape without a medial axis, which
    // `medianShapeWidthMm` counts as wide.
    const r = checkMinimumSize([areaShape("l", L_SHAPE, GRAY)], { widthMm: B });
    expect(r.findings).toEqual([]);
    expect(r.gapPieces).toBe(1);
    expect(r.ignored).toEqual({ noise: 0, compact: 1, wide: 0, covered: 0 });
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

describe("checkMinimumSize — minimum size", () => {
  const scene = (gapMm: number, barMm: number) => {
    const [a, b] = gapBlocks(gapMm);
    return [
      areaShape("a", a, GRAY),
      areaShape("b", b, GRAY),
      areaShape("zier", shift(bar(barMm), 0, 20), BLACK),
    ];
  };

  it("is the largest width any element holds from, with that element named", () => {
    const r = checkMinimumSize(scene(0.5, 1.0), { widthMm: B });
    expect(r.findings).toHaveLength(2);
    expect(r.minimumWidthMm).toBe(Math.max(...r.findings.map((f) => f.holdsFromWidthMm)));
    // 0.5 mm of gap (0.55 measured, limit 0.8) against 1.0 mm of stroke (limit 1.3): the gap asks for more.
    expect(r.decisive!.kind).toBe("gap");
    expect(r.decisive).toBe(r.findings[0]);
  });

  it("can be the stroke instead", () => {
    const r = checkMinimumSize(scene(0.7, 0.9), { widthMm: B });
    expect(r.findings).toHaveLength(2);
    expect(r.decisive!.kind).toBe("satin-stroke");
    expect(r.decisive!.id).toBe("zier");
    expect(r.minimumWidthMm).toBe(r.decisive!.holdsFromWidthMm);
  });

  it("lists the findings by the width they hold from, the largest first", () => {
    const r = checkMinimumSize(scene(0.5, 1.0), { widthMm: B });
    const widths = r.findings.map((f) => f.holdsFromWidthMm);
    expect(widths).toEqual([...widths].sort((x, y) => y - x));
  });

  it("has no minimum and no decisive element without a finding", () => {
    const r = checkMinimumSize([areaShape("balken", bar(2.0))], { widthMm: B });
    expect(r.findings).toEqual([]);
    expect(r.minimumWidthMm).toBeUndefined();
    expect(r.decisive).toBeUndefined();
    expect(r.widthMm).toBe(B);
  });

  it("holds from a smaller width the larger the logo was ordered — the formula is linear", () => {
    const at80 = checkMinimumSize(scene(0.5, 1.0), { widthMm: 80 });
    const at160 = checkMinimumSize(scene(0.5, 1.0), { widthMm: 160 });
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

    const stroke = checkMinimumSize([areaShape("balken", bar(1.5))], { widthMm: B, satinMinMm: 2 });
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
    expect(r.ignored).toEqual({ noise: 0, compact: 0, wide: 0, covered: 0 });
  });

  it("accounts for every piece the closing added: found or said to be left out", () => {
    const [a, b] = gapBlocks(0.5);
    const [c, d] = gapBlocks(0.5);
    const r = checkMinimumSize(
      [
        areaShape("a", a, GRAY),
        areaShape("b", b, GRAY),
        areaShape("l", shift(L_SHAPE, 60, 30), GRAY),
        areaShape("ring", shift(punzeDisc(0.15), 40, 0), GRAY),
        areaShape("c", shift(c, 0, 60), GRAY),
        areaShape("d", shift(d, 0, 60), GRAY),
        areaShape("kontur", shift(coverOverGap(), 0, 60), BLACK),
      ],
      { widthMm: B },
    );
    const gaps = r.findings.filter((f) => f.kind === "gap").length;
    expect(gaps).toBe(1);
    expect(r.ignored.covered).toBe(1);
    expect(r.ignored.compact).toBe(1);
    expect(r.ignored.noise).toBeGreaterThanOrEqual(1);
    const { noise, compact, wide, covered } = r.ignored;
    expect(r.gapPieces).toBe(gaps + noise + compact + wide + covered);
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
