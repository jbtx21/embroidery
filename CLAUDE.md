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
- **Stiche erzeugt Ink/Stitch** (seit 28.09.2026, `docs/adr/0001-inkstitch-als-stich-engine.md`): eigener Python-Prozess in fester Version (offizielle 3.3.0 seit 30.09.2026, dieselbe wie am Arbeitsplatz), außerhalb des Repos. Dieses Repo bereitet die Vorlage vor und prüft das Ergebnis; die eigene Stichgenerierung ist eingefroren. Unter der Mindestgröße wird nicht gestickt, sondern in der Mindestgröße (Spec §5.2, Tor); jeder Lauf schreibt eine Nacharbeit-Datei für Inkscape mit Ink/Stitch (Spec §13.4).

## Struktur

```
packages/geometry   Pfade, Polygone, Offset, Schnitt, Vereinfachung
packages/engine     running, satin, fill, text, order, connect, tie, post, analyze
packages/formats    DST-Writer/Reader, neutrales StitchPlan-JSON
packages/fonts      Stickschriften als JSON, Konverter aus Ink/Stitch-SVG
packages/render     Canvas-2D-Renderer
inkstitch/          Starter, wx-Platzhalter, Einrichtung für Ink/Stitch (GPL-3.0, nicht im Repo)
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

- Ein Modul pro Session, in der Reihenfolge der Meilensteine aus Spec §16 (seit 28.09.2026: Phase 1b).
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
pnpm inkstitch <svg> [preset] [--tatami]   SVG → Vorlage (Satin/Laufstich/Tatami) → Ink/Stitch → DST + PNG + Kennzahlen nach ./out/; --tatami: reiner Tatami-Lauf
bash inkstitch/setup.sh         Ink/Stitch einrichten (läuft auch als SessionStart-Hook)
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

## Arbeitsweise: Delegation und Modellwahl

Gilt zusätzlich zu allem oben. Bei Widerspruch gehen die Projektregeln oben vor.

### Grundregel

Umfangreiche Umsetzungsarbeit nicht selbst erledigen, wenn sie sich sinnvoll delegieren lässt.
Sub-Agenten für:

- unabhängige Arbeitsstränge
- parallelisierbare Recherche oder Umsetzung
- Erkundung des Repos über mehrere Bereiche
- abgegrenzte Aufgaben, die nicht den ganzen Gesprächskontext brauchen
- Aufgaben, bei denen Delegation den Kontext des Hauptagenten entlastet

Triviale Aufgaben, Einzeldatei-Edits, einfache Nachschlagungen und Arbeit, die stark am
aktuellen Kontext hängt, direkt erledigen statt einen Sub-Agenten zu starten.

### Modellwahl

Nicht standardmäßig das teuerste oder stärkste Modell nehmen, sondern das günstigste, das die
Aufgabe zuverlässig schafft:

- **Haiku / leichtes Modell:** einfache Suchen, Dateien finden, Formatieren, Zusammenfassungen,
  repetitive Edits, einfache Umformungen, Basischecks
- **Sonnet / Mittelklasse:** normale Programmieraufgaben, Debugging, Umsetzung, Refactoring,
  Repo-Analyse, die meiste Sub-Agenten-Arbeit
- **Opus / stärkstes Modell:** komplexe Architektur, schwieriges Debugging, mehrdeutige
  mehrstufige Abwägungen, folgenreiche Entscheidungen, oder wenn schwächere Modelle schon
  gescheitert sind

Beim Anlegen eines Sub-Agenten das Modell ausdrücklich wählen, wo das möglich ist. Für
Sub-Agenten die günstigeren Modelle bevorzugen, außer die Aufgabe verlangt klar mehr.

### Vorgehen beim Delegieren

Vor einer größeren Aufgabe:

1. In unabhängige Arbeitsstränge zerlegen.
2. Entscheiden, welche davon delegiert werden.
3. Jedem Strang das günstigste Modell geben, das ihn gut erledigt.
4. Unabhängige Sub-Agenten parallel laufen lassen.
5. Der Hauptagent bleibt bei Steuerung, Zusammenführung, Prüfung und Integration.

Keine unnötigen Agenten: Delegation soll Kosten, Kontext oder Laufzeit sparen — nicht
zusätzlichen Aufwand erzeugen.

### Eskalation

Mit dem niedrigsten sinnvollen Modell beginnen. Auf ein stärkeres wechseln nur, wenn

- die Aufgabe tieferes Abwägen braucht,
- das Ergebnis unvollständig oder unzuverlässig ist,
- der Sub-Agent Unsicherheit meldet,
- mehrere Versuche gescheitert sind,
- Architektur- oder systemübergreifendes Urteil nötig ist.

Opus nicht nehmen, nur weil es verfügbar ist.

### Abschlussprüfung

Der Hauptagent bleibt verantwortlich dafür, gelieferte Ergebnisse zu prüfen, die Konsistenz zu
sichern, offensichtliche Fehler zu finden, die Änderungen zu integrieren und sicherzustellen,
dass das Endergebnis die ursprüngliche Anfrage erfüllt.

Reihenfolge der Ziele:

1. Korrektheit
2. wenig unnötiger Token- und Kontextverbrauch
3. niedrige Modellkosten
4. schnelle Ausführung
