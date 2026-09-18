import { beforeAll, describe, expect, it } from "vitest";
import { initGeometry } from "./clipper.js";
import { flattenCubic, flattenPath, flattenQuadratic } from "./flatten.js";
import { simplify } from "./simplify.js";
import { arcLength, nearestPoint, pointAt, pointAtFraction } from "./measure.js";
import { cornerIndices, resample } from "./resample.js";
import { bbox, pointInPolygon, polygonArea, signedArea } from "./polygon.js";
import { clipHorizontal, clipLine } from "./clip.js";
import { normalizeRing, union } from "./boolean.js";
import { offset, offsetPolyline } from "./offset.js";
import { insideTravel, segmentInside } from "./travel.js";
import { rotator } from "./transform.js";
import { annulus, arc, circle, polygonOf, pt, rect, uShape } from "./testformen.js";
import { dist } from "./vec.js";

beforeAll(async () => {
  await initGeometry();
});

describe("Orientierung", () => {
  it("normiert Rechtecke auf Uhrzeigersinn (positive Shoelace-Flaeche)", () => {
    expect(signedArea(rect(0, 0, 10, 5))).toBeCloseTo(50, 9);
  });

  it("misst die Ringflaeche abzueglich des Lochs", () => {
    const a = polygonArea(annulus(0, 0, 10, 5));
    expect(a).toBeCloseTo(Math.PI * (100 - 25), 0);
  });
});

describe("flatten", () => {
  it("laesst eine gerade Kubische bei zwei Punkten", () => {
    const line = flattenCubic(pt(0, 0), pt(1, 0), pt(2, 0), pt(3, 0));
    expect(line).toHaveLength(2);
  });

  it("haelt die Toleranz von 0,05 mm ein", () => {
    const p = flattenCubic(pt(0, 0), pt(0, 10), pt(10, 10), pt(10, 0));
    // Scheitel der Kurve liegt bei t=0,5 auf (5, 7,5)
    const nearest = nearestPoint(p, pt(5, 7.5));
    expect(nearest.distance).toBeLessThan(0.05);
    expect(p.length).toBeGreaterThan(8);
  });

  it("gradanhebt Quadratische korrekt", () => {
    const q = flattenQuadratic(pt(0, 0), pt(5, 10), pt(10, 0));
    const nearest = nearestPoint(q, pt(5, 5));
    expect(nearest.distance).toBeLessThan(0.05);
  });

  it("verkettet Segmente ohne Doppelpunkte", () => {
    const p = flattenPath(pt(0, 0), [
      { kind: "line", to: pt(10, 0) },
      { kind: "cubic", c1: pt(15, 0), c2: pt(20, 5), to: pt(20, 10) },
    ]);
    for (let i = 1; i < p.length; i++) expect(dist(p[i - 1]!, p[i]!)).toBeGreaterThan(0);
  });
});

describe("simplify", () => {
  it("wirft Zwischenpunkte auf einer Geraden weg", () => {
    const line = Array.from({ length: 50 }, (_, i) => pt(i * 0.2, 0));
    expect(simplify(line)).toHaveLength(2);
  });

  it("behaelt eine Ecke", () => {
    const l = [pt(0, 0), pt(5, 0), pt(5, 5)];
    expect(simplify(l)).toHaveLength(3);
  });
});

describe("resample", () => {
  it("verteilt gleichmaessig und laesst keinen Reststich uebrig", () => {
    const line = [pt(0, 0), pt(10, 0)];
    const r = resample(line, 2.5);
    expect(r).toHaveLength(5);
    for (let i = 1; i < r.length; i++) expect(dist(r[i - 1]!, r[i]!)).toBeCloseTo(2.5, 9);
  });

  it("passt den Schritt an, statt einen Stummel zu erzeugen", () => {
    const r = resample([pt(0, 0), pt(11, 0)], 2.5); // 11/2,5 = 4,4 -> 4 Stiche a 2,75
    expect(r).toHaveLength(5);
    for (let i = 1; i < r.length; i++) expect(dist(r[i - 1]!, r[i]!)).toBeCloseTo(2.75, 9);
  });

  it("haelt Ecken ueber 30 Grad als Stichpunkt fest", () => {
    const l = [pt(0, 0), pt(10, 0), pt(10, 10)];
    expect(cornerIndices(l)).toEqual([1]);
    const r = resample(l, 3);
    expect(r.some((p) => Math.abs(p.x - 10) < 1e-9 && Math.abs(p.y) < 1e-9)).toBe(true);
  });
});

describe("measure", () => {
  it("rechnet Bogenlaenge und Punkt bei Laenge konsistent", () => {
    const c = [...circle(0, 0, 10, 256), circle(0, 0, 10, 256)[0]!];
    expect(arcLength(c)).toBeCloseTo(2 * Math.PI * 10, 1);
    const half = pointAtFraction(c, 0.5);
    expect(dist(half, pt(-10, 0))).toBeLessThan(0.05);
  });

  it("klemmt ausserhalb des Pfades", () => {
    const l = [pt(0, 0), pt(10, 0)];
    expect(pointAt(l, -5)).toEqual(pt(0, 0));
    expect(pointAt(l, 50)).toEqual(pt(10, 0));
  });

  it("findet den naechsten Punkt samt Parameter", () => {
    const n = nearestPoint([pt(0, 0), pt(10, 0)], pt(3, 4));
    expect(n.point.x).toBeCloseTo(3, 9);
    expect(n.distance).toBeCloseTo(4, 9);
    expect(n.length).toBeCloseTo(3, 9);
  });
});

describe("clipLine", () => {
  it("schneidet ein Rechteck in genau ein Segment", () => {
    const hits = clipHorizontal(2.5, polygonOf(rect(0, 0, 10, 5)));
    expect(hits).toHaveLength(1);
    expect(hits[0]!.ta).toBeCloseTo(0, 9);
    expect(hits[0]!.tb).toBeCloseTo(10, 9);
  });

  it("schneidet einen Ring in zwei Segmente", () => {
    const hits = clipHorizontal(0, annulus(0, 0, 10, 5));
    expect(hits).toHaveLength(2);
  });

  it("zaehlt einen Scheitelpunkt genau auf der Linie nicht doppelt", () => {
    // Raute: bei y = 0 liegen linke und rechte Spitze exakt auf der Scanline
    const raute = polygonOf([pt(-5, 0), pt(0, -5), pt(5, 0), pt(0, 5)]);
    const hits = clipHorizontal(0, raute);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.tb - hits[0]!.ta).toBeCloseTo(10, 6);
  });

  it("arbeitet auch schraeg", () => {
    const hits = clipLine(pt(0, 0), pt(1, 1), polygonOf(rect(-5, -5, 10, 10)));
    expect(hits).toHaveLength(1);
    expect(hits[0]!.tb - hits[0]!.ta).toBeCloseTo(Math.hypot(10, 10), 6);
  });
});

describe("offset", () => {
  it("vergroessert nach aussen und verkleinert das Loch", () => {
    const grown = offset(annulus(0, 0, 10, 5), 1);
    expect(grown).toHaveLength(1);
    const g = grown[0]!;
    const b = bbox(g.outer);
    expect(b.maxX).toBeCloseTo(11, 1);
    expect(g.holes).toHaveLength(1);
    expect(bbox(g.holes[0]!).maxX).toBeCloseTo(4, 1);
  });

  it("schrumpft nach innen", () => {
    const shrunk = offset(polygonOf(rect(0, 0, 10, 10)), -2);
    expect(bbox(shrunk[0]!.outer)).toMatchObject({ minX: expect.closeTo(2, 1) });
  });

  it("laesst eine zu stark geschrumpfte Form verschwinden", () => {
    expect(offset(polygonOf(rect(0, 0, 2, 2)), -5)).toHaveLength(0);
  });

  it("versetzt offene Polylines senkrecht, auch ueber Ecken", () => {
    const l = offsetPolyline([pt(0, 0), pt(10, 0), pt(10, 10)], 1);
    expect(l[0]!.y).toBeCloseTo(-1, 9);
    // Ecke: Versatz muss zu beiden Segmenten senkrecht passen -> (11, -1)
    expect(l[1]!.x).toBeCloseTo(11, 6);
    expect(l[1]!.y).toBeCloseTo(-1, 6);
  });
});

describe("normalize", () => {
  it("loest eine liegende Acht in zwei Flaechen auf", () => {
    const acht = [pt(0, 0), pt(10, 10), pt(10, 0), pt(0, 10)];
    const parts = normalizeRing(acht);
    expect(parts).toHaveLength(2);
    for (const p of parts) expect(signedArea(p.outer)).toBeGreaterThan(0);
  });

  it("vereinigt zwei ueberlappende Quadrate zu einem", () => {
    const u = union([polygonOf(rect(0, 0, 10, 10)), polygonOf(rect(5, 0, 10, 10))]);
    expect(u).toHaveLength(1);
    expect(bbox(u[0]!.outer).maxX).toBeCloseTo(15, 6);
  });
});

describe("insideTravel", () => {
  const u = uShape();

  it("nimmt die direkte Strecke, wenn sie drin liegt", () => {
    expect(insideTravel(u, pt(1, 18), pt(19, 18))).toHaveLength(2);
  });

  it("geht um den Ausschnitt herum", () => {
    const a = pt(2, 2);
    const b = pt(18, 2);
    expect(segmentInside(u, a, b)).toBe(false);
    const weg = insideTravel(u, a, b);
    expect(weg.length).toBeGreaterThan(2);
    for (let i = 1; i < weg.length; i++) expect(segmentInside(u, weg[i - 1]!, weg[i]!)).toBe(true);
    // laenger als Luftlinie, aber nicht absurd
    expect(arcLength(weg)).toBeGreaterThan(dist(a, b));
    expect(arcLength(weg)).toBeLessThan(dist(a, b) * 3);
  });
});

describe("transform", () => {
  it("dreht um den Ursprung", () => {
    const r = rotator(90)(pt(1, 0));
    expect(r.x).toBeCloseTo(0, 9);
    expect(r.y).toBeCloseTo(1, 9);
  });
});

describe("pointInPolygon", () => {
  it("erkennt das Loch als aussen", () => {
    const a = annulus(0, 0, 10, 5);
    expect(pointInPolygon(a, pt(0, 0))).toBe(false);
    expect(pointInPolygon(a, pt(7.5, 0))).toBe(true);
    expect(pointInPolygon(a, pt(20, 0))).toBe(false);
  });

  it("arbeitet auf einem Bogen-Umriss", () => {
    const outline = [...arc(0, 0, 10, 0, 180, 24), ...arc(0, 0, 8, 180, 0, 24)];
    const p = polygonOf(outline);
    expect(pointInPolygon(p, pt(0, 9))).toBe(true);
    expect(pointInPolygon(p, pt(0, 4))).toBe(false);
  });
});
