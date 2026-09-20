import { beforeAll, describe, expect, it } from "vitest";
import { initGeometry } from "@texma-stitch/geometry";
import { polygonOf, pt, rect } from "../test/fixtures/shapes.js";
import { fillObject, runningObject, satinObject } from "../test/fixtures/designs.js";
import { CONNECT_DEFAULTS, connectBlocks, decideConnection } from "./connect.js";
import type { RawBlock } from "./connect.js";
import type { Stitch } from "./types.js";

beforeAll(async () => {
  await initGeometry();
});
import {
  analyze,
  DENSITY_ERROR,
  DENSITY_ERROR_PEAK,
  DENSITY_ERROR_SHARE,
  DENSITY_WARN,
  LONG_JUMP_MM,
  MAX_COLOR_CHANGES,
  maxDensity,
} from "./analyze.js";
import { autoOrder } from "./order.js";
import { coverPolygon, objectStart, orderRank } from "./object.js";
import {
  densityFactor,
  MACHINE_CAP,
  MACHINE_DEFAULT,
  MACHINES,
  preset,
  presetForMachine,
  PRESETS,
  textMinFactor,
} from "./presets.js";
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

describe("documented thresholds (spec §11)", () => {
  it("matches the numbers from the spec", () => {
    expect(DENSITY_WARN).toBe(12);
    expect(DENSITY_ERROR).toBe(18);
    expect(DENSITY_ERROR_PEAK).toBe(30);
    expect(DENSITY_ERROR_SHARE).toBe(0.01);
    expect(MAX_COLOR_CHANGES).toBe(8);
    expect(LONG_JUMP_MM).toBe(30);
  });
});

describe("density verdict (spec §11)", () => {
  /** n cells with `per` stitches each, plus `hot` cells with `hotCount`. */
  const plan = (n: number, per: number, hot = 0, hotCount = 0): Stitch[] => {
    const out: Stitch[] = [];
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < per; k++) out.push({ x: i + 0.5, y: 0.5, cmd: "stitch" });
    }
    for (let i = 0; i < hot; i++) {
      for (let k = 0; k < hotCount; k++) out.push({ x: i + 0.5, y: 10.5, cmd: "stitch" });
    }
    return out;
  };
  const codes = (s: Stitch[]) =>
    analyze([{ objectId: "a", threadIndex: 0, stitches: s }]).warnings.filter(
      (w) => w.code === "DENSITY_HIGH",
    );

  it("says nothing below the warning limit", () => {
    expect(codes(plan(100, 10))).toHaveLength(0);
  });

  it("warns above 12 per mm²", () => {
    expect(codes(plan(100, 13))[0]!.severity).toBe("warn");
  });

  it("keeps a lone hot spot a warning", () => {
    // One cell of 20 among 1000 is 0,1 % — far under the one per cent.
    expect(codes(plan(1000, 5, 1, 20))[0]!.severity).toBe("warn");
  });

  it("makes it an error when more than one per cent is overfilled", () => {
    // 5 cells of 20 among 100 is 5 %.
    expect(codes(plan(100, 5, 5, 20))[0]!.severity).toBe("error");
  });

  it("makes a single cell over 30 an error on its own", () => {
    expect(codes(plan(1000, 5, 1, 31))[0]!.severity).toBe("error");
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

  it("works from the centre outwards within one rank", () => {
    // Centre of the bounding box is x = 50; "mid" sits on it, "edge" at the rim.
    const objects = [
      runningObject("edge", [pt(0, 0), pt(4, 0)]),
      runningObject("mid", [pt(48, 0), pt(52, 0)]),
      runningObject("far", [pt(96, 0), pt(100, 0)]),
    ];
    expect(autoOrder(objects, { centreOut: true }).map((o) => o.id)).toEqual([
      "mid",
      "edge",
      "far",
    ]);
  });

  it("takes the lower object first at equal distance from the centre", () => {
    // Both are 10 mm from the centre; y points down, so "low" has the larger y.
    const objects = [
      runningObject("high", [pt(40, 0), pt(44, 0)]),
      runningObject("low", [pt(40, 20), pt(44, 20)]),
    ];
    expect(autoOrder(objects, { centreOut: true }).map((o) => o.id)).toEqual(["low", "high"]);
  });

  it("still groups by colour before anything else", () => {
    // Starts at (0,0), (40,40) and (50,50) put the centre at (25,25). Black
    // appears first, so its whole group runs first — and inside it the object
    // nearer the centre goes first.
    const objects = [
      runningObject("black-outer", [pt(0, 0), pt(1, 0)]),
      runningObject("red", [pt(50, 50), pt(51, 50)], { threadIndex: 1 }),
      runningObject("black-inner", [pt(40, 40), pt(41, 40)]),
    ];
    expect(autoOrder(objects, { centreOut: true }).map((o) => o.id)).toEqual([
      "black-inner",
      "black-outer",
      "red",
    ]);
  });

  it("never puts an overlapping object above one it was below (spec §10.1)", () => {
    // The STUTTGART case: a black shield, a grey horse on it, a black band
    // beside it. Grouping the blacks would bury the horse.
    const objects = [
      fillObject("shield", polygonOf(rect(0, 0, 40, 40))),
      fillObject("horse", polygonOf(rect(10, 10, 20, 20)), { threadIndex: 1 }),
      fillObject("band", polygonOf(rect(60, 0, 20, 20))),
    ];
    const ids = autoOrder(objects).map((o) => o.id);
    expect(ids.indexOf("shield")).toBeLessThan(ids.indexOf("horse"));
  });

  it("still groups colours where nothing overlaps", () => {
    const objects = [
      fillObject("a", polygonOf(rect(0, 0, 10, 10))),
      fillObject("b", polygonOf(rect(30, 0, 10, 10)), { threadIndex: 1 }),
      fillObject("c", polygonOf(rect(60, 0, 10, 10))),
    ];
    // a and c share a colour and touch nothing, so they run together.
    const ids = autoOrder(objects).map((o) => o.id);
    expect(Math.abs(ids.indexOf("a") - ids.indexOf("c"))).toBe(1);
  });

  it("takes the shortest path by default, not the centre", () => {
    // Without centreOut the machine simply works its way along (spec §10.1).
    const objects = [
      runningObject("start", [pt(0, 0), pt(1, 0)]),
      runningObject("far", [pt(90, 0), pt(91, 0)]),
      runningObject("next", [pt(5, 0), pt(6, 0)]),
    ];
    expect(autoOrder(objects).map((o) => o.id)).toEqual(["start", "next", "far"]);
  });

  it("puts background before details before outlines", () => {
    // Apart from each other, so nothing constrains the order (spec §10.1) and
    // the stage is free to decide.
    const objects = [
      runningObject("outline", [pt(0, 0), pt(1, 0)]),
      satinObject("detail", [pt(30, 0), pt(31, 0)], [pt(30, 2), pt(31, 2)]),
      fillObject("background", polygonOf(rect(0, 0, 10, 10))),
    ];
    for (const opts of [undefined, { centreOut: true }]) {
      expect(autoOrder(objects, opts).map((o) => o.id)).toEqual([
        "background",
        "detail",
        "outline",
      ]);
    }
  });

  it("handles an empty list", () => {
    expect(autoOrder([])).toHaveLength(0);
    expect(autoOrder([], { centreOut: true })).toHaveLength(0);
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
    // Industry values since 19.09.2026: 0,40 standard, 0,35 on heavy goods.
    expect(PRESETS.pique.fillRowSpacingMm).toBe(0.4);
    expect(PRESETS.cap.fillRowSpacingMm).toBe(0.35);
    expect(PRESETS.softshell.fillRowSpacingMm).toBe(0.35);
    expect(PRESETS.fleece.pullCompMm).toBe(0.3);
    expect(PRESETS.fleece.fillUnderlay.fill).toBe("double");
    expect(PRESETS.cap.satinUnderlay.center).toBe(true);
    expect(PRESETS.frottee.satinSpacingMm).toBe(0.35);
    expect(preset("softshell").id).toBe("softshell");
    // Jersey and the directional compensation, 19.09.2026
    expect(PRESETS.jersey.fillRowSpacingMm).toBe(0.45);
    expect(PRESETS.cap.satinSpacingMm).toBe(0.35);
    for (const p of Object.values(PRESETS)) {
      expect(p.pushCompMm).toBeGreaterThan(0);
      expect(p.pushCompMm).toBeLessThan(p.pullCompMm);
      expect(p.underlapMm).toBeGreaterThan(0);
    }
  });

  it("thins the rows out for 60 weight thread (spec §14)", () => {
    expect(densityFactor(MACHINE_DEFAULT)).toBe(1);
    expect(densityFactor({ ...MACHINE_DEFAULT, threadWeight: 60 })).toBe(0.8);
    const fine = presetForMachine("pique", { ...MACHINE_DEFAULT, threadWeight: 60 });
    expect(fine.fillRowSpacingMm).toBeCloseTo(0.32, 9);
    expect(fine.satinSpacingMm).toBeCloseTo(0.304, 9);
    // Everything else stays put.
    expect(fine.pullCompMm).toBe(PRESETS.pique.pullCompMm);
    expect(presetForMachine("pique", MACHINE_DEFAULT)).toEqual(PRESETS.pique);
  });

  it("lets 60 weight thread carry smaller text (spec §14)", () => {
    expect(textMinFactor(MACHINE_DEFAULT)).toBe(1);
    // A font asking for 5 mm comes down to the 3,5 mm the trade rule names.
    expect(5 * textMinFactor({ ...MACHINE_DEFAULT, threadWeight: 60 })).toBeCloseTo(3.5, 9);
  });

  it("offers machine profiles", () => {
    expect(MACHINE_DEFAULT.rpm).toBe(800);
    expect(MACHINE_DEFAULT.minStitchMm).toBe(0.6);
    expect(MACHINE_DEFAULT.threadWeight).toBe(40);
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
