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
});
