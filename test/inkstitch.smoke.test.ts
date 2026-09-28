/**
 * Smoke test for the Ink/Stitch subprocess integration
 * (docs/adr/0001-inkstitch-als-stich-engine.md, decision 28.09.2026: Ink/Stitch generates
 * the stitches, TEXMA Stitch prepares the template and checks the result).
 *
 * Skipped unless RUN_INKSTITCH_TESTS=1: it needs inkstitch/setup.sh to have
 * run (a separate Python process, GPL-3.0, never part of this repo, see
 * inkstitch/README.md) and each case costs several seconds purely from
 * Ink/Stitch's own import overhead, independent of how small the input is.
 *
 *   RUN_INKSTITCH_TESTS=1 pnpm vitest run test/inkstitch.smoke.test.ts
 *
 * Fixtures are our own tiny templates under test/fixtures/inkstitch/ -- never
 * a customer logo (customer files stay out of the repo).
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readDst, unitsToMm } from "@texma-stitch/formats";
import { isInkstitchReady, runInkstitch } from "../tools/inkstitch-lauf.mjs";
import { BBOX_TOLERANCE_MM, referenceBbox } from "./golden.js";

const RUN = process.env.RUN_INKSTITCH_TESTS === "1";
const SUBPROCESS_TIMEOUT_MS = 60_000; // Ink/Stitch's own import chain alone is ~9 s.

const fixturesDir = resolve(dirname(fileURLToPath(import.meta.url)), "fixtures", "inkstitch");

describe.skipIf(!RUN)("Ink/Stitch-Subprozess (RUN_INKSTITCH_TESTS=1)", () => {
  it("ist eingerichtet", () => {
    // A cheap, always-on check inside the gated suite: if inkstitch/setup.sh
    // has not run, fail loudly here with the exact reason instead of every
    // case below timing out on a spawn ENOENT (CLAUDE.md: keine stillen
    // Reparaturen).
    expect(
      isInkstitchReady(),
      "inkstitch/setup.sh wurde nicht ausgeführt (oder INKSTITCH_HOME/INKSTITCH_SRC/INKSTITCH_PYTHON zeigen ins Leere)",
    ).toBe(true);
  });

  it(
    "output --format=dst: Füllung + Laufstich in zwei Farben ergibt eine plausible DST",
    async () => {
      const svg = resolve(fixturesDir, "two-colors.svg");
      const { stdout, stderr } = await runInkstitch({
        extension: "output",
        options: { format: "dst" },
        svg,
      });

      expect(stderr.trim()).toBe("");

      const { header, stitches } = readDst(new Uint8Array(stdout));
      const mm = unitsToMm(stitches);
      const box = referenceBbox(mm);

      expect(mm.filter((s) => s.cmd === "stitch").length).toBeGreaterThan(0);
      // Nominal size from the fixture's own width/height: 20 x 15 mm (spec §15 tolerance).
      expect(Math.abs(box.w - 20)).toBeLessThanOrEqual(BBOX_TOLERANCE_MM);
      expect(Math.abs(box.h - 15)).toBeLessThanOrEqual(BBOX_TOLERANCE_MM);
      // One fill in colour A, one running-stitch line in colour B: exactly one change.
      expect(header.colorChanges).toBe(1);
      expect(mm.filter((s) => s.cmd === "color").length).toBe(1);
    },
    SUBPROCESS_TIMEOUT_MS,
  );

  it(
    "fill_to_satin: Fläche + zwei Sprossen ergibt eine Satin-Spalte",
    async () => {
      const svg = resolve(fixturesDir, "fill-with-rungs.svg");
      const { stdout, stderr } = await runInkstitch({
        extension: "fill_to_satin",
        ids: ["flaeche", "sprosse1", "sprosse2"],
        svg,
      });

      expect(stderr.trim()).toBe("");
      expect(stdout.toString("utf8")).toContain('inkstitch:satin_column="True"');
    },
    SUBPROCESS_TIMEOUT_MS,
  );

  it(
    "fill_to_satin ohne Sprossen: die sonst nur im GUI-Dialog gezeigte Meldung steht auf stderr",
    async () => {
      // Same fixture, only the fill selected -- CLAUDE.md "keine stillen
      // Reparaturen": inkstitch/run.py patches lib.gui.abort_message.AbortMessageApp
      // (a wx dialog nothing can show headless) to print instead of vanishing.
      const svg = resolve(fixturesDir, "fill-with-rungs.svg");
      const { stderr } = await runInkstitch({
        extension: "fill_to_satin",
        ids: ["flaeche"],
        svg,
      });

      expect(stderr).toContain("Ink/Stitch:");
      expect(stderr).toContain("No rungs selected");
    },
    SUBPROCESS_TIMEOUT_MS,
  );
});
