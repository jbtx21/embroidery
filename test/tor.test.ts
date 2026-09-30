/**
 * Das Tor der Mindestgröße (docs/Engine-Spezifikation.md §5.2, tools/tor.mjs): die Suche für eine
 * SVG-Datei, die erste Zeile der Ausgabe, die Zeilen darunter und die Dateinamen. Gerechnet wird in
 * packages/engine/src/inkstitch/min-size-search.ts und dort geprüft; hier steht, dass die Datei so
 * gelesen wird, wie der Lauf sie liest, und dass das, was der Nutzer liest, dazu passt. Eigene
 * Formen, keine Kundenlogos.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { findMinimumSize, importShapes, initEngine, PRESETS } from "@texma-stitch/engine";
import {
  aloneScene,
  growScene,
  fadingScene,
  ORDERED_MM,
  scaledAt,
  SVG_NO_VIEWBOX,
  shadowScene,
  svgOf,
} from "../packages/engine/test/fixtures/gate.js";
import {
  dateiname,
  formenBei,
  sucheTor,
  torDetails,
  torKopf,
  torKurz,
  UNTER_SUFFIX,
} from "../tools/tor.mjs";

beforeAll(async () => {
  await initEngine();
});

/** Das Ergebnis der Suche, wie es die Engine gibt, mit dem, was der Text liest. */
const suche = (over: Record<string, unknown> = {}) => ({
  orderedWidthMm: 80,
  widthMm: 252,
  found: true,
  enlarged: true,
  belowMinimum: true,
  decisive: {
    id: "z04-000000-002",
    color: "#000000",
    fromMm: 240,
    toMm: 251.1,
    measuredMm: 1.242,
    atWidthMm: 240,
    limitMm: 1.3,
    kind: "too-narrow",
  },
  steps: [
    { widthMm: 80, under: 12, shadowLines: 0 },
    { widthMm: 118, under: 6, shadowLines: 0 },
    { widthMm: 252, under: 0, shadowLines: 1 },
  ],
  shadowLines: ["z13-bebebe-018"],
  above: [],
  limits: { satinMinMm: 1.3, shadowMinMm: 0.7 },
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

  it("wirft, wo die Datei keine viewBox hat: dann folgt die Zeichnung der Größe nicht", () => {
    const ohne = text.replace(/ viewBox="[^"]*"/, "");
    expect(() => formenBei(ohne, importShapes(ohne))(120)).toThrow(/viewBox/);
  });
});

describe("sucheTor (das Tor für eine SVG-Datei)", () => {
  const svg = (shapes: ReturnType<typeof aloneScene>) => {
    const text = svgOf(shapes);
    return { text, original: importShapes(text) };
  };

  it("findet für einen freien Strich von 0,9 mm die Mindestgröße und erzeugt dort", () => {
    const { text, original } = svg(aloneScene(0.9));
    const t = sucheTor(text, original, { bestelltMm: 80, preset: PRESETS.pique });
    expect(t.fehler).toBeUndefined();
    expect(t.search.found).toBe(true);
    expect(t.search.widthMm).toBeGreaterThan(100);
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

  it("mit --ohne-tor wird nicht vergrößert, und unter der Mindestgröße heißt das so", () => {
    const { text, original } = svg(aloneScene(0.9));
    const t = sucheTor(text, original, { bestelltMm: 80, ohneTor: true });
    expect(t.search.widthMm).toBeGreaterThan(100); // die Mindestgröße wird trotzdem gesucht
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
    // Eine Datei in 80 mm, bestellt in 60: der Strich von 0,75 mm ist dort 0,56 mm breit, ein Laufstich, und hält.
    const { text, original } = svg(aloneScene(0.75));
    const t = sucheTor(text, original, { bestelltMm: 60 });
    expect(t.search.found).toBe(true);
    expect(t.search.widthMm).toBe(60);
    expect(t.search.belowMinimum).toBe(false);
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
    const { text, original } = svg(growScene(0.5));
    const t = sucheTor(text, original, {
      bestelltMm: 80,
      suche: { maxSteps: 2 },
    });
    expect(t.search.found).toBe(false);
    expect(t.fehler).toMatch(/2 Prüfungen/);
    expect(t.erzeugtMm).toBeUndefined();
    // Mit --ohne-tor läuft es in der bestellten Größe, als unter der Mindestgröße, und ohne Fehler.
    const o = sucheTor(text, original, { bestelltMm: 80, ohneTor: true, suche: { maxSteps: 2 } });
    expect(o.fehler).toBeUndefined();
    expect(o.erzeugtMm).toBe(80);
    expect(o.unterMindestgroesse).toBe(true);
  });

  it("liest auch die Bereiche darüber aus der Datei", () => {
    const { text, original } = svg(fadingScene());
    const t = sucheTor(text, original, { bestelltMm: ORDERED_MM });
    expect(t.search.above).toHaveLength(1);
    expect(t.search.above[0]!.id).toBe("schatten");
  });
});

describe("torKopf (die erste Zeile der Ausgabe)", () => {
  it("sagt bestellt, stickbar ab, erzeugt und das bestimmende Element", () => {
    const lines = torKopf(tor(suche()));
    expect(lines).toEqual([
      "Bestellt 80 mm · stickbar ab 252 mm · erzeugt in 252 mm — bestimmt von z04-000000-002 " +
        "(1.24 mm bei 240 mm, Grenze 1.3 mm)",
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
      "Bestellt 80 mm · stickbar ab 252 mm · erzeugt in 80 mm (--ohne-tor: nicht vergrößert) — " +
        "bestimmt von z04-000000-002 (1.24 mm bei 240 mm, Grenze 1.3 mm)",
    );
    expect(lines[1]).toContain("WARNUNG");
    expect(lines[1]).toContain("80 mm liegt unter der Mindestgröße von 252 mm");
    expect(lines[1]).toContain(UNTER_SUFFIX);
    expect(lines[1]).toContain("kein Stickprogramm für einen Auftrag");
  });

  it("sagt mit --ohne-tor über der Mindestgröße nur, dass das Tor aus ist", () => {
    const s = suche({ widthMm: 80, enlarged: false, belowMinimum: false, decisive: undefined });
    expect(torKopf(tor(s, { ohneTor: true }))).toEqual([
      "Bestellt 80 mm · stickbar in dieser Größe · erzeugt in 80 mm (--ohne-tor)",
    ]);
  });

  it("sagt, wo die Suche aufgegeben hat, warum — eine Mindestgröße nennt sie nicht", () => {
    const steps = suche({
      found: false,
      enlarged: false,
      widthMm: 1035,
      reason: "steps",
      decisive: undefined,
      steps: [
        { widthMm: 80, under: 12, shadowLines: 0 },
        { widthMm: 1035, under: 3, shadowLines: 0 },
      ],
    });
    const [line] = torKopf(tor(steps, { erzeugtMm: undefined, fehler: "x" }));
    expect(line).toContain("Bestellt 80 mm");
    expect(line).toContain("keine Mindestgröße gefunden");
    expect(line).toContain("nach 2 Prüfungen");
    const factor = suche({ found: false, enlarged: false, reason: "factor", decisive: undefined });
    expect(torKopf(tor(factor, { erzeugtMm: undefined, fehler: "x" }))[0]).toContain(
      "über dem 10-fachen der bestellten Größe (800 mm)",
    );
  });
});

describe("torKopf als Meldung (für pnpm mindestgroesse, das nichts erzeugt)", () => {
  it("sagt bestellt und stickbar ab, ohne eine erzeugte Größe", () => {
    expect(torKopf(tor(suche()), { meldung: true })).toEqual([
      "Bestellt 80 mm · stickbar ab 252 mm — bestimmt von z04-000000-002 " +
        "(1.24 mm bei 240 mm, Grenze 1.3 mm)",
    ]);
    const haelt = suche({ widthMm: 80, enlarged: false, belowMinimum: false, decisive: undefined });
    expect(torKopf(tor(haelt), { meldung: true })).toEqual([
      "Bestellt 80 mm · stickbar in dieser Größe",
    ]);
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
      "Mindestgröße 252 mm (bestellt 80 mm · bestimmt von z04-000000-002, 1.24 mm bei 240 mm)",
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
  it("zählt die Schattenlinien und nennt ihre Grenze", () => {
    const hier = (shadowLines: string[]) =>
      tor(
        suche({
          widthMm: 80,
          enlarged: false,
          belowMinimum: false,
          decisive: undefined,
          steps: [{ widthMm: 80, under: 0, shadowLines: shadowLines.length }],
          shadowLines,
        }),
      );
    expect(torDetails(hier(["a", "b", "c"]))[0]).toBe(
      "Schattenlinien   3 (Grenze 0.7 mm statt 1.3 mm, Rail an einem Stoffspalt unter 1.0 mm): a, b, c",
    );
    expect(torDetails(hier([]))[0]).toBe(
      "Schattenlinien   keine (Grenze 0.7 mm statt 1.3 mm, Rail an einem Stoffspalt unter 1.0 mm)",
    );
  });

  it("zählt sie in der bestellten und in der gefundenen Größe, wo beide verschieden sind", () => {
    // Die goldenen Schattenlinien halten bei 80 mm; bei 548 mm ist ihr Spalt offen, und sie sind breit.
    const s = suche({
      widthMm: 548,
      steps: [
        { widthMm: 80, under: 11, shadowLines: 30 },
        { widthMm: 548, under: 0, shadowLines: 0 },
      ],
      shadowLines: [],
    });
    expect(torDetails(tor(s))[0]).toBe(
      "Schattenlinien   30 in 80 mm, 0 in 548 mm (Grenze 0.7 mm statt 1.3 mm, Rail an einem Stoffspalt unter 1.0 mm)",
    );
    // Die Namen sind die der gefundenen Größe.
    expect(torDetails(tor(suche()))[0]).toBe(
      "Schattenlinien   0 in 80 mm, 1 in 252 mm (Grenze 0.7 mm statt 1.3 mm, Rail an einem Stoffspalt unter 1.0 mm): z13-bebebe-018",
    );
  });

  it("zählt, wo die Suche aufgegeben hat, nur die der bestellten Größe", () => {
    const s = suche({
      found: false,
      enlarged: false,
      reason: "steps",
      decisive: undefined,
      shadowLines: [],
      steps: [
        { widthMm: 80, under: 12, shadowLines: 4 },
        { widthMm: 1035, under: 3, shadowLines: 0 },
      ],
    });
    expect(torDetails(tor(s))[0]).toBe(
      "Schattenlinien   4 in 80 mm (Grenze 0.7 mm statt 1.3 mm, Rail an einem Stoffspalt unter 1.0 mm)",
    );
  });

  it("kürzt eine lange Liste der Schattenlinien und sagt, wie viele fehlen", () => {
    const ids = Array.from({ length: 44 }, (_, i) => `path${i}`);
    const line = torDetails(tor(suche({ shadowLines: ids })))[0]!;
    expect(line).toContain("44 in 252 mm (Grenze");
    expect(line).toContain("path0, path1, path2, path3, path4");
    expect(line).toContain("und 39 weitere");
    expect(line).not.toContain("path5");
    expect(torDetails(tor(suche({ shadowLines: ids })), { alle: true })[0]).toContain("path43");
  });

  it("sagt mit --ohne-tor unter der Mindestgröße als erste Zeile, dass die Dateien darunter liegen", () => {
    const t = tor(suche(), { ohneTor: true, unterMindestgroesse: true, vergroessert: false });
    const lines = torDetails(t);
    expect(lines[0]).toBe("Mindestgröße     252 mm — diese Dateien (80 mm) liegen darunter");
    expect(lines[1]).toContain("Schattenlinien");
    // Sonst steht sie nicht da.
    expect(torDetails(tor(suche()))[0]).toContain("Schattenlinien");
  });

  it("sagt „1 Prüfung“, wo eine genügte", () => {
    const eine = suche({
      widthMm: 80,
      enlarged: false,
      belowMinimum: false,
      decisive: undefined,
      steps: [{ widthMm: 80, under: 0, shadowLines: 0 }],
    });
    expect(torDetails(tor(eine))[1]).toBe(
      "Suche            80 mm (1 Prüfung), Striche unter der Grenze: 0",
    );
  });

  it("zeigt den Weg der Suche: die Größen und wie viele Striche dort unter der Grenze lagen", () => {
    const lines = torDetails(tor(suche()));
    expect(lines[1]).toBe(
      "Suche            80 → 118 → 252 mm (3 Prüfungen), Striche unter der Grenze: 12 → 6 → 0",
    );
  });

  it("sagt, wo nichts über der gefundenen Größe liegt, dass es nichts gibt", () => {
    const lines = torDetails(tor(suche()));
    expect(lines[2]).toBe(
      "Bereich darüber  keiner: ab 252 mm wird in keiner größeren Größe ein Strich zu schmal",
    );
  });

  it("nennt die Bereiche darüber mit Element und von–bis, aufgerundet auf ganze Millimeter", () => {
    const above = [
      {
        id: "path22",
        color: "#000000",
        fromMm: 140.2,
        toMm: 261.2,
        measuredMm: 0.552,
        atWidthMm: 110.828,
        limitMm: 1.3,
        kind: "becomes-satin",
      },
      {
        id: "z13-bebebe-018",
        color: "#bebebe",
        fromMm: 315.1,
        toMm: 430.5,
        measuredMm: 0.755,
        atWidthMm: 250,
        limitMm: 1.3,
        kind: "loses-shadow",
      },
    ];
    const lines = torDetails(tor(suche({ above })));
    expect(lines[2]).toContain("Bereich darüber  2 Bereiche, in denen ein Strich zu schmal wird");
    expect(lines[3]).toContain("141–262 mm");
    expect(lines[3]).toContain("path22");
    expect(lines[3]).toContain("Laufstich");
    expect(lines[3]).toContain("0.55 mm bei 110.8 mm");
    expect(lines[3]).toContain("ab 141 mm Satin");
    expect(lines[3]).toContain("hält ab 262 mm");
    expect(lines[4]).toContain("316–431 mm");
    expect(lines[4]).toContain("z13-bebebe-018");
    expect(lines[4]).toContain("Schattenlinie");
    expect(lines[4]).toContain("ab 316 mm");
  });

  it("fasst Bereiche, die sich überdecken, zu einem zusammen und nennt die Elemente", () => {
    const r = (id: string, fromMm: number, toMm: number) => ({
      id,
      color: "#000000",
      fromMm,
      toMm,
      measuredMm: 0.5,
      atWidthMm: 80,
      limitMm: 1.3,
      kind: "becomes-satin",
    });
    const above = [
      r("a", 150, 200),
      r("b", 180, 250),
      r("c", 240, 300),
      r("d", 290, 310),
      r("e", 500, 520),
    ];
    const lines = torDetails(tor(suche({ above })));
    expect(lines[2]).toContain("2 Bereiche");
    expect(torDetails(tor(suche({ above: above.slice(0, 1) })))[2]).toContain(
      "1 Bereich, in dem ein Strich zu schmal wird",
    );
    expect(lines[3]).toContain("150–310 mm");
    expect(lines[3]).toContain("a, b, c");
    expect(lines[3]).toContain("und 1 weiteres");
    expect(lines[4]).toContain("500–520 mm");
  });

  it("kürzt die Zahl der Bereiche und sagt, wie viele fehlen", () => {
    const above = Array.from({ length: 9 }, (_, i) => ({
      id: `p${i}`,
      color: "#000000",
      fromMm: 300 + 100 * i,
      toMm: 350 + 100 * i,
      measuredMm: 0.5,
      atWidthMm: 80,
      limitMm: 1.3,
      kind: "becomes-satin",
    }));
    const lines = torDetails(tor(suche({ above })));
    expect(lines[2]).toContain("9 Bereiche");
    expect(lines).toHaveLength(3 + 6 + 1); // die drei Zeilen, sechs Bereiche, die Kürzungszeile
    expect(lines[lines.length - 1]).toContain("… und 3 weitere Bereiche");
    expect(torDetails(tor(suche({ above })), { alle: true })).toHaveLength(3 + 9);
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
    expect(dateiname("STUTTGART_Logo_80mm", { to: { widthMm: 252 } })).toBe(
      "STUTTGART_Logo_80mm-252mm",
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
    expect(dateiname("a", { to: { widthMm: 252 } }, t)).toBe("a-252mm");
  });
});
