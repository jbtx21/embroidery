/**
 * Das Tor der Mindestgröße (docs/Engine-Spezifikation.md §5.2, tools/tor.mjs): die Suche für eine
 * SVG-Datei, die erste Zeile der Ausgabe, die Rahmenzeile darunter, die Zeilen weiter unten und die
 * Dateinamen. Gerechnet wird in packages/engine/src/inkstitch/min-size-search.ts und dort geprüft; hier
 * steht, dass die Datei so gelesen wird, wie der Lauf sie liest, und dass das, was der Nutzer liest,
 * dazu passt. Eigene Formen, keine Kundenlogos.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  findMinimumSize,
  importShapes,
  initEngine,
  MACHINE_CAP,
  MACHINE_DEFAULT,
  PRESETS,
} from "@texma-stitch/engine";
import {
  aloneScene,
  barAt,
  fadingScene,
  frozenScene,
  growScene,
  ORDERED_MM,
  scaledAt,
  SVG_NO_VIEWBOX,
  shadowScene,
  svgOf,
} from "../packages/engine/test/fixtures/gate.js";
import { areaShape } from "../packages/engine/test/fixtures/shapes.js";
import {
  dateiname,
  formenBei,
  rahmenZeile,
  sucheTor,
  torDetails,
  torKopf,
  torKurz,
  UNTER_SUFFIX,
} from "../tools/tor.mjs";

beforeAll(async () => {
  await initEngine();
});

/** Die Strichmenge der bestellten Größe, so viele Striche, die ersten `schatten` davon Schattenlinien. */
const strichmenge = (n: number, schatten = 0) =>
  Array.from({ length: n }, (_, i) => ({
    key: `z${i}`,
    id: `z${i}`,
    color: "#000000",
    widthMm: 0.9,
    shadowLine: i < schatten,
    limitMm: i < schatten ? 0.7 : 1.0,
  }));

/** Das Ergebnis der Suche, wie es die Engine gibt, mit dem, was der Text liest. */
const suche = (over: Record<string, unknown> = {}) => ({
  orderedWidthMm: 80,
  widthMm: 91,
  found: true,
  maxWidthMm: 800,
  enlarged: true,
  belowMinimum: true,
  decisive: {
    id: "z13-bebebe-012",
    color: "#bebebe",
    orderedMm: 0.883,
    limitMm: 1.0,
    shadowLine: false,
    measuredMm: 0.981,
    atWidthMm: 87,
    toMm: 90.6,
  },
  steps: [
    { widthMm: 80, under: 12 },
    { widthMm: 87, under: 3 },
    { widthMm: 91, under: 0 },
  ],
  ordered: strichmenge(24, 3),
  shadowLines: ["z0", "z1", "z2"],
  limits: { satinMinMm: 1.0, shadowMinMm: 0.7 },
  ...over,
});
const tor = (s: ReturnType<typeof suche>, over: Record<string, unknown> = {}) => ({
  bestelltMm: s.orderedWidthMm,
  search: s,
  ohneTor: false,
  erzeugtMm: s.enlarged ? s.widthMm : s.orderedWidthMm,
  vergroessert: s.enlarged,
  unterMindestgroesse: false,
  ...over,
});
/** Ein Motiv, das nicht in den Rahmen passt: 250 × 233 mm gegen 360 × 200 mm, auch gedreht nicht. */
const zuGross = {
  widthMm: 250.04,
  heightMm: 233.014,
  machine: MACHINE_DEFAULT,
  fits: false,
  turned: false,
  breiteMm: 250,
};

describe("formenBei (die Formen der SVG in einer anderen Breite, wie --breite sie liest)", () => {
  const text = svgOf(aloneScene(0.9));
  const original = importShapes(text);

  it("gibt in der Breite der Datei die eingelesenen Formen selbst zurück", () => {
    expect(formenBei(text, original)(80)).toBe(original.shapes);
  });

  it("liest die Datei in einer anderen Breite neu ein: alle Maße im Verhältnis", () => {
    const shapes = formenBei(text, original)(120);
    const s = shapes[0]!;
    if (s.kind !== "area") throw new Error("area expected");
    const ys = s.polygon.outer.map((p) => p.y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(0.9 * 1.5, 6);
  });

  it("liest jede Größe nur einmal: die Suche, der Rahmen und die Prüfstellen fragen nach derselben", () => {
    const formen = formenBei(text, original);
    expect(formen(120)).toBe(formen(120));
  });

  it("wirft, wo die Datei keine viewBox hat: dann folgt die Zeichnung der Größe nicht", () => {
    const ohne = text.replace(/ viewBox="[^"]*"/, "");
    expect(() => formenBei(ohne, importShapes(ohne))(120)).toThrow(/viewBox/);
  });
});

describe("sucheTor (das Tor für eine SVG-Datei)", () => {
  const svg = (shapes: ReturnType<typeof aloneScene>, widthMm = ORDERED_MM, heightMm = 30) => {
    const text = svgOf(shapes, widthMm, heightMm);
    return { text, original: importShapes(text) };
  };

  it("findet für einen freien Strich von 0,9 mm die Mindestgröße und erzeugt dort", () => {
    const { text, original } = svg(aloneScene(0.9));
    const t = sucheTor(text, original, { bestelltMm: 80, preset: PRESETS.pique });
    expect(t.fehler).toBeUndefined();
    expect(t.search.found).toBe(true);
    expect(t.search.widthMm).toBeGreaterThan(80);
    expect(t.search.widthMm).toBeLessThan(100);
    expect(t.erzeugtMm).toBe(t.search.widthMm);
    expect(t.vergroessert).toBe(true);
    expect(t.unterMindestgroesse).toBe(false);
    // Dieselbe Zahl wie die Suche der Engine, der die Formen in der Größe gegeben werden.
    const direkt = findMinimumSize(scaledAt(aloneScene(0.9)), { orderedWidthMm: 80 });
    expect(t.search.widthMm).toBe(direkt.widthMm);
  });

  it("lässt eine Schattenlinie in der bestellten Größe", () => {
    const { text, original } = svg(shadowScene(0.5));
    const t = sucheTor(text, original, { bestelltMm: 80 });
    expect(t.search.widthMm).toBe(80);
    expect(t.erzeugtMm).toBe(80);
    expect(t.vergroessert).toBe(false);
    expect(t.search.shadowLines).toEqual(["schatten"]);
  });

  it("zählt, was in der bestellten Größe Satin ist, und nur das: ein Haar, das erst beim Vergrößern Satin wird, bestimmt nichts", () => {
    const { text, original } = svg(growScene(0.6));
    const t = sucheTor(text, original, { bestelltMm: 80 });
    expect(t.search.ordered.map((o: { id: string }) => o.id)).toEqual(["strich"]);
    const nurStrich = svg([growScene(0.6)[0]!]);
    expect(t.search.widthMm).toBe(
      sucheTor(nurStrich.text, nurStrich.original, { bestelltMm: 80 }).search.widthMm,
    );
  });

  it("hält den Status der Schattenlinie aus der bestellten Größe", () => {
    const { text, original } = svg(frozenScene());
    const t = sucheTor(text, original, { bestelltMm: 80 });
    expect(t.search.shadowLines).toEqual(["schatten"]);
    expect(t.search.decisive.id).toBe("frei");
  });

  it("mit --ohne-tor wird nicht vergrößert, und unter der Mindestgröße heißt das so", () => {
    const { text, original } = svg(aloneScene(0.9));
    const t = sucheTor(text, original, { bestelltMm: 80, ohneTor: true });
    expect(t.search.widthMm).toBeGreaterThan(80); // die Mindestgröße wird trotzdem gesucht
    expect(t.erzeugtMm).toBe(80);
    expect(t.vergroessert).toBe(false);
    expect(t.unterMindestgroesse).toBe(true);
    expect(t.ohneTor).toBe(true);
  });

  it("mit --ohne-tor über der Mindestgröße ist nichts unter ihr", () => {
    const { text, original } = svg(aloneScene(1.6));
    const t = sucheTor(text, original, { bestelltMm: 80, ohneTor: true });
    expect(t.unterMindestgroesse).toBe(false);
    expect(t.erzeugtMm).toBe(80);
  });

  it("sucht von der bestellten Breite aus, nicht von der der Datei: --breite", () => {
    const { text, original } = svg(aloneScene(0.9));
    // In 120 mm ist der Strich 1,35 mm breit: er hält, die Datei ist 80 mm breit.
    const t = sucheTor(text, original, { bestelltMm: 120 });
    expect(t.bestelltMm).toBe(120);
    expect(t.search.orderedWidthMm).toBe(120);
    expect(t.search.widthMm).toBe(120);
    expect(t.vergroessert).toBe(false);
  });

  it("gibt die Formen der Suche aus der Datei in der gefragten Größe, nicht gerechnet aus der bestellten", () => {
    // Eine Datei in 80 mm, bestellt in 60: der Strich von 0,75 mm ist dort 0,56 mm breit, ein Laufstich: kein Satin, nichts zu halten.
    const { text, original } = svg(aloneScene(0.75));
    const t = sucheTor(text, original, { bestelltMm: 60 });
    expect(t.search.found).toBe(true);
    expect(t.search.widthMm).toBe(60);
    expect(t.search.belowMinimum).toBe(false);
    expect(t.search.ordered).toEqual([]);
  });

  it("nennt, wo die Datei sich nicht in einer anderen Größe lesen lässt, den Fehler und erzeugt nichts", () => {
    // Ohne viewBox sind die Koordinaten Pixel: der Strich von 0,9 mm (3,4 px) ist zu schmal, die
    // Suche müsste die Datei größer lesen — und kann es nicht.
    const ohne = SVG_NO_VIEWBOX;
    const t = sucheTor(ohne, importShapes(ohne), { bestelltMm: 80 });
    expect(t.fehler).toMatch(/viewBox/);
    expect(t.erzeugtMm).toBeUndefined();
    expect(t.vergroessert).toBe(false);
  });

  it("gibt auf und sagt es, wo die Suche keine Größe findet — nicht still in der bestellten erzeugen", () => {
    const { text, original } = svg(aloneScene(0.9));
    const t = sucheTor(text, original, { bestelltMm: 80, suche: { maxSteps: 2 } });
    expect(t.search.found).toBe(false);
    expect(t.fehler).toMatch(/2 Prüfungen/);
    expect(t.erzeugtMm).toBeUndefined();
    expect(t.rahmen).toBeUndefined();
    // Mit --ohne-tor läuft es in der bestellten Größe, als unter der Mindestgröße, und ohne Fehler.
    const o = sucheTor(text, original, { bestelltMm: 80, ohneTor: true, suche: { maxSteps: 2 } });
    expect(o.fehler).toBeUndefined();
    expect(o.erzeugtMm).toBe(80);
    expect(o.unterMindestgroesse).toBe(true);
  });

  it("sagt bei einer einzigen Prüfung „1 Prüfung“", () => {
    const { text, original } = svg(aloneScene(0.9));
    const t = sucheTor(text, original, { bestelltMm: 80, suche: { maxSteps: 1 } });
    expect(t.fehler).toMatch(/nach 1 Prüfung \(/);
  });

  describe("der Rahmen des Presets (Spec §5.2, 01.10.2026)", () => {
    /** Ein Strich von 2 mm, `laengeMm` lang, `hochMm` hoch ... ein Balken, der schmal genug ist, nichts zu bestimmen. */
    const balken = (laengeMm: number, hochMm: number) => [
      areaShape("balken", barAt(0, 0, laengeMm, hochMm), "#000000"),
    ];

    it("passt: das Motiv in der erzeugten Größe liegt im Rahmen", () => {
      const { text, original } = svg(aloneScene(1.6));
      const t = sucheTor(text, original, { bestelltMm: 80, preset: PRESETS.pique });
      expect(t.rahmen).toMatchObject({ fits: true, turned: false, breiteMm: 80 });
      expect(t.rahmen.machine).toBe(MACHINE_DEFAULT);
    });

    it("passt nicht, auch gedreht nicht: nennt die Größe, den Rahmen und die Breite, in der erzeugt wird", () => {
      const { text, original } = svg(balken(400, 3), 400, 10);
      const t = sucheTor(text, original, { bestelltMm: 400, preset: PRESETS.pique });
      expect(t.rahmen.fits).toBe(false);
      expect(t.rahmen.turned).toBe(false);
      expect(t.rahmen.widthMm).toBeCloseTo(400, 6);
      expect(t.rahmen.heightMm).toBeCloseTo(3, 6);
      expect(t.rahmen.breiteMm).toBe(400);
      // Erzeugt wird trotzdem: kein Fehler, eine Größe.
      expect(t.fehler).toBeUndefined();
      expect(t.erzeugtMm).toBe(400);
    });

    it("passt nur gedreht: eine Seite über dem Rahmen, um 90° gedreht im Rahmen", () => {
      const { text, original } = svg(balken(3, 250), 80, 250);
      const t = sucheTor(text, original, { bestelltMm: 80, preset: PRESETS.pique });
      expect(t.rahmen).toMatchObject({ fits: true, turned: true });
    });

    it("gilt auch, wo die erzeugte Größe die bestellte ist: S = R", () => {
      const { text, original } = svg(balken(400, 3), 400, 10);
      const t = sucheTor(text, original, { bestelltMm: 400 });
      expect(t.vergroessert).toBe(false);
      expect(t.rahmen.fits).toBe(false);
    });

    it("misst die erzeugte Größe, nicht die bestellte: die Mindestgröße kann aus dem Rahmen herausführen", () => {
      // Der Strich von 0,9 mm braucht rund 87 mm; der Balken daneben ist in 80 mm 345 mm lang und passt in
      // den Rahmen von 360 mm, in 87 mm ist er 375 mm lang und passt nicht.
      const shapes = [...aloneScene(0.9), areaShape("lang", barAt(0, 20, 345, 3), "#000000")];
      const { text, original } = svg(shapes, 80, 30);
      const t = sucheTor(text, original, { bestelltMm: 80 });
      expect(t.vergroessert).toBe(true);
      expect(t.rahmen.breiteMm).toBe(t.erzeugtMm);
      expect(t.rahmen.widthMm).toBeCloseTo(345 * (t.erzeugtMm / 80), 4);
      expect(t.rahmen.fits).toBe(false);
      // In der bestellten Größe passte es.
      const bestellt = sucheTor(text, original, { bestelltMm: 80, ohneTor: true });
      expect(bestellt.rahmen.fits).toBe(true);
    });

    it("nimmt für das Cap-Preset den Cap-Rahmen: 130 × 60 mm", () => {
      const { text, original } = svg(balken(140, 3), 140, 10);
      const t = sucheTor(text, original, { bestelltMm: 140, preset: PRESETS.cap });
      expect(t.rahmen.machine).toBe(MACHINE_CAP);
      expect(t.rahmen.fits).toBe(false);
      const klein = svg(balken(100, 3), 100, 10);
      expect(
        sucheTor(klein.text, klein.original, { bestelltMm: 100, preset: PRESETS.cap }).rahmen.fits,
      ).toBe(true);
    });

    it("misst mit --ohne-tor in der bestellten Größe, die erzeugt wird", () => {
      const { text, original } = svg(balken(400, 3), 400, 10);
      const t = sucheTor(text, original, { bestelltMm: 400, ohneTor: true });
      expect(t.rahmen.breiteMm).toBe(400);
      expect(t.rahmen.fits).toBe(false);
    });
  });
});

describe("rahmenZeile (die Warnung unter der ersten Zeile)", () => {
  it("nennt die Größe des Motivs, die Breite, den Rahmen und seine Maße — und dass trotzdem erzeugt wird", () => {
    const zeile = rahmenZeile(zuGross);
    expect(zeile).toBe(
      "WARNUNG Rahmen: Das Motiv ist in 250 mm 250 × 233 mm groß, der Rahmen „Standard 800 U/min“ fasst " +
        "360 × 200 mm — auch um 90° gedreht passt es nicht. Erzeugt wird trotzdem: der Rahmen ist eine " +
        "Frage der Maschine (größerer Rahmen, Teilung), das Motiv selbst ist in dieser Größe stickbar.",
    );
  });

  it("schreibt Größen mit einer Stelle nach dem Punkt, wo nötig, und nennt den Cap-Rahmen", () => {
    const zeile = rahmenZeile({
      widthMm: 142.0,
      heightMm: 201.6,
      machine: { ...MACHINE_CAP, hoopWMm: 130, hoopHMm: 60 },
      fits: false,
      turned: false,
      breiteMm: 110.8,
    });
    expect(zeile).toContain("in 110.8 mm 142 × 201.6 mm groß");
    expect(zeile).toContain("„Cap-Rahmen“ fasst 130 × 60 mm");
  });
});

describe("torKopf (die erste Zeile der Ausgabe)", () => {
  it("sagt bestellt, stickbar ab, erzeugt und das bestimmende Element", () => {
    const lines = torKopf(tor(suche()));
    expect(lines).toEqual([
      "Bestellt 80 mm · stickbar ab 91 mm · erzeugt in 91 mm — bestimmt von z13-bebebe-012 " +
        "(0.88 mm bei 80 mm, Grenze 1.0 mm)",
    ]);
  });

  it("sagt, wo die Größe hält, dass sie hält — ohne Größe nach Komma bei ganzen Millimetern", () => {
    const s = suche({
      orderedWidthMm: 110.828,
      widthMm: 110.828,
      enlarged: false,
      belowMinimum: false,
      decisive: undefined,
    });
    expect(torKopf(tor(s))).toEqual([
      "Bestellt 110.8 mm · stickbar in dieser Größe · erzeugt in 110.8 mm",
    ]);
  });

  it("setzt die Rahmenwarnung als eigene Zeile gleich unter die erste", () => {
    const lines = torKopf(tor(suche(), { rahmen: zuGross }));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^Bestellt 80 mm · stickbar ab 91 mm/);
    expect(lines[1]).toBe(rahmenZeile(zuGross));
  });

  it("warnt auch, wo die bestellte Größe hält und erzeugt wird: S = R", () => {
    const s = suche({ widthMm: 80, enlarged: false, belowMinimum: false, decisive: undefined });
    const lines = torKopf(tor(s, { rahmen: { ...zuGross, breiteMm: 80 } }));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe("Bestellt 80 mm · stickbar in dieser Größe · erzeugt in 80 mm");
    expect(lines[1]).toContain("WARNUNG Rahmen:");
  });

  it("schweigt, wo das Motiv passt — auch wo es nur gedreht passt", () => {
    const passt = { ...zuGross, fits: true, turned: false };
    expect(torKopf(tor(suche(), { rahmen: passt }))).toHaveLength(1);
    expect(torKopf(tor(suche(), { rahmen: { ...passt, turned: true } }))).toHaveLength(1);
  });

  it("nennt mit --ohne-tor die bestellte Größe als erzeugte und warnt deutlich", () => {
    const lines = torKopf(
      tor(suche(), {
        ohneTor: true,
        erzeugtMm: 80,
        vergroessert: false,
        unterMindestgroesse: true,
      }),
    );
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe(
      "Bestellt 80 mm · stickbar ab 91 mm · erzeugt in 80 mm (--ohne-tor: nicht vergrößert) — " +
        "bestimmt von z13-bebebe-012 (0.88 mm bei 80 mm, Grenze 1.0 mm)",
    );
    expect(lines[1]).toContain("WARNUNG");
    expect(lines[1]).toContain("80 mm liegt unter der Mindestgröße von 91 mm");
    expect(lines[1]).toContain(UNTER_SUFFIX);
    expect(lines[1]).toContain("kein Stickprogramm für einen Auftrag");
  });

  it("legt mit --ohne-tor die Rahmenwarnung vor die Warnung unter der Mindestgröße: gleich unter die erste Zeile", () => {
    const lines = torKopf(
      tor(suche(), {
        ohneTor: true,
        erzeugtMm: 80,
        vergroessert: false,
        unterMindestgroesse: true,
        rahmen: zuGross,
      }),
    );
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain("WARNUNG Rahmen:");
    expect(lines[2]).toContain("liegt unter der Mindestgröße");
  });

  it("sagt mit --ohne-tor über der Mindestgröße nur, dass das Tor aus ist", () => {
    const s = suche({ widthMm: 80, enlarged: false, belowMinimum: false, decisive: undefined });
    expect(torKopf(tor(s, { ohneTor: true }))).toEqual([
      "Bestellt 80 mm · stickbar in dieser Größe · erzeugt in 80 mm (--ohne-tor)",
    ]);
  });

  it("sagt, wo die Suche aufgegeben hat, warum — eine Mindestgröße nennt sie nicht, und der Rahmen schweigt", () => {
    const steps = suche({
      found: false,
      enlarged: false,
      widthMm: 87,
      reason: "steps",
      decisive: undefined,
      steps: [
        { widthMm: 80, under: 12 },
        { widthMm: 87, under: 3 },
      ],
    });
    const [line, ...rest] = torKopf(tor(steps, { erzeugtMm: undefined, fehler: "x" }));
    expect(line).toContain("Bestellt 80 mm");
    expect(line).toContain("keine Mindestgröße gefunden");
    expect(line).toContain("nach 2 Prüfungen");
    expect(rest).toEqual([]);
    const factor = suche({ found: false, enlarged: false, reason: "factor", decisive: undefined });
    expect(torKopf(tor(factor, { erzeugtMm: undefined, fehler: "x" }))[0]).toContain(
      "über dem 10-fachen der bestellten Größe (800 mm)",
    );
    const eng = suche({
      found: false,
      enlarged: false,
      reason: "factor",
      decisive: undefined,
      maxWidthMm: 96,
    });
    expect(torKopf(tor(eng, { erzeugtMm: undefined, fehler: "x" }))[0]).toContain(
      "über dem 1.2-fachen der bestellten Größe (96 mm)",
    );
  });
});

describe("torKopf als Meldung (für pnpm mindestgroesse, das nichts erzeugt)", () => {
  it("sagt bestellt und stickbar ab, ohne eine erzeugte Größe", () => {
    expect(torKopf(tor(suche()), { meldung: true })).toEqual([
      "Bestellt 80 mm · stickbar ab 91 mm — bestimmt von z13-bebebe-012 " +
        "(0.88 mm bei 80 mm, Grenze 1.0 mm)",
    ]);
    const haelt = suche({ widthMm: 80, enlarged: false, belowMinimum: false, decisive: undefined });
    expect(torKopf(tor(haelt), { meldung: true })).toEqual([
      "Bestellt 80 mm · stickbar in dieser Größe",
    ]);
  });

  it("sagt dasselbe über den Rahmen: gleich unter der ersten Zeile", () => {
    const lines = torKopf(tor(suche(), { rahmen: zuGross }), { meldung: true });
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe(rahmenZeile(zuGross));
  });

  it("sagt auch die Meldung, wo die Suche aufgegeben hat, und warnt nicht vor Dateinamen", () => {
    const steps = suche({ found: false, enlarged: false, reason: "steps", decisive: undefined });
    const lines = torKopf(tor(steps, { erzeugtMm: undefined }), { meldung: true });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("keine Mindestgröße gefunden");
    expect(lines[0]).not.toContain("erzeugt");
  });
});

describe("torKurz (für den Kopf des Vorschaubilds)", () => {
  it("nennt die Mindestgröße, die bestellte Größe und das bestimmende Element", () => {
    expect(torKurz(tor(suche()))).toBe(
      "Mindestgröße 91 mm (bestellt 80 mm · bestimmt von z13-bebebe-012, 0.88 mm bei 80 mm)",
    );
  });

  it("sagt, wo die bestellte Größe hält, dass sie hält", () => {
    const s = suche({
      widthMm: 110.828,
      orderedWidthMm: 110.828,
      enlarged: false,
      decisive: undefined,
    });
    expect(torKurz(tor(s))).toBe("Mindestgröße: die bestellten 110.8 mm halten");
  });

  it("sagt, wo nichts gefunden wurde, das", () => {
    expect(torKurz(tor(suche({ found: false, enlarged: false })))).toBe(
      "keine Mindestgröße gefunden",
    );
  });
});

describe("torDetails (was unter der ersten Zeile steht)", () => {
  const hier = (schatten: string[], over: Record<string, unknown> = {}) =>
    tor(
      suche({
        widthMm: 80,
        enlarged: false,
        belowMinimum: false,
        decisive: undefined,
        steps: [{ widthMm: 80, under: 0 }],
        ordered: strichmenge(24, schatten.length),
        shadowLines: schatten,
        ...over,
      }),
    );

  it("sagt, wie viele Striche gezählt werden und mit welcher Grenze: die der bestellten Größe", () => {
    expect(torDetails(hier(["a", "b", "c"]))[0]).toBe(
      "Gezählt          24 Satinstriche der bestellten Größe (80 mm), jeder mit seiner Grenze: " +
        "1.0 mm, Schattenlinien 0.7 mm",
    );
    expect(torDetails(hier([], { ordered: strichmenge(1) }))[0]).toBe(
      "Gezählt          1 Satinstrich der bestellten Größe (80 mm), jeder mit seiner Grenze: " +
        "1.0 mm, Schattenlinien 0.7 mm",
    );
    expect(torDetails(hier([], { ordered: [] }))[0]).toBe(
      "Gezählt          keine Satinstriche in der bestellten Größe (80 mm)",
    );
  });

  it("zählt die Schattenlinien und nennt ihre Grenze — die der bestellten Größe", () => {
    expect(torDetails(hier(["a", "b", "c"]))[1]).toBe(
      "Schattenlinien   3 (Grenze 0.7 mm statt 1.0 mm, Rail an einem Stoffspalt unter 1.0 mm, " +
        "in 80 mm bestimmt): a, b, c",
    );
    expect(torDetails(hier([]))[1]).toBe(
      "Schattenlinien   keine (Grenze 0.7 mm statt 1.0 mm, Rail an einem Stoffspalt unter 1.0 mm)",
    );
  });

  it("zählt, wo die Suche aufgegeben hat, ebenso und endet bei der Suche", () => {
    const s = suche({
      found: false,
      enlarged: false,
      reason: "steps",
      decisive: undefined,
      shadowLines: ["a", "b", "c", "d"],
      steps: [
        { widthMm: 80, under: 12 },
        { widthMm: 87, under: 3 },
      ],
    });
    const lines = torDetails(tor(s));
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain("4 (Grenze 0.7 mm statt 1.0 mm");
    expect(lines[2]).toBe(
      "Suche            80 → 87 mm (2 Prüfungen), Striche unter der Grenze: 12 → 3",
    );
  });

  it("kürzt eine lange Liste der Schattenlinien und sagt, wie viele fehlen", () => {
    const ids = Array.from({ length: 44 }, (_, i) => `path${i}`);
    const line = torDetails(tor(suche({ shadowLines: ids })))[1]!;
    expect(line).toContain("44 (Grenze");
    expect(line).toContain("path0, path1, path2, path3, path4");
    expect(line).toContain("und 39 weitere");
    expect(line).not.toContain("path5");
    expect(torDetails(tor(suche({ shadowLines: ids })), { alle: true })[1]).toContain("path43");
  });

  it("sagt mit --ohne-tor unter der Mindestgröße als erste Zeile, dass die Dateien darunter liegen", () => {
    const t = tor(suche(), { ohneTor: true, unterMindestgroesse: true, vergroessert: false });
    const lines = torDetails(t);
    expect(lines[0]).toBe("Mindestgröße     91 mm — diese Dateien (80 mm) liegen darunter");
    expect(lines[1]).toContain("Gezählt");
    // Sonst steht sie nicht da.
    expect(torDetails(tor(suche()))[0]).toContain("Gezählt");
  });

  it("sagt „1 Prüfung“, wo eine genügte", () => {
    expect(torDetails(hier([]))[2]).toBe(
      "Suche            80 mm (1 Prüfung), Striche unter der Grenze: 0",
    );
  });

  it("zeigt den Weg der Suche: die Größen und wie viele Striche dort unter der Grenze lagen", () => {
    expect(torDetails(tor(suche()))[2]).toBe(
      "Suche            80 → 87 → 91 mm (3 Prüfungen), Striche unter der Grenze: 12 → 3 → 0",
    );
  });

  it("kennt keinen Bereich darüber mehr: die Suche ist monoton", () => {
    const lines = torDetails(tor(suche()));
    expect(lines).toHaveLength(3);
    expect(lines.join("\n")).not.toMatch(/Bereich/);
  });
});

describe("dateiname (die Ausgabedateien tragen die erzeugte Breite im Namen)", () => {
  it("lässt den Namen, wo nichts skaliert wurde", () => {
    expect(dateiname("STUTTGART_Logo_80mm")).toBe("STUTTGART_Logo_80mm");
    expect(dateiname("STUTTGART_Logo_80mm", undefined, tor(suche({ enlarged: false })))).toBe(
      "STUTTGART_Logo_80mm",
    );
  });

  it("hängt die erzeugte Breite an wie --breite: -<N>mm", () => {
    expect(dateiname("STUTTGART_Logo_80mm", { to: { widthMm: 91 } })).toBe(
      "STUTTGART_Logo_80mm-91mm",
    );
    expect(dateiname("x", { to: { widthMm: 119.5 } })).toBe("x-119.5mm");
  });

  it("hängt mit --ohne-tor unter der Mindestgröße _unter-mindestgroesse an, hinter die Breite", () => {
    const t = tor(suche(), { ohneTor: true, unterMindestgroesse: true, vergroessert: false });
    expect(UNTER_SUFFIX).toBe("_unter-mindestgroesse");
    expect(dateiname("STUTTGART_Logo_80mm", undefined, t)).toBe(
      "STUTTGART_Logo_80mm_unter-mindestgroesse",
    );
    expect(dateiname("STUTTGART_Logo_80mm", { to: { widthMm: 100 } }, t)).toBe(
      "STUTTGART_Logo_80mm-100mm_unter-mindestgroesse",
    );
  });

  it("hängt nichts an, wo das Tor an ist, auch wenn es vergrößert hat", () => {
    const t = tor(suche());
    expect(dateiname("a", { to: { widthMm: 91 } }, t)).toBe("a-91mm");
  });
});

describe("fadingScene im Tor", () => {
  it("lässt eine Schattenlinie, die ihren Spalt verliert, in der bestellten Größe", () => {
    const text = svgOf(fadingScene());
    const t = sucheTor(text, importShapes(text), { bestelltMm: 80 });
    expect(t.search.widthMm).toBe(80);
    expect(t.search.shadowLines).toEqual(["schatten"]);
  });
});
