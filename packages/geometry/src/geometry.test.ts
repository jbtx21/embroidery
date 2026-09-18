import { beforeAll, describe, expect, it } from "vitest";
import {
  annulus,
  arc,
  ARC_R10_PATH,
  circle,
  CIRCLE_R10_PATH,
  flattenFixture,
  polygonOf,
  pt,
  rect,
  RECT_20_10_PATH,
  S_CURVE_PATH,
  uShape,
} from "../../engine/test/fixtures/shapes.js";
import { initGeometry } from "./clipper.js";
import { flattenCubic, flattenPath, flattenQuadratic } from "./flatten.js";
import { simplify } from "./simplify.js";
import { arcLength, nearestPoint, pointAt, pointAtFraction, tangentAt } from "./measure.js";
import { cornerIndices, dedupe, resample } from "./resample.js";
import {
  bbox,
  closeRing,
  openRing,
  orient,
  pointInPolygon,
  pointInRing,
  polygonArea,
  rings,
  signedArea,
  unionRect,
} from "./polygon.js";
import { clipHorizontal, clipLine } from "./clip.js";
import { difference, intersect, normalizePolygon, normalizeRing, union } from "./boolean.js";
import { offset, offsetAll, offsetPolyline } from "./offset.js";
import { insideTravel, segmentInside } from "./travel.js";
import { medialAxis } from "./medial-axis.js";
import {
  applyToPolygon,
  applyToPolyline,
  compose,
  rotator,
  scaler,
  translator,
} from "./transform.js";
import {
  add,
  angleBetweenDeg,
  cross,
  dist,
  distSq,
  dot,
  equals,
  len,
  lerp,
  normal,
  normalize,
  scale,
  sub,
} from "./vec.js";

beforeAll(async () => {
  await initGeometry();
});

describe("vectors", () => {
  it("does the basic arithmetic", () => {
    expect(add(pt(1, 2), pt(3, 4))).toEqual(pt(4, 6));
    expect(sub(pt(3, 4), pt(1, 2))).toEqual(pt(2, 2));
    expect(scale(pt(2, 3), 2)).toEqual(pt(4, 6));
    expect(dot(pt(1, 2), pt(3, 4))).toBe(11);
    expect(cross(pt(1, 0), pt(0, 1))).toBe(1);
    expect(len(pt(3, 4))).toBe(5);
    expect(dist(pt(0, 0), pt(3, 4))).toBe(5);
    expect(distSq(pt(0, 0), pt(3, 4))).toBe(25);
    expect(lerp(pt(0, 0), pt(10, 0), 0.25)).toEqual(pt(2.5, 0));
    expect(normalize(pt(0, 5))).toEqual(pt(0, 1));
    expect(normalize(pt(0, 0))).toEqual(pt(0, 0));
    expect(normal(pt(1, 0))).toEqual(pt(0, -1));
    expect(equals(pt(1, 1), pt(1, 1 + 1e-12))).toBe(true);
    expect(angleBetweenDeg(pt(1, 0), pt(0, 1))).toBeCloseTo(90, 9);
    expect(angleBetweenDeg(pt(0, 0), pt(0, 1))).toBe(0);
  });
});

describe("orientation", () => {
  it("normalises rectangles to clockwise (positive shoelace area)", () => {
    expect(signedArea(rect(0, 0, 10, 5))).toBeCloseTo(50, 9);
  });

  it("measures the ring area minus its hole", () => {
    expect(polygonArea(annulus(0, 0, 10, 5))).toBeCloseTo(Math.PI * (100 - 25), 0);
  });

  it("opens and closes rings", () => {
    const ring = rect(0, 0, 10, 10);
    expect(closeRing(ring)).toHaveLength(5);
    expect(openRing(closeRing(ring))).toHaveLength(4);
    expect(openRing(ring)).toHaveLength(4);
  });

  it("lists the outer ring first", () => {
    expect(rings(annulus(0, 0, 10, 5))).toHaveLength(2);
    expect(signedArea(rings(annulus(0, 0, 10, 5))[0]!)).toBeGreaterThan(0);
  });

  it("merges bounding boxes", () => {
    expect(
      unionRect({ minX: 0, minY: 0, maxX: 1, maxY: 1 }, { minX: -1, minY: 2, maxX: 3, maxY: 4 }),
    ).toEqual({
      minX: -1,
      minY: 0,
      maxX: 3,
      maxY: 4,
    });
  });

  it("flips only when needed", () => {
    const ring = rect(0, 0, 10, 10);
    expect(orient(ring, true)).toEqual(ring);
    expect(orient(ring, false)[0]).toEqual(ring[ring.length - 1]);
  });
});

describe("flatten", () => {
  it("leaves a straight cubic at two points", () => {
    expect(flattenCubic(pt(0, 0), pt(1, 0), pt(2, 0), pt(3, 0))).toHaveLength(2);
  });

  it("keeps the 0.05 mm tolerance", () => {
    const p = flattenCubic(pt(0, 0), pt(0, 10), pt(10, 10), pt(10, 0));
    // The apex at t = 0.5 sits on (5, 7.5)
    expect(nearestPoint(p, pt(5, 7.5)).distance).toBeLessThan(0.05);
    expect(p.length).toBeGreaterThan(8);
  });

  it("elevates quadratics correctly", () => {
    expect(
      nearestPoint(flattenQuadratic(pt(0, 0), pt(5, 10), pt(10, 0)), pt(5, 5)).distance,
    ).toBeLessThan(0.05);
  });

  it("chains segments without duplicate points", () => {
    const p = flattenPath(pt(0, 0), [
      { kind: "line", to: pt(10, 0) },
      { kind: "cubic", c1: pt(15, 0), c2: pt(20, 5), to: pt(20, 10) },
      { kind: "quadratic", c: pt(20, 15), to: pt(10, 15) },
    ]);
    for (let i = 1; i < p.length; i++) expect(dist(p[i - 1]!, p[i]!)).toBeGreaterThan(0);
  });

  it("matches the polygon form of the fixtures", () => {
    // Rectangle: Bezier path and polygon describe the same outline.
    const flat = flattenFixture(RECT_20_10_PATH);
    expect(bbox(flat)).toMatchObject({ minX: 0, minY: 0, maxX: 20, maxY: 10 });

    const circleFlat = flattenFixture(CIRCLE_R10_PATH);
    for (const p of circleFlat) expect(Math.hypot(p.x, p.y)).toBeCloseTo(10, 1);

    expect(bbox(flattenFixture(ARC_R10_PATH)).maxY).toBeCloseTo(10, 1);
    expect(bbox(flattenFixture(S_CURVE_PATH)).maxY).toBeCloseTo(30, 1);
  });
});

describe("simplify", () => {
  it("drops points along a straight line", () => {
    expect(simplify(Array.from({ length: 50 }, (_, i) => pt(i * 0.2, 0)))).toHaveLength(2);
  });

  it("keeps a corner", () => {
    expect(simplify([pt(0, 0), pt(5, 0), pt(5, 5)])).toHaveLength(3);
  });

  it("returns short inputs unchanged", () => {
    expect(simplify([pt(0, 0), pt(1, 1)])).toHaveLength(2);
  });
});

describe("resample", () => {
  it("divides evenly and leaves no remnant", () => {
    const r = resample([pt(0, 0), pt(10, 0)], 2.5);
    expect(r).toHaveLength(5);
    for (let i = 1; i < r.length; i++) expect(dist(r[i - 1]!, r[i]!)).toBeCloseTo(2.5, 9);
  });

  it("adjusts the step instead of leaving a stub", () => {
    const r = resample([pt(0, 0), pt(11, 0)], 2.5); // 11/2.5 = 4.4 -> 4 stitches of 2.75
    expect(r).toHaveLength(5);
    for (let i = 1; i < r.length; i++) expect(dist(r[i - 1]!, r[i]!)).toBeCloseTo(2.75, 9);
  });

  it("holds corners above 30 degrees as stitch points", () => {
    const l = [pt(0, 0), pt(10, 0), pt(10, 10)];
    expect(cornerIndices(l)).toEqual([1]);
    expect(resample(l, 3).some((p) => Math.abs(p.x - 10) < 1e-9 && Math.abs(p.y) < 1e-9)).toBe(
      true,
    );
  });

  it("ignores corners when asked to", () => {
    expect(resample([pt(0, 0), pt(10, 0), pt(10, 10)], 20, false)).toHaveLength(2);
  });

  it("merges duplicate points", () => {
    expect(dedupe([pt(0, 0), pt(0, 0), pt(1, 0)])).toHaveLength(2);
    expect(dedupe([])).toHaveLength(0);
  });
});

describe("measure", () => {
  it("keeps arc length and point-at-length consistent", () => {
    const c = closeRing(circle(0, 0, 10, 256));
    expect(arcLength(c)).toBeCloseTo(2 * Math.PI * 10, 1);
    expect(dist(pointAtFraction(c, 0.5), pt(-10, 0))).toBeLessThan(0.05);
  });

  it("clamps outside the path", () => {
    const l = [pt(0, 0), pt(10, 0)];
    expect(pointAt(l, -5)).toEqual(pt(0, 0));
    expect(pointAt(l, 50)).toEqual(pt(10, 0));
    expect(pointAt([], 1)).toEqual(pt(0, 0));
    expect(pointAt([pt(3, 4)], 1)).toEqual(pt(3, 4));
  });

  it("gives the tangent direction", () => {
    expect(tangentAt([pt(0, 0), pt(10, 0)], 5)).toEqual(pt(1, 0));
    expect(tangentAt([pt(0, 0)], 5)).toEqual(pt(1, 0));
  });

  it("finds the nearest point with its parameter", () => {
    const n = nearestPoint([pt(0, 0), pt(10, 0)], pt(3, 4));
    expect(n.point.x).toBeCloseTo(3, 9);
    expect(n.distance).toBeCloseTo(4, 9);
    expect(n.length).toBeCloseTo(3, 9);
    expect(nearestPoint([], pt(0, 0)).distance).toBe(Infinity);
    expect(nearestPoint([pt(1, 1)], pt(1, 2)).distance).toBe(1);
  });
});

describe("clipLine", () => {
  it("cuts a rectangle into exactly one segment", () => {
    const hits = clipHorizontal(2.5, polygonOf(rect(0, 0, 10, 5)));
    expect(hits).toHaveLength(1);
    expect(hits[0]!.ta).toBeCloseTo(0, 9);
    expect(hits[0]!.tb).toBeCloseTo(10, 9);
  });

  it("cuts a ring into two segments", () => {
    expect(clipHorizontal(0, annulus(0, 0, 10, 5))).toHaveLength(2);
  });

  it("does not count a vertex on the line twice", () => {
    // Diamond: at y = 0 the left and right tips sit exactly on the scanline
    const hits = clipHorizontal(0, polygonOf([pt(-5, 0), pt(0, -5), pt(5, 0), pt(0, 5)]));
    expect(hits).toHaveLength(1);
    expect(hits[0]!.tb - hits[0]!.ta).toBeCloseTo(10, 6);
  });

  it("works at an angle too", () => {
    const hits = clipLine(pt(0, 0), pt(1, 1), polygonOf(rect(-5, -5, 10, 10)));
    expect(hits).toHaveLength(1);
    expect(hits[0]!.tb - hits[0]!.ta).toBeCloseTo(Math.hypot(10, 10), 6);
  });

  it("returns nothing for a degenerate direction or a miss", () => {
    expect(clipLine(pt(0, 0), pt(0, 0), polygonOf(rect(0, 0, 10, 10)))).toHaveLength(0);
    expect(clipHorizontal(100, polygonOf(rect(0, 0, 10, 10)))).toHaveLength(0);
  });
});

describe("offset", () => {
  it("grows outwards and shrinks the hole", () => {
    const grown = offset(annulus(0, 0, 10, 5), 1);
    expect(grown).toHaveLength(1);
    expect(bbox(grown[0]!.outer).maxX).toBeCloseTo(11, 1);
    expect(grown[0]!.holes).toHaveLength(1);
    expect(bbox(grown[0]!.holes[0]!).maxX).toBeCloseTo(4, 1);
  });

  it("shrinks inwards", () => {
    expect(bbox(offset(polygonOf(rect(0, 0, 10, 10)), -2)[0]!.outer)).toMatchObject({
      minX: expect.closeTo(2, 1),
    });
  });

  it("lets an over-shrunk shape disappear", () => {
    expect(offset(polygonOf(rect(0, 0, 2, 2)), -5)).toHaveLength(0);
  });

  it("copies the shape for delta zero", () => {
    const p = polygonOf(rect(0, 0, 10, 10));
    const same = offset(p, 0)[0]!;
    expect(same.outer).toEqual(p.outer);
    expect(same.outer).not.toBe(p.outer);
  });

  it("offsets several polygons at once", () => {
    expect(
      offsetAll([polygonOf(rect(0, 0, 10, 10)), polygonOf(rect(30, 0, 10, 10))], 1),
    ).toHaveLength(2);
  });

  it("shifts open polylines perpendicular, corners included", () => {
    const l = offsetPolyline([pt(0, 0), pt(10, 0), pt(10, 10)], 1);
    expect(l[0]!.y).toBeCloseTo(-1, 9);
    // Corner: the offset has to be perpendicular to both segments -> (11, -1)
    expect(l[1]!.x).toBeCloseTo(11, 6);
    expect(l[1]!.y).toBeCloseTo(-1, 6);
    expect(offsetPolyline([pt(0, 0), pt(1, 0)], 0)).toHaveLength(2);
  });
});

describe("set operations", () => {
  it("resolves a figure of eight into two areas", () => {
    const parts = normalizeRing([pt(0, 0), pt(10, 10), pt(10, 0), pt(0, 10)]);
    expect(parts).toHaveLength(2);
    for (const p of parts) expect(signedArea(p.outer)).toBeGreaterThan(0);
  });

  it("keeps a clean polygon as it is", () => {
    const parts = normalizePolygon(annulus(0, 0, 10, 5));
    expect(parts).toHaveLength(1);
    expect(parts[0]!.holes).toHaveLength(1);
  });

  it("unions two overlapping squares into one", () => {
    const u = union([polygonOf(rect(0, 0, 10, 10)), polygonOf(rect(5, 0, 10, 10))]);
    expect(u).toHaveLength(1);
    expect(bbox(u[0]!.outer).maxX).toBeCloseTo(15, 6);
  });

  it("subtracts and intersects", () => {
    const d = difference([polygonOf(rect(0, 0, 10, 10))], [polygonOf(rect(5, -1, 10, 12))]);
    expect(bbox(d[0]!.outer).maxX).toBeCloseTo(5, 6);
    const i = intersect([polygonOf(rect(0, 0, 10, 10))], [polygonOf(rect(5, 0, 10, 10))]);
    expect(bbox(i[0]!.outer).minX).toBeCloseTo(5, 6);
  });
});

describe("insideTravel", () => {
  const u = uShape();

  it("takes the direct line when it stays inside", () => {
    expect(insideTravel(u, pt(1, 18), pt(19, 18))).toHaveLength(2);
  });

  it("goes around the slot", () => {
    const a = pt(2, 2);
    const b = pt(18, 2);
    expect(segmentInside(u, a, b)).toBe(false);
    const path = insideTravel(u, a, b);
    expect(path.length).toBeGreaterThan(2);
    for (let i = 1; i < path.length; i++)
      expect(segmentInside(u, path[i - 1]!, path[i]!)).toBe(true);
    expect(arcLength(path)).toBeGreaterThan(dist(a, b));
    expect(arcLength(path)).toBeLessThan(dist(a, b) * 3);
  });

  it("falls back to the straight line when a point lies outside", () => {
    expect(insideTravel(u, pt(-50, -50), pt(2, 2))).toHaveLength(2);
  });

  it("treats a zero-length segment as a point test", () => {
    expect(segmentInside(u, pt(2, 2), pt(2, 2))).toBe(true);
    expect(segmentInside(u, pt(-9, -9), pt(-9, -9))).toBe(false);
  });
});

describe("transform", () => {
  it("rotates about the origin and about a point", () => {
    const r = rotator(90)(pt(1, 0));
    expect(r.x).toBeCloseTo(0, 9);
    expect(r.y).toBeCloseTo(1, 9);
    const about = rotator(180, pt(5, 0))(pt(6, 0));
    expect(about.x).toBeCloseTo(4, 9);
  });

  it("translates, scales and composes", () => {
    expect(translator(2, 3)(pt(1, 1))).toEqual(pt(3, 4));
    expect(scaler(2)(pt(1, 1))).toEqual(pt(2, 2));
    expect(scaler(2, 3, pt(1, 1))(pt(2, 2))).toEqual(pt(3, 4));
    expect(compose(translator(1, 0), scaler(2))(pt(1, 0))).toEqual(pt(4, 0));
  });

  it("applies to polylines and polygons", () => {
    expect(applyToPolyline(translator(1, 1), [pt(0, 0)])).toEqual([pt(1, 1)]);
    const moved = applyToPolygon(translator(1, 1), annulus(0, 0, 10, 5));
    expect(moved.holes).toHaveLength(1);
    expect(bbox(moved.outer).minX).toBeCloseTo(-9, 6);
  });
});

describe("point in polygon", () => {
  it("treats the hole as outside", () => {
    const a = annulus(0, 0, 10, 5);
    expect(pointInPolygon(a, pt(0, 0))).toBe(false);
    expect(pointInPolygon(a, pt(7.5, 0))).toBe(true);
    expect(pointInPolygon(a, pt(20, 0))).toBe(false);
    expect(pointInRing(a.outer, pt(0, 0))).toBe(true);
  });

  it("works on an arc outline", () => {
    const outline = polygonOf([...arc(0, 0, 10, 0, 180, 24), ...arc(0, 0, 8, 180, 0, 24)]);
    expect(pointInPolygon(outline, pt(0, 9))).toBe(true);
    expect(pointInPolygon(outline, pt(0, 4))).toBe(false);
  });
});

describe("medialAxis", () => {
  it("says clearly that it is not built yet", () => {
    // CLAUDE.md rule 8: no silent guessing. Week 4 fills this in.
    expect(() => medialAxis(polygonOf(rect(0, 0, 10, 10)))).toThrow(/not implemented/i);
  });
});
