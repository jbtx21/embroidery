import { beforeAll, describe, expect, it } from "vitest";
import type { MedialBranch } from "@texma-stitch/geometry";
import { initGeometry } from "@texma-stitch/geometry";
import { GLYPHS } from "../../test/fixtures/glyphs.js";
import { BLUNT_V, polygonOf, pt, rect, SLAB_T } from "../../test/fixtures/shapes.js";
import type { LetterStroke, StrokeGraph } from "./strokes.js";
import { SHARP_BEND_DEG, sharpBends, stitchOrder, strokeGraph } from "./strokes.js";

beforeAll(async () => {
  await initGeometry();
});

const ends = (s: LetterStroke): string[] => [s.start.kind, s.end.kind].sort();
const abutting = (g: StrokeGraph): LetterStroke[] =>
  g.strokes.filter((s) => s.start.kind === "abut" || s.end.kind === "abut");

/** A branch along a polyline, sampled every 0.1 mm, constant clearance. */
function branchAlong(corners: { x: number; y: number }[], radius: number): MedialBranch {
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i + 1 < corners.length; i++) {
    const a = corners[i]!;
    const b = corners[i + 1]!;
    const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.1);
    for (let k = 0; k < n; k++)
      points.push(pt(a.x + ((b.x - a.x) * k) / n, a.y + ((b.y - a.y) * k) / n));
  }
  points.push(corners[corners.length - 1]!);
  return { points, radii: points.map(() => radius) };
}

describe("stitchOrder", () => {
  it("puts what ends under a stroke before it, ties by index", () => {
    expect(stitchOrder(3, [])).toEqual([0, 1, 2]);
    expect(stitchOrder(3, [[2, 0]])).toEqual([1, 2, 0]);
    expect(
      stitchOrder(3, [
        [0, 1],
        [2, 1],
      ]),
    ).toEqual([0, 2, 1]);
  });

  it("is undefined when the constraints go round in a circle", () => {
    expect(
      stitchOrder(2, [
        [0, 1],
        [1, 0],
      ]),
    ).toBeUndefined();
  });
});

describe("sharpBends (strokeGraph step 0)", () => {
  it("finds the corner a branch turns round, once", () => {
    const v = branchAlong([pt(-3, 0), pt(0, 8), pt(3, 0)], 0.5);
    const bends = sharpBends(v);
    expect(bends).toHaveLength(1);
    const at = v.points[bends[0]!]!;
    expect(Math.abs(at.x)).toBeLessThan(0.15);
    expect(at.y).toBeGreaterThan(7.8);
  });

  it("finds none on a straight branch or a round curve", () => {
    expect(sharpBends(branchAlong([pt(0, 0), pt(10, 0)], 0.5))).toEqual([]);
    const arc: { x: number; y: number }[] = [];
    for (let i = 0; i <= 32; i++) {
      const a = (Math.PI * i) / 32; // a half circle of radius 4 turns by 180° over 12.6 mm
      arc.push(pt(4 * Math.cos(a), 4 * Math.sin(a)));
    }
    expect(sharpBends(branchAlong(arc, 0.5))).toEqual([]);
  });

  it("measures the turn within the reach only, not near the branch ends", () => {
    // The same corner 0.3 mm from the branch end: the reach does not fit.
    const short = branchAlong([pt(-0.3, -0.3), pt(0, 0), pt(3, -8)], 0.5);
    expect(sharpBends(short)).toEqual([]);
    expect(SHARP_BEND_DEG).toBeGreaterThan(90);
  });
});

describe("strokeGraph (the puncher's plan of a letter)", () => {
  it("T: the stem ends under the crossbar, which runs through", () => {
    const g = strokeGraph(GLYPHS.T!);
    expect(g.strokes).toHaveLength(2);
    const stem = abutting(g);
    expect(stem).toHaveLength(1);
    const bar = g.strokes.find((s) => s !== stem[0])!;
    expect(ends(bar)).toEqual(["free", "free"]);
    expect(ends(stem[0]!)).toEqual(["abut", "free"]);
    expect(g.before).toEqual([[stem[0]!.index, bar.index]]);
  });

  it("L: the longer stroke runs on over the corner, the other ends under it", () => {
    const g = strokeGraph(GLYPHS.L!);
    expect(g.strokes).toHaveLength(2);
    const corner = g.strokes.find((s) => s.start.kind === "corner" || s.end.kind === "corner")!;
    const other = g.strokes.find((s) => s !== corner)!;
    expect(corner.length).toBeGreaterThan(other.length);
    expect([other.start, other.end]).toContainEqual({ kind: "abut", onto: corner.index });
  });

  it("E: the stem carries both corners, all three arms end under it", () => {
    const g = strokeGraph(GLYPHS.E!);
    expect(g.strokes).toHaveLength(4);
    const stem = g.strokes.find((s) => s.start.kind === "corner" && s.end.kind === "corner")!;
    expect(stem).toBeDefined();
    const arms = g.strokes.filter((s) => s !== stem);
    for (const arm of arms) {
      expect([arm.start, arm.end]).toContainEqual({ kind: "abut", onto: stem.index });
    }
  });

  it("X: two strokes pass through one crossing", () => {
    const g = strokeGraph(GLYPHS.X!);
    expect(g.strokes).toHaveLength(2);
    for (const s of g.strokes) {
      expect(ends(s)).toEqual(["free", "free"]);
      expect(s.through.length).toBeGreaterThan(0);
    }
    expect(g.strokes[0]!.through).toEqual(g.strokes[1]!.through);
  });

  it("K: arm and leg meet before the stem — the shorter ends under the longer", () => {
    const g = strokeGraph(GLYPHS.K!);
    expect(g.strokes).toHaveLength(3);
    const ontos = g.strokes.flatMap((s) =>
      [s.start, s.end].flatMap((e) => (e.kind === "abut" ? [e.onto] : [])),
    );
    // One diagonal ends under the other, which ends under the stem.
    expect(new Set(ontos).size).toBe(2);
    expect(stitchOrder(g.strokes.length, g.before)).toBeDefined();
  });

  it("O and 8: rings", () => {
    const o = strokeGraph(GLYPHS.O!);
    expect(o.strokes).toHaveLength(1);
    expect(o.strokes[0]!.closed).toBe(true);
    const eight = strokeGraph(GLYPHS["8"]!);
    expect(eight.strokes).toHaveLength(2);
    expect(eight.strokes.every((s) => s.closed)).toBe(true);
  });

  it("B, R, 4: the stitch order never goes round in a circle", () => {
    for (const ch of ["B", "R", "4", "A", "H"]) {
      const g = strokeGraph(GLYPHS[ch]!, ch);
      expect(stitchOrder(g.strokes.length, g.before), ch).toBeDefined();
      expect(g.warnings, ch).toEqual([]);
    }
  });

  it("gives every branch outside a junction to a stroke", () => {
    for (const ch of ["T", "E", "K", "B", "R", "S"]) {
      const g = strokeGraph(GLYPHS[ch]!, ch);
      const inner = new Set(g.junctions.flatMap((j) => j.inner));
      g.branches.forEach((_, bi) => {
        if (inner.has(bi)) return;
        expect(g.branchStroke[bi], `${ch} branch ${bi}`).toBeGreaterThanOrEqual(0);
      });
    }
  });

  it("a slab-serif T: the crossbar is one stroke although no piece of it is long", () => {
    const g = strokeGraph(SLAB_T, "T");
    const bar = g.strokes.find((s) => s.through.length > 0 && s.points[0]!.y < 3)!;
    expect(bar).toBeDefined();
    // Between the serifs and the stem, no branch is a column of its own.
    expect(bar.path.every((p) => !g.branches[p.branch]!.primary)).toBe(true);
    // The stem ends under the crossbar (and under the foot block).
    const stem = g.strokes.find((s) => s.start.kind === "abut" && s.end.kind === "abut")!;
    expect([stem.start, stem.end]).toContainEqual({ kind: "abut", onto: bar.index });
    // The drop serifs belong to the crossbar, nothing to nobody.
    const inner = new Set(g.junctions.flatMap((j) => j.inner));
    g.branches.forEach((_, bi) => {
      if (!inner.has(bi)) expect(g.branchStroke[bi], `branch ${bi}`).toBeGreaterThanOrEqual(0);
    });
  });

  it("a blunt v: one stroke round the bend, or two meeting at a corner when split", () => {
    const plain = strokeGraph(BLUNT_V);
    expect(plain.sharpBendCount).toBe(1);
    expect(plain.strokes).toHaveLength(1);

    const split = strokeGraph(BLUNT_V, "v", { splitSharpBends: true });
    expect(split.strokes).toHaveLength(2);
    const kinds = split.strokes.flatMap((s) => [s.start.kind, s.end.kind]).sort();
    expect(kinds).toEqual(["abut", "corner", "free", "free"]);
  });

  it("a block with no stroke in it: no plan, and it says so", () => {
    const g = strokeGraph(polygonOf(rect(0, 0, 3, 3)), "block");
    expect(g.strokes).toEqual([]);
    expect(g.warnings).toHaveLength(1);
    expect(g.warnings[0]!.objectId).toBe("block");
  });
});
