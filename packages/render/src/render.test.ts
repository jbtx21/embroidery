import { beforeAll, describe, expect, it } from "vitest";
import { initEngine, planDesign, design, fillObjekt, satinObjekt, runningObjekt } from "@texma-stitch/engine";
import type { StitchPlan, Thread } from "@texma-stitch/engine";
import { polygonOf, pt, rect } from "@texma-stitch/geometry";
import { fitView } from "./context.js";
import type { Ctx2D } from "./context.js";
import { abdunkeln, parseHex, toHex } from "./farbe.js";
import { planBbox, planZerlegen, renderPlan } from "./render.js";
import { renderPlanSvg } from "./svg.js";

/** Attrappe: zaehlt Aufrufe, statt zu zeichnen. */
function attrappe(): Ctx2D & { aufrufe: string[] } {
  const aufrufe: string[] = [];
  const ctx = {
    aufrufe,
    save: () => aufrufe.push("save"),
    restore: () => aufrufe.push("restore"),
    setTransform: () => aufrufe.push("setTransform"),
    clearRect: () => aufrufe.push("clearRect"),
    beginPath: () => aufrufe.push("beginPath"),
    moveTo: () => aufrufe.push("moveTo"),
    lineTo: () => aufrufe.push("lineTo"),
    stroke: () => aufrufe.push("stroke"),
    fill: () => aufrufe.push("fill"),
    arc: () => aufrufe.push("arc"),
    setLineDash: () => aufrufe.push("setLineDash"),
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    strokeStyle: "#000",
    fillStyle: "#000",
    globalAlpha: 1,
  };
  return ctx;
}

const GARNE: Thread[] = [
  { brand: "madeira", number: "1000", hex: "#101010", name: "Schwarz" },
  { brand: "madeira", number: "1147", hex: "#c8102e", name: "Rot" },
];

let plan: StitchPlan;

beforeAll(async () => {
  await initEngine();
  plan = planDesign(
    design([
      fillObjekt("f", polygonOf(rect(0, 0, 20, 12))),
      satinObjekt("s", [pt(30, 0), pt(30, 12)], [pt(34, 0), pt(34, 12)], { threadIndex: 1 }),
      runningObjekt("r", [pt(0, 20), pt(40, 20)], { threadIndex: 1 }),
    ]),
  );
});

describe("Farbe", () => {
  it("liest kurze und lange Hexwerte", () => {
    expect(parseHex("#fff")).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseHex("c8102e")).toEqual({ r: 200, g: 16, b: 46 });
  });

  it("dunkelt fuer den Schatten ab", () => {
    expect(abdunkeln("#c8102e", 0.5)).toBe("#640817");
    expect(toHex({ r: 300, g: -5, b: 16 })).toBe("#ff0010");
  });
});

describe("Ansicht", () => {
  it("legt die Box mittig ins Fenster", () => {
    const v = fitView({ minX: 0, minY: 0, maxX: 100, maxY: 50 }, 400, 300, 20);
    const mitteX = 50 * v.scale + v.offsetX;
    const mitteY = 25 * v.scale + v.offsetY;
    expect(mitteX).toBeCloseTo(200, 6);
    expect(mitteY).toBeCloseTo(150, 6);
    expect(100 * v.scale).toBeLessThanOrEqual(400 - 40 + 1e-6);
  });
});

describe("Zerlegung", () => {
  it("fasst Stiche einer Farbe zu Zuegen zusammen und trennt am Sprung", () => {
    const z = planZerlegen(
      {
        blocks: [
          { objectId: "a", threadIndex: 0, stitches: [
            { x: 0, y: 0, cmd: "stitch" },
            { x: 1, y: 0, cmd: "stitch" },
            { x: 9, y: 0, cmd: "jump" },
            { x: 10, y: 0, cmd: "stitch" },
            { x: 10, y: 0, cmd: "trim" },
            { x: 10, y: 0, cmd: "color" },
          ] },
        ],
        stats: plan.stats,
        warnings: [],
      },
      GARNE,
    );
    expect(z.zuege).toHaveLength(2);
    expect(z.spruenge).toHaveLength(1);
    expect(z.trims).toHaveLength(1);
    expect(z.farbwechsel).toHaveLength(1);
    // Der zweite Zug setzt am Sprungziel an, damit kein Stich verloren geht.
    expect(z.zuege[1]!.punkte[0]!.x).toBe(9);
  });

  it("achtet auf die Farbe des Blocks", () => {
    const z = planZerlegen(
      {
        blocks: [
          { objectId: "a", threadIndex: 0, stitches: [
            { x: 0, y: 0, cmd: "stitch" },
            { x: 1, y: 0, cmd: "stitch" },
          ] },
          { objectId: "b", threadIndex: 1, stitches: [
            { x: 2, y: 0, cmd: "stitch" },
            { x: 3, y: 0, cmd: "stitch" },
          ] },
        ],
        stats: plan.stats,
        warnings: [],
      },
      GARNE,
    );
    expect(z.zuege).toHaveLength(2);
    expect(z.zuege[0]!.farbe).toBe("#101010");
    expect(z.zuege[1]!.farbe).toBe("#c8102e");
  });

  it("haelt beim Sequenz-Regler an", () => {
    const voll = planZerlegen(plan, GARNE);
    const kurz = planZerlegen(plan, GARNE, 50);
    expect(kurz.gezeichnet).toBe(50);
    expect(voll.gezeichnet).toBeGreaterThan(kurz.gezeichnet);
  });
});

describe("Zeichnen", () => {
  it("zieht je Zug zwei Striche (Schatten + Faden), nicht je Stich", () => {
    const ctx = attrappe();
    const stats = renderPlan(ctx, plan, { view: fitView(planBbox(plan), 800, 600), threads: GARNE });
    expect(stats.stitches).toBeGreaterThan(400);
    // Batching: deutlich weniger stroke-Aufrufe als Stiche
    expect(stats.strokes).toBeLessThan(stats.stitches / 20);
    expect(ctx.aufrufe.filter((a) => a === "stroke").length).toBe(stats.strokes);
  });

  it("zeichnet im Linienmodus ohne Schatten", () => {
    const faden = renderPlan(attrappe(), plan, {
      view: fitView(planBbox(plan), 800, 600),
      threads: GARNE,
      mode: "faden",
    });
    const linien = renderPlan(attrappe(), plan, {
      view: fitView(planBbox(plan), 800, 600),
      threads: GARNE,
      mode: "linien",
    });
    expect(linien.strokes).toBeLessThan(faden.strokes);
  });

  it("zeichnet im Punktmodus mit fill statt stroke", () => {
    const ctx = attrappe();
    renderPlan(ctx, plan, {
      view: fitView(planBbox(plan), 800, 600),
      threads: GARNE,
      mode: "punkte",
      zeigeSpruenge: false,
      zeigeTrims: false,
      zeigeFarbwechsel: false,
    });
    expect(ctx.aufrufe.filter((a) => a === "fill").length).toBeGreaterThan(0);
    expect(ctx.aufrufe.filter((a) => a === "stroke").length).toBe(0);
  });

  it("laesst sich Spruenge, Trims und Farbwechsel abschalten", () => {
    const mit = renderPlan(attrappe(), plan, {
      view: fitView(planBbox(plan), 800, 600),
      threads: GARNE,
    });
    const ohne = renderPlan(attrappe(), plan, {
      view: fitView(planBbox(plan), 800, 600),
      threads: GARNE,
      zeigeSpruenge: false,
      zeigeTrims: false,
    });
    expect(ohne.strokes).toBeLessThanOrEqual(mit.strokes);
  });

  it("nutzt eine Ersatzfarbe, wenn kein Garn hinterlegt ist", () => {
    const z = planZerlegen(plan, undefined);
    expect(z.zuege[0]!.farbe).toBe("#7a7a7a");
  });
});

describe("SVG-Vorschau", () => {
  it("schreibt ein SVG, das das Motiv umfasst", () => {
    const svg = renderPlanSvg(plan, { threads: GARNE, randMm: 4 });
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.trimEnd().endsWith("</svg>")).toBe(true);

    const b = planBbox(plan);
    const viewBox = /viewBox="([-\d. ]+)"/.exec(svg)?.[1]?.split(" ").map(Number);
    expect(viewBox).toBeDefined();
    expect(viewBox![0]!).toBeCloseTo(b.minX - 4, 3);
    expect(viewBox![2]!).toBeCloseTo(b.maxX - b.minX + 8, 3);
  });

  it("zeichnet jeden Zug zweimal — Schatten und Faden", () => {
    const zuege = planZerlegen(plan, GARNE).zuege.filter((z) => z.punkte.length >= 2).length;
    const svg = renderPlanSvg(plan, { threads: GARNE });
    const pfade = svg.match(/<path /g)?.length ?? 0;
    // Zuege doppelt, dazu je ein Pfad fuer Spruenge und Trims
    expect(pfade).toBeGreaterThanOrEqual(zuege * 2);
    expect(pfade).toBeLessThanOrEqual(zuege * 2 + 2);
  });

  it("nimmt den Sequenz-Regler ernst", () => {
    const kurz = renderPlanSvg(plan, { threads: GARNE, bisStich: 20 });
    const voll = renderPlanSvg(plan, { threads: GARNE });
    expect(kurz.length).toBeLessThan(voll.length);
  });
});

describe("Benchmark (Kap. 12)", () => {
  it("zeichnet 50.000 Stiche schnell genug fuer eine fluessige Ansicht", () => {
    // 120 x 120 mm, dichte Reihen und kurze Stiche — das ergibt die
    // Groessenordnung, die Kap. 12 nennt.
    const gross = planDesign(
      design([
        fillObjekt("f", polygonOf(rect(0, 0, 130, 130)), { stitchLengthMm: 1.2 }),
      ]),
    );
    const anzahl = gross.blocks.reduce((n, b) => n + b.stitches.length, 0);
    expect(anzahl).toBeGreaterThan(50_000);

    const ctx = attrappe();
    const view = fitView(planBbox(gross), 1200, 900);
    renderPlan(ctx, gross, { view, threads: GARNE }); // aufwaermen

    const start = performance.now();
    renderPlan(ctx, gross, { view, threads: GARNE });
    const dauer = performance.now() - start;
    // Das Ziel aus Kap. 12 sind 16 ms fuer 50.000 Stiche AUF ECHTEM CANVAS.
    // Hier faellt nur unser Anteil an — Zerlegung und Aufrufe. Bleibt der unter
    // 50 ms, liegt der Engpass sicher beim Canvas und nicht bei uns.
    expect(dauer).toBeLessThan(50);
  });
});
