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
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  analyze,
  buildInkstitchTemplate,
  buildReworkSvg,
  CONNECT_DEFAULTS,
  importShapes,
  initEngine,
  INKSTITCH_MIN_STITCH_MM,
  INKSTITCH_SVG_VERSION,
  inkstitchSvgVersion,
  PRESETS,
  tatamiAttributes,
  untrimmedJumps,
} from "@texma-stitch/engine";
import { stickWithHead } from "../packages/engine/test/fixtures/bands.js";
import { circle, polygonOf, rect } from "../packages/engine/test/fixtures/shapes.js";
import { readDst, unitsToMm } from "@texma-stitch/formats";
import { GLYPHS } from "../packages/engine/test/fixtures/glyphs.js";
import { isInkstitchReady, runInkstitch } from "../tools/inkstitch-lauf.mjs";
import { settleUpdate, writeRework } from "../tools/nacharbeit.mjs";
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
    "Aussparen (§4.2 Regel 1, Option satinCutout): die Stiche des Grunds meiden die spätere Satinform und laufen bis an ihre Kante — im Standard aus",
    async () => {
      // A blue tatami ground with a red satin bar over it (3 x 20 mm, centred). With the option
      // `satinCutout` the template cuts the bar's place out of the ground, 0.2 mm short of its edge;
      // Ink/Stitch has to stitch the ground round the hole. Spec §4.2 withdrew this on 29.09.2026, so
      // by default — with the knockdown or without it — the ground runs through under the bar. The bar
      // sits in the middle of the ground, so where the DST puts its origin does not matter: the box
      // of the ground stitches gives the centre.
      await initEngine();
      const ground = {
        kind: "area" as const,
        id: "ground",
        polygon: polygonOf(rect(0, 0, 40, 30)),
        color: "#1f3a93",
        attrs: {},
        trimAfter: "auto" as const,
      };
      const bar = {
        kind: "area" as const,
        id: "bar",
        polygon: polygonOf(rect(18.5, 5, 3, 20)),
        color: "#c8102e",
        attrs: {},
        trimAfter: "auto" as const,
      };
      const flat = { ...PRESETS.pique, pullCompMm: 0, pushCompMm: 0 };
      const dir = mkdtempSync(join(tmpdir(), "texma-aussparen-"));
      try {
        const groundStitches = async (name: string, options: { [k: string]: boolean }) => {
          const template = buildInkstitchTemplate([ground, bar], flat, {
            widthMm: 40,
            heightMm: 30,
            ...options,
          });
          expect(template.objects.map((o) => [o.shapeId, o.kind])).toEqual([
            ["ground", "tatami"],
            ["bar", "satin"],
          ]);
          const svg = join(dir, `${name}.svg`);
          writeFileSync(svg, template.svg);
          const r = await runInkstitch({ extension: "output", options: { format: "dst" }, svg });
          expect(r.stderr.trim()).toBe("");
          const all = unitsToMm(readDst(new Uint8Array(r.stdout)).stitches);
          // The ground comes first: everything up to the colour change.
          const change = all.findIndex((s) => s.cmd === "color");
          expect(change).toBeGreaterThan(0);
          const own = all.slice(0, change).filter((s) => s.cmd === "stitch");
          const xs = own.map((s) => s.x);
          const ys = own.map((s) => s.y);
          const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
          const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
          return {
            satin: all.slice(change).filter((s) => s.cmd === "stitch").length,
            // Relative to the centre of the ground: the bar covers |x| < 1.5, |y| < 10.
            rel: own.map((s) => ({ x: s.x - cx, y: s.y - cy })),
          };
        };
        const [plain, standard, spared] = await Promise.all([
          groundStitches("plain", {}),
          groundStitches("standard", { knockdown: true }),
          groundStitches("spared", { knockdown: true, satinCutout: true }),
        ]);
        // The hole is 2.6 x 19.6 mm; 0.4 mm short of its edge, so the DST's rounding cannot matter.
        const inside = (p: { x: number; y: number }) => Math.abs(p.x) < 0.9 && Math.abs(p.y) < 9.4;
        // Within reach of the bar's edge (1.0 to 1.6 mm from its axis): the ground runs up to it.
        const atEdge = (p: { x: number; y: number }) =>
          Math.abs(p.x) > 1.0 && Math.abs(p.x) < 1.6 && Math.abs(p.y) < 9.4;
        expect(plain.rel.filter(inside).length).toBeGreaterThan(10);
        // The standard knockdown does not spare: the same stitches as without it.
        expect(standard.rel).toEqual(plain.rel);
        expect(spared.rel.filter(inside)).toHaveLength(0);
        expect(spared.rel.filter(atEdge).length).toBeGreaterThan(5);
        // The satin is the same either way.
        expect(spared.satin).toBe(plain.satin);
        expect(standard.satin).toBe(plain.satin);
        expect(spared.satin).toBeGreaterThan(0);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
    SUBPROCESS_TIMEOUT_MS * 2,
  );

  it(
    'Satin: pull_compensation_mm "a b" wirkt je Rail — die Stiche der einen Rail wandern nach außen, die der anderen nicht',
    async () => {
      // Ink/Stitch takes two values for the two rails of a column (`get_split_mm_param_as_px`); spec
      // §7.8.3 leans on it. A vertical bar of 3 mm: the outermost stitches lie at the rails plus the
      // compensation of their side. Rail A is the first sub-path of the template's path. The DST is
      // centred on its stitches, so two small squares far out to both sides hold the frame still.
      await initEngine();
      const shape = (id: string, x: number, y: number, w: number, h: number, color: string) => ({
        kind: "area" as const,
        id,
        polygon: polygonOf(rect(x, y, w, h)),
        color,
        attrs: {},
        trimAfter: "auto" as const,
      });
      const template = buildInkstitchTemplate(
        [
          shape("left", 1, 5, 3, 3, "#1f3a93"),
          shape("bar", 18.5, 5, 3, 20, "#c8102e"),
          shape("right", 36, 5, 3, 3, "#1f3a93"),
        ],
        PRESETS.pique,
        { widthMm: 40, heightMm: 30, railPullBySide: false },
      );
      const d = /<path id="bar-0" d="([^"]*)"/.exec(template.svg)![1]!;
      const [railA, railB] = d.split(" M ").map((s) => s.replace(/^M /, ""));
      const meanX = (rail: string): number => {
        const xs = [...rail.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((m) => Number(m[1]));
        return xs.reduce((s, x) => s + x, 0) / xs.length;
      };
      const aIsLeft = meanX(railA!) < meanX(railB!);

      const dir = mkdtempSync(join(tmpdir(), "texma-railpull-"));
      try {
        const extent = async (pull: string): Promise<{ left: number; right: number }> => {
          const svg = join(dir, `p${pull.replace(/\W/g, "_")}.svg`);
          writeFileSync(
            svg,
            template.svg.replace(
              /inkstitch:pull_compensation_mm="[^"]*"/,
              `inkstitch:pull_compensation_mm="${pull}"`,
            ),
          );
          const r = await runInkstitch({ extension: "output", options: { format: "dst" }, svg });
          expect(r.stderr.trim()).toBe("");
          // The bar is at the middle of the frame, the squares 16 mm and more from it.
          const xs = unitsToMm(readDst(new Uint8Array(r.stdout)).stitches)
            .filter((s) => s.cmd === "stitch" && Math.abs(s.x) < 8)
            .map((s) => s.x);
          return { left: Math.min(...xs), right: Math.max(...xs) };
        };
        const [none, a, b, both] = await Promise.all([
          extent("0 0"),
          extent("0.4 0"),
          extent("0 0.4"),
          extent("0.4 0.4"),
        ]);
        // Left moves by the value of the left rail, right by the value of the right one.
        const near = (v: number, w: number): void => expect(Math.abs(v - w)).toBeLessThan(0.15);
        const [leftOnly, rightOnly] = aIsLeft ? [a, b] : [b, a];
        near(leftOnly.left, none.left - 0.4);
        near(leftOnly.right, none.right);
        near(rightOnly.left, none.left);
        near(rightOnly.right, none.right + 0.4);
        near(both.left, none.left - 0.4);
        near(both.right, none.right + 0.4);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
    SUBPROCESS_TIMEOUT_MS * 2,
  );

  it(
    "Zugausgleich je Rail (§7.8.3): der Stoffspalt zwischen Rot und Gold bleibt in der DST offen — symmetrisch wächst er zu",
    async () => {
      // The Hofbräu cap in miniature (cap preset): a red stroke of 2.4 mm and, 0.53 mm below it, a gold
      // line of 0.75 mm. Symmetric, red pulls 0.29 mm and gold 0.2 mm into the gap (0.04 mm left);
      // per rail, the two rails that face each other stay as drawn. The gap in the DST is the distance
      // between the stitches of the two colours, so where the DST puts its origin does not matter.
      await initEngine();
      const shape = (id: string, y: number, h: number, color: string) => ({
        kind: "area" as const,
        id,
        polygon: polygonOf(rect(0, y, 30, h)),
        color,
        attrs: {},
        trimAfter: "auto" as const,
      });
      const shapes = [shape("gold", 2.93, 0.75, "#d1b35a"), shape("red", 0, 2.4, "#d2060d")];
      const dir = mkdtempSync(join(tmpdir(), "texma-luecke-"));
      try {
        const gap = async (railPullBySide: boolean): Promise<number> => {
          const template = buildInkstitchTemplate(shapes, PRESETS.cap, {
            widthMm: 40,
            heightMm: 10,
            railPullBySide,
          });
          const svg = join(dir, `g${railPullBySide}.svg`);
          writeFileSync(svg, template.svg);
          const r = await runInkstitch({ extension: "output", options: { format: "dst" }, svg });
          expect(r.stderr.trim()).toBe("");
          const all = unitsToMm(readDst(new Uint8Array(r.stdout)).stitches);
          const change = all.findIndex((s) => s.cmd === "color");
          expect(change).toBeGreaterThan(0);
          const ys = (part: typeof all): number[] =>
            part.filter((s) => s.cmd === "stitch").map((s) => s.y);
          const first = ys(all.slice(0, change));
          const second = ys(all.slice(change));
          // Two blocks one above the other: the gap is between the near edges.
          return Math.max(
            Math.min(...second) - Math.max(...first),
            Math.min(...first) - Math.max(...second),
          );
        };
        const [symmetric, perRail] = await Promise.all([gap(false), gap(true)]);
        expect(perRail).toBeGreaterThan(0.43);
        expect(perRail).toBeLessThan(0.63);
        expect(symmetric).toBeLessThan(0.2);
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
  // -------------------------------------------------------------------------------------------
  // The Nacharbeit file (spec §13.4)
  // -------------------------------------------------------------------------------------------

  /**
   * A small logo for the Nacharbeit: a black tatami, a gold T (satin) with a second gold block beside its
   * stem, a red tatami — on a page of 40 x 20 mm whose viewBox starts at (100, 200), the way a PDF export
   * does (the importer takes the origin off, spec §13.4). Own shapes, not a customer logo.
   */
  const NACHARBEIT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="40mm" height="20mm" viewBox="100 200 80 40">
    <path id="schwarz" d="M 104 204 L 136 204 L 136 224 L 104 224 Z" fill="#101010"/>
    <path id="T" d="M 150 204 L 178 204 L 178 212 L 168 212 L 168 236 L 160 236 L 160 212 L 150 212 Z" fill="#d1b35a"/>
    <path id="gold2" d="M 172 224 L 178 224 L 178 234 L 172 234 Z" fill="#d1b35a"/>
    <path id="rot" d="M 104 228 L 136 228 L 136 238 L 104 238 Z" fill="#d2060d"/>
  </svg>`;

  /** Runs `fn` with an Ink/Stitch stitch-plan cache of its own: nothing a run left behind can answer for the next. */
  async function inFreshCache<T>(dir: string, name: string, fn: () => Promise<T>): Promise<T> {
    const before = process.env.XDG_CONFIG_HOME;
    process.env.XDG_CONFIG_HOME = join(dir, `xdg-${name}`);
    try {
      return await fn();
    } finally {
      if (before === undefined) delete process.env.XDG_CONFIG_HOME;
      else process.env.XDG_CONFIG_HOME = before;
    }
  }

  const dstOf = async (svg: string): Promise<Buffer> =>
    (await runInkstitch({ extension: "output", options: { format: "dst" }, svg })).stdout;

  /** One block per colour, split at the colour changes (what tools/inkstitch.mjs does with the DST). */
  function blocksOf(stitches: ReturnType<typeof unitsToMm>) {
    const blocks: { objectId: string; threadIndex: number; stitches: typeof stitches }[] = [];
    let current = { objectId: "ink-0", threadIndex: 0, stitches: [] as typeof stitches };
    blocks.push(current);
    for (const s of stitches) {
      current.stitches.push(s);
      if (s.cmd === "color") {
        current = { objectId: `ink-${blocks.length}`, threadIndex: blocks.length, stitches: [] };
        blocks.push(current);
      }
    }
    return blocks.filter((b) => b.stitches.length > 0);
  }

  /** The chain `pnpm inkstitch` runs: source, template, auto_satin, jump_to_trim, DST. */
  async function logoRun(dir: string) {
    await initEngine();
    const imported = importShapes(NACHARBEIT_SVG);
    const template = buildInkstitchTemplate(imported.shapes, PRESETS.pique, {
      widthMm: imported.widthMm,
      heightMm: imported.heightMm,
      order: "colour",
      knockdown: true,
    });
    const templatePath = join(dir, "logo.inkstitch.svg");
    writeFileSync(templatePath, template.svg);
    let current = templatePath;
    for (const ids of template.satinRuns) {
      const routed = await runInkstitch({
        extension: "auto_satin",
        ids,
        options: { preserve_order: true, trim: true },
        svg: current,
      });
      current = join(dir, "logo.routed.svg");
      writeFileSync(current, routed.stdout);
    }
    const trimmed = await runInkstitch({
      extension: "jump_to_trim",
      options: { "minimum-jump-length": CONNECT_DEFAULTS.jumpTrimMm },
      svg: current,
    });
    const trimmedPath = join(dir, "logo.trimmed.svg");
    writeFileSync(trimmedPath, trimmed.stdout);
    const dst = await inFreshCache(dir, "lauf", () => dstOf(trimmedPath));
    const stitches = unitsToMm(readDst(new Uint8Array(dst)).stitches);
    const blocks = blocksOf(stitches);
    return { imported, template, templatePath, trimmedPath, dst, stitches, blocks };
  }

  it(
    "Nacharbeit-Datei: dieselbe DST Byte für Byte, trägt die Dokumentversion, Ink/Stitch ändert sie beim Öffnen nicht — und eine eingeblendete Prüfstellen-Ebene stickt nichts",
    async () => {
      const dir = mkdtempSync(join(tmpdir(), "texma-nacharbeit-"));
      try {
        const run = await logoRun(dir);
        expect(run.template.satinRuns.length).toBeGreaterThan(0); // the T: routed, with its trim command
        expect(run.blocks).toHaveLength(3);

        const report = await writeRework({
          name: "logo",
          outDir: dir,
          svgPath: run.trimmedPath,
          templatePath: run.templatePath,
          sourceSvg: NACHARBEIT_SVG,
          presetName: "pique",
          stitches: run.stitches,
          blocks: run.blocks,
          stats: analyze(run.blocks).stats,
          railPull: run.template.railPull,
          underlay: run.template.underlay,
          fallbacks: [],
          narrowLines: [],
          smoothed: [],
        });
        expect(report.skipped).toBeUndefined();

        // The four files, and what each says.
        for (const file of Object.values(report.files))
          expect(existsSync(file as string)).toBe(true);
        const svgPath = report.files.svg as string;
        const nacharbeit = readFileSync(svgPath, "utf8");
        expect(report.rework.layers.map((l: { name: string }) => l.name)).toEqual([
          "Schwarz",
          "Gold",
          "Rot",
        ]);
        expect(readFileSync(report.files.farbfolge as string, "utf8")).toMatch(
          /^logo {3}\d+,\d x \d+,\d mm {3}[\d.]+ Stiche {3}Preset pique\n {2}1 Schwarz {2}#101010\n {2}2 Gold {5}#D1B35A\n {2}3 Rot {6}#D2060D\n$/,
        );
        expect(
          readFileSync(report.files.pes as string)
            .subarray(0, 4)
            .toString("latin1"),
        ).toBe("#PES");
        expect([...readFileSync(report.files.png as string).subarray(1, 4)]).toEqual([
          0x50, 0x4e, 0x47,
        ]);

        // (a) The document names its version, and (c) Ink/Stitch has nothing to update on opening it.
        expect(inkstitchSvgVersion(nacharbeit)).toBe(INKSTITCH_SVG_VERSION);
        expect(report.update).toMatchObject({ checked: true, changed: false, settled: true });
        // Asked on its own, with the extension that loads, updates and saves only what it changed.
        const again = await runInkstitch({
          extension: "update_svg",
          options: { "update-from": INKSTITCH_SVG_VERSION },
          svg: svgPath,
        });
        expect(again.stdout.length).toBe(0);

        // (b) The same DST, byte for byte — each from a cache of its own.
        const fromFile = await inFreshCache(dir, "nacharbeit", () => dstOf(svgPath));
        expect(fromFile.equals(run.dst)).toBe(true);

        // The layer of check points is hidden and ignored: shown, it still stitches nothing. Without the
        // parameter that ignores it, shown, its circle would be stitched (the control). The logo is clean
        // and has no check points of its own, so the layer gets one here.
        const hidden = 'style="display:none" inkstitch:ignore_object="true"';
        expect(nacharbeit).toContain(hidden);
        const withSpot = buildReworkSvg(readFileSync(run.trimmedPath, "utf8"), {
          widthMm: 40,
          heightMm: 20,
          spots: [{ xMm: 20, yMm: 10, art: "Test", text: "ein Kreis" }],
        }).svg;
        expect(withSpot).toContain(hidden);
        writeFileSync(join(dir, "hidden.svg"), withSpot);
        const shown = join(dir, "shown.svg");
        writeFileSync(
          shown,
          withSpot.replace(hidden, 'style="display:inline" inkstitch:ignore_object="true"'),
        );
        const control = join(dir, "control.svg");
        writeFileSync(control, withSpot.replace(hidden, 'style="display:inline"'));
        const [hiddenDst, shownDst, controlDst] = await Promise.all([
          inFreshCache(dir, "hidden", () => dstOf(join(dir, "hidden.svg"))),
          inFreshCache(dir, "shown", () => dstOf(shown)),
          inFreshCache(dir, "control", () => dstOf(control)),
        ]);
        expect(hiddenDst.equals(run.dst)).toBe(true);
        expect(shownDst.equals(run.dst)).toBe(true);
        expect(controlDst.equals(run.dst)).toBe(false);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
    SUBPROCESS_TIMEOUT_MS * 6,
  );

  it(
    "Nacharbeit-Datei aus einem Dokument ohne Version (keine Effekt-Erweiterung lief): Ink/Stitch aktualisiert es einmal, die Datei trägt Version 4 und gibt dieselbe DST wie die Vorlage",
    async () => {
      // The template itself has no inkstitch_svg_version: Ink/Stitch takes it for a legacy document and
      // updates it on opening (lib/update.py) — headless the wx stub answers the question, Inkscape asks.
      const dir = mkdtempSync(join(tmpdir(), "texma-nacharbeit-v0-"));
      try {
        await initEngine();
        const imported = importShapes(NACHARBEIT_SVG);
        const template = buildInkstitchTemplate(imported.shapes, PRESETS.pique, {
          widthMm: imported.widthMm,
          heightMm: imported.heightMm,
          order: "colour",
          knockdown: true,
        });
        const templatePath = join(dir, "v0.svg");
        writeFileSync(templatePath, template.svg);
        expect(inkstitchSvgVersion(template.svg)).toBeUndefined();
        const direct = await inFreshCache(dir, "direkt", () => dstOf(templatePath));

        // The module reports it and does not make a version up.
        const built = buildReworkSvg(template.svg, {
          widthMm: imported.widthMm,
          heightMm: imported.heightMm,
        });
        expect(built.notes.map((n) => n.kind)).toContain("svg-version");
        expect(inkstitchSvgVersion(built.svg)).toBeUndefined();

        // The tool lets Ink/Stitch open it: the updated document replaces the file.
        const file = join(dir, "v0.nacharbeit.svg");
        writeFileSync(file, built.svg);
        const settled = await settleUpdate(file);
        expect(settled).toMatchObject({ checked: true, changed: true, settled: true });
        expect(inkstitchSvgVersion(readFileSync(file, "utf8"))).toBe(INKSTITCH_SVG_VERSION);

        const fromFile = await inFreshCache(dir, "datei", () => dstOf(file));
        expect(fromFile.equals(direct)).toBe(true);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
    SUBPROCESS_TIMEOUT_MS * 4,
  );

  it(
    "Mindeststichlänge (§11): die Vorlage setzt 0,4 mm, Ink/Stitch lässt die kürzeren Stiche weg — mit seinem Standard 0,1 mm stehen sie in der DST",
    async () => {
      // A tatami disc of 30 mm: its rows end on a round edge wherever it falls, so the last stitch of
      // a row is any length from nothing to a full stitch, and some come out shorter than 0.4 mm at
      // Ink/Stitch's own default (where the short stitches of the logos came from, measured on
      // STUTTGART 91 mm on 02.10.2026). The second file differs from the template in that one value
      // of the metadata only, so whatever the two DSTs differ in is the minimum stitch length.
      await initEngine();
      const disc = {
        kind: "area" as const,
        id: "scheibe",
        polygon: polygonOf(circle(16, 16, 15, 128)),
        color: "#1f3a93",
        attrs: {},
        trimAfter: "auto" as const,
      };
      const template = buildInkstitchTemplate([disc], PRESETS.pique, { widthMm: 32, heightMm: 32 });
      expect(template.objects.map((o) => o.kind)).toEqual(["tatami"]);
      const setting = `<inkstitch:min_stitch_len_mm>${INKSTITCH_MIN_STITCH_MM}</inkstitch:min_stitch_len_mm>`;
      expect(template.svg).toContain(setting);
      const dir = mkdtempSync(join(tmpdir(), "texma-kurzstich-"));
      try {
        const withSetting = join(dir, "vorlage.svg");
        const withDefault = join(dir, "standard.svg");
        writeFileSync(withSetting, template.svg);
        writeFileSync(
          withDefault,
          template.svg.replace(
            setting,
            "<inkstitch:min_stitch_len_mm>0.1</inkstitch:min_stitch_len_mm>",
          ),
        );
        // One after the other: each run gets a cache of its own through the environment.
        const set = await inFreshCache(dir, "vorlage", () => dstOf(withSetting));
        const plain = await inFreshCache(dir, "standard", () => dstOf(withDefault));
        /** Needle moves between two stitches shorter than `belowMm` (a move after a jump, trim or colour change does not count, Ink/Stitch never drops those). */
        const shortMoves = (dst: Buffer, belowMm: number): number => {
          const st = unitsToMm(readDst(new Uint8Array(dst)).stitches);
          let n = 0;
          for (let i = 1; i < st.length; i++) {
            const a = st[i - 1]!;
            const b = st[i]!;
            if (
              a.cmd === "stitch" &&
              b.cmd === "stitch" &&
              Math.hypot(b.x - a.x, b.y - a.y) < belowMm
            )
              n++;
          }
          return n;
        };
        const counts = {
          setUnder03: shortMoves(set, 0.3),
          setUnder04: shortMoves(set, 0.4),
          plainUnder03: shortMoves(plain, 0.3),
          plainUnder04: shortMoves(plain, 0.4),
        };
        // Measured 02.10.2026: 10 under 0.3 mm and 19 under 0.4 mm at the default, 0 and 7 with the
        // template's value. The 7 went in a little over 0.4 mm and came out shorter on the DST's
        // 0.1-mm grid: each is 0.3 by 0.2 units, 0.36 mm, in the middle of the fill.
        // The fixture has short stitches at Ink/Stitch's default, or the test would prove nothing.
        expect(counts.plainUnder03).toBeGreaterThan(5);
        expect(counts.plainUnder04).toBeGreaterThan(10);
        expect(counts.setUnder03).toBe(0);
        expect(counts.setUnder04).toBeLessThan(counts.plainUnder04);
        expect(set.length).toBeLessThan(plain.length);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
    SUBPROCESS_TIMEOUT_MS * 2,
  );

  it(
    "geteilte Form (§7.8.7): der Stab wird Satin quer zu seiner Achse, der Kopf bleibt Tatami — dieselbe Form als ein Tatami stickt ihn in 45°-Reihen",
    async () => {
      // A lollipop: a head of 12 mm and a stick of 2.4 mm and 40 mm along the x axis. The width makes
      // the whole shape tatami (the head carries the median); the split sets the stick as satin.
      await initEngine();
      const lolli = {
        kind: "area" as const,
        id: "lolli",
        polygon: stickWithHead(),
        color: "#d25c1c",
        attrs: {},
        trimAfter: "auto" as const,
      };
      const page = { widthMm: 60, heightMm: 24 };
      const dir = mkdtempSync(join(tmpdir(), "texma-teilung-"));
      try {
        // The shape is centred on the head, so move the page's origin to it: both templates are
        // written from the same polygon, the one with the split and the one without.
        const run = async (name: string, splitBands: boolean) => {
          const shifted = {
            ...lolli,
            polygon: {
              outer: lolli.polygon.outer.map((p) => ({ x: p.x + 10, y: p.y + 12 })),
              holes: [],
            },
          };
          const template = buildInkstitchTemplate([shifted], PRESETS.pique, {
            ...page,
            splitBands,
          });
          const svg = join(dir, `${name}.svg`);
          writeFileSync(svg, template.svg);
          const dst = await inFreshCache(dir, name, () => dstOf(svg));
          const stitches = unitsToMm(readDst(new Uint8Array(dst)).stitches).filter(
            (s) => s.cmd === "stitch",
          );
          return { template, stitches };
        };
        const split = await run("geteilt", true);
        const whole = await run("ganz", false);
        expect(split.template.objects.map((o) => [o.id, o.kind])).toEqual([
          ["lolli_bulk", "tatami"],
          ["lolli_band0", "satin"],
        ]);
        expect(whole.template.objects.map((o) => o.kind)).toEqual(["tatami"]);

        // Its stitches lie across the stick (steps along y), not at 45°: in the stretch of the stick
        // beyond the head, the long steps of the split run are near vertical, those of the whole one are
        // diagonal. The DST is centred on the shape's box: the stick starts about 18 mm from its left
        // end (head rim at 16 mm, page 4 to 56 mm), so take what lies 6 mm beyond the rim.
        const slope = (st: typeof split.stitches): number => {
          const minX = Math.min(...st.map((s) => s.x));
          const ratios: number[] = [];
          for (let i = 1; i < st.length; i++) {
            const a = st[i - 1]!;
            const b = st[i]!;
            const len = Math.hypot(b.x - a.x, b.y - a.y);
            if (len < 1.5 || a.x < minX + 24 || b.x < minX + 24) continue;
            ratios.push(Math.abs(b.x - a.x) / Math.max(Math.abs(b.y - a.y), 1e-9));
          }
          ratios.sort((p, q) => p - q);
          expect(ratios.length).toBeGreaterThan(20);
          return ratios[Math.floor(ratios.length / 2)]!;
        };
        expect(slope(split.stitches)).toBeLessThan(0.3);
        expect(slope(whole.stitches)).toBeGreaterThan(0.6);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
    SUBPROCESS_TIMEOUT_MS * 2,
  );
});
