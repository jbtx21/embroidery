import { describe, expect, it } from "vitest";
import { dist } from "@texma-stitch/geometry";
import { circle, pt, rect, sCurve } from "../test/fixtures/shapes.js";
import { runningObject } from "../test/fixtures/designs.js";
import { generateRunning, MIN_REMNANT_MM, runningStitches } from "./running.js";
import { tieBlocks, TIE_LENGTH_MM } from "./tie.js";
import { MAX_STITCH_MM, MIN_STITCH_MM, postProcess } from "./post.js";
import type { StitchBlock } from "./types.js";

describe("running stitch (spec §6)", () => {
  it("shortens the stitch in a tight curve and not on a straight run (spec §6.1)", () => {
    const straight = runningStitches([pt(0, 0), pt(31.4, 0)], { stitchLengthMm: 2.5 });
    // Same length as the straight line, but wrapped into a 5 mm circle.
    const curved = runningStitches(circle(0, 0, 5, 128), { stitchLengthMm: 2.5, closed: true });
    expect(curved.length).toBeGreaterThan(straight.length);
    for (let i = 1; i < curved.length; i++) {
      const d = dist(curved[i - 1]!, curved[i]!);
      expect(d).toBeGreaterThan(0.79);
      expect(d).toBeLessThan(2.51);
    }
  });

  it("divides a straight line evenly", () => {
    expect(runningStitches([pt(0, 0), pt(10, 0)], { stitchLengthMm: 2.5 })).toHaveLength(5);
  });

  it("leaves no remnant stitch below 0.5 mm", () => {
    for (const length of [10.2, 7.6, 13.1, 2.6]) {
      const s = runningStitches([pt(0, 0), pt(length, 0)], { stitchLengthMm: 2.5 });
      for (let i = 1; i < s.length; i++) {
        expect(dist(s[i - 1]!, s[i]!)).toBeGreaterThan(MIN_REMNANT_MM);
      }
    }
  });

  it("makes repeats 3 a bean stitch", () => {
    expect(
      runningStitches([pt(0, 0), pt(5, 0)], { stitchLengthMm: 5, repeats: 3 }).map((p) => p.x),
    ).toEqual([0, 5, 0, 5]);
  });

  it("gives a bean stitch three times the running-stitch length", () => {
    const plain = runningStitches([pt(0, 0), pt(10, 0)], { stitchLengthMm: 2.5 });
    const bean = runningStitches([pt(0, 0), pt(10, 0)], { stitchLengthMm: 2.5, repeats: 3 });
    // 4 segments become 12 movements plus the start point
    expect(bean.length - 1).toBe((plain.length - 1) * 3);
  });

  it("does five passes as well", () => {
    const five = runningStitches([pt(0, 0), pt(5, 0)], { stitchLengthMm: 5, repeats: 5 });
    expect(five.map((p) => p.x)).toEqual([0, 5, 0, 5, 0, 5]);
  });

  it("closes the ring", () => {
    const s = generateRunning(
      runningObject("r", rect(0, 0, 10, 10), { closed: true, stitchLengthMm: 2.5 }),
    );
    expect(s[0]!).toEqual(s[s.length - 1]!);
  });

  it("walks a circle and an S-curve without a gap", () => {
    for (const path of [circle(0, 0, 10), sCurve()]) {
      const s = runningStitches(path, { stitchLengthMm: 2.5 });
      for (let i = 1; i < s.length; i++) expect(dist(s[i - 1]!, s[i]!)).toBeLessThan(2.6);
    }
  });

  it("makes sharp corners stitch points", () => {
    const s = runningStitches([pt(0, 0), pt(10, 0), pt(10, 10)], { stitchLengthMm: 3 });
    expect(s.some((p) => Math.abs(p.x - 10) < 1e-9 && Math.abs(p.y) < 1e-9)).toBe(true);
  });

  it("returns a degenerate path unchanged", () => {
    expect(runningStitches([pt(1, 1)], { stitchLengthMm: 2.5 })).toHaveLength(1);
    expect(runningStitches([], { stitchLengthMm: 2.5 })).toHaveLength(0);
  });
});

describe("lock stitches (spec §10.3)", () => {
  it("locks at the start and before the end", () => {
    const blocks = tieBlocks([
      {
        objectId: "a",
        threadIndex: 0,
        stitches: [
          { x: 0, y: 0, cmd: "stitch" },
          { x: 5, y: 0, cmd: "stitch" },
          { x: 10, y: 0, cmd: "stitch" },
          { x: 10, y: 0, cmd: "end" },
        ],
      },
    ]);
    const s = blocks[0]!.stitches;
    expect(s.filter((x) => x.tie).length).toBe(6);
    expect(s[1]!.tie).toBe(true);
    expect(s[s.length - 1]!.cmd).toBe("end");
    // Three stitches of 0.3 mm forwards and back
    expect(dist(s[0]!, s[1]!)).toBeCloseTo(TIE_LENGTH_MM, 9);
  });

  it("locks again after a colour change", () => {
    const blocks = tieBlocks([
      {
        objectId: "a",
        threadIndex: 0,
        stitches: [
          { x: 0, y: 0, cmd: "stitch" },
          { x: 5, y: 0, cmd: "stitch" },
          { x: 5, y: 0, cmd: "trim" },
          { x: 5, y: 0, cmd: "color" },
        ],
      },
      {
        objectId: "b",
        threadIndex: 1,
        stitches: [
          { x: 20, y: 0, cmd: "jump" },
          { x: 25, y: 0, cmd: "stitch" },
          { x: 25, y: 0, cmd: "end" },
        ],
      },
    ]);
    expect(blocks[1]!.stitches[1]!.tie).toBe(true);
  });

  it("moves the trim to where the needle actually is", () => {
    const blocks = tieBlocks([
      {
        objectId: "a",
        threadIndex: 0,
        stitches: [
          { x: 0, y: 0, cmd: "stitch" },
          { x: 10, y: 0, cmd: "stitch" },
          { x: 10, y: 0, cmd: "trim" },
          { x: 10, y: 0, cmd: "color" },
        ],
      },
    ]);
    const s = blocks[0]!.stitches;
    const trim = s.find((x) => x.cmd === "trim")!;
    const color = s.find((x) => x.cmd === "color")!;
    expect(trim.x).toBeCloseTo(10 - TIE_LENGTH_MM, 9);
    expect(color.x).toBeCloseTo(trim.x, 9);
  });

  it("leaves the input untouched", () => {
    const input: StitchBlock[] = [
      {
        objectId: "a",
        threadIndex: 0,
        stitches: [
          { x: 0, y: 0, cmd: "stitch" },
          { x: 5, y: 0, cmd: "stitch" },
        ],
      },
    ];
    tieBlocks(input);
    expect(input[0]!.stitches).toHaveLength(2);
  });
});

describe("post-processing (spec §11)", () => {
  it("removes tiny stitches but keeps the lock", () => {
    const out = postProcess([
      {
        objectId: "a",
        threadIndex: 0,
        stitches: [
          { x: 0, y: 0, cmd: "stitch" },
          { x: 0.1, y: 0, cmd: "stitch" },
          { x: 0.2, y: 0, cmd: "stitch", tie: true },
          { x: 5, y: 0, cmd: "stitch" },
        ],
      },
    ]);
    expect(out[0]!.stitches.map((s) => s.x)).toEqual([0, 0.2, 5]);
  });

  it("splits stitches and jumps that are too long", () => {
    const out = postProcess([
      {
        objectId: "a",
        threadIndex: 0,
        stitches: [
          { x: 0, y: 0, cmd: "stitch" },
          { x: 50, y: 0, cmd: "jump" },
        ],
      },
    ]);
    const s = out[0]!.stitches;
    for (let i = 1; i < s.length; i++) {
      expect(Math.abs(s[i]!.x - s[i - 1]!.x)).toBeLessThanOrEqual(MAX_STITCH_MM + 1e-9);
    }
    expect(s[s.length - 1]!.cmd).toBe("jump");
  });

  it("carries the needle position across block boundaries", () => {
    const out = postProcess([
      { objectId: "a", threadIndex: 0, stitches: [{ x: 0, y: 0, cmd: "stitch" }] },
      {
        objectId: "b",
        threadIndex: 0,
        stitches: [
          { x: 0.1, y: 0, cmd: "stitch" },
          { x: 5, y: 0, cmd: "stitch" },
        ],
      },
    ]);
    expect(out[1]!.stitches.map((s) => s.x)).toEqual([5]);
  });

  it("drops blocks that end up empty", () => {
    const out = postProcess([
      { objectId: "a", threadIndex: 0, stitches: [{ x: 0, y: 0, cmd: "stitch" }] },
      { objectId: "b", threadIndex: 0, stitches: [{ x: 0.01, y: 0, cmd: "stitch" }] },
    ]);
    expect(out).toHaveLength(1);
  });

  it("keeps the minimum stitch at 0,6 mm and lets it be configured (spec §11)", () => {
    expect(MIN_STITCH_MM).toBe(0.6);
    const short = (dx: number, tie?: true) => [
      { x: 0, y: 0, cmd: "stitch" as const },
      tie ? { x: dx, y: 0, cmd: "stitch" as const, tie } : { x: dx, y: 0, cmd: "stitch" as const },
    ];
    const dropped = postProcess([{ objectId: "a", threadIndex: 0, stitches: short(0.4) }]);
    expect(dropped[0]!.stitches).toHaveLength(1);
    // Above the limit it stays.
    const kept = postProcess([{ objectId: "a", threadIndex: 0, stitches: short(0.7) }]);
    expect(kept[0]!.stitches).toHaveLength(2);
    // A lock stitch is short by definition and exempt.
    const tied = postProcess([{ objectId: "a", threadIndex: 0, stitches: short(0.3, true) }]);
    expect(tied[0]!.stitches).toHaveLength(2);
    // Configurable.
    const loose = postProcess(
      [{ objectId: "a", threadIndex: 0, stitches: short(0.4) }],
      MAX_STITCH_MM,
      0.2,
    );
    expect(loose[0]!.stitches).toHaveLength(2);
  });

  it("honours a custom limit", () => {
    const out = postProcess(
      [
        {
          objectId: "a",
          threadIndex: 0,
          stitches: [
            { x: 0, y: 0, cmd: "stitch" },
            { x: 4, y: 0, cmd: "stitch" },
          ],
        },
      ],
      2,
      MIN_STITCH_MM,
    );
    expect(out[0]!.stitches).toHaveLength(3);
  });
});
