/**
 * Ausgabe der Feinheits-Prüfung (tools/feinheit.mjs): Zusammenfassung, Tabelle, Vorschaubild.
 * Gerechnet wird in packages/engine/src/inkstitch/min-size.ts und dort geprüft; hier steht,
 * dass das, was der Nutzer liest und sieht, dazu passt. Eigene Formen, keine Kundenlogos.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { initGeometry } from "@texma-stitch/geometry";
import { checkMinimumSize } from "@texma-stitch/engine";
import {
  areaShape,
  gapBlocks,
  pinwheel,
  polygonOf,
  punzeDisc,
  rect,
} from "../packages/engine/test/fixtures/shapes.js";
import {
  befundeJeArt,
  befundZeilen,
  feinheitSvg,
  mm,
  svgZuPng,
  zusammenfassung,
} from "../tools/feinheit.mjs";

beforeAll(async () => {
  await initGeometry();
});

const GRAY = "#bebebe";
/** Eine Lücke von 0,5 mm (Rang 1: hält ab ≈ 116 mm) und ein Strich von 1 mm (Rang 2, ≈ 102 mm). */
function szene() {
  const [a, b] = gapBlocks(0.5);
  const shapes = [
    areaShape("a", a, GRAY),
    areaShape("b", b, GRAY),
    areaShape("zier", polygonOf(rect(0, 20, 40, 1.0)), "#000000"),
  ];
  return { shapes, result: checkMinimumSize(shapes, { widthMm: 80 }) };
}

/**
 * Stoff von 0,5 mm zwischen Grau und Rot (Rang 1: hält ab ≈ 116 mm) und ein Strich von 1 mm
 * (Rang 2, ≈ 102 mm): dieselbe Szene, nur ist die zweite Form rot statt grau.
 */
function szeneStoff() {
  const [a, b] = gapBlocks(0.5);
  const shapes = [
    areaShape("a", a, GRAY),
    areaShape("b", b, "#c8102e"),
    areaShape("zier", polygonOf(rect(0, 20, 40, 1.0)), "#000000"),
  ];
  return { shapes, result: checkMinimumSize(shapes, { widthMm: 80 }) };
}

describe("mm", () => {
  it("druckt Millimeter mit Punkt", () => {
    expect(mm(1.3)).toBe("1.30");
    expect(mm(80, 1)).toBe("80.0");
  });
});

describe("befundeJeArt", () => {
  it("zählt Satinstriche, Lücken und Stofflücken getrennt", () => {
    expect(befundeJeArt(szene().result)).toEqual({ satin: 1, luecke: 1, stoff: 0 });
    expect(befundeJeArt(szeneStoff().result)).toEqual({ satin: 1, luecke: 0, stoff: 1 });
  });
});

describe("zusammenfassung", () => {
  it("nennt die Mindestgröße aus den Satinstrichen und daneben, ab wann alle Lücken offen sind", () => {
    const { result } = szene();
    const lines = zusammenfassung(result);
    expect(lines[0]).toContain(`Mindestgröße     ${Math.ceil(result.minimumWidthMm!)} mm`);
    expect(lines[0]).toContain(`bestimmt von Satinstrich ${result.decisive!.id}`);
    expect(lines[0]).toContain("Grenze 1.3 mm");
    expect(lines[1]).toContain(`Lücken offen ab  ${Math.ceil(result.gapsOpenFromWidthMm!)} mm`);
    expect(lines[1]).toContain(`bestimmt von Lücke ${result.decisiveGap!.id}`);
    expect(lines[1]).toContain("Grenze 0.8 mm");
    expect(lines.join("\n")).toContain("1 Satinstrich unter 1.3 mm, 1 Lücke unter 0.8 mm");
    // Die Lücke verlangt mehr als der Strich — und ändert die Mindestgröße trotzdem nicht.
    expect(result.gapsOpenFromWidthMm!).toBeGreaterThan(result.minimumWidthMm!);
  });

  it("sagt, wo alle Striche halten, wie weit das Logo schrumpfen könnte", () => {
    const shapes = [areaShape("balken", polygonOf(rect(0, 0, 40, 2)))];
    const result = checkMinimumSize(shapes, { widthMm: 80 });
    const lines = zusammenfassung(result);
    expect(lines[0]).toContain(`Mindestgröße     ${Math.ceil(result.minimumWidthMm!)} mm`);
    expect(lines[0]).toContain("schmalster Satinstrich balken");
    expect(lines[0]).toContain("die bestellten 80.0 mm halten");
    expect(result.minimumWidthMm!).toBeLessThan(80);
    expect(lines[1]).toContain("keine zu feinen Lücken bei 80.0 mm");
    expect(lines.join("\n")).toContain("0 Satinstriche unter 1.3 mm, 0 Lücken unter 0.8 mm");
  });

  it("sagt es, wenn das Logo keinen Satinstrich hat", () => {
    const [a, b] = gapBlocks(0.5, 10, 8);
    const result = checkMinimumSize([areaShape("a", a, GRAY), areaShape("b", b, GRAY)], {
      widthMm: 80,
    });
    const lines = zusammenfassung(result);
    expect(lines[0]).toContain("keine Satinstriche im Logo");
    expect(lines[1]).toContain(`Lücken offen ab  ${Math.ceil(result.gapsOpenFromWidthMm!)} mm`);
  });

  it("sagt, was der Filter für Lücken herausgenommen hat", () => {
    const { result } = szene();
    const text = zusammenfassung(result).join("\n");
    expect(text).toContain("Nicht gezählt");
    expect(text).toContain(`${result.ignored.slivers} Stücke ganz von Spänen (unter 0.01 mm)`);
    expect(text).toContain(`${result.ignored.thin} unter 0.1 mm Breite`);
    expect(text).toContain(`${result.ignored.compact} ohne Mittelachse`);
    expect(text).toContain(`von ${result.gapPieces} Stücken des Schließens`);
  });

  it("nennt die Stofflücke, die die zweite Zahl bestimmt, und zählt sie als eigene Art", () => {
    const { result } = szeneStoff();
    const lines = zusammenfassung(result);
    expect(lines[1]).toContain(`Lücken offen ab  ${Math.ceil(result.gapsOpenFromWidthMm!)} mm`);
    expect(lines[1]).toContain("bestimmt von Stofflücke fabric-001");
    expect(lines[1]).toContain("Grenze 0.8 mm");
    expect(lines.join("\n")).toContain(
      "1 Satinstrich unter 1.3 mm, 0 Lücken unter 0.8 mm, " +
        "1 Stofflücke (zwischen Farben) unter 0.8 mm",
    );
    // Die Mindestgröße kommt weiter allein aus den Satinstrichen.
    expect(lines[0]).toContain(`bestimmt von Satinstrich ${result.decisive!.id}`);
  });

  it("lässt auf Wunsch die Zeile der Mindestgröße weg: wo das Tor sie sagt, stünde dort eine zweite Zahl", () => {
    const { result } = szene();
    const lines = zusammenfassung(result, { ohneMindestgroesse: true });
    expect(lines.some((l: string) => l.startsWith("Mindestgröße"))).toBe(false);
    expect(lines[0]).toContain(`Lücken offen ab  ${Math.ceil(result.gapsOpenFromWidthMm!)} mm`);
    expect(lines).toHaveLength(zusammenfassung(result).length - 1);
    // Der Rest ist derselbe Text.
    expect(lines).toEqual(zusammenfassung(result).slice(1));
  });

  it("sagt auch, was der Filter bei den Stofflücken herausgenommen hat", () => {
    // Grau und Grau: die Lücke einer Farbe. Das Schließen aller Formen findet sie wieder und
    // überlässt sie der Farbe — das steht in der Zusammenfassung, nicht still verschwunden.
    const [a, b] = gapBlocks(0.5);
    const result = checkMinimumSize(
      [
        areaShape("a", a, GRAY),
        areaShape("b", b, GRAY),
        areaShape("rot", polygonOf(rect(0, 30, 20, 3)), "#c8102e"),
      ],
      { widthMm: 80 },
    );
    expect(result.fabricIgnored.duplicate).toBe(1);
    const line = zusammenfassung(result).find((l: string) => l.includes("Stofflücken:"))!;
    expect(line).toContain(
      `${result.fabricIgnored.slivers} Stücke ganz von Spänen (unter 0.01 mm)`,
    );
    expect(line).toContain(`${result.fabricIgnored.thin} unter 0.1 mm Breite`);
    expect(line).toContain(`${result.fabricIgnored.compact} ohne Mittelachse`);
    expect(line).toContain(`${result.fabricIgnored.wide} mit gemessener Breite ab der Grenze`);
    expect(line).toContain("1 schon als Lücke einer Farbe gemeldet");
    expect(line).toContain(`von ${result.fabricPieces} Stücken des Schließens aller Formen`);
  });
});

describe("befundZeilen", () => {
  it("listet die Befunde in der Reihenfolge der Prüfung, mit Rang, Maßen und Lage", () => {
    const { result } = szene();
    const lines = befundZeilen(result.findings);
    expect(lines).toHaveLength(3); // Kopf und zwei Befunde
    expect(lines[0]).toContain("hält ab");
    expect(lines[1]).toMatch(
      /^ {3}1 {2}Lücke {7}gap-bebebe-001 +0\.\d\d mm +0\.8 mm +\d+ mm {2}\(10\.3, 2\.5\)/,
    );
    expect(lines[2]).toMatch(
      /^ {3}2 {2}Satinstrich zier +1\.\d\d mm +1\.3 mm +\d+ mm {2}\(20\.0, 20\.5\)/,
    );
  });

  it("rundet „hält ab“ auf: ab dieser Breite stimmt die Aussage", () => {
    const { result } = szene();
    const first = result.findings[0]!;
    expect(befundZeilen(result.findings)[1]).toContain(`${Math.ceil(first.holdsFromWidthMm)} mm`);
  });

  it("nennt bei einer Stofflücke die Farben, zwischen denen sie liegt", () => {
    const { result } = szeneStoff();
    const lines = befundZeilen(result.findings);
    expect(lines[1]).toMatch(
      /^ {3}1 {2}Stofflücke {2}fabric-001 +0\.\d\d mm +0\.8 mm +\d+ mm {2}\(10\.3, 2\.5\) +zwischen #bebebe und #c8102e$/,
    );
    expect(lines[2]).not.toContain("zwischen");
  });

  it("nennt keine Farben, wo die Stofflücke keine nennt", () => {
    const { result } = szeneStoff();
    const ohneFarben = { ...result.findings[0]!, color: "" };
    expect(befundZeilen([ohneFarben])[1]).not.toContain("zwischen");
  });

  it("nennt bei einem Loch zwischen Farben beides: die Farben und den einbeschriebenen Kreis", () => {
    const [o, r, u, l] = pinwheel(0.5);
    const shapes = [
      areaShape("o", o, "#111111"),
      areaShape("r", r, "#222222"),
      areaShape("u", u, "#333333"),
      areaShape("l", l, "#444444"),
    ];
    const lines = befundZeilen(checkMinimumSize(shapes, { widthMm: 80 }).findings);
    expect(lines[1]).toContain("zwischen #111111 und #222222 und #333333 und #444444");
    expect(lines[1]).toContain("Loch: Breite = einbeschriebener Kreis");
  });

  it("weist eine dünne Satinform als mögliche Zierlinie aus", () => {
    const { result } = szene();
    const lines = befundZeilen(result.findings);
    expect(lines[2]).toContain("alternativ Laufstich");
    expect(lines[1]).not.toContain("alternativ Laufstich");
  });

  it("sagt bei einem Loch, dass seine Breite der einbeschriebene Kreis ist, nicht die Mittelachse", () => {
    const shapes = [areaShape("ring", punzeDisc(0.5), GRAY)];
    const lines = befundZeilen(checkMinimumSize(shapes, { widthMm: 80 }).findings);
    expect(lines[1]).toContain("Loch: Breite = einbeschriebener Kreis");
  });

  it("kürzt die Anzeige und sagt, wie viele fehlen", () => {
    const { result } = szene();
    const lines = befundZeilen(result.findings, { max: 1 });
    expect(lines).toHaveLength(3); // Kopf, ein Befund, die Kürzungszeile
    expect(lines[2]).toContain("… und 1 weitere (nicht aufgelistet)");
  });
});

describe("feinheitSvg", () => {
  it("zeichnet alle Formen grau und jeden Befund rot, die Befunde beschriftet", () => {
    const { shapes, result } = szene();
    const svg = feinheitSvg(shapes, result, { name: "probe", heightMm: 30 });
    expect(svg.startsWith(`<?xml version="1.0" encoding="UTF-8"?>`)).toBe(true);
    expect(svg).toContain("<title>Feinheit (Spec §5.2) — probe</title>");
    // Grau: drei Formen, rot: zwei Befunde.
    const grau = svg.split(`<g fill="#e2e2e2"`)[1]!.split("</g>")[0]!;
    expect(grau.match(/<path /g)).toHaveLength(3);
    const rot = svg.split(`<g fill="#d40000"`)[1]!.split("</g>")[0]!;
    expect(rot.match(/<path /g)).toHaveLength(2);
    // Beschriftung: L für die Lücke, S für den Strich, Nummer wie in der Liste — je zweimal (Rand, Schrift).
    expect(svg.match(/>L1</g)).toHaveLength(2);
    expect(svg.match(/>S2</g)).toHaveLength(2);
  });

  it("kennzeichnet eine Stofflücke mit F und sagt es im Kopf", () => {
    const { shapes, result } = szeneStoff();
    const svg = feinheitSvg(shapes, result, { name: "probe", heightMm: 30 });
    // Rang 1 ist die Stofflücke, Rang 2 der Strich — je zweimal im Bild (Rand, Schrift).
    expect(svg.match(/>F1</g)).toHaveLength(2);
    expect(svg.match(/>S2</g)).toHaveLength(2);
    expect(svg).not.toContain(">L1<");
    expect(svg).toContain("F Stofflücke");
    expect(svg).toContain(
      `Lücken offen ab ${Math.ceil(result.gapsOpenFromWidthMm!)} mm (fabric-001`,
    );
    expect(svg).toContain("1 Stofflücke");
    // Der Strich wird rot gezeichnet, die Stofflücke blau — sie liegt oft neben einem roten Strich.
    const rot = svg.split(`<g fill="#d40000"`)[1]!.split("</g>")[0]!;
    expect(rot.match(/<path /g)).toHaveLength(1);
    const blau = svg.split(`<g fill="#0057d9"`)[1]!.split("</g>")[0]!;
    expect(blau.match(/<path /g)).toHaveLength(1);
    expect(svg).toContain("blau: Stofflücke");
  });

  it("stellt die Seite und, wo Formen darüber hinausreichen, auch diese dar", () => {
    const { shapes, result } = szene();
    const svg = feinheitSvg(shapes, result, { name: "probe", heightMm: 30 });
    // Seite 80 mm breit; die Formen reichen bis 40 mm: die Seite gilt. Oben liegt der Kopf.
    const viewBox = /viewBox="(\S+) (\S+) (\S+) (\S+)"/.exec(svg)!;
    expect(Number(viewBox[1])).toBe(0);
    expect(Number(viewBox[3])).toBe(80);
    expect(Number(viewBox[2])).toBeLessThan(0);
    expect(Number(viewBox[2]) + Number(viewBox[4])).toBeCloseTo(30, 2);
  });

  it("lässt die Seite weg, wo keine Form sie berührt — der viewBox-Ursprung, den der Import nicht abzieht", () => {
    // Hofbräu: viewBox="29.9 367.2 …", die Formen liegen rund 76 mm unter der Seite. Das Bild
    // zeigt die Formen, nicht zwei Drittel Leere.
    const shapes = [
      areaShape("a", polygonOf(rect(0, 100, 10, 5)), GRAY),
      areaShape("b", polygonOf(rect(10.5, 100, 10, 5)), GRAY),
    ];
    const result = checkMinimumSize(shapes, { widthMm: 80 });
    const svg = feinheitSvg(shapes, result, { name: "probe", heightMm: 30 });
    const viewBox = /viewBox="(\S+) (\S+) (\S+) (\S+)"/.exec(svg)!;
    expect(Number(viewBox[3])).toBeCloseTo(20.5, 2); // die Breite der Formen, nicht der 80 mm der Seite
    expect(Number(viewBox[2])).toBeGreaterThan(30); // beginnt unter der Seite (Kopf darüber)
    expect(Number(viewBox[2]) + Number(viewBox[4])).toBeCloseTo(105, 2);
  });

  it("schreibt beide Zahlen in den Kopf", () => {
    const { shapes, result } = szene();
    const svg = feinheitSvg(shapes, result, { name: "probe", heightMm: 30 });
    expect(svg).toContain(
      `Mindestgröße ${Math.ceil(result.minimumWidthMm!)} mm (Satinstrich ${result.decisive!.id}`,
    );
    expect(svg).toContain(
      `Lücken offen ab ${Math.ceil(result.gapsOpenFromWidthMm!)} mm (${result.decisiveGap!.id}`,
    );
  });

  it("schreibt, wo das Tor die Mindestgröße gefunden hat, dessen Text in den Kopf statt der Hochrechnung", () => {
    const { shapes, result } = szene();
    const svg = feinheitSvg(shapes, result, {
      name: "probe",
      heightMm: 30,
      mindest: "Mindestgröße 252 mm (bestellt 80 mm)",
    });
    expect(svg).toContain("80.0 mm breit · Mindestgröße 252 mm (bestellt 80 mm)");
    expect(svg).not.toContain(`Mindestgröße ${Math.ceil(result.minimumWidthMm!)} mm (Satinstrich`);
    // Die Lücken stehen weiter im Kopf.
    expect(svg).toContain(`Lücken offen ab ${Math.ceil(result.gapsOpenFromWidthMm!)} mm (`);
  });

  it("beschriftet höchstens so viele Befunde, wie gesagt — die bestimmenden immer", () => {
    // Drei Befunde: die Lücke von 0,5 mm (Rang 1), der Strich (Rang 2), eine Lücke von 0,7 mm (Rang 3).
    const [a, b] = gapBlocks(0.5);
    const shapes = [
      areaShape("a", a, GRAY),
      areaShape("b", b, GRAY),
      areaShape("c", polygonOf(rect(0, 40, 10, 5)), GRAY),
      areaShape("d", polygonOf(rect(10.7, 40, 10, 5)), GRAY),
      areaShape("zier", polygonOf(rect(0, 20, 40, 1.0)), "#000000"),
    ];
    const result = checkMinimumSize(shapes, { widthMm: 80 });
    expect(result.findings.map((f) => f.kind)).toEqual(["gap", "satin-stroke", "gap"]);
    const svg = feinheitSvg(shapes, result, { name: "probe", beschriftet: 1 });
    expect(svg).toContain("die 1 mit der größten Mindestbreite");
    // Rang 1 ist die bestimmende Lücke, Rang 2 der bestimmende Strich: beide stehen im Bild, Rang 3 nicht.
    expect(svg.match(/>L1</g)).toHaveLength(2);
    expect(svg.match(/>S2</g)).toHaveLength(2);
    expect(svg).not.toContain(">L3<");
    // Mit mehr Plätzen kommt der dritte dazu.
    expect(feinheitSvg(shapes, result, { name: "probe", beschriftet: 3 })).toContain(">L3<");
  });

  it("zeichnet die Löcher einer Form offen (evenodd)", () => {
    const ring = { outer: rect(0, 0, 10, 10), holes: [rect(4, 4, 2, 2).reverse()] };
    const shapes = [areaShape("ring", ring)];
    const result = checkMinimumSize(shapes, { widthMm: 80 });
    const svg = feinheitSvg(shapes, result, { name: "ring", heightMm: 10 });
    expect(svg).toContain(`fill-rule="evenodd"`);
    // Ein Pfad, zwei Ringe.
    const grau = svg.split(`<g fill="#e2e2e2"`)[1]!.split("</g>")[0]!;
    expect(grau.match(/Z/g)).toHaveLength(2);
  });

  it("maskiert Zeichen des Namens, die im XML etwas bedeuten", () => {
    const { shapes, result } = szene();
    const svg = feinheitSvg(shapes, result, { name: "a&b<c>" });
    expect(svg).toContain("a&amp;b&lt;c&gt;");
    expect(svg).not.toContain("a&b<c>");
  });
});

describe("svgZuPng", () => {
  it("macht aus dem Vorschaubild ein PNG in der Größe der SVG", async () => {
    const { shapes, result } = szene();
    const svg = feinheitSvg(shapes, result, { name: "probe", heightMm: 30, pxBreite: 400 });
    const png = await svgZuPng(svg);
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const width = /<svg [^>]*width="(\d+)"/.exec(svg)![1]!;
    const height = /<svg [^>]*height="(\d+)"/.exec(svg)![1]!;
    // IHDR: Breite und Höhe als Big-Endian ab Byte 16.
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
    expect(view.getUint32(16)).toBe(Number(width));
    expect(view.getUint32(20)).toBe(Number(height));
  });
});
