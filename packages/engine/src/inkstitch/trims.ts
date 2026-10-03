/**
 * Which thread cuts the Ink/Stitch template keeps (spec §10.2.1): a cut between two objects of one
 * colour is only set where the thread would otherwise lie on the fabric.
 *
 * Ink/Stitch writes no cut of its own. What cuts in the pipeline is `auto_satin --trim` (every jump
 * of a satin run whose part outside both columns is over 1 mm, and the end of every run, whatever
 * follows) and `jump_to_trim`. The rule here replaces both: the run is routed without `--trim`, a
 * probe run of `jump_to_trim` puts a cut after every object that is followed by a move of
 * `PROBE_MIN_MM` or more, the DST of that probe says where each move runs (`threadMoves`), and
 * `planTrims` decides which of the cuts stay. The ones that do not stay are taken out of the probe
 * document again (`withoutTrimAfter`), and what is left is the final one.
 *
 * The rule, per move between the end of one object and the start of the next: the thread is **hidden**
 * when at most `VISIBLE_MAX_MM` (1 mm) of the line from the end to the start lies on bare fabric: the
 * rest runs under stitches that come later (of any colour) or over stitches of its own colour that are
 * there already. A move that is not hidden is cut, however short it is: a thread across bare fabric is
 * in plain sight. A hidden move is left without a cut, as
 *
 * - a stitch straight on, up to `PLAIN_STITCH_MM` (3 mm, Ink/Stitch's collapse length): no jump, no
 *   lock stitches;
 * - a jump with its lock stitches, up to `HIDDEN_JUMP_MAX_MM` (5 mm, `CONNECT_DEFAULTS.jumpTrimMm`);
 * - a stitch straight across, up to `HIDDEN_STITCH_MAX_MM` (7 mm): no jump (`withMinJumpLength`), so
 *   that no long jump stays open (`untrimmedJumps`);
 * - longer than that it is cut all the same.
 *
 * Everything is measured on the stitches Ink/Stitch wrote, not on the template: where a fill ends
 * and where the next object begins is only known there (`inkstitch/README.md`).
 *
 * What this module knows of Ink/Stitch's behaviour (`jump_to_trim`, `auto_satin`'s cuts, the collapse
 * length, `inkstitch:min_jump_stitch_length_mm`) was read in its source (GPL-3.0), not copied: the
 * rule and the code are our own.
 */
import type { Point } from "@texma-stitch/geometry";
import { CONNECT_DEFAULTS } from "../connect.js";
import type { Stitch } from "../types.js";
import { colourKey } from "./sequence.js";
import type { XmlElement } from "./xml.js";
import {
  childElements,
  ensureNamespace,
  getAttr,
  getNsAttr,
  parseXml,
  removeNsAttr,
  serializeXml,
  setNsAttr,
  XML_NS,
} from "./xml.js";

/**
 * Up to this length Ink/Stitch's own stitch plan stitches straight from one object to the next
 * (`collapse_len_mm`, 3 mm unless the document says otherwise — the template does not): no jump, no
 * lock stitches. The probe cuts from here on, because from here on Ink/Stitch writes a jump.
 */
export const PLAIN_STITCH_MM = 3;

/** The longest jump left without a cut: the limit of §10.2 and of `untrimmedJumps`. */
export const HIDDEN_JUMP_MAX_MM = CONNECT_DEFAULTS.jumpTrimMm;

/**
 * The longest hidden connection that is stitched straight across instead of cut: one stitch, as long
 * as the longest stitch spec §7.4 lets a satin have. Longer than `HIDDEN_JUMP_MAX_MM` a jump may not
 * stay open, so what is hidden and up to this long becomes a stitch.
 */
export const HIDDEN_STITCH_MAX_MM = 7;

/**
 * How much of a move may lie on the bare fabric and still count as hidden. It is what Ink/Stitch's
 * `auto_satin` leaves outside the two columns before it cuts (`JumpStitch.should_trim`, 1 mm).
 */
export const VISIBLE_MAX_MM = 1;

/**
 * The probe cuts after every object that a move of at least this length follows. Below
 * `VISIBLE_MAX_MM` a move cannot lie more than that on bare fabric, so there is nothing to decide.
 * (Up to `PLAIN_STITCH_MM` Ink/Stitch would stitch straight on, with no cut at all; the probe cuts there
 * as well, to see where the move runs.)
 */
export const PROBE_MIN_MM = VISIBLE_MAX_MM;

/**
 * How far from the line of a stitch a thread still counts as covered by it: a stitch is a strip this
 * wide on either side. A satin column or an area closes up into a surface (zigzag and rows are
 * 0.3 to 0.45 mm apart); a lone line of running stitches hides a strip of 0.6 mm.
 */
export const THREAD_REACH_MM = 0.3;

/** A move between two runs of stitches, as it lies in the list the DST reader gives. */
export type ThreadMove = {
  /** Where in the list the move starts: its first jump or trim record. */
  at: number;
  /** The stitch it ends in. */
  end: number;
  /** The last stitch before it, where the thread was fast. */
  from: Point;
  /** The first stitch after it, where the next run begins. */
  to: Point;
  lengthMm: number;
  /**
   * The part of the straight line from `from` to `to` that lies on bare fabric (or over thread of
   * another colour): not under a stitch that comes after it, not over a stitch of its own colour
   * that came before. mm.
   */
  visibleMm: number;
  /** The move carries a trim. */
  trimmed: boolean;
  /** The number of colour changes before it. */
  block: number;
};

export type ThreadMoveOptions = {
  /**
   * The colour of each colour block of the list, in order. Blocks of one colour hide each other's
   * thread; without it only the block itself is of its own colour.
   */
  blockColours?: string[];
  /** Default `THREAD_REACH_MM`. */
  reachMm?: number;
};

type Segment = { ax: number; ay: number; bx: number; by: number; index: number; block: number };

/** Edge of the cells the segments are sorted into, mm. The reach is far below it. */
const CELL_MM = 2;
const CELL_OFFSET = 4096;
const cellKey = (cx: number, cy: number): number => (cx + CELL_OFFSET) * 8192 + (cy + CELL_OFFSET);

/** A closed interval of positions along a move, mm from its start. */
type Span = [number, number];

/** The positions of `t` with `c0 + c1·t` in `[lo, hi]`; empty as `[1, 0]`. */
function slab(c0: number, c1: number, lo: number, hi: number): Span {
  if (Math.abs(c1) < 1e-12) return c0 >= lo && c0 <= hi ? [-Infinity, Infinity] : [1, 0];
  const a = (lo - c0) / c1;
  const b = (hi - c0) / c1;
  return a <= b ? [a, b] : [b, a];
}

/**
 * Where the line `p + t·(ux, uy)` is within `reach` of the segment: the segment is a convex capsule,
 * so its cut with a line is one interval — worked out as the union of the strip beside the stitch and
 * the two discs at its ends.
 */
function spansOf(
  px: number,
  py: number,
  ux: number,
  uy: number,
  seg: Segment,
  reach: number,
  out: Span[],
): void {
  for (const [cx, cy] of [
    [seg.ax, seg.ay],
    [seg.bx, seg.by],
  ] as const) {
    const dx = cx - px;
    const dy = cy - py;
    const along = dx * ux + dy * uy;
    const h2 = dx * dx + dy * dy - along * along;
    if (h2 <= reach * reach) {
      const w = Math.sqrt(reach * reach - Math.max(0, h2));
      out.push([along - w, along + w]);
    }
  }
  const sx = seg.bx - seg.ax;
  const sy = seg.by - seg.ay;
  const m = Math.hypot(sx, sy);
  if (m < 1e-9) return;
  const vx = sx / m;
  const vy = sy / m;
  // Along the stitch (s) and across it (n) of the point on the line at t, both linear in t.
  const s = slab((px - seg.ax) * vx + (py - seg.ay) * vy, ux * vx + uy * vy, 0, m);
  const n = slab(-(px - seg.ax) * vy + (py - seg.ay) * vx, -ux * vy + uy * vx, -reach, reach);
  const lo = Math.max(s[0], n[0]);
  const hi = Math.min(s[1], n[1]);
  if (lo <= hi) out.push([lo, hi]);
}

/** The length of the union of the spans, within `[0, length]`. */
function covered(spans: Span[], length: number): number {
  const inside = spans
    .map(([a, b]): Span => [Math.max(0, a), Math.min(length, b)])
    .filter(([a, b]) => a < b)
    .sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  let total = 0;
  let end = -Infinity;
  for (const [a, b] of inside) {
    if (b <= end) continue;
    total += b - Math.max(a, end);
    end = b;
  }
  return total;
}

/**
 * Every move between two runs of stitches in a list read back from a DST (spec §10.2.1): from the
 * last stitch to the first one after the jump records, with or without a trim in between. A trim
 * that a colour change or the end of the file follows leads nowhere and is no connection, nor is
 * the way in from the machine's origin.
 *
 * Each move is measured for how much of it lies on bare fabric (`ThreadMove.visibleMm`). Hidden is
 * what lies within `THREAD_REACH_MM` of a stitch that comes after the move, of any colour, or of an
 * earlier stitch of the move's own colour; thread on thread of the same colour is not seen, thread
 * on another colour is.
 */
export function threadMoves(stitches: Stitch[], opts: ThreadMoveOptions = {}): ThreadMove[] {
  const reach = opts.reachMm ?? THREAD_REACH_MM;
  const segs: Segment[] = [];
  type Move = { at: number; from: number; end: number; trimmed: boolean; block: number };
  const moves: Move[] = [];

  let block = 0;
  let lastStitch = -1;
  let open: { at: number; trimmed: boolean } | undefined;
  for (let i = 0; i < stitches.length; i++) {
    const s = stitches[i]!;
    if (s.cmd === "stitch") {
      if (open !== undefined && lastStitch >= 0) {
        moves.push({ at: open.at, from: lastStitch, end: i, trimmed: open.trimmed, block });
      } else if (lastStitch >= 0 && lastStitch === i - 1) {
        const p = stitches[lastStitch]!;
        segs.push({ ax: p.x, ay: p.y, bx: s.x, by: s.y, index: lastStitch, block });
      }
      open = undefined;
      lastStitch = i;
    } else if (s.cmd === "jump" || s.cmd === "trim") {
      if (open === undefined) open = { at: i, trimmed: false };
      if (s.cmd === "trim") open.trimmed = true;
    } else {
      // A colour change, a stop or the end: whatever was open leads nowhere.
      if (s.cmd !== "end") block++;
      open = undefined;
      lastStitch = -1;
    }
  }

  // The segments, sorted into cells: one registered in a cell is within reach of every point of it.
  const cells = new Map<number, number[]>();
  segs.forEach((seg, id) => {
    const x0 = Math.floor((Math.min(seg.ax, seg.bx) - reach) / CELL_MM);
    const x1 = Math.floor((Math.max(seg.ax, seg.bx) + reach) / CELL_MM);
    const y0 = Math.floor((Math.min(seg.ay, seg.by) - reach) / CELL_MM);
    const y1 = Math.floor((Math.max(seg.ay, seg.by) + reach) / CELL_MM);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const key = cellKey(cx, cy);
        const list = cells.get(key);
        if (list) list.push(id);
        else cells.set(key, [id]);
      }
    }
  });

  const colourOf = (b: number): string => {
    const named = opts.blockColours?.[b];
    return named === undefined ? `#block${b}` : colourKey(named);
  };
  const stamp = new Int32Array(segs.length).fill(-1);

  return moves.map((m, k): ThreadMove => {
    const a = stitches[m.from]!;
    const b = stitches[m.end]!;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    let visible = 0;
    if (length > 1e-9) {
      const ux = (b.x - a.x) / length;
      const uy = (b.y - a.y) / length;
      const own = colourOf(m.block);
      const spans: Span[] = [];
      const steps = Math.max(1, Math.ceil(length / (CELL_MM / 2)));
      const seenCells = new Set<number>();
      for (let step = 0; step <= steps; step++) {
        const t = (length * step) / steps;
        const key = cellKey(
          Math.floor((a.x + ux * t) / CELL_MM),
          Math.floor((a.y + uy * t) / CELL_MM),
        );
        if (seenCells.has(key)) continue;
        seenCells.add(key);
        for (const id of cells.get(key) ?? []) {
          if (stamp[id] === k) continue;
          stamp[id] = k;
          const seg = segs[id]!;
          // After the move, whatever the colour; before it, only thread of the move's own colour.
          const hides = seg.index >= m.end || (seg.index < m.from && colourOf(seg.block) === own);
          if (hides) spansOf(a.x, a.y, ux, uy, seg, reach, spans);
        }
      }
      visible = Math.max(0, length - covered(spans, length));
    }
    return {
      at: m.at,
      end: m.end,
      from: { x: a.x, y: a.y },
      to: { x: b.x, y: b.y },
      lengthMm: length,
      visibleMm: visible,
      trimmed: m.trimmed,
      block: m.block,
    };
  });
}

/**
 * The colour of every colour block of a list of colours in stitch order: a run of one colour is one
 * block (two spellings of one colour are one colour, `colourKey`). The blocks of the DST of a template
 * are these, as long as every object stitches something.
 */
export function blockColoursOf(colours: string[]): string[] {
  const blocks: string[] = [];
  let last: string | undefined;
  for (const colour of colours) {
    const key = colourKey(colour);
    if (key !== last) blocks.push(colour);
    last = key;
  }
  return blocks;
}

/** An object the probe put a cut after, in the order of the document. */
export type TrimTarget = {
  /** The id of the element that carries `inkstitch:trim_after`. */
  id: string;
  /** The cut was asked for by the source (`trim_after` in the template): it stays. */
  forced?: boolean;
};

/**
 * Why a cut stays or goes: `forced` the source asked for it (or no move follows it), `short` up to
 * `PLAIN_STITCH_MM` and hidden: Ink/Stitch stitches straight on, `hidden` the thread lies under later
 * stitches or on its own colour (a jump up to `HIDDEN_JUMP_MAX_MM`), `stitched` the same, longer, up to
 * `HIDDEN_STITCH_MAX_MM`: stitched across, `long` over `HIDDEN_JUMP_MAX_MM` and not hidden, or over
 * `HIDDEN_STITCH_MAX_MM`, `visible` up to `HIDDEN_JUMP_MAX_MM` and more than `VISIBLE_MAX_MM` of it on
 * the bare fabric (a stitch straight on that lies bare included).
 */
export type TrimReason = "forced" | "short" | "hidden" | "stitched" | "long" | "visible";

export type TrimDecision = {
  id: string;
  /** The cut stays. */
  cut: boolean;
  reason: TrimReason;
  /** The move it follows; 0 and `undefined` where none does (a colour change or the end follows). */
  lengthMm: number;
  visibleMm: number;
  from?: Point;
  to?: Point;
  block?: number;
};

export type TrimPlan = {
  /** One for every target, in order. */
  decisions: TrimDecision[];
  /** The ids whose cut stays, in order. */
  cut: string[];
  /**
   * The ids with no cut whose connection is stitched across (`withMinJumpLength`), with its length:
   * Ink/Stitch writes a jump there unless it is told the stitch may be this long.
   */
  stitched: { id: string; lengthMm: number }[];
};

export type TrimRuleOptions = ThreadMoveOptions & {
  /** Default `PLAIN_STITCH_MM`. */
  plainMm?: number;
  /** Default `HIDDEN_JUMP_MAX_MM`. */
  hiddenJumpMm?: number;
  /** Default `HIDDEN_STITCH_MAX_MM`. */
  stitchMm?: number;
  /** Default `VISIBLE_MAX_MM`. */
  visibleMm?: number;
};

/** Rounding of the DST (0.1 mm) and of the floats: a limit is met by a length equal to it. */
const SLACK_MM = 1e-9;

/**
 * Decides which of the cuts of a probe stay (module doc). `stitches` is the DST of the probe read back
 * (`readDst`, `unitsToMm`), in which every target carries a trim; the k-th trim of the list is the
 * cut after the k-th target. A list that does not have as many trims as there are targets cannot be
 * matched and is refused, not guessed at.
 */
export function planTrims(
  stitches: Stitch[],
  targets: TrimTarget[],
  opts: TrimRuleOptions = {},
): TrimPlan {
  const plainMm = opts.plainMm ?? PLAIN_STITCH_MM;
  const hiddenJumpMm = opts.hiddenJumpMm ?? HIDDEN_JUMP_MAX_MM;
  const stitchMm = opts.stitchMm ?? HIDDEN_STITCH_MAX_MM;
  const visibleMm = opts.visibleMm ?? VISIBLE_MAX_MM;

  const trims: number[] = [];
  stitches.forEach((s, i) => {
    if (s.cmd === "trim") trims.push(i);
  });
  if (trims.length !== targets.length) {
    throw new Error(
      `Die Sonde hat ${trims.length} Trims, aber ${targets.length} Objekte tragen trim_after — ` +
        "die Zuordnung der Fadenschnitte zu den Objekten ist nicht eindeutig.",
    );
  }

  const moves = threadMoves(stitches, opts);
  let next = 0;
  const decisions = targets.map((target, k): TrimDecision => {
    const at = trims[k]!;
    while (next < moves.length && moves[next]!.end <= at) next++;
    const move = moves[next];
    const here = move !== undefined && move.at <= at && at < move.end ? move : undefined;
    if (here === undefined) {
      return { id: target.id, cut: true, reason: "forced", lengthMm: 0, visibleMm: 0 };
    }
    const seen = {
      id: target.id,
      lengthMm: here.lengthMm,
      visibleMm: here.visibleMm,
      from: here.from,
      to: here.to,
      block: here.block,
    };
    if (target.forced === true) return { ...seen, cut: true, reason: "forced" };
    const hidden = here.visibleMm <= visibleMm + SLACK_MM;
    if (here.lengthMm <= plainMm + SLACK_MM) {
      // Ink/Stitch would stitch straight on, but a stitch across bare fabric is a thread in plain sight.
      return hidden
        ? { ...seen, cut: false, reason: "short" }
        : { ...seen, cut: true, reason: "visible" };
    }
    if (here.lengthMm > hiddenJumpMm + SLACK_MM) {
      // No jump this long stays open: hidden and not too long, it is stitched across, else it is cut.
      return hidden && here.lengthMm <= stitchMm + SLACK_MM
        ? { ...seen, cut: false, reason: "stitched" }
        : { ...seen, cut: true, reason: "long" };
    }
    return hidden
      ? { ...seen, cut: false, reason: "hidden" }
      : { ...seen, cut: true, reason: "visible" };
  });
  return {
    decisions,
    cut: decisions.filter((d) => d.cut).map((d) => d.id),
    stitched: decisions
      .filter((d) => d.reason === "stitched")
      .map((d) => ({ id: d.id, lengthMm: d.lengthMm })),
  };
}

// ---------------------------------------------------------------------------
// The document side
// ---------------------------------------------------------------------------

/** What Ink/Stitch reads as true in a boolean parameter (`get_boolean_param`). */
const isTrue = (value: string | undefined): boolean =>
  value !== undefined && ["yes", "y", "true", "t", "1"].includes(value.trim().toLowerCase());

function walk(el: XmlElement, visit: (el: XmlElement) => void): void {
  visit(el);
  for (const child of childElements(el)) walk(child, visit);
}

/**
 * The elements that carry `inkstitch:trim_after`, in the order of the document — the order Ink/Stitch
 * stitches them in, and the order of the trims in its DST.
 */
export function trimAfterIds(svg: string): string[] {
  const ids: string[] = [];
  walk(parseXml(svg).root, (el) => {
    const id = getAttr(el, "id");
    if (id !== undefined && isTrue(getNsAttr(el, XML_NS.inkstitch, "trim_after"))) ids.push(id);
  });
  return ids;
}

/**
 * The document without `inkstitch:trim_after` on the elements with these ids: the cuts of a probe that
 * the rule does not keep. Everything else in the document stays as it is, and without ids the very
 * same text comes back. An id the document does not have, or one that carries no cut, is an error —
 * the probe and the plan have to be about the same document, and a cut meant to go that is still
 * there would be a quiet no-op.
 */
export function withoutTrimAfter(svg: string, ids: Iterable<string>): string {
  const gone = new Set(ids);
  if (gone.size === 0) return svg;
  const doc = parseXml(svg);
  const found = new Set<string>();
  walk(doc.root, (el) => {
    const id = getAttr(el, "id");
    if (
      id === undefined ||
      !gone.has(id) ||
      !isTrue(getNsAttr(el, XML_NS.inkstitch, "trim_after"))
    ) {
      return;
    }
    found.add(id);
    removeNsAttr(el, XML_NS.inkstitch, "trim_after");
  });
  const missing = [...gone].filter((id) => !found.has(id));
  if (missing.length > 0) {
    throw new Error(
      `Kein Fadenschnitt zu entfernen an ${missing.slice(0, 5).join(", ")}: ` +
        "kein solches Element im Dokument oder kein trim_after daran.",
    );
  }
  return serializeXml(doc);
}

/** The length (mm) from which Ink/Stitch writes a jump instead of a stitch, for a move of `lengthMm`. */
const stitchAcross = (lengthMm: number): string =>
  String(Number((Math.ceil(lengthMm * 10 - 1e-6) / 10 + 1).toFixed(1)));

/**
 * The document with `inkstitch:min_jump_stitch_length_mm` on the elements with these ids, a mm above
 * the length of the move that follows each (the probe measured it between stitches with their lock
 * stitches; Ink/Stitch measures the raw end and start). Up to that distance Ink/Stitch stitches straight
 * from the object to the next one, with no jump and no lock stitches (`stitch_groups_to_stitch_plan`) —
 * the parameter belongs to the object whose connection it is, and stands for its own groups too.
 * An id the document does not have is an error; without entries the same text comes back.
 */
export function withMinJumpLength(
  svg: string,
  entries: { id: string; lengthMm: number }[],
): string {
  if (entries.length === 0) return svg;
  const by = new Map(entries.map((e) => [e.id, e.lengthMm]));
  const doc = parseXml(svg);
  ensureNamespace(doc.root, XML_NS.inkstitch, "inkstitch");
  const found = new Set<string>();
  walk(doc.root, (el) => {
    const id = getAttr(el, "id");
    const lengthMm = id === undefined ? undefined : by.get(id);
    if (id === undefined || lengthMm === undefined) return;
    found.add(id);
    setNsAttr(el, XML_NS.inkstitch, "min_jump_stitch_length_mm", stitchAcross(lengthMm));
  });
  const missing = [...by.keys()].filter((id) => !found.has(id));
  if (missing.length > 0) {
    throw new Error(`Kein Element mit der Kennung ${missing.slice(0, 5).join(", ")} im Dokument.`);
  }
  return serializeXml(doc);
}
