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
| 1, 16   | Ink/Stitch als Stich-Engine: Starter, Einrichtung, `pnpm inkstitch <svg> [preset]` → `out/<name>.{dst,png}` + Kennzahlen       | `inkstitch/`, `tools/inkstitch.mjs`                    |

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

## Geänderte Erwartungswerte, 21.09.2026 (Reisestichlänge und Trim-Regel)

| Datei                                 | vorher                    | jetzt                        | Grund                                                    |
| ------------------------------------- | ------------------------- | ---------------------------- | -------------------------------------------------------- |
| `packages/engine/src/fill.test.ts`    | `TRAVEL_STITCH_MM` 2,0    | 3,0                          | §8.5: verdeckte Reise, Puncher-Praxis                    |
| `packages/engine/src/fill.test.ts`    | Weg hat mehr als 3 Punkte | mehr als 1                   | Folge der längeren Stiche auf demselben Weg              |
| `packages/engine/src/connect.test.ts` | —                         | vier Tests zur Trim-Regel    | §10.2 gilt jetzt auch für Sprünge innerhalb eines Blocks |
| `packages/engine/src/running.test.ts` | —                         | drei Tests zu Ankern und Tie | §11-Ausnahme und Verriegelung nach einem Binnen-Trim     |

Die Trims der fünf Logos steigen dadurch (STUTTGART 250 mm von 64 auf 207). Das ist keine
verschobene Erwartung, sondern das Ziel: vorher lag der Faden über blanken Stoff.

## Beim Bauen gefunden (Trim-Regel)

- **Einzelprüfung reicht nicht.** Ein Verbindungssprung und ein Sprung im nächsten Objekt
  stehen ohne Stich dazwischen; jeder für sich ist erlaubt, zusammen sind es 10,3 mm Faden
  auf dem Stoff. Gezählt wird deshalb ab dem letzten Stich.
- **Die Nachbearbeitung verlängert Sprünge.** Die Mindeststichlänge entfernte die Stiche
  direkt vor und nach einem Sprung, die Verriegelung verschob seinen Anfang um 0,3 mm. Aus
  5,0 mm wurden 5,3 mm — und kein Trim. Die Stufe läuft jetzt als letzte und bringt ihre
  eigene Verriegelung mit.
- **Die Deckungsprüfung muss beim nächsten Objekt beginnen.** Ich hatte sie beim laufenden
  beginnen lassen; das erklärte Fäden für gedeckt, die von dem Objekt gedeckt worden wären,
  das sie gerade zieht.

## Geänderte Erwartungswerte, 21.09.2026 (EPCwin-Presets)

Die Reihenabstände und die Stichlänge aus §14 verschieben jede Stichzahl. Fünf bestehende
Tests haben Mindestzahlen geprüft und wurden nachgezogen — keine Golden Files, sondern
Plausibilitätsschwellen:

| Datei                                    | vorher                    | jetzt | Grund                            |
| ---------------------------------------- | ------------------------- | ----- | -------------------------------- |
| `packages/engine/src/fill.test.ts`       | Quadrat > 120 Stiche      | > 90  | Stichlänge 3,0 → 4,0             |
| `packages/engine/src/pipeline.test.ts`   | Plan > 450 Stiche         | > 380 | dasselbe, plus Reihenabstände    |
| `packages/formats/src/dst/dst.test.ts`   | > 400 Einheiten           | > 350 | dasselbe (Byte-Vergleich bleibt) |
| `packages/render/src/render.test.ts`     | > 400 Stiche              | > 350 | dasselbe                         |
| `packages/engine/src/import/svg.test.ts` | Fleece-Reihenabstand 0,35 | 0,40  | EPCwin-Wert                      |

Neu sind fünf Tests zum prozentualen Zugausgleich (`satin.test.ts`): Breitenmessung,
Prozentrechnung, Deckel, Millimeter-Override und der Vergleich schmal gegen breit.

## Beim Bauen gefunden (Zugausgleich-Boden, 21.09.2026)

- **Der prozentuale Zugausgleich braucht eine Untergrenze.** Ich hatte den Deckel eingebaut
  und den Boden vergessen. 12 % einer 0,46-mm-Spalte sind 0,06 mm; die Spalte bleibt damit
  unter der Mindeststichlänge von 0,6 mm (§11), und `postProcess` räumt jeden zweiten Stich
  weg. Die Buchstaben des STUTTGART-Logos standen hohl auf dem Bild. Aufgefallen ist es am
  gerenderten PNG, nicht an einem der 472 Tests — deshalb steht der Bildvergleich in der
  Neuplanung (§6).
- **Der Faden zieht konstant, nicht proportional.** Die Fachpraxis führt beides getrennt und
  addiert: fester Millimeterwert plus prozentualer Anteil. Unsere Klammer aus Boden (0,2)
  und Deckel (0,4) bildet das an den Rändern ab; die saubere Addition ist eine offene
  Änderung in `docs/neuplanung-punchprogramm.md`.

## Nadelhäufung abgestellt (26.09.2026)

Anlass: „Die Programme sind alle nicht stickbar." Vier Schritte, jeder einzeln gemessen.

1. **Die Kennzahl gebaut** (`needleClusters`, §11). Einstiche je 0,2-mm-Zelle — die Dichte
   auf 1-mm-Raster sieht eine Häufung nicht, weil sie sie wegmittelt. Schwellen am Archiv
   kalibriert (192 Produktionsdateien): warn ab 6, error ab 12 oder mehr als 20 Zellen.
2. **Reisewege streuen** (§8.7.2). Durchlaufender Stichtakt, erzwungene Ecken treten auf der
   äußeren Winkelhalbierenden zur Seite, stetig aus der gelaufenen Weglänge.
3. **Keine Konturunterlage auf Splittern** (§8.6, `keepWide`). Der eigentliche Verursacher.
4. **Reisestichlänge zurück auf 2,0** (§8.5); Fill-Stichlänge bleibt bei 4,0 — beides
   gemessen, nicht angenommen.

| Kennzahl (STUTTGART 80 mm)         | vorher |    nachher |  Archiv |
| ---------------------------------- | -----: | ---------: | ------: |
| Einstiche in der schlimmsten Zelle |     22 |      **7** |   4 – 8 |
| Zellen ab 6 Einstichen             |     82 |      **2** |   0 – 8 |
| Dichtespitze je mm²                |     36 |     **28** | 11 – 31 |
| Stiche                             | 14.778 | **13.738** |         |

Alle sechs Läufe melden nur noch Warnungen, kein Fehler.

_(Richtigstellung 28.09.2026: stimmt nicht für STUTTGART 250 mm, Eislingen 200 mm und
Atzensport Hofbräu 200 mm — sie melden seit der `OBJECT_OUTSIDE_HOOP`-Prüfung (18.09.2026)
einen Fehler, weil die Motive höher sind als der Standardrahmen 360 × 200 mm. Kein
Rechenfehler, eine Rahmenfrage. Siehe „Schrift der Kundenlogos (27./28.09.2026)" unten.)_

### Beim Bauen gefunden

- **Die Ursache war nicht der Deckstich.** Die Messung, die es entschieden hat, war das
  phasenweise Abschalten: ohne Gitterunterlage blieb die Häufung (14/10), ohne
  Konturunterlage verschwand sie (5/0). Ohne diese Messung hätte ich weiter an der
  Wegeplanung gedreht.
- **Rückkopplung beim Streuen.** Der erste Entwurf leitete den Eckversatz aus dem Stichtakt
  ab — den der Versatz selbst verändert. Die Wege sammelten sich dann an den Fixpunkten
  dieser Rückkopplung (4 von 8 auf einem Punkt) statt zu streuen. Seither entscheidet die
  gelaufene Weglänge, die von Versätzen unberührt bleibt.
- **Mehr Kandidaten prüfen bringt nichts.** `NEAREST_CHECKED` von 8 auf 64 erhöht: keine
  Verbesserung (13 → 14 Einstiche), dafür 3 % mehr Rechenzeit. Die Sektionsreihenfolge ist
  nicht das Problem, die Zahl der Phasen war es.
- **Die Rechenzeit ist unabhängig davon zu hoch.** STUTTGART 250 mm braucht 19,5 s für einen
  Plan; gemessen gegen den Stand vor diesen Änderungen (20,2 s) liegt das nicht an ihnen.
  Regel 9 (< 300 ms) ist weit verfehlt und bleibt offen.

## Winkel, Reihenfolge und ein Player (27.09.2026)

Zwei Schritte aus `docs/verfahren-aus-open-source.md`, jeder einzeln gemessen: der
**Stichwinkel nach den wenigsten Reihenbrüchen** statt fest 45° (§8.2) und die
**Reihenfolge in zwei Durchgängen** — erst rechnen, dann mit den echten Start- und
Endpunkten der Blöcke neu sortieren statt mit dem Objektanfang (§10.1).

| Kennzahl (STUTTGART 80 mm)         | 26.09. |       27.09. |  Archiv |
| ---------------------------------- | -----: | -----------: | ------: |
| Stiche                             | 13.738 |   **13.314** |         |
| Sprünge / Trims                    | 175/66 | **164 / 55** |         |
| Dichtespitze je mm²                |     28 |       **24** | 11 – 31 |
| Einstiche in der schlimmsten Zelle |      7 |        **5** |   4 – 8 |
| Zellen ab 6 Einstichen             |      2 |        **0** |   0 – 8 |

Danach alle sechs Motive neu gerechnet. Jede DST wurde mit `readDst` zurückgelesen und gegen
den Plan gehalten — Stichzahl, Farbwechsel und Größe stimmen bei sechs von sechs. Einordnung
gegen die 192 Archivdateien (`pnpm kennzahlen`):

| Lauf                      | Trims/1000 | Sprünge/1000 | Stiche/mm² | Nadel | Einordnung           |
| ------------------------- | ---------: | -----------: | ---------: | ----: | -------------------- |
| STUTTGART 250 mm          |   **1,39** |     **6,26** |       1,24 |     6 | alles bis Median     |
| Atzensport Hofbräu 200 mm |       3,89 |        16,13 |       0,76 |     7 | bis p90              |
| STUTTGART 80 mm           |       4,13 |        12,32 |       2,23 |     5 | bis p90              |
| Berufsfeuerwehr Köln 90   |       5,60 |        17,93 |       2,38 |     7 | Stichmenge > p90     |
| Eislingen Print 200 mm    |       7,95 |        42,65 |       0,37 |     6 | Trims, Sprünge > p90 |
| Atzensport Hofbräu 80 mm  |  **10,74** |        30,82 |       1,22 |     5 | Trims **über allem** |

Die Nadelhäufung liegt bei allen sechs im Archivfeld (4 – 8). Was heraussticht, sind Trims
und Sprünge der **kleinen** Motive — und die folgen aus der Stückelung der Vorlage, nicht aus
der Wegeplanung: Atzensport 80 mm sind 151 Objekte, davon 41 Fills unter 4 mm². Messung in
`docs/messung-echte-logos.md`.

Zum Ansehen vor dem Abstecken gibt es jetzt einen **Stich-Player** (Artifact, aus den
neutralen JSONs erzeugt): Abspielen, Slider über alle Stiche, Sprung- und Trim-Marker,
Nadelposition, Garnfolge. Er rechnet nichts nach, er zeichnet, was in der Datei steht.

Offen bleibt die **Rechenzeit**: STUTTGART 250 mm braucht 17,7 s für einen Plan, Regel 9
nennt 0,3 s.

## Schrift der Kundenlogos (27./28.09.2026)

**Abnahme am Stich-Player: alle sechs Läufe abgelehnt.** Der Nutzer hat sie geprüft und als
„alle unbrauchbar" zurückgewiesen. Die beiden Schritte unten sind Messung, keine Freigabe —
Einzelheiten und alle Zahlen in `docs/messung-echte-logos.md`.

Anlass: „Die Schrift wird gar nicht mehr richtig gestickt. Man erkennt nichts mehr." Zwei
Schritte:

1. **Deckungsprüfung für Auto-Satin** (`columnCoverage`, §5.1). Die vorhandenen Schranken
   maßen nur die Rail-Länge; ein Keil, der die halbe Buchstabenform ausspart, hatte kurze
   Rails und kam durch — gemessen deckten die Spalten bei STUTTGART 80 mm nur 37 bis 52 %
   der Buchstabenkerne. Neu: `COLUMN_COVERAGE_MIN` = 0,85, darunter wird die Form ein Fill.
   Ein zweiter Fehler im selben Tor (`columns.length === 0` warf reine
   Laufstich-Ergebnisse weg) ist mitbehoben.
2. **Durchgänge nach Breite** (Variante D, `SINGLE_PASS_MAX_MM`, §7.4). Ein Durchgang bis
   0,7 mm, sonst drei (Bohnenstich). Die Grenze stand zunächst bei 0,6 mm; korrigiert, weil
   die Breitenmessung dünne Eckringe überschätzt (ein 0,45-mm-Rahmen misst dort bis
   0,62 mm).

**Sackgasse, gemessen und verworfen:** die Zierlinie über Lücken unter 0,5 mm schließen.
Nadelhäufung sank dabei von 8 auf 6, aber bei dieser Schrift trägt die Zierlinie Form — Beine
des A, Balken des G, Bein des R stehen nur als Zierlinie in der Vorlage und wären
verschwunden.

| Motiv                      | Stiche | Trims/1000 | Sprünge/1000 | Nadel (max / ab 6) | 27.09.: Stiche |
| -------------------------- | -----: | ---------: | -----------: | -----------------: | -------------: |
| STUTTGART 80 mm            | 11.192 |       4,20 |        11,35 |              6 / 2 |         13.314 |
| STUTTGART 250 mm           | 73.651 |       1,48 |         6,25 |              6 / 4 |         72.478 |
| Berufsfeuerwehr Köln 90 mm | 19.668 |       4,02 |        11,95 |             11 / 8 |         19.301 |
| Eislingen Print 200 mm     | 27.304 |       3,96 |        13,92 |              5 / 0 |         23.024 |
| Atzensport Hofbräu 80 mm   | 10.269 |      10,22 |        26,58 |              5 / 0 |         11.355 |
| Atzensport Hofbräu 200 mm  | 42.592 |       3,43 |        16,13 |              7 / 1 |         43.460 |

Jede DST mit `readDst` zurückgelesen: Stichzahl, Farbwechsel, Breite und Höhe stimmen bei
24 von 24 Werten. Vollständige Tabelle (Sprünge, Trims, Farbwechsel, Stiche/mm², Dichte) und
Einordnung gegen das Archiv in `docs/messung-echte-logos.md`.

Offen: Köln bei Nadelhäufung 11 (Archiv-Max 8, Ursache vermutlich `tie.ts`), „CYS SPORTS" im
Banner weiterhin kaum lesbar, `medianShapeWidthMm` an sich, `OBJECT_OUTSIDE_HOOP` bei drei
Motiven (siehe Richtigstellung oben) und die Auto-Satin-Wurzel bei Kreuzungen. Alles mit
Zahlen in `docs/backlog.md`.

**Die Abnahme steht über alledem:** eine gemessene Verbesserung ist kein „geht jetzt". Ohne
eine gepunchte Profi-Datei desselben Motivs im selben Player fehlt der Maßstab, woran
„unbrauchbar" hängt.

## Ink/Stitch als Stich-Engine (28.09.2026)

Entscheidung und Folgen: `docs/adr/0001-inkstitch-als-stich-engine.md`. Ink/Stitch erzeugt die
Stiche, TEXMA Stitch bereitet die Vorlage vor und prüft das Ergebnis; die eigene
Stichgenerierung ist eingefroren. Phase 1b in Spec §16.

**Schritt 1 — Einbau, fertig.** `inkstitch/setup.sh` holt Ink/Stitch im festen Commit
`d59c9ab` nach `~/.cache/texma-stitch` und legt eine venv mit festen Versionen an (Erstlauf
17–27 s, danach No-op in 11–20 ms; ein SessionStart-Hook ruft es auf). `inkstitch/run.py`
startet jede Erweiterung kopflos und leitet Meldungen, die Ink/Stitch sonst nur im GUI-Dialog
zeigt, auf stderr. `pnpm inkstitch <svg> [preset]` schreibt DST, PNG und die Kennzahlen gegen
das Archiv. Jeder Ink/Stitch-Aufruf kostet rund 9 s allein für den Start.

Die sechs Kundenlogos ergeben **Stich für Stich den Probelauf** — Ink/Stitch ist bei gleicher
Vorlage und gleichem Commit deterministisch:

| Motiv                      |  Stiche | Sprünge | Trims | Farbblöcke | Dichtespitze | Nadelhäufung |
| -------------------------- | ------: | ------: | ----: | ---------: | -----------: | -----------: |
| STUTTGART 80 mm            |  17.974 |      52 |     0 |         13 |           39 |            8 |
| STUTTGART 250 mm           | 111.130 |     138 |     0 |         13 |           26 |           10 |
| Berufsfeuerwehr Köln 90 mm |  27.139 |     111 |     0 |         23 |           34 |           15 |
| Eislingen Print 200 mm     |  46.806 |     190 |     0 |         12 |           39 |           12 |
| Atzensport Hofbräu 80 mm   |  16.642 |     245 |     0 |         11 |           29 |            9 |
| Atzensport Hofbräu 200 mm  |  58.432 |     565 |     0 |         13 |           26 |            7 |

Laufzeit mit Ink/Stitchs eigenem Stichspeicher 10–25 s je Logo; im ersten Lauf ohne ihn bis
rund 4,5 min.

**Schritt 2 — Schrift als Satin, gebaut, Probestick offen.** `packages/engine/src/inkstitch/`
teilt jede Form nach Breite ein (Satin ab 0,7 mm, darunter einfacher Laufstich, über 5 mm Tatami) und
schreibt für Schrift und schmale Formen **eigene Ink/Stitch-Satinsäulen**: Strichplan aus der
Mittelachse, an Kreuzungen läuft das gegenläufigste Paar durch, die übrigen Striche enden
0,2 mm unter ihm; Rails aus der Kontur, über Öffnungen als gedachte Gerade; Deckung unter 0,85
→ Tatami mit Grund. Ink/Stitchs eigenes „Füllung zu Satin" ist gemessen und verworfen — es
lässt jedes Stückende in einem Punkt zusammenlaufen:

| Testblatt, 13 Buchstaben (DejaVu Sans Bold) | eigene Säulen | Füllung zu Satin |
| ------------------------------------------- | ------------: | ---------------: |
| als Satin gesetzt                           |         13/13 |            10/13 |
| Deckung                                     |    99,9–100 % |      97,5–99,9 % |
| Dichtespitze                                |            12 |               21 |
| Nadelhäufung                                |             4 |                7 |

`pnpm inkstitch` setzt Satin jetzt als Standard (Vorlage → `auto_satin --trim` je
Farbfolge → `output`), `--tatami` behält den reinen Tatami-Lauf. Alle fünf Schriftzüge werden
Satin; Rückfälle stehen mit Grund in der Ausgabe. Satin gegen Tatami-Lauf (gemessen mit der
ersten Grenze 0,8 mm):

| Motiv                      | Stiche            | Trims   | Dichtespitze | Nadelhäufung |
| -------------------------- | ----------------- | ------- | -----------: | -----------: |
| STUTTGART 80 mm            | 15.449 (17.974)   | 31 (0)  |      25 (39) |        8 (8) |
| STUTTGART 250 mm           | 110.858 (111.130) | 41 (0)  |      28 (26) |      10 (10) |
| Berufsfeuerwehr Köln 90 mm | 25.008 (27.139)   | 56 (0)  |      30 (34) |       8 (15) |
| Eislingen Print 200 mm     | 35.108 (46.806)   | 90 (0)  |      21 (39) |       8 (12) |
| Atzensport Hofbräu 80 mm   | 13.873 (16.642)   | 68 (0)  |      26 (29) |        7 (9) |
| Atzensport Hofbräu 200 mm  | 55.599 (58.432)   | 104 (0) |      24 (26) |        7 (7) |

Die Trims kommen aus `auto_satin` und liegen je 1000 Stiche zwischen 0,4 und 4,9 (Archiv
p90 5,6). Offen, mit Einzelheiten in `docs/backlog.md`: Blöcke an Strichenden (Varsity-„T",
G-Zunge) fächern, das Glätten rauer Konturen schließt beim „R" von „CYS SPORTS" den
Beinschlitz, Pinselreste in „SEGEN SEIN" werden kurze Laufstiche, Satin auf Tatami-Grund wird
nicht ausgespart (Schritt 3). Farbfolge und verdeckte Flächen sind unverändert (Schritt 3).

**Grenze 0,7 mm (29.09.2026, Entscheidung des Nutzers).** Satin beginnt dort, wo ein Faden die
Breite nicht mehr deckt (`SINGLE_PASS_MAX_MM`, §7.4); den dreifachen Laufstich zwischen 0,7 und
0,8 mm gibt es in der Vorlage nicht mehr. Der „/" in „NotSan 01/24" (0,73 mm) ist jetzt Satin.
Im Köln-Logo werden damit sechs Formen mehr als Satin angesetzt; zwei davon (0,7–0,8 mm) halten
als Säule nicht und fallen auf Tatami zurück, die Dichtespitze steigt dort von 30 auf 34.
Folgepunkt für Schritt 3: schmale Rückfälle als Laufstich statt Tatami.

**Schritt 3 — verdeckte Flächen, Farbfolge, Fadenschnitte, Preset-Werte (29.09.2026).**
`pnpm inkstitch` setzt dafür `order: "colour"` und `knockdown: true`; Kommentare und Gründe
stehen in `packages/engine/src/inkstitch/`, Messungen am Commit je Punkt.

- **Schmale Rückfälle** (unter 1,0 mm, als Säule nicht gehalten): Laufstich entlang der Achse
  statt Tatami, mit Grund in der Ausgabe (`columns.ts`, `template.ts`).
- **Verdeckte Flächen** (`knockdown.ts` über `resolveOverlaps`, §4.1): nur Fill schneidet und nur
  aus Fill, später schneidet aus früher, Schwelle 20 mm², untere bleibt 0,8 mm unter der oberen;
  Teile werden eigene Objekte. STUTTGART 80 mm: Tatami-Fläche 6343 → 3781 mm².
- **Farbfolge** (`sequence.ts`, §10.1): gleiche Farben zusammengezogen, ohne zwei sich
  überlappende Objekte zu vertauschen; die Suche liefert das Minimum. Blöcke 13 → 6
  (STUTTGART 80 und 250 mm), 23 → 15 (Köln), 12 → 6 (Eislingen), 11 → 7 und 13 → 8 (Atzensport).
- **Fadenschnitte** (Ink/Stitchs `jump_to_trim`, Schwelle 5 mm aus §10.2): nach der Quelle
  gelesen (`inkstitch/README.md`); `readDst` zählt die drei Sprung-Datensätze eines Trims als
  einen. `pnpm inkstitch` meldet „Fäden auf dem Stoff" (Sprünge über 5 mm ohne Trim): 0 bei allen.
- **Tatami-Werte** (`tatami.ts`): Reihenabstand, Stichlänge, Versatz, Winkel (§8.2, §5.1) und
  Gitterunterlage (§8.6) als Attribute, Zug und Schub (§8.1.1) im Umriss. Zwei Abweichungen vom
  Auftrag „als Attribute", gemessen: das Attribut `pull_compensation_mm` macht Ink/Stitch bei
  großen Logos um ein Vielfaches langsamer und kennt keinen Schub; `fill_underlay` zerlegt
  ausgefranste Flächen in Stücke ohne Fadenschnitt dazwischen (55 Fäden über 5 mm, längster
  79 mm). Die Gitterunterlage steht deshalb nur, wo der Einzug ein Stück ist.

Stand nach Punkt 4 (in Klammern die Ausgangslage vor Schritt 3), Preset `pique`:

| Motiv                      |           Stiche |   Sprünge |     Trims | Farbblöcke | Dichtespitze | Nadelhäufung |
| -------------------------- | ---------------: | --------: | --------: | ---------: | -----------: | -----------: |
| STUTTGART 80 mm            |  13.578 (15.449) |   89 (90) |   46 (31) |     6 (13) |      22 (25) |        7 (8) |
| STUTTGART 250 mm           | 74.674 (110.875) | 198 (194) |   57 (42) |     6 (13) |      29 (28) |       9 (10) |
| Berufsfeuerwehr Köln 90 mm |  20.711 (26.374) | 168 (176) |   85 (62) |    15 (23) |      29 (34) |        8 (8) |
| Eislingen Print 200 mm     |  32.669 (35.161) | 341 (312) |  146 (99) |     6 (12) |      20 (21) |        6 (8) |
| Atzensport Hofbräu 80 mm   |  12.005 (14.347) | 226 (318) |  116 (76) |     7 (11) |      23 (26) |        7 (7) |
| Atzensport Hofbräu 200 mm  |  46.508 (55.616) | 496 (635) | 115 (105) |     8 (13) |      22 (24) |        6 (7) |

Gegen die Ziele aus §16 (STUTTGART 80 mm): Dichtespitze 22 (≤ 24), Nadelhäufung 7 (≤ 8),
Trims/1000 3,4 (≤ 5,6) erreicht; **Farbblöcke 6 statt ≤ 4** — unter §10.1 ist 6 das Minimum
(Spec-Frage in `docs/backlog.md`). Atzensport 80 mm bleibt bei 9,7 Trims/1000 (Ziel 5,6): 124
Objekte auf 12.005 Stiche, davon 15 Formen unter 1 mm².
