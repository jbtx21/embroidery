/**
 * The Nacharbeit file (spec §13.4): layers per colour block in the stitch order, names, the hidden
 * layer of check points. Documents are built the way Ink/Stitch writes them after auto_satin and
 * jump_to_trim (`template.test.ts` covers what the template writes): routed satin in groups,
 * a trim command beside its column, inkex's own namespace prefixes.
 */
import { describe, expect, it } from "vitest";
import {
  buildReworkSvg,
  colourDistance,
  colourKey,
  colourName,
  documentBounds,
  elementCentres,
  elementKinds,
  farbfolge,
  INKSTITCH_SVG_VERSION,
  inkstitchSvgVersion,
  PALETTE,
  pageSizeMm,
  parseColour,
  SAME_NEEDLE_RGB,
} from "./nacharbeit.js";
import type { ReworkSpot } from "./nacharbeit.js";
import {
  childElements,
  getAttr,
  getNsAttr,
  localName,
  parseXml,
  serializeNode,
  XML_NS,
} from "./xml.js";
import type { XmlElement } from "./xml.js";

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

const NS = `xmlns="http://www.w3.org/2000/svg" xmlns:inkstitch="http://inkstitch.org/namespace"`;
const SIZE = `width="40mm" height="20mm" viewBox="0 0 40 20"`;
/** What inkex puts before the drawing: the trim symbol, the empty namedview, the settings. */
const HEAD =
  `<defs><symbol xmlns:inkscape="${XML_NS.inkscape}" id="inkstitch_trim"><title id="t">Trim</title></symbol></defs>` +
  `<ns0:namedview xmlns:ns0="${XML_NS.sodipodi}"/>` +
  `<metadata><inkstitch:collapse_len_mm>3</inkstitch:collapse_len_mm>` +
  `<inkstitch:inkstitch_svg_version>4</inkstitch:inkstitch_svg_version></metadata>`;

const page = (body: string, size = SIZE): string => `<svg ${NS} ${size}>${HEAD}${body}</svg>`;

const GOLD = "#d1b35a";
const RED = "#d2060d";
const BLACK = "#000000";

const fill = (id: string, colour: string): string =>
  `<path id="${id}" d="M 0 0 L 10 0 L 10 5 Z" style="fill:${colour};stroke:none" inkstitch:row_spacing_mm="0.4" inkstitch:angle="-45"/>`;
const running = (id: string, colour: string): string =>
  `<path id="${id}" d="M 20 0 L 25 5" style="fill:none;stroke:${colour};stroke-width:0.1" inkstitch:stroke_method="running_stitch"/>`;
const satin = (id: string, colour: string, d = "M 0 10 L 10 10 M 0 12 L 10 12"): string =>
  `<path xmlns:ns46="${XML_NS.inkscape}" id="${id}" d="${d}" style="fill:none;stroke:${colour};stroke-width:0.38" inkstitch:satin_column="true" ns46:label="AutoSatin 1"/>`;
const underpath = (id: string, colour: string): string =>
  `<path xmlns:ns47="${XML_NS.inkscape}" id="${id}" d="M 10 10 L 12 10" style="fill:none;stroke:${colour};stroke-width:0.38;stroke-dasharray:1,0.2" inkstitch:path_type="satin-underpath" ns47:label="AutoSatin Running Stitch 2"/>`;
/** The trim command Ink/Stitch puts right after the object, with the connector that names it. */
const trim = (target: string): string =>
  `<g xmlns:ns1="${XML_NS.inkscape}" id="command_group_${target}" ns1:label="Ink/Stitch Command: Trim thread" transform="scale(0.264583, 0.264583)">` +
  `<path id="connector_${target}" d="M 1 1 2 2" style="fill:none;stroke:#000000;stroke-width:1" ns1:connection-start="#use_${target}" ns1:connection-end="#${target}" ns1:connector-type="polyline"/>` +
  `<use xmlns:ns1="${XML_NS.xlink}" id="use_${target}" ns1:href="#inkstitch_trim"/></g>`;
const group = (id: string, inner: string): string => `<g id="${id}">${inner}</g>`;

/** A document in stitch order: tatami black, a routed satin shape in gold, a running line in gold, a red shape. */
const SAMPLE = page(
  fill("z01-black", BLACK) +
    group(
      "z02-gold",
      satin("autosatin1", GOLD) + underpath("autosatinrun1", GOLD) + trim("autosatin1"),
    ) +
    running("z03-gold", GOLD) +
    group("z04-red", satin("autosatin2", RED)),
);

// ---------------------------------------------------------------------------
// Reading the result
// ---------------------------------------------------------------------------

const rootOf = (svg: string): XmlElement => parseXml(svg).root;
const label = (el: XmlElement): string | undefined => getNsAttr(el, XML_NS.inkscape, "label");
const isLayer = (el: XmlElement): boolean =>
  getNsAttr(el, XML_NS.inkscape, "groupmode") === "layer";
const layersOf = (svg: string): XmlElement[] => childElements(rootOf(svg)).filter(isLayer);
const byId = (root: XmlElement, id: string): XmlElement | undefined => {
  const walk = (el: XmlElement): XmlElement | undefined => {
    if (getAttr(el, "id") === id) return el;
    for (const c of childElements(el)) {
      const hit = walk(c);
      if (hit) return hit;
    }
    return undefined;
  };
  return walk(root);
};
/** The ids of the paths that are drawings, not connectors, in document order. */
const pathIds = (svg: string): string[] =>
  [...svg.matchAll(/<path\b[^>]*?\sid="([^"]+)"/g)]
    .map((m) => m[1]!)
    .filter((id) => !id.startsWith("connector_") && !id.startsWith("inkstitch_"));

// ---------------------------------------------------------------------------

describe("parseColour / colourKey", () => {
  it("reads hex in both lengths, rgb() in numbers and percent, and the basic names", () => {
    expect(parseColour("#D1B35A")).toEqual({ r: 209, g: 179, b: 90 });
    expect(parseColour("#abc")).toEqual({ r: 170, g: 187, b: 204 });
    expect(parseColour(" rgb(209, 179, 90) ")).toEqual({ r: 209, g: 179, b: 90 });
    expect(parseColour("rgb(100%, 0%, 50%)")).toEqual({ r: 255, g: 0, b: 128 });
    expect(parseColour("Red")).toEqual({ r: 255, g: 0, b: 0 });
    expect(parseColour("orange")).toEqual({ r: 255, g: 165, b: 0 });
  });

  it("does not read what is not a colour, and does not guess", () => {
    for (const text of [
      "none",
      "transparent",
      "url(#g1)",
      "currentColor",
      "#12",
      "#1234567",
      "",
      "gold",
    ]) {
      expect(parseColour(text), text).toBeUndefined();
    }
    expect(parseColour("rgb(1, 2)")).toBeUndefined();
    expect(parseColour("rgb(300, 0, 0)")).toEqual({ r: 255, g: 0, b: 0 });
  });

  it("names a colour by one key: lower-case #rrggbb", () => {
    expect(colourKey("#D1B35A")).toBe("#d1b35a");
    expect(colourKey("#ABC")).toBe("#aabbcc");
    expect(colourKey("red")).toBe("#ff0000");
    expect(colourKey("url(#g1)")).toBeUndefined();
  });
});

describe("colourName / colourDistance", () => {
  it("names the colours of the customer logos", () => {
    const names: [string, string][] = [
      ["#d1b35a", "Gold"], // Hofbräu gold
      ["#d0b259", "Gold"],
      ["#d2060d", "Rot"], // Hofbräu red
      ["#e00310", "Rot"],
      ["#f0060b", "Rot"],
      ["#ac0109", "Dunkelrot"],
      ["#bebebe", "Hellgrau"], // STUTTGART
      ["#c6c0c0", "Hellgrau"],
      ["#7f7775", "Grau"],
      ["#ffffff", "Weiß"],
      ["#fdfdfd", "Weiß"],
      ["#000000", "Schwarz"],
      ["#010101", "Schwarz"],
      ["#1e1b1b", "Schwarz"],
      ["#2e3192", "Blau"], // Köln
      ["#3e499b", "Blau"],
      ["#fedd01", "Gelb"],
      ["#c4ab7a", "Beige"],
      ["#89724a", "Braun"],
    ];
    for (const [hex, name] of names) expect(colourName(hex), hex).toBe(name);
  });

  it("takes upper and lower case, short hex and names alike", () => {
    expect(colourName("#D1B35A")).toBe("Gold");
    expect(colourName("#000")).toBe("Schwarz");
    expect(colourName("red")).toBe("Rot");
  });

  it("says Unbekannt for what it cannot read", () => {
    expect(colourName("url(#g1)")).toBe("Unbekannt");
  });

  it("takes the nearest in RGB and, on a tie, the first of the palette", () => {
    const palette = [
      { name: "Eins", rgb: { r: 0, g: 0, b: 0 } },
      { name: "Zwei", rgb: { r: 100, g: 0, b: 0 } },
    ];
    expect(colourName("#320000", palette)).toBe("Eins"); // 50 from both
    expect(colourName("#330000", palette)).toBe("Zwei"); // 51 from one, 49 from the other
    expect(colourName("#310000", palette)).toBe("Eins");
  });

  it("has a palette of unique names, each of them the name of its own colour", () => {
    expect(new Set(PALETTE.map((p) => p.name)).size).toBe(PALETTE.length);
    for (const { name, rgb } of PALETTE) {
      const hex = `#${[rgb.r, rgb.g, rgb.b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
      expect(colourName(hex), name).toBe(name);
    }
  });

  it("measures the Euclidean distance in RGB", () => {
    expect(colourDistance("#000000", "#ffffff")).toBeCloseTo(Math.hypot(255, 255, 255), 9);
    expect(colourDistance("#d2060d", "#d2060d")).toBe(0);
    expect(colourDistance("#d2060d", "#d1070d")).toBeCloseTo(Math.SQRT2, 9);
    expect(colourDistance("#000000", "url(#g)")).toBe(Infinity);
  });

  it("sets the threshold for “same needle” between the noise of one colour and two that differ", () => {
    // Measured on the customer logos: the same red from two PDF sources differs by 1.4 (#d2060d,
    // #d1070d), the two closest colours of one file by 15.8 (#e00310 against #d1070d).
    expect(SAME_NEEDLE_RGB).toBeGreaterThan(colourDistance("#d2060d", "#d1070d"));
    expect(SAME_NEEDLE_RGB).toBeLessThan(colourDistance("#e00310", "#d1070d"));
  });
});

describe("buildReworkSvg — layers", () => {
  it("puts neighbouring objects of one colour into one layer, numbered, named and coloured", () => {
    const r = buildReworkSvg(SAMPLE, { widthMm: 40, heightMm: 20 });
    expect(r.layers.map((l) => l.label)).toEqual([
      "01 Schwarz #000000",
      "02 Gold #D1B35A",
      "03 Rot #D2060D",
    ]);
    expect(r.layers.map((l) => l.units)).toEqual([
      ["z01-black"],
      ["z02-gold", "z03-gold"],
      ["z04-red"],
    ]);
    expect(r.layers.map((l) => l.elements)).toEqual([1, 3, 1]);
    expect(layersOf(r.svg).map(label)).toEqual([
      "01 Schwarz #000000",
      "02 Gold #D1B35A",
      "03 Rot #D2060D",
      "Prüfstellen",
    ]);
  });

  it("never changes the order of what is stitched", () => {
    const r = buildReworkSvg(SAMPLE, { widthMm: 40, heightMm: 20 });
    expect(pathIds(r.svg)).toEqual(pathIds(SAMPLE));
    expect(pathIds(r.svg)).toEqual([
      "z01-black",
      "autosatin1",
      "autosatinrun1",
      "z03-gold",
      "autosatin2",
    ]);
  });

  it("makes a new layer where a colour comes back after another", () => {
    const doc = page(fill("a", GOLD) + fill("b", RED) + fill("c", GOLD));
    const r = buildReworkSvg(doc, { widthMm: 40, heightMm: 20 });
    expect(r.layers.map((l) => l.label)).toEqual([
      "01 Gold #D1B35A",
      "02 Rot #D2060D",
      "03 Gold #D1B35A",
    ]);
    expect(r.stops.map((s) => s.name)).toEqual(["Gold", "Rot", "Gold"]);
  });

  it("numbers with two digits and on past 99", () => {
    const body = Array.from({ length: 101 }, (_, i) =>
      fill(`p${i}`, i % 2 === 0 ? GOLD : RED),
    ).join("");
    const r = buildReworkSvg(page(body), { widthMm: 40, heightMm: 20 });
    expect(r.layers[0]!.label).toBe("01 Gold #D1B35A");
    expect(r.layers[8]!.label).toBe("09 Gold #D1B35A");
    expect(r.layers[99]!.label).toBe("100 Rot #D2060D");
    expect(r.layers).toHaveLength(101);
  });

  it("names the box of each layer on the page, for what is stitched in it", () => {
    const doc = page(
      `<path id="a" d="M 2 4 L 10 4 L 10 8 Z" style="fill:#d1b35a;stroke:none"/>` +
        group(
          "g1",
          `<path id="c1" d="M 20 0 L 24 0" style="fill:none;stroke:#d2060d"/>` + trim("c1"),
        ),
    );
    const r = buildReworkSvg(doc, { widthMm: 40, heightMm: 20 });
    expect(r.layers.map((l) => l.bounds)).toEqual([
      { minX: 2, minY: 4, maxX: 10, maxY: 8 },
      { minX: 20, minY: 0, maxX: 24, maxY: 0 },
    ]);
  });

  it("keeps a group whole and its trim command with its column", () => {
    const r = buildReworkSvg(SAMPLE, { widthMm: 40, heightMm: 20 });
    const root = rootOf(r.svg);
    const group2 = byId(root, "z02-gold")!;
    expect(childElements(group2).map((c) => getAttr(c, "id"))).toEqual([
      "autosatin1",
      "autosatinrun1",
      "command_group_autosatin1",
    ]);
    // The group is a child of its layer, and nothing but the layers stand at the top.
    expect(label(childElements(root).find((c) => childElements(c).includes(group2))!)).toBe(
      "02 Gold #D1B35A",
    );
  });

  it("does not take a command connector (black stroke) for a stitched object", () => {
    // The connector's stroke is #000000: counted as stitched, the gold group would hold two colours.
    const r = buildReworkSvg(SAMPLE, { widthMm: 40, heightMm: 20 });
    expect(r.notes).toEqual([]);
    expect(r.layers[1]!.hex).toBe(GOLD);
  });

  it("keeps the head where it was, before the first layer", () => {
    const r = buildReworkSvg(SAMPLE, { widthMm: 40, heightMm: 20 });
    const kids = childElements(rootOf(r.svg));
    expect(kids.slice(0, 3).map(localName)).toEqual(["defs", "namedview", "metadata"]);
    expect(kids.slice(3).every(isLayer)).toBe(true);
  });

  it("leaves out what Ink/Stitch does not stitch: hidden objects, ignored ones, defs", () => {
    const hidden = `<path id="h" d="M 0 0 L 1 1" style="fill:#ff0000;display:none"/>`;
    const ignored = `<g id="i" inkstitch:ignore_object="true">${fill("i1", "#00ff00")}</g>`;
    const nofill = `<path id="n" d="M 0 0 L 1 1" style="fill:none;stroke:none"/>`;
    const r = buildReworkSvg(page(fill("a", GOLD) + hidden + ignored + nofill + fill("b", GOLD)), {
      widthMm: 40,
      heightMm: 20,
    });
    expect(r.layers).toHaveLength(1);
    expect(r.layers[0]!.elements).toBe(2);
    expect(r.stops).toHaveLength(1);
    // What is not stitched goes along in the layer of the object before it, not out of the document.
    expect(pathIds(r.svg)).toEqual(["a", "h", "i1", "n", "b"]);
  });

  it("reads a colour from the group when the object names none (presentation attributes and style)", () => {
    const doc = page(
      `<g fill="#d1b35a"><path id="a" d="M 0 0 L 5 0 L 5 5 Z"/></g>` +
        `<g style="stroke:#d2060d"><path id="b" d="M 0 0 L 5 5" style="fill:none"/></g>`,
    );
    const r = buildReworkSvg(doc, { widthMm: 40, heightMm: 20 });
    expect(r.layers.map((l) => l.hex)).toEqual([GOLD, RED]);
  });

  it("treats #D1B35A and #d1b35a as one colour", () => {
    const r = buildReworkSvg(page(fill("a", "#D1B35A") + fill("b", "#d1b35a")), {
      widthMm: 40,
      heightMm: 20,
    });
    expect(r.layers).toHaveLength(1);
  });

  it("makes the layer for a document without stitched objects empty and says so", () => {
    const r = buildReworkSvg(page(""), { widthMm: 40, heightMm: 20 });
    expect(r.layers).toEqual([]);
    expect(r.stops).toEqual([]);
    expect(r.notes.map((n) => n.kind)).toEqual(["no-stitches"]);
    expect(layersOf(r.svg).map(label)).toEqual(["Prüfstellen"]);
  });
});

describe("buildReworkSvg — mixed groups (never split, never guessed)", () => {
  const mixed = group("mix", fill("m1", GOLD) + fill("m2", RED));
  const doc = page(fill("a", GOLD) + mixed + fill("b", RED));

  it("reports a group of several colours and sets it in a layer of its own, whole", () => {
    const r = buildReworkSvg(doc, { widthMm: 40, heightMm: 20 });
    expect(r.notes).toHaveLength(1);
    expect(r.notes[0]).toMatchObject({ kind: "mixed-colours", id: "mix" });
    expect(r.notes[0]!.message).toContain("mix");
    expect(r.notes[0]!.message).toContain("#D1B35A");
    expect(r.notes[0]!.message).toContain("#D2060D");
    expect(r.layers.map((l) => l.label)).toEqual([
      "01 Gold #D1B35A",
      "02 Mehrfarbig (Gruppe mix)",
      "03 Rot #D2060D",
    ]);
    const group = byId(rootOf(r.svg), "mix")!;
    expect(childElements(group).map((c) => getAttr(c, "id"))).toEqual(["m1", "m2"]);
  });

  it("does not let a mixed group join the layer before or after it", () => {
    const r = buildReworkSvg(
      page(fill("a", GOLD) + group("mix", fill("m1", GOLD) + fill("m2", RED)) + fill("b", RED)),
      {
        widthMm: 40,
        heightMm: 20,
      },
    );
    expect(r.layers.map((l) => l.units)).toEqual([["a"], ["mix"], ["b"]]);
  });

  it("still lists every colour change in the stops, group or not", () => {
    const r = buildReworkSvg(doc, { widthMm: 40, heightMm: 20 });
    // a gold | m1 gold | m2 red | b red: Gold, Rot — the stops follow the stitches, not the layers.
    expect(r.stops.map((s) => s.name)).toEqual(["Gold", "Rot"]);
  });

  it("keeps the order as it was", () => {
    const r = buildReworkSvg(doc, { widthMm: 40, heightMm: 20 });
    expect(pathIds(r.svg)).toEqual(pathIds(doc));
  });
});

describe("buildReworkSvg — colours it cannot read", () => {
  const doc = page(fill("a", "url(#verlauf)") + fill("b", GOLD));

  it("names the layer Unbekannt, reports it and does not merge it with a colour it has not seen", () => {
    const r = buildReworkSvg(doc, { widthMm: 40, heightMm: 20 });
    expect(r.layers.map((l) => l.label)).toEqual(["01 Unbekannt", "02 Gold #D1B35A"]);
    expect(r.layers[0]!.hex).toBeUndefined();
    expect(r.notes.map((n) => n.kind)).toEqual(["unreadable-colour"]);
    expect(r.notes[0]!.message).toContain("url(#verlauf)");
  });

  it("puts two neighbours with the same unreadable colour into one layer", () => {
    const r = buildReworkSvg(page(fill("a", "url(#v)") + fill("b", "url(#v)")), {
      widthMm: 40,
      heightMm: 20,
    });
    expect(r.layers).toHaveLength(1);
    expect(r.stops).toEqual([{ hex: undefined, name: "Unbekannt" }]);
  });
});

describe("buildReworkSvg — names", () => {
  it("names every stitched object: kind, colour, source id", () => {
    const r = buildReworkSvg(SAMPLE, { widthMm: 40, heightMm: 20 });
    const root = rootOf(r.svg);
    expect(label(byId(root, "z01-black")!)).toBe("Tatami · Schwarz · z01-black");
    expect(label(byId(root, "z03-gold")!)).toBe("Laufstich · Gold · z03-gold");
    expect(label(byId(root, "z04-red")!)).toBe("Satin · Rot · z04-red");
    // Inside a routed group the source is the group (the shape), whatever id Ink/Stitch gave the column.
    expect(label(byId(root, "autosatin1")!)).toBe("Satin · Gold · z02-gold");
    expect(label(byId(root, "autosatinrun1")!)).toBe("Laufstich · Gold · z02-gold");
    expect(label(byId(root, "autosatin2")!)).toBe("Satin · Rot · z04-red");
  });

  it("names a group after what it holds: Satin where there is a column in it", () => {
    const r = buildReworkSvg(SAMPLE, { widthMm: 40, heightMm: 20 });
    expect(label(byId(rootOf(r.svg), "z02-gold")!)).toBe("Satin · Gold · z02-gold");
  });

  it("replaces the label Ink/Stitch gave, under whatever prefix, and does not leave two", () => {
    const r = buildReworkSvg(SAMPLE, { widthMm: 40, heightMm: 20 });
    const column = byId(rootOf(r.svg), "autosatin1")!;
    expect(column.attrs.filter((a) => a.name.endsWith(":label"))).toHaveLength(1);
    expect(serializeNode(column)).not.toContain("AutoSatin 1");
  });

  it("does not touch the label of the trim command", () => {
    const r = buildReworkSvg(SAMPLE, { widthMm: 40, heightMm: 20 });
    expect(label(byId(rootOf(r.svg), "command_group_autosatin1")!)).toBe(
      "Ink/Stitch Command: Trim thread",
    );
  });

  it("keeps every parameter as it was (spec §13.4: all inkstitch: attributes stay)", () => {
    const r = buildReworkSvg(SAMPLE, { widthMm: 40, heightMm: 20 });
    const root = rootOf(r.svg);
    const tatami = byId(root, "z01-black")!;
    expect(getNsAttr(tatami, XML_NS.inkstitch, "row_spacing_mm")).toBe("0.4");
    expect(getNsAttr(tatami, XML_NS.inkstitch, "angle")).toBe("-45");
    expect(getAttr(tatami, "style")).toBe("fill:#000000;stroke:none");
    expect(getAttr(tatami, "d")).toBe("M 0 0 L 10 0 L 10 5 Z");
    expect(getNsAttr(byId(root, "autosatin1")!, XML_NS.inkstitch, "satin_column")).toBe("true");
    expect(getNsAttr(byId(root, "z03-gold")!, XML_NS.inkstitch, "stroke_method")).toBe(
      "running_stitch",
    );
  });

  it("calls a fill that is not the plain Ink/Stitch fill by another name", () => {
    const other = `<path id="c" d="M 0 0 L 4 0 L 4 4 Z" style="fill:#d1b35a;stroke:none" inkstitch:fill_method="contour_fill"/>`;
    const r = buildReworkSvg(page(other), { widthMm: 40, heightMm: 20 });
    expect(label(byId(rootOf(r.svg), "c")!)).toBe("Füllung · Gold · c");
  });

  it("writes a name for an object without an id", () => {
    const r = buildReworkSvg(
      page(`<path d="M 0 0 L 4 0 L 4 4 Z" style="fill:#d1b35a;stroke:none"/>`),
      {
        widthMm: 40,
        heightMm: 20,
      },
    );
    const path = childElements(layersOf(r.svg)[0]!)[0]!;
    expect(label(path)).toBe("Tatami · Gold · ohne Kennung");
  });
});

describe("buildReworkSvg — page", () => {
  it("leaves the size alone where it is what the run made", () => {
    const r = buildReworkSvg(SAMPLE, { widthMm: 40, heightMm: 20 });
    const root = rootOf(r.svg);
    expect(getAttr(root, "width")).toBe("40mm");
    expect(getAttr(root, "height")).toBe("20mm");
    expect(getAttr(root, "viewBox")).toBe("0 0 40 20");
    expect(r.notes).toEqual([]);
  });

  it("sets millimetres and a viewBox from 0 where the document has none", () => {
    const r = buildReworkSvg(`<svg ${NS}>${HEAD}${fill("a", GOLD)}</svg>`, {
      widthMm: 110.828,
      heightMm: 51.409,
    });
    const root = rootOf(r.svg);
    expect(getAttr(root, "width")).toBe("110.828mm");
    expect(getAttr(root, "height")).toBe("51.409mm");
    expect(getAttr(root, "viewBox")).toBe("0 0 110.828 51.409");
  });

  it("sets it and says so where the document is another size than the run", () => {
    const r = buildReworkSvg(
      page(fill("a", GOLD), `width="80mm" height="40mm" viewBox="0 0 80 40"`),
      {
        widthMm: 40,
        heightMm: 20,
      },
    );
    const root = rootOf(r.svg);
    expect(getAttr(root, "width")).toBe("40mm");
    expect(getAttr(root, "viewBox")).toBe("0 0 40 20");
    expect(r.notes.map((n) => n.kind)).toEqual(["page-size"]);
  });

  it("says so where the viewBox does not start at 0", () => {
    const r = buildReworkSvg(
      page(fill("a", GOLD), `width="40mm" height="20mm" viewBox="10 10 40 20"`),
      {
        widthMm: 40,
        heightMm: 20,
      },
    );
    expect(getAttr(rootOf(r.svg), "viewBox")).toBe("0 0 40 20");
    expect(r.notes.map((n) => n.kind)).toEqual(["page-size"]);
  });

  it("does not write the name of the document: the DST label must stay what the run wrote", () => {
    const r = buildReworkSvg(SAMPLE, { widthMm: 40, heightMm: 20 });
    expect(r.svg).not.toContain("docname");
  });

  it("refuses what is not an SVG", () => {
    expect(() => buildReworkSvg("<html/>", { widthMm: 1, heightMm: 1 })).toThrow(/SVG/);
    expect(() => buildReworkSvg("kein xml", { widthMm: 1, heightMm: 1 })).toThrow();
  });
});

describe("buildReworkSvg — check points (layer Prüfstellen)", () => {
  const spots: ReworkSpot[] = [
    { xMm: 12.5, yMm: 7.25, art: "Satinstrich", text: "0,71 mm statt 1,3 mm · größer sticken" },
    { xMm: 30, yMm: 15, art: "Nadelhäufung", text: "7 Einstiche in 0,2 mm" },
    { xMm: 1, yMm: 2, art: "Lücke", text: 'a < b & "c"' },
  ];

  it("is the last layer, hidden, and not stitched even when someone shows it", () => {
    const r = buildReworkSvg(SAMPLE, { widthMm: 40, heightMm: 20, spots });
    const all = layersOf(r.svg);
    const layer = all[all.length - 1]!;
    expect(label(layer)).toBe("Prüfstellen");
    expect(getAttr(layer, "style")).toBe("display:none");
    // Ink/Stitch does not stitch what the object parameter ignores, shown or not (verified in the smoke test).
    expect(getNsAttr(layer, XML_NS.inkstitch, "ignore_object")).toBe("true");
    expect(label(childElements(rootOf(r.svg)).pop()!)).toBe("Prüfstellen");
    expect(r.spots).toBe(3);
  });

  it("writes a circle and a text for every spot, in the order given, at the place given", () => {
    const r = buildReworkSvg(SAMPLE, { widthMm: 40, heightMm: 20, spots });
    const layer = layersOf(r.svg).pop()!;
    const entries = childElements(layer);
    expect(entries).toHaveLength(3);
    expect(entries.map(label)).toEqual(["1 Satinstrich", "2 Nadelhäufung", "3 Lücke"]);
    const [circle, text] = childElements(entries[0]!);
    expect(localName(circle!)).toBe("circle");
    expect(getAttr(circle!, "cx")).toBe("12.5");
    expect(getAttr(circle!, "cy")).toBe("7.25");
    expect(Number(getAttr(circle!, "r"))).toBeGreaterThan(0);
    expect(localName(text!)).toBe("text");
    // The text says what it is: number, kind, and the short text of the spot.
    const words = (text!.children[0] as { raw: string }).raw;
    expect(words).toBe("1 Satinstrich: 0,71 mm statt 1,3 mm · größer sticken");
  });

  it("escapes what the text holds", () => {
    const r = buildReworkSvg(SAMPLE, { widthMm: 40, heightMm: 20, spots });
    const layer = layersOf(r.svg).pop()!;
    const text = childElements(childElements(layer)[2]!)[1]!;
    expect((text.children[0] as { raw: string }).raw).toBe('3 Lücke: a &lt; b &amp; "c"');
    // And the document reads again.
    expect(() => parseXml(r.svg)).not.toThrow();
  });

  it("gives every element an id that is not in the document twice", () => {
    const clash = page(`<g id="pruefstelle-001">${fill("pruefstellen", GOLD)}</g>`);
    const r = buildReworkSvg(clash, { widthMm: 40, heightMm: 20, spots });
    const ids = [...r.svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]!);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("scales circle and text with the page, so they read on a large motif too", () => {
    const small = buildReworkSvg(SAMPLE, { widthMm: 40, heightMm: 20, spots });
    const big = buildReworkSvg(
      page(fill("a", GOLD), `width="250mm" height="150mm" viewBox="0 0 250 150"`),
      {
        widthMm: 250,
        heightMm: 150,
        spots,
      },
    );
    const radius = (svg: string): number =>
      Number(getAttr(childElements(childElements(layersOf(svg).pop()!)[0]!)[0]!, "r"));
    expect(radius(big.svg)).toBeGreaterThan(radius(small.svg));
  });

  it("is there, empty, without spots", () => {
    const r = buildReworkSvg(SAMPLE, { widthMm: 40, heightMm: 20 });
    const layer = layersOf(r.svg).pop()!;
    expect(label(layer)).toBe("Prüfstellen");
    expect(childElements(layer)).toHaveLength(0);
    expect(r.spots).toBe(0);
  });
});

describe("buildReworkSvg — the file it writes", () => {
  it("is a document that reads again, with the prefix declared once on the root", () => {
    const r = buildReworkSvg(SAMPLE, { widthMm: 40, heightMm: 20 });
    expect(r.svg.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<svg ')).toBe(true);
    expect(r.svg.endsWith("</svg>\n")).toBe(true);
    const root = rootOf(r.svg);
    expect(root.attrs.filter((a) => a.raw === XML_NS.inkscape)).toHaveLength(1);
    expect(getAttr(root, "xmlns:inkscape")).toBe(XML_NS.inkscape);
  });

  it("can be run on its own result: the order stays, and there is one layer of check points, the new one", () => {
    const first = buildReworkSvg(SAMPLE, {
      widthMm: 40,
      heightMm: 20,
      spots: [{ xMm: 1, yMm: 1, art: "Alt", text: "alt" }],
    });
    const second = buildReworkSvg(first.svg, {
      widthMm: 40,
      heightMm: 20,
      spots: [{ xMm: 2, yMm: 2, art: "Neu", text: "neu" }],
    });
    expect(pathIds(second.svg)).toEqual(pathIds(SAMPLE));
    expect(second.stops).toEqual(first.stops);
    // The names stay what they were: a layer is no source, and a layer keeps its own label.
    expect(label(byId(rootOf(second.svg), "autosatin1")!)).toBe("Satin · Gold · z02-gold");
    expect(label(byId(rootOf(second.svg), "z01-black")!)).toBe("Tatami · Schwarz · z01-black");
    expect(second.svg).not.toContain("Alt");
    expect(second.svg.match(/Prüfstellen/g)).toHaveLength(1);
    const last = childElements(rootOf(second.svg)).pop()!;
    expect(label(last)).toBe("Prüfstellen");
    expect(childElements(last)).toHaveLength(1);
  });

  it("is the same every time", () => {
    const a = buildReworkSvg(SAMPLE, { widthMm: 40, heightMm: 20 });
    const b = buildReworkSvg(SAMPLE, { widthMm: 40, heightMm: 20 });
    expect(a.svg).toBe(b.svg);
  });
});

describe("farbfolge", () => {
  const stop = (hex: string | undefined, name: string) => ({ hex, name });

  it("prints the header and one line per stop, names in a column, colour values upper case", () => {
    const text = farbfolge({
      name: "Stuttgarter_Hofbraeu_110mm",
      widthMm: 110.43,
      heightMm: 51.04,
      stitches: 9427,
      preset: "cap",
      stops: [stop("#d1b35a", "Gold"), stop("#d2060d", "Rot")],
    });
    expect(text).toBe(
      "Stuttgarter_Hofbraeu_110mm   110,4 x 51,0 mm   9.427 Stiche   Preset cap\n" +
        "  1 Gold  #D1B35A\n" +
        "  2 Rot   #D2060D\n",
    );
  });

  it("names a repeated colour by number and name alone", () => {
    const text = farbfolge({
      name: "x",
      widthMm: 10,
      heightMm: 10,
      stitches: 12,
      preset: "pique",
      stops: [stop("#d1b35a", "Gold"), stop("#d2060d", "Rot"), stop("#d1b35a", "Gold")],
    });
    expect(text.split("\n").slice(1, 4)).toEqual([
      "  1 Gold  #D1B35A",
      "  2 Rot   #D2060D",
      "  3 Gold",
    ]);
  });

  it("asks “dieselbe Nadel wie Stopp N?” where a colour is very close to an earlier one, and only there", () => {
    const close = "#d3070e"; // 1.7 from #d2060d
    const apart = "#e00310"; // 15.8 from #d1070d — two colours a puncher means apart
    const text = farbfolge({
      name: "x",
      widthMm: 10,
      heightMm: 10,
      stitches: 12,
      preset: "pique",
      stops: [
        stop("#d2060d", "Rot"),
        stop("#000000", "Schwarz"),
        stop(close, "Rot"),
        stop("#d1070d", "Rot"),
        stop(apart, "Rot"),
      ],
    });
    const lines = text.split("\n").slice(1, 6);
    expect(lines[2]).toBe("  3 Rot      #D3070E  dieselbe Nadel wie Stopp 1?");
    // #d1070d is 1.4 from #d2060d and 2.4 from #d3070e: the nearest, and the earlier stop of it, is stop 1.
    expect(lines[3]).toBe("  4 Rot      #D1070D  dieselbe Nadel wie Stopp 1?");
    expect(lines[4]).not.toContain("Nadel");
    expect(lines[0]).toBe("  1 Rot      #D2060D");
    expect(lines[1]).toBe("  2 Schwarz  #000000");
  });

  it("does not ask for a colour that is very close to an earlier one only by being the same", () => {
    const text = farbfolge({
      name: "x",
      widthMm: 10,
      heightMm: 10,
      stitches: 12,
      preset: "pique",
      stops: [stop("#d2060d", "Rot"), stop("#d2060d", "Rot")],
    });
    expect(text).not.toContain("Nadel");
  });

  it("aligns the numbers from ten stops on", () => {
    const stops = Array.from({ length: 10 }, (_, i) => stop(`#0000${i.toString(16)}0`, "Schwarz"));
    const lines = farbfolge({
      name: "x",
      widthMm: 1,
      heightMm: 1,
      stitches: 1,
      preset: "p",
      stops,
    }).split("\n");
    expect(lines[1]!.startsWith("   1 Schwarz")).toBe(true);
    expect(lines[10]!.startsWith("  10 Schwarz")).toBe(true);
  });

  it("writes a stop of a colour it cannot read without a value", () => {
    const text = farbfolge({
      name: "x",
      widthMm: 10,
      heightMm: 10,
      stitches: 12,
      preset: "pique",
      stops: [stop(undefined, "Unbekannt"), stop("#d2060d", "Rot")],
    });
    expect(text.split("\n").slice(1, 3)).toEqual(["  1 Unbekannt", "  2 Rot  #D2060D"]);
  });

  it("formats numbers the German way, thousands with a dot, one decimal with a comma", () => {
    const text = farbfolge({
      name: "x",
      widthMm: 1234.56,
      heightMm: 0.04,
      stitches: 1234567,
      preset: "pique",
      stops: [],
    });
    expect(text).toBe("x   1.234,6 x 0,0 mm   1.234.567 Stiche   Preset pique\n");
  });
});

describe("elementCentres / documentBounds", () => {
  const routed = page(
    `<path id="a" d="M 2 4 L 10 4 L 10 8 Z" style="fill:#d1b35a;stroke:none"/>` +
      group(
        "g1",
        `<path id="c1" d="M 20 0 L 24 0" style="fill:none;stroke:#d2060d"/><path id="c2" d="M 20 10 L 24 10" style="fill:none;stroke:#d2060d"/>` +
          trim("c2"),
      ),
  );

  it("names the middle of the bounding box of every object and group, in millimetres on the page", () => {
    const c = elementCentres(routed);
    expect(c.get("a")).toEqual({ x: 6, y: 6 });
    expect(c.get("c1")).toEqual({ x: 22, y: 0 });
    // A group is the box of everything in it — the command beside it (a connector at 1,1) is not stitched.
    expect(c.get("g1")).toEqual({ x: 22, y: 5 });
  });

  it("follows the transform of the parents and the scale of the page", () => {
    const doc =
      `<svg ${NS} width="20mm" height="10mm" viewBox="10 20 40 20">` +
      `<g id="g" transform="translate(5,0)"><path id="p" d="M 10 20 L 30 40" style="fill:none;stroke:#000000"/></g></svg>`;
    // Translate 5: x 15..35, y 20..40; the origin (10, 20) comes off and the scale is 0.5 mm per unit.
    expect(elementCentres(doc).get("p")).toEqual({ x: 7.5, y: 5 });
    expect(documentBounds(doc)).toEqual({ minX: 2.5, minY: 0, maxX: 12.5, maxY: 10 });
  });

  it("gives the bounds of everything that is stitched", () => {
    expect(documentBounds(routed)).toEqual({ minX: 2, minY: 0, maxX: 24, maxY: 10 });
  });

  it("has no bounds and no centres for a document without stitched paths", () => {
    expect(documentBounds(page(""))).toBeUndefined();
    expect(elementCentres(page("")).size).toBe(0);
  });

  it("does not count hidden objects", () => {
    const doc = page(
      `<path id="a" d="M 0 0 L 4 4" style="fill:none;stroke:#000000"/>` +
        `<path id="b" d="M 0 0 L 40 20" style="fill:none;stroke:#000000;display:none"/>`,
    );
    expect(documentBounds(doc)).toEqual({ minX: 0, minY: 0, maxX: 4, maxY: 4 });
    expect(elementCentres(doc).has("b")).toBe(false);
  });
});

describe("elementKinds", () => {
  it("names what each stitched object is, by id", () => {
    const kinds = elementKinds(SAMPLE);
    expect([...kinds]).toEqual([
      ["z01-black", "Tatami"],
      ["autosatin1", "Satin"],
      ["autosatinrun1", "Laufstich"],
      ["z03-gold", "Laufstich"],
      ["autosatin2", "Satin"],
    ]);
  });

  it("leaves out objects without an id, hidden ones and the connector of a command", () => {
    const doc = page(
      `<path d="M 0 0 L 4 4" style="fill:none;stroke:#000000"/>` +
        `<path id="h" d="M 0 0 L 4 4" style="fill:none;stroke:#000000;display:none"/>` +
        group("g", trim("x")),
    );
    expect(elementKinds(doc).size).toBe(0);
  });
});

describe("pageSizeMm", () => {
  it("reads the size of the page in millimetres, whatever unit the file says", () => {
    expect(
      pageSizeMm(page("", `width="110.828mm" height="51.409mm" viewBox="0 0 110.828 51.409"`)),
    ).toEqual({
      widthMm: 110.828,
      heightMm: 51.409,
    });
    const px = pageSizeMm(page("", `width="96" height="192" viewBox="0 0 96 192"`))!;
    expect(px.widthMm).toBeCloseTo(25.4, 9);
    expect(px.heightMm).toBeCloseTo(50.8, 9);
  });

  it("has none where the file names none", () => {
    expect(pageSizeMm(`<svg ${NS}/>`)).toBeUndefined();
    expect(pageSizeMm(`<svg ${NS} width="50%" height="10mm"/>`)).toBeUndefined();
  });
});

describe("the version of the document (inkstitch_svg_version)", () => {
  const withMetadata = (metadata: string): string =>
    `<svg ${NS} ${SIZE}><metadata>${metadata}</metadata>${fill("a", GOLD)}</svg>`;

  it("names the version the repo has been checked against", () => {
    expect(INKSTITCH_SVG_VERSION).toBe(4);
  });

  it("reads the version Ink/Stitch wrote into the metadata", () => {
    expect(inkstitchSvgVersion(SAMPLE)).toBe(4);
    expect(
      inkstitchSvgVersion(
        withMetadata(`<inkstitch:inkstitch_svg_version>3</inkstitch:inkstitch_svg_version>`),
      ),
    ).toBe(3);
  });

  it("finds it as Ink/Stitch does, by the local name, whatever the prefix", () => {
    const doc = `<svg ${NS} ${SIZE}><metadata><x:inkstitch_svg_version xmlns:x="urn:other">4</x:inkstitch_svg_version></metadata></svg>`;
    expect(inkstitchSvgVersion(doc)).toBe(4);
  });

  it("has none where the document names none, or none that is a number", () => {
    expect(inkstitchSvgVersion(`<svg ${NS} ${SIZE}/>`)).toBeUndefined();
    expect(inkstitchSvgVersion(withMetadata(""))).toBeUndefined();
    expect(
      inkstitchSvgVersion(
        withMetadata(`<inkstitch:inkstitch_svg_version>vier</inkstitch:inkstitch_svg_version>`),
      ),
    ).toBeUndefined();
  });

  it("says nothing where the document has the version, and reports it in the result", () => {
    const r = buildReworkSvg(SAMPLE, { widthMm: 40, heightMm: 20 });
    expect(r.inkstitchSvgVersion).toBe(4);
    expect(r.notes.filter((n) => n.kind === "svg-version")).toEqual([]);
  });

  it("keeps the version in the file it writes, unchanged", () => {
    const r = buildReworkSvg(SAMPLE, { widthMm: 40, heightMm: 20 });
    expect(inkstitchSvgVersion(r.svg)).toBe(4);
  });

  it("reports a document without a version and does not make one up — Ink/Stitch would update it on opening", () => {
    const bare = `<svg ${NS} ${SIZE}>${fill("a", GOLD)}</svg>`;
    const r = buildReworkSvg(bare, { widthMm: 40, heightMm: 20 });
    expect(r.inkstitchSvgVersion).toBeUndefined();
    expect(r.notes.map((n) => n.kind)).toEqual(["svg-version"]);
    expect(r.notes[0]!.message).toContain("keine inkstitch_svg_version");
    expect(inkstitchSvgVersion(r.svg)).toBeUndefined();
  });

  it("reports a version other than the one it was checked against", () => {
    const older = `<svg ${NS} ${SIZE}><metadata><inkstitch:inkstitch_svg_version>3</inkstitch:inkstitch_svg_version></metadata>${fill("a", GOLD)}</svg>`;
    const r = buildReworkSvg(older, { widthMm: 40, heightMm: 20 });
    expect(r.inkstitchSvgVersion).toBe(3);
    expect(r.notes.map((n) => n.kind)).toEqual(["svg-version"]);
    expect(r.notes[0]!.message).toContain("Version 3");
  });
});
