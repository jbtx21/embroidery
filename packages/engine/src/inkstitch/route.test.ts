import { beforeAll, describe, expect, it } from "vitest";
import type { Polygon, Polyline } from "@texma-stitch/geometry";
import { initGeometry } from "@texma-stitch/geometry";
import { polygonOf, pt, rect } from "../../test/fixtures/shapes.js";
import { routeBlocks } from "./route.js";
import type { RouteNode } from "./route.js";

beforeAll(async () => {
  await initGeometry();
});

const line = (...pts: [number, number][]): Polyline => pts.map(([x, y]) => pt(x, y));
const running = (colour: string, lines: Polyline[], cover?: Polygon): RouteNode => ({
  kind: "running",
  colour,
  rank: 3,
  cover,
  lines,
});
const area = (colour: string, x: number, y: number, size = 4): RouteNode => ({
  kind: "tatami",
  colour,
  rank: 0,
  cover: polygonOf(rect(x, y, size, size)),
});
const none = (n: number): number[][] => Array.from({ length: n }, () => []);

describe("routeBlocks", () => {
  it("puts objects that touch next to each other, where the order had them jump across bare fabric", () => {
    // A runs 0..5, B 5..10, C 10..15 along y = 0; the order A, C, B cuts twice, A, B, C not at all.
    const nodes = [
      running("#000", [line([0, 0], [5, 0])]),
      running("#000", [line([10, 0], [15, 0])]),
      running("#000", [line([5, 0], [10, 0])]),
    ];
    const routed = routeBlocks(nodes, [0, 1, 2], none(3));
    expect(routed.order).toEqual([0, 2, 1]);
    expect(routed.cuts.before).toBeGreaterThan(routed.cuts.after);
    expect(routed.cuts.after).toBe(0);
  });

  it("writes a running object the other way round where that joins it to its neighbour", () => {
    // B runs from right to left, from 10 to 5: its end meets A's end, so the way round is the other.
    const nodes = [
      running("#000", [line([0, 0], [5, 0])]),
      running("#000", [line([10, 0], [5, 0])]),
    ];
    const routed = routeBlocks(nodes, [0, 1], none(2));
    expect(routed.flip).toEqual([false, true]);
    expect(routed.cuts.after).toBe(0);
  });

  it("keeps the colour blocks as they are, and the order of what overlaps", () => {
    // 0 and 2 are one colour, 1 another; 0 and 2 overlap, so 0 stays before 2.
    const nodes = [
      area("#aaa", 0, 0, 6),
      running("#bbb", [line([20, 0], [25, 0])]),
      area("#aaa", 4, 0, 6),
    ];
    const after: number[][] = [[2], [], []];
    const routed = routeBlocks(nodes, [0, 2, 1], after);
    expect(routed.order).toEqual([0, 2, 1]);
    const colours = routed.order.map((i) => nodes[i]!.colour);
    expect(colours).toEqual(["#aaa", "#aaa", "#bbb"]);
  });

  it("applies the stage rule of the colour order: an area goes before lines that are free", () => {
    // The line is nearer to nothing in particular; the area must still come first.
    const nodes = [running("#000", [line([0, 0], [3, 0])]), area("#000", 40, 40)];
    const routed = routeBlocks(nodes, [1, 0], none(2));
    expect(routed.order).toEqual([1, 0]);
  });

  it("is deterministic: the same objects in the same order give the same result", () => {
    const nodes: RouteNode[] = [];
    for (let k = 0; k < 14; k++) {
      const x = ((k * 7) % 13) * 3;
      nodes.push(running("#000", [line([x, 0], [x + 2.5, 0])]));
    }
    const order = nodes.map((_, i) => i);
    const a = routeBlocks(nodes, order, none(nodes.length));
    const b = routeBlocks(nodes, order, none(nodes.length));
    expect(b).toEqual(a);
    expect(new Set(a.order).size).toBe(nodes.length);
  });

  it("lets an area wait for nothing when the stage rule is off", () => {
    // The line is nearer to the start; with the rule the area still goes first, without it the line may.
    const nodes = [running("#000", [line([0, 0], [3, 0])]), area("#000", 40, 40)];
    const free = routeBlocks(nodes, [1, 0], none(2), { stageRule: false });
    expect(free.order).toHaveLength(2);
    expect(routeBlocks(nodes, [1, 0], none(2)).order).toEqual([1, 0]);
  });

  it("takes a satin without columns and a running object without lines for an area", () => {
    const nodes: RouteNode[] = [
      { kind: "satin", colour: "#000", rank: 1, cover: polygonOf(rect(0, 0, 4, 4)) },
      { kind: "running", colour: "#000", rank: 3, cover: polygonOf(rect(5, 0, 4, 4)), lines: [] },
      running("#000", [line([9, 2], [14, 2])]),
    ];
    const routed = routeBlocks(nodes, [0, 1, 2], none(3));
    expect(routed.order).toHaveLength(3);
    expect(routed.flip).toEqual([false, false, false]);
  });

  it("returns an empty result for no objects", () => {
    expect(routeBlocks([], [], [])).toEqual({
      order: [],
      flip: [],
      cuts: { before: 0, after: 0 },
      steps: { before: [], after: [] },
    });
  });
});
