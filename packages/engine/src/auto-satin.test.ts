import { beforeAll, describe, expect, it } from "vitest";
import {
  arcLength,
  bbox,
  boundarySampleMm,
  closeRing,
  dist,
  initGeometry,
  medialAxis,
  nearestPoint,
  pointInPolygon,
  rings,
} from "@texma-stitch/geometry";
import type { Point, Polygon } from "@texma-stitch/geometry";
import {
  annulus,
  circle,
  LETTER_R,
  LETTER_S,
  LETTER_T,
  lShape,
  polygonOf,
  pt,
  rect,
} from "../test/fixtures/shapes.js";
import {
  autoSatin,
  isColumnBranch,
  medianWidth,
  orderBranches,
  railsForBranch,
  sampledRings,
} from "./auto-satin.js";
import type { BranchRails } from "./auto-satin.js";
import { generateSatin } from "./satin.js";
import type { SatinObject } from "./types.js";

beforeAll(async () => {
  await initGeometry();
});

const bar = polygonOf(rect(0, 0, 40, 4));
const satins = (objects: { type: string }[]): SatinObject[] =>
  objects.filter((o): o is SatinObject => o.type === "satin");

/** How far outside the shape a point sits; 0 when it is inside. */
function outsideBy(shape: Polygon, p: Point): number {
  if (pointInPolygon(shape, p)) return 0;
  return Math.min(...rings(shape).map((r) => nearestPoint(closeRing(r), p).distance));
}

describe("medianWidth", () => {
  it("takes the middle of an odd count and the mean of an even one", () => {
    expect(medianWidth([3, 1, 2])).toBe(2);
    expect(medianWidth([1, 2, 3, 4])).toBe(2.5);
    expect(medianWidth([])).toBe(0);
  });
});

describe("railsForBranch", () => {
  it("reads one rail off each side of the axis", () => {
    const sampleMm = boundarySampleMm(bar);
    const boundary = sampledRings(bar, sampleMm);
    const branch = medialAxis(bar, { sampleMm }).branches.reduce((a, b) =>
      a.points.length >= b.points.length ? a : b,
    );
    const rails = railsForBranch(branch, boundary);

    expect(rails.railA.length).toBeGreaterThan(2);
    expect(rails.railB.length).toBeGreaterThan(2);
    // The long branch of a 40 x 4 bar runs between the two long edges.
    expect(medianWidth(rails.widths)).toBeCloseTo(4, 1);
    // The rails ARE the outline, so they sit on it (spec §7.7.1).
    for (const p of [...rails.railA, ...rails.railB]) {
      expect(outsideBy(bar, p)).toBeLessThan(1e-6);
    }
    // Both start at the same end of the bar and run the same way.
    expect(dist(rails.railA[0]!, rails.railB[0]!)).toBeLessThan(6);
  });
});

describe("orderBranches", () => {
  it("chains the branches and flips one when its far end is nearer", () => {
    const first: BranchRails = {
      railA: [pt(0, 0), pt(10, 0)],
      railB: [pt(0, 2), pt(10, 2)],
      widths: [2, 2],
    };
    const second: BranchRails = {
      railA: [pt(30, 0), pt(11, 0)],
      railB: [pt(30, 2), pt(11, 2)],
      widths: [2, 2],
    };
    const ordered = orderBranches([second, first], pt(0, 0));
    expect(ordered[0]!.railA[0]).toEqual(pt(0, 0));
    // The second one is turned around so it starts where the first ended.
    expect(ordered[1]!.railA[0]).toEqual(pt(11, 0));
  });

  it("handles an empty list", () => {
    expect(orderBranches([], pt(0, 0))).toHaveLength(0);
  });
});

describe("autoSatin (spec §7.7)", () => {
  it("turns a long thin bar into satin columns", () => {
    const r = autoSatin(bar);
    const columns = satins(r.objects);
    expect(columns.length).toBeGreaterThan(0);
    expect(r.objects).toHaveLength(columns.length); // no fill fallback
    for (const c of columns) {
      expect(c.railA.length).toBeGreaterThanOrEqual(2);
      expect(c.railB.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("keeps the stitches on the shape, give or take the pull compensation", () => {
    for (const pullCompMm of [0, 0.2]) {
      const r = autoSatin(bar, { pullCompMm });
      let worst = 0;
      for (const c of satins(r.objects)) {
        for (const p of generateSatin(c).stitches) worst = Math.max(worst, outsideBy(bar, p));
      }
      // Satin lands ON the outline by construction; only the pull compensation
      // may push it further out, and nothing else.
      expect(worst).toBeLessThanOrEqual(pullCompMm + 1e-6);
    }
  });

  it("makes one column out of a ring", () => {
    const r = autoSatin(annulus(0, 0, 10, 6));
    const columns = satins(r.objects);
    expect(columns).toHaveLength(1);
    const c = columns[0]!;
    const width = dist(c.railA[0]!, nearestPoint(c.railB, c.railA[0]!).point);
    expect(width).toBeCloseTo(4, 0);
  });

  it("proposes a fill for a disc — it has no axis to follow", () => {
    const r = autoSatin(polygonOf(circle(0, 0, 10)));
    expect(r.objects).toHaveLength(1);
    expect(r.objects[0]!.type).toBe("fill");
    expect(r.warnings.map((w) => w.code)).toContain("SATIN_TOO_WIDE");
    expect(r.warnings[0]!.severity).toBe("info");
  });

  it("proposes a fill when a branch is wider than maxWidthMm", () => {
    // A long bar, so there IS a column branch — only far too wide for satin.
    const plate = polygonOf(rect(0, 0, 40, 12));
    const r = autoSatin(plate);
    expect(r.objects[0]!.type).toBe("fill");
    const warning = r.warnings.find((w) => w.code === "SATIN_TOO_WIDE")!;
    expect(warning.message).toMatch(/7 mm/);
  });

  it("calls a blob a blob instead of cutting rails out of it", () => {
    // A square has nothing but corner spurs — no column branch at all.
    const r = autoSatin(polygonOf(rect(0, 0, 20, 20)));
    expect(r.objects[0]!.type).toBe("fill");
    expect(r.warnings.map((w) => w.code)).toContain("SATIN_TOO_NARROW");
  });

  it("accepts the same shape once maxWidthMm allows it", () => {
    const arm = lShape(30, 8);
    expect(autoSatin(arm).objects[0]!.type).toBe("fill");
    const wider = autoSatin(arm, { maxWidthMm: 14 });
    expect(satins(wider.objects).length).toBeGreaterThan(0);
  });

  it("needs no rungs, because both rails run the same way (spec §7.7.1)", () => {
    // Since 21.09.2026 the rails are cut out of the outline, so the arc-length
    // pairing of §7.1 is already the right one.
    for (const c of satins(autoSatin(bar).objects)) {
      expect(c.rungs).toHaveLength(0);
    }
  });

  it("orders the columns so each starts near where the last ended", () => {
    const columns = satins(autoSatin(bar).objects);
    for (let i = 1; i < columns.length; i++) {
      const prev = columns[i - 1]!;
      const end = prev.railB[prev.railB.length - 1] ?? prev.railA[prev.railA.length - 1]!;
      const start = columns[i]!.railA[0]!;
      expect(dist(end, start)).toBeLessThan(45); // within the shape, not across the world
    }
    expect(columns.map((c) => c.id)).toEqual(columns.map((_, i) => `auto-${i}`));
  });

  it("takes the options it is given", () => {
    const r = autoSatin(bar, {
      idPrefix: "logo",
      threadIndex: 2,
      spacingMm: 0.5,
      pullCompMm: 0.1,
      maxWidthMm: 9,
    });
    const c = satins(r.objects)[0]!;
    expect(c.id.startsWith("logo-")).toBe(true);
    expect(c.threadIndex).toBe(2);
    expect(c.spacingMm).toBe(0.5);
    expect(c.pullCompMm).toBe(0.1);
    expect(c.maxWidthMm).toBe(9);
  });

  it("makes one column out of a plain bar, not one per corner (spec §7.7.1)", () => {
    // The medial axis of a rectangle is a roof with a spur into each corner —
    // five branches. Only the long one is a column.
    expect(satins(autoSatin(bar).objects)).toHaveLength(1);
  });

  it("drops the corner spurs but keeps the long branch", () => {
    const sampleMm = boundarySampleMm(bar);
    const branches = medialAxis(bar, { sampleMm }).branches;
    expect(branches.length).toBeGreaterThan(1);
    expect(branches.filter(isColumnBranch)).toHaveLength(1);
  });

  it("reports a degenerate shape instead of proposing something", () => {
    const r = autoSatin(polygonOf([pt(0, 0), pt(10, 0), pt(20, 0)]));
    expect(r.objects[0]!.type).toBe("fill"); // no axis at all
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it("is deterministic", () => {
    expect(JSON.stringify(autoSatin(bar))).toBe(JSON.stringify(autoSatin(bar)));
  });
});

describe("collapsed branches (spec §7.7)", () => {
  it("never proposes a column whose rail is a single point", () => {
    // A star-ish outline produces many very short branches.
    const spiky: Polygon = {
      outer: Array.from({ length: 24 }, (_, i) => {
        const a = (2 * Math.PI * i) / 24;
        const r = i % 2 === 0 ? 6 : 2.2;
        return { x: r * Math.cos(a), y: r * Math.sin(a) };
      }),
      holes: [],
    };
    const r = autoSatin(spiky);
    for (const o of r.objects) {
      if (o.type !== "satin") continue;
      expect(o.railA.length).toBeGreaterThanOrEqual(2);
      expect(o.railB.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("rails cut from the outline (spec §7.7.1)", () => {
  /** Total rail length of a proposal against the outline it was cut from. */
  const budget = (shape: Polygon, r: ReturnType<typeof autoSatin>): number => {
    let outline = 0;
    for (const ring of rings(shape)) outline += arcLength([...ring, ring[0]!]);
    let rails = 0;
    for (const o of r.objects) {
      if (o.type !== "satin") continue;
      rails += arcLength(o.railA) + arcLength(o.railB);
    }
    return rails / outline;
  };

  const letters: [string, Polygon][] = [
    ["T", LETTER_T],
    ["S", LETTER_S],
    ["R", LETTER_R],
  ];

  it.each(letters)("cuts %s into columns that follow the shape", (_name, shape) => {
    const r = autoSatin(shape);
    const cols = r.objects.filter((o) => o.type === "satin");
    expect(cols.length).toBeGreaterThan(0);
    // The rails ARE the outline, so together they cannot be longer than it.
    expect(budget(shape, r)).toBeLessThanOrEqual(1.3);
  });

  it.each(letters)("keeps every column of %s inside its own extent", (_name, shape) => {
    for (const o of autoSatin(shape).objects) {
      if (o.type !== "satin") continue;
      const pts = [...o.railA, ...o.railB];
      const b = bbox(pts);
      const diag = Math.hypot(b.maxX - b.minX, b.maxY - b.minY);
      // A wound rail measures several times its own extent.
      expect((arcLength(o.railA) + arcLength(o.railB)) / (2 * diag)).toBeLessThanOrEqual(2);
    }
  });

  it.each(letters)("pairs the rails of %s along the shape, not across it", (_name, shape) => {
    for (const o of autoSatin(shape).objects) {
      if (o.type !== "satin") continue;
      // Both rails run the same way: their ends are near each other, not crossed.
      const a0 = o.railA[0]!;
      const aN = o.railA[o.railA.length - 1]!;
      const b0 = o.railB[0]!;
      const bN = o.railB[o.railB.length - 1]!;
      expect(dist(a0, b0) + dist(aN, bN)).toBeLessThanOrEqual(dist(a0, bN) + dist(aN, b0) + 1e-6);
    }
  });

  it("still finds the straight bar it always found", () => {
    const r = autoSatin(polygonOf(rect(0, 0, 40, 3)));
    const cols = r.objects.filter((o) => o.type === "satin");
    expect(cols.length).toBeGreaterThan(0);
    expect(budget(polygonOf(rect(0, 0, 40, 3)), r)).toBeLessThanOrEqual(1.3);
  });
});
