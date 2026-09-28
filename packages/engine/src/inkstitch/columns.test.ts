import { beforeAll, describe, expect, it } from "vitest";
import type { Point, Polygon } from "@texma-stitch/geometry";
import { initGeometry, pointInPolygon } from "@texma-stitch/geometry";
import { GLYPHS } from "../../test/fixtures/glyphs.js";
import { BLUNT_V, circle, polygonOf, SLAB_T, TEXTURED_BAR } from "../../test/fixtures/shapes.js";
import { COLUMN_COVERAGE_MIN } from "../import/svg.js";
import type { SatinColumnPlan } from "./columns.js";
import { SATIN_RUNG_OVERSHOOT_MM, satinColumns, SMOOTHING_STEPS_MM } from "./columns.js";
import { stitchOrder } from "./strokes.js";

beforeAll(async () => {
  await initGeometry();
});

const UNDERLAP = 0.2;
const TEST_LETTERS = ["T", "L", "E", "H", "K", "A", "X", "B", "R", "4", "8", "O", "S"];

/** Do segments a-b and c-d cross (touching counts)? */
function crosses(a: Point, b: Point, c: Point, d: Point): boolean {
  const o = (p: Point, q: Point, r: Point): number =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  return o(a, b, c) * o(a, b, d) <= 0 && o(c, d, a) * o(c, d, b) <= 0;
}
const crossesRail = (rung: [Point, Point], rail: Point[]): boolean =>
  rail.some((p, i) => i + 1 < rail.length && crosses(rung[0], rung[1], p, rail[i + 1]!));

/** How far p lies outside the letter (0 inside). */
function outsideBy(letter: Polygon, p: Point): number {
  if (pointInPolygon(letter, p)) return 0;
  let best = Infinity;
  for (const ring of [letter.outer, ...letter.holes]) {
    ring.forEach((a, i) => {
      const b = ring[(i + 1) % ring.length]!;
      const ex = b.x - a.x;
      const ey = b.y - a.y;
      const l2 = ex * ex + ey * ey;
      const u =
        l2 < 1e-18 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * ex + (p.y - a.y) * ey) / l2));
      best = Math.min(best, Math.hypot(p.x - a.x - u * ex, p.y - a.y - u * ey));
    });
  }
  return best;
}

describe("satinColumns (a letter set as satin columns)", () => {
  it("sets every test letter, covering it almost completely", () => {
    for (const ch of TEST_LETTERS) {
      const r = satinColumns(GLYPHS[ch]!, { underlapMm: UNDERLAP, idPrefix: ch });
      expect(r.ok, `${ch}: ${r.reason}`).toBe(true);
      expect(r.coverage, ch).toBeGreaterThan(0.99);
      expect(r.smoothedMm, ch).toBe(0);
    }
  });

  it("gives every rung both rails to cross, just past them", () => {
    for (const ch of TEST_LETTERS) {
      const r = satinColumns(GLYPHS[ch]!, { underlapMm: UNDERLAP, idPrefix: ch });
      for (const c of r.columns) {
        for (const rung of c.rungs) {
          expect(crossesRail(rung, c.railA), `${c.id} rail A`).toBe(true);
          expect(crossesRail(rung, c.railB), `${c.id} rail B`).toBe(true);
        }
      }
    }
  });

  it("orders the columns: what ends under a stroke comes first", () => {
    const r = satinColumns(GLYPHS.T!, { underlapMm: UNDERLAP, idPrefix: "T" });
    const [stem, bar] = r.columns as [SatinColumnPlan, SatinColumnPlan];
    expect(r.columns.map((c) => c.id)).toEqual(["T-0", "T-1"]);
    const graph = r.graphs[0]!;
    expect(stitchOrder(graph.strokes.length, graph.before)).toEqual([stem.stroke, bar.stroke]);
    // The stem runs on under the crossbar by the underlap: the crossbar's
    // lower edge is at y = 1.612.
    const top = Math.min(...[...stem.railA, ...stem.railB].map((p) => p.y));
    expect(top).toBeCloseTo(1.612 - UNDERLAP, 1);
  });

  it("keeps rails on the letter and states the column width", () => {
    for (const ch of TEST_LETTERS) {
      const letter = GLYPHS[ch]!;
      const r = satinColumns(letter, { underlapMm: UNDERLAP, idPrefix: ch });
      for (const c of r.columns) {
        for (const p of [...c.railA, ...c.railB]) {
          expect(outsideBy(letter, p), `${c.id} (${p.x}, ${p.y})`).toBeLessThan(0.05);
        }
      }
    }
    const r = satinColumns(GLYPHS.H!, { underlapMm: UNDERLAP, idPrefix: "H" });
    for (const c of r.columns) {
      expect(c.widthMm).toBeGreaterThan(1.5);
      expect(c.widthMm).toBeLessThan(3);
      for (const [a, b] of c.rungs) {
        expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeGreaterThan(2 * SATIN_RUNG_OVERSHOOT_MM);
      }
    }
  });

  it("sets a slab-serif T: crossbar with its serifs, stem with its foot", () => {
    const r = satinColumns(SLAB_T, { underlapMm: UNDERLAP, idPrefix: "T" });
    expect(r.ok, r.reason).toBe(true);
    expect(r.coverage).toBeGreaterThan(0.95);
  });

  it("sets a ring as one closed column", () => {
    const r = satinColumns(GLYPHS.O!, { underlapMm: UNDERLAP, idPrefix: "O" });
    expect(r.columns).toHaveLength(1);
    expect(r.columns[0]!.closed).toBe(true);
  });

  it("reads the sharp bend of a blunt v as a corner: two columns", () => {
    const r = satinColumns(BLUNT_V, { underlapMm: UNDERLAP, idPrefix: "v" });
    expect(r.ok, r.reason).toBe(true);
    expect(r.columns).toHaveLength(2);
    expect(r.coverage).toBeGreaterThan(0.95);
  });

  it("smooths a textured outline first when it yields no plan as drawn", () => {
    const r = satinColumns(TEXTURED_BAR, { underlapMm: UNDERLAP, idPrefix: "bar" });
    expect(r.ok, r.reason).toBe(true);
    expect(SMOOTHING_STEPS_MM).toContain(r.smoothedMm);
    expect(r.coverage).toBeGreaterThanOrEqual(COLUMN_COVERAGE_MIN);
    expect(r.columns.map((c) => c.id)).toEqual(r.columns.map((_, i) => `bar-${i}`));
    expect(r.warnings.some((w) => w.message.includes("smoothed"))).toBe(true);
  });

  it("leaves a blob without strokes to tatami, with the reason — smoothing makes none", () => {
    const r = satinColumns(polygonOf(circle(0, 0, 2)), { underlapMm: UNDERLAP, idPrefix: "block" });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("no stroke found");
    expect(r.warnings.some((w) => w.code === "AUTOSATIN_MIXED" && w.objectId === "block")).toBe(
      true,
    );
  });
});
