# Umsetzungsstand

Stand: 19.09.2026. Gegenstück zu `Engine-Spezifikation.md` — Kapitel für Kapitel, was
steht und was fehlt. Offene Entscheidungen und Zulieferungen stehen in `backlog.md`.

## Gebaut

| Kap.    | Inhalt                                                                                                                         | Wo                                                     |
| ------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| 2       | Monorepo, pnpm workspaces, TypeScript strict, Vitest, ESLint, Prettier                                                         | Wurzel                                                 |
| 3       | Datenmodell, Stichplan, Kennzahlen, Warnungen                                                                                  | `engine/src/types.ts`                                  |
| 4       | Pipeline validate → expand → order → generate → connect → tie → post → analyze, Objekt-Cache über stabilen Hash                | `engine/src/pipeline.ts`, `hash.ts`                    |
| 4       | SVG-Import: Pfade, Transformationen, Ink/Stitch-Attribute — ohne DOM                                                           | `engine/src/import/`                                   |
| 5       | Flachung, Douglas-Peucker, Resampling mit Eckenerhalt, Offset, Mengenoperationen, Scanline-Schnitt, Bogenlänge, `insideTravel` | `geometry/src/`                                        |
| 6       | Laufstich, Bean Stitch, geschlossene Pfade                                                                                     | `engine/src/running.ts`                                |
| 7.1–7.6 | Satin: Paarung, Sprossen, Zugausgleich, Zickzack, Split, Kurzstiche, Unterlage                                                 | `engine/src/satin.ts`                                  |
| 8       | Fill: Scanlines, Sektionsgraph, Serpentine auf festem Raster, Reisewege innerhalb der Form, Unterlage contour/single/double    | `engine/src/fill.ts`                                   |
| 9       | Textsatz auf Grundlinie und Pfad, Kerning, Mindesthöhe — gegen das Schriftformat                                               | `engine/src/expand.ts`, `fonts/src/types.ts`           |
| 10      | Reihenfolge-Vorschlag, Verbindungsregeln, Verriegelung                                                                         | `engine/src/order.ts`, `connect.ts`, `tie.ts`          |
| 11      | Ministiche entfernen, lange Bewegungen teilen, Kennzahlen, Dichte, Warnungen                                                   | `engine/src/post.ts`, `analyze.ts`                     |
| 12      | Canvas-2D-Renderer, Modi Faden/Linien/Punkte, Sequenz-Regler, Batching je Farbe; dazu SVG- und PNG-Ausgabe                     | `render/src/`                                          |
| 13.1    | DST-Writer und -Reader                                                                                                         | `formats/src/dst/`                                     |
| 13.2    | Neutrales JSON, stabil serialisiert                                                                                            | `formats/src/json.ts`                                  |
| 14      | Presets Piqué/Softshell/Fleece/Cap/Frottee, Maschinenprofile                                                                   | `engine/src/presets.ts`                                |
| 15      | Unit-Tests, DST-Roundtrip, pyembroidery-Kreuzprüfung, Rundungsdrift, Benchmarks, Golden-File-Rahmen                            | `**/*.test.ts`, `engine/bench/`, `test/golden.test.ts` |
| 16      | `pnpm demo <svg> [preset]` → `out/<name>.{dst,png,json}`                                                                       | `tools/demo.mjs`                                       |

## Fehlt

| Kap.   | Was                                   | Warum                                                               |
| ------ | ------------------------------------- | ------------------------------------------------------------------- |
| 5, 7.7 | `medialAxis`, Auto-Satin              | Stub mit TODO; die Spec setzt es selbst auf Woche 4                 |
| 9      | Ink/Stitch-Konverter und Schriftdaten | keine Fontdatei im Repo; ohne eine echte wäre der Konverter geraten |
| 13.2   | PES, JEF, VP3, EXP                    | laufen über `apps/api`                                              |
| 13.3   | Stichbericht als PDF                  | von der Spec auf „später" gesetzt                                   |
| 2      | `apps/editor`, `apps/api`             | noch nicht begonnen                                                 |
| 15     | Golden Files aus Phase 0              | Dateien liegen nicht vor; der Test meldet das laut und läuft nicht  |

## Was die Tests wirklich prüfen

- **Kreuzprüfung Kap. 13.2** ist echt: dieselbe Stichliste geht durch unseren Writer und
  durch pyembroidery, verglichen wird Byte für Byte, Header inklusive. Vier Fälle, darunter
  ein voller Stichplan und krumme Koordinaten auf halben Einheiten.
- **Datensatz-Kodierung** gegen eine Tabelle bekannter Bytewerte, von Hand aus der
  Tajima-Bitbelegung abgeleitet — nicht aus dem eigenen Encoder erzeugt.
- **Rundungsdrift**: 1000 Stiche zu 0,15 mm weichen am Ende höchstens 0,1 mm ab.
- **DST-Roundtrip**: schreiben → lesen → schreiben, byte-identisch. Der Reader sammelt das
  Trim-Signal (drei Sprünge mit Summe null) wieder ein, sonst stimmte die Datensatzzahl im
  Header nicht.
- **Golden Files Kap. 15** laufen erst, wenn `test-data/phase0/` gefüllt ist. Fehlen die
  Dateien, sagt die Suite das laut und prüft nichts — statt ein schwächeres Kriterium
  anzulegen. Damit ein leerer Ordner keinen zahnlosen Rahmen verdeckt, ist die
  Vergleichslogik selbst getestet: sie weist eine Stichzahl über ±10 %, eine Box über
  ±0,3 mm und eine leere Referenz zurück. Bei vorhandenen Motiven druckt der Lauf je
  Motiv die Zeile, die `docs/abweichungen.md` braucht — auch wenn er grün ist.
- **Benchmarks Kap. 15** (`pnpm bench`): ein Fill-Objekt und ein Satin-Objekt je unter
  100 ms, voller Lauf unter 300 ms. Gemessen wird der Median aus mehreren Läufen.
- **Benchmark Kap. 12** misst nur unseren Anteil (Zerlegung und Zeichenaufrufe) gegen eine
  Attrappe, nicht echtes Canvas. Die 16-ms-Zusage gehört im Editor gemessen.

## Beim Bauen gefunden

- Der Weg vom Maschinen-Nullpunkt zum ersten Stich ist selbst ein Delta und sprengte das
  121-Einheiten-Limit. Jetzt zentriert der Writer und fährt den Weg als Sprungfolge.
- Python rundet die Hälfte zur geraden Zahl. Bei Reihenabstand 0,25 mm liegt jede zweite
  Koordinate genau auf der halben DST-Einheit — ohne gleiches Rundungsverhalten ist die
  Kreuzprüfung nicht erfüllbar.
- Im SVG-Scanner verschluckte die gierige Attributgruppe den Schrägstrich von `<path …/>`.
  Folge: alles nach `</g>` behielt die Gruppen-Transformation. Fiel im Demo-Lauf auf, weil
  ein 60 × 45 mm großes Dokument als 70 × 58 mm herauskam.
- Der Toleranzvergleich der Golden Files scheiterte an der Gleitkomma-Darstellung:
  110/100 − 1 ergibt 0,10000000000000009, 30,3 − 30 ergibt 0,3000000000000007. Ein Motiv
  genau auf der Grenze wäre am Rauschen gescheitert statt an seinen Stichen. Der
  Vergleich rechnet jetzt mit einer Epsilon-Schwelle; die Toleranzen aus §15 bleiben
  unverändert.
