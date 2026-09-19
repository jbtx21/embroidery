/**
 * Expand text into satin (spec §4 `expand()`, §9).
 *
 * Glyphs sit on the baseline or on a path, are scaled to `heightMm` and get
 * their satin parameters from the preset. How letters are connected is decided
 * later by `connect()`; all that is fixed here is where a trim is REQUIRED —
 * between words, if the user asked for it.
 */
import type { Point, Polyline } from "@texma-stitch/geometry";
import { cumulativeLengths, pointAt, tangentAt } from "@texma-stitch/geometry";
import type { Font, FontRegistry } from "@texma-stitch/fonts";
import { kerningOf } from "@texma-stitch/fonts";
import type { MachineProfile, Preset } from "./presets.js";
import { MACHINE_DEFAULT, textMinFactor } from "./presets.js";
import type { RunningObject, SatinObject, StitchObject, TextObject, Warning } from "./types.js";
import { warn, WARNING } from "./warnings.js";

/** Default word gap in cap heights when the font has no space glyph. */
const SPACE_ADVANCE = 0.35;
/** Split-satin threshold for generated letters (spec §7.4). */
const TEXT_MAX_WIDTH_MM = 7;

export type ExpandContext = { preset: Preset; fonts?: FontRegistry; machine?: MachineProfile };

/** Places glyph coordinates (cap heights) at their spot in the design. */
type Placement = (p: Point) => Point;

function baseline(origin: Point, scale: number, advance: number): Placement {
  return (p) => ({ x: origin.x + (p.x + advance) * scale, y: origin.y + p.y * scale });
}

/**
 * On a path: x travels along the path as arc length, y stands perpendicular to
 * it. That way the letters tilt with the curve.
 */
function onPath(path: Polyline, scale: number): Placement {
  const cum = cumulativeLengths(path);
  return (p) => {
    const s = p.x * scale;
    const base = pointAt(path, s, cum);
    const t = tangentAt(path, s, cum);
    // Left normal; y points down in the SVG system, so the same turn as on the
    // baseline.
    return { x: base.x - t.y * p.y * scale, y: base.y + t.x * p.y * scale };
  };
}

function satinFrom(
  obj: TextObject,
  preset: Preset,
  id: string,
  column: { railA: Polyline; railB: Polyline; rungs: [Point, Point][] },
  place: Placement,
  trimAfter: SatinObject["trimAfter"],
): SatinObject {
  return {
    id,
    type: "satin",
    threadIndex: obj.threadIndex,
    visible: true,
    locked: false,
    trimAfter,
    railA: column.railA.map(place),
    railB: column.railB.map(place),
    rungs: column.rungs.map((r) => [place(r[0]), place(r[1])] as [Point, Point]),
    spacingMm: preset.satinSpacingMm,
    pullCompMm: preset.pullCompMm,
    maxWidthMm: TEXT_MAX_WIDTH_MM,
    underlay: preset.satinUnderlay,
    shortStitches: true,
    reverse: false,
  };
}

function runningFrom(
  obj: TextObject,
  id: string,
  stroke: Polyline,
  place: Placement,
  trimAfter: RunningObject["trimAfter"],
): RunningObject {
  return {
    id,
    type: "running",
    threadIndex: obj.threadIndex,
    visible: true,
    locked: false,
    trimAfter,
    path: stroke.map(place),
    closed: false,
    stitchLengthMm: 2.5,
    repeats: 1,
  };
}

function expandText(
  obj: TextObject,
  font: Font,
  ctx: ExpandContext,
): { objects: StitchObject[]; warnings: Warning[] } {
  const warnings: Warning[] = [];
  const objects: StitchObject[] = [];

  // Finer thread carries finer shapes, so the font's own minimum comes down with
  // it (spec §14): a font asking for 5 mm reaches 3.5 mm on 60 weight.
  const minHeightMm = font.minHeightMm * textMinFactor(ctx.machine ?? MACHINE_DEFAULT);
  if (obj.heightMm < minHeightMm) {
    warnings.push(
      warn(
        WARNING.TEXT_TOO_SMALL,
        `${obj.heightMm} mm is below the minimum height ${minHeightMm.toFixed(1)} mm of ` +
          `"${font.name}" on this thread.`,
        "warn",
        obj.id,
      ),
    );
  }

  const scale = obj.heightMm;
  const pathPlacement: Placement | undefined = obj.onPath ? onPath(obj.onPath, scale) : undefined;

  let pen = 0;
  const chars = [...obj.text];
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i]!;
    const prev = chars[i - 1];
    if (prev) pen += kerningOf(font, prev, c);

    const glyph = font.glyphs[c];
    if (!glyph) {
      if (c === " ") {
        pen += SPACE_ADVANCE + obj.letterSpacing;
        continue;
      }
      warnings.push(
        warn(
          WARNING.UNSUPPORTED_GLYPH,
          `Font "${font.name}" does not know the character "${c}".`,
          "warn",
          obj.id,
        ),
      );
      continue;
    }

    // Cut when the next character is a space and the user wants word-wise trims
    // (spec §9).
    const next = chars[i + 1];
    const trimAfter: SatinObject["trimAfter"] =
      obj.trimBetweenWords && (next === " " || next === undefined) ? "always" : "auto";

    const advance = pen;
    const place: Placement = pathPlacement
      ? (p) => pathPlacement({ x: p.x + advance, y: p.y })
      : baseline(obj.origin, scale, advance);

    glyph.columns.forEach((column, k) => {
      objects.push(satinFrom(obj, ctx.preset, `${obj.id}:${i}:s${k}`, column, place, trimAfter));
    });
    (glyph.strokes ?? []).forEach((stroke, k) => {
      objects.push(runningFrom(obj, `${obj.id}:${i}:r${k}`, stroke, place, trimAfter));
    });

    pen += glyph.advance + obj.letterSpacing;
  }

  return { objects, warnings };
}

export function expand(
  objects: StitchObject[],
  ctx: ExpandContext,
): { objects: StitchObject[]; warnings: Warning[] } {
  const out: StitchObject[] = [];
  const warnings: Warning[] = [];

  for (const obj of objects) {
    if (obj.type !== "text") {
      out.push(obj);
      continue;
    }
    const font = ctx.fonts?.get(obj.fontId);
    if (!font) {
      warnings.push(
        warn(
          WARNING.FONT_MISSING,
          `Font "${obj.fontId}" is not loaded — the text is not stitched.`,
          "error",
          obj.id,
        ),
      );
      continue;
    }
    const result = expandText(obj, font, ctx);
    out.push(...result.objects);
    warnings.push(...result.warnings);
  }

  return { objects: out, warnings };
}
