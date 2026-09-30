import { describe, expect, it } from "vitest";
import {
  DENSITY_ERROR,
  densityProfile,
  NEEDLE_GRID_MM,
  NEEDLE_WARN,
  needleClusters,
  untrimmedJumps,
} from "../analyze.js";
import type { Stitch } from "../types.js";
import { densitySpots, needleSpots, openJumps } from "./dst-spots.js";

const stitch = (x: number, y = 0): Stitch => ({ x, y, cmd: "stitch" });
const jump = (x: number, y = 0): Stitch => ({ x, y, cmd: "jump" });
const cut = (cmd: "trim" | "color", x: number, y = 0): Stitch => ({ x, y, cmd });
/** n stitches on one point. */
const pile = (n: number, x: number, y: number): Stitch[] =>
  Array.from({ length: n }, () => stitch(x, y));

/** A fixed pseudo-random stream (LCG): the same points every run, spread over a small area so cells fill. */
function scatter(n: number, width: number): Stitch[] {
  let seed = 12345;
  const next = (): number => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  return Array.from({ length: n }, () => stitch(next() * width, next() * width));
}

describe("needleSpots (needle penetrations per 0.2 mm cell, spec §11)", () => {
  it("finds the cells with as many penetrations as the warning limit, fullest first", () => {
    const st = [...pile(6, 30, 5), ...pile(7, 10, 5), ...pile(NEEDLE_WARN - 1, 20, 5)];
    expect(needleSpots(st)).toEqual([
      { x: 10, y: 5, count: 7, cells: 1 },
      { x: 30, y: 5, count: 6, cells: 1 },
    ]);
  });

  it("names the middle of the cell, which is a multiple of the grid", () => {
    // 10.07 rounds to the cell at 10.0 (0.2 mm grid, round): the spot is in the middle of it.
    const [spot] = needleSpots(pile(6, 10.07, 5.03));
    expect(spot!.x).toBeCloseTo(10.0, 9);
    expect(spot!.y).toBeCloseTo(5.0, 9);
    expect(spot!.x / NEEDLE_GRID_MM).toBeCloseTo(Math.round(spot!.x / NEEDLE_GRID_MM), 9);
  });

  it("makes one spot of neighbouring cells, at the fullest, and counts the cells", () => {
    // 8 at 10.0 and 6 in the next cell (10.2) and 6 in the one after (10.4): one pile-up, not three.
    const st = [...pile(6, 10.4, 5), ...pile(8, 10, 5), ...pile(6, 10.2, 5)];
    expect(needleSpots(st)).toEqual([{ x: 10, y: 5, count: 8, cells: 3 }]);
  });

  it("keeps two places apart that are apart", () => {
    const spots = needleSpots([...pile(6, 10, 5), ...pile(6, 14, 5)]);
    expect(spots).toHaveLength(2);
  });

  it("counts stitches only: a jump or a trim on the same spot is no penetration", () => {
    const st: Stitch[] = [...pile(5, 10, 5), jump(10, 5), cut("trim", 10, 5), cut("color", 10, 5)];
    expect(needleSpots(st)).toEqual([]);
  });

  it("finds nothing in an empty list", () => {
    expect(needleSpots([])).toEqual([]);
  });

  it("agrees with needleClusters on how many cells are over the limit and how full the fullest is", () => {
    for (const [n, width] of [
      [3000, 4],
      [1500, 4],
      [8000, 12],
    ] as const) {
      const st = scatter(n, width);
      const spots = needleSpots(st);
      const clusters = needleClusters(st);
      expect(clusters.cells).toBeGreaterThan(0);
      expect(spots.reduce((sum, s) => sum + s.cells, 0)).toBe(clusters.cells);
      expect(Math.max(0, ...spots.map((s) => s.count))).toBe(
        clusters.max >= NEEDLE_WARN ? clusters.max : 0,
      );
    }
  });

  it("is the same for the same stitches in another order", () => {
    const st = [...pile(6, 10, 5), ...pile(9, 12, 6), ...pile(7, 10.2, 5)];
    expect(needleSpots([...st].reverse())).toEqual(needleSpots(st));
  });
});

describe("densitySpots (stitches per mm², spec §11)", () => {
  it("finds the cells over the error limit, not those at it", () => {
    const at = pile(DENSITY_ERROR, 10.5, 5.5);
    const over = pile(DENSITY_ERROR + 1, 20.5, 5.5);
    expect(densitySpots([...at, ...over])).toEqual([
      { x: 20.5, y: 5.5, count: DENSITY_ERROR + 1, cells: 1 },
    ]);
  });

  it("makes one spot of neighbouring cells", () => {
    const st = [...pile(25, 10.5, 5.5), ...pile(19, 11.5, 5.5), ...pile(19, 11.5, 6.5)];
    expect(densitySpots(st)).toEqual([{ x: 10.5, y: 5.5, count: 25, cells: 3 }]);
  });

  it("keeps apart what is apart", () => {
    expect(densitySpots([...pile(19, 10.5, 5.5), ...pile(19, 15.5, 5.5)])).toHaveLength(2);
  });

  it("agrees with densityProfile on how many cells are over the limit", () => {
    for (const [n, width] of [
      [1500, 10],
      [4000, 10],
      [6000, 15],
    ] as const) {
      const st = scatter(n, width);
      const spots = densitySpots(st);
      expect(spots.reduce((sum, s) => sum + s.cells, 0)).toBe(densityProfile(st).overError);
    }
  });

  it("counts stitches only", () => {
    expect(
      densitySpots([...pile(10, 1.5, 1.5), ...Array.from({ length: 20 }, () => jump(1.5, 1.5))]),
    ).toEqual([]);
  });
});

describe("openJumps (thread on the fabric, spec §10.2)", () => {
  it("lists a move of more than the threshold that nothing cut before, from where the thread is fast to where it ends", () => {
    expect(openJumps([stitch(0), stitch(1), jump(12), stitch(13)], 5)).toEqual([
      { from: { x: 1, y: 0 }, to: { x: 12, y: 0 }, lengthMm: 11 },
    ]);
  });

  it("makes one move of the jump records of a long jump, measured along them", () => {
    expect(openJumps([stitch(0), jump(3, 0), jump(3, 4), stitch(3, 4)], 5)).toEqual([
      { from: { x: 0, y: 0 }, to: { x: 3, y: 4 }, lengthMm: 7 },
    ]);
  });

  it("does not list a move that is cut, nor one up to the threshold", () => {
    expect(openJumps([stitch(0), cut("trim", 0), jump(20), stitch(20)], 5)).toEqual([]);
    expect(openJumps([stitch(0), cut("color", 0), jump(20), stitch(20)], 5)).toEqual([]);
    expect(openJumps([stitch(0), jump(5), stitch(5)], 5)).toEqual([]);
  });

  it("lists the next move again once a stitch has anchored the thread", () => {
    expect(
      openJumps([stitch(0), cut("trim", 0), jump(20), stitch(20), jump(40), stitch(41)], 5),
    ).toEqual([{ from: { x: 20, y: 0 }, to: { x: 40, y: 0 }, lengthMm: 20 }]);
  });

  it("finds nothing in an empty list or one without jumps", () => {
    expect(openJumps([], 5)).toEqual([]);
    expect(openJumps([stitch(0), stitch(50)], 5)).toEqual([]);
  });

  it("agrees with untrimmedJumps on how many there are and how long the longest is", () => {
    const lists: Stitch[][] = [
      [stitch(0), jump(10), stitch(10), jump(40), stitch(40), jump(50), stitch(50)],
      [stitch(0), cut("trim", 0), jump(20), stitch(20), jump(40), stitch(41), jump(45), stitch(45)],
      [
        jump(30),
        stitch(30),
        jump(60, 5),
        jump(90, 5),
        cut("color", 90, 5),
        jump(120, 5),
        stitch(120, 5),
      ],
    ];
    for (const list of lists) {
      const open = openJumps(list, 5);
      const u = untrimmedJumps(list, 5);
      expect(open).toHaveLength(u.count);
      expect(Math.max(0, ...open.map((j) => j.lengthMm))).toBeCloseTo(u.longestMm, 9);
    }
  });
});
