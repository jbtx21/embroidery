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
import type { Point, Polygon } from "@texma-stitch/geometry";
import {
  dist,
  flattenPath,
  intersect,
  medialAxis,
  offset,
  polygonArea,
  polygonBbox,
  rings,
  ringsToPolygons,
  arcLength,
} from "@texma-stitch/geometry";
import type { Design, PresetId, StitchObject, Thread, Warning } from "../types.js";
import { autoSatin } from "../auto-satin.js";
import { PRESETS } from "../presets.js";
import { warn, WARNING } from "../warnings.js";
import type { Matrix } from "./matrix.js";
import { applyMatrix, IDENTITY, multiply, parseTransform } from "./matrix.js";
import type { SubPath } from "./path-data.js";
import { parsePathData } from "./path-data.js";

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
 */
export function medianShapeWidthMm(shape: Polygon): number {
  const axis = medialAxis(shape);
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
 * (spec §5.1). A column that follows a shape runs roughly the length of it; a
 * curve stretches that, a wound rail multiplies it. Measured on the test logos:
 * sound columns land at 1,0, wound ones at 2,5.
 */
export const RAIL_EXTENT_MAX = 2.0;

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

export function importSvg(text: string, opts: SvgImportOptions = {}): SvgImport {
  const warnings: Warning[] = [];
  const { root, paths } = scan(text);
  const mmPerUnit = unitScale(root);
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
  for (const [pi, el] of paths.entries()) {
    const id = el.attrs["id"] ?? `path${pi}`;
    const subpaths = parsePathData(el.attrs["d"]!);
    if (subpaths.length === 0) {
      warnings.push(
        warn(WARNING.EMPTY_OBJECT, `Path "${id}" has no drawable segment.`, "warn", id),
      );
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
      const threadIndex = threadIndexOf(fill);
      const angle = Number(inkstitch(el.attrs, "angle"));
      const rowSpacing = Number(inkstitch(el.attrs, "row_spacing_mm"));
      const stitchLength = Number(inkstitch(el.attrs, "max_stitch_length_mm"));
      const staggers = Number(inkstitch(el.attrs, "staggers"));

      // Sub-paths of one `d` belong together: the inner ones are the holes.
      const rings = subpaths
        .map((sub) => ringInMm(sub, el.matrix, mmPerUnit))
        .filter((r) => r.length >= 3);
      const polygons = ringsToPolygons(rings);
      if (polygons.length === 0) {
        warnings.push(
          warn(WARNING.EMPTY_OBJECT, `Filled path "${id}" encloses no area.`, "warn", id),
        );
        continue;
      }

      polygons.forEach((shape, si) => {
        const objId = polygons.length === 1 ? id : `${id}:${si}`;

        // Narrow shapes are satin columns, not areas (spec §5.1).
        if (!Number.isFinite(angle) && medianShapeWidthMm(shape) < AUTOSATIN_MAX_WIDTH_MM) {
          const r = autoSatin(shape, {
            idPrefix: objId,
            threadIndex,
            spacingMm: preset.satinSpacingMm,
            pullCompMm: preset.pullCompMm,
            underlay: preset.satinUnderlay,
          });
          const mixed = r.warnings.some((w) => w.code === WARNING.SATIN_TOO_WIDE);
          const columns = r.objects.filter((o) => o.type === "satin");
          const fit = mixed || columns.length === 0 ? Infinity : railBudgetRatio(shape, columns);
          const worst = mixed || columns.length === 0 ? Infinity : worstRailExtent(columns);
          if (
            !mixed &&
            columns.length > 0 &&
            fit <= RAIL_BUDGET_SLACK &&
            worst <= RAIL_EXTENT_MAX
          ) {
            for (const o of r.objects) objects.push({ ...o, trimAfter });
            placed.push(shape);
            return;
          }
          warnings.push(
            warn(
              WARNING.AUTOSATIN_MIXED,
              mixed
                ? `"${objId}" has branches wider than the satin limit — stitched as a fill.`
                : `Auto-satin rails wind instead of following "${objId}": ` +
                    `${(fit * 100).toFixed(0)} % of its outline, worst column ${worst.toFixed(1)}x ` +
                    `its own extent. Stitched as a fill.`,
              "info",
              objId,
            ),
          );
        }

        // 45 degrees by default; a shape that covers or touches an earlier one
        // gets -45 so the directions cross at the seam (spec §5.1).
        const crosses = placed.some((p) => touchesOrCovers(p, shape));
        placed.push(shape);

        objects.push({
          id: objId,
          type: "fill",
          threadIndex,
          visible: true,
          locked: false,
          trimAfter,
          shape,
          angleDeg: Number.isFinite(angle)
            ? angle
            : crosses
              ? -DEFAULT_ANGLE_DEG
              : DEFAULT_ANGLE_DEG,
          rowSpacingMm:
            Number.isFinite(rowSpacing) && rowSpacing > 0 ? rowSpacing : preset.fillRowSpacingMm,
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

    const threadIndex = threadIndexOf(isPaint(stroke) ? stroke : undefined);
    const lengthAttr = Number(
      inkstitch(el.attrs, "running_stitch_length_mm") ?? inkstitch(el.attrs, "stitch_length_mm"),
    );
    const stitchLengthMm =
      Number.isFinite(lengthAttr) && lengthAttr > 0 ? lengthAttr : (opts.stitchLengthMm ?? 2.5);
    const repeats = repeatsFrom(inkstitch(el.attrs, "repeats"));

    subpaths.forEach((sub, si) => {
      const flat = flattenPath(sub.start, sub.segments);
      const path = flat.map((q) => {
        const t = applyMatrix(el.matrix, q);
        return { x: t.x * mmPerUnit, y: t.y * mmPerUnit };
      });
      objects.push({
        id: subpaths.length === 1 ? id : `${id}:${si}`,
        type: "running",
        threadIndex,
        visible: true,
        locked: false,
        trimAfter,
        path,
        closed: sub.closed,
        stitchLengthMm,
        repeats,
      });
    });
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
