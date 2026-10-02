import { beforeAll, describe, expect, it } from "vitest";
import type { Polygon } from "@texma-stitch/geometry";
import {
  difference,
  initGeometry,
  intersect,
  pointInPolygon,
  polygonArea,
  union,
} from "@texma-stitch/geometry";
import {
  forkWithHead,
  hairStick,
  headWithSticks,
  lens,
  plateWithHole,
  plugAndCable,
  stickWithHead,
  stripAlong,
  stubbyStick,
  taperedLeg,
} from "../../test/fixtures/bands.js";
import { GLYPHS } from "../../test/fixtures/glyphs.js";
import { areaShape, dumbbell, polygonOf, pt, rect } from "../../test/fixtures/shapes.js";
import { AUTOSATIN_MAX_WIDTH_MM, medianShapeWidthMm } from "../import/svg.js";
import { KNOCKDOWN_MIN_MM2, KNOCKDOWN_UNDERLAP_MM } from "../resolve-overlaps.js";
import { classifyShape } from "./classify.js";
import type { SatinColumnsResult } from "./columns.js";
import { satinColumns } from "./columns.js";
import {
  measureShapes,
  orderedStrokes,
  SATIN_STROKE_MIN_MM,
  SATIN_TYPICAL_MM,
} from "./min-size.js";
import {
  bandProfile,
  SPLIT_BAND_MIN_ASPECT,
  SPLIT_BAND_MIN_UNIFORMITY,
  SPLIT_BAND_MIN_WIDTH_MM,
  SPLIT_BULK_MIN_MM2,
  SPLIT_BULK_MIN_RATIO,
  SPLIT_BULK_RADIUS_MM,
  SPLIT_TUCK_MM,
  splitNarrowWide,
} from "./split.js";

beforeAll(async () => {
  await initGeometry();
});

const UNDERLAP = 0.2; // Piqué (spec §14)
const split = (
  shape: Polygon,
  over: Parameters<typeof splitNarrowWide>[1] = { underlapMm: UNDERLAP },
) => splitNarrowWide(shape, over);
const total = (polys: Polygon[]): number => polys.reduce((sum, p) => sum + polygonArea(p), 0);

describe("the thresholds (spec §7.8.7)", () => {
  it("take the satin limit and the knockdown's area from where they are decided", () => {
    // The wide part is what the classification calls tatami: a disc of the satin limit fits in it.
    expect(SPLIT_BULK_RADIUS_MM).toBe(AUTOSATIN_MAX_WIDTH_MM / 2);
    // The area under which the repo says a cut costs more than it saves (spec §4.1 rule 3).
    expect(SPLIT_BULK_MIN_MM2).toBe(KNOCKDOWN_MIN_MM2);
  });

  it("keep the narrowest band as wide as the typical column — nothing for the gate to decide", () => {
    // Spec §5.2: a satin stroke is held to 1.0 mm, and one between 1.0 and 1.3 mm is a check
    // point. A band is never narrower than the second, so the gate has nothing to say about it.
    expect(SPLIT_BAND_MIN_WIDTH_MM).toBe(SATIN_TYPICAL_MM);
    expect(SPLIT_BAND_MIN_WIDTH_MM).toBeGreaterThanOrEqual(SATIN_STROKE_MIN_MM);
  });
});

describe("bandProfile (spec §7.8.7)", () => {
  it("reads the length, the width and the evenness of a strip", () => {
    const strip = polygonOf(rect(0, 0, 40, 2.4));
    const p = bandProfile(strip)!;
    // The axis runs corner to corner, a little past the strip's own length.
    expect(p.lengthMm).toBeGreaterThan(38);
    expect(p.lengthMm).toBeLessThan(43);
    expect(p.widthMm).toBeCloseTo(2.4, 1);
    expect(p.uniformity).toBeGreaterThan(0.95);
  });

  it("calls the width the median of the spine, as the classification does", () => {
    const strip = polygonOf(rect(0, 0, 40, 3));
    expect(bandProfile(strip)!.widthMm).toBeCloseTo(medianShapeWidthMm(strip), 6);
  });

  it("finds a curved strip as long as its centre line", () => {
    const line = Array.from({ length: 41 }, (_, i) => {
      const a = (Math.PI * i) / 40;
      return pt(10 * Math.cos(a), 10 * Math.sin(a)); // a half circle of radius 10: 31.4 mm
    });
    const p = bandProfile(stripAlong(line, () => 2.4))!;
    expect(p.lengthMm).toBeGreaterThan(30);
    expect(p.lengthMm).toBeLessThan(35);
    expect(p.uniformity).toBeGreaterThan(0.9);
  });

  it("finds a tapering strip uneven", () => {
    const line = [pt(0, 0), pt(20, 0), pt(40, 0)];
    const p = bandProfile(stripAlong(line, (t) => 3.0 - 2.0 * t))!;
    expect(p.uniformity).toBeLessThan(0.6);
  });

  it("has nothing to say about a shape without a medial axis", () => {
    const disc = headWithSticks(8, []);
    expect(bandProfile(disc)).toBeUndefined();
  });
});

describe("splitNarrowWide: a stick with a head (spec §7.8.7)", () => {
  it("makes the stick a band and leaves the head as the wide part", () => {
    const shape = stickWithHead();
    // The whole shape is what the classification calls tatami: the head carries the median.
    expect(classifyShape(shape).shapeClass).toBe("tatami");

    const plan = split(shape);
    expect(plan.kept).toEqual([]);
    expect(plan.bands).toHaveLength(1);
    const band = plan.bands[0]!;
    expect(band.widthMm).toBeCloseTo(2.4, 1);
    expect(band.lengthMm / band.widthMm).toBeGreaterThan(SPLIT_BAND_MIN_ASPECT);
    expect(band.uniformity).toBeGreaterThan(SPLIT_BAND_MIN_UNIFORMITY);
    // …and holds as satin columns, which is what the band is for.
    expect(band.columns.ok).toBe(true);
    expect(band.columns.columns.length).toBeGreaterThan(0);
    expect(band.columns.coverage).toBeGreaterThanOrEqual(0.85);

    // One wide part, the head: it reaches the whole 12 mm across.
    expect(plan.bulk).toHaveLength(1);
    const box = plan.bulk[0]!.outer.reduce(
      (b, p) => ({ minY: Math.min(b.minY, p.y), maxY: Math.max(b.maxY, p.y) }),
      { minY: Infinity, maxY: -Infinity },
    );
    expect(box.maxY - box.minY).toBeCloseTo(12, 1);
  });

  it("cuts across the stick where the head's wide part ends, 5 mm wide discs being the head", () => {
    const plan = split(stickWithHead());
    // The band starts where a disc of the satin limit no longer fits: not inside the head's round part.
    const band = plan.bands[0]!.polygon;
    const xs = band.outer.map((p) => p.x);
    expect(Math.min(...xs)).toBeGreaterThan(2); // the head's rim is at x = 6 on the axis
    expect(Math.min(...xs)).toBeLessThan(7); // …and the cut is no further out than its tip
    expect(Math.max(...xs)).toBeCloseTo(46, 0); // the stick's free end
  });

  it("loses nothing: wide part and band together are the shape", () => {
    const shape = stickWithHead();
    const plan = split(shape);
    const all = union([...plan.bulk, ...plan.bands.map((b) => b.polygon)]);
    expect(all).toHaveLength(1);
    expect(polygonArea(all[0]!)).toBeCloseTo(polygonArea(shape), 2);
    // Nothing is added either: the tuck lies inside the band, never outside the shape.
    expect(total(difference(plan.bulk, [shape]))).toBeLessThan(1e-3);
  });

  it("tucks the wide part under the band, as far as touching tatami areas reach (spec §4.1 rule 5)", () => {
    expect(SPLIT_TUCK_MM).toBe(KNOCKDOWN_UNDERLAP_MM);
    expect(SPLIT_TUCK_MM).toBeCloseTo(0.8, 6);
    const plan = split(stickWithHead());
    const band = plan.bands[0]!.polygon;
    const reach = total(intersect(plan.bulk, [band]));
    // 0.8 mm into a bar 2.4 mm wide: about 1.9 mm² (the cut is an arc, so not exactly).
    expect(reach).toBeGreaterThan(1.2);
    expect(reach).toBeLessThan(3.2);
    // The tuck stops where it should: a point 2 mm into the band is no longer in the wide part.
    const cutX = Math.min(...band.outer.map((p) => p.x));
    expect(plan.bulk.some((b) => pointInPolygon(b, pt(cutX + 2, 0)))).toBe(false);
    expect(plan.bulk.some((b) => pointInPolygon(b, pt(cutX + 0.3, 0)))).toBe(true);
  });

  it("names the columns after the band", () => {
    const plan = split(stickWithHead(), { underlapMm: UNDERLAP, idPrefix: "lolli" });
    expect(plan.bands[0]!.columns.columns.every((c) => c.id.startsWith("lolli_band0-"))).toBe(true);
  });

  it("splits off both bars of a fork, each its own band, in reading order", () => {
    const plan = split(forkWithHead());
    expect(plan.bands).toHaveLength(2);
    const tops = plan.bands.map((b) => Math.min(...b.polygon.outer.map((p) => p.y)));
    expect(tops[0]!).toBeLessThan(tops[1]!);
    expect(plan.bulk).toHaveLength(1);
  });

  it("splits the cable off the plug, the shape of the Yer logo", () => {
    const plan = split(plugAndCable());
    expect(plan.bands).toHaveLength(1);
    const band = plan.bands[0]!;
    expect(band.widthMm).toBeCloseTo(2.4, 1);
    expect(band.lengthMm).toBeGreaterThan(50); // half a turn of 6 mm radius and 40 mm beyond it
    expect(band.columns.ok).toBe(true);
    // The plug stays whole as the wide part: about its own area (a half ellipse of 11 x 14 mm), plus the tuck.
    expect(plan.bulk).toHaveLength(1);
    expect(polygonArea(plan.bulk[0]!)).toBeGreaterThan(110);
    expect(polygonArea(plan.bulk[0]!)).toBeLessThan(135);
  });

  it("is the same every time", () => {
    const a = split(plugAndCable());
    const b = split(plugAndCable());
    expect(JSON.stringify(a.bulk)).toBe(JSON.stringify(b.bulk));
    expect(JSON.stringify(a.bands.map((x) => x.polygon))).toBe(
      JSON.stringify(b.bands.map((x) => x.polygon)),
    );
  });
});

describe("splitNarrowWide: what stays whole (spec §7.8.7)", () => {
  const whole = (shape: Polygon): void => {
    const plan = split(shape);
    expect(plan.bands).toEqual([]);
    expect(plan.kept).toEqual([]);
    // The very same shape comes back, so that a caller can tell nothing was cut.
    expect(plan.bulk).toEqual([shape]);
  };

  it("a stub: a stick shorter than twelve widths is part of its head", () => {
    whole(stubbyStick());
  });

  it("a hairline: a bar under 1.3 mm is no column", () => {
    whole(hairStick());
  });

  it("a tapering leg: a long bar whose width runs from 3 mm to 1 mm is no band", () => {
    const leg = taperedLeg();
    const p = bandProfile(leg)!;
    expect(p.lengthMm).toBeGreaterThan(SPLIT_BAND_MIN_ASPECT * 3); // long enough…
    whole(leg); // …and still not taken
  });

  it("the tips of a lens", () => {
    whole(lens());
  });

  it("the strips of a plate with a hole", () => {
    whole(plateWithHole());
  });

  it("a bar between two heads: it has two ends on the wide part, not one", () => {
    whole(dumbbell(2.4, 40, 12, 12));
  });

  it("a shape with no wide part at all", () => {
    whole(polygonOf(rect(0, 0, 40, 2.4)));
    whole(GLYPHS.K!);
    whole(GLYPHS.O!);
  });

  it("a head that is not twice as wide as the band", () => {
    // A bar of 4.6 mm on a head of 7 mm: a disc twice the band's width does not fit.
    expect(7 / 4.6).toBeLessThan(SPLIT_BULK_MIN_RATIO);
    whole(stickWithHead(7, 4.6, 60));
  });

  it("a head that is too small to be worth a part of its own", () => {
    const plan = split(stickWithHead(6, 2.4, 40), { underlapMm: UNDERLAP, bulkMinMm2: 60 });
    expect(plan.bands).toEqual([]);
  });
});

describe("splitNarrowWide: a band that does not hold (spec §7.8.7, §7.8.5)", () => {
  const refuse = (): SatinColumnsResult => ({
    ok: false,
    columns: [],
    coverage: 0.4,
    reason: "stroke 2: a rail leaves the letter by 0.44 mm",
    smoothedMm: 0,
    graphs: [],
    warnings: [],
  });

  it("stays in the wide part, with the reason, and the shape comes back whole", () => {
    const shape = stickWithHead();
    const plan = split(shape, { underlapMm: UNDERLAP, columns: refuse });
    expect(plan.bands).toEqual([]);
    expect(plan.kept).toHaveLength(1);
    expect(plan.kept[0]!.reason).toContain("a rail leaves the letter");
    expect(plan.kept[0]!.widthMm).toBeCloseTo(2.4, 1);
    expect(plan.bulk).toEqual([shape]);
  });

  it("keeps one band and leaves the other of a fork where the columns hold for the first only", () => {
    let calls = 0;
    const plan = split(forkWithHead(), {
      underlapMm: UNDERLAP,
      columns: (piece, opts) => {
        calls++;
        return calls === 1 ? refuse() : satinColumns(piece, opts);
      },
    });
    expect(plan.bands).toHaveLength(1);
    expect(plan.kept).toHaveLength(1);
    // The refused band is in the wide part: the parts still make the shape.
    const all = union([...plan.bulk, ...plan.bands.map((b) => b.polygon)]);
    expect(polygonArea(all[0]!)).toBeCloseTo(polygonArea(forkWithHead()), 2);
  });
});

describe("the gate (spec §5.2): the split does not change what it classifies", () => {
  it("still calls the whole shape tatami, so no satin stroke of the ordered size comes of it", () => {
    const measures = measureShapes([areaShape("lolli", stickWithHead())]);
    expect(measures[0]!.shapeClass).toBe("tatami");
    expect(orderedStrokes(measures, { satinMinMm: 1.0, shadowMinMm: 0.7 })).toEqual([]);
  });
});
