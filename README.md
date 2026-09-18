# TEXMA Stitch

Engine, die **Stickobjekte** (Pfade + Parameter) deterministisch in **Stiche** umwandelt.
Gespeichert werden nur Objekte, nie Stiche — jede Änderung rechnet die betroffenen
Objekte neu.

Verbindliche Quelle: [`docs/engine-spezifikation.md`](docs/engine-spezifikation.md).
Was davon steht und was noch fehlt: [`docs/umsetzungsstand.md`](docs/umsetzungsstand.md).

## Grundsätze

- Reines TypeScript, keine DOM-Abhängigkeit. Läuft im Web Worker und in Node.
- Interne Einheit **Millimeter**, Fließkomma. Erst der Export rundet auf 0,1 mm.
- Koordinaten wie SVG: Ursprung oben links, **y nach unten**.
- **Deterministisch**: gleiche Eingabe → byte-identische Ausgabe. Kein Zufall.

## Pakete

| Paket | Inhalt |
|---|---|
| `packages/geometry` | Pfade, Polygone, Offset, Schnitt, Vereinfachung, Reisewege (Clipper2 WASM) |
| `packages/engine` | Stichgenerierung: running, satin, fill, text, order, connect, validate |
| `packages/formats` | DST-Writer und -Reader, neutrales JSON |
| `packages/render` | Canvas-2D-Renderer für Stiche (Fadenoptik, Sprünge, Punkte) + SVG-Vorschau |

Einzige Fremdabhängigkeit der Engine: `clipper2-wasm`.

## Loslegen

```bash
pnpm install
pnpm build       # Pakete in Abhängigkeitsreihenfolge
pnpm typecheck
pnpm test
pnpm vorschau    # Probemotiv als SVG ansehen, ohne Editor
```

Für die Kreuzprüfung aus Kap. 13.2 zusätzlich:

```bash
pip install pyembroidery
```

Fehlt pyembroidery, überspringt die Testsuite diesen Block mit einer Warnung —
**in der CI ist das ein Fehler**, dort ist es installiert.

## Benutzung

```ts
import { initEngine, planDesign } from "@texma-stitch/engine";
import { writeDst } from "@texma-stitch/formats";

await initEngine();                 // lädt Clipper2 (WASM), einmalig
const plan = planDesign(design);    // ab hier alles synchron
const dst = writeDst(plan, { label: "Kundenlogo" });
```

`planDesign` liefert neben den Stichblöcken die Kennzahlen (Stiche, Sprünge,
Trims, Farbwechsel, Laufzeit, Dichte) und die Warnungen — zu schmale Satin-Spalten,
zu hohe Dichte, lange Sprünge, Motiv größer als der Rahmen.

## Anzeigen

```ts
import { fitView, planBbox, renderPlan } from "@texma-stitch/render";

renderPlan(ctx, plan, {
  view: fitView(planBbox(plan), canvas.width, canvas.height),
  threads: design.threads,
  mode: "faden",       // "faden" | "linien" | "punkte"
  bisStich: n,         // Sequenz-Regler
});
```

## Ohne Editor nachsehen

`pnpm vorschau [ziel.svg]` plant ein Probemotiv, schreibt die SVG-Vorschau und gibt die
Kennzahlen aus. Das ist der Weg, eine Änderung an der Engine anzusehen, solange es
`apps/editor` noch nicht gibt.
