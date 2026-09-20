/**
 * Converter from Ink/Stitch SVG fonts to our font format (spec §9).
 *
 * An Ink/Stitch font is two files: `font.json` with the metrics, and `ltr.svg`
 * with one Inkscape layer per glyph, labelled `GlyphLayer-X`. Inside a layer the
 * paths stand in stitch order — a path marked `inkstitch:satin_column="True"`
 * carries the two rails and the rungs as subpaths of one `d`, everything else
 * is a running stitch that walks from one column to the next.
 *
 * Coordinates are normalised to a cap height of 1.0 with the baseline at y = 0,
 * which is what `types.ts` asks for. The cap height comes from the two Inkscape
 * guides `baseline` and `caps`; their distance is independent of where the page
 * origin sits, so nothing else about the document matters.
 */
import type { Point, Polyline } from "@texma-stitch/geometry";
import { flattenPath, parsePathData } from "@texma-stitch/geometry";
import type { Font, Glyph, GlyphPart } from "./types.js";

/** What we read out of `font.json`; everything else there is ignored. */
export type InkstitchMeta = {
  name?: string;
  units_per_em?: number;
  /** Height of the em in mm at scale 1. */
  size?: number;
  min_scale?: number;
  horiz_adv_x?: Record<string, number>;
  horiz_adv_x_default?: number;
  horiz_adv_x_space?: number;
  kerning_pairs?: Record<string, number>;
};

/** Flattening tolerance for the glyph outlines, in millimetres (spec §5). */
const FLATTEN_MM = 0.02;

const unescapeXml = (s: string): string =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

/** Position of an Inkscape guide by label, in the stored (y up) system. */
function guideY(svg: string, label: string): number | undefined {
  const re = new RegExp(`<sodipodi:guide\\b[^>]*?>`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(svg)) !== null) {
    const tag = m[0];
    if (!new RegExp(`inkscape:label="${label}"`).test(tag)) continue;
    const pos = /position="([^"]*)"/.exec(tag);
    if (!pos) continue;
    const parts = pos[1]!.split(",").map((v) => Number(v.trim()));
    const y = parts[1];
    if (y !== undefined && Number.isFinite(y)) return y;
  }
  return undefined;
}

/**
 * Cap height of the font in document units (spec §9).
 *
 * The guides are stored with y pointing up, so the page height cancels out of
 * the difference — only the distance between the two is needed.
 */
export function capHeightUnits(svg: string): number {
  const baseline = guideY(svg, "baseline");
  const caps = guideY(svg, "caps");
  if (baseline === undefined || caps === undefined) {
    throw new Error("The font SVG has no `baseline` and `caps` guide (spec §9).");
  }
  const units = Math.abs(caps - baseline);
  if (units < 1e-6) throw new Error("The `baseline` and `caps` guides sit on top of each other.");
  return units;
}

/** Height of the document in user units — needed to place the baseline. */
function documentHeight(svg: string): number {
  const open = /<svg\b[\s\S]*?>/.exec(svg)?.[0] ?? "";
  const h = /\bheight="([\d.]+)/.exec(open);
  if (h) return Number(h[1]);
  const box = /viewBox="[\d.eE+-]+\s+[\d.eE+-]+\s+[\d.eE+-]+\s+([\d.eE+-]+)"/.exec(open);
  return box ? Number(box[1]) : 0;
}

/** The body of every `GlyphLayer-…` group, keyed by the character. */
export function parseGlyphLayers(svg: string): Map<string, string> {
  const out = new Map<string, string>();
  const open = /<g\b[^>]*?>/g;
  let m: RegExpExecArray | null;

  while ((m = open.exec(svg)) !== null) {
    const label = /inkscape:label="GlyphLayer-(.*?)"/.exec(m[0]);
    if (!label) continue;
    if (m[0].trimEnd().endsWith("/>")) continue; // empty layer

    // Walk to the matching close tag — a glyph layer may hold nested groups.
    let depth = 1;
    const body = /<g\b[^>]*?>|<\/g\s*>/g;
    body.lastIndex = open.lastIndex;
    let end = svg.length;
    let inner: RegExpExecArray | null;
    while ((inner = body.exec(svg)) !== null) {
      if (inner[0].startsWith("</")) {
        depth--;
        if (depth === 0) {
          end = inner.index;
          break;
        }
      } else if (!inner[0].trimEnd().endsWith("/>")) {
        depth++;
      }
    }
    out.set(unescapeXml(label[1]!), svg.slice(open.lastIndex, end));
  }
  return out;
}

const attr = (tag: string, name: string): string | undefined =>
  new RegExp(`\\b${name.replace(":", "\\:")}="([^"]*)"`).exec(tag)?.[1];

/** One flattened subpath per `M` in the path data. */
function subpathsOf(d: string, toleranceUnits: number): Polyline[] {
  return parsePathData(d)
    .map((sub) => flattenPath(sub.start, sub.segments, toleranceUnits))
    .filter((line) => line.length >= 2);
}

function glyphFrom(body: string, toleranceUnits: number, place: (p: Point) => Point): Glyph {
  // Document order IS stitch order (spec §9.1), so one list keeps it.
  const parts: GlyphPart[] = [];

  for (const tag of body.match(/<path\b[\s\S]*?\/>/g) ?? []) {
    const d = attr(tag, "d");
    if (!d) continue;
    const lines = subpathsOf(d, toleranceUnits).map((line) => line.map(place));
    if (lines.length === 0) continue;

    const isSatin = (attr(tag, "inkstitch:satin_column") ?? "").toLowerCase() === "true";
    if (isSatin && lines.length >= 2) {
      // Rails first, then the rungs — a rung is read as its two ends. The stitch
      // parameters belong to the glyph, not to the fabric (spec §9.2).
      const mm = (name: string): number | undefined => {
        const v = Number(attr(tag, `inkstitch:${name}`));
        return Number.isFinite(v) && v > 0 ? v : undefined;
      };
      const spacingMm = mm("zigzag_spacing_mm");
      const pullCompMm = mm("pull_compensation_mm");
      const shortStitchMm = mm("short_stitch_distance_mm");
      parts.push({
        kind: "column",
        railA: lines[0]!,
        railB: lines[1]!,
        rungs: lines.slice(2).map((r) => [r[0]!, r[r.length - 1]!] as [Point, Point]),
        ...(spacingMm === undefined ? {} : { spacingMm }),
        ...(pullCompMm === undefined ? {} : { pullCompMm }),
        ...(shortStitchMm === undefined ? {} : { shortStitchMm }),
      });
      continue;
    }
    for (const line of lines) parts.push({ kind: "stroke", path: line });
  }

  return { parts, advance: 0 };
}

export function importInkstitchFont(svg: string, meta: InkstitchMeta, id: string): Font {
  const capUnits = capHeightUnits(svg);
  const baselineUp = guideY(svg, "baseline")!;
  const baselineY = documentHeight(svg) - baselineUp;

  const unitsPerEm = meta.units_per_em && meta.units_per_em > 0 ? meta.units_per_em : 100;
  const mmPerUnit = meta.size && meta.size > 0 ? meta.size / unitsPerEm : 0;
  const toleranceUnits = mmPerUnit > 0 ? FLATTEN_MM / mmPerUnit : FLATTEN_MM;

  const place = (p: Point): Point => ({
    x: p.x / capUnits,
    y: (p.y - baselineY) / capUnits,
  });

  const advances = meta.horiz_adv_x ?? {};
  const fallback = meta.horiz_adv_x_default ?? unitsPerEm / 2;
  const advanceOf = (ch: string): number =>
    (ch === " "
      ? (meta.horiz_adv_x_space ?? advances[" "] ?? fallback)
      : (advances[ch] ?? fallback)) / capUnits;

  const glyphs: Record<string, Glyph> = {};
  for (const [ch, body] of parseGlyphLayers(svg)) {
    glyphs[ch] = { ...glyphFrom(body, toleranceUnits, place), advance: advanceOf(ch) };
  }
  // A space carries no geometry, so it has no layer of its own.
  if (!glyphs[" "]) glyphs[" "] = { parts: [], advance: advanceOf(" ") };

  const font: Font = {
    id,
    name: meta.name ?? id,
    // `min_scale` is the smallest the whole em may go; our height is the cap.
    minHeightMm:
      meta.min_scale && meta.size ? meta.min_scale * meta.size * (capUnits / unitsPerEm) : 5,
    glyphs,
  };

  const pairs = meta.kerning_pairs ?? {};
  const kerning: Record<string, number> = {};
  for (const key of Object.keys(pairs).sort()) kerning[key] = pairs[key]! / capUnits;
  if (Object.keys(kerning).length > 0) font.kerning = kerning;
  return font;
}
