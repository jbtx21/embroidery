import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { initGeometry } from "@texma-stitch/geometry";
import type { StitchPlan } from "@texma-stitch/engine";
import { planDesign } from "@texma-stitch/engine";
import { circle, polygonOf, pt, rect } from "../../../engine/test/fixtures/shapes.js";
import {
  design,
  fillObject,
  runningObject,
  satinObject,
} from "../../../engine/test/fixtures/designs.js";
import {
  decodeRecord,
  DST_MAX_DELTA,
  DST_UNITS_PER_MM,
  encodeRecord,
  roundHalfEven,
  TRIM_RECORDS,
} from "./encode.js";
import { DST_HEADER_SIZE, headerText, readHeader, writeHeader } from "./header.js";
import type { DstStitch } from "./write.js";
import { planToUnits, prepareUnits, writeDst, writeDstFromUnits } from "./write.js";
import { readDst, unitsToMm } from "./read.js";

const here = dirname(fileURLToPath(import.meta.url));
const script = resolve(here, "../../scripts/pyembroidery-dst.py");

/** Is pyembroidery available? The cross-check belongs in CI (spec §13.2). */
function hasPyembroidery(): boolean {
  try {
    execFileSync("python3", ["-c", "import pyembroidery"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const withPy = hasPyembroidery();
if (!withPy) {
  console.warn(
    "[formats] pyembroidery missing — the cross-check from spec §13.2 does NOT run. In CI that is a failure.",
  );
}

function pyembroideryDst(stitches: DstStitch[], label: string): Uint8Array {
  const input = JSON.stringify({ label, stitches: stitches.map((s) => [s.x, s.y, s.cmd]) });
  return new Uint8Array(execFileSync("python3", [script], { input, maxBuffer: 64 * 1024 * 1024 }));
}

beforeAll(async () => {
  await initGeometry();
});

// The fill row spacing is pinned: these tests are about the DST format, not
// about whatever density the preset carries (spec §14 moved it on 19.09.2026).
const samplePlan = (): StitchPlan =>
  planDesign(
    design([
      fillObject("f", polygonOf(rect(0, 0, 20, 12)), { rowSpacingMm: 0.25 }),
      satinObject("s", [pt(30, 0), pt(30, 12)], [pt(34, 0), pt(34, 12)], { threadIndex: 1 }),
      runningObject("r", [pt(0, 20), pt(40, 20)], { threadIndex: 1 }),
    ]),
  );

describe("rounding", () => {
  it("rounds halves to the even number, like Python", () => {
    expect(roundHalfEven(2.5)).toBe(2);
    expect(roundHalfEven(3.5)).toBe(4);
    expect(roundHalfEven(-2.5)).toBe(-2);
    expect(roundHalfEven(-3.5)).toBe(-4);
    expect(roundHalfEven(2.4)).toBe(2);
    expect(roundHalfEven(2.6)).toBe(3);
  });
});

describe("records (spec §13.1)", () => {
  // Known byte values, derived from the Tajima bit assignment by hand.
  const table: [number, number, "stitch" | "jump" | "color" | "end", [number, number, number]][] = [
    [1, 0, "stitch", [0x01, 0x00, 0x03]],
    [-1, 0, "stitch", [0x02, 0x00, 0x03]],
    [3, 0, "stitch", [0x00, 0x01, 0x03]],
    [9, 0, "stitch", [0x04, 0x00, 0x03]],
    [27, 0, "stitch", [0x00, 0x04, 0x03]],
    [81, 0, "stitch", [0x00, 0x00, 0x07]],
    [0, 1, "stitch", [0x40, 0x00, 0x03]],
    [0, -1, "stitch", [0x80, 0x00, 0x03]],
    [0, 3, "stitch", [0x00, 0x40, 0x03]],
    [0, 9, "stitch", [0x10, 0x00, 0x03]],
    [0, 27, "stitch", [0x00, 0x10, 0x03]],
    [0, 81, "stitch", [0x00, 0x00, 0x13]],
    [121, 0, "stitch", [0x05, 0x05, 0x07]],
    [1, 0, "jump", [0x01, 0x00, 0x83]],
    [0, 0, "color", [0x00, 0x00, 0xc3]],
    [0, 0, "end", [0x00, 0x00, 0xf3]],
  ];

  it.each(table)("encodes (%i, %i, %s)", (dx, dy, kind, expected) => {
    expect([...encodeRecord(dx, dy, kind)]).toEqual(expected);
  });

  it("decodes back to the same delta", () => {
    for (const [dx, dy, kind] of table) {
      if (kind === "color" || kind === "end") continue;
      const back = decodeRecord(encodeRecord(dx, dy, kind));
      expect(back.dx).toBe(dx);
      expect(back.dy).toBe(dy);
      expect(back.kind).toBe(kind);
    }
  });

  it("rejects deltas over the limit instead of quietly clipping them", () => {
    expect(() => encodeRecord(DST_MAX_DELTA + 1, 0, "stitch")).toThrow();
    expect(() => encodeRecord(0, -(DST_MAX_DELTA + 1), "stitch")).toThrow();
    expect(() => encodeRecord(DST_MAX_DELTA, DST_MAX_DELTA, "stitch")).not.toThrow();
  });

  it("uses three jumps summing to zero as the trim signal", () => {
    let dx = 0;
    let dy = 0;
    for (const r of TRIM_RECORDS) {
      const d = decodeRecord(r);
      expect(d.kind).toBe("jump");
      dx += d.dx;
      dy += d.dy;
    }
    expect([dx, dy]).toEqual([0, 0]);
  });
});

describe("documented units (spec §13.1)", () => {
  it("uses 0.1 mm per DST unit and 121 units per axis", () => {
    expect(DST_UNITS_PER_MM).toBe(10);
    expect(DST_MAX_DELTA).toBe(121);
    expect(DST_HEADER_SIZE).toBe(512);
    // planToUnits converts millimetres accordingly
    expect(
      planToUnits([
        { objectId: "a", threadIndex: 0, stitches: [{ x: 1.23, y: -4.5, cmd: "stitch" }] },
      ])[0],
    ).toEqual({ x: 12.3, y: -45, cmd: "stitch" });
  });
});

describe("header", () => {
  it("is 512 bytes long and ends after PD with 0x1A", () => {
    const bytes = writeDstFromUnits(
      [
        { x: 0, y: 0, cmd: "stitch" },
        { x: 100, y: 0, cmd: "stitch" },
        { x: 100, y: 0, cmd: "end" },
      ],
      { label: "Probe" },
    );
    expect(bytes.length).toBeGreaterThan(DST_HEADER_SIZE);
    const text = new TextDecoder("latin1").decode(bytes.subarray(0, DST_HEADER_SIZE));
    expect(text.startsWith("LA:Probe           \r")).toBe(true);
    expect(text).toContain("ST:      3\r");
    expect(text).toContain("PD:******\r");
    expect(bytes[text.indexOf("PD:******\r") + 10]).toBe(0x1a);
  });

  it("truncates a long label instead of pushing the header out of shape", () => {
    const text = headerText({
      label: "a".repeat(40),
      records: 1,
      colorChanges: 0,
      bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
      last: { x: 0, y: 0 },
    });
    expect(text.indexOf("\r")).toBe(19);
  });

  it("writes the last position into AX/AY with its sign", () => {
    const text = headerText({
      label: "x",
      records: 1,
      colorChanges: 0,
      bounds: { minX: -5, minY: -6, maxX: 7, maxY: 8 },
      last: { x: -12, y: 34 },
    });
    expect(text).toContain("AX:-   12\r");
    // y points down for us, DST counts it upwards
    expect(text).toContain("AY:-   34\r");
    expect(text).toContain("+X:    7\r");
    expect(text).toContain("-X:    5\r");
  });

  it("reads its own fields back", () => {
    const header = readHeader(
      writeHeader({
        label: "Kopf",
        records: 42,
        colorChanges: 2,
        bounds: { minX: -10, minY: -20, maxX: 30, maxY: 40 },
        last: { x: 1, y: 2 },
      }),
    );
    expect(header).toMatchObject({
      label: "Kopf",
      records: 42,
      colorChanges: 2,
      extents: { plusX: 30, minusX: 10, plusY: 40, minusY: 20 },
    });
  });
});

describe("prepareUnits", () => {
  it("centres the design on the origin", () => {
    const prepared = prepareUnits([
      { x: 100, y: 100, cmd: "stitch" },
      { x: 140, y: 160, cmd: "stitch" },
      { x: 140, y: 160, cmd: "end" },
    ]);
    const moves = prepared.filter((s) => s.cmd !== "end");
    const xs = moves.map((s) => s.x);
    const ys = moves.map((s) => s.y);
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(0, 6);
    expect((Math.min(...ys) + Math.max(...ys)) / 2).toBeCloseTo(0, 6);
  });

  it("drives from the origin to the first stitch as jumps", () => {
    const atOrigin = prepareUnits(
      [
        { x: 0, y: 0, cmd: "stitch" },
        { x: 10, y: 0, cmd: "stitch" },
        { x: 10, y: 0, cmd: "end" },
      ],
      { center: false },
    );
    expect(atOrigin.filter((s) => s.cmd === "jump")).toHaveLength(0);

    const far = prepareUnits(
      [
        { x: 500, y: 0, cmd: "stitch" },
        { x: 510, y: 0, cmd: "stitch" },
        { x: 510, y: 0, cmd: "end" },
      ],
      { center: false },
    );
    const jumps = far.filter((s) => s.cmd === "jump");
    expect(jumps).toHaveLength(Math.ceil(500 / DST_MAX_DELTA));
    expect(jumps[jumps.length - 1]!.x).toBeCloseTo(500, 6);
  });

  it("keeps every movement under the delta limit", () => {
    const prepared = prepareUnits(
      [
        { x: 0, y: 0, cmd: "stitch" },
        { x: 400, y: -300, cmd: "jump" },
        { x: 400, y: -300, cmd: "end" },
      ],
      { center: false },
    );
    let px = 0;
    let py = 0;
    for (const s of prepared) {
      if (s.cmd !== "stitch" && s.cmd !== "jump") continue;
      expect(Math.abs(s.x - px)).toBeLessThanOrEqual(DST_MAX_DELTA);
      expect(Math.abs(s.y - py)).toBeLessThanOrEqual(DST_MAX_DELTA);
      px = s.x;
      py = s.y;
    }
  });

  it("returns an empty list unchanged", () => {
    expect(prepareUnits([])).toHaveLength(0);
  });

  it("writes a full plan without throwing", () => {
    expect(() => writeDst(samplePlan(), { label: "Voll" })).not.toThrow();
  });
});

describe("round trip (spec §15)", () => {
  it("writes, reads and writes byte-identically", () => {
    const plan = samplePlan();
    const a = writeDst(plan, { label: "Roundtrip" });
    const b = writeDstFromUnits(readDst(a).stitches, { label: "Roundtrip" });
    expect(Buffer.from(b).equals(Buffer.from(a))).toBe(true);
  });

  it("reads back the header and the record count", () => {
    const plan = samplePlan();
    const parsed = readDst(writeDst(plan, { label: "Kopf" }));
    expect(parsed.header.label).toBe("Kopf");
    expect(parsed.header.records).toBe(prepareUnits(planToUnits(plan.blocks)).length);
    expect(parsed.stitches.length).toBe(parsed.header.records);
    expect(parsed.header.colorChanges).toBe(plan.stats.colorChanges);
  });

  it("restores the coordinates to within 0.1 mm", () => {
    const units = planToUnits(samplePlan().blocks);
    const read = readDst(writeDstFromUnits(units)).stitches;
    expect(read).toHaveLength(units.length);
    for (let i = 0; i < units.length; i++) {
      expect(Math.abs(read[i]!.x - units[i]!.x)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(read[i]!.y - units[i]!.y)).toBeLessThanOrEqual(0.5);
    }
    expect(unitsToMm(read)[0]!.x).toBeCloseTo(read[0]!.x / 10, 9);
  });

  it("does not let the rounding error drift over 1000 stitches", () => {
    // 0.15 mm per stitch is 1.5 DST units — exactly the case where naive
    // rounding of each delta would accumulate half a unit per stitch.
    const stitches: DstStitch[] = [{ x: 0, y: 0, cmd: "stitch" }];
    for (let i = 1; i <= 1000; i++) stitches.push({ x: i * 1.5, y: 0, cmd: "stitch" });
    stitches.push({ x: 1000 * 1.5, y: 0, cmd: "end" });

    const read = readDst(writeDstFromUnits(stitches, { label: "Drift" })).stitches;
    const last = read[read.length - 2]!;
    // At most one DST unit, i.e. 0.1 mm, off the target position.
    expect(Math.abs(last.x - 1000 * 1.5)).toBeLessThanOrEqual(1);
  });
});

describe.skipIf(!withPy)("cross-check against pyembroidery (spec §13.2)", () => {
  it("produces a byte-identical DST for a simple running stitch", () => {
    const stitches: DstStitch[] = [
      { x: 0, y: 0, cmd: "stitch" },
      { x: 25, y: 0, cmd: "stitch" },
      { x: 25, y: -35, cmd: "stitch" },
      { x: 25, y: -35, cmd: "end" },
    ];
    expect(
      Buffer.from(writeDstFromUnits(stitches, { label: "Lauf" })).equals(
        Buffer.from(pyembroideryDst(stitches, "Lauf")),
      ),
    ).toBe(true);
  });

  it("produces a byte-identical DST with trim and colour change", () => {
    const stitches: DstStitch[] = [
      { x: 0, y: 0, cmd: "stitch" },
      { x: 50, y: 20, cmd: "stitch" },
      { x: 50, y: 20, cmd: "trim" },
      { x: 50, y: 20, cmd: "color" },
      { x: 150, y: 100, cmd: "jump" },
      { x: 160, y: 105, cmd: "stitch" },
      { x: 160, y: 105, cmd: "end" },
    ];
    expect(
      Buffer.from(writeDstFromUnits(stitches, { label: "Trim" })).equals(
        Buffer.from(pyembroideryDst(stitches, "Trim")),
      ),
    ).toBe(true);
  });

  it("produces a byte-identical DST for a full stitch plan", () => {
    const units = prepareUnits(planToUnits(samplePlan().blocks));
    expect(units.length).toBeGreaterThan(400);
    expect(
      Buffer.from(writeDstFromUnits(units, { label: "Plan" })).equals(
        Buffer.from(pyembroideryDst(units, "Plan")),
      ),
    ).toBe(true);
  });

  it("holds up on awkward coordinates (half units)", () => {
    const units = prepareUnits(
      planToUnits(
        planDesign(design([fillObject("f", polygonOf(circle(12.05, 9.15, 7.25)))])).blocks,
      ),
    );
    expect(
      Buffer.from(writeDstFromUnits(units, { label: "Kreis" })).equals(
        Buffer.from(pyembroideryDst(units, "Kreis")),
      ),
    ).toBe(true);
  });
});
