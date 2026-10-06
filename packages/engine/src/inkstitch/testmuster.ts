/**
 * The parameter matrix: a test pattern per fabric (docs/probesticks.md, "Testmuster je Stoff"). One DST
 * stitches the stitch parameters side by side — a field per pair of values — so that the stitched piece
 * shows which values suit the fabric, instead of a sample stick with a logo that mixes everything.
 *
 * Every field is written the way an order's shape of that kind is written (`template.ts`), with the
 * preset's values and only the pair of the field changed: a tatami area as `tatamiAttributes`, with the
 * pull and push compensation in its outline (`compensateArea`) and the grid underlay where it holds
 * (`gridUnderlay`); a satin column as `satinColumnAttributes` sets it for its width, underlay and pull
 * compensation included; the ties of `tieAttributes`; the document head with the minimum stitch length
 * — and no `inkstitch_svg_version`, as the template has none (docs/backlog.md). So a field with the
 * preset's own values stitches as an order's shape does. Two things differ, on purpose: a thread cut
 * follows every field (`inkstitch:trim_after`, one colour throughout), and the satin columns do not go
 * through `auto_satin` — on a lone column it splits the column in two with a running stitch between
 * (measured: 113 instead of 100 stitches at 2.5 mm), which would put a seam into every field.
 *
 * Millimetres, origin top left, y down (CLAUDE.md, rules 1 and 2). Block A (3 × 3 tatami squares) from
 * (5, 5), block B (3 × 3 satin columns) from x = 60, block C (four squares for the pull compensation)
 * from y = 60, and the mark — an angle of two running-stitch legs at the corner of the page — in the
 * margin at the top left, so that the piece is held the right way round once it is out of the hoop.
 *
 * Pure: a preset in, a document and a list of fields out; no IO, no Ink/Stitch (CLAUDE.md, rule 4).
 */
import type { Point, Polygon, Rect } from "@texma-stitch/geometry";
import { orient, polygonBbox } from "@texma-stitch/geometry";
import { DEFAULT_ANGLE_DEG } from "../import/svg.js";
import type { Preset } from "../presets.js";
import type { SatinColumnPlan } from "./columns.js";
import { SATIN_RUNG_OVERSHOOT_MM, SATIN_RUNG_SPACING_MM } from "./columns.js";
import { fitHoop, machineOfPreset } from "./hoop.js";
import { compensateArea, gridUnderlay, tatamiAttributes } from "./tatami.js";
import {
  inkAttrs,
  INKSTITCH_MIN_STITCH_MM,
  lineD,
  num,
  polygonD,
  RUNNING_STITCH_MM,
  satinColumnAttributes,
  satinColumnD,
  satinPullCompMm,
  tieAttributes,
  UNDERLAY_WIDE_FROM_MM,
} from "./template.js";

/** The thread colour of every object: one for the whole pattern. */
export const TEST_PATTERN_COLOUR = "#1f3a93";
/** Block A, the rows from top to bottom: the fill's row spacing, mm (adjacent rows, as `row_spacing_mm`). */
export const TEST_PATTERN_ROW_SPACINGS_MM = [0.19, 0.21, 0.24] as const;
/** Block A, the columns from left to right: the fill's stitch length, mm. */
export const TEST_PATTERN_STITCH_LENGTHS_MM = [3, 4, 5] as const;
/** Block B, the columns from left to right: the satin column's width, mm. */
export const TEST_PATTERN_SATIN_WIDTHS_MM = [1, 2.5, 4.5] as const;
/** Block B, the rows from top to bottom: the zigzag spacing, peak to peak, mm (`zigzag_spacing_mm`). */
export const TEST_PATTERN_SATIN_SPACINGS_MM = [0.34, 0.38, 0.42] as const;

/** Where everything lies, mm (module doc). */
export const TEST_PATTERN_LAYOUT = {
  /** The margin round the pattern, and where block A begins (x and y). */
  marginMm: 5,
  /** A cell of block A or B: a square of this side; a satin column is this long. */
  cellMm: 15,
  /** Between two cells, and between two squares of block C. */
  gapMm: 3,
  /** Block B begins at this x. */
  satinFromX: 60,
  /** Block C begins at this y. */
  compFromY: 60,
  /** The squares of block C. */
  compSquareMm: 20,
  /** Each leg of the mark. */
  markLegMm: 5,
} as const;

/** Where the end rungs of a satin column lie from its ends, as `satinColumns` sets them on a straight bar. */
const RUNG_END_MM = 0.02;
/** The width of the stroke the running stitch and the satin columns are drawn with, as in the template. */
const STROKE_WIDTH = "0.1";
/** The cut after an object. */
const TRIM = { trim_after: "true" } as const;

/** Three values: a row or a column of a block. */
export type TestPatternTriple = readonly [number, number, number];

export type TestPatternOptions = {
  /** Block A, one per row from top to bottom: row spacing, mm. Default 0.19 / 0.21 / 0.24. */
  rowSpacingsMm?: TestPatternTriple;
  /** Block A, one per column from left to right: stitch length, mm. Default 3 / 4 / 5. */
  stitchLengthsMm?: TestPatternTriple;
  /** Block B, one per column from left to right: width, mm — up to the 15 mm of the cell. Default 1 / 2.5 / 4.5. */
  satinWidthsMm?: TestPatternTriple;
  /** Block B, one per row from top to bottom: zigzag spacing, mm. Default 0.34 / 0.38 / 0.42. */
  satinSpacingsMm?: TestPatternTriple;
  /** The thread colour, `#rrggbb`. Default `TEST_PATTERN_COLOUR`. */
  colour?: string;
};

export type TestPatternBlock = "A" | "B" | "C";

type FieldBase = {
  /** "A1" to "A9" and "B1" to "B9" (reading order: rows from the top, columns from the left), "C1" to "C4". */
  id: string;
  /** The middle of the field, mm on the page. */
  centre: Point;
  /** The field as drawn, mm, before any compensation. */
  size: { widthMm: number; heightMm: number };
  /** Where it lies in its block, in German: "Block A, oben links". */
  place: string;
  /** The values of the field in plain German, for the legend. */
  text: string;
};

export type TestPatternField =
  /** Tatami: the row spacing of the rows (top to bottom) and the stitch length of the columns. */
  | (FieldBase & { block: "A"; values: { rowSpacingMm: number; stitchLengthMm: number } })
  /** Satin: the width of the columns and the zigzag spacing of the rows. */
  | (FieldBase & { block: "B"; values: { widthMm: number; spacingMm: number } })
  /** Pull compensation: the pull along the rows and the push across them, per side, mm. */
  | (FieldBase & { block: "C"; values: { pullMm: number; pushMm: number } });

export type TestPattern = {
  /** The document Ink/Stitch stitches: the mark first, then A1 to A9, B1 to B9, C1 to C4. */
  svg: string;
  fields: TestPatternField[];
  /** The page, mm. */
  widthMm: number;
  heightMm: number;
  /** The box of everything stitched — the mark, tatami as written (outline compensated), satin with its pull. */
  bounds: Rect;
  colour: string;
};

// ---------------------------------------------------------------------------
// Numbers and words
// ---------------------------------------------------------------------------

/** A number the German way: decimal comma, at least `min` decimals and at most three. */
function de(value: number, min: number): string {
  const trimmed = Number(value.toFixed(3));
  const decimals = Math.max(min, (String(trimmed).split(".")[1] ?? "").length);
  return trimmed.toFixed(decimals).replace(".", ",");
}

/** A whole number with a dot between the thousands: 8077 as "8.077". */
const thousands = (n: number): string =>
  String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

const ROW_WORDS = ["oben", "Mitte", "unten"] as const;
const COLUMN_WORDS = ["links", "Mitte", "rechts"] as const;

/** "Block A, oben links" … "Block A, Mitte" … "Block A, unten rechts". */
const gridPlace = (block: "A" | "B", row: number, column: number): string =>
  `Block ${block}, ${row === 1 && column === 1 ? "Mitte" : `${ROW_WORDS[row]} ${COLUMN_WORDS[column]}`}`;

// ---------------------------------------------------------------------------
// Building
// ---------------------------------------------------------------------------

function requireTriple(
  name: string,
  values: TestPatternTriple,
  max = Number.POSITIVE_INFINITY,
): void {
  const ok =
    Array.isArray(values) &&
    values.length === 3 &&
    values.every((v) => Number.isFinite(v) && v > 0 && v <= max);
  if (!ok) {
    throw new RangeError(
      `${name} must be three numbers over 0${max === Number.POSITIVE_INFINITY ? "" : ` and up to ${max}`}, got ${String(values)}`,
    );
  }
}

const square = (x: number, y: number, size: number): Polygon => ({
  outer: orient(
    [
      { x, y },
      { x: x + size, y },
      { x: x + size, y: y + size },
      { x, y: y + size },
    ],
    true,
  ),
  holes: [],
});

/**
 * A straight satin column, its rails from the top of the cell down: the rungs where `satinColumns` puts
 * them on a bar of that width — near each end, one every `SATIN_RUNG_SPACING_MM` between — each a little
 * past the rails. Exact width and length; what `satinColumns` makes of a rectangle is the same bar,
 * measured by its median rung.
 */
function satinColumn(id: string, centreX: number, top: number, widthMm: number): SatinColumnPlan {
  const length = TEST_PATTERN_LAYOUT.cellMm;
  const xa = centreX - widthMm / 2;
  const xb = centreX + widthMm / 2;
  const at: number[] = [];
  for (let k = 0; RUNG_END_MM + k * SATIN_RUNG_SPACING_MM < length - RUNG_END_MM; k++) {
    at.push(RUNG_END_MM + k * SATIN_RUNG_SPACING_MM);
  }
  at.push(length - RUNG_END_MM);
  return {
    id,
    stroke: 0,
    railA: [
      { x: xa, y: top },
      { x: xa, y: top + length },
    ],
    railB: [
      { x: xb, y: top },
      { x: xb, y: top + length },
    ],
    rungs: at.map((y) => [
      { x: xa - SATIN_RUNG_OVERSHOOT_MM, y: top + y },
      { x: xb + SATIN_RUNG_OVERSHOOT_MM, y: top + y },
    ]),
    widthMm,
    closed: false,
  };
}

/** One object of the document, as written, and the box it stitches. */
type Piece = { svg: string; box: Rect };

const unionBox = (a: Rect, b: Rect): Rect => ({
  minX: Math.min(a.minX, b.minX),
  minY: Math.min(a.minY, b.minY),
  maxX: Math.max(a.maxX, b.maxX),
  maxY: Math.max(a.maxY, b.maxY),
});

/**
 * The test pattern of a preset (module doc). `preset` supplies everything the matrix does not vary;
 * `options` replaces the values the matrix varies. Throws on values that are not three numbers over 0
 * (a satin width not over its 15-mm cell) and on a colour that is not `#rrggbb`: nothing is mended.
 */
export function buildTestPattern(preset: Preset, options: TestPatternOptions = {}): TestPattern {
  const L = TEST_PATTERN_LAYOUT;
  const rowSpacings = options.rowSpacingsMm ?? TEST_PATTERN_ROW_SPACINGS_MM;
  const stitchLengths = options.stitchLengthsMm ?? TEST_PATTERN_STITCH_LENGTHS_MM;
  const satinWidths = options.satinWidthsMm ?? TEST_PATTERN_SATIN_WIDTHS_MM;
  const satinSpacings = options.satinSpacingsMm ?? TEST_PATTERN_SATIN_SPACINGS_MM;
  const colour = options.colour ?? TEST_PATTERN_COLOUR;
  requireTriple("rowSpacingsMm", rowSpacings);
  requireTriple("stitchLengthsMm", stitchLengths);
  requireTriple("satinWidthsMm", satinWidths, L.cellMm);
  requireTriple("satinSpacingsMm", satinSpacings);
  if (!/^#[0-9a-fA-F]{6}$/.test(colour)) {
    throw new RangeError(`colour must be #rrggbb, got ${colour}`);
  }

  const pitch = L.cellMm + L.gapMm;
  const pieces: Piece[] = [];
  const fields: TestPatternField[] = [];

  // The mark: an angle in the margin at the top left, the corner on the corner of the page.
  const leg = L.markLegMm;
  pieces.push({
    svg:
      `<path id="mark" d="${lineD([
        { x: leg, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: leg },
      ])}" style="fill:none;stroke:${colour};stroke-width:${STROKE_WIDTH}"` +
      `${inkAttrs({
        stroke_method: "running_stitch",
        running_stitch_length_mm: num(RUNNING_STITCH_MM),
        ...tieAttributes(),
        ...TRIM,
      })}/>`,
    box: { minX: 0, minY: 0, maxX: leg, maxY: leg },
  });

  /** A tatami square as an order writes it: compensated at its angle, the grid underlay where it holds. */
  const tatami = (id: string, from: Point, size: number, angleDeg: number, own: Preset): Piece => {
    const area = compensateArea(square(from.x, from.y, size), angleDeg, own).polygon;
    const underlay = gridUnderlay(area, own, angleDeg);
    return {
      svg:
        `<path id="${id}" d="${polygonD(area)}" style="fill:${colour};stroke:none"` +
        `${inkAttrs({ ...tatamiAttributes(own, angleDeg, underlay.grid), ...tieAttributes(), ...TRIM })}/>`,
      box: polygonBbox(area),
    };
  };

  // Block A: tatami, the rows by row spacing, the columns by stitch length — angle as an order's area has it.
  for (let row = 0; row < 3; row++) {
    for (let column = 0; column < 3; column++) {
      const id = `A${row * 3 + column + 1}`;
      const rowSpacingMm = rowSpacings[row]!;
      const stitchLengthMm = stitchLengths[column]!;
      const from = { x: L.marginMm + column * pitch, y: L.marginMm + row * pitch };
      const own: Preset = {
        ...preset,
        fillRowSpacingMm: rowSpacingMm,
        fillStitchLengthMm: stitchLengthMm,
      };
      pieces.push(tatami(id, from, L.cellMm, DEFAULT_ANGLE_DEG, own));
      fields.push({
        id,
        block: "A",
        centre: { x: from.x + L.cellMm / 2, y: from.y + L.cellMm / 2 },
        size: { widthMm: L.cellMm, heightMm: L.cellMm },
        place: gridPlace("A", row, column),
        text: `Reihenabstand ${de(rowSpacingMm, 2)} mm, Stichlänge ${de(stitchLengthMm, 1)} mm`,
        values: { rowSpacingMm, stitchLengthMm },
      });
    }
  }

  // Block B: satin, the rows by zigzag spacing, the columns by width — underlay and pull by the width.
  for (let row = 0; row < 3; row++) {
    for (let column = 0; column < 3; column++) {
      const id = `B${row * 3 + column + 1}`;
      const spacingMm = satinSpacings[row]!;
      const widthMm = satinWidths[column]!;
      const centreX = L.satinFromX + column * pitch + L.cellMm / 2;
      const top = L.marginMm + row * pitch;
      const own: Preset = { ...preset, satinSpacingMm: spacingMm };
      const pull = satinPullCompMm(widthMm, own);
      const columnId = `${id}-0`;
      pieces.push({
        svg:
          `<g id="${id}"><path id="${columnId}" d="${satinColumnD(satinColumn(columnId, centreX, top, widthMm))}" ` +
          `style="fill:none;stroke:${colour};stroke-width:${STROKE_WIDTH}"` +
          `${inkAttrs({ ...satinColumnAttributes(widthMm, own), ...tieAttributes(), ...TRIM })}/></g>`,
        box: {
          minX: centreX - widthMm / 2 - pull,
          minY: top,
          maxX: centreX + widthMm / 2 + pull,
          maxY: top + L.cellMm,
        },
      });
      const underlay = widthMm < UNDERLAY_WIDE_FROM_MM ? "Mittellauf" : "Kontur + Zickzack";
      fields.push({
        id,
        block: "B",
        centre: { x: centreX, y: top + L.cellMm / 2 },
        size: { widthMm, heightMm: L.cellMm },
        place: gridPlace("B", row, column),
        text:
          `Breite ${de(widthMm, 1)} mm, Abstand ${de(spacingMm, 2)} mm ` +
          `(Zugausgleich ${de(pull, 2)} mm je Seite, ${underlay})`,
        values: { widthMm, spacingMm },
      });
    }
  }

  // Block C: pull compensation. Rows level (0°): the width is along the rows, the height across them.
  const compensations: { pullMm: number; pushMm: number; presets?: true }[] = [
    { pullMm: 0, pushMm: 0 },
    { pullMm: 0.2, pushMm: 0 },
    { pullMm: preset.pullCompMm, pushMm: preset.pushCompMm, presets: true },
    { pullMm: 0.3, pushMm: 0 },
  ];
  compensations.forEach(({ pullMm, pushMm, presets }, k) => {
    const id = `C${k + 1}`;
    const from = { x: L.marginMm + k * (L.compSquareMm + L.gapMm), y: L.compFromY };
    const own: Preset = { ...preset, pullCompMm: pullMm, pushCompMm: pushMm };
    pieces.push(tatami(id, from, L.compSquareMm, 0, own));
    fields.push({
      id,
      block: "C",
      centre: { x: from.x + L.compSquareMm / 2, y: from.y + L.compSquareMm / 2 },
      size: { widthMm: L.compSquareMm, heightMm: L.compSquareMm },
      place: `Block C, ${k + 1}. von links`,
      text: `Zug ${de(pullMm, 2)} mm, Schub ${de(pushMm, 2)} mm${presets ? " (Werte des Presets)" : ""}`,
      values: { pullMm, pushMm },
    });
  });

  // The page: the margin round block B's last cell and block C's squares.
  const widthMm = L.satinFromX + 3 * L.cellMm + 2 * L.gapMm + L.marginMm;
  const heightMm = L.compFromY + L.compSquareMm + L.marginMm;
  const svg =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkstitch="http://inkstitch.org/namespace" ` +
    `width="${num(widthMm)}mm" height="${num(heightMm)}mm" viewBox="0 0 ${num(widthMm)} ${num(heightMm)}">` +
    `<metadata><inkstitch:min_stitch_len_mm>${num(INKSTITCH_MIN_STITCH_MM)}</inkstitch:min_stitch_len_mm></metadata>\n` +
    `${pieces.map((p) => p.svg).join("\n")}\n` +
    `</svg>\n`;
  return {
    svg,
    fields,
    widthMm,
    heightMm,
    bounds: pieces.map((p) => p.box).reduce(unionBox),
    colour,
  };
}

// ---------------------------------------------------------------------------
// The legend
// ---------------------------------------------------------------------------

/** What the stitched DST came to, for the legend's head. */
export type TestPatternRun = {
  /** The name of the run, as in the file names. */
  name: string;
  stitches: number;
  /** Thread cuts. */
  trims: number;
  /** The size of the stitched DST, mm. */
  widthMm: number;
  heightMm: number;
};

/** The fields of one block, typed by it. */
const blockFields = <B extends TestPatternBlock>(
  fields: TestPatternField[],
  id: B,
): Extract<TestPatternField, { block: B }>[] =>
  fields.filter((f): f is Extract<TestPatternField, { block: B }> => f.block === id);

/** The values of a block's rows or columns as the legend lists them: "0,19 / 0,21 / 0,24". */
const listed = (values: number[], min: number): string => values.map((v) => de(v, min)).join(" / ");

/**
 * The legend that goes with the stitched piece, as a text file (the colour sequence file's kind, spec
 * §13.4): the head with size, stitches, cuts and preset, under it the backing or topping the preset
 * names where it names one and whether the pattern stands in the hoop; then block by block how it reads,
 * and every field with its id, its place and its values — for block C, how to measure it and a line to
 * write the measures on.
 */
export function testPatternLegend(
  pattern: TestPattern,
  preset: Preset,
  run: TestPatternRun,
): string {
  const L = TEST_PATTERN_LAYOUT;
  const lines: string[] = [
    `${run.name}   ${de(run.widthMm, 1)} × ${de(run.heightMm, 1)} mm   ${thousands(run.stitches)} Stiche   ` +
      `${run.trims} Fadenschnitte   Preset ${preset.id}`,
  ];
  if (preset.stabilizer !== undefined) lines.push(`  Stoffhinweis: ${preset.stabilizer}`);
  const hoop = fitHoop(
    { widthMm: run.widthMm, heightMm: run.heightMm },
    machineOfPreset(preset.id),
  );
  const hoopSize = `${de(hoop.machine.hoopWMm, 0)} × ${de(hoop.machine.hoopHMm, 0)} mm (${hoop.machine.label})`;
  lines.push(
    `  Rahmen: ${
      !hoop.fits
        ? `passt NICHT in ${hoopSize}, auch gedreht nicht`
        : hoop.turned
          ? `passt nur um 90° gedreht in ${hoopSize}`
          : `passt in ${hoopSize}`
    }`,
  );
  lines.push(
    "",
    "Parameter-Matrix: je Feld ein Wertepaar, alles andere wie im Preset. Mit Stoff, Vlies oder Topping,",
    "Garn und Nadel des Auftrags sticken; nach jedem Feld schneidet die Maschine den Faden.",
    `Lagemarke: ein Winkel (zwei Schenkel à ${de(L.markLegMm, 0)} mm) in der Ecke oben links. Das Stück beim Ablesen so`,
    "halten, dass der Winkel oben links liegt.",
  );

  const a = blockFields(pattern.fields, "A");
  const b = blockFields(pattern.fields, "B");
  // Reading order: a block's first column is the fields 0 to 2, its first row the fields 0, 3 and 6.
  const rowsOf = <F>(fs: F[]): F[] => [fs[0]!, fs[3]!, fs[6]!];
  const columnsOf = <F>(fs: F[]): F[] => [fs[0]!, fs[1]!, fs[2]!];
  const fieldLines = (id: TestPatternBlock, extra = ""): string[] =>
    pattern.fields
      .filter((f) => f.block === id)
      .map((f) => `  ${f.id}  ${f.place.padEnd(22)} ${f.text}${extra}`);

  const underlay: Record<Preset["fillUnderlay"]["fill"], string> = {
    none: "keine",
    single: "einfach",
    double: "doppelt",
  };
  lines.push(
    "",
    `Block A — Tatami: Quadrate ${de(L.cellMm, 0)} × ${de(L.cellMm, 0)} mm, Reihen unter ${de(DEFAULT_ANGLE_DEG, 0)}° (von links oben nach rechts unten)`,
    `  Zeilen (von oben nach unten): Reihenabstand ${listed(
      rowsOf(a).map((f) => f.values.rowSpacingMm),
      2,
    )} mm`,
    `  Spalten (von links nach rechts): Stichlänge ${listed(
      columnsOf(a).map((f) => f.values.stitchLengthMm),
      1,
    )} mm`,
    `  Zug ${de(preset.pullCompMm, 2)} mm, Schub ${de(preset.pushCompMm, 2)} mm und Unterlage (${underlay[preset.fillUnderlay.fill]}) wie im Preset.`,
    ...fieldLines("A"),
  );
  lines.push(
    "",
    `Block B — Satin: Säulen senkrecht, ${de(L.cellMm, 0)} mm lang`,
    `  Zeilen (von oben nach unten): Zickzack-Abstand ${listed(
      rowsOf(b).map((f) => f.values.spacingMm),
      2,
    )} mm (Spitze zu Spitze)`,
    `  Spalten (von links nach rechts): Breite ${listed(
      columnsOf(b).map((f) => f.values.widthMm),
      1,
    )} mm`,
    `  Unterlage und Zugausgleich folgen der Breite (ab ${de(UNDERLAY_WIDE_FROM_MM, 1)} mm Kontur + Zickzack, darunter Mittellauf).`,
    ...fieldLines("B"),
  );
  lines.push(
    "",
    `Block C — Zugausgleich: Quadrate ${de(L.compSquareMm, 0)} × ${de(L.compSquareMm, 0)} mm, Reihen waagerecht (0°)`,
    `  Breite (entlang der Reihen) und Höhe (quer) mit dem Messschieber messen; Soll ${de(L.compSquareMm, 1)} × ${de(L.compSquareMm, 1)} mm.`,
    ...fieldLines("C", "   gemessen: Breite ______ mm, Höhe ______ mm"),
  );
  lines.push("", "Bestes Feld (eintragen)", "  Tatami ____   Satin ____   Zugausgleich ____");
  return `${lines.join("\n")}\n`;
}
