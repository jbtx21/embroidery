/**
 * The always-on half of the Ink/Stitch tooling tests: where the subprocess is
 * looked for, and how a value lands against the archive. Neither needs
 * Ink/Stitch itself (the gated smoke test in inkstitch.smoke.test.ts does).
 */
import { homedir } from "node:os";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ARCHIV, einordnen, zeile } from "../tools/archiv.mjs";
import { inkstitchHome, inkstitchPython, inkstitchSrc } from "../tools/inkstitch-lauf.mjs";

const KEYS = ["INKSTITCH_HOME", "INKSTITCH_SRC", "INKSTITCH_PYTHON"] as const;

describe("Ink/Stitch-Pfade (inkstitch/setup.sh, run.py und inkstitch-lauf.mjs lesen dieselben)", () => {
  const saved: Partial<Record<(typeof KEYS)[number], string>> = {};
  beforeEach(() => {
    for (const key of KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });
  afterEach(() => {
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it("ohne Umgebungsvariablen: ~/.cache/texma-stitch mit inkstitch/ und venv/", () => {
    const home = resolve(homedir(), ".cache", "texma-stitch");
    expect(inkstitchHome()).toBe(home);
    expect(inkstitchSrc()).toBe(resolve(home, "inkstitch"));
    expect(inkstitchPython()).toBe(resolve(home, "venv", "bin", "python3"));
  });

  it("INKSTITCH_HOME verschiebt Klon und venv gemeinsam", () => {
    process.env.INKSTITCH_HOME = "/opt/ink";
    expect(inkstitchSrc()).toBe("/opt/ink/inkstitch");
    expect(inkstitchPython()).toBe("/opt/ink/venv/bin/python3");
  });

  it("INKSTITCH_SRC und INKSTITCH_PYTHON übersteuern einzeln", () => {
    process.env.INKSTITCH_HOME = "/opt/ink";
    process.env.INKSTITCH_SRC = "/src/inkstitch";
    expect(inkstitchSrc()).toBe("/src/inkstitch");
    expect(inkstitchPython()).toBe("/opt/ink/venv/bin/python3");
    process.env.INKSTITCH_PYTHON = "/usr/bin/python3";
    expect(inkstitchPython()).toBe("/usr/bin/python3");
  });
});

describe("Einordnung gegen das Archiv", () => {
  it("ordnet an den Perzentilgrenzen ein, die Grenze selbst zählt noch zur Stufe", () => {
    const needle = ARCHIV.needleMax;
    expect(einordnen(4, needle)).toBe("unter p10");
    expect(einordnen(6, needle)).toBe("bis Median");
    expect(einordnen(7, needle)).toBe("bis p90");
    expect(einordnen(9, needle)).toBe("ÜBER ALLEM");
    expect(einordnen(20, ARCHIV.densityMax)).toBe("bis p90");
    expect(einordnen(30, ARCHIV.densityMax)).toBe("über p90");
  });

  it("zeile nennt Wert, Einheit, Archiv-Median und Einordnung", () => {
    const line = zeile("Nadelhäufung", "11", "je 0,2 mm", "needleMax");
    expect(line).toContain("Nadelhäufung");
    expect(line).toContain("11");
    expect(line).toContain("Archiv     6 (Median)");
    expect(line).toContain("ÜBER ALLEM");
  });
});
