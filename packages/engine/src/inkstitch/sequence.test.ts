import { beforeAll, describe, expect, it } from "vitest";
import type { Polygon } from "@texma-stitch/geometry";
import { initGeometry } from "@texma-stitch/geometry";
import { circle, polygonOf, rect } from "../../test/fixtures/shapes.js";
import {
  blockLowerBound,
  blockPlan,
  colourBlockCount,
  colourKey,
  sequenceByColour,
} from "./sequence.js";
import type { SequenceNode } from "./sequence.js";

beforeAll(async () => {
  await initGeometry();
});

const at = (x: number, y = 0, size = 10): Polygon => polygonOf(rect(x, y, size, size));
const node = (colour: string, cover: Polygon | undefined, rank = 0): SequenceNode => ({
  colour,
  rank,
  cover,
});

describe("colourKey", () => {
  it("makes hex colours comparable: lower case, three digits written out", () => {
    expect(colourKey("#BEBEBE")).toBe("#bebebe");
    expect(colourKey(" #F0c ")).toBe("#ff00cc");
    expect(colourKey("red")).toBe("red");
  });
});

describe("colourBlockCount", () => {
  it("counts runs of one colour", () => {
    expect(colourBlockCount(["a", "a", "b", "a"])).toBe(3);
    expect(colourBlockCount(["#AAA", "#aaaaaa"])).toBe(1);
    expect(colourBlockCount([])).toBe(0);
  });
});

describe("blockLowerBound", () => {
  it("is one block more than the most colour changes along a chain of overlaps", () => {
    // 0 (a) < 1 (b) < 2 (a) < 3 (b): three changes on one chain.
    expect(blockLowerBound([0, 1, 0, 1], [[1], [2], [3], []])).toBe(4);
  });

  it("is never under the number of colours, and does not count a change within one colour", () => {
    // Nothing binds: still one block for each of the two colours.
    expect(blockLowerBound([0, 1, 0, 1], [[], [], [], []])).toBe(2);
    expect(blockLowerBound([0, 0, 1], [[1], [2], []])).toBe(2);
    expect(blockLowerBound([0, 1, 2], [[], [], []])).toBe(3);
    expect(blockLowerBound([], [])).toBe(0);
  });
});

describe("blockPlan", () => {
  it("finds the fewest blocks, where the first colour that is ready is not the way", () => {
    // Node 1 (colour 1) has to come before node 2 (colour 0). Starting with the colour
    // of node 0 — the first one ready — costs four blocks: 0, 1, 2, 3. Starting with
    // colour 1 makes it three: 1, then 0 and 2 together, then 3.
    const plan = blockPlan([0, 1, 0, 2], [[], [2], [], []]);
    expect(plan).toEqual([1, 0, 2]);
  });

  it("takes a colour twice when the overlaps demand it", () => {
    // 0 (a) < 1 (b) < 2 (a): a, b, a — and node 3 (b) rides with node 1.
    expect(blockPlan([0, 1, 0, 1], [[1], [2], [], []])).toEqual([0, 1, 0]);
  });

  it("is one block for one colour, and nothing for nothing", () => {
    expect(blockPlan([0, 0, 0], [[1], [2], []])).toEqual([0]);
    expect(blockPlan([], [])).toEqual([]);
  });
});

describe("sequenceByColour (spec §10.1)", () => {
  it("groups the colours of objects that do not overlap", () => {
    const r = sequenceByColour([
      node("a", at(0)),
      node("b", at(20)),
      node("a", at(40)),
      node("b", at(60)),
    ]);
    expect(r.order).toEqual([0, 2, 1, 3]);
    expect(r.blocks).toBe(2);
    expect(r.lowerBound).toBe(2);
  });

  it("never turns two overlapping objects round — even of one colour", () => {
    // 1 lies on 0, whatever their colours: 0 stays first, 1 second.
    const r = sequenceByColour([node("a", at(0)), node("b", at(5)), node("a", at(8))]);
    expect(r.order.indexOf(0)).toBeLessThan(r.order.indexOf(1));
    expect(r.order.indexOf(1)).toBeLessThan(r.order.indexOf(2));
    expect(r.blocks).toBe(3);
    const same = sequenceByColour([node("a", at(0)), node("b", at(50)), node("a", at(5))]);
    expect(same.order.indexOf(0)).toBeLessThan(same.order.indexOf(2));
  });

  it("takes the colour order that leads to the fewest blocks", () => {
    // 0 (a) far away, 1 (b) under 2 (a), 3 (c) far away. Colour a first would cost four blocks.
    const r = sequenceByColour([
      node("a", at(0)),
      node("b", at(50)),
      node("a", at(55)),
      node("c", at(100)),
    ]);
    expect(r.blocks).toBe(3);
    expect(r.lowerBound).toBe(3);
    // b first; then a, the object on top of it before the far one (it is nearer); then c.
    expect(r.order).toEqual([1, 2, 0, 3]);
  });

  it("reports the fewest blocks the overlaps allow next to the blocks it made", () => {
    // Two colours, a chain a, b, a: no order can do with fewer than three blocks.
    const r = sequenceByColour([node("a", at(0)), node("b", at(5)), node("a", at(8))]);
    expect(r.lowerBound).toBe(3);
    expect(r.blocks).toBeGreaterThanOrEqual(r.lowerBound);
  });

  it("puts areas before satin before lines within a colour, when nothing binds", () => {
    const r = sequenceByColour([node("a", at(0), 1), node("a", at(100), 0), node("a", at(50), 3)]);
    expect(r.order).toEqual([1, 0, 2]);
  });

  it("takes the nearest object next within a stage", () => {
    const r = sequenceByColour([node("a", at(0)), node("a", at(100)), node("a", at(30))]);
    expect(r.order).toEqual([0, 2, 1]);
  });

  it("measures from the outlines, not the corners: a long bar beside the start is near", () => {
    // 1 is 30 mm away; the bar 2 is 2 mm away but its corners are over 100 mm off.
    const bar = polygonOf(rect(-100, 12, 300, 2));
    const r = sequenceByColour([node("a", at(0)), node("a", at(40)), node("a", bar)]);
    expect(r.order).toEqual([0, 2, 1]);
  });

  it("measures into the holes of a shape too", () => {
    const ring = { outer: rect(0, 0, 40, 40), holes: [rect(10, 10, 20, 20).reverse()] };
    const r = sequenceByColour([
      node("a", ring),
      node("a", polygonOf(circle(200, 200, 3))),
      node("a", at(15, 15)),
    ]);
    // From the ring, the square inside its hole is at hand, the circle far off.
    expect(r.order).toEqual([0, 2, 1]);
  });

  it("does not let an overlap under the given area bind", () => {
    // 1 mm² between the two: a, b, a would cost three blocks; the small overlap may be ignored.
    const nodes = [node("a", at(0)), node("b", at(9, 9)), node("a", at(18, 18))];
    expect(sequenceByColour(nodes).blocks).toBe(3);
    const r = sequenceByColour(nodes, { minOverlapMm2: 2 });
    expect(r.blocks).toBe(2);
    expect(r.order).toEqual([0, 2, 1]);
  });

  it("is the same every time", () => {
    const nodes = [
      node("a", at(0)),
      node("b", at(5)),
      node("a", at(50)),
      node("c", at(55)),
      node("b", at(100)),
      node("c", at(8)),
    ];
    expect(sequenceByColour(nodes)).toEqual(sequenceByColour(nodes));
  });

  it("gives an empty order for nothing, and leaves a single object as it is", () => {
    expect(sequenceByColour([])).toEqual({ order: [], blocks: 0, lowerBound: 0 });
    expect(sequenceByColour([node("a", at(0))])).toEqual({ order: [0], blocks: 1, lowerBound: 1 });
  });
});
