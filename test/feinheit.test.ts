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

describe("mm", () => {
  it("druckt Millimeter mit Punkt", () => {
    expect(mm(1.3)).toBe("1.30");
    expect(mm(80, 1)).toBe("80.0");
  });
});

describe("befundeJeArt", () => {
  it("zählt Satinstriche und Lücken getrennt", () => {
    const { result } = szene();
    expect(befundeJeArt(result)).toEqual({ satin: 1, luecke: 1 });
  });
});

describe("zusammenfassung", () => {
  it("nennt die Mindestgröße, das bestimmende Element und die Zahl der Befunde je Art", () => {
    const { result } = szene();
    const text = zusammenfassung(result).join("\n");
    expect(text).toContain(`Mindestgröße  ${Math.ceil(result.minimumWidthMm!)} mm`);
    expect(text).toContain(`Lücke ${result.decisive!.id}`);
    expect(text).toContain("1 Satinstrich unter 1.3 mm, 1 Lücke unter 0.8 mm");
  });

  it("sagt, was jede Art für sich verlangt", () => {
    const { result } = szene();
    const satin = result.findings.find((f) => f.kind === "satin-stroke")!;
    const luecke = result.findings.find((f) => f.kind === "gap")!;
    const text = zusammenfassung(result).join("\n");
    expect(text).toContain(
      `davon         Satinstriche ab ${Math.ceil(satin.holdsFromWidthMm)} mm (zier), ` +
        `Lücken ab ${Math.ceil(luecke.holdsFromWidthMm)} mm (${luecke.id})`,
    );
    // Nur Lücken: der Satinteil sagt „keine“ statt zu schweigen.
    const [a, b] = gapBlocks(0.5);
    const nurLuecken = checkMinimumSize([areaShape("a", a, GRAY), areaShape("b", b, GRAY)], {
      widthMm: 80,
    });
    expect(zusammenfassung(nurLuecken).join("\n")).toContain("Satinstriche: keine");
  });

  it("sagt, was das Schließen fand und nicht gezählt hat", () => {
    const { result } = szene();
    const text = zusammenfassung(result).join("\n");
    expect(text).toContain("Nicht gezählt");
    expect(text).toContain(`von ${result.gapPieces} Stücken des Schließens`);
  });

  it("sagt es, wenn nichts zu fein ist — und dass kleiner nicht geprüft wird", () => {
    const shapes = [areaShape("balken", polygonOf(rect(0, 0, 40, 2)))];
    const text = zusammenfassung(checkMinimumSize(shapes, { widthMm: 80 })).join("\n");
    expect(text).toContain("keine zu feinen Elemente bei 80.0 mm");
    expect(text).toContain("kleiner wird nicht geprüft");
    expect(text).toContain("0 Satinstriche unter 1.3 mm, 0 Lücken unter 0.8 mm");
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

  it("beschriftet höchstens so viele Befunde, wie gesagt, und sagt es im Kopf", () => {
    const { shapes, result } = szene();
    const svg = feinheitSvg(shapes, result, { name: "probe", beschriftet: 1 });
    expect(svg).toContain("die 1 mit der größten Mindestbreite");
    expect(svg.match(/>L1</g)).toHaveLength(2);
    expect(svg).not.toContain(">S2<");
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
