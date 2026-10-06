/**
 * The command line of the test pattern (tools/testmuster.mjs): what a call means and what the script
 * prints. No Ink/Stitch here — the stitching is in `test/testmuster.smoke.test.ts`
 * (RUN_INKSTITCH_TESTS=1), the pattern itself in `packages/engine/src/inkstitch/testmuster.test.ts`.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { buildTestPattern, initEngine, PRESETS } from "@texma-stitch/engine";
import { LIST_FLAGS, parseArgs, reportLines, UsageError, USAGE } from "../tools/testmuster.mjs";

beforeAll(async () => {
  await initEngine();
});

describe("parseArgs", () => {
  it("takes the preset alone: the pattern then has the values of the matrix", () => {
    expect(parseArgs(["pique"])).toEqual({ presetId: "pique", options: {} });
    expect(parseArgs(["fleece"]).presetId).toBe("fleece");
  });

  it("reads the four lists of three numbers, with a dot as the decimal mark", () => {
    expect(
      parseArgs([
        "jersey",
        "--reihenabstand",
        "0.2,0.22,0.25",
        "--stichlaenge",
        "3,4.5,5",
        "--satinbreite",
        "1.2,2,3",
        "--satinabstand",
        "0.3,0.36,0.44",
      ]),
    ).toEqual({
      presetId: "jersey",
      options: {
        rowSpacingsMm: [0.2, 0.22, 0.25],
        stitchLengthsMm: [3, 4.5, 5],
        satinWidthsMm: [1.2, 2, 3],
        satinSpacingsMm: [0.3, 0.36, 0.44],
      },
    });
    expect(Object.keys(LIST_FLAGS)).toEqual([
      "--reihenabstand",
      "--stichlaenge",
      "--satinbreite",
      "--satinabstand",
    ]);
  });

  it("lets a switch come before the preset, and takes one list without the others", () => {
    expect(parseArgs(["--satinabstand", "0.3,0.4,0.5", "cap"])).toEqual({
      presetId: "cap",
      options: { satinSpacingsMm: [0.3, 0.4, 0.5] },
    });
  });

  it("refuses a call without a preset, with an unknown one, or with two", () => {
    expect(() => parseArgs([])).toThrow(UsageError);
    expect(() => parseArgs([])).toThrow("Es fehlt das Preset");
    expect(() => parseArgs(["--reihenabstand", "0.2,0.2,0.2"])).toThrow("Es fehlt das Preset");
    expect(() => parseArgs(["wolle"])).toThrow('Unbekanntes Preset "wolle"');
    expect(() => parseArgs(["wolle"])).toThrow(Object.keys(PRESETS).join(", "));
    expect(() => parseArgs(["pique", "jersey"])).toThrow("Nur ein Preset");
  });

  it("refuses a switch it does not know, a switch twice, and a switch without its list", () => {
    expect(() => parseArgs(["pique", "--breite", "120"])).toThrow("Unbekannte Option --breite");
    expect(() => parseArgs(["pique", "--reihenabstand=0.2,0.2,0.2"])).toThrow(
      "Unbekannte Option --reihenabstand=0.2,0.2,0.2",
    );
    expect(() => parseArgs(["pique", "--stichlaenge", "3,4,5", "--stichlaenge", "2,3,4"])).toThrow(
      "--stichlaenge steht zweimal da",
    );
    expect(() => parseArgs(["pique", "--stichlaenge"])).toThrow(UsageError);
    expect(() => parseArgs(["pique", "--stichlaenge", "--satinbreite", "1,2,3"])).toThrow(
      "--stichlaenge braucht drei Zahlen über 0",
    );
  });

  it("refuses a list that is not three numbers over 0 — and says what it was given", () => {
    const bad = (value: string): void =>
      expect(() => parseArgs(["pique", "--reihenabstand", value])).toThrow(
        `--reihenabstand braucht drei Zahlen über 0, mit Komma getrennt und mit Punkt als Dezimalzeichen (z. B. 0.19,0.21,0.24), nicht "${value}"`,
      );
    bad("0.2,0.22");
    bad("0.2,0.22,0.25,0.3");
    bad("0.2,0,0.25");
    bad("0.2,-0.1,0.25");
    bad("0.2,abc,0.25");
    bad("0.2,,0.25");
    // The German decimal comma is no list: 0,19,0,21,0,24 are six numbers.
    bad("0,19,0,21,0,24");
  });

  it("holds a satin width to the 15 mm of its cell", () => {
    expect(parseArgs(["pique", "--satinbreite", "1,2,15"]).options.satinWidthsMm).toEqual([
      1, 2, 15,
    ]);
    expect(() => parseArgs(["pique", "--satinbreite", "1,2,16"])).toThrow(
      "--satinbreite braucht drei Zahlen über 0 und bis 15",
    );
    // Other lists have no such limit.
    expect(parseArgs(["pique", "--stichlaenge", "3,4,16"]).options.stitchLengthsMm).toEqual([
      3, 4, 16,
    ]);
  });

  it("is a UsageError, so that the script prints the usage under the message", () => {
    expect(USAGE).toContain("pnpm testmuster <preset>");
    expect(USAGE).toContain(`Presets: ${Object.keys(PRESETS).join(", ")}`);
    try {
      parseArgs([]);
    } catch (err) {
      expect(err).toBeInstanceOf(UsageError);
      expect(err).toBeInstanceOf(Error);
    }
  });
});

describe("reportLines", () => {
  /** What `writeTestPattern` hands back, with the numbers of a real run of the pique pattern. */
  const run = (extra: object = {}) => ({
    name: "testmuster-pique",
    presetId: "pique",
    preset: PRESETS.pique,
    pattern: buildTestPattern(PRESETS.pique),
    paths: {
      svg: "/work/out/testmuster-pique.svg",
      dst: "/work/out/testmuster-pique.dst",
      png: "/work/out/testmuster-pique.png",
      legend: "/work/out/testmuster-pique.legende.txt",
    },
    stats: { stitches: 8077, jumps: 48, trims: 23, bboxMm: { w: 105.8, h: 80 } },
    warnings: [],
    stderr: "",
    inkstitchMs: 17700,
    ...extra,
  });

  it("names the files relative to where the script runs, then stitches, cuts, jumps, size and time", () => {
    const lines = reportLines(run(), { base: "/work" });
    expect(lines).toContain("Preset      pique (Piqué)");
    expect(lines).toContain(
      "Felder      22 (Block A 9, Block B 9, Block C 4) und die Lagemarke oben links",
    );
    expect(lines).toContain("Vorlage     out/testmuster-pique.svg");
    expect(lines).toContain("DST         out/testmuster-pique.dst");
    expect(lines).toContain("Vorschau    out/testmuster-pique.png");
    expect(lines).toContain("Legende     out/testmuster-pique.legende.txt");
    expect(lines).toContain("  Stiche                 8077");
    expect(lines).toContain("  Schnitte               23 (die Lagemarke und 22 Felder)");
    expect(lines).toContain("  Sprünge                48");
    expect(lines).toContain("  Größe                  105.8 × 80.0 mm");
    expect(lines).toContain("  Laufzeit (Ink/Stitch)  17.7 s");
    expect(lines).toContain("Warnungen   keine (eigene Prüfung, analyze())");
    expect(lines).toContain("Ink/Stitch  keine Hinweise (stderr leer)");
  });

  it("lists every warning with its severity, code and message, and what Ink/Stitch said on stderr", () => {
    const lines = reportLines(
      run({
        warnings: [
          {
            severity: "error",
            code: "OBJECT_OUTSIDE_HOOP",
            message:
              "Design 106 × 80 mm does not fit the hoop 130 × 60 mm, not even turned by 90°.",
          },
        ],
        stderr: "Ink/Stitch: something\nsecond line\n",
      }),
      { base: "/work" },
    );
    expect(lines).toContain("Warnungen (eigene Prüfung, analyze())");
    expect(lines).toContain(
      "  error OBJECT_OUTSIDE_HOOP: Design 106 × 80 mm does not fit the hoop 130 × 60 mm, not even turned by 90°.",
    );
    expect(lines).toContain("Ink/Stitch-Hinweise (stderr)");
    expect(lines).toContain("  Ink/Stitch: something");
    expect(lines).toContain("  second line");
  });
});
