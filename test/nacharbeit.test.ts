/**
 * The check points of the Nacharbeit file and the mapping of the DST onto the page
 * (tools/nacharbeit.mjs, spec §13.4). What the files hold is tested where they are made
 * (packages/engine/src/inkstitch/nacharbeit.test.ts); here it is what goes into them: which run
 * result becomes which check point, in which order, and whether the DST lies where the layers say.
 * Invented shapes and stitches, no customer logo.
 */
import { describe, expect, it } from "vitest";
import {
  collectSpots,
  komma,
  mapDst,
  OFFSET_SPREAD_MM,
  previewPng,
  reportLines,
  SIZE_SLACK_MM,
  spotCounts,
} from "../tools/nacharbeit.mjs";

const centres = new Map([
  ["path1-0", { x: 10, y: 5 }],
  ["path2", { x: 20, y: 6 }],
  ["path3", { x: 30, y: 7 }],
  ["path4_l0", { x: 1, y: 1 }],
  ["z-flaeche", { x: 40, y: 8 }],
  ["z-tatami_p0", { x: 50, y: 9 }],
  ["z-tatami_p1", { x: 55, y: 9 }],
  ["linie", { x: 60, y: 10 }],
]);
const kinds = new Map([
  ["z-flaeche", "Laufstich"],
  ["z-flaeche_l1", "Laufstich"],
  ["linie", "Laufstich"],
  ["path3", "Laufstich"],
  ["z-tatami_p0", "Tatami"],
]);
const areaIds = new Set(["z-flaeche", "path3", "z-tatami"]);
/** Nothing in the template that is a running stitch from an area: the points of a test are the ones it asks for. */
const QUIET = { kinds: new Map<string, string>(), areaIds: new Set<string>() };

describe("komma", () => {
  it("writes a decimal comma", () => {
    expect(komma(1.3)).toBe("1,3");
    expect(komma(0.706, 2)).toBe("0,71");
    expect(komma(12, 1)).toBe("12,0");
  });
});

describe("collectSpots — what the run knows becomes check points", () => {
  it("makes one from a finding of the fineness check, with its place, the measure, the limit and a suggestion", () => {
    const { spots } = collectSpots({
      centres,
      ...QUIET,
      findings: [
        {
          id: "path7",
          kind: "satin-stroke",
          color: "#d1b35a",
          measuredMm: 0.706,
          limitMm: 1.3,
          holdsFromWidthMm: 201.2,
          at: { x: 12, y: 34 },
          runningAlternative: true,
        },
      ],
    });
    expect(spots).toEqual([
      {
        xMm: 12,
        yMm: 34,
        art: "Satinstrich zu schmal",
        text: "path7: 0,71 mm statt 1,3 mm, hält ab 202 mm · größer sticken oder als Laufstich",
      },
    ]);
  });

  it("names the colours between which a fabric gap lies, and leaves a gap of one colour at that", () => {
    const { spots } = collectSpots({
      centres,
      ...QUIET,
      findings: [
        {
          id: "fabric-001",
          kind: "fabric-gap",
          color: "#d1b35a+#d2060d",
          measuredMm: 0.53,
          limitMm: 0.8,
          holdsFromWidthMm: 166.5,
          at: { x: 1, y: 2 },
          runningAlternative: false,
        },
        {
          id: "gap-d1b35a-001",
          kind: "gap",
          color: "#d1b35a",
          measuredMm: 0.4,
          limitMm: 0.8,
          holdsFromWidthMm: 80.1,
          at: { x: 3, y: 4 },
          runningAlternative: false,
        },
      ],
    });
    expect(spots.map((s) => [s.art, s.text])).toEqual([
      ["Lücke", "0,40 mm statt 0,8 mm, offen ab 81 mm · Form schmaler oder zusticken lassen"],
      ["Stofflücke", "0,53 mm statt 0,8 mm zwischen Gold und Rot, offen ab 167 mm"],
    ]);
  });

  it("places the objects of the template by their id", () => {
    const r = collectSpots({
      centres,
      ...QUIET,
      fallbacks: [{ id: "path2", reason: "rails wind" }],
      smoothed: [{ id: "path1-0", smoothedMm: 0.2, coverage: 0.891 }],
      underlay: {
        without: [
          { id: "z-tatami_p0", pieces: 0 },
          { id: "z-tatami_p1", pieces: 3 },
        ],
      },
      railPull: {
        narrowAtGap: ["path1-0"],
        gaps: [
          { id: "path1-0", side: "A", gapMm: 0.17 },
          { id: "path1-0", side: "B", gapMm: 0.4 },
        ],
      },
    });
    expect(r.withoutPlace).toEqual([]);
    const by = Object.fromEntries(r.spots.map((s) => [s.art, s]));
    expect(by["Rückfall Tatami"]).toEqual({
      xMm: 20,
      yMm: 6,
      art: "Rückfall Tatami",
      text: "Satin hielt nicht: rails wind",
    });
    expect(by["Satin auf geglätteter Kontur"]).toMatchObject({
      xMm: 10,
      yMm: 5,
      text: "um 0,2 mm geglättet, Deckung 89 %",
    });
    expect(by["Säule unter 1,0 mm"]).toMatchObject({
      xMm: 10,
      yMm: 5,
      text: "Stoffspalt 0,17 mm, ohne Zugausgleich · so schmal gestickt wie gezeichnet",
    });
    const under = r.spots.filter((s) => s.art === "Tatami ohne Gitterunterlage");
    expect(under.map((s) => s.text)).toEqual([
      "zu schmal für einen Einzug · Deckstich allein",
      "Einzug zerfällt in 3 Stücke · Deckstich allein",
    ]);
  });

  it("does not drop what it cannot place: it says which ones", () => {
    const r = collectSpots({
      centres,
      ...QUIET,
      fallbacks: [{ id: "unbekannt", reason: "x" }],
      underlay: { without: [{ id: "auch-nicht", pieces: 1 }] },
    });
    expect(r.spots).toEqual([]);
    expect(r.withoutPlace).toEqual([
      { art: "Rückfall Tatami", id: "unbekannt" },
      { art: "Tatami ohne Gitterunterlage", id: "auch-nicht" },
    ]);
  });

  it("marks an area that became a line, but not a line that was drawn as one, nor the one with a reason", () => {
    const r = collectSpots({
      centres: new Map([...centres, ["z-flaeche_l1", { x: 41, y: 8 }]]),
      kinds,
      areaIds,
      // path3 is an area too, but it is a running stitch for a reason: a fallback, listed as that.
      narrowLines: [{ id: "path3", reason: "rails wind, 0.8 mm wide" }],
    });
    const arts = r.spots.map((s) => [s.art, s.xMm]);
    expect(arts).toContainEqual(["Fläche als Laufstich", 40]);
    expect(arts).toContainEqual(["Rückfall Laufstich", 30]);
    // "linie" is no area; "z-flaeche_l1" is the second line of the same area — one point for it.
    expect(r.spots.filter((s) => s.art === "Fläche als Laufstich")).toHaveLength(1);
    expect(r.spots.filter((s) => s.xMm === 60)).toHaveLength(0);
  });

  it("turns what is found in the DST into points: a jump at its middle, a pile-up, a dense place", () => {
    const { spots } = collectSpots({
      centres,
      ...QUIET,
      dst: {
        jumps: [{ from: { x: 10, y: 10 }, to: { x: 30, y: 10 }, lengthMm: 20 }],
        needle: [{ x: 5, y: 6, count: 8, cells: 3 }],
        density: [{ x: 7.5, y: 8.5, count: 25, cells: 1 }],
      },
    });
    expect(spots).toEqual([
      {
        xMm: 20,
        yMm: 10,
        art: "Sprung ohne Fadenschnitt",
        text: "20,0 mm, der Faden liegt auf dem Stoff · Fadenschnitt setzen",
      },
      {
        xMm: 5,
        yMm: 6,
        art: "Nadelhäufung",
        text: "8 Einstiche in 0,2 mm (ab 6), 3 Zellen · Überlappung oder Unterlage prüfen",
      },
      {
        xMm: 7.5,
        yMm: 8.5,
        art: "Stichdichte",
        text: "25 Stiche je mm² (Grenze 18) · Dichte senken",
      },
    ]);
  });

  it("numbers by importance: the DST first, the fineness check after, the template last — and keeps the order within a kind", () => {
    const { spots } = collectSpots({
      centres,
      ...QUIET,
      underlay: { without: [{ id: "z-tatami_p0", pieces: 1 }] },
      fallbacks: [{ id: "path2", reason: "r" }],
      findings: [
        {
          id: "a",
          kind: "gap",
          color: "#000000",
          measuredMm: 0.4,
          limitMm: 0.8,
          holdsFromWidthMm: 10,
          at: { x: 1, y: 1 },
          runningAlternative: false,
        },
        {
          id: "b",
          kind: "satin-stroke",
          color: "#000000",
          measuredMm: 1,
          limitMm: 1.3,
          holdsFromWidthMm: 10,
          at: { x: 2, y: 2 },
          runningAlternative: false,
        },
      ],
      dst: {
        jumps: [],
        needle: [
          { x: 0, y: 0, count: 7, cells: 1 },
          { x: 9, y: 9, count: 6, cells: 1 },
        ],
        density: [],
      },
    });
    expect(spots.map((s) => s.art)).toEqual([
      "Nadelhäufung",
      "Nadelhäufung",
      "Satinstrich zu schmal",
      "Rückfall Tatami",
      "Tatami ohne Gitterunterlage",
      "Lücke",
    ]);
    // The two pile-ups stay in the order the DST code gave them: the fuller first.
    expect(spots[0]!.text.startsWith("7 Einstiche")).toBe(true);
  });

  it("finds nothing where nothing was found", () => {
    expect(collectSpots({ centres, ...QUIET })).toEqual({ spots: [], withoutPlace: [] });
  });
});

describe("spotCounts", () => {
  it("counts per kind, in the order of numbering", () => {
    const spots = [
      { xMm: 0, yMm: 0, art: "Lücke", text: "" },
      { xMm: 0, yMm: 0, art: "Nadelhäufung", text: "" },
      { xMm: 0, yMm: 0, art: "Lücke", text: "" },
    ];
    expect(spotCounts(spots)).toEqual([
      ["Nadelhäufung", 1],
      ["Lücke", 2],
    ]);
  });
});

/** A block of stitches: a box of x0..x1, y0..y1, corners and the middle. */
const block = (x0: number, y0: number, x1: number, y1: number) => ({
  stitches: [
    { cmd: "stitch", x: x0, y: y0 },
    { cmd: "stitch", x: x1, y: y0 },
    { cmd: "stitch", x: x1, y: y1 },
    { cmd: "stitch", x: x0, y: y1 },
  ],
});

describe("mapDst (the DST on the page)", () => {
  // Two colours: a gold bar above left, a red one below right, on a page 40 x 20 mm.
  const layers = [
    { bounds: { minX: 2, minY: 2, maxX: 12, maxY: 6 } },
    { bounds: { minX: 20, minY: 12, maxX: 38, maxY: 18 } },
  ];
  /** The same in DST coordinates: centred on the box of the whole (20, 10), y down, stitches 0.3 mm wider than the paths. */
  const blocks = [block(-18.3, -8.3, -7.7, -3.7), block(-0.3, 1.7, 18.3, 8.3)];

  it("puts the middle of the box of the stitches on the middle of the box of the paths", () => {
    const m = mapDst(blocks, layers);
    // Stitch box: -18.3..18.3, -8.3..8.3 (middle 0, 0); path box: 2..38, 2..18 (middle 20, 10).
    expect(m.dx).toBeCloseTo(20, 9);
    expect(m.dy).toBeCloseTo(10, 9);
    expect(m.ok).toBe(true);
    expect(m.checked).toBe(true);
    expect(m.spreadMm).toBeLessThan(OFFSET_SPREAD_MM);
    expect(m.sizeMm!.dw).toBeCloseTo(0.6, 9);
  });

  it("does not believe a DST that is upside down: the blocks sit on the wrong layers", () => {
    const flipped = [block(-18.3, 3.7, -7.7, 8.3), block(-0.3, -8.3, 18.3, -1.7)];
    const m = mapDst(flipped, layers);
    expect(m.ok).toBe(false);
    expect(m.checked).toBe(true);
    expect(m.why).toContain("Farbblöcke");
  });

  it("does not believe a DST of another size than the paths", () => {
    const big = [block(-28, -8.3, -7.7, -3.7), block(-0.3, 1.7, 28, 8.3)];
    const m = mapDst(big, layers);
    expect(m.ok).toBe(false);
    expect(m.why).toContain("Größe");
    expect(Math.abs(m.sizeMm!.dw)).toBeGreaterThan(SIZE_SLACK_MM);
  });

  it("maps as a whole where blocks and layers do not pair up, and says it was not checked block by block", () => {
    const m = mapDst([block(-18.3, -8.3, 18.3, 8.3)], layers);
    expect(m.checked).toBe(false);
    expect(m.ok).toBe(true);
    expect(m.dx).toBeCloseTo(20, 9);
  });

  it("counts stitches only for the box: the jump records between the blocks belong to none", () => {
    // A long jump is written as records along the way; the first one starts at the middle of the design.
    const withJumps = [
      {
        stitches: [
          { cmd: "jump", x: 0, y: 0 },
          ...blocks[0]!.stitches,
          { cmd: "color", x: 500, y: 500 },
        ],
      },
      { stitches: [{ cmd: "jump", x: -18, y: -6 }, ...blocks[1]!.stitches] },
    ];
    const m = mapDst(withJumps, layers);
    expect(m.dx).toBeCloseTo(20, 9);
    expect(m.dy).toBeCloseTo(10, 9);
    expect(m.ok).toBe(true);
    expect(m.spreadMm).toBeLessThan(0.001);
  });

  it("says no when there is nothing to map", () => {
    expect(mapDst([], []).ok).toBe(false);
    expect(mapDst([block(0, 0, 1, 1)], [{ bounds: undefined }]).ok).toBe(false);
  });
});

describe("reportLines", () => {
  const base = {
    files: {
      svg: "/tmp/x/out/A.nacharbeit.svg",
      pes: "/tmp/x/out/A.pes",
      farbfolge: "/tmp/x/out/A.farbfolge.txt",
      png: "/tmp/x/out/A.nacharbeit.png",
    },
    rework: {
      layers: [
        { label: "01 Gold #D1B35A", elements: 92, units: ["a", "b"] },
        { label: "02 Rot #D2060D", elements: 84, units: ["c"] },
      ],
      stops: [{}, {}],
      notes: [
        {
          message:
            "Gruppe g enthält mehrere Farben (#D1B35A, #D2060D) — nicht aufgetrennt, eigene Ebene.",
        },
      ],
    },
    mapping: { dx: 55.39, dy: 25.67, ok: true, checked: true, spreadMm: 0.12 },
    spots: [
      { xMm: 1, yMm: 1, art: "Nadelhäufung", text: "" },
      { xMm: 2, yMm: 2, art: "Stofflücke", text: "" },
      { xMm: 3, yMm: 3, art: "Stofflücke", text: "" },
    ],
    withoutPlace: [],
    pesStderr: "",
    pesMs: 12345,
    blocks: 2,
  };

  it("names the files, the layers, the points per kind, the notes and the mapping", () => {
    const text = reportLines(base).join("\n");
    expect(text).toContain("out/A.nacharbeit.svg (2 Ebenen, 3 Prüfstellen)");
    expect(text).toContain("out/A.pes");
    expect(text).toContain("out/A.farbfolge.txt");
    expect(text).toContain("out/A.nacharbeit.png");
    expect(text).toContain("01 Gold #D1B35A: 92 Objekte in 2 Gruppen oder Formen");
    expect(text).toContain("Nadelhäufung 1 · Stofflücke 2");
    expect(text).toContain("Hinweis     Gruppe g enthält mehrere Farben");
    expect(text).toContain("DST → Seite um 55,39 / 25,67 mm verschoben, je Farbblock geprüft");
    expect(text).toContain("Laufzeit PES 12.3 s");
  });

  it("says what it could not do: a mapping that does not hold, points without a place, blocks that do not match", () => {
    const text = reportLines({
      ...base,
      mapping: {
        dx: 1,
        dy: 2,
        ok: false,
        checked: true,
        spreadMm: 4.2,
        why: "die Farbblöcke liegen …",
      },
      withoutPlace: [{ art: "Rückfall Tatami", id: "x" }],
      blocks: 3,
      pesStderr: "Warnung von Ink/Stitch",
    }).join("\n");
    expect(text).toContain("hält nicht (die Farbblöcke liegen …)");
    expect(text).toContain("Nadelhäufung, Stichdichte und Sprünge fehlen");
    expect(text).toContain("Ohne Lage   1 Prüfstellen");
    expect(text).toContain("Rückfall Tatami x");
    expect(text).toContain("Die DST hat 3 Farbblöcke, die Ebenen ergeben 2");
    expect(text).toContain("Warnung von Ink/Stitch");
  });

  it("says that Ink/Stitch leaves the file alone on opening, or that it had to change it, or that it could not be asked", () => {
    const at = (update: object, version: number | undefined) =>
      reportLines({
        ...base,
        rework: { ...base.rework, inkstitchSvgVersion: version },
        update,
      }).join("\n");
    expect(at({ checked: true, changed: false, settled: true }, 4)).toContain(
      "inkstitch_svg_version 4: Ink/Stitch ändert die Datei beim Öffnen nicht",
    );
    const changed = at({ checked: true, changed: true, settled: true }, undefined);
    expect(changed).toContain(
      "Ink/Stitch hat die Datei beim Öffnen geändert (Altdokument, Version fehlte)",
    );
    expect(changed).toContain("ein weiteres Öffnen ändert nichts mehr");
    expect(at({ checked: true, changed: true, settled: false })).toContain(
      "ändert noch immer etwas",
    );
    expect(at({ checked: false, error: "kein update_svg" }, 4)).toContain(
      "ließ sich nicht prüfen (kein update_svg)",
    );
  });

  it("says why there is no file where the page has no size", () => {
    expect(reportLines({ skipped: "Die Vorlage nennt keine Größe in mm." })).toEqual([
      "Nacharbeit   Die Vorlage nennt keine Größe in mm.",
    ]);
  });

  it("says so when there are no check points", () => {
    expect(reportLines({ ...base, spots: [] }).join("\n")).toContain("Prüfstellen keine");
  });
});

describe("previewPng", () => {
  it("draws the stitches in the colours of the sequence and the points on top, as a PNG", async () => {
    const blocks = [
      {
        objectId: "a",
        threadIndex: 0,
        stitches: [
          { cmd: "stitch", x: -5, y: 0 },
          { cmd: "stitch", x: 5, y: 0 },
          { cmd: "color", x: 5, y: 0 },
        ],
      },
      {
        objectId: "b",
        threadIndex: 1,
        stitches: [
          { cmd: "stitch", x: 5, y: 3 },
          { cmd: "stitch", x: -5, y: 3 },
        ],
      },
    ];
    const png = await previewPng({
      blocks,
      stats: { bboxMm: { w: 10, h: 3 }, stitches: 4 },
      stops: [
        { hex: "#d1b35a", name: "Gold" },
        { hex: "#d2060d", name: "Rot" },
      ],
      spots: [{ xMm: 25, yMm: 11.5, art: "Lücke", text: "x" }],
      offset: { dx: 20, dy: 10 },
      widthMm: 40,
    });
    expect([...png.slice(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(png.length).toBeGreaterThan(500);
  });
});
