/**
 * Die Textur-Bereinigung in der Ausgabe (docs/Engine-Spezifikation.md §5.3, tools/textur.mjs): was der
 * Nutzer unter „Textur“ liest, und dass das Tor und der Lauf die Formen in jeder Größe gleich sehen.
 * Gerechnet wird in packages/engine/src/import/texture.ts und dort geprüft. Eigene Formen, keine
 * Kundenlogos.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { importShapes, initEngine } from "@texma-stitch/engine";
import { scaledAt, svgOf } from "../packages/engine/test/fixtures/gate.js";
import { areaShape } from "../packages/engine/test/fixtures/shapes.js";
import { BLACK, counterBlock, splinterScene } from "../packages/engine/test/fixtures/texture.js";
import { scaleSvgToWidth } from "../tools/breite.mjs";
import { texturZeilen } from "../tools/textur.mjs";
import { formenBei, sucheTor } from "../tools/tor.mjs";

beforeAll(async () => {
  await initEngine();
});

const scene = splinterScene();
const text = svgOf(scene, 40, 20);

describe("texturZeilen (die Zeilen unter „Textur“)", () => {
  it("schweigt, wo es keinen Bericht gibt: die Bereinigung war aus", () => {
    expect(texturZeilen(importShapes(text, { texture: false }).texture)).toEqual([]);
    expect(texturZeilen(undefined)).toEqual([]);
  });

  it("sagt, dass nichts zu bereinigen war — damit die Prüfung in der Ausgabe zu sehen ist", () => {
    const sauber = importShapes(svgOf([areaShape("sauber", counterBlock(), BLACK)], 40, 20));
    expect(texturZeilen(sauber.texture, { bestelltMm: 40 })).toEqual([
      "Textur (Spec §5.3)",
      "  keine Textur gefunden, nichts bereinigt",
    ]);
  });

  it("nennt die Formen mit Textur, die Löcher, die Teile und die Splitter mit Zahlen", () => {
    const zeilen = texturZeilen(importShapes(text).texture, { bestelltMm: 40 });
    expect(zeilen[0]).toBe("Textur (Spec §5.3)");
    expect(zeilen).toContain(
      "  1 Form mit Textur (mindestens 3 Löcher von 0.001 bis unter 0.05 mm², je 100 bis 100): bar",
    );
    expect(zeilen).toContain("  101 Löcher unter 0.5 mm² in ihnen gefüllt (zusammen 2.3 mm²)");
    expect(zeilen).toContain(
      "  2 Teile unter 0.05 mm² verworfen (zusammen 0.05 mm², das größte 0.04 mm²)",
    );
    expect(zeilen).toContain(
      "  2 Splitter (bis 4 mm², Abstand bis 0.4 mm) in ihre Form geschlossen (zusammen 1.16 mm²): 2× in bar",
    );
  });

  it("nennt die bestellte und die gelesene Größe, wo sie sich unterscheiden, und die Schwellen dort", () => {
    // 120 mm gelesen, in 40 mm bestellt: die Schwellen gelten dreifach (Längen) und neunfach (Flächen)
    const gross = svgOf(scaledAt(scene, 40)(120), 120, 60);
    const bericht = importShapes(gross, { orderedWidthMm: 40 }).texture;
    const zeilen = texturZeilen(bericht, { bestelltMm: 40 });
    expect(zeilen[0]).toBe("Textur (Spec §5.3) in 120 mm, bestellt 40 mm (Faktor 3.00)");
    expect(zeilen.join("\n")).toContain("unter 0.45 mm²");
    expect(zeilen.join("\n")).toContain("Abstand bis 1.2 mm");
  });

  it("kürzt eine lange Liste von Kennungen und sagt, wie viele weitere es gibt", () => {
    const bericht = {
      scale: 1,
      limits: {
        evidenceMinMm2: 0.001,
        evidenceMaxMm2: 0.05,
        holeMaxMm2: 0.5,
        speckMm2: 0.05,
        splinterMaxMm2: 4,
        reachMm: 0.4,
      },
      textured: Array.from({ length: 8 }, (_, i) => ({ id: `z${i}`, grains: 10 + i })),
      holes: { filled: 80, areaMm2: 1.5 },
      specks: { dropped: 0, areaMm2: 0, largestMm2: 0, ids: [] },
      splinters: { merged: 0, areaMm2: 0, into: [] },
    };
    const zeile = texturZeilen(bericht, { bestelltMm: 80 })[1]!;
    expect(zeile).toContain("8 Formen mit Textur");
    expect(zeile).toContain("je 10 bis 17");
    expect(zeile).toContain("z0, z1, z2, z3, z4 … und 3 weitere");
  });
});

describe("das Tor und der Lauf sehen dieselben Formen (Spec §5.3: die bestellte Größe legt die Schwellen fest)", () => {
  // Erst nach `initEngine`: eine Datei mit Textur braucht die Geometrie schon beim Einlesen.
  let original!: ReturnType<typeof importShapes>;
  beforeAll(() => {
    original = importShapes(text);
  });

  it("liest die Datei in einer anderen Größe mit den Schwellen der bestellten: dieselben Entscheidungen", () => {
    const formen = formenBei(text, original, 40);
    const bei120 = formen(120);
    expect(bei120.map((s) => s.id)).toEqual(original.shapes.map((s) => s.id));
    // dieselben Formen, wie der Lauf sie liest: Datei neu geschrieben auf 120 mm, Schwellen der bestellten 40 mm
    expect(bei120).toEqual(
      importShapes(scaleSvgToWidth(text, 120, original).text, { orderedWidthMm: 40 }).shapes,
    );
    expect(formen.textur(120)?.scale).toBeCloseTo(3, 9);
    expect(formen.textur(120)?.holes.filled).toBe(original.texture?.holes.filled);
    // die Körner der Kreide sind in 120 mm 0.18 mm² groß: mit den Schwellen der Datei selbst wären es keine mehr
    const allein = importShapes(scaleSvgToWidth(text, 120, original).text);
    expect(allein.texture?.textured).toEqual([]);
    expect(allein.shapes).toHaveLength(scene.length);
  });

  it("liest die bestellte Größe selbst so, wie der Lauf sie liest, auch wenn sie nicht die der Datei ist", () => {
    // --breite 60 auf einer 40-mm-Datei: bestellt sind 60 mm, die Schwellen gelten dort ohne Faktor
    const formen = formenBei(text, original, 60);
    const lauf = importShapes(scaleSvgToWidth(text, 60, original).text, { orderedWidthMm: 60 });
    expect(formen(60).map((s) => s.id)).toEqual(lauf.shapes.map((s) => s.id));
    expect(formen.textur(60)?.scale).toBe(1);
    expect(formen.textur(90)).toBeUndefined(); // eine Größe, die niemand gelesen hat, hat keinen Bericht
    expect(formen(90).length).toBe(formen(60).length);
  });

  it("gibt in der Größe der Datei die eingelesenen Formen selbst zurück, wo sie auch die bestellte ist", () => {
    const formen = formenBei(text, original, 40);
    expect(formen(40)).toBe(original.shapes);
    expect(formen.textur(40)).toBe(original.texture);
  });

  it("sucheTor liest über dieselbe Funktion: die Formen des Tors tragen die bestellte Größe", () => {
    const tor = sucheTor(text, original, { bestelltMm: 40 });
    expect(tor.formen(40)).toBe(original.shapes);
    expect(tor.formen.textur(40)).toBe(original.texture);
  });
});
