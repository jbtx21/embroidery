# TEXMA Stitch

Internes TEXMA-Werkzeug: Logo → bearbeitbares Stickobjekt-Design → DST/PES. Dieses Repo
enthält die Stich-Engine, die Formate, die Schriften, den Renderer und später den Editor.

**Die Spezifikation in [`docs/Engine-Spezifikation.md`](docs/Engine-Spezifikation.md) ist
die Wahrheit.** Was davon steht: [`docs/umsetzungsstand.md`](docs/umsetzungsstand.md).
Was auffiel, aber warten muss: [`docs/backlog.md`](docs/backlog.md).

## Grundsätze

- Reines TypeScript, keine DOM-Abhängigkeit in `geometry`, `engine`, `formats`, `fonts`.
  Läuft in Node und im Web Worker.
- Interne Einheit **Millimeter**, Fließkomma. Gerundet wird nur im Format-Writer (0,1 mm).
- Koordinaten wie SVG: Ursprung oben links, **y nach unten**.
- **Deterministisch**: kein Zufall, keine Zeitabhängigkeit, gleiche Eingabe → gleiche Bytes.
- **Keine stillen Reparaturen**: ungültige Geometrie wird gemeldet, nicht geraten.

## Struktur

```
packages/geometry   Pfade, Polygone, Offset, Schnitt, Vereinfachung, Reisewege
packages/engine     running, satin, fill, text, order, connect, tie, post, analyze
packages/formats    DST-Writer/Reader, neutrales StitchPlan-JSON
packages/fonts      Stickschriften als JSON, Konverter aus Ink/Stitch-SVG
packages/render     Canvas-2D-Renderer, SVG- und PNG-Ausgabe
test-data/phase0    Golden Files aus Phase 0 (Ink/Stitch SVG + DST)
docs/               Spec und Entscheidungen
```

Einzige Fremdabhängigkeit der Engine: `clipper2-wasm`.

## Befehle

```bash
pnpm install
pnpm test                      # alle Tests
pnpm test:watch
pnpm typecheck
pnpm lint                      # ESLint + Prettier
pnpm bench                     # Benchmarks (packages/engine/bench)
pnpm demo <svg> [preset]       # SVG → out/<name>.{dst,png,json}
```

Für die Kreuzprüfung aus Kap. 13.2 zusätzlich `pip install pyembroidery`. Fehlt das Paket,
überspringt die Suite diesen Block mit einer Warnung — **in der CI ist das ein Fehler**.

## Benutzung

```ts
import { initEngine, planDesign } from "@texma-stitch/engine";
import { writeDst } from "@texma-stitch/formats";

await initEngine(); // lädt Clipper2 (WASM), einmalig
const plan = planDesign(design); // ab hier alles synchron
const dst = writeDst(plan, { label: "Kundenlogo" });
```

`planDesign` liefert neben den Stichblöcken die Kennzahlen (Stiche, Sprünge, Trims,
Farbwechsel, Laufzeit, Dichte) und die Warnungen — zu schmale Satin-Spalten, zu hohe
Dichte, lange Sprünge, Motiv größer als der Rahmen.

## Anzeigen

```ts
import { fitView, planBbox, renderPlan } from "@texma-stitch/render";

renderPlan(ctx, plan, {
  view: fitView(planBbox(plan), canvas.width, canvas.height),
  threads: design.threads,
  mode: "thread", // "thread" | "lines" | "points"
  upToStitch: n, // Sequenz-Regler
});
```

Ohne Browser: `renderPlanSvg(plan)` für SVG, `renderPlanPng(plan)` für PNG in Node.
Beide benutzen dieselbe Zerlegung wie der Canvas-Renderer, zeigen also dasselbe.
