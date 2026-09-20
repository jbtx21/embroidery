# Umsetzungsstand

Stand: 19.09.2026 (Auto-Satin). Gegenstück zu `Engine-Spezifikation.md` — Kapitel für Kapitel, was
steht und was fehlt. Offene Entscheidungen und Zulieferungen stehen in `backlog.md`.

## Gebaut

| Kap.    | Inhalt                                                                                                                         | Wo                                                     |
| ------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| 2       | Monorepo, pnpm workspaces, TypeScript strict, Vitest, ESLint, Prettier                                                         | Wurzel                                                 |
| 3       | Datenmodell, Stichplan, Kennzahlen, Warnungen                                                                                  | `engine/src/types.ts`                                  |
| 4       | Pipeline validate → expand → order → generate → connect → tie → post → analyze, Objekt-Cache über stabilen Hash                | `engine/src/pipeline.ts`, `hash.ts`                    |
| 4       | SVG-Import: Pfade, Transformationen, Ink/Stitch-Attribute — ohne DOM                                                           | `engine/src/import/`                                   |
| 5       | Flachung, Douglas-Peucker, Resampling mit Eckenerhalt, Offset, Mengenoperationen, Scanline-Schnitt, Bogenlänge, `insideTravel` | `geometry/src/`                                        |
| 5       | `medialAxis`: Delaunay selbst gebaut, Voronoi-Kanten innerhalb der Form, Zweige geschnitten                                    | `geometry/src/delaunay.ts`, `medial-axis.ts`           |
| 6       | Laufstich, Bean Stitch, geschlossene Pfade                                                                                     | `engine/src/running.ts`                                |
| 7.1–7.6 | Satin: Paarung, Sprossen, Zugausgleich, Zickzack, Split, Kurzstiche, Unterlage                                                 | `engine/src/satin.ts`                                  |
| 7.7     | Auto-Satin: Form → Satin-Spalten, Medianbreite entscheidet Satin oder Fill, Reihenfolge entlang des Skeletts                   | `engine/src/auto-satin.ts`                             |
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
- **Skelett Kap. 5** gegen Formen mit bekannter Lösung: Ring 10/6 ergibt einen
  geschlossenen Ast der Länge 2π·8 mit Radius 2,00 überall; die L-Form hat ihren größten
  einbeschriebenen Kreis mit r = 8(2−√2) am einspringenden Eck; die Kreisscheibe bekommt
  gar kein Skelett, weil ihre Mittelachse ein Punkt ist. Die Delaunay-Triangulierung wird
  über ihre definierende Eigenschaft geprüft (kein Punkt im Umkreis eines Dreiecks), nicht
  gegen eine erwartete Ausgabe.
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
- Die Seitenbestimmung der Satin-Unterlage (`outwardSign`) kippte an Endkappen: dort liegt
  der nächste Punkt der Gegen-Rail IN Rail-Richtung statt quer dazu, das Kreuzprodukt ist
  exakt null und sagt nichts. Folge war eine Unterlage 0,4 mm außerhalb der Form, wo sie
  am Rand herausschaut. Jetzt entscheidet die Mehrheit mehrerer Stützstellen, und bei
  durchweg mehrdeutigem Befund der Schwerpunkt der Gegen-Rail. Aufgefallen ist es erst
  durch Auto-Satin, weil dessen Eckäste kurze Rails erzeugen.
- Der Toleranzvergleich der Golden Files scheiterte an der Gleitkomma-Darstellung:
  110/100 − 1 ergibt 0,10000000000000009, 30,3 − 30 ergibt 0,3000000000000007. Ein Motiv
  genau auf der Grenze wäre am Rauschen gescheitert statt an seinen Stichen. Der
  Vergleich rechnet jetzt mit einer Epsilon-Schwelle; die Toleranzen aus §15 bleiben
  unverändert.
- Der Sichtbarkeitsgraph hinter `insideTravel` wurde für jeden einzelnen Reiseweg neu
  gebaut, und jeder Sichtbarkeitstest lief über alle Kanten der Form. Auf den
  Beispielformen der Tests fällt das nicht auf; an einer echten Logokontur mit 2.266
  Kanten und 41 Löchern rechnete ein einziges Fill-Objekt über fünf Minuten ohne
  Ergebnis. Jetzt hält jede Form ihren Graphen, Knoten sind nur die einspringenden Ecken
  (bei dieser Kontur 713 statt 1.127), und ein Kantengitter beantwortet Schnitt- und
  Innen-Fragen lokal. Dasselbe Objekt: 1,1 s. Zahlen in `docs/messung-echte-logos.md`.
- Die Reihenfolge „Mitte → außen" nach reinem Radius zu sortieren, sieht auf dem Papier
  richtig aus und ist in der Praxis schlecht: zwei Objekte auf demselben Kreis liegen im
  Sortierschlüssel nebeneinander, können aber an gegenüberliegenden Rändern des Motivs
  sitzen. Am Eislingen-Logo gemessen 922 Sprünge statt 265. Deshalb arbeitet `autoOrder`
  in Ringen — innen nach außen, innerhalb eines Rings der kürzeste Weg. 334 Sprünge.
- `FILL_TINY` misst die Fläche und übersieht damit genau den Fall, den die Punch-Praxis
  meint: eine Sichel von 114 mm², deren Reihen zu 79 % kürzer als ein Millimeter sind.
  `FILL_TOO_NARROW` misst stattdessen die Reihenstücke, die beim Scanline-Lauf ohnehin
  anfallen.

## Geänderte Erwartungswerte, 19.09.2026 (zweite Welle)

Die Spec-Änderungen zu §6.1, §8.1, §10.1, §11 und §14 verschieben Schwellwerte. Bestehende
Tests wurden **nur** an diesen Stellen angefasst; alles andere ist neu dazugekommen.

| Datei                                  | Erwartung vorher                                        | jetzt                                     | Grund                                                                                                                                                           |
| -------------------------------------- | ------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/engine/src/pipeline.test.ts` | `stats.stitches > 500`                                  | `> 450`                                   | Mindeststichlänge 0,3 → 0,6 mm (§11). Der Reihenwechsel im Tatami ist bei 0,40 mm Reihenabstand genau 0,40 mm lang und fällt jetzt weg. Gemessen 494 statt 512. |
| `packages/engine/src/connect.test.ts`  | `autoOrder(objects)` in den drei Mitte-nach-außen-Tests | `autoOrder(objects, { centreOut: true })` | §10.1 grenzt die Regel auf das Cap-Preset ein. Kein Schwellwert, sondern eine Signatur.                                                                         |

Keine weitere bestehende Erwartung hat sich geändert. Neu hinzugekommen sind 27 Tests:
`offsetDirectional`, `curvatureRadii` und `resampleAdaptive` in
`packages/geometry/src/directional.test.ts`, dazu Schub/Überlappung in `fill.test.ts`,
`EDGE_GAP_RISK` und die Textmindesthöhe in `pipeline.test.ts`, die Mindeststichlänge und
die krümmungsadaptive Schrittweite in `running.test.ts`, Jersey, `densityFactor`,
`presetForMachine` und `textMinFactor` in `connect.test.ts`.

## Beim Bauen gefunden (zweite Welle)

- Der Boden von 0,8 mm für die adaptive Stichlänge (§6.1) galt zuerst für die **Bogenlänge**
  — gemessen wird aber die **Sehne**, und die ist auf enger Kurve deutlich kürzer: auf einem
  Kreis mit 0,5 mm Radius wird aus 0,8 mm Bogen eine Sehne von 0,72 mm. Ein Stich IST die
  Sehne. Die Schrittweite wächst jetzt so lange, bis die Sehne den Boden erreicht.
- Ein anisotroper Offset ist ein Kreis-Offset in einem gestauchten Koordinatensystem. Für
  eine Richtung allein wäre die Gegenachse null, was die Stauchung nicht ausdrücken kann;
  deshalb K = 40 statt unendlich. Der Rest von 5 µm liegt zwanzigfach unter dem, was DST
  überhaupt speichern kann.
- Die Mindeststichlänge von 0,6 mm senkt nebenbei die **Dichte**: Köln fällt von 19 auf 14
  Stiche/mm², Eislingen von 21 auf 15. Beide melden `DENSITY_HIGH` damit nur noch als
  Warnung statt als Fehler. Die entfernten Stiche waren Nadeleinstiche ohne Deckung.

## Geänderte Erwartungswerte, 21.09.2026 (vierte Welle)

| Datei                                    | Erwartung vorher                                    | jetzt                                             | Grund                                                                                                      |
| ---------------------------------------- | --------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `packages/engine/src/connect.test.ts`    | `DENSITY_ERROR_PEAK` 30, `DENSITY_ERROR_SHARE` 0,01 | 40 und 0,02                                       | §11 neu geschnitten: ein Fehler ist, was flächig ist oder wirklich hart. 1 % bleibt jetzt eine Warnung.    |
| `packages/engine/src/connect.test.ts`    | eine Zelle über 30 ist ein Fehler                   | 41 ist ein Fehler, 35 eine Warnung                | dasselbe.                                                                                                  |
| `packages/engine/src/import/svg.test.ts` | Flächen unter 1 mm² werden Objekte                  | verworfen, `IMPORT_DROPPED_TINY` nennt die Anzahl | §5.1. Eislingen: 52 Splitter aus der Vektorisierung.                                                       |
| `packages/engine/src/fonts-all.test.ts`  | `TEXT_TOO_LARGE` als `warn`                         | `TEXT_ABOVE_FONT_MAX` als `info`                  | §9.4: eine Satinschrift hochzuskalieren macht die Spalten breiter, nicht dünner. Nach unten bleibt `warn`. |

Die Erwartungen in `auto-satin.test.ts` sind nicht verschoben, sondern neu: der Umbau von
§7.7.1 prüft jetzt an den Buchstaben S, T und R, dass beide Rails zusammen die Kontur nicht
überschreiten.

## Beim Bauen gefunden (vierte Welle)

- **`pnpm lint` war seit der dritten Welle rot**, und mir ist es durchgegangen, weil ich
  Prettier nur auf die geänderten Dateien laufen ließ. Die Schrift-JSONs kommen unverändert
  aus dem Ink/Stitch-Repo; genau so gehören sie dorthin, als Beleg, was importiert wurde.
  Sie stehen deshalb jetzt in `.prettierignore`, die eigene `README.md` daneben nicht.
- **`documentHeight` las das `height`-Attribut.** `medium_font` hat dort 23,8125 mm bei
  `viewBox="0 0 90 90"` — die Grundlinie saß 47 Einheiten daneben. Jetzt führt die viewBox.
- **Die Mittelachse eines Rechtecks hat fünf Äste**, die eines T neun: ein Sporn in jede
  Ecke. Jeder schnitt sich eigene Rails aus derselben Kontur. Ein Ast, kürzer als das
  1,5-fache seiner größten Weite, ist seitdem eine Ecke und keine Spalte.

## Geänderte Erwartungswerte, 21.09.2026 (Reisewege-Fix)

Kein Schwellwert verschoben. Drei bestehende Tests mussten an eine geänderte **Signatur**
angepasst werden: `fillRegion` und `contourUnderlay` geben jetzt `{ points, jumpAt }` statt
einer Punktliste zurück, weil ein Fill sagen können muss, welche Stelle er springt statt
sie zu sticken (§8.7.1).

| Datei                                    | vorher                       | jetzt                       |
| ---------------------------------------- | ---------------------------- | --------------------------- |
| `packages/engine/src/fill.test.ts` (3 ×) | `fillRegion(...)[0]`         | `fillRegion(...).points[0]` |
| `packages/engine/src/pipeline.ts`        | `StitchCache` hält `Point[]` | hält `{ points, jumpAt }`   |

Neu dazugekommen sind 7 Tests: `travelStitches` (Sprung und Nicht-Sprung), drei Fälle für
„kein Laufstich verlässt die Form" (Ring, Sanduhr mit zerfallender Unterlage, Sanduhr, die
der Schub zerteilt) und zwei in `geometry.test.ts` für den Weg um ein rundes Loch.

## Beim Bauen gefunden (Reisewege-Fix)

- **Der Sichtbarkeitsgraph fand um ein rundes Loch keinen Weg.** Seine Knoten saßen auf der
  Kontur, und zwei benachbarte Reflexecken sehen sich dort nur entlang der Grenze — eine
  Strecke genau auf der Grenze zählt weder als innen noch als außen, die Kante fiel weg. Bei
  einem runden Loch ist jede Ecke reflex, also blieb kein einziger Weg übrig. Das war die
  Ursache hinter den geraden Strecken außerhalb der Form, nicht der Fill.
- **Der Weg als Stichfolge ist nicht der Weg als Linie.** Erst habe ich jeden Knick zum
  Stich gemacht — auf einer Kontur mit einem Knick je 0,1 mm perforiert das den Stoff. Nur
  nach Länge abzutasten schneidet dagegen Ecken ab. Beides zusammen: so weit greifen, wie
  ein Stich reicht und die Sehne innen bleibt.
- **Die Reihenfolge der Teilstücke kam aus dem Verschneiden.** `offset` gibt die Stücke in
  seiner eigenen Ordnung zurück; der Fill lief sie der Reihe nach ab und querte die Form für
  jedes erneut. Gemessen: 33 Stiche aus einer Füllfläche in einem Quadratmillimeter.
