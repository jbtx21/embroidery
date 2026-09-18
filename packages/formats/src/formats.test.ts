import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import {
  circle,
  initGeometry,
  polygonOf,
  pt,
  rect,
} from "@texma-stitch/geometry";
import type { StitchPlan } from "@texma-stitch/engine";
import {
  design,
  fillObjekt,
  planDesign,
  runningObjekt,
  satinObjekt,
} from "@texma-stitch/engine";
import {
  DST_HEADER_SIZE,
  encodeRecord,
  planToUnits,
  prepareUnits,
  readDst,
  roundHalfEven,
  toNeutralJson,
  fromNeutralJson,
  writeDst,
  writeDstFromUnits,
} from "./index.js";

const hier = dirname(fileURLToPath(import.meta.url));
const skript = resolve(hier, "../scripts/pyembroidery-dst.py");

/** Ist pyembroidery greifbar? Die Kreuzpruefung gehoert in die CI (Kap. 13.2). */
function pyembroideryDa(): boolean {
  try {
    execFileSync("python3", ["-c", "import pyembroidery"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const mitPy = pyembroideryDa();
if (!mitPy) {
  console.warn(
    "[formats] pyembroidery fehlt — die Kreuzpruefung aus Kap. 13.2 laeuft NICHT. In der CI ist das ein Fehler.",
  );
}

function pyembroideryDst(
  stitches: { x: number; y: number; cmd: string }[],
  label: string,
): Uint8Array {
  const eingabe = JSON.stringify({
    label,
    stitches: stitches.map((s) => [s.x, s.y, s.cmd]),
  });
  const out = execFileSync("python3", [skript], { input: eingabe, maxBuffer: 64 * 1024 * 1024 });
  return new Uint8Array(out);
}

beforeAll(async () => {
  await initGeometry();
});

const beispielPlan = (): StitchPlan =>
  planDesign(
    design([
      fillObjekt("f", polygonOf(rect(0, 0, 20, 12))),
      satinObjekt("s", [pt(30, 0), pt(30, 12)], [pt(34, 0), pt(34, 12)], { threadIndex: 1 }),
      runningObjekt("r", [pt(0, 20), pt(40, 20)], { threadIndex: 1 }),
    ]),
  );

describe("Rundung", () => {
  it("rundet die Haelfte zur geraden Zahl wie Python", () => {
    expect(roundHalfEven(2.5)).toBe(2);
    expect(roundHalfEven(3.5)).toBe(4);
    expect(roundHalfEven(-2.5)).toBe(-2);
    expect(roundHalfEven(-3.5)).toBe(-4);
    expect(roundHalfEven(2.4)).toBe(2);
    expect(roundHalfEven(2.6)).toBe(3);
  });
});

describe("DST-Datensaetze (Kap. 13.1)", () => {
  it("kodiert das Ende als 00 00 F3", () => {
    expect([...encodeRecord(0, 0, "end")]).toEqual([0x00, 0x00, 0xf3]);
  });

  it("kodiert den Farbwechsel als 00 00 C3", () => {
    expect([...encodeRecord(0, 0, "color")]).toEqual([0x00, 0x00, 0xc3]);
  });

  it("setzt das Sprungbit", () => {
    expect(encodeRecord(1, 0, "jump")[2]! & 0x80).toBe(0x80);
    expect(encodeRecord(1, 0, "stitch")[2]! & 0x80).toBe(0);
  });

  it("weist Deltas ueber dem Limit ab, statt sie still zu kappen", () => {
    expect(() => encodeRecord(122, 0, "stitch")).toThrow();
    expect(() => encodeRecord(0, -122, "stitch")).toThrow();
    expect(() => encodeRecord(121, 121, "stitch")).not.toThrow();
  });
});

describe("DST-Header", () => {
  it("ist 512 Byte lang und endet nach PD mit 0x1A", () => {
    const bytes = writeDstFromUnits(
      [
        { x: 0, y: 0, cmd: "stitch" },
        { x: 100, y: 0, cmd: "stitch" },
        { x: 100, y: 0, cmd: "end" },
      ],
      { label: "Probe" },
    );
    expect(bytes.length).toBeGreaterThan(DST_HEADER_SIZE);
    const kopf = new TextDecoder("latin1").decode(bytes.subarray(0, DST_HEADER_SIZE));
    expect(kopf.startsWith("LA:Probe           \r")).toBe(true);
    expect(kopf).toContain("ST:      3\r");
    expect(kopf).toContain("PD:******\r");
    expect(bytes[kopf.indexOf("PD:******\r") + 10]).toBe(0x1a);
  });
});

describe("DST-Roundtrip (Kap. 15)", () => {
  it("schreibt, liest und schreibt byte-identisch", () => {
    const plan = beispielPlan();
    const a = writeDst(plan, { label: "Roundtrip" });
    const gelesen = readDst(a);
    const b = writeDstFromUnits(gelesen.stitches, { label: "Roundtrip" });
    expect(Buffer.from(b).equals(Buffer.from(a))).toBe(true);
  });

  it("liest Kopfdaten und Stichzahl zurueck", () => {
    const plan = beispielPlan();
    const bytes = writeDst(plan, { label: "Kopf" });
    const gelesen = readDst(bytes);
    expect(gelesen.header.label).toBe("Kopf");
    expect(gelesen.header.records).toBe(prepareUnits(planToUnits(plan.blocks)).length);
    expect(gelesen.stitches.length).toBe(gelesen.header.records);
    expect(gelesen.header.colorChanges).toBe(plan.stats.colorChanges);
  });

  it("stellt die Koordinaten auf 0,1 mm genau wieder her", () => {
    const einheiten = planToUnits(beispielPlan().blocks);
    const gelesen = readDst(writeDstFromUnits(einheiten)).stitches;
    expect(gelesen).toHaveLength(einheiten.length);
    for (let i = 0; i < einheiten.length; i++) {
      expect(Math.abs(gelesen[i]!.x - einheiten[i]!.x)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(gelesen[i]!.y - einheiten[i]!.y)).toBeLessThanOrEqual(0.5);
    }
  });
});

describe.skipIf(!mitPy)("Kreuzpruefung gegen pyembroidery (Kap. 13.2)", () => {
  it("erzeugt byte-identische DST fuer einen einfachen Laufstich", () => {
    const stitches = [
      { x: 0, y: 0, cmd: "stitch" as const },
      { x: 25, y: 0, cmd: "stitch" as const },
      { x: 25, y: -35, cmd: "stitch" as const },
      { x: 25, y: -35, cmd: "end" as const },
    ];
    const ts = writeDstFromUnits(stitches, { label: "Lauf" });
    const py = pyembroideryDst(stitches, "Lauf");
    expect(Buffer.from(ts).equals(Buffer.from(py))).toBe(true);
  });

  it("erzeugt byte-identische DST mit Trim und Farbwechsel", () => {
    const stitches = [
      { x: 0, y: 0, cmd: "stitch" as const },
      { x: 50, y: 20, cmd: "stitch" as const },
      { x: 50, y: 20, cmd: "trim" as const },
      { x: 50, y: 20, cmd: "color" as const },
      { x: 150, y: 100, cmd: "jump" as const },
      { x: 160, y: 105, cmd: "stitch" as const },
      { x: 160, y: 105, cmd: "end" as const },
    ];
    const ts = writeDstFromUnits(stitches, { label: "Trim" });
    const py = pyembroideryDst(stitches, "Trim");
    expect(Buffer.from(ts).equals(Buffer.from(py))).toBe(true);
  });

  it("erzeugt byte-identische DST fuer einen vollen Stichplan", () => {
    const einheiten = prepareUnits(planToUnits(beispielPlan().blocks));
    expect(einheiten.length).toBeGreaterThan(400);
    const ts = writeDstFromUnits(einheiten, { label: "Plan" });
    const py = pyembroideryDst(einheiten, "Plan");
    expect(Buffer.from(ts).equals(Buffer.from(py))).toBe(true);
  });

  it("haelt auch bei krummen Koordinaten durch (halbe Einheiten)", () => {
    const einheiten = prepareUnits(
      planToUnits(planDesign(design([fillObjekt("f", polygonOf(circle(12.05, 9.15, 7.25)))])).blocks),
    );
    const ts = writeDstFromUnits(einheiten, { label: "Kreis" });
    const py = pyembroideryDst(einheiten, "Kreis");
    expect(Buffer.from(ts).equals(Buffer.from(py))).toBe(true);
  });
});

describe("prepareUnits", () => {
  it("zentriert das Motiv auf den Nullpunkt", () => {
    const vorbereitet = prepareUnits([
      { x: 100, y: 100, cmd: "stitch" },
      { x: 140, y: 160, cmd: "stitch" },
      { x: 140, y: 160, cmd: "end" },
    ]);
    const bewegungen = vorbereitet.filter((s) => s.cmd !== "end");
    const xs = bewegungen.map((s) => s.x);
    const ys = bewegungen.map((s) => s.y);
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(0, 6);
    expect((Math.min(...ys) + Math.max(...ys)) / 2).toBeCloseTo(0, 6);
  });

  it("faehrt den Weg vom Nullpunkt zum ersten Stich als Spruenge", () => {
    const vorbereitet = prepareUnits(
      [
        { x: 0, y: 0, cmd: "stitch" },
        { x: 10, y: 0, cmd: "stitch" },
        { x: 10, y: 0, cmd: "end" },
      ],
      { center: false },
    );
    // Start liegt schon im Nullpunkt: kein zusaetzlicher Sprung noetig
    expect(vorbereitet.filter((s) => s.cmd === "jump")).toHaveLength(0);

    const weit = prepareUnits(
      [
        { x: 500, y: 0, cmd: "stitch" },
        { x: 510, y: 0, cmd: "stitch" },
        { x: 510, y: 0, cmd: "end" },
      ],
      { center: false },
    );
    const spruenge = weit.filter((s) => s.cmd === "jump");
    expect(spruenge.length).toBe(Math.ceil(500 / 121));
    expect(spruenge[spruenge.length - 1]!.x).toBeCloseTo(500, 6);
  });

  it("haelt jede Bewegung unter dem Deltalimit", () => {
    const vorbereitet = prepareUnits(
      [
        { x: 0, y: 0, cmd: "stitch" },
        { x: 400, y: -300, cmd: "jump" },
        { x: 400, y: -300, cmd: "end" },
      ],
      { center: false },
    );
    let px = 0;
    let py = 0;
    for (const s of vorbereitet) {
      if (s.cmd !== "stitch" && s.cmd !== "jump") continue;
      expect(Math.abs(s.x - px)).toBeLessThanOrEqual(121);
      expect(Math.abs(s.y - py)).toBeLessThanOrEqual(121);
      px = s.x;
      py = s.y;
    }
  });

  it("schreibt einen vollen Plan ohne Ausnahme", () => {
    expect(() => writeDst(beispielPlan(), { label: "Voll" })).not.toThrow();
  });
});

describe("Neutrales JSON", () => {
  it("laeuft hin und zurueck", () => {
    const plan = beispielPlan();
    const neutral = toNeutralJson(plan, "Probe", []);
    const zurueck = fromNeutralJson(JSON.stringify(neutral));
    expect(zurueck.plan.stats).toEqual(plan.stats);
    expect(zurueck.unit).toBe("mm");
  });

  it("weist eine fremde Version ab", () => {
    expect(() => fromNeutralJson(JSON.stringify({ version: 99 }))).toThrow();
  });
});
