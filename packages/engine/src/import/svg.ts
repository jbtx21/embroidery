/**
 * Minimal SVG import (spec §4, week 1).
 *
 * Reads `path` elements, applies the inherited `transform`, flattens them to
 * polylines and maps the Ink/Stitch attributes onto running-stitch parameters.
 * Unknown attributes are ignored.
 *
 * Deliberately no DOM: the engine has to run in Node and in a web worker
 * (CLAUDE.md, rule 4). The scanner therefore handles the subset of SVG that
 * vector editors actually emit — `svg`, `g`, `path` — and nothing else.
 *
 * Vectorisation is NOT part of the engine (spec §1). This importer takes paths
 * that already exist.
 */
import type { MedialAxisOptions, Point, Polygon, Polyline } from "@texma-stitch/geometry";
import type { SubPath } from "@texma-stitch/geometry";
import {
  dist,
  flattenPath,
  parsePathData,
  intersect,
  medialAxis,
  normalizeRing,
  offset,
  offsetPolyline,
  polygonArea,
  polygonBbox,
  rings,
  ringsToPolygons,
  union,
  arcLength,
} from "@texma-stitch/geometry";
import type { Design, PresetId, StitchObject, Thread, Warning } from "../types.js";
import { autoSatin, SATIN_MIN_COLUMN_MM } from "../auto-satin.js";
import { bestFillAngle } from "../fill.js";
import { PRESETS } from "../presets.js";
import { warn, WARNING } from "../warnings.js";
import type { Matrix } from "./matrix.js";
import { applyMatrix, IDENTITY, multiply, parseTransform } from "./matrix.js";

/** CSS reference: 96 user units per inch. */
const MM_PER_PX = 25.4 / 96;

export type SvgImportOptions = {
  preset?: PresetId;
  /** Default stitch length when the path carries no Ink/Stitch attribute. */
  stitchLengthMm?: number;
  designId?: string;
};

export type SvgImport = {
  design: Design;
  warnings: Warning[];
  /** Millimetres per SVG user unit — useful when a document looks wrongly scaled. */
  mmPerUnit: number;
};

// ---------------------------------------------------------------------------
// Attributes and lengths
// ---------------------------------------------------------------------------

type Attrs = Record<string, string>;

function parseAttributes(text: string): Attrs {
  const out: Attrs = {};
  const re = /([:\w.-]+)\s*=\s*"([^"]*)"|([:\w.-]+)\s*=\s*'([^']*)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const key = (m[1] ?? m[3] ?? "").toLowerCase();
    const value = m[2] ?? m[4] ?? "";
    if (key) out[key] = value;
  }
  return out;
}

/** SVG length to millimetres. Percentages are not resolvable here. */
export function lengthToMm(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const m = /^\s*(-?(?:\d*\.\d+|\d+)(?:[eE][+-]?\d+)?)\s*([a-z%]*)\s*$/.exec(value);
  if (!m) return undefined;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return undefined;
  switch ((m[2] ?? "").toLowerCase()) {
    case "mm":
      return n;
    case "cm":
      return n * 10;
    case "in":
      return n * 25.4;
    case "pt":
      return (n * 25.4) / 72;
    case "pc":
      return (n * 25.4) / 6;
    case "":
    case "px":
      return n * MM_PER_PX;
    default:
      return undefined; // %, em, ex: not resolvable without a layout
  }
}

/** Ink/Stitch writes its parameters as `inkstitch:*` attributes. */
const inkstitch = (attrs: Attrs, name: string): string | undefined =>
  attrs[`inkstitch:${name}`] ?? attrs[`inkstitch_${name}`];

const isTrue = (v: string | undefined): boolean =>
  v !== undefined && ["true", "1", "yes"].includes(v.trim().toLowerCase());

function repeatsFrom(value: string | undefined): 1 | 3 | 5 {
  const n = Number(value);
  if (n >= 5) return 5;
  if (n >= 3) return 3;
  return 1;
}

/** Presentation attributes a child inherits from its parent groups. */
const INHERITED = ["fill", "fill-rule", "stroke"] as const;

/**
 * One presentation value, from `style` if it is set there, otherwise from the
 * attribute of the same name.
 */
function paintValue(attrs: Attrs, key: string): string | undefined {
  const style = attrs["style"];
  const fromStyle = style
    ? new RegExp(`(?:^|;)\\s*${key}\\s*:\\s*([^;]+)`).exec(style)?.[1]
    : undefined;
  const raw = (fromStyle ?? attrs[key])?.trim().toLowerCase();
  return raw && raw.length > 0 ? raw : undefined;
}

/** Parent values, overridden by whatever this element sets itself. */
function inheritPaint(parent: Attrs, attrs: Attrs): Attrs {
  const out = { ...parent };
  for (const key of INHERITED) {
    const value = paintValue(attrs, key);
    if (value !== undefined) out[key] = value;
  }
  return out;
}

const isPaint = (value: string | undefined): value is string =>
  value !== undefined && value !== "none" && value !== "transparent";

// ---------------------------------------------------------------------------
// Scanner
// ---------------------------------------------------------------------------

type Element = {
  name: string;
  attrs: Attrs;
  matrix: Matrix;
  /** fill, fill-rule and stroke as they reach this element. */
  paint: Attrs;
};

/**
 * Walks the tags and keeps a transform stack. Self-closing tags and `</g>` are
 * handled; everything that is not `svg`, `g` or `path` only contributes its
 * transform, if any.
 */
function scan(text: string): { root: Attrs; paths: Element[] } {
  const paths: Element[] = [];
  let root: Attrs = {};
  const stack: Matrix[] = [IDENTITY];
  // Presentation attributes run down the tree: these files carry one colour per
  // group and nothing on the paths themselves.
  const paintStack: Attrs[] = [{}];

  const re = /<\s*(\/)?\s*([a-zA-Z][\w:.-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const closing = m[1] === "/";
    const name = (m[2] ?? "").toLowerCase();
    const rawAttrs = m[3] ?? "";
    // The attribute group has to swallow the trailing slash of `<path …/>`,
    // because a slash is a legal attribute character. So self-closing is decided
    // here, not by a separate group — a greedy group would eat the slash and
    // every following sibling would keep the group transform.
    const selfClosing = rawAttrs.trimEnd().endsWith("/");
    const attrText = selfClosing ? rawAttrs.trimEnd().slice(0, -1) : rawAttrs;

    if (closing) {
      if (stack.length > 1) stack.pop();
      if (paintStack.length > 1) paintStack.pop();
      continue;
    }

    const attrs = parseAttributes(attrText);
    const parent = stack[stack.length - 1]!;
    const local = attrs["transform"] ? parseTransform(attrs["transform"]) : IDENTITY;
    const matrix = multiply(parent, local);
    const paint = inheritPaint(paintStack[paintStack.length - 1]!, attrs);

    if (name === "svg") root = { ...root, ...attrs };
    if (name === "path" && attrs["d"]) paths.push({ name, attrs, matrix, paint });

    if (!selfClosing) {
      stack.push(matrix);
      paintStack.push(paint);
    }
  }

  return { root, paths };
}

/** Millimetres per user unit, from width/height and viewBox. */
export function unitScale(root: Attrs): number {
  const vb = root["viewbox"]
    ?.split(/[\s,]+/)
    .map(Number)
    .filter((n) => Number.isFinite(n));
  const widthMm = lengthToMm(root["width"]);
  const heightMm = lengthToMm(root["height"]);
  if (vb && vb.length === 4) {
    const vbW = vb[2]!;
    const vbH = vb[3]!;
    if (widthMm !== undefined && vbW > 0) return widthMm / vbW;
    if (heightMm !== undefined && vbH > 0) return heightMm / vbH;
  }
  // No viewBox: the user units are CSS pixels.
  return MM_PER_PX;
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

/** A closed ring in millimetres, ready for `ringsToPolygons`. */
function ringInMm(sub: SubPath, matrix: Matrix, mmPerUnit: number): Point[] {
  // Flatten in user units, then transform and scale to millimetres. The other
  // way round the flattening tolerance would refer to the wrong unit.
  const flat = flattenPath(sub.start, sub.segments);
  const ring = flat.map((q) => {
    const t = applyMatrix(matrix, q);
    return { x: t.x * mmPerUnit, y: t.y * mmPerUnit };
  });
  // `Z` repeats the start point; a ring closes implicitly.
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (ring.length > 1 && first && last && Math.hypot(last.x - first.x, last.y - first.y) < 1e-9) {
    ring.pop();
  }
  return ring;
}

/** Below this median width a shape is a satin column, not an area (spec §5.1). */
export const AUTOSATIN_MAX_WIDTH_MM = 5;
/**
 * Below this median width the narrow branch of `autoSatin` needs only one
 * pass of its running stitch, not the usual three (spec §7.4, 28.09.2026).
 *
 * One strand of thread lays about 0,4 mm of visible width; a three-pass bean
 * stitch covers 0,6 to 0,8 mm. Measured on the STUTTGART 80 mm logo: the
 * 0,44–0,48 mm edge that outlines its block letters needs one pass — a
 * second and third pass only stack more needle penetrations on the same
 * spot (8 instead of 6) without adding coverage. The same logo's banner
 * lettering has strokes of 0,89 to 1,22 mm, wide enough that three passes
 * are still the right call.
 *
 * The line sits at 0,7, not at 0,6, because the median width over-reads thin
 * rings: their corners add diagonals. A square ring with a 0,45 mm wall
 * measures 0,50 (10 mm side) to 0,62 mm (20 mm side), and the frames round the
 * banner ends of the same logo measure 0,61 to 0,62 — the same 0,45 mm edge as
 * the letters. At 0,6 they got three passes, and where their corners meet the
 * penetrations stacked to 8 (28.09.2026). Straight strips measure true: 0,75 mm
 * reads 0,78, so a real line of 0,7 mm and more keeps its bean stitch.
 */
export const SINGLE_PASS_MAX_MM = 0.7;
/**
 * Below this area a shape is dropped on import (spec §5.1). A square millimetre
 * does not show on fabric but costs a trim and two jumps; the Eislingen logo
 * carries over 2000 such leftovers from the vectorisation.
 */
export const DROP_TINY_MM2 = 1;
/** Default stitch angle on import (spec §5.1). */
export const DEFAULT_ANGLE_DEG = 45;

/** Only the part of the axis at least this wide counts as the spine (spec §5.1). */
const SPINE_FRACTION = 0.5;

/**
 * Median width of a shape, over the SPINE of its medial axis (spec §5.1).
 *
 * The radii of a skeleton always run to zero where a branch ends, so taking the
 * median over the whole axis makes every shape look narrower than it is: an
 * 8 x 8 mm square comes out at 4 mm, because its axis is the two diagonals and
 * half of their length sits in the tapering corners. Only the stretch at least
 * half as wide as the widest point is measured — for a bar that is nearly the
 * whole axis, for a blob it is the middle.
 *
 * A shape without a skeleton — a disc, or anything too small to sample — has no
 * median width and counts as wide, so it stays a fill.
 *
 * `sampleMm` (spec §5.2, second version) sets how finely the outline is sampled for the
 * axis. Left out, it is what it always was: perimeter / 300, between 0.3 and 2 mm — which
 * reads a strip of 0.2 mm as 0.32 mm and finds no axis at all in one of 0.1 mm. A finer
 * distance reads thin strips closer to their width (0.22 mm at 0.1 mm). Callers that do not
 * pass it — the classification of the template, the frozen import — get the same value as
 * before.
 */
export function medianShapeWidthMm(
  shape: Polygon,
  opts: Pick<MedialAxisOptions, "sampleMm"> = {},
): number {
  const axis = medialAxis(shape, opts.sampleMm === undefined ? {} : { sampleMm: opts.sampleMm });
  const all: { w: number; len: number }[] = [];
  let widest = 0;
  for (const branch of axis.branches) {
    for (let i = 1; i < branch.points.length; i++) {
      const len = dist(branch.points[i - 1]!, branch.points[i]!);
      if (len <= 0) continue;
      const w = branch.radii[i - 1]! + branch.radii[i]!;
      all.push({ w, len });
      if (w > widest) widest = w;
    }
  }
  const spine = all.filter((x) => x.w >= widest * SPINE_FRACTION);
  const total = spine.reduce((sum, x) => sum + x.len, 0);
  if (total === 0) return Infinity;
  spine.sort((a, b) => a.w - b.w);
  let acc = 0;
  for (const x of spine) {
    acc += x.len;
    if (acc >= total / 2) return x.w;
  }
  return spine[spine.length - 1]!.w;
}

/** Do the two shapes overlap, or lie close enough to share a seam (spec §5.1)? */
export function touchesOrCovers(a: Polygon, b: Polygon): boolean {
  const ba = polygonBbox(a);
  const bb = polygonBbox(b);
  const gap = 0.1;
  if (ba.minX - gap > bb.maxX || bb.minX - gap > ba.maxX) return false;
  if (ba.minY - gap > bb.maxY || bb.minY - gap > ba.maxY) return false;
  if (intersect([a], [b]).some((p) => polygonArea(p) > 1e-6)) return true;
  // Touching without overlapping: grow one a hair and try again.
  return offset(a, gap).some((grown) => intersect([grown], [b]).some((p) => polygonArea(p) > 1e-6));
}

/**
 * Slack on the rail budget (spec §5.1).
 *
 * The budget itself is an argument: the rails are read off the boundary, so
 * together they cannot be longer than it. The slack is not — the rails are
 * SAMPLED boundary points and the polyline through them cuts corners and
 * doubles back a little at the end caps. A clean 40 x 3 mm bar measures 1,08,
 * so 1,3 leaves room without letting a wound proposal through.
 */
export const RAIL_BUDGET_SLACK = 1.3;
/**
 * How long one column's rails may be against the extent of that column
 * (spec §5.1).
 *
 * Loosened from 2,0 to 4,0 on 21.09.2026. It was a stopgap against rails that
 * wound, and it could not tell them from a column that genuinely curves: a
 * letter bow measures 2,2 to 2,9 times its own extent, exactly like the wound
 * ones did. Since §7.7.1 the rails are cut out of the outline and the branches
 * divide it between them, so the budget above catches winding by itself — it
 * measured 97 to 99 % on sound shapes and 155 to 188 % on wound ones. This
 * bound stays as a backstop against something neither of us thought of.
 */
export const RAIL_EXTENT_MAX = 4.0;

/**
 * How much of the shape the columns have to cover to be taken (spec §5.1,
 * 27.09.2026).
 *
 * Measured with `columnCoverage` on 27.09.2026: a bar 40 x 3 mm reaches 91 %,
 * one of 20 x 1,5 mm 94 %, an arc 2,5 mm wide 97 %, a strip that becomes a
 * running stitch 99 %. None of them reaches 100 — the rail polygon stops at the
 * last rung, so the end caps are missing. Branching shapes fall away sharply
 * because the crossing belongs to no column: an L measures 84 %, a T 77 %, a
 * block T 71 %. The letters of STUTTGART 80 mm came out at 37 to 52 %.
 *
 * So the line sits at 85 %: above it everything a column can do honestly, below
 * it everything that leaves fabric bare. A fill covers all of it — less shine,
 * but the letter is there.
 */
export const COLUMN_COVERAGE_MIN = 0.85;

/**
 * Rail length of a proposal against the outline it was read from (spec §5.1).
 *
 * `railsForBranch` picks its rail points off the BOUNDARY of the shape, so both
 * rails of all columns together cannot be longer than that boundary — unless
 * the same stretch is used more than once. That is exactly what happens on a
 * shape whose branches curve: successive rail points land on opposite sides, the
 * rail winds, and the column stitches the same millimetre over and over. A
 * letter of 10 x 13 mm came out with rails 38 mm long and 92 stitches in one
 * square millimetre.
 *
 * Returns rail length divided by the outline length. At most 1 for a sound
 * proposal; well over it for a wound one.
 */
export function railBudgetRatio(shape: Polygon, columns: StitchObject[]): number {
  let outline = 0;
  for (const ring of rings(shape)) outline += arcLength([...ring, ring[0]!]);
  if (outline <= 0) return Infinity;
  let rails = 0;
  for (const o of columns) {
    if (o.type !== "satin") continue;
    rails += arcLength(o.railA) + arcLength(o.railB);
  }
  return rails / outline;
}

/**
 * The worst single column of a proposal, measured against its own extent
 * (spec §5.1). The budget above is provable but blind to one wound column among
 * sound ones: a shape with holes has outline enough to hide it.
 */
export function worstRailExtent(columns: StitchObject[]): number {
  let worst = 0;
  for (const o of columns) {
    if (o.type !== "satin") continue;
    const pts = [...o.railA, ...o.railB];
    if (pts.length === 0) continue;
    const b = polygonBbox({ outer: pts, holes: [] });
    const diag = Math.hypot(b.maxX - b.minX, b.maxY - b.minY);
    if (diag <= 0) continue;
    worst = Math.max(worst, (arcLength(o.railA) + arcLength(o.railB)) / (2 * diag));
  }
  return worst;
}

/**
 * How much of the shape the proposal actually puts thread on (spec §5.1,
 * 27.09.2026).
 *
 * The two bounds above measure the rails — how LONG they are. Neither asks the
 * question a looker-on asks first: is the shape covered? A block letter of
 * "STUTTGART" 80 mm came out with columns over 50 % of its area and bare fabric
 * in the rest; the banner lettering over 31 %. Both passed the rail bounds,
 * because wedges that leave half the letter out have perfectly short rails.
 *
 * A running stitch counts as the column it replaced (§7.4): its corridor is as
 * wide as the narrowest column we still stitch as satin.
 */
export function columnCoverage(shape: Polygon, columns: StitchObject[]): number {
  const patches: Polygon[] = [];
  for (const o of columns) {
    if (o.type === "satin") {
      patches.push(...railPatch(o.railA, o.railB));
    } else if (o.type === "running" && o.path.length >= 2) {
      const half = SATIN_MIN_COLUMN_MM / 2;
      patches.push(
        ...normalizeRing([
          ...offsetPolyline(o.path, half),
          ...offsetPolyline(o.path, -half).reverse(),
        ]),
      );
    }
  }
  return patchCoverage(shape, patches);
}

/**
 * The area a satin column puts thread on: the polygon between its rails, railA
 * forward and railB back, self-intersections resolved (spec §5.1). Shared by
 * `columnCoverage` and the check of the Ink/Stitch columns
 * (`packages/engine/src/inkstitch/`).
 */
export function railPatch(railA: Polyline, railB: Polyline): Polygon[] {
  if (railA.length < 2 || railB.length < 2) return [];
  return normalizeRing([...railA, ...[...railB].reverse()]);
}

/**
 * Share of `shape` the patches cover together — where two patches overlap, the
 * area counts once (spec §5.1). 0 for an empty shape or no patches.
 */
export function patchCoverage(shape: Polygon, patches: Polygon[]): number {
  const total = Math.abs(polygonArea(shape));
  if (total <= 0 || patches.length === 0) return 0;
  const covered = intersect(union(patches), [shape]).reduce(
    (sum, p) => sum + Math.abs(polygonArea(p)),
    0,
  );
  return covered / total;
}

// ---------------------------------------------------------------------------
// Reading paths, before any decision
// ---------------------------------------------------------------------------

/** A filled area, one polygon of a `<path>` (holes included). */
export type ImportedAreaShape = {
  kind: "area";
  /** Source id — `${id}:${n}` when one `d` produced more than one polygon. */
  id: string;
  polygon: Polygon;
  /** The fill that makes it an area, as it reaches the path (own or inherited). */
  color: string;
  /** Every attribute of the source `<path>`, `inkstitch:*` among them. */
  attrs: Record<string, string>;
  trimAfter: "auto" | "always";
};

/** A stroked (or unpainted) sub-path — a line, not an area (spec §4). */
export type ImportedLineShape = {
  kind: "line";
  /** Source id — `${id}:${n}` when one `d` had more than one sub-path. */
  id: string;
  polyline: Polyline;
  closed: boolean;
  /** The stroke, `undefined` for a path with neither fill nor stroke. */
  color: string | undefined;
  attrs: Record<string, string>;
  trimAfter: "auto" | "always";
};

export type ImportedShape = ImportedAreaShape | ImportedLineShape;

export type ImportShapesResult = {
  /** Document order — the stacking order (spec §5.1). */
  shapes: ImportedShape[];
  mmPerUnit: number;
  /** The `<svg>` root's declared size in mm, 0 when it names none. */
  widthMm: number;
  heightMm: number;
  warnings: Warning[];
};

/** One `<path>` as read, before `importSvg` decides fill, satin or running for it. */
type PathRead =
  | { kind: "empty"; warning: Warning }
  | {
      kind: "area";
      id: string;
      attrs: Attrs;
      trimAfter: "auto" | "always";
      color: string;
      polygons: Polygon[];
      /** Set when the rings enclose no area — reported, never dropped silently. */
      warning?: Warning;
    }
  | {
      kind: "line";
      id: string;
      attrs: Attrs;
      trimAfter: "auto" | "always";
      color: string | undefined;
      lines: { polyline: Polyline; closed: boolean }[];
    };

function readPaths(text: string): { root: Attrs; mmPerUnit: number; paths: PathRead[] } {
  const { root, paths } = scan(text);
  const mmPerUnit = unitScale(root);
  const out: PathRead[] = [];
  for (const [pi, el] of paths.entries()) {
    const id = el.attrs["id"] ?? `path${pi}`;
    const subpaths = parsePathData(el.attrs["d"]!);
    if (subpaths.length === 0) {
      out.push({
        kind: "empty",
        warning: warn(WARNING.EMPTY_OBJECT, `Path "${id}" has no drawable segment.`, "warn", id),
      });
      continue;
    }

    const fill = el.paint["fill"];
    const stroke = el.paint["stroke"];
    const trimAfter = isTrue(inkstitch(el.attrs, "trim_after")) ? "always" : "auto";

    // A filled path is an area, an outlined one is a line. With neither, treat
    // it as a line: SVG would render an unpainted path as black fill, but in an
    // embroidery source an unmarked path is an outline far more often than an
    // area, and that is also what this importer did before it knew about fills.
    if (isPaint(fill)) {
      // Sub-paths of one `d` belong together: the inner ones are the holes.
      const rings = subpaths
        .map((sub) => ringInMm(sub, el.matrix, mmPerUnit))
        .filter((r) => r.length >= 3);
      const polygons = ringsToPolygons(rings);
      out.push({
        kind: "area",
        id,
        attrs: el.attrs,
        trimAfter,
        color: fill,
        polygons,
        ...(polygons.length === 0
          ? {
              warning: warn(
                WARNING.EMPTY_OBJECT,
                `Filled path "${id}" encloses no area.`,
                "warn",
                id,
              ),
            }
          : {}),
      });
      continue;
    }

    out.push({
      kind: "line",
      id,
      attrs: el.attrs,
      trimAfter,
      color: isPaint(stroke) ? stroke : undefined,
      lines: subpaths.map((sub) => ({
        polyline: flattenPath(sub.start, sub.segments).map((q) => {
          const t = applyMatrix(el.matrix, q);
          return { x: t.x * mmPerUnit, y: t.y * mmPerUnit };
        }),
        closed: sub.closed,
      })),
    });
  }
  return { root, mmPerUnit, paths: out };
}

/**
 * Every path of an SVG as plain shapes in document order — the part of
 * `importSvg` that comes BEFORE it decides fill, auto-satin or running for each
 * one (spec §5.1). The Ink/Stitch preparation (`packages/engine/src/inkstitch/`)
 * reads the same shapes and decides by its own rules.
 *
 * Decides nothing and drops nothing: the tiny-area drop and the stitch type
 * belong to whoever reads the shapes, each with its own thresholds. Paths that
 * yield no shape are reported, not skipped silently.
 */
export function importShapes(text: string): ImportShapesResult {
  const { root, mmPerUnit, paths } = readPaths(text);
  const shapes: ImportedShape[] = [];
  const warnings: Warning[] = [];
  for (const p of paths) {
    if (p.kind === "empty") {
      warnings.push(p.warning);
    } else if (p.kind === "area") {
      if (p.warning) warnings.push(p.warning);
      p.polygons.forEach((polygon, si) => {
        shapes.push({
          kind: "area",
          id: p.polygons.length === 1 ? p.id : `${p.id}:${si}`,
          polygon,
          color: p.color,
          attrs: p.attrs,
          trimAfter: p.trimAfter,
        });
      });
    } else {
      p.lines.forEach((line, si) => {
        shapes.push({
          kind: "line",
          id: p.lines.length === 1 ? p.id : `${p.id}:${si}`,
          polyline: line.polyline,
          closed: line.closed,
          color: p.color,
          attrs: p.attrs,
          trimAfter: p.trimAfter,
        });
      });
    }
  }
  return {
    shapes,
    mmPerUnit,
    widthMm: lengthToMm(root["width"]) ?? 0,
    heightMm: lengthToMm(root["height"]) ?? 0,
    warnings,
  };
}

export function importSvg(text: string, opts: SvgImportOptions = {}): SvgImport {
  const warnings: Warning[] = [];
  const { root, mmPerUnit, paths } = readPaths(text);
  const preset = PRESETS[opts.preset ?? "pique"];

  const threads: Thread[] = [];
  const threadIndexOf = (hex: string | undefined): number => {
    const value = hex ?? "#000000";
    const found = threads.findIndex((t) => t.hex === value);
    if (found !== -1) return found;
    threads.push({ brand: "madeira", number: "", hex: value, name: value });
    return threads.length - 1;
  };

  const objects: StitchObject[] = [];
  /** Shapes already placed — needed for the crossing angle rule (spec §5.1). */
  const placed: Polygon[] = [];
  /** Areas dropped for being under `DROP_TINY_MM2`, reported together. */
  const dropped: number[] = [];
  for (const p of paths) {
    if (p.kind === "empty") {
      warnings.push(p.warning);
      continue;
    }
    const { id, trimAfter } = p;

    if (p.kind === "area") {
      const threadIndex = threadIndexOf(p.color);
      const angle = Number(inkstitch(p.attrs, "angle"));
      const rowSpacing = Number(inkstitch(p.attrs, "row_spacing_mm"));
      const stitchLength = Number(inkstitch(p.attrs, "max_stitch_length_mm"));
      const staggers = Number(inkstitch(p.attrs, "staggers"));

      if (p.warning) {
        warnings.push(p.warning);
        continue;
      }

      p.polygons.forEach((shape, si) => {
        const objId = p.polygons.length === 1 ? id : `${id}:${si}`;

        // Too small to see, big enough to cost a trim (spec §5.1).
        const area = polygonArea(shape);
        if (area < DROP_TINY_MM2) {
          dropped.push(area);
          return;
        }

        // Narrow shapes are satin columns, not areas (spec §5.1).
        const width = medianShapeWidthMm(shape);
        if (!Number.isFinite(angle) && width < AUTOSATIN_MAX_WIDTH_MM) {
          const r = autoSatin(shape, {
            idPrefix: objId,
            threadIndex,
            spacingMm: preset.satinSpacingMm,
            // Satin compensation follows the column width (spec §7.2, §14).
            pullCompPct: preset.pullCompPct,
            pullCompMinMm: preset.pullCompMinMm,
            pullCompMaxMm: preset.pullCompMaxMm,
            underlay: preset.satinUnderlay,
            // A single thread already covers up to SINGLE_PASS_MAX_MM; above
            // it, only the bean stitch's three passes give full coverage
            // (spec §7.4, 28.09.2026).
            narrowRepeats: width <= SINGLE_PASS_MAX_MM ? 1 : 3,
          });
          const mixed = r.warnings.some((w) => w.code === WARNING.SATIN_TOO_WIDE);
          const columns = r.objects.filter((o) => o.type === "satin");
          // A shape that comes back as running stitches alone is a line, not a
          // failure (spec §7.4) — what counts is whether thread lands on it.
          const empty = r.objects.length === 0;
          const bad = mixed || empty;
          const fit = bad ? Infinity : railBudgetRatio(shape, columns);
          const worst = bad ? Infinity : worstRailExtent(columns);
          const covered = bad ? 0 : columnCoverage(shape, r.objects);
          if (
            !bad &&
            fit <= RAIL_BUDGET_SLACK &&
            worst <= RAIL_EXTENT_MAX &&
            covered >= COLUMN_COVERAGE_MIN
          ) {
            for (const o of r.objects) objects.push({ ...o, trimAfter });
            placed.push(shape);
            return;
          }
          const why = mixed
            ? `"${objId}" has branches wider than the satin limit`
            : empty
              ? `Auto-satin found no column in "${objId}"`
              : fit > RAIL_BUDGET_SLACK || worst > RAIL_EXTENT_MAX
                ? `Auto-satin rails wind instead of following "${objId}": ` +
                  `${(fit * 100).toFixed(0)} % of its outline, worst column ` +
                  `${worst.toFixed(1)}x its own extent`
                : `Auto-satin leaves "${objId}" bare: its columns cover ` +
                  `${(covered * 100).toFixed(0)} % of the shape, ` +
                  `${(COLUMN_COVERAGE_MIN * 100).toFixed(0)} % is the least that counts`;
          warnings.push(
            warn(WARNING.AUTOSATIN_MIXED, `${why} — stitched as a fill.`, "info", objId),
          );
        }

        // The angle at which the rows break least (§8.2) — every break is a
        // fragment, and fragments are what our files have too many of against
        // the archive. A shape that covers or touches an earlier one is turned
        // away from it, so the directions cross at the seam (§5.1).
        const crosses = placed.some((p) => touchesOrCovers(p, shape));
        placed.push(shape);
        const spacing =
          Number.isFinite(rowSpacing) && rowSpacing > 0 ? rowSpacing : preset.fillRowSpacingMm;
        // Where the break count says nothing, §5.1 keeps its word: 45°, and −45°
        // for a shape lying on another so the directions cross at the seam.
        const fewest = bestFillAngle(shape, spacing, DEFAULT_ANGLE_DEG);
        const chosen = fewest === DEFAULT_ANGLE_DEG && crosses ? -DEFAULT_ANGLE_DEG : fewest;

        objects.push({
          id: objId,
          type: "fill",
          threadIndex,
          visible: true,
          locked: false,
          trimAfter,
          shape,
          angleDeg: Number.isFinite(angle) ? angle : chosen,
          rowSpacingMm: spacing,
          stitchLengthMm:
            Number.isFinite(stitchLength) && stitchLength > 0
              ? stitchLength
              : preset.fillStitchLengthMm,
          staggerRows:
            Number.isFinite(staggers) && staggers >= 1 ? staggers : preset.fillStaggerRows,
          // Pull and push belong to the fabric, and the fabric is settled with
          // the preset (spec §5.1). The underlap is NOT: it depends on what lies
          // next to the area, which only `resolveOverlaps` knows (§4.1).
          pullCompMm: preset.pullCompMm,
          pushCompMm: preset.pushCompMm,
          underlapMm: 0,
          cutsBelow: "auto",
          underlay: preset.fillUnderlay,
        });
      });
      continue;
    }

    const threadIndex = threadIndexOf(p.color);
    const lengthAttr = Number(
      inkstitch(p.attrs, "running_stitch_length_mm") ?? inkstitch(p.attrs, "stitch_length_mm"),
    );
    const stitchLengthMm =
      Number.isFinite(lengthAttr) && lengthAttr > 0 ? lengthAttr : (opts.stitchLengthMm ?? 2.5);
    const repeats = repeatsFrom(inkstitch(p.attrs, "repeats"));

    p.lines.forEach((line, si) => {
      objects.push({
        id: p.lines.length === 1 ? id : `${id}:${si}`,
        type: "running",
        threadIndex,
        visible: true,
        locked: false,
        trimAfter,
        path: line.polyline,
        closed: line.closed,
        stitchLengthMm,
        repeats,
      });
    });
  }

  if (dropped.length > 0) {
    // One line for all of them, not one per speck (spec §5.1).
    warnings.push(
      warn(
        WARNING.IMPORT_DROPPED_TINY,
        `${dropped.length} areas under ${DROP_TINY_MM2} mm² were left out — the largest was ` +
          `${Math.max(...dropped).toFixed(2)} mm². They cost a trim and do not show.`,
        "warn",
      ),
    );
  }
  if (objects.length === 0) {
    warnings.push(warn(WARNING.EMPTY_OBJECT, "The SVG contains no usable path.", "error"));
  }
  if (threads.length === 0)
    threads.push({ brand: "madeira", number: "", hex: "#000000", name: "" });

  const widthMm = lengthToMm(root["width"]) ?? 0;
  const heightMm = lengthToMm(root["height"]) ?? 0;

  return {
    design: {
      id: opts.designId ?? "svg-import",
      widthMm,
      heightMm,
      preset: opts.preset ?? "pique",
      objects,
      threads,
    },
    warnings,
    mmPerUnit,
  };
}
