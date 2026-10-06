import { describe, expect, it } from "vitest";
import { CONNECT_DEFAULTS } from "../connect.js";
import type { Stitch } from "../types.js";
import {
  at,
  change,
  dense,
  finish,
  first,
  hop,
  last,
  pair,
  run,
} from "../../test/fixtures/trims.js";
import {
  blockColoursOf,
  threadMoves,
  HIDDEN_JUMP_MAX_MM,
  HIDDEN_STITCH_MAX_MM,
  PLAIN_STITCH_MM,
  planTrims,
  PROBE_MIN_MM,
  THREAD_REACH_MM,
  trimAfterIds,
  VISIBLE_MAX_MM,
  withMinJumpLength,
  withoutTrimAfter,
} from "./trims.js";

/** One run laid straight along the line a connection takes: whatever it covers of that line is hidden. */
const along = (x0: number, x1: number, y = 0): Stitch[] => run(at(x0, y), at(x1, y));

describe("the constants of the rule (spec §10.2.1)", () => {
  it("takes the limits from Ink/Stitch and from §10.2", () => {
    // Ink/Stitch stitches straight on up to its collapse length (3 mm) and writes a jump from there.
    expect(PLAIN_STITCH_MM).toBe(3);
    // The longest jump left without a cut is the one §10.2 and `untrimmedJumps` already allow.
    expect(HIDDEN_JUMP_MAX_MM).toBe(CONNECT_DEFAULTS.jumpTrimMm);
    expect(HIDDEN_JUMP_MAX_MM).toBe(5);
    // A hidden connection longer than that is stitched straight, up to the longest stitch §7.4 allows.
    expect(HIDDEN_STITCH_MAX_MM).toBe(7);
    // What Ink/Stitch's auto_satin leaves outside both columns before it cuts.
    expect(VISIBLE_MAX_MM).toBe(1);
    // A move shorter than that cannot lie more than that on bare fabric: the probe needs none of them.
    expect(PROBE_MIN_MM).toBe(VISIBLE_MAX_MM);
    expect(THREAD_REACH_MM).toBeGreaterThan(0.1);
    expect(THREAD_REACH_MM).toBeLessThan(0.5);
  });
});

describe("threadMoves (how much of a move lies on the bare fabric)", () => {
  it("lists every move between two runs of stitches, with its ends, its length and its cut", () => {
    const a = run(at(0, 0), at(2, 0));
    const b = run(at(6, 0), at(8, 0));
    const c = run(at(9, 3), at(11, 3));
    const list = threadMoves([
      ...a,
      ...hop(last(a), first(b), true),
      ...b,
      ...hop(last(b), first(c), false),
      ...c,
    ]);
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ from: { x: 2, y: 0 }, to: { x: 6, y: 0 }, trimmed: true });
    expect(list[0]!.lengthMm).toBeCloseTo(4, 9);
    expect(list[1]).toMatchObject({ from: { x: 8, y: 0 }, to: { x: 9, y: 3 }, trimmed: false });
    expect(list[1]!.lengthMm).toBeCloseTo(Math.hypot(1, 3), 9);
  });

  it("says where in the list the move starts, so a trim can be matched to its move", () => {
    const { stitches } = pair(4);
    const [c] = threadMoves(stitches);
    expect(stitches[c!.at]!.cmd).toBe("trim");
    expect(stitches[c!.at - 1]!.cmd).toBe("stitch");
  });

  it("counts the colour changes before it as its block", () => {
    const a = run(at(0, 0), at(2, 0));
    const b = run(at(6, 0), at(8, 0));
    const c = run(at(20, 0), at(22, 0));
    const d = run(at(26, 0), at(28, 0));
    const list = threadMoves([
      ...a,
      ...hop(last(a), first(b), true),
      ...b,
      change(last(b)),
      ...c,
      ...hop(last(c), first(d), true),
      ...d,
    ]);
    expect(list.map((x) => x.block)).toEqual([0, 1]);
  });

  it("finds a move on bare fabric visible, less the thread's reach at both ends", () => {
    // A ends at the start of the move and B starts at its end: each covers THREAD_REACH_MM of it.
    const [c] = threadMoves(pair(4).stitches);
    expect(c!.visibleMm).toBeCloseTo(4 - 2 * THREAD_REACH_MM, 6);
  });

  it("finds nothing visible where a later area lies over the whole move, whatever its colour", () => {
    const { stitches, from, to } = pair(4);
    const area = dense(from.x - 0.5, -1, 5, 2);
    const [c] = threadMoves([...stitches, change(last(stitches)), ...area]);
    expect(c!.from).toEqual(from);
    expect(c!.to).toEqual(to);
    expect(c!.visibleMm).toBeCloseTo(0, 6);
  });

  it("measures the part a later area leaves open", () => {
    // The move runs from x = 2 to x = 8; a run laid along it covers from 3 to 6 plus the reach on each side.
    // The run is 3 mm long and covers its reach on both sides; A and B cover their reach at the two ends.
    const { stitches } = pair(6);
    const [c] = threadMoves([...stitches, change(last(stitches)), ...along(3, 6)]);
    expect(c!.visibleMm).toBeCloseTo(6 - (3 + 2 * THREAD_REACH_MM) - 2 * THREAD_REACH_MM, 6);
  });

  it("does not count stitches that came before and are of another colour", () => {
    // An area under the move in thread of another colour: the thread lies on it, in plain sight.
    const under = dense(1.5, -1, 5, 2);
    const { stitches } = pair(4, {
      before: [...under, change(last(under))],
    });
    const list = threadMoves(stitches);
    expect(list).toHaveLength(1);
    expect(list[0]!.visibleMm).toBeCloseTo(4 - 2 * THREAD_REACH_MM, 6);
  });

  it("does count stitches that came before in the same colour: thread on thread is not seen", () => {
    const under = dense(1.5, -1, 5, 2);
    const a = run(at(0, 0), at(2, 0));
    const b = run(at(6, 0), at(8, 0));
    const list = threadMoves([
      ...under,
      ...hop(last(under), first(a), false),
      ...a,
      ...hop(last(a), first(b), true),
      ...b,
    ]);
    // Two moves: into A (no cut), and from A to B (the one the trim is on).
    expect(list.map((x) => x.trimmed)).toEqual([false, true]);
    expect(list[1]!.visibleMm).toBeCloseTo(0, 6);
  });

  it("takes the same colour from an earlier block only where the colours are said to be the same", () => {
    const under = dense(1.5, -1, 5, 2);
    const mid = run(at(30, 30), at(32, 30));
    const { stitches } = pair(4, {
      before: [...under, change(last(under)), ...mid, change(last(mid))],
    });
    // Blocks: under (0), mid (1), the pair (2).
    const same = threadMoves(stitches, { blockColours: ["#aa0000", "#00aa00", "#AA0000"] });
    const other = threadMoves(stitches, { blockColours: ["#aa0000", "#00aa00", "#0000aa"] });
    const unknown = threadMoves(stitches);
    expect(same[0]!.visibleMm).toBeCloseTo(0, 6);
    expect(other[0]!.visibleMm).toBeCloseTo(4 - 2 * THREAD_REACH_MM, 6);
    // Without colours only the block itself is known to be of its own colour.
    expect(unknown[0]!.visibleMm).toBeCloseTo(4 - 2 * THREAD_REACH_MM, 6);
  });

  it("covers what lies within the reach of a stitch and nothing further out", () => {
    const { stitches } = pair(6);
    const near = threadMoves([
      ...stitches,
      change(last(stitches)),
      ...along(3, 7, THREAD_REACH_MM - 0.02),
    ]);
    const far = threadMoves([
      ...stitches,
      change(last(stitches)),
      ...along(3, 7, THREAD_REACH_MM + 0.02),
    ]);
    expect(near[0]!.visibleMm).toBeLessThan(far[0]!.visibleMm - 1);
  });

  it("is not a connection when a colour change or the end of the file follows the trim", () => {
    const a = run(at(0, 0), at(2, 0));
    const b = run(at(6, 0), at(8, 0));
    const list = threadMoves([
      ...a,
      ...hop(last(a), first(b), true),
      ...b,
      { x: 8, y: 0, cmd: "trim" },
      change(at(8, 0)),
      ...run(at(20, 0), at(22, 0)),
      { x: 22, y: 0, cmd: "trim" },
      finish(at(22, 0)),
    ]);
    expect(list).toHaveLength(1);
  });

  it("leaves out the way in from the machine's origin", () => {
    const a = run(at(5, 5), at(7, 5));
    expect(threadMoves([{ x: 0, y: 0, cmd: "jump" }, { ...first(a), cmd: "jump" }, ...a])).toEqual(
      [],
    );
  });
});

describe("planTrims (spec §10.2.1)", () => {
  const ids = (n: number): { id: string }[] =>
    Array.from({ length: n }, (_, i) => ({ id: `e${i}` }));

  it("leaves a connection of up to 3 mm that lies hidden to Ink/Stitch's own stitch: no cut", () => {
    const { stitches, from } = pair(PLAIN_STITCH_MM);
    const area = dense(from.x - 0.5, -1, PLAIN_STITCH_MM + 1, 2);
    const plan = planTrims([...stitches, change(last(stitches)), ...area], ids(1));
    expect(plan.decisions[0]).toMatchObject({ id: "e0", cut: false, reason: "short" });
    expect(plan.decisions[0]!.visibleMm).toBeLessThan(VISIBLE_MAX_MM);
    expect(plan.cut).toEqual([]);
  });

  it("cuts a connection of up to 3 mm that lies on bare fabric: a stitch across it is a thread in plain sight", () => {
    const plan = planTrims(pair(PLAIN_STITCH_MM).stitches, ids(1));
    expect(plan.decisions[0]).toMatchObject({ id: "e0", cut: true, reason: "visible" });
    expect(plan.cut).toEqual(["e0"]);
    // Up to 1 mm of it on bare fabric is no thread worth a cut: a gap of 1.5 mm is 0.9 mm bare, less the
    // reach of the thread at both ends.
    const near = planTrims(pair(1.5).stitches, ids(1));
    expect(near.decisions[0]!.visibleMm).toBeLessThanOrEqual(VISIBLE_MAX_MM);
    expect(near.decisions[0]).toMatchObject({ cut: false, reason: "short" });
    // A gap of 2 mm is 1.4 mm bare.
    expect(planTrims(pair(2).stitches, ids(1)).decisions[0]).toMatchObject({
      cut: true,
      reason: "visible",
    });
  });

  it("cuts a connection over bare fabric from 3 mm on", () => {
    const plan = planTrims(pair(PLAIN_STITCH_MM + 0.5).stitches, ids(1));
    expect(plan.decisions[0]).toMatchObject({ cut: true, reason: "visible" });
    expect(plan.cut).toEqual(["e0"]);
  });

  it("stitches a hidden connection of 3 to 5 mm across: no cut, and no jump with its lock stitches", () => {
    // Until 06.10.2026 it stayed a jump; every one set two starts and stops into the file.
    const { stitches, from } = pair(4);
    const area = dense(from.x - 0.5, -1, 5, 2);
    const plan = planTrims([...stitches, change(last(stitches)), ...area], ids(1));
    expect(plan.decisions[0]).toMatchObject({ cut: false, reason: "stitched" });
    expect(plan.decisions[0]!.visibleMm).toBeLessThan(VISIBLE_MAX_MM);
    expect(plan.cut).toEqual([]);
    expect(plan.stitched).toEqual([{ id: "e0", lengthMm: 4 }]);
  });

  it("leaves a hidden connection of 3 to 5 mm a jump with stitchHiddenJumps false, the rule before", () => {
    const { stitches, from } = pair(4);
    const area = dense(from.x - 0.5, -1, 5, 2);
    const plan = planTrims([...stitches, change(last(stitches)), ...area], ids(1), {
      stitchHiddenJumps: false,
    });
    expect(plan.decisions[0]).toMatchObject({ cut: false, reason: "hidden" });
    expect(plan.stitched).toEqual([]);
  });

  it("does not cut a connection that lies inside the area of the same colour already stitched", () => {
    const under = dense(1.5, -1, 5, 2);
    const a = run(at(0, 0), at(2, 0));
    const b = run(at(6, 0), at(8, 0));
    const plan = planTrims(
      [...under, ...hop(last(under), first(a), false), ...a, ...hop(last(a), first(b), true), ...b],
      ids(1),
    );
    expect(plan.decisions[0]).toMatchObject({ cut: false, reason: "stitched" });
  });

  it("stitches a hidden connection of 5 to 7 mm straight through instead of leaving a jump", () => {
    // No long jump stays open (untrimmedJumps), and no cut either: Ink/Stitch is told to stitch across.
    const { stitches, from } = pair(HIDDEN_JUMP_MAX_MM + 1);
    const area = dense(from.x - 0.5, -1, 7, 2);
    const plan = planTrims([...stitches, change(last(stitches)), ...area], ids(1));
    expect(plan.decisions[0]!.visibleMm).toBeLessThan(VISIBLE_MAX_MM);
    expect(plan.decisions[0]).toMatchObject({ cut: false, reason: "stitched" });
    expect(plan.cut).toEqual([]);
    expect(plan.stitched).toEqual([{ id: "e0", lengthMm: 6 }]);
  });

  it("stitches up to 7 mm and cuts a hidden connection longer than that", () => {
    const hidden = (gap: number) => {
      const { stitches, from } = pair(gap);
      const area = dense(from.x - 0.5, -1, gap + 1, 2);
      return planTrims([...stitches, change(last(stitches)), ...area], ids(1));
    };
    expect(hidden(HIDDEN_STITCH_MAX_MM).decisions[0]).toMatchObject({
      cut: false,
      reason: "stitched",
    });
    const long = hidden(HIDDEN_STITCH_MAX_MM + 0.5);
    expect(long.decisions[0]!.visibleMm).toBeLessThan(VISIBLE_MAX_MM);
    expect(long.decisions[0]).toMatchObject({ cut: true, reason: "long" });
    expect(long.stitched).toEqual([]);
  });

  it("cuts a connection over 5 mm that is not hidden, whatever its length", () => {
    expect(planTrims(pair(6).stitches, ids(1)).decisions[0]).toMatchObject({
      cut: true,
      reason: "long",
    });
  });

  it("leaves a hidden connection of exactly 5 mm a jump where jumps stay: the limit is an inclusive one", () => {
    const { stitches, from } = pair(HIDDEN_JUMP_MAX_MM);
    const area = dense(from.x - 0.5, -1, 6, 2);
    const list = [...stitches, change(last(stitches)), ...area];
    expect(planTrims(list, ids(1), { stitchHiddenJumps: false }).decisions[0]).toMatchObject({
      cut: false,
      reason: "hidden",
    });
    expect(planTrims(list, ids(1)).decisions[0]).toMatchObject({ cut: false, reason: "stitched" });
  });

  it("allows a thread of up to 1 mm on the bare fabric, and no more", () => {
    // The move runs from x = 2 to x = 6 (4 mm); a run along it, stitched later, leaves `open` of it bare.
    const tail = (open: number): Stitch[] => along(2 - 1, 6 - open - THREAD_REACH_MM);
    const hidden = (open: number) => {
      const { stitches } = pair(4);
      return planTrims([...stitches, change(last(stitches)), ...tail(open)], ids(1)).decisions[0]!;
    };
    // Bare: the part of the move from the end of the cover to Q, less the reach at Q itself (B covers that).
    const small = hidden(VISIBLE_MAX_MM - 0.1 + THREAD_REACH_MM);
    const large = hidden(VISIBLE_MAX_MM + 0.1 + THREAD_REACH_MM);
    expect(small).toMatchObject({ cut: false, reason: "stitched" });
    expect(large).toMatchObject({ cut: true, reason: "visible" });
    expect(large.visibleMm - small.visibleMm).toBeCloseTo(0.2, 6);
  });

  it("keeps a trim the source asked for, whatever the move looks like", () => {
    const { stitches, from } = pair(4);
    const area = dense(from.x - 0.5, -1, 5, 2);
    const plan = planTrims(
      [...stitches, change(last(stitches)), ...area],
      [{ id: "e0", forced: true }],
    );
    expect(plan.decisions[0]).toMatchObject({ id: "e0", cut: true, reason: "forced" });
    expect(plan.cut).toEqual(["e0"]);
  });

  it("keeps a trim that comes right before a colour change: there is no move to judge", () => {
    const a = run(at(0, 0), at(2, 0));
    const stitches: Stitch[] = [
      ...a,
      { x: 2, y: 0, cmd: "trim" },
      change(at(2, 0)),
      ...run(at(10, 0), at(12, 0)),
    ];
    const plan = planTrims(stitches, [{ id: "last" }]);
    expect(plan.decisions[0]).toMatchObject({ id: "last", cut: true, reason: "forced" });
  });

  it("matches the trims to the elements in order, one decision for each", () => {
    // 1: bare and 4 mm (cut) · 2: under a later area (stitched across) · 3: 2 mm under it (short) · 4: 8 mm (cut)
    const a1 = run(at(0, 0), at(2, 0));
    const b1 = run(at(6, 0), at(8, 0));
    const b2 = run(at(12, 0), at(14, 0));
    const b3 = run(at(16, 0), at(18, 0));
    const b4 = run(at(26, 0), at(28, 0));
    const stitches: Stitch[] = [
      ...a1,
      ...hop(last(a1), first(b1), true),
      ...b1,
      ...hop(last(b1), first(b2), true),
      ...b2,
      ...hop(last(b2), first(b3), true),
      ...b3,
      ...hop(last(b3), first(b4), true),
      ...b4,
      change(last(b4)),
      ...dense(7.5, -1, 9, 2),
    ];
    const plan = planTrims(stitches, [{ id: "p" }, { id: "q" }, { id: "r" }, { id: "s" }]);
    expect(plan.decisions.map((d) => [d.id, d.cut, d.reason])).toEqual([
      ["p", true, "visible"],
      ["q", false, "stitched"],
      ["r", false, "short"],
      ["s", true, "long"],
    ]);
    expect(plan.cut).toEqual(["p", "s"]);
    expect(plan.stitched.map((x) => x.id)).toEqual(["q"]);
  });

  it("refuses a probe whose trims do not match the elements one for one", () => {
    const { stitches } = pair(4);
    expect(() => planTrims(stitches, [])).toThrow(/1 Trim.*0 Objekt/);
    expect(() => planTrims(stitches, [{ id: "a" }, { id: "b" }])).toThrow(/1 Trim.*2 Objekt/);
  });

  it("gives the same plan for the same stitches, however often it is asked", () => {
    const { stitches, from } = pair(4);
    const list = [...stitches, change(last(stitches)), ...dense(from.x - 0.5, -1, 5, 2)];
    expect(planTrims(list, ids(1))).toEqual(planTrims(list, ids(1)));
  });

  it("takes the limits it is given", () => {
    const { stitches } = pair(4);
    const plan = planTrims(stitches, ids(1), { visibleMm: 5 });
    expect(plan.decisions[0]).toMatchObject({ cut: false, reason: "stitched" });
    // A hidden connection of 2 mm is a stitch straight on; with no stitch straight on allowed it is
    // stitched across all the same, and a jump only where jumps stay.
    const { stitches: two, from } = pair(2);
    const covered = [...two, change(last(two)), ...dense(from.x - 0.5, -1, 3, 2)];
    expect(planTrims(covered, ids(1)).decisions[0]).toMatchObject({ cut: false, reason: "short" });
    expect(planTrims(covered, ids(1), { plainMm: 0 }).decisions[0]).toMatchObject({
      cut: false,
      reason: "stitched",
    });
    expect(
      planTrims(covered, ids(1), { plainMm: 0, stitchHiddenJumps: false }).decisions[0],
    ).toMatchObject({ cut: false, reason: "hidden" });
  });

  it("takes the longest stitch it is given", () => {
    const { stitches, from } = pair(6);
    const list = [...stitches, change(last(stitches)), ...dense(from.x - 0.5, -1, 7, 2)];
    expect(planTrims(list, ids(1), { stitchMm: 5 }).decisions[0]).toMatchObject({
      cut: true,
      reason: "long",
    });
  });

  it("reports the move it judged, for the output of the run", () => {
    const { stitches } = pair(4);
    const [d] = planTrims(stitches, ids(1)).decisions;
    expect(d!.lengthMm).toBeCloseTo(4, 9);
    expect(d!.from).toEqual({ x: 2, y: 0 });
    expect(d!.to).toEqual({ x: 6, y: 0 });
  });
});

describe("blockColoursOf (the colour of every block of the DST)", () => {
  it("makes one block of a run of one colour, whatever the spelling", () => {
    expect(blockColoursOf(["#D2060D", "#d2060d", "#ffffff", "#fff", "#101010", "#D2060D"])).toEqual(
      ["#D2060D", "#ffffff", "#101010", "#D2060D"],
    );
  });

  it("has no block for no object", () => {
    expect(blockColoursOf([])).toEqual([]);
  });
});

describe("trimAfterIds and withoutTrimAfter (the SVG side of the rule)", () => {
  const NS = 'xmlns="http://www.w3.org/2000/svg" xmlns:inkstitch="http://inkstitch.org/namespace"';
  const doc = (body: string): string => `<svg ${NS}>${body}</svg>`;

  it("lists the elements that carry a trim after them, in document order", () => {
    const svg = doc(
      '<path id="a" inkstitch:trim_after="True"/><g id="g"><path id="b"/>' +
        '<path id="c" inkstitch:trim_after="true"/></g><path id="d" inkstitch:trim_after="False"/>',
    );
    expect(trimAfterIds(svg)).toEqual(["a", "c"]);
  });

  it("knows the attribute by its namespace, not by the prefix a writer chose", () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:ns9="http://inkstitch.org/namespace">' +
      '<path id="a" ns9:trim_after="True"/><path id="b" inkstitch:trim_after="True"/></svg>';
    expect(trimAfterIds(svg)).toEqual(["a"]);
  });

  it("takes the trim off the named elements and off no other", () => {
    const svg = doc(
      '<path id="a" inkstitch:trim_after="True"/><path id="b" d="M1 1" inkstitch:trim_after="True"/>' +
        '<path id="c" inkstitch:trim_after="True"/>',
    );
    const out = withoutTrimAfter(svg, ["a", "c"]);
    expect(trimAfterIds(out)).toEqual(["b"]);
    expect(out).toContain('<path id="b" d="M1 1" inkstitch:trim_after="True"/>');
  });

  it("changes nothing else about the document, and gives the same text back without ids", () => {
    const body =
      '<defs><symbol id="s"/></defs><path id="a" d="M0 0 L1 1" style="fill:#f00" inkstitch:trim_after="True"/>';
    expect(withoutTrimAfter(doc(body), [])).toBe(doc(body));
    expect(withoutTrimAfter(doc(body), ["a"])).toBe(
      doc('<defs><symbol id="s"/></defs><path id="a" d="M0 0 L1 1" style="fill:#f00"/>'),
    );
  });

  it("refuses an id the document does not have, or one without a cut: no quiet no-op", () => {
    const svg = doc('<path id="a" inkstitch:trim_after="True"/><path id="b"/>');
    expect(() => withoutTrimAfter(svg, ["nope"])).toThrow(/nope/);
    expect(() => withoutTrimAfter(svg, ["b"])).toThrow(/b/);
  });
});

describe("withMinJumpLength (the stitch across a hidden connection)", () => {
  const NS = 'xmlns="http://www.w3.org/2000/svg" xmlns:inkstitch="http://inkstitch.org/namespace"';
  const doc = (body: string): string => `<svg ${NS}>${body}</svg>`;

  it("sets the length from which Ink/Stitch writes a jump on the named elements, a mm above the move", () => {
    const out = withMinJumpLength(doc('<path id="a"/><path id="b"/>'), [
      { id: "b", lengthMm: 6.2 },
    ]);
    // 6.2 mm and a margin of 1 mm, rounded up to a tenth: Ink/Stitch's own distance differs from the probe's by the locks.
    expect(out).toContain('<path id="b" inkstitch:min_jump_stitch_length_mm="7.2"/>');
    expect(out).toContain('<path id="a"/>');
  });

  it("replaces a length that is there, and leaves the document alone without any", () => {
    const svg = doc('<path id="a" inkstitch:min_jump_stitch_length_mm="3"/>');
    expect(withMinJumpLength(svg, [{ id: "a", lengthMm: 6 }])).toContain(
      'inkstitch:min_jump_stitch_length_mm="7"',
    );
    expect(withMinJumpLength(svg, [])).toBe(svg);
  });

  it("refuses an id the document does not have", () => {
    expect(() => withMinJumpLength(doc('<path id="a"/>'), [{ id: "nope", lengthMm: 6 }])).toThrow(
      /nope/,
    );
  });
});
