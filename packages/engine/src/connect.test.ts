import { describe, expect, it } from "vitest";
import { polygonOf, pt, rect } from "../test/fixtures/shapes.js";
import { fillObject, runningObject, satinObject } from "../test/fixtures/designs.js";
import { CONNECT_DEFAULTS, connectBlocks, decideConnection } from "./connect.js";
import type { RawBlock } from "./connect.js";
import { analyze, maxDensity } from "./analyze.js";
import { autoOrder } from "./order.js";
import { coverPolygon, objectStart, orderRank } from "./object.js";
import { MACHINE_CAP, MACHINE_DEFAULT, MACHINES, preset, PRESETS } from "./presets.js";
import { warn, WARNING } from "./warnings.js";

const raw = (
  id: string,
  threadIndex: number,
  points: { x: number; y: number }[],
  extra: Partial<RawBlock> = {},
): RawBlock => ({
  objectId: id,
  threadIndex,
  points,
  trimAfter: "auto",
  ...extra,
});

describe("connections (spec §10.2)", () => {
  it("trims and changes colour", () => {
    const a = decideConnection(
      0,
      [raw("a", 0, [pt(0, 0), pt(1, 0)]), raw("b", 1, [pt(2, 0), pt(3, 0)])],
      CONNECT_DEFAULTS,
    );
    expect(a.trim).toBe(true);
    expect(a.color).toBe(true);
  });

  it("jumps over a short distance without trimming", () => {
    const a = decideConnection(
      0,
      [raw("a", 0, [pt(0, 0), pt(1, 0)]), raw("b", 0, [pt(5, 0), pt(6, 0)])],
      CONNECT_DEFAULTS,
    );
    expect(a.trim).toBe(false);
    expect(a.jump).toBe(true);
  });

  it("trims over a long distance", () => {
    const a = decideConnection(
      0,
      [raw("a", 0, [pt(0, 0), pt(1, 0)]), raw("b", 0, [pt(40, 0), pt(41, 0)])],
      CONNECT_DEFAULTS,
    );
    expect(a.trim).toBe(true);
    expect(a.jump).toBe(true);
  });

  it("connects with a running stitch when the path lies under B", () => {
    const cover = polygonOf(rect(0, -5, 20, 10));
    const a = decideConnection(
      0,
      [raw("a", 0, [pt(0, 0), pt(1, 0)]), raw("b", 0, [pt(3, 0), pt(6, 0)], { cover })],
      CONNECT_DEFAULTS,
    );
    expect(a.trim).toBe(false);
    expect(a.jump).toBe(false);
    expect(a.travel.length).toBeGreaterThan(0);
  });

  it("jumps when the short path is not covered", () => {
    const a = decideConnection(
      0,
      [raw("a", 0, [pt(0, 0), pt(1, 0)]), raw("b", 0, [pt(3, 0), pt(6, 0)])],
      CONNECT_DEFAULTS,
    );
    expect(a.travel).toHaveLength(0);
    expect(a.jump).toBe(true);
  });

  it("is overridden by trimAfter", () => {
    const never = decideConnection(
      0,
      [
        raw("a", 0, [pt(0, 0), pt(1, 0)], { trimAfter: "never" }),
        raw("b", 0, [pt(40, 0), pt(41, 0)]),
      ],
      CONNECT_DEFAULTS,
    );
    expect(never.trim).toBe(false);

    const always = decideConnection(
      0,
      [
        raw("a", 0, [pt(0, 0), pt(1, 0)], { trimAfter: "always" }),
        raw("b", 0, [pt(1.1, 0), pt(2, 0)]),
      ],
      CONNECT_DEFAULTS,
    );
    expect(always.trim).toBe(true);
  });

  it("keeps the colour change even with trimAfter never", () => {
    const a = decideConnection(
      0,
      [
        raw("a", 0, [pt(0, 0), pt(1, 0)], { trimAfter: "never" }),
        raw("b", 1, [pt(2, 0), pt(3, 0)]),
      ],
      CONNECT_DEFAULTS,
    );
    expect(a.trim).toBe(false);
    expect(a.color).toBe(true);
  });

  it("puts trim and colour change at the end of A, the jump at the start of B", () => {
    const blocks = connectBlocks([
      raw("a", 0, [pt(0, 0), pt(1, 0)]),
      raw("b", 1, [pt(20, 0), pt(21, 0)]),
    ]);
    const a = blocks[0]!.stitches;
    expect(a[a.length - 2]!.cmd).toBe("trim");
    expect(a[a.length - 1]!.cmd).toBe("color");
    expect(blocks[1]!.stitches[0]!.cmd).toBe("jump");
    expect(blocks[1]!.stitches[blocks[1]!.stitches.length - 1]!.cmd).toBe("end");
  });

  it("drops empty blocks", () => {
    expect(connectBlocks([raw("a", 0, []), raw("b", 0, [pt(0, 0), pt(1, 0)])])).toHaveLength(1);
    expect(connectBlocks([])).toHaveLength(0);
  });
});

describe("statistics (spec §11)", () => {
  it("counts stitches, jumps, trims and colour changes", () => {
    const { stats } = analyze([
      {
        objectId: "a",
        threadIndex: 0,
        stitches: [
          { x: 0, y: 0, cmd: "stitch" },
          { x: 5, y: 0, cmd: "stitch" },
          { x: 5, y: 0, cmd: "trim" },
          { x: 5, y: 0, cmd: "color" },
          { x: 20, y: 0, cmd: "jump" },
          { x: 25, y: 5, cmd: "stitch" },
          { x: 25, y: 5, cmd: "end" },
        ],
      },
    ]);
    expect(stats.stitches).toBe(3);
    expect(stats.jumps).toBe(1);
    expect(stats.trims).toBe(1);
    expect(stats.colorChanges).toBe(1);
    expect(stats.bboxMm).toEqual({ w: 25, h: 5 });
    expect(stats.runtimeSec).toBeCloseTo(3 / (800 / 60) + 3 + 12, 6);
  });

  it("reports an empty plan as empty", () => {
    const { stats } = analyze([]);
    expect(stats.bboxMm).toEqual({ w: 0, h: 0 });
    expect(stats.runtimeSec).toBe(0);
  });

  it("measures the density on a 1 mm grid", () => {
    expect(
      maxDensity(
        Array.from({ length: 20 }, (_, i) => ({
          x: 0.5 + i * 0.001,
          y: 0.5,
          cmd: "stitch" as const,
        })),
      ),
    ).toBe(20);
  });

  it("warns and errors on density", () => {
    const dense = (n: number) =>
      Array.from({ length: n }, () => ({ x: 0.5, y: 0.5, cmd: "stitch" as const }));
    expect(
      analyze([{ objectId: "a", threadIndex: 0, stitches: dense(20) }]).warnings.find(
        (w) => w.code === "DENSITY_HIGH",
      )?.severity,
    ).toBe("error");
    expect(
      analyze([{ objectId: "a", threadIndex: 0, stitches: dense(13) }]).warnings.find(
        (w) => w.code === "DENSITY_HIGH",
      )?.severity,
    ).toBe("warn");
  });

  it("warns about many colour changes and long jumps", () => {
    const stitches = [
      { x: 0, y: 0, cmd: "stitch" as const },
      ...Array.from({ length: 9 }, () => ({ x: 0, y: 0, cmd: "color" as const })),
      { x: 50, y: 0, cmd: "jump" as const },
    ];
    const codes = analyze([{ objectId: "a", threadIndex: 0, stitches }]).warnings.map(
      (w) => w.code,
    );
    expect(codes).toContain("MANY_COLOR_CHANGES");
    expect(codes).toContain("LONG_JUMP");
  });

  it("warns when the design does not fit the hoop", () => {
    const stitches = [
      { x: 0, y: 0, cmd: "stitch" as const },
      { x: 200, y: 0, cmd: "stitch" as const },
    ];
    expect(
      analyze([{ objectId: "a", threadIndex: 0, stitches }], MACHINE_CAP).warnings.map(
        (w) => w.code,
      ),
    ).toContain("OBJECT_OUTSIDE_HOOP");
  });
});

describe("order (spec §10.1)", () => {
  it("groups by colour and puts areas before outlines", () => {
    const objects = [
      runningObject("outline", [pt(0, 0), pt(10, 0)]),
      fillObject("area", polygonOf(rect(0, 0, 10, 10))),
      runningObject("red", [pt(0, 0), pt(5, 0)], { threadIndex: 1 }),
    ];
    expect(autoOrder(objects).map((o) => o.id)).toEqual(["area", "outline", "red"]);
  });

  it("sorts by distance within one rank", () => {
    const objects = [
      runningObject("far", [pt(100, 0), pt(110, 0)]),
      runningObject("near", [pt(1, 0), pt(2, 0)]),
    ];
    expect(autoOrder(objects).map((o) => o.id)).toEqual(["far", "near"]);
  });

  it("handles an empty list", () => {
    expect(autoOrder([])).toHaveLength(0);
  });
});

describe("object helpers", () => {
  it("gives a start point for every type", () => {
    expect(objectStart(fillObject("f", polygonOf(rect(2, 3, 10, 10))))).toEqual({ x: 2, y: 13 });
    expect(objectStart(satinObject("s", [pt(1, 2)], [pt(3, 4)]))).toEqual(pt(1, 2));
    expect(objectStart(runningObject("r", [pt(5, 6)]))).toEqual(pt(5, 6));
  });

  it("knows what covers something and what does not", () => {
    expect(coverPolygon(fillObject("f", polygonOf(rect(0, 0, 10, 10))))).toBeDefined();
    expect(
      coverPolygon(satinObject("s", [pt(0, 0), pt(10, 0)], [pt(0, 2), pt(10, 2)])),
    ).toBeDefined();
    expect(coverPolygon(runningObject("r", [pt(0, 0), pt(10, 0)]))).toBeUndefined();
  });

  it("ranks fill before satin before running", () => {
    expect(orderRank(fillObject("f", polygonOf(rect(0, 0, 1, 1))))).toBeLessThan(
      orderRank(satinObject("s", [pt(0, 0)], [pt(1, 1)])),
    );
    expect(orderRank(satinObject("s", [pt(0, 0)], [pt(1, 1)]))).toBeLessThan(
      orderRank(runningObject("r", [pt(0, 0)])),
    );
  });
});

describe("presets (spec §14)", () => {
  it("carries the values from the table", () => {
    expect(PRESETS.pique.fillRowSpacingMm).toBe(0.25);
    expect(PRESETS.fleece.pullCompMm).toBe(0.3);
    expect(PRESETS.fleece.fillUnderlay.fill).toBe("double");
    expect(PRESETS.cap.satinUnderlay.center).toBe(true);
    expect(PRESETS.frottee.satinSpacingMm).toBe(0.35);
    expect(preset("softshell").id).toBe("softshell");
  });

  it("offers machine profiles", () => {
    expect(MACHINE_DEFAULT.rpm).toBe(800);
    expect(MACHINES["cap"]).toBe(MACHINE_CAP);
  });
});

describe("warnings", () => {
  it("builds entries with and without an object", () => {
    expect(warn(WARNING.LONG_JUMP, "x")).toEqual({
      code: "LONG_JUMP",
      message: "x",
      severity: "warn",
    });
    expect(warn(WARNING.LONG_JUMP, "x", "error", "obj")).toMatchObject({
      objectId: "obj",
      severity: "error",
    });
  });
});
