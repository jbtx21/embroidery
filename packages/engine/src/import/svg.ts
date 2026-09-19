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
import type { Point } from "@texma-stitch/geometry";
import { flattenPath, ringsToPolygons } from "@texma-stitch/geometry";
import type { Design, PresetId, StitchObject, Thread, Warning } from "../types.js";
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
        objects.push({
          id: polygons.length === 1 ? id : `${id}:${si}`,
          type: "fill",
          threadIndex,
          visible: true,
          locked: false,
          trimAfter,
          shape,
          angleDeg: Number.isFinite(angle) ? angle : 0,
          rowSpacingMm:
            Number.isFinite(rowSpacing) && rowSpacing > 0 ? rowSpacing : preset.fillRowSpacingMm,
          stitchLengthMm:
            Number.isFinite(stitchLength) && stitchLength > 0
              ? stitchLength
              : preset.fillStitchLengthMm,
          staggerRows:
            Number.isFinite(staggers) && staggers >= 1 ? staggers : preset.fillStaggerRows,
          // Compensation and underlap stay at zero on import, as pull already
          // did before them: they belong to the fabric and to what lies next to
          // the area, and the SVG says nothing about either. The preset carries
          // the values (§14), the editor applies them. See docs/backlog.md.
          pullCompMm: 0,
          pushCompMm: 0,
          underlapMm: 0,
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
