/**
 * Smoke test of the parameter matrix (tools/testmuster.mjs, packages/engine/src/inkstitch/testmuster.ts):
 * the pattern stitched by Ink/Stitch and read back from the DST, the way the script writes it.
 *
 * Skipped unless RUN_INKSTITCH_TESTS=1, like test/inkstitch.smoke.test.ts: it needs inkstitch/setup.sh
 * to have run (a separate Python process, never part of this repo, see inkstitch/README.md), and a run
 * takes some twenty seconds of Ink/Stitch.
 *
 *   RUN_INKSTITCH_TESTS=1 pnpm vitest run test/testmuster.smoke.test.ts
 *
 * What it shows: a thread cut after every field and after the mark (nothing runs across the pattern),
 * the extent of the DST is the layout's, every stitch lies in a field or the mark, the rows of block A
 * stand closer where the row spacing is smaller and the stitches are shorter where the stitch length
 * is, and block C's squares are as wide and as high as pull and push make them.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { TestPattern, TestPatternField } from "@texma-stitch/engine";
import { buildTestPattern, initEngine, PRESETS } from "@texma-stitch/engine";
import { readDst, unitsToMm } from "@texma-stitch/formats";
import { isInkstitchReady } from "../tools/inkstitch-lauf.mjs";
import { writeTestPattern } from "../tools/testmuster.mjs";
import { BBOX_TOLERANCE_MM } from "./golden.js";

const RUN = process.env.RUN_INKSTITCH_TESTS === "1";
const SUBPROCESS_TIMEOUT_MS = 60_000; // Ink/Stitch's own import chain alone is ~9 s.

type Pt = { x: number; y: number };

/** The area a field's stitches lie in: the field and the half of the gap to the next one (1.5 mm). */
const regionOf = (f: TestPatternField): { x0: number; x1: number; y0: number; y1: number } => ({
  x0: f.centre.x - f.size.widthMm / 2 - 1.4,
  x1: f.centre.x + f.size.widthMm / 2 + 1.4,
  y0: f.centre.y - f.size.heightMm / 2 - 1.4,
  y1: f.centre.y + f.size.heightMm / 2 + 1.4,
});
const within = (p: Pt, r: { x0: number; x1: number; y0: number; y1: number }): boolean =>
  p.x >= r.x0 && p.x <= r.x1 && p.y >= r.y0 && p.y <= r.y1;
/** The mark: two legs of 5 mm along the top and the left edge of the page, in the margin round block A. */
const inMark = (p: Pt): boolean =>
  within(p, { x0: -1.4, x1: 6.4, y0: -1.4, y1: 6.4 }) && (p.x <= 1.5 || p.y <= 1.5);

/** The DST of a written pattern, in the page's coordinates. */
function readBack(dstPath: string, pattern: TestPattern) {
  const { header, stitches } = readDst(new Uint8Array(readFileSync(dstPath)));
  const mm = unitsToMm(stitches);
  const sewn = mm.filter((s) => s.cmd === "stitch");
  const xs = sewn.map((s) => s.x);
  const ys = sewn.map((s) => s.y);
  const box = {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
  // Ink/Stitch puts the middle of the design on the origin: the pattern's own middle is where it goes.
  const dx = (pattern.bounds.minX + pattern.bounds.maxX) / 2 - (box.minX + box.maxX) / 2;
  const dy = (pattern.bounds.minY + pattern.bounds.maxY) / 2 - (box.minY + box.maxY) / 2;
  const onPage = (s: Pt): Pt => ({ x: s.x + dx, y: s.y + dy });
  return {
    header,
    box,
    widthMm: box.maxX - box.minX,
    heightMm: box.maxY - box.minY,
    /** Every stitch, in order, on the page — the other commands left out. */
    stitches: sewn.map(onPage),
    /** Where each thread cut lies on the page. */
    trims: mm.filter((s) => s.cmd === "trim").map(onPage),
    /** Consecutive stitches as pairs, for the direction of the rows. */
    steps: mm.flatMap((s, i) => {
      const prev = mm[i - 1];
      return s.cmd === "stitch" && prev?.cmd === "stitch"
        ? [[onPage(prev), onPage(s)] as const]
        : [];
    }),
  };
}

describe.skipIf(!RUN)("Testmuster, von Ink/Stitch gestickt (RUN_INKSTITCH_TESTS=1)", () => {
  it("ist eingerichtet", () => {
    // A cheap, always-on check inside the gated suite: fail loudly here with the exact reason instead of
    // every case below timing out (CLAUDE.md: keine stillen Reparaturen).
    expect(
      isInkstitchReady(),
      "inkstitch/setup.sh wurde nicht ausgeführt (oder INKSTITCH_HOME/INKSTITCH_SRC/INKSTITCH_PYTHON zeigen ins Leere)",
    ).toBe(true);
  });

  /** Writes the pattern of a preset the way `pnpm testmuster` does, into a directory of its own. */
  async function stitched(presetId: keyof typeof PRESETS) {
    await initEngine();
    const dir = mkdtempSync(join(tmpdir(), `texma-testmuster-${presetId}-`));
    try {
      const result = await writeTestPattern({ presetId, outDir: dir });
      const pattern = buildTestPattern(PRESETS[presetId]);
      expect(result.pattern.svg).toBe(pattern.svg);
      const back = readBack(result.paths.dst, pattern);
      const png = readFileSync(result.paths.png);
      const legend = readFileSync(result.paths.legend, "utf8");
      const files = Object.values(result.paths).map((p) => existsSync(p));
      return { result, pattern, back, png, legend, files };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  /** The stitches of each field, by id. */
  const countsOf = (back: ReturnType<typeof readBack>, pattern: TestPattern) =>
    new Map(
      pattern.fields.map((f) => {
        const r = regionOf(f);
        return [f.id, back.stitches.filter((p) => within(p, r))] as const;
      }),
    );

  it(
    "pique: ein Fadenschnitt nach jedem Feld, die Ausdehnung der Lage, dichtere Zeile mehr Einstiche, Zug und Schub in den Quadraten",
    async () => {
      const { result, pattern, back, png, legend, files } = await stitched("pique");

      // The files of the script, and Ink/Stitch had nothing to say.
      expect(files).toEqual([true, true, true, true]);
      expect(Array.from(png.subarray(1, 4))).toEqual([0x50, 0x4e, 0x47]); // "PNG"
      expect(result.stderr.trim()).toBe("");
      expect(result.warnings).toEqual([]);
      // One colour: no colour change.
      expect(back.header.colorChanges).toBe(0);

      // A thread cut after every field and after the mark: 23 in all, one in each of them.
      expect(back.trims).toHaveLength(pattern.fields.length + 1);
      for (const f of pattern.fields) {
        const r = regionOf(f);
        expect(
          back.trims.filter((t) => within(t, r)),
          `Schnitte in ${f.id}`,
        ).toHaveLength(1);
      }
      expect(back.trims.filter(inMark)).toHaveLength(1);
      expect(result.stats.trims).toBe(23);

      // The extent is the layout's, within the tolerance of spec §15 (the DST rounds to 0.1 mm).
      const boundsW = pattern.bounds.maxX - pattern.bounds.minX;
      const boundsH = pattern.bounds.maxY - pattern.bounds.minY;
      expect(Math.abs(back.widthMm - boundsW)).toBeLessThanOrEqual(BBOX_TOLERANCE_MM);
      expect(Math.abs(back.heightMm - boundsH)).toBeLessThanOrEqual(BBOX_TOLERANCE_MM);
      expect(result.stats.bboxMm.w).toBeCloseTo(back.widthMm, 6);

      // Every stitch lies in a field or the mark, and every field is stitched.
      const fields = countsOf(back, pattern);
      const inFields = [...fields.values()].reduce((n, s) => n + s.length, 0);
      expect(back.stitches.filter(inMark).length).toBeGreaterThan(3);
      expect(back.stitches.filter(inMark).length + inFields).toBe(back.stitches.length);
      for (const [id, stitches] of fields) expect(stitches.length, id).toBeGreaterThan(50);

      // Block A: the denser row has the more needle penetrations, in every column — and the shorter
      // stitch length the more, in every row. Row spacing 0.19 against 0.24 mm: about a fifth more.
      const n = (id: string): number => fields.get(id)!.length;
      for (const column of [0, 1, 2]) {
        const [dense, middle, loose] = [0, 1, 2].map((row) => n(`A${row * 3 + column + 1}`));
        expect(dense, `Spalte ${column + 1}`).toBeGreaterThan(middle!);
        expect(middle, `Spalte ${column + 1}`).toBeGreaterThan(loose!);
        expect(dense! / loose!, `Spalte ${column + 1}`).toBeGreaterThan(1.1);
        expect(dense! / loose!, `Spalte ${column + 1}`).toBeLessThan(1.4);
      }
      for (const row of [0, 1, 2]) {
        const [short, middle, long] = [0, 1, 2].map((column) => n(`A${row * 3 + column + 1}`));
        expect(short, `Zeile ${row + 1}`).toBeGreaterThan(middle!);
        expect(middle, `Zeile ${row + 1}`).toBeGreaterThan(long!);
      }

      // Block A's rows run from top left to bottom right, as the legend says (45° on the y-down page).
      const a5 = regionOf(pattern.fields.find((f) => f.id === "A5")!);
      const long = back.steps
        .filter(
          ([a, b]) => within(a, a5) && within(b, a5) && Math.hypot(b.x - a.x, b.y - a.y) > 2.5,
        )
        .map(([a, b]) => {
          const deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
          return ((((deg + 90) % 180) + 180) % 180) - 90; // a row has no sense: (-90, 90]
        });
      expect(long.length).toBeGreaterThan(100);
      expect(long.filter((deg) => Math.abs(deg - 45) <= 10).length / long.length).toBeGreaterThan(
        0.7,
      );

      // Block B: the closer zigzag has the more stitches, in every column.
      for (const column of [0, 1, 2]) {
        const dense = n(`B${column + 1}`);
        const loose = n(`B${6 + column + 1}`);
        expect(dense, `Säule ${column + 1}`).toBeGreaterThan(loose * 1.05);
      }

      // Block C: as wide as 20 mm plus the pull of both sides, as high as 20 mm less the push of both
      // (DST rounds to 0.1 mm and the outer rows lie a little inside the outline).
      for (const f of pattern.fields.filter((f) => f.block === "C")) {
        if (f.block !== "C") continue;
        const own = fields.get(f.id)!;
        const w = Math.max(...own.map((p) => p.x)) - Math.min(...own.map((p) => p.x));
        const h = Math.max(...own.map((p) => p.y)) - Math.min(...own.map((p) => p.y));
        expect(Math.abs(w - (20 + 2 * f.values.pullMm)), `Breite ${f.id}`).toBeLessThanOrEqual(0.2);
        expect(Math.abs(h - (20 - 2 * f.values.pushMm)), `Höhe ${f.id}`).toBeLessThanOrEqual(0.2);
      }
      // …so that the pull shows: the squares grow along the rows from C1 to C4.
      const width = (id: string): number => {
        const own = fields.get(id)!;
        return Math.max(...own.map((p) => p.x)) - Math.min(...own.map((p) => p.x));
      };
      expect(width("C1")).toBeLessThan(width("C2") - 0.2);
      expect(width("C2")).toBeLessThan(width("C4"));

      // The legend carries the run's numbers and every field.
      expect(legend.split("\n")[0]).toContain(`Preset pique`);
      expect(legend.split("\n")[0]).toContain("23 Fadenschnitte");
      for (const f of pattern.fields) expect(legend, f.id).toContain(`  ${f.id}  ${f.place}`);
    },
    SUBPROCESS_TIMEOUT_MS * 3,
  );

  it(
    "cap: auch hier ein Fadenschnitt je Feld — und das Muster ist größer als der Cap-Rahmen: Fehlermeldung und Legende sagen es",
    async () => {
      const { result, pattern, back, legend } = await stitched("cap");
      expect(back.trims).toHaveLength(pattern.fields.length + 1);
      for (const f of pattern.fields) {
        const r = regionOf(f);
        expect(
          back.trims.filter((t) => within(t, r)),
          `Schnitte in ${f.id}`,
        ).toHaveLength(1);
      }
      // 105.8 × 80 mm in a frame of 130 × 60 mm, not even turned: made all the same, and said twice.
      expect(
        result.warnings.map((w: { code: string; severity: string }) => [w.code, w.severity]),
      ).toEqual([["OBJECT_OUTSIDE_HOOP", "error"]]);
      expect(legend).toContain(
        "Rahmen: passt NICHT in 130 × 60 mm (Cap-Rahmen), auch gedreht nicht",
      );
    },
    SUBPROCESS_TIMEOUT_MS * 3,
  );
});
