import { beforeAll, describe, expect, it } from "vitest";
import type { Polygon } from "@texma-stitch/geometry";
import { initGeometry } from "@texma-stitch/geometry";
import { fillObject, runningObject } from "../test/fixtures/designs.js";
import { polygonOf, pt, rect } from "../test/fixtures/shapes.js";
import { coverPrecedence, precedence } from "./order.js";

beforeAll(async () => {
  await initGeometry();
});

const square = (x: number, y: number, size = 10): Polygon => polygonOf(rect(x, y, size, size));

describe("coverPrecedence (spec §10.1: overlap binds the order)", () => {
  it("points from the earlier of two overlapping covers to the later one", () => {
    expect(coverPrecedence([square(0, 0), square(5, 5), square(100, 100)])).toEqual([[1], [], []]);
  });

  it("does not bind covers that only touch or lie apart", () => {
    expect(coverPrecedence([square(0, 0), square(10, 0), square(0, 30)])).toEqual([[], [], []]);
  });

  it("leaves out objects without a cover, whatever lies where they are", () => {
    expect(coverPrecedence([square(0, 0), undefined, square(5, 5)])).toEqual([[2], [], []]);
  });

  it("lists every later cover an earlier one lies under, in order", () => {
    const after = coverPrecedence([square(0, 0, 30), square(5, 5), square(15, 15), square(50, 50)]);
    expect(after).toEqual([[1, 2], [], [], []]);
  });

  it("ignores overlaps under a given area, and only those", () => {
    // 25 mm² between the first two, 1 mm² between the first and the third, 36 mm² between
    // the last two.
    const covers = [square(0, 0), square(5, 5), square(9, 9)];
    expect(coverPrecedence(covers)).toEqual([[1, 2], [2], []]);
    expect(coverPrecedence(covers, 2)).toEqual([[1], [2], []]);
  });

  it("gives back an empty list for nothing", () => {
    expect(coverPrecedence([])).toEqual([]);
  });
});

describe("precedence", () => {
  it("is the overlaps of the covers of the objects — a running stitch binds nothing", () => {
    const objects = [
      fillObject("low", square(0, 0)),
      runningObject("line", [pt(0, 5), pt(20, 5)]),
      fillObject("high", square(5, 5)),
    ];
    expect(precedence(objects)).toEqual([[2], [], []]);
  });

  it("keeps the order of a sequence, one after the other", () => {
    const a = { ...fillObject("a", square(0, 0)), sequence: "text" };
    const b = { ...fillObject("b", square(50, 0)), sequence: "text" };
    const c = { ...fillObject("c", square(100, 0)), sequence: "text" };
    expect(precedence([a, b, c])).toEqual([[1], [2], []]);
  });
});
