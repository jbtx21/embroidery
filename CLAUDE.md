# CLAUDE.md — texma-stitch

Internes TEXMA-Tool: Logo → bearbeitbares Stickobjekt-Design → DST/PES. Dieses Repo enthält die Stich-Engine, Formate, Fonts, Renderer und später den Editor.

**Die Spezifikation in `docs/Engine-Spezifikation.md` ist die Wahrheit.** Bei Widerspruch zwischen Code, Tests und Spec gilt die Spec. Änderungen an der Spec nur nach Rückfrage.

## Sprache

Kommunikation und Commit-Messages auf Deutsch. Code, Bezeichner, Kommentare im Code auf Englisch.

## Stack

- pnpm workspaces, TypeScript `strict`, ESM, Node 20+
- Tests: Vitest. Lint: ESLint + Prettier (Standardkonfig)
- Polygon-Ops: `clipper2-wasm`. Keine weiteren Abhängigkeiten in `packages/engine` ohne Rückfrage.
- Editor später: React + Canvas. Backend später: Python FastAPI + pyembroidery.

## Struktur

```
packages/geometry   Pfade, Polygone, Offset, Schnitt, Vereinfachung
packages/engine     running, satin, fill, text, order, connect, tie, post, analyze
packages/formats    DST-Writer/Reader, neutrales StitchPlan-JSON
packages/fonts      Stickschriften als JSON, Konverter aus Ink/Stitch-SVG
packages/render     Canvas-2D-Renderer
apps/editor         später
apps/api            später
test-data/phase0    Golden Files aus Phase 0 (Ink/Stitch SVG + DST)
docs/               Spec und Entscheidungen
```

## Feste Regeln

1. **Einheit ist Millimeter**, Fließkomma. Gerundet wird nur im Format-Writer (0,1 mm für DST).
2. **Koordinaten wie SVG**: Ursprung oben links, y nach unten.
3. **Deterministisch**: kein `Math.random`, keine Zeitabhängigkeit, keine Map-Iteration mit undefinierter Reihenfolge in Ausgaben.
4. **Engine ohne DOM**: `packages/geometry`, `engine`, `formats`, `fonts` importieren nichts aus `window`/`document`. Muss in Node und im Web Worker laufen.
5. **Stiche werden nie gespeichert**, nur Objekte. `StitchPlan` ist immer ein Rechenergebnis.
6. **Typen aus der Spec** (`Design`, `StitchObject`, `Stitch`, `StitchPlan`, `Warning`) liegen in `packages/engine/src/types.ts` und werden nicht umbenannt.
7. **Jede exportierte Funktion hat einen Test.** Tests zuerst schreiben, dann implementieren.
8. **Keine stillen Reparaturen**: Ungültige Geometrie führt zu einer `Warning` mit `severity: 'error'`, nicht zu einem geratenen Ergebnis.
9. Performance-Budget: ein Objekt mit 10.000 Stichen neu rechnen < 100 ms, kompletter Lauf < 300 ms. Vor Optimierung messen.

## Arbeitsweise

- Ein Modul pro Session, in der Reihenfolge der Meilensteine aus Spec §16.
- Vor dem Coden: betroffenen Spec-Abschnitt lesen und in 3–5 Sätzen zusammenfassen, was gebaut wird. Bei Unklarheit fragen, nicht raten.
- Nach jedem Schritt: `pnpm test` und `pnpm typecheck` grün, sonst nicht weitermachen.
- Kleine Commits, Message-Form: `engine: fill sections and travel`, `formats: dst writer header`.
- Keine Features außerhalb des aktuellen Meilensteins, auch wenn sie naheliegen. Stattdessen als TODO in `docs/backlog.md` notieren.
- Golden-File-Tests dürfen nicht „angepasst“ werden, damit sie grün werden. Abweichung > Toleranz = Bug oder Spec-Frage.

## Testdaten

`test-data/phase0/` enthält SVGs mit Ink/Stitch-Parametern und die daraus erzeugten DSTs. Toleranzen aus Spec §15: Stichzahl ±10 %, Bounding Box ±0,3 mm.

Einfache Formen für Unit-Tests liegen in `packages/engine/test/fixtures/`: Rechteck, Kreis, Ring, Bogen, S-Kurve. Neue Fixtures dort ablegen, nicht inline in Tests.

## Befehle

```
pnpm install
pnpm test            alle Tests
pnpm test:watch
pnpm typecheck
pnpm bench           Benchmarks (packages/engine/bench)
pnpm demo <svg>      SVG → DST + PNG-Vorschau nach ./out/ (ab Woche 1)
```

## Domänenbegriffe

| Begriff                          | Bedeutung                                             |
| -------------------------------- | ----------------------------------------------------- |
| Running / Laufstich              | Einfache Stichlinie entlang eines Pfads               |
| Satin / Plattstich               | Zickzack zwischen zwei Rails                          |
| Fill / Füllstich                 | Fläche in Reihen                                      |
| Rails                            | Die beiden Kanten eines Satin-Objekts                 |
| Rungs / Sprossen                 | Verbindungslinien zwischen Rails, steuern die Paarung |
| Underlay / Unterlage             | Stabilisierende Stiche unter dem Deckstich            |
| Pull Compensation / Zugausgleich | Verbreiterung gegen Fadenzug                          |
| Trim                             | Fadenschnitt                                          |
| Jump / Sprung                    | Bewegung ohne Stich                                   |
| Tie / Verriegelung               | Kurze Stiche gegen Auftrennen                         |
