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
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildInkstitchTemplate,
  CONNECT_DEFAULTS,
  initEngine,
  PRESETS,
  tatamiAttributes,
  untrimmedJumps,
} from "@texma-stitch/engine";
import { polygonOf, rect } from "../packages/engine/test/fixtures/shapes.js";
import { readDst, unitsToMm } from "@texma-stitch/formats";
import { GLYPHS } from "../packages/engine/test/fixtures/glyphs.js";
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
    "eigene Satinsäulen: Vorlage aus dem Fixture-„T“, auto_satin, output ergibt Satin in Buchstabengröße",
    async () => {
      // The chain `pnpm inkstitch` runs (tools/inkstitch.mjs), on one fixture
      // letter: our own native satin columns (packages/engine/src/inkstitch/
      // template.ts), routed by auto_satin, stitched by output.
      await initEngine();
      const letter = GLYPHS.T!;
      const template = buildInkstitchTemplate(
        [
          {
            kind: "area",
            id: "T",
            polygon: letter,
            color: "#1f3a93",
            attrs: {},
            trimAfter: "auto",
          },
        ],
        PRESETS.pique,
        { widthMm: 12, heightMm: 12 },
      );
      expect(template.objects).toMatchObject([{ kind: "satin", columnIds: ["T-0", "T-1"] }]);
      expect(template.satinRuns).toEqual([["T-0", "T-1"]]);

      const dir = mkdtempSync(join(tmpdir(), "texma-satin-"));
      try {
        const templatePath = join(dir, "t.svg");
        writeFileSync(templatePath, template.svg);
        const routed = await runInkstitch({
          extension: "auto_satin",
          ids: template.satinRuns[0]!,
          options: { preserve_order: true, trim: true },
          svg: templatePath,
        });
        expect(routed.stderr.trim()).toBe("");
        const routedPath = join(dir, "t.routed.svg");
        writeFileSync(routedPath, routed.stdout);

        const { stdout, stderr } = await runInkstitch({
          extension: "output",
          options: { format: "dst" },
          svg: routedPath,
        });
        expect(stderr.trim()).toBe("");
        const mm = unitsToMm(readDst(new Uint8Array(stdout)).stitches);
        const box = referenceBbox(mm);
        const xs = letter.outer.map((p) => p.x);
        const ys = letter.outer.map((p) => p.y);
        // Pull compensation widens each side by up to its lid (spec §7.2).
        const slack = BBOX_TOLERANCE_MM + 2 * PRESETS.pique.pullCompMaxMm;
        expect(box.w).toBeGreaterThan(Math.max(...xs) - Math.min(...xs) - BBOX_TOLERANCE_MM);
        expect(box.w).toBeLessThan(Math.max(...xs) - Math.min(...xs) + slack);
        expect(box.h).toBeGreaterThan(Math.max(...ys) - Math.min(...ys) - BBOX_TOLERANCE_MM);
        expect(box.h).toBeLessThan(Math.max(...ys) - Math.min(...ys) + slack);
        // A satin, not a fill: at 0.38 mm zigzag spacing a 10 mm T is a few hundred stitches.
        const stitches = mm.filter((st) => st.cmd === "stitch").length;
        expect(stitches).toBeGreaterThan(80);
        expect(stitches).toBeLessThan(600);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
    SUBPROCESS_TIMEOUT_MS,
  );

  it(
    "jump_to_trim: ein Sprung ab 5 mm bekommt einen Fadenschnitt, ein kurzer nicht — readDst zählt ihn",
    async () => {
      // Three squares of one colour: b lies 2 mm from a, c 20 mm from b. Without
      // `inkstitch:trim_after` Ink/Stitch ties off, jumps and ties on again — the thread
      // lies on the fabric; with it the DST carries a trim (spec §10.2).
      await initEngine();
      const square = (id: string, x: number) => ({
        kind: "area" as const,
        id,
        polygon: polygonOf(rect(x, 1, 10, 10)),
        color: "#1f3a93",
        attrs: {},
        trimAfter: "auto" as const,
      });
      const template = buildInkstitchTemplate(
        [square("a", 0), square("b", 12), square("c", 42)],
        PRESETS.pique,
        { widthMm: 60, heightMm: 12 },
      );
      const dir = mkdtempSync(join(tmpdir(), "texma-trim-"));
      try {
        const templatePath = join(dir, "t.svg");
        writeFileSync(templatePath, template.svg);
        const dst = async (svg: string) =>
          unitsToMm(
            readDst(
              new Uint8Array(
                (await runInkstitch({ extension: "output", options: { format: "dst" }, svg }))
                  .stdout,
              ),
            ).stitches,
          );

        // As it comes: no cut, one jump of over 5 mm lies on the fabric.
        const plain = await dst(templatePath);
        expect(plain.filter((st) => st.cmd === "trim")).toHaveLength(0);
        expect(untrimmedJumps(plain, CONNECT_DEFAULTS.jumpTrimMm).count).toBe(1);

        // With the extension: exactly the long jump is cut, and readDst counts it.
        const cut = await runInkstitch({
          extension: "jump_to_trim",
          options: { "minimum-jump-length": CONNECT_DEFAULTS.jumpTrimMm },
          svg: templatePath,
        });
        expect(cut.stderr.trim()).toBe("");
        expect(cut.stdout.toString("utf8").match(/inkstitch:trim_after="True"/g)).toHaveLength(1);
        const cutPath = join(dir, "t.trimmed.svg");
        writeFileSync(cutPath, cut.stdout);
        const trimmed = await dst(cutPath);
        expect(trimmed.filter((st) => st.cmd === "trim")).toHaveLength(1);
        expect(untrimmedJumps(trimmed, CONNECT_DEFAULTS.jumpTrimMm).count).toBe(0);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
    SUBPROCESS_TIMEOUT_MS * 2,
  );

  it(
    "Tatami: jedes Attribut der Vorlage wirkt — mit anderem Wert ändert sich die DST, ein falscher Name ändert nichts",
    async () => {
      // Ink/Stitch ignores an attribute it does not know without a word (a misspelt name reads
      // like a default), so each name in tatamiAttributes is set to another value and the
      // DST has to change. A 30 x 20 mm rectangle; the control is a misspelt name.
      const attrs = tatamiAttributes(PRESETS.pique, 45);
      const other: Record<string, string> = {
        row_spacing_mm: "0.6",
        max_stitch_length_mm: "2",
        staggers: "1",
        angle: "-15",
        fill_underlay: "false",
        fill_underlay_angle: "0",
        fill_underlay_row_spacing_mm: "1",
        fill_underlay_inset_mm: "1.5",
        fill_underlay_max_stitch_length_mm: "1.5",
      };
      // Nothing set that is not tried, nothing tried that is not set.
      expect(Object.keys(other).sort()).toEqual(Object.keys(attrs).sort());

      const dir = mkdtempSync(join(tmpdir(), "texma-attr-"));
      try {
        const dstHash = async (name: string, values: Record<string, string>): Promise<string> => {
          const svg = join(dir, `${name}.svg`);
          const set = Object.entries(values)
            .map(([k, v]) => `inkstitch:${k}="${v}"`)
            .join(" ");
          writeFileSync(
            svg,
            `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkstitch="http://inkstitch.org/namespace" ` +
              `width="40mm" height="30mm" viewBox="0 0 40 30"><path id="r" d="M 5,5 L 35,5 L 35,25 L 5,25 Z" ` +
              `style="fill:#1f3a93;stroke:none" ${set}/></svg>`,
          );
          const r = await runInkstitch({ extension: "output", options: { format: "dst" }, svg });
          expect(r.stderr.trim()).toBe("");
          return createHash("sha1").update(r.stdout).digest("hex");
        };
        const runs: [string, Record<string, string>][] = [
          ["basis", attrs],
          ["falscher-name", { ...attrs, max_stitch_lenght_mm: "2" }],
          ...Object.entries(other).map(([k, v]): [string, Record<string, string>] => [
            k,
            { ...attrs, [k]: v },
          ]),
        ];
        const hashes = new Map<string, string>();
        // Four at a time: each run is mostly Ink/Stitch's own start.
        for (let i = 0; i < runs.length; i += 4) {
          await Promise.all(
            runs.slice(i, i + 4).map(async ([name, values]) => {
              hashes.set(name, await dstHash(name, values));
            }),
          );
        }
        expect(hashes.get("falscher-name")).toBe(hashes.get("basis"));
        for (const name of Object.keys(other)) {
          expect(hashes.get(name), `${name} ändert die DST nicht`).not.toBe(hashes.get("basis"));
        }
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
    SUBPROCESS_TIMEOUT_MS * 8,
  );

  it(
    "Tatami: die Stichrichtung ist die von fill.ts — 45° zeigt im Bild nach rechts unten, −30° nach rechts oben",
    async () => {
      // fill.ts turns clockwise on the y-down page, Ink/Stitch counter-clockwise; the template
      // writes the sign round (tatamiAttributes). The rows of a rectangle are its longest stitches.
      const dir = mkdtempSync(join(tmpdir(), "texma-angle-"));
      try {
        const direction = async (angleDeg: number): Promise<number> => {
          const svg = join(dir, `a${angleDeg}.svg`);
          const set = Object.entries(tatamiAttributes(PRESETS.pique, angleDeg))
            .map(([k, v]) => `inkstitch:${k}="${v}"`)
            .join(" ");
          writeFileSync(
            svg,
            `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkstitch="http://inkstitch.org/namespace" ` +
              `width="40mm" height="30mm" viewBox="0 0 40 30"><path id="r" d="M 5,5 L 35,5 L 35,25 L 5,25 Z" ` +
              `style="fill:#1f3a93;stroke:none" ${set}/></svg>`,
          );
          const { stdout } = await runInkstitch({
            extension: "output",
            options: { format: "dst" },
            svg,
          });
          const st = unitsToMm(readDst(new Uint8Array(stdout)).stitches).filter(
            (p) => p.cmd === "stitch",
          );
          const bins = new Map<number, number>();
          for (let i = 1; i < st.length; i++) {
            const dx = st[i]!.x - st[i - 1]!.x;
            const dy = st[i]!.y - st[i - 1]!.y;
            if (Math.hypot(dx, dy) < 2.5) continue;
            const a = ((((Math.atan2(dy, dx) * 180) / Math.PI) % 180) + 180) % 180;
            const bin = (Math.round(a / 5) * 5) % 180;
            bins.set(bin, (bins.get(bin) ?? 0) + 1);
          }
          return [...bins.entries()].sort((x, y) => y[1] - x[1])[0]![0];
        };
        const [down, up] = await Promise.all([direction(45), direction(-30)]);
        expect(down).toBe(45);
        // 150 degrees in the image are 30 degrees up to the right.
        expect(up).toBe(150);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
    SUBPROCESS_TIMEOUT_MS * 2,
  );

  it(
    "Tatami: Zug und Schub stehen in der Umrisslinie der Vorlage und kommen in der DST an — länger entlang der Reihen, schmaler quer dazu",
    async () => {
      // The compensation of spec §8.1.1 is not an Ink/Stitch attribute (tatami.ts says why), so the
      // stitches have to show it: a 30 x 20 mm rectangle, rows at 45 degrees. A pull of 1 mm along
      // the rows widens the box of the stitches by about 0.7 mm either side, a push of 1 mm across
      // them takes about 0.7 mm off.
      await initEngine();
      const shape = {
        kind: "area" as const,
        id: "r",
        polygon: polygonOf(rect(5, 5, 30, 20)),
        color: "#1f3a93",
        attrs: {},
        trimAfter: "auto" as const,
      };
      const dir = mkdtempSync(join(tmpdir(), "texma-comp-"));
      try {
        const width = async (name: string, pullCompMm: number, pushCompMm: number) => {
          const template = buildInkstitchTemplate(
            [shape],
            { ...PRESETS.pique, pullCompMm, pushCompMm },
            { widthMm: 40, heightMm: 30 },
          );
          expect(template.svg).not.toContain("pull_compensation");
          const svg = join(dir, `${name}.svg`);
          writeFileSync(svg, template.svg);
          const r = await runInkstitch({ extension: "output", options: { format: "dst" }, svg });
          expect(r.stderr.trim()).toBe("");
          const xs = unitsToMm(readDst(new Uint8Array(r.stdout)).stitches)
            .filter((p) => p.cmd === "stitch")
            .map((p) => p.x);
          return Math.max(...xs) - Math.min(...xs);
        };
        const [flat, pulled, pushed] = await Promise.all([
          width("flat", 0, 0),
          width("pulled", 1, 0),
          width("pushed", 0, 1),
        ]);
        expect(pulled - flat).toBeGreaterThan(1);
        expect(flat - pushed).toBeGreaterThan(1);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
    SUBPROCESS_TIMEOUT_MS * 2,
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
