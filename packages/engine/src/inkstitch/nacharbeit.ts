/**
 * The Nacharbeit file (spec §13.4): the Ink/Stitch document a run stitched from, set up so that a
 * puncher can open it in Inkscape with Ink/Stitch, find the weak places, rework them by hand and
 * export DST or PES — and so that it is a clean vector template for an outside puncher.
 *
 * It takes the SVG Ink/Stitch left after `auto_satin` and `jump_to_trim` and changes its STRUCTURE,
 * never a stitch:
 *
 * - **One layer per colour block**, in stitch order, named with number, colour name and colour value
 *   ("01 Gold #D1B35A"). A layer takes the neighbouring objects of one colour; a colour that comes
 *   back after another is a layer of its own. Ink/Stitch stitches in document order and layers are
 *   nothing to it but groups, so the order — and with it the DST — stays. A group is never split: one
 *   that holds several colours is reported and gets a layer of its own (nothing is guessed).
 * - **A name per object** (`inkscape:label`): kind, colour name and the source id ("Satin · Gold ·
 *   path33"). The parameters stay as `inkstitch:` attributes, untouched: the Ink/Stitch parameter
 *   dialog shows and changes them.
 * - **A hidden layer "Prüfstellen"**, last, with a circle and a short text per weak place. Ink/Stitch
 *   does not stitch what is hidden (`display:none`, `lib/elements/utils/nodes.py`); the layer also
 *   carries `inkstitch:ignore_object`, so nothing of it is stitched when someone shows it to look.
 * - **The page** in millimetres, `viewBox="0 0 W H"`.
 *
 * What is stitched is decided as Ink/Stitch decides it (`iterate_nodes`, `node_to_elements`): path,
 * line, polyline, polygon, rect, ellipse and circle with a fill or a stroke, not hidden, not ignored,
 * not in `defs`, not a command connector. Nothing here reads `sodipodi:docname`, and this module
 * never writes one: Ink/Stitch takes the label of the DST from it, and the file has to give the same
 * DST as the run (spec §13.4, smoke test).
 *
 * Pure: SVG text in, SVG text out, no DOM (CLAUDE.md, rule 4).
 */
import type { Point, Rect } from "@texma-stitch/geometry";
import { flattenPath, parsePathData, unionRect } from "@texma-stitch/geometry";
import type { Matrix } from "../import/matrix.js";
import { applyMatrix, IDENTITY, multiply, parseTransform } from "../import/matrix.js";
import { lengthToMm, unitScale, viewBoxOrigin } from "../import/svg.js";
import type { XmlElement, XmlNode } from "./xml.js";
import {
  childElements,
  createElement,
  decodeXml,
  encodeXml,
  ensureNamespace,
  getAttr,
  getNsAttr,
  localName,
  namespaceOf,
  parseXml,
  serializeXml,
  setAttr,
  setNsAttr,
  XML_NS,
} from "./xml.js";

// ---------------------------------------------------------------------------
// Colours
// ---------------------------------------------------------------------------

export type Rgb = { r: number; g: number; b: number };

/** The basic CSS colour names — what a vector editor writes instead of a value now and then. */
const CSS_NAMES: Record<string, string> = {
  black: "#000000",
  silver: "#c0c0c0",
  gray: "#808080",
  grey: "#808080",
  white: "#ffffff",
  maroon: "#800000",
  red: "#ff0000",
  purple: "#800080",
  fuchsia: "#ff00ff",
  magenta: "#ff00ff",
  green: "#008000",
  lime: "#00ff00",
  olive: "#808000",
  yellow: "#ffff00",
  navy: "#000080",
  blue: "#0000ff",
  teal: "#008080",
  aqua: "#00ffff",
  cyan: "#00ffff",
  orange: "#ffa500",
};

const byte = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));

/**
 * `#rgb`, `#rrggbb`, `rgb(…)` (numbers or percent) and the basic CSS names; `undefined` for anything
 * else (`none`, `url(#…)`, `currentColor`, a name that is not among the basic ones) — no guessing.
 */
export function parseColour(text: string): Rgb | undefined {
  const t = text.trim().toLowerCase();
  const value = CSS_NAMES[t] ?? t;
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(value);
  if (short) {
    const [, r, g, b] = short;
    return { r: parseInt(r! + r!, 16), g: parseInt(g! + g!, 16), b: parseInt(b! + b!, 16) };
  }
  const long = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/.exec(value);
  if (long) {
    return { r: parseInt(long[1]!, 16), g: parseInt(long[2]!, 16), b: parseInt(long[3]!, 16) };
  }
  const fn = /^rgb\(\s*([^)]*)\)$/.exec(t);
  if (fn) {
    const parts = fn[1]!.split(/[\s,]+/).filter((p) => p !== "");
    if (parts.length !== 3) return undefined;
    const v = parts.map((p) => {
      const m = /^(\d*\.?\d+)(%?)$/.exec(p);
      if (!m) return undefined;
      return byte(m[2] === "%" ? (Number(m[1]) * 255) / 100 : Number(m[1]));
    });
    if (v.some((n) => n === undefined)) return undefined;
    return { r: v[0]!, g: v[1]!, b: v[2]! };
  }
  return undefined;
}

const hex2 = (n: number): string => n.toString(16).padStart(2, "0");

/** One spelling for one colour: lower-case `#rrggbb`; `undefined` where `parseColour` reads nothing. */
export function colourKey(text: string): string | undefined {
  const c = parseColour(text);
  return c === undefined ? undefined : `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`;
}

/** Euclidean distance in RGB (0 to 255 per channel); `Infinity` where either is unreadable. */
export function colourDistance(a: string, b: string): number {
  const x = parseColour(a);
  const y = parseColour(b);
  if (x === undefined || y === undefined) return Infinity;
  return Math.hypot(x.r - y.r, x.g - y.g, x.b - y.b);
}

export type PaletteEntry = { name: string; rgb: Rgb };

const named = (name: string, r: number, g: number, b: number): PaletteEntry => ({
  name,
  rgb: { r, g, b },
});

/**
 * The names a colour can get (German, as the puncher says them). Small and fixed: the name is an aid
 * for reading a layer, the colour value beside it is what counts. The values are typical thread
 * shades, not the colours of one maker; the order decides a tie.
 */
export const PALETTE: readonly PaletteEntry[] = [
  named("Schwarz", 0, 0, 0),
  named("Dunkelgrau", 85, 85, 85),
  named("Grau", 140, 140, 140),
  named("Hellgrau", 200, 200, 200),
  named("Weiß", 255, 255, 255),
  named("Dunkelrot", 140, 0, 20),
  named("Rot", 220, 0, 10),
  named("Orange", 255, 130, 0),
  named("Gold", 212, 175, 55),
  named("Gelb", 255, 221, 0),
  named("Beige", 215, 190, 140),
  named("Braun", 125, 85, 45),
  named("Rosa", 255, 150, 190),
  named("Violett", 130, 40, 150),
  named("Dunkelblau", 10, 30, 90),
  named("Blau", 40, 80, 180),
  named("Hellblau", 110, 170, 230),
  named("Türkis", 0, 160, 160),
  named("Dunkelgrün", 0, 90, 45),
  named("Grün", 0, 150, 70),
  named("Hellgrün", 140, 200, 70),
];

/**
 * The name of the palette colour nearest in RGB; on a tie the first of the palette. "Unbekannt" for a
 * colour that cannot be read.
 */
export function colourName(text: string, palette: readonly PaletteEntry[] = PALETTE): string {
  const c = parseColour(text);
  if (c === undefined) return "Unbekannt";
  let best = "Unbekannt";
  let bestD = Infinity;
  for (const p of palette) {
    const d = (p.rgb.r - c.r) ** 2 + (p.rgb.g - c.g) ** 2 + (p.rgb.b - c.b) ** 2;
    if (d < bestD) {
      best = p.name;
      bestD = d;
    }
  }
  return best;
}

/**
 * Two colours this close in RGB, and not the same, are asked about in the colour sequence: “same needle
 * as stop N?”. Between the noise of one colour and two colours a puncher means apart, measured on the
 * customer logos: the same red from two PDF sources differs by 1.4 (#d2060d in Hofbräu, #d1070d in
 * Atzensport), the two closest colours within one file by 15.8 (Atzensport, #e00310 and #d1070d). 8 lies
 * between, about 1.8 % of the diagonal of the RGB cube (441): it asks about what the eye does not
 * separate and stays quiet about what it does. A question, not a rule — nothing in the file changes.
 */
export const SAME_NEEDLE_RGB = 8;

// ---------------------------------------------------------------------------
// What Ink/Stitch stitches
// ---------------------------------------------------------------------------

/** Ink/Stitch's `EMBROIDERABLE_TAGS` (`lib/svg/tags.py`). */
const EMBROIDERABLE = new Set(["path", "line", "polyline", "polygon", "rect", "ellipse", "circle"]);
/** Ink/Stitch never walks into these (`iterate_nodes`); the rest hold no drawing. */
const NOT_DRAWN = new Set([
  "defs",
  "mask",
  "clipPath",
  "metadata",
  "title",
  "desc",
  "style",
  "script",
]);
const isTrue = (v: string | undefined): boolean =>
  v !== undefined && ["true", "1", "yes", "y", "t"].includes(v.trim().toLowerCase());

/** The declarations of a `style` attribute, names lower-cased; a later one overrides an earlier. */
function styleOf(el: XmlElement): Map<string, string> {
  const out = new Map<string, string>();
  for (const decl of (getAttr(el, "style") ?? "").split(";")) {
    const colon = decl.indexOf(":");
    if (colon < 0) continue;
    const key = decl.slice(0, colon).trim().toLowerCase();
    if (key !== "")
      out.set(
        key,
        decl
          .slice(colon + 1)
          .replace(/!important\s*$/i, "")
          .trim(),
      );
  }
  return out;
}

/** A presentation value: the `style` wins over the attribute of the same name. */
const presentation = (
  el: XmlElement,
  style: Map<string, string>,
  name: string,
): string | undefined => style.get(name) ?? getAttr(el, name)?.trim();

/** Fill and stroke as they reach an element: its own, else its parents'. */
type Paint = { fill: string | undefined; stroke: string | undefined; fillOpacityZero: boolean };

function paintOf(el: XmlElement, style: Map<string, string>, inherited: Paint): Paint {
  const pick = (name: string, from: string | undefined): string | undefined => {
    const v = presentation(el, style, name);
    return v === undefined || v === "" || v === "inherit" ? from : v;
  };
  const opacity = presentation(el, style, "fill-opacity");
  return {
    fill: pick("fill", inherited.fill),
    stroke: pick("stroke", inherited.stroke),
    fillOpacityZero: opacity === undefined ? inherited.fillOpacityZero : Number(opacity) === 0,
  };
}

const isPainted = (v: string | undefined): v is string =>
  v !== undefined && !["none", "transparent"].includes(v.toLowerCase());

/**
 * A colour as one key: `#rrggbb` where it can be read, else `?` and the text as it stands. Two objects
 * of the same unreadable paint (`url(#verlauf)`) are one colour to the layers; they are named
 * Unbekannt.
 */
const keyOf = (paint: string): string => colourKey(paint) ?? `?${paint.trim()}`;
const isReadable = (key: string): boolean => key.startsWith("#");

/** A stitched object: what Ink/Stitch takes from the document to make stitches of. */
type Leaf = {
  el: XmlElement;
  /** From where the walk began to the parent of the leaf, outermost first. */
  ancestors: XmlElement[];
  matrix: Matrix;
  /** Colour keys in stitch order: the fill, then the stroke (`stroke_first` turns it). */
  colours: string[];
  /** "Satin", "Tatami", "Laufstich", … — from the `inkstitch:` attributes. */
  art: string;
};

const isCommand = (el: XmlElement): boolean =>
  ["connection-start", "connection-end", "connector-type"].some(
    (n) => getNsAttr(el, XML_NS.inkscape, n) !== undefined,
  );

/** The kind of a stitched object as a puncher names it, from the parameters Ink/Stitch reads. */
function artOf(el: XmlElement, filled: boolean, stroked: boolean): string {
  const ink = (n: string): string | undefined => getNsAttr(el, XML_NS.inkstitch, n)?.trim();
  if (stroked && isTrue(ink("satin_column"))) return "Satin";
  if (filled) {
    const method = ink("fill_method");
    return method === undefined || ["", "auto_fill", "tatami_fill"].includes(method)
      ? "Tatami"
      : "Füllung";
  }
  const method = ink("stroke_method");
  if (method === undefined || ["", "running_stitch"].includes(method)) return "Laufstich";
  const others: Record<string, string> = {
    ripple_stitch: "Wellenstich",
    zigzag_stitch: "Zickzack",
    manual_stitch: "Handstich",
  };
  return others[method] ?? "Stickobjekt";
}

/**
 * The objects under `el` that are stitched, in document order. Mirrors `iterate_nodes` and
 * `node_to_elements`: a hidden or ignored element takes its whole subtree out, `defs`, `mask` and
 * `clipPath` are never entered, a command connector is not an object, a path without `d` is nothing.
 * Colour comes from the object or from the groups round it; with none at all it is not stitched (the
 * template writes every paint itself).
 */
function collectLeaves(
  el: XmlElement,
  inherited: Paint,
  matrix: Matrix,
  ancestors: XmlElement[],
  out: Leaf[],
): void {
  if (namespaceOf(el) !== XML_NS.svg) return;
  const name = localName(el);
  if (NOT_DRAWN.has(name)) return;
  const style = styleOf(el);
  if (presentation(el, style, "display")?.toLowerCase() === "none") return;
  if (isTrue(getNsAttr(el, XML_NS.inkstitch, "ignore_object"))) return;
  if (isCommand(el)) return;

  const paint = paintOf(el, style, inherited);
  const transform = getAttr(el, "transform");
  const here = transform === undefined ? matrix : multiply(matrix, parseTransform(transform));

  if (!EMBROIDERABLE.has(name)) {
    const below = [...ancestors, el];
    for (const child of childElements(el)) collectLeaves(child, paint, here, below, out);
    return;
  }
  if (name === "path" && (getAttr(el, "d") ?? "").trim() === "") return;

  const filled = isPainted(paint.fill) && !paint.fillOpacityZero;
  const stroked = isPainted(paint.stroke);
  const colours: string[] = [];
  if (filled) colours.push(keyOf(paint.fill!));
  if (stroked && !colours.includes(keyOf(paint.stroke!))) colours.push(keyOf(paint.stroke!));
  if (colours.length === 0) return;
  if (filled && stroked && isTrue(getNsAttr(el, XML_NS.inkstitch, "stroke_first")))
    colours.reverse();
  out.push({ el, ancestors, matrix: here, colours, art: artOf(el, filled, stroked) });
}

const EMPTY_PAINT: Paint = { fill: undefined, stroke: undefined, fillOpacityZero: false };

// ---------------------------------------------------------------------------
// Geometry on the page
// ---------------------------------------------------------------------------

/** Millimetres per user unit and the origin of the page in user units, read from the root element. */
function pageOf(root: XmlElement): { mmPerUnit: number; origin: Point } {
  const attrs: Record<string, string> = {};
  for (const [key, name] of [
    ["width", "width"],
    ["height", "height"],
    ["viewbox", "viewBox"],
  ] as const) {
    const value = getAttr(root, name);
    if (value !== undefined) attrs[key] = value;
  }
  return { mmPerUnit: unitScale(attrs), origin: viewBoxOrigin(attrs) };
}

/** The box of one path leaf on the page, mm; `undefined` for what is not a path or has no points. */
function leafBounds(leaf: Leaf, page: { mmPerUnit: number; origin: Point }): Rect | undefined {
  if (localName(leaf.el) !== "path") return undefined;
  let box: Rect | undefined;
  for (const sub of parsePathData(getAttr(leaf.el, "d") ?? "")) {
    for (const p of flattenPath(sub.start, sub.segments)) {
      const t = applyMatrix(leaf.matrix, p);
      const x = (t.x - page.origin.x) * page.mmPerUnit;
      const y = (t.y - page.origin.y) * page.mmPerUnit;
      box =
        box === undefined
          ? { minX: x, minY: y, maxX: x, maxY: y }
          : {
              minX: Math.min(box.minX, x),
              minY: Math.min(box.minY, y),
              maxX: Math.max(box.maxX, x),
              maxY: Math.max(box.maxY, y),
            };
    }
  }
  return box;
}

/** Every stitched object of a document, in document order, with the matrices of its parents. */
function leavesOf(root: XmlElement): Leaf[] {
  const out: Leaf[] = [];
  collectLeaves(root, EMPTY_PAINT, IDENTITY, [], out);
  return out;
}

/**
 * Where each object and group is: the middle of the box of the stitched paths in it, in millimetres on
 * the page (origin of the viewBox off, scale applied). Keyed by `id`. Commands, hidden and ignored
 * objects are not counted; only paths have a box.
 */
export function elementCentres(svg: string): Map<string, Point> {
  const root = parseXml(svg).root;
  const page = pageOf(root);
  const boxes = new Map<string, Rect>();
  for (const leaf of leavesOf(root)) {
    const box = leafBounds(leaf, page);
    if (box === undefined) continue;
    for (const el of [...leaf.ancestors, leaf.el]) {
      const id = getAttr(el, "id");
      if (id === undefined || el === root) continue;
      const known = boxes.get(id);
      boxes.set(id, known === undefined ? box : unionRect(known, box));
    }
  }
  const out = new Map<string, Point>();
  for (const [id, b] of boxes) out.set(id, { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 });
  return out;
}

/** The page a document names in its `width` and `height`, mm; `undefined` where either is missing or not a length. */
export function pageSizeMm(svg: string): { widthMm: number; heightMm: number } | undefined {
  const root = parseXml(svg).root;
  const widthMm = lengthToMm(getAttr(root, "width"));
  const heightMm = lengthToMm(getAttr(root, "height"));
  return widthMm === undefined || heightMm === undefined ? undefined : { widthMm, heightMm };
}

/**
 * The version of the document format Ink/Stitch writes into the metadata (`lib/update.py`,
 * `INKSTITCH_SVG_VERSION`): 4 in the development state of 17.09.2026 (`d59c9ab`) and, read in its
 * source, in 3.3.0. A document below it is a legacy document to Ink/Stitch: it updates it on opening
 * (attributes of fills and strokes change, for an unversioned one Inkscape asks first) and stitches
 * something else than the file said.
 */
export const INKSTITCH_SVG_VERSION = 4;

/**
 * The version a document names, found as Ink/Stitch finds it (an element `inkstitch_svg_version`,
 * whatever its namespace, and the number in it); `undefined` where there is none or it is no number.
 */
export function inkstitchSvgVersion(svg: string): number | undefined {
  return versionOf(parseXml(svg).root);
}

function versionOf(root: XmlElement): number | undefined {
  const find = (el: XmlElement): XmlElement | undefined => {
    if (localName(el) === "inkstitch_svg_version") return el;
    for (const c of childElements(el)) {
      const hit = find(c);
      if (hit !== undefined) return hit;
    }
    return undefined;
  };
  const el = find(root);
  if (el === undefined) return undefined;
  const text = el.children
    .filter((c) => c.kind === "text")
    .map((c) => decodeXml(c.raw))
    .join("")
    .trim();
  return /^-?\d+$/.test(text) ? Number(text) : undefined;
}

/** What each stitched object is ("Satin", "Tatami", "Laufstich" …), by `id`; one without an id is left out. */
export function elementKinds(svg: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const leaf of leavesOf(parseXml(svg).root)) {
    const id = getAttr(leaf.el, "id");
    if (id !== undefined) out.set(id, leaf.art);
  }
  return out;
}

/** The box of everything that is stitched, mm on the page; `undefined` for a document with no path. */
export function documentBounds(svg: string): Rect | undefined {
  const root = parseXml(svg).root;
  const page = pageOf(root);
  let all: Rect | undefined;
  for (const leaf of leavesOf(root)) {
    const box = leafBounds(leaf, page);
    if (box !== undefined) all = all === undefined ? box : unionRect(all, box);
  }
  return all;
}

// ---------------------------------------------------------------------------
// The file
// ---------------------------------------------------------------------------

/** One weak place: where (mm on the page), what it is, and a short text — what was measured, the limit, a suggestion. */
export type ReworkSpot = { xMm: number; yMm: number; art: string; text: string };

export type ReworkOptions = {
  /** The page, mm: the size of the document the run stitched from. */
  widthMm: number;
  heightMm: number;
  /** The weak places for the hidden layer "Prüfstellen", in the order they are numbered. */
  spots?: ReworkSpot[];
};

/** A layer: one colour block (or one mixed group) of the stitch order. */
export type ReworkLayer = {
  /** 1 for the first layer. */
  number: number;
  /** "01 Gold #D1B35A". */
  label: string;
  /** `#rrggbb`, lower case; `undefined` for a mixed group and for a colour that cannot be read. */
  hex: string | undefined;
  /** "Gold", "Unbekannt", or "Mehrfarbig". */
  name: string;
  /** The ids of the top-level units in it ("" where one has none), in order. */
  units: string[];
  /** Stitched objects in it. */
  elements: number;
  /** The box of the stitched paths in it, mm on the page; `undefined` where it has none. */
  bounds: Rect | undefined;
};

/** One colour of the stitch order: a run of neighbouring stitched objects of one colour. */
export type ReworkStop = { hex: string | undefined; name: string };

export type ReworkNote = {
  kind: "mixed-colours" | "unreadable-colour" | "no-stitches" | "page-size" | "svg-version";
  message: string;
  /** The group or object it is about. */
  id?: string;
};

export type ReworkResult = {
  /** The document to write. */
  svg: string;
  layers: ReworkLayer[];
  /**
   * The colours in stitch order, one per colour change plus one — what Ink/Stitch makes of the
   * objects (neighbours of one colour are one block), whatever the layers are.
   */
  stops: ReworkStop[];
  /** Places in the layer "Prüfstellen". */
  spots: number;
  /** The `inkstitch_svg_version` the document carries (`undefined` for none), kept as it was. */
  inkstitchSvgVersion: number | undefined;
  notes: ReworkNote[];
};

const num = (n: number): string => (Math.round(n * 1e3) / 1e3).toString();
const XML_DECLARATION = `<?xml version="1.0" encoding="UTF-8"?>\n`;
const NEWLINE: XmlNode = { kind: "text", raw: "\n" };

const hexUpper = (key: string): string => key.toUpperCase();
const pad2 = (n: number): string => String(n).padStart(2, "0");

/** The layer of a document Ink/Stitch has stitched from — of this kind; ours is found by its name. */
const isLayer = (el: XmlElement): boolean =>
  getNsAttr(el, XML_NS.inkscape, "groupmode") === "layer";
const PRUEFSTELLEN = "Prüfstellen";

/** A top-level child of the document and what is stitched in it. */
type Unit = {
  node: XmlNode;
  el: XmlElement | undefined;
  id: string | undefined;
  leaves: Leaf[];
  /** The colours in it, each once, in order. */
  colours: string[];
};

/** Neighbouring units of one colour, or one unit of several: one layer. */
type Block = { key: string | undefined; mixed: boolean; units: Unit[] };

function unitsOf(root: XmlElement): { head: XmlNode[]; units: Unit[] } {
  const head: XmlNode[] = [];
  const units: Unit[] = [];
  // What the root passes on to its children is part of what they are stitched as.
  const rootPaint = paintOf(root, styleOf(root), EMPTY_PAINT);
  for (const node of root.children) {
    if (node.kind === "text" && node.raw.trim() === "") continue;
    if (node.kind !== "element") {
      units.push({ node, el: undefined, id: undefined, leaves: [], colours: [] });
      continue;
    }
    // The layer of check points of an earlier file is replaced by the new one, not kept next to it.
    if (isLayer(node) && getNsAttr(node, XML_NS.inkscape, "label") === PRUEFSTELLEN) continue;
    // Not a drawing (defs, metadata, the namedview of Inkscape): it stays before the first layer.
    if (namespaceOf(node) !== XML_NS.svg || NOT_DRAWN.has(localName(node))) {
      head.push(node);
      continue;
    }
    const leaves: Leaf[] = [];
    collectLeaves(node, rootPaint, IDENTITY, [], leaves);
    const colours: string[] = [];
    for (const leaf of leaves)
      for (const c of leaf.colours) if (!colours.includes(c)) colours.push(c);
    units.push({ node, el: node, id: getAttr(node, "id"), leaves, colours });
  }
  return { head, units };
}

/** What to call a colour key: the name, or Unbekannt. */
const nameOfKey = (key: string): string => (isReadable(key) ? colourName(key) : "Unbekannt");

/** The colour runs of the stitch order: what Ink/Stitch makes of neighbouring objects of one colour. */
function stopsOf(leaves: Leaf[]): ReworkStop[] {
  const stops: ReworkStop[] = [];
  let last: string | undefined;
  for (const leaf of leaves) {
    for (const key of leaf.colours) {
      if (key === last) continue;
      last = key;
      stops.push({ hex: isReadable(key) ? key : undefined, name: nameOfKey(key) });
    }
  }
  return stops;
}

/**
 * The source of an object, for its name: the group it was made in (the shape, for routed columns —
 * Ink/Stitch gives the columns ids of its own), else its own id. A layer is no source.
 */
function sourceOf(leaf: Leaf): string {
  for (const a of [...leaf.ancestors, leaf.el]) {
    const id = getAttr(a, "id");
    if (id !== undefined && id !== "" && !isLayer(a)) return id;
  }
  return "ohne Kennung";
}

function blocksOf(units: Unit[], head: XmlNode[]): Block[] {
  const blocks: Block[] = [];
  let current: Block | undefined;
  for (const unit of units) {
    if (unit.leaves.length === 0) {
      // Not stitched (a command beside its column, a hidden object, a comment): it goes along with
      // what stands before it, and before the first colour it belongs to the head.
      if (current !== undefined) current.units.push(unit);
      else head.push(unit.node);
      continue;
    }
    if (unit.colours.length > 1) {
      blocks.push({ key: undefined, mixed: true, units: [unit] });
      current = undefined;
      continue;
    }
    const key = unit.colours[0]!;
    if (current !== undefined && !current.mixed && current.key === key) current.units.push(unit);
    else {
      current = { key, mixed: false, units: [unit] };
      blocks.push(current);
    }
  }
  return blocks;
}

/**
 * Makes ids the document does not hold yet: the ids in the tree are taken, and every one made is
 * taken too (`-2`, `-3` … behind a base that is).
 */
function idMaker(root: XmlElement): (base: string) => string {
  const ids = new Set<string>();
  const walk = (el: XmlElement): void => {
    const id = getAttr(el, "id");
    if (id !== undefined) ids.add(id);
    for (const c of childElements(el)) walk(c);
  };
  walk(root);
  return (base) => {
    let id = base;
    for (let n = 2; ids.has(id); n++) id = `${base}-${n}`;
    ids.add(id);
    return id;
  };
}

/**
 * The page in millimetres (module doc). Written only where the document says otherwise; a size that
 * was there and differs is reported — the file is then not the page the run stitched from.
 */
function setPage(root: XmlElement, widthMm: number, heightMm: number, notes: ReworkNote[]): void {
  const w = lengthToMm(getAttr(root, "width"));
  const h = lengthToMm(getAttr(root, "height"));
  const box = (getAttr(root, "viewBox") ?? "")
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  const hasBox = box.length === 4 && box.every(Number.isFinite);
  const near = (a: number | undefined, b: number): boolean =>
    a !== undefined && Math.abs(a - b) < 1e-3;
  const sizeOk = near(w, widthMm) && near(h, heightMm);
  const boxOk =
    hasBox && near(box[0], 0) && near(box[1], 0) && near(box[2], widthMm) && near(box[3], heightMm);
  if (sizeOk && boxOk) return;
  if (w !== undefined && h !== undefined && hasBox) {
    notes.push({
      kind: "page-size",
      message:
        `Die Seite der Datei war ${num(w)} × ${num(h)} mm (viewBox ${box.map(num).join(" ")}); ` +
        `gesetzt: ${num(widthMm)} × ${num(heightMm)} mm, viewBox 0 0 ${num(widthMm)} ${num(heightMm)}.`,
    });
  }
  setAttr(root, "width", `${num(widthMm)}mm`);
  setAttr(root, "height", `${num(heightMm)}mm`);
  setAttr(root, "viewBox", `0 0 ${num(widthMm)} ${num(heightMm)}`);
}

/** Circle and text of the layer "Prüfstellen", sized to the page so they read on a large motif too. */
function spotLayer(
  root: XmlElement,
  spots: ReworkSpot[],
  widthMm: number,
  unique: (base: string) => string,
): XmlElement {
  const r = Math.max(1, Math.min(3, widthMm / 100));
  const font = r * 1.1;
  const colour = "#d40000";

  const layer = createElement("g", [["id", unique("pruefstellen")]], root);
  setNsAttr(layer, XML_NS.inkscape, "groupmode", "layer");
  setNsAttr(layer, XML_NS.inkscape, "label", PRUEFSTELLEN);
  // Hidden: Ink/Stitch does not stitch it. Ignored as well, so that showing it to look does not
  // put its circles into the embroidery.
  setAttr(layer, "style", "display:none");
  setNsAttr(layer, XML_NS.inkstitch, "ignore_object", "true");

  spots.forEach((spot, i) => {
    const nr = i + 1;
    const entry = createElement(
      "g",
      [["id", unique(`pruefstelle-${String(nr).padStart(3, "0")}`)]],
      root,
    );
    setNsAttr(entry, XML_NS.inkscape, "label", `${nr} ${spot.art}`);
    entry.children.push(
      createElement(
        "circle",
        [
          ["cx", num(spot.xMm)],
          ["cy", num(spot.yMm)],
          ["r", num(r)],
          ["style", `fill:none;stroke:${colour};stroke-width:${num(r * 0.15)}`],
        ],
        root,
      ),
      createElement(
        "text",
        [
          ["x", num(spot.xMm + r * 1.4)],
          ["y", num(spot.yMm + font * 0.35)],
          ["style", `font-family:sans-serif;font-size:${num(font)}px;fill:${colour};stroke:none`],
        ],
        root,
        [{ kind: "text", raw: encodeXml(`${nr} ${spot.art}: ${spot.text}`, "text") }],
      ),
    );
    layer.children.push(entry, NEWLINE);
  });
  return layer;
}

/**
 * The Nacharbeit file from the SVG Ink/Stitch stitched (module doc). Throws for a document that is
 * not an SVG, and for a result whose stitch order is not the original — a bug, never a user error.
 */
export function buildReworkSvg(svg: string, opts: ReworkOptions): ReworkResult {
  const doc = parseXml(svg);
  const root = doc.root;
  if (localName(root) !== "svg")
    throw new Error(`Not an SVG document: the root element is <${root.name}>.`);

  ensureNamespace(root, XML_NS.inkscape, "inkscape");
  ensureNamespace(root, XML_NS.inkstitch, "inkstitch");
  const notes: ReworkNote[] = [];
  setPage(root, opts.widthMm, opts.heightMm, notes);

  // The page as the file now says it: the boxes of the layers are in its millimetres.
  const page = pageOf(root);
  const { head, units } = unitsOf(root);
  const before = units.flatMap((u) => u.leaves.map((l) => l.el));
  const blocks = blocksOf(units, head);
  const stops = stopsOf(units.flatMap((u) => u.leaves));
  const unique = idMaker(root);

  const version = versionOf(root);
  if (version !== INKSTITCH_SVG_VERSION) {
    notes.push({
      kind: "svg-version",
      message:
        version === undefined
          ? `Die Datei trägt keine inkstitch_svg_version: Ink/Stitch behandelt sie als Altdokument, ` +
            `aktualisiert sie beim Öffnen (Inkscape fragt vorher) und stickt dann anders als der Lauf.`
          : `Die Datei trägt Version ${version} des Ink/Stitch-Dokumentformats, geprüft ist ` +
            `${INKSTITCH_SVG_VERSION}: Ink/Stitch kann sie beim Öffnen ändern.`,
    });
  }
  if (before.length === 0) {
    notes.push({
      kind: "no-stitches",
      message: "Die Datei enthält nichts, was Ink/Stitch stickt.",
    });
  }
  const reported = new Set<string>();
  for (const unit of units) {
    for (const c of unit.colours) {
      if (!isReadable(c) && !reported.has(c)) {
        reported.add(c);
        notes.push({
          kind: "unreadable-colour",
          message: `Farbe ${c.slice(1)} nicht lesbar — Ebene „Unbekannt“, kein Farbname.`,
        });
      }
    }
  }

  // Names first (they need the colour of each object), then the layers.
  for (const unit of units) {
    if (unit.el === undefined || unit.leaves.length === 0) continue;
    const colourOfUnit = unit.colours.length > 1 ? "Mehrfarbig" : nameOfKey(unit.colours[0]!);
    for (const leaf of unit.leaves) {
      setNsAttr(
        leaf.el,
        XML_NS.inkscape,
        "label",
        `${leaf.art} · ${nameOfKey(leaf.colours[0]!)} · ${sourceOf(leaf)}`,
      );
    }
    // A group is named after what is in it; a layer of an earlier file keeps the name it has.
    if (!unit.leaves.some((l) => l.el === unit.el) && !isLayer(unit.el)) {
      const art = unit.leaves.some((l) => l.art === "Satin") ? "Satin" : unit.leaves[0]!.art;
      setNsAttr(
        unit.el,
        XML_NS.inkscape,
        "label",
        `${art} · ${colourOfUnit} · ${unit.id ?? "ohne Kennung"}`,
      );
    }
  }

  const layers: ReworkLayer[] = [];
  const layerElements: XmlElement[] = [];
  blocks.forEach((block, i) => {
    const number = i + 1;
    const hex = block.key !== undefined && isReadable(block.key) ? block.key : undefined;
    const first = block.units.find((u) => u.leaves.length > 0)!;
    const name = block.mixed ? "Mehrfarbig" : nameOfKey(block.key!);
    let label: string;
    if (block.mixed) {
      const what = first.el !== undefined && localName(first.el) === "g" ? "Gruppe" : "Objekt";
      label = `${pad2(number)} Mehrfarbig${first.id === undefined ? "" : ` (${what} ${first.id})`}`;
      notes.push({
        kind: "mixed-colours",
        ...(first.id === undefined ? {} : { id: first.id }),
        message:
          `${what} ${first.id ?? "ohne Kennung"} enthält mehrere Farben ` +
          `(${first.colours.map((c) => (isReadable(c) ? hexUpper(c) : c.slice(1))).join(", ")}) — ` +
          `nicht aufgetrennt, eigene Ebene.`,
      });
    } else {
      label = `${pad2(number)} ${name}${hex === undefined ? "" : ` ${hexUpper(hex)}`}`;
    }
    const layer = createElement("g", [["id", unique(`ebene-${pad2(number)}`)]], root);
    setNsAttr(layer, XML_NS.inkscape, "groupmode", "layer");
    setNsAttr(layer, XML_NS.inkscape, "label", label);
    for (const unit of block.units) layer.children.push(unit.node, NEWLINE);
    layerElements.push(layer);
    let bounds: Rect | undefined;
    for (const unit of block.units) {
      for (const leaf of unit.leaves) {
        const box = leafBounds(leaf, page);
        if (box !== undefined) bounds = bounds === undefined ? box : unionRect(bounds, box);
      }
    }
    layers.push({
      number,
      label,
      hex,
      name,
      units: block.units.filter((u) => u.leaves.length > 0).map((u) => u.id ?? ""),
      elements: block.units.reduce((n, u) => n + u.leaves.length, 0),
      bounds,
    });
  });

  const spots = opts.spots ?? [];
  const spotsLayer = spotLayer(root, spots, opts.widthMm, unique);
  root.children = [];
  for (const node of head) root.children.push(node, NEWLINE);
  for (const layer of layerElements) root.children.push(layer, NEWLINE);
  root.children.push(spotsLayer, NEWLINE);

  // The order is the stitching: what Ink/Stitch takes from the new document has to be what it took
  // from the old one, object for object.
  const after = leavesOf(root).map((l) => l.el);
  if (after.length !== before.length || after.some((el, i) => el !== before[i])) {
    throw new Error("Nacharbeit file: the stitch order changed — this is a bug, not a user error.");
  }

  const prolog = doc.prolog.trim() === "" ? XML_DECLARATION : doc.prolog;
  return {
    svg: serializeXml({ prolog, root, epilog: "\n" }),
    layers,
    stops,
    spots: spots.length,
    inkstitchSvgVersion: version,
    notes,
  };
}

// ---------------------------------------------------------------------------
// The colour sequence as text
// ---------------------------------------------------------------------------

/** `1234.56` as "1.234,6": the German way, thousands with a dot. */
function german(n: number, digits: number): string {
  const [int, frac] = n.toFixed(digits).split(".");
  const grouped = int!.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return frac === undefined ? grouped : `${grouped},${frac}`;
}

export type FarbfolgeInput = {
  /** The name of the run, as in the file names. */
  name: string;
  widthMm: number;
  heightMm: number;
  stitches: number;
  /** The preset, by its id ("cap"). */
  preset: string;
  stops: ReworkStop[];
};

/**
 * The needle occupancy per stop as a text file (spec §13.4): a header with size, stitches and preset, then
 * one line per stop — number, colour name and value. A colour that comes back is named by number and
 * name alone. A colour close to an earlier one, but not the same (`SAME_NEEDLE_RGB`), gets the
 * question “dieselbe Nadel wie Stopp N?”.
 */
export function farbfolge(input: FarbfolgeInput): string {
  const { stops } = input;
  const lines = [
    `${input.name}   ${german(input.widthMm, 1)} x ${german(input.heightMm, 1)} mm   ` +
      `${german(input.stitches, 0)} Stiche   Preset ${input.preset}`,
  ];
  const numberWidth = String(stops.length).length;
  // The colour values line up among the stops that show one.
  const nameWidth = Math.max(
    0,
    ...stops.filter((s) => s.hex !== undefined).map((s) => s.name.length),
  );
  const seen: { hex: string; stop: number }[] = [];
  stops.forEach((stop, i) => {
    const stopNumber = i + 1;
    const head = `  ${String(stopNumber).padStart(numberWidth)} ${stop.name}`;
    if (stop.hex === undefined || seen.some((s) => s.hex === stop.hex)) {
      lines.push(head);
      return;
    }
    let near: { stop: number; d: number } | undefined;
    for (const s of seen) {
      const d = colourDistance(s.hex, stop.hex);
      if (d <= SAME_NEEDLE_RGB && (near === undefined || d < near.d)) near = { stop: s.stop, d };
    }
    seen.push({ hex: stop.hex, stop: stopNumber });
    lines.push(
      `  ${String(stopNumber).padStart(numberWidth)} ${stop.name.padEnd(nameWidth)}  ` +
        `${hexUpper(stop.hex)}${near === undefined ? "" : `  dieselbe Nadel wie Stopp ${near.stop}?`}`,
    );
  });
  return `${lines.join("\n")}\n`;
}
