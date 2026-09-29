import { describe, expect, it } from "vitest";
import { untrimmedJumps } from "./analyze.js";
import type { Stitch } from "./types.js";

const stitch = (x: number, y = 0): Stitch => ({ x, y, cmd: "stitch" });
const jump = (x: number, y = 0): Stitch => ({ x, y, cmd: "jump" });
const at = (cmd: "trim" | "color", x: number, y = 0): Stitch => ({ x, y, cmd });

describe("untrimmedJumps (thread on the fabric, spec §10.2)", () => {
  it("counts a move of more than the threshold that nothing cut before", () => {
    const r = untrimmedJumps([stitch(0), stitch(1), jump(12), stitch(13)], 5);
    expect(r).toEqual({ count: 1, longestMm: 11 });
  });

  it("adds up the jump records of one move — a long jump is split into several", () => {
    // 4 + 4 + 4 mm in three records, no stitch between: one move of 12 mm.
    const r = untrimmedJumps([stitch(0), jump(4), jump(8), jump(12), stitch(12)], 5);
    expect(r).toEqual({ count: 1, longestMm: 12 });
  });

  it("does not count a move that is cut: a trim or a colour change before it", () => {
    const trimmed = [stitch(0), at("trim", 0), jump(20), stitch(20)];
    const changed = [stitch(0), at("color", 0), jump(20), stitch(20)];
    expect(untrimmedJumps(trimmed, 5)).toEqual({ count: 0, longestMm: 0 });
    expect(untrimmedJumps(changed, 5)).toEqual({ count: 0, longestMm: 0 });
  });

  it("counts the next move again once a stitch has anchored the thread", () => {
    const r = untrimmedJumps(
      [stitch(0), at("trim", 0), jump(20), stitch(20), jump(40), stitch(41)],
      5,
    );
    expect(r).toEqual({ count: 1, longestMm: 20 });
  });

  it("leaves a move up to the threshold alone, and is measured along the moves", () => {
    expect(untrimmedJumps([stitch(0), jump(5), stitch(5)], 5)).toEqual({ count: 0, longestMm: 0 });
    // Two legs of 3 and 4 mm at a right angle: 7 mm of thread, not the 5 mm between the ends.
    const r = untrimmedJumps([stitch(0), jump(3, 0), jump(3, 4), stitch(3, 4)], 5);
    expect(r).toEqual({ count: 1, longestMm: 7 });
  });

  it("counts every long move and reports the longest", () => {
    const r = untrimmedJumps(
      [stitch(0), jump(10), stitch(10), jump(40), stitch(40), jump(50), stitch(50)],
      5,
    );
    expect(r).toEqual({ count: 3, longestMm: 30 });
  });

  it("finds nothing in an empty list, or in one without jumps", () => {
    expect(untrimmedJumps([], 5)).toEqual({ count: 0, longestMm: 0 });
    expect(untrimmedJumps([stitch(0), stitch(50)], 5)).toEqual({ count: 0, longestMm: 0 });
  });
});
