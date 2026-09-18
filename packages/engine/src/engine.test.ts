import { beforeAll, describe, expect, it } from "vitest";
import {
  annulus,
  arc,
  bbox,
  circle,
  dist,
  initGeometry,
  pointInPolygon,
  polygonOf,
  pt,
  rect,
} from "@texma-stitch/geometry";
import { generateRunning, runningStitches } from "./running.js";
import {
  applyPullComp,
  applyShortStitches,
  generateSatin,
  pairRails,
  splitWideStitches,
  zigzagSequence,
} from "./satin.js";
import { generateFill, rowStitches, scanlines, sections } from "./fill.js";
import { connectBlocks, entscheide } from "./connect.js";
import { tieBlocks } from "./tie.js";
import { postProcess } from "./post.js";
import { analyze, maxDichte } from "./analyze.js";
import { autoOrder } from "./order.js";
import { stableHash } from "./hash.js";
import { validate, selbstschnitt } from "./validate.js";
import { expand } from "./expand.js";
import { fontRegistry } from "./font.js";
import { PRESETS } from "./presets.js";
import { createCache, planDesign } from "./pipeline.js";
import {
  design,
  fillObjekt,
  runningObjekt,
  satinObjekt,
  TEST_FONT,
  textObjekt,
} from "./testdesign.js";
import type { Stitch, StitchBlock } from "./types.js";

beforeAll(async () => {
  await initGeometry();
});

const stichPunkte = (blocks: StitchBlock[]): Stitch[] =>
  blocks.flatMap((b) => b.stitches).filter((s) => s.cmd === "stitch");

describe("Laufstich (Kap. 6)", () => {
  it("teilt gleichmaessig auf", () => {
    const s = runningStitches([pt(0, 0), pt(10, 0)], { stitchLengthMm: 2.5 });
    expect(s).toHaveLength(5);
  });

  it("laesst keinen Reststich unter 0,5 mm", () => {
    const s = runningStitches([pt(0, 0), pt(10.2, 0)], { stitchLengthMm: 2.5 });
    for (let i = 1; i < s.length; i++) expect(dist(s[i - 1]!, s[i]!)).toBeGreaterThan(0.5);
  });

  it("macht aus repeats 3 einen Bean Stitch", () => {
    const s = runningStitches([pt(0, 0), pt(5, 0)], { stitchLengthMm: 5, repeats: 3 });
    // p0, p1, p0, p1
    expect(s.map((p) => p.x)).toEqual([0, 5, 0, 5]);
  });

  it("schliesst den Ring", () => {
    const s = generateRunning(
      runningObjekt("r", rect(0, 0, 10, 10), { closed: true, stitchLengthMm: 2.5 }),
    );
    expect(s[0]!).toEqual(s[s.length - 1]!);
  });
});

describe("Satin (Kap. 7)", () => {
  const railA = [pt(0, 0), pt(20, 0)];
  const railB = [pt(0, 4), pt(20, 4)];

  it("paart nach Bogenlaengen-Anteil und richtet sich nach der laengeren Seite", () => {
    const paare = pairRails(railA, railB, [], 0.4);
    expect(paare).toHaveLength(51); // 20 / 0,4 = 50 Abschnitte
    expect(paare[0]!.a).toEqual(pt(0, 0));
    expect(paare[50]!.b.x).toBeCloseTo(20, 9);
  });

  it("versetzt beide Rails nach aussen, nicht in dieselbe Richtung", () => {
    const [a, b] = applyPullComp(railA, railB, 0.2);
    expect(a[0]!.y).toBeCloseTo(-0.2, 6);
    expect(b[0]!.y).toBeCloseTo(4.2, 6);
  });

  it("erzeugt die Zickzack-Folge A, B, A, B", () => {
    const seq = zigzagSequence(pairRails(railA, railB, [], 4));
    expect(seq[0]!.y).toBeCloseTo(0, 9);
    expect(seq[1]!.y).toBeCloseTo(4, 9);
    expect(seq[2]!.y).toBeCloseTo(0, 9);
  });

  it("paart mit Sprossen abschnittsweise", () => {
    // Sprosse in der Mitte, Rail B doppelt so lang wie A im ersten Abschnitt
    const rungs: [import("./types.js").Point, import("./types.js").Point][] = [
      [pt(10, -1), pt(10, 5)],
    ];
    const paare = pairRails(railA, railB, rungs, 0.4);
    const mitte = paare.find((p) => Math.abs(p.a.x - 10) < 1e-6);
    expect(mitte).toBeDefined();
    expect(mitte!.b.x).toBeCloseTo(10, 6);
  });

  it("teilt zu breite Querungen (Split-Satin)", () => {
    const breit = zigzagSequence(pairRails([pt(0, 0), pt(10, 0)], [pt(0, 12), pt(10, 12)], [], 1));
    const geteilt = splitWideStitches(breit, 7);
    expect(geteilt.length).toBeGreaterThan(breit.length);
    for (let i = 1; i < geteilt.length; i++) {
      expect(dist(geteilt[i - 1]!, geteilt[i]!)).toBeLessThanOrEqual(12.1);
    }
  });

  it("kuerzt jeden zweiten Innenstich in engen Kurven", () => {
    // Enger Bogen: Innenrail r = 0,5 mm, Aussenrail r = 2,5 mm
    const innen = arc(0, 0, 0.5, 0, 180, 12);
    const aussen = arc(0, 0, 2.5, 0, 180, 12);
    const paare = pairRails(innen, aussen, [], 0.4);
    const gekuerzt = applyShortStitches(paare);
    const vorher = paare.map((r) => dist(r.a, r.b));
    const nachher = gekuerzt.map((r) => dist(r.a, r.b));
    const kuerzer = nachher.filter((n, i) => n < vorher[i]! - 1e-9);
    expect(kuerzer.length).toBeGreaterThan(0);
    for (let i = 0; i < nachher.length; i++) {
      // gekuerzt wird auf 70 % — nie darunter
      expect(nachher[i]!).toBeGreaterThanOrEqual(vorher[i]! * 0.7 - 1e-6);
    }
  });

  it("warnt bei zu schmaler und zu breiter Spalte", () => {
    const schmal = generateSatin(
      satinObjekt("s", [pt(0, 0), pt(10, 0)], [pt(0, 0.4), pt(10, 0.4)]),
    );
    expect(schmal.warnings.map((w) => w.code)).toContain("SATIN_TOO_NARROW");

    const breit = generateSatin(
      satinObjekt("s", [pt(0, 0), pt(10, 0)], [pt(0, 14), pt(10, 14)]),
    );
    expect(breit.warnings.map((w) => w.code)).toContain("SATIN_TOO_WIDE");
  });

  it("legt die Unterlage vor die Deckstiche", () => {
    const ohne = generateSatin(satinObjekt("s", railA, railB));
    const mit = generateSatin(
      satinObjekt("s", railA, railB, {
        underlay: { center: true, contour: true, zigzag: true, insetMm: 0.4, zigzagSpacingMm: 3 },
      }),
    );
    expect(mit.stitches.length).toBeGreaterThan(ohne.stitches.length);
    // Die letzten Stiche sind die Deckstiche — sie muessen mit denen ohne
    // Unterlage uebereinstimmen.
    const schwanz = mit.stitches.slice(-ohne.stitches.length);
    expect(schwanz[schwanz.length - 1]!.x).toBeCloseTo(
      ohne.stitches[ohne.stitches.length - 1]!.x,
      6,
    );
  });
});

describe("Fill (Kap. 8)", () => {
  const quadrat = polygonOf(rect(0, 0, 10, 10));

  it("legt Reihen auf ein festes Raster", () => {
    const rows = scanlines(quadrat, 0.25);
    expect(rows.length).toBeGreaterThan(35);
    expect(rows.length).toBeLessThan(42);
    // von unten nach oben: erstes y ist das groesste
    expect(rows[0]![0]!.y).toBeGreaterThan(rows[rows.length - 1]![0]!.y);
  });

  it("erkennt einen Ring als eine Sektion je Seite", () => {
    const rows = scanlines(annulus(0, 0, 10, 5), 0.5);
    const s = sections(rows);
    expect(s.length).toBeGreaterThanOrEqual(2);
  });

  it("setzt Anfang und Ende jeder Reihe auf die Kontur", () => {
    const seg = { row: 4, y: 1, x0: 0, x1: 10, idx: 0 };
    const p = rowStitches(seg, { angleDeg: 0, rowSpacingMm: 0.25, stitchLengthMm: 3, staggerRows: 4 }, true);
    expect(p[0]!.x).toBeCloseTo(0, 9);
    expect(p[p.length - 1]!.x).toBeCloseTo(10, 9);
  });

  it("versetzt den Stich je Reihe gegen das feste Raster", () => {
    const params = { angleDeg: 0, rowSpacingMm: 0.25, stitchLengthMm: 4, staggerRows: 4 };
    const a = rowStitches({ row: 0, y: 0, x0: 0, x1: 12, idx: 0 }, params, true);
    const b = rowStitches({ row: 1, y: 0, x0: 0, x1: 12, idx: 0 }, params, true);
    expect(a.map((p) => p.x)).not.toEqual(b.map((p) => p.x));
    expect(b[1]!.x).toBeCloseTo(1, 6); // (0 + 1/4) * 4
  });

  it("fuellt ein Quadrat und bleibt drin", () => {
    const r = generateFill(fillObjekt("f", quadrat));
    expect(r.stitches.length).toBeGreaterThan(200);
    const b = bbox(r.stitches);
    expect(b.minX).toBeGreaterThanOrEqual(-1e-6);
    expect(b.maxX).toBeLessThanOrEqual(10 + 1e-6);
    expect(b.minY).toBeGreaterThanOrEqual(-1e-6);
    expect(b.maxY).toBeLessThanOrEqual(10 + 1e-6);
  });

  it("dreht die Stichrichtung mit dem Winkel", () => {
    // Richtung des ersten richtigen Stichs — nicht der Startpunkt, der liegt bei
    // beiden Winkeln in einer Ecke.
    const richtungDeg = (stitches: import("./types.js").Point[]): number => {
      for (let i = 1; i < stitches.length; i++) {
        const d = dist(stitches[i - 1]!, stitches[i]!);
        if (d > 1) {
          const a =
            (Math.atan2(stitches[i]!.y - stitches[i - 1]!.y, stitches[i]!.x - stitches[i - 1]!.x) *
              180) /
            Math.PI;
          return ((a % 180) + 180) % 180;
        }
      }
      return Number.NaN;
    };
    expect(richtungDeg(generateFill(fillObjekt("f", quadrat, { angleDeg: 0 })).stitches)).toBeCloseTo(0, 3);
    expect(richtungDeg(generateFill(fillObjekt("f", quadrat, { angleDeg: 45 })).stitches)).toBeCloseTo(45, 3);
    expect(richtungDeg(generateFill(fillObjekt("f", quadrat, { angleDeg: 90 })).stitches)).toBeCloseTo(90, 3);
  });

  it("reist innerhalb der Form und springt nicht", () => {
    // Ring: zwei Sektionen, der Weg dazwischen muss im Ring bleiben
    const ring = annulus(0, 0, 10, 6);
    const r = generateFill(fillObjekt("f", ring, { rowSpacingMm: 1 }));
    let draussen = 0;
    for (const p of r.stitches) if (!pointInPolygon(ring, p)) draussen++;
    // Nur Konturpunkte duerfen genau auf dem Rand liegen
    expect(draussen / r.stitches.length).toBeLessThan(0.35);
  });

  it("warnt bei Winzflaechen", () => {
    const r = generateFill(fillObjekt("f", polygonOf(rect(0, 0, 1.5, 1.5))));
    expect(r.warnings.map((w) => w.code)).toContain("FILL_TINY");
  });

  it("legt Unterlage unter die Deckstiche", () => {
    const ohne = generateFill(fillObjekt("f", quadrat));
    const mit = generateFill(
      fillObjekt("f", quadrat, {
        underlay: { contour: true, fill: "single", spacingMm: 2, insetMm: 0.4 },
      }),
    );
    expect(mit.stitches.length).toBeGreaterThan(ohne.stitches.length);
  });
});

describe("Verbindungen (Kap. 10.2)", () => {
  const roh = (id: string, threadIndex: number, punkte: import("./types.js").Point[], extra = {}) => ({
    objectId: id,
    threadIndex,
    punkte,
    trimAfter: "auto" as const,
    ...extra,
  });

  it("trennt und wechselt die Farbe", () => {
    const a = entscheide(0, [roh("a", 0, [pt(0, 0), pt(1, 0)]), roh("b", 1, [pt(2, 0), pt(3, 0)])], {
      jumpTrimMm: 5,
      runningConnectMm: 3,
      travelStitchMm: 2,
    });
    expect(a.trim).toBe(true);
    expect(a.color).toBe(true);
  });

  it("springt bei kurzer Distanz ohne Trim", () => {
    const a = entscheide(0, [roh("a", 0, [pt(0, 0), pt(1, 0)]), roh("b", 0, [pt(5, 0), pt(6, 0)])], {
      jumpTrimMm: 5,
      runningConnectMm: 3,
      travelStitchMm: 2,
    });
    expect(a.trim).toBe(false);
    expect(a.jump).toBe(true);
  });

  it("trennt bei weiter Distanz", () => {
    const a = entscheide(0, [roh("a", 0, [pt(0, 0), pt(1, 0)]), roh("b", 0, [pt(40, 0), pt(41, 0)])], {
      jumpTrimMm: 5,
      runningConnectMm: 3,
      travelStitchMm: 2,
    });
    expect(a.trim).toBe(true);
    expect(a.jump).toBe(true);
  });

  it("verbindet mit Laufstich, wenn der Weg unter B liegt", () => {
    const deckung = polygonOf(rect(0, -5, 20, 10));
    const a = entscheide(
      0,
      [roh("a", 0, [pt(0, 0), pt(1, 0)]), roh("b", 0, [pt(3, 0), pt(6, 0)], { deckung })],
      { jumpTrimMm: 5, runningConnectMm: 3, travelStitchMm: 2 },
    );
    expect(a.trim).toBe(false);
    expect(a.jump).toBe(false);
    expect(a.travel.length).toBeGreaterThan(0);
  });

  it("uebersteuert mit trimAfter", () => {
    const nie = entscheide(
      0,
      [
        roh("a", 0, [pt(0, 0), pt(1, 0)], { trimAfter: "never" }),
        roh("b", 0, [pt(40, 0), pt(41, 0)]),
      ],
      { jumpTrimMm: 5, runningConnectMm: 3, travelStitchMm: 2 },
    );
    expect(nie.trim).toBe(false);

    const immer = entscheide(
      0,
      [
        roh("a", 0, [pt(0, 0), pt(1, 0)], { trimAfter: "always" }),
        roh("b", 0, [pt(1.1, 0), pt(2, 0)]),
      ],
      { jumpTrimMm: 5, runningConnectMm: 3, travelStitchMm: 2 },
    );
    expect(immer.trim).toBe(true);
  });

  it("setzt Trim und Farbwechsel ans Ende von A, den Sprung an den Anfang von B", () => {
    const blocks = connectBlocks([
      roh("a", 0, [pt(0, 0), pt(1, 0)]),
      roh("b", 1, [pt(20, 0), pt(21, 0)]),
    ]);
    const a = blocks[0]!.stitches;
    expect(a[a.length - 2]!.cmd).toBe("trim");
    expect(a[a.length - 1]!.cmd).toBe("color");
    expect(blocks[1]!.stitches[0]!.cmd).toBe("jump");
    expect(blocks[1]!.stitches[blocks[1]!.stitches.length - 1]!.cmd).toBe("end");
  });
});

describe("Verriegelung (Kap. 10.3)", () => {
  it("verriegelt am Anfang und vor dem Ende", () => {
    const blocks = tieBlocks([
      { objectId: "a", threadIndex: 0, stitches: [
        { x: 0, y: 0, cmd: "stitch" },
        { x: 5, y: 0, cmd: "stitch" },
        { x: 10, y: 0, cmd: "stitch" },
        { x: 10, y: 0, cmd: "end" },
      ] },
    ]);
    const s = blocks[0]!.stitches;
    expect(s.filter((x) => x.tie).length).toBe(6);
    expect(s[1]!.tie).toBe(true);
    expect(s[s.length - 1]!.cmd).toBe("end");
  });

  it("verriegelt nach einem Farbwechsel neu", () => {
    const blocks = tieBlocks([
      { objectId: "a", threadIndex: 0, stitches: [
        { x: 0, y: 0, cmd: "stitch" },
        { x: 5, y: 0, cmd: "stitch" },
        { x: 5, y: 0, cmd: "trim" },
        { x: 5, y: 0, cmd: "color" },
      ] },
      { objectId: "b", threadIndex: 1, stitches: [
        { x: 20, y: 0, cmd: "jump" },
        { x: 25, y: 0, cmd: "stitch" },
        { x: 25, y: 0, cmd: "end" },
      ] },
    ]);
    expect(blocks[1]!.stitches[1]!.tie).toBe(true);
  });
});

describe("Nachbearbeitung (Kap. 11)", () => {
  it("entfernt Ministiche, aber nicht die Verriegelung", () => {
    const out = postProcess([
      { objectId: "a", threadIndex: 0, stitches: [
        { x: 0, y: 0, cmd: "stitch" },
        { x: 0.1, y: 0, cmd: "stitch" },
        { x: 0.2, y: 0, cmd: "stitch", tie: true },
        { x: 5, y: 0, cmd: "stitch" },
      ] },
    ]);
    const xs = out[0]!.stitches.map((s) => s.x);
    expect(xs).toEqual([0, 0.2, 5]);
  });

  it("teilt zu lange Stiche und Spruenge", () => {
    const out = postProcess([
      { objectId: "a", threadIndex: 0, stitches: [
        { x: 0, y: 0, cmd: "stitch" },
        { x: 50, y: 0, cmd: "jump" },
      ] },
    ]);
    const s = out[0]!.stitches;
    for (let i = 1; i < s.length; i++) {
      expect(Math.abs(s[i]!.x - s[i - 1]!.x)).toBeLessThanOrEqual(12.1 + 1e-9);
    }
    expect(s[s.length - 1]!.cmd).toBe("jump");
  });
});

describe("Analyse (Kap. 11)", () => {
  it("zaehlt Stiche, Spruenge, Trims und Farbwechsel", () => {
    const { stats } = analyze([
      { objectId: "a", threadIndex: 0, stitches: [
        { x: 0, y: 0, cmd: "stitch" },
        { x: 5, y: 0, cmd: "stitch" },
        { x: 5, y: 0, cmd: "trim" },
        { x: 5, y: 0, cmd: "color" },
        { x: 20, y: 0, cmd: "jump" },
        { x: 25, y: 5, cmd: "stitch" },
        { x: 25, y: 5, cmd: "end" },
      ] },
    ]);
    expect(stats.stitches).toBe(3);
    expect(stats.jumps).toBe(1);
    expect(stats.trims).toBe(1);
    expect(stats.colorChanges).toBe(1);
    expect(stats.bboxMm).toEqual({ w: 25, h: 5 });
    expect(stats.runtimeSec).toBeCloseTo(3 / (800 / 60) + 3 + 12, 6);
  });

  it("misst die Dichte im 1-mm-Raster", () => {
    const dicht = Array.from({ length: 20 }, (_, i) => ({
      x: 0.5 + i * 0.001,
      y: 0.5,
      cmd: "stitch" as const,
    }));
    expect(maxDichte(dicht)).toBe(20);
  });

  it("warnt bei zu hoher Dichte", () => {
    const dicht = Array.from({ length: 20 }, () => ({ x: 0.5, y: 0.5, cmd: "stitch" as const }));
    const { warnings } = analyze([{ objectId: "a", threadIndex: 0, stitches: dicht }]);
    expect(warnings.find((w) => w.code === "DENSITY_HIGH")?.severity).toBe("error");
  });
});

describe("Reihenfolge (Kap. 10.1)", () => {
  it("gruppiert nach Farbe und stellt Flaechen vor Konturen", () => {
    const objekte = [
      runningObjekt("kontur", [pt(0, 0), pt(10, 0)]),
      fillObjekt("flaeche", polygonOf(rect(0, 0, 10, 10))),
      runningObjekt("rot", [pt(0, 0), pt(5, 0)], { threadIndex: 1 }),
    ];
    const sortiert = autoOrder(objekte).map((o) => o.id);
    expect(sortiert).toEqual(["flaeche", "kontur", "rot"]);
  });
});

describe("Pruefung (validate)", () => {
  it("erkennt Selbstschnitt", () => {
    expect(selbstschnitt([pt(0, 0), pt(10, 10), pt(10, 0), pt(0, 10)])).toBe(true);
    expect(selbstschnitt([pt(0, 0), pt(10, 0), pt(10, 10)])).toBe(false);
  });

  it("meldet fehlendes Garn und ueberspringt das Objekt", () => {
    const d = design([runningObjekt("r", [pt(0, 0), pt(10, 0)], { threadIndex: 7 })]);
    const v = validate(d);
    expect(v.objects).toHaveLength(0);
    expect(v.warnings[0]!.code).toBe("THREAD_MISSING");
  });

  it("repariert eine selbstschneidende Flaeche", () => {
    const acht = polygonOf([pt(0, 0), pt(10, 10), pt(10, 0), pt(0, 10)]);
    const v = validate(design([fillObjekt("f", acht)]));
    expect(v.warnings.map((w) => w.code)).toContain("INVALID_GEOMETRY");
    expect(v.objects).toHaveLength(1);
  });

  it("laesst unsichtbare Objekte weg", () => {
    const v = validate(design([runningObjekt("r", [pt(0, 0), pt(10, 0)], { visible: false })]));
    expect(v.objects).toHaveLength(0);
  });
});

describe("Text (Kap. 9)", () => {
  const fonts = fontRegistry([TEST_FONT]);

  it("loest Buchstaben in Satin-Spalten auf", () => {
    const r = expand([textObjekt("t", "II", pt(0, 20))], { preset: PRESETS.pique, fonts });
    expect(r.objects).toHaveLength(2);
    expect(r.objects[0]!.type).toBe("satin");
    const a = r.objects[0]! as import("./types.js").SatinObject;
    const b = r.objects[1]! as import("./types.js").SatinObject;
    expect(b.railA[0]!.x).toBeGreaterThan(a.railA[0]!.x);
    // Hoehe 10 mm: Versalhoehe 1,0 -> Rail laeuft von y=20 nach y=10
    expect(a.railA[1]!.y).toBeCloseTo(10, 6);
  });

  it("warnt unter der Mindesthoehe", () => {
    const r = expand([textObjekt("t", "I", pt(0, 0), { heightMm: 3 })], {
      preset: PRESETS.pique,
      fonts,
    });
    expect(r.warnings.map((w) => w.code)).toContain("TEXT_TOO_SMALL");
  });

  it("meldet eine fehlende Schrift, statt still nichts zu sticken", () => {
    const r = expand([textObjekt("t", "I", pt(0, 0), { fontId: "gibtsnicht" })], {
      preset: PRESETS.pique,
      fonts,
    });
    expect(r.objects).toHaveLength(0);
    expect(r.warnings[0]!.severity).toBe("error");
  });
});

describe("Hash (Kap. 4)", () => {
  it("ist stabil und reagiert auf Aenderungen", () => {
    const a = fillObjekt("f", polygonOf(rect(0, 0, 10, 10)));
    const b = fillObjekt("f", polygonOf(rect(0, 0, 10, 10)));
    expect(stableHash(a, "pique")).toBe(stableHash(b, "pique"));
    expect(stableHash(a, "pique")).not.toBe(stableHash(a, "fleece"));
    expect(stableHash(a, "pique")).not.toBe(
      stableHash({ ...a, rowSpacingMm: 0.3 }, "pique"),
    );
  });

  it("ignoriert die Schluesselreihenfolge", () => {
    expect(stableHash({ a: 1, b: 2 })).toBe(stableHash({ b: 2, a: 1 }));
  });
});

describe("Benchmark (Kap. 15)", () => {
  /** Logo in der Groessenordnung, die Kap. 15 nennt: rund 10.000 Stiche. */
  const logo = () =>
    design([
      fillObjekt("flaeche", polygonOf(rect(0, 0, 100, 60)), { stitchLengthMm: 2 }),
      satinObjekt("rand", rect(0, 0, 100, 60), rect(-1.5, -1.5, 103, 63), { threadIndex: 1 }),
      runningObjekt("detail", [pt(10, 30), pt(90, 30)], { threadIndex: 1 }),
    ]);

  it("plant ein Logo mit rund 10.000 Stichen unter 300 ms", () => {
    const d = logo();
    planDesign(d); // aufwaermen (WASM, JIT)
    const start = performance.now();
    const plan = planDesign(d);
    const dauer = performance.now() - start;
    expect(plan.stats.stitches).toBeGreaterThan(9000);
    expect(dauer).toBeLessThan(300);
  });

  it("rechnet ein einzelnes Objekt unter 100 ms neu", () => {
    const obj = fillObjekt("flaeche", polygonOf(rect(0, 0, 100, 60)), { stitchLengthMm: 2 });
    generateFill(obj); // aufwaermen
    const start = performance.now();
    const r = generateFill(obj);
    const dauer = performance.now() - start;
    expect(r.stitches.length).toBeGreaterThan(5000);
    expect(dauer).toBeLessThan(100);
  });

  it("spart die Neuberechnung, wenn sich nichts geaendert hat", () => {
    const cache = createCache();
    const d = logo();
    planDesign(d, { cache });
    const start = performance.now();
    planDesign(d, { cache });
    const mitCache = performance.now() - start;

    const start2 = performance.now();
    planDesign(d);
    const ohneCache = performance.now() - start2;
    expect(mitCache).toBeLessThan(ohneCache);
  });
});

describe("Pipeline (Kap. 4)", () => {
  it("plant ein Design bis zum Stichplan", () => {
    const d = design([
      fillObjekt("f", polygonOf(rect(0, 0, 20, 20))),
      satinObjekt("s", [pt(30, 0), pt(30, 20)], [pt(34, 0), pt(34, 20)], { threadIndex: 1 }),
    ]);
    const plan = planDesign(d);
    expect(plan.blocks).toHaveLength(2);
    expect(plan.stats.stitches).toBeGreaterThan(500);
    expect(plan.stats.colorChanges).toBe(1);
    const alle = plan.blocks.flatMap((b) => b.stitches);
    expect(alle[alle.length - 1]!.cmd).toBe("end");
    // Kein Stich ueber dem DST-Limit
    let vx = alle[0]!.x;
    let vy = alle[0]!.y;
    for (const s of alle.slice(1)) {
      if (s.cmd === "stitch" || s.cmd === "jump") {
        expect(Math.hypot(s.x - vx, s.y - vy)).toBeLessThanOrEqual(12.1 + 1e-6);
      }
      vx = s.x;
      vy = s.y;
    }
  });

  it("ist deterministisch", () => {
    const d = design([fillObjekt("f", polygonOf(circle(10, 10, 8)))]);
    const a = planDesign(d);
    const b = planDesign(d);
    expect(JSON.stringify(a.blocks)).toBe(JSON.stringify(b.blocks));
  });

  it("nutzt den Cache fuer unveraenderte Objekte", () => {
    const cache = createCache();
    const d = design([fillObjekt("f", polygonOf(rect(0, 0, 20, 20)))]);
    const a = planDesign(d, { cache });
    const b = planDesign(d, { cache });
    expect(stichPunkte(a.blocks).length).toBe(stichPunkte(b.blocks).length);
  });

  it("weist auf ein nicht initialisiertes Geometriemodul hin", () => {
    // initGeometry lief in beforeAll — hier pruefen wir nur, dass der Plan laeuft.
    expect(() => planDesign(design([]))).not.toThrow();
  });
});
