/**
 * Stitch lists for the thread-cut rule (spec §10.2.1): what the DST reader gives back from a probe run
 * of Ink/Stitch, built by hand — runs of stitches, dense areas, and the moves between them.
 *
 * Positions are in mm. Nothing here is a customer motif (CLAUDE.md, "Testdaten").
 */
import type { Point } from "@texma-stitch/geometry";
import type { Stitch } from "../../src/types.js";

export const at = (x: number, y: number): Point => ({ x, y });

const stitch = (p: Point): Stitch => ({ x: p.x, y: p.y, cmd: "stitch" });

/** A straight run of stitches from `a` to `b`, about 1 mm apart. */
export function run(a: Point, b: Point): Stitch[] {
  const n = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.y - a.y)));
  return Array.from({ length: n + 1 }, (_, i) =>
    stitch({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n }),
  );
}

/**
 * Dense rows over `[x, x + w] × [y, y + h]`, back and forth, `step` apart: what a satin column or an
 * area leaves on the fabric. It starts at `(x, y)`; with an odd number of rows it ends on the far side.
 */
export function dense(x: number, y: number, w: number, h: number, step = 0.4): Stitch[] {
  const rows = Math.max(1, Math.round(h / step));
  const out: Stitch[] = [];
  for (let r = 0; r <= rows; r++) {
    const yy = y + (h * r) / rows;
    const [from, to] = r % 2 === 0 ? [x, x + w] : [x + w, x];
    out.push(stitch({ x: from, y: yy }), stitch({ x: to, y: yy }));
  }
  return out;
}

/**
 * The move between two runs as the DST reader gives it: a trim where the thread is cut (at the last
 * stitch), then the jump to where the next run starts.
 */
export function hop(from: Point, to: Point, trim: boolean): Stitch[] {
  return [
    ...(trim ? [{ x: from.x, y: from.y, cmd: "trim" as const }] : []),
    { ...to, cmd: "jump" },
  ];
}

/** A colour change at `p`, and the end of the file. */
export const change = (p: Point): Stitch => ({ x: p.x, y: p.y, cmd: "color" });
export const finish = (p: Point): Stitch => ({ x: p.x, y: p.y, cmd: "end" });

export const first = (s: Stitch[]): Point => ({ x: s[0]!.x, y: s[0]!.y });
export const last = (s: Stitch[]): Point => ({ x: s[s.length - 1]!.x, y: s[s.length - 1]!.y });

/**
 * Two runs of one colour joined by a trim: `a` ends at (2, 0), `b` starts `gapMm` further on — a
 * connection of exactly that length, lying on bare fabric. `before` is stitched ahead of `a`, `after`
 * behind `b`; both are given as lists of stitches that already carry their own moves.
 */
export function pair(
  gapMm: number,
  opts: { before?: Stitch[]; after?: Stitch[]; trim?: boolean } = {},
): { stitches: Stitch[]; from: Point; to: Point } {
  const a = run(at(0, 0), at(2, 0));
  const b = run(at(2 + gapMm, 0), at(4 + gapMm, 0));
  const stitches = [
    ...(opts.before ?? []),
    ...a,
    ...hop(last(a), first(b), opts.trim ?? true),
    ...b,
    ...(opts.after ?? []),
  ];
  return { stitches, from: last(a), to: first(b) };
}
