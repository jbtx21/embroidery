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
`d59c9ab` (seit 30.09.2026 die offizielle Version 3.3.0, siehe unten) nach
`~/.cache/texma-stitch` und legt eine venv mit festen Versionen an (Erstlauf 17–27 s, danach
No-op in 11–20 ms; ein SessionStart-Hook ruft es auf). `inkstitch/run.py` startet jede
Erweiterung kopflos und leitet Meldungen, die Ink/Stitch sonst nur im GUI-Dialog zeigt, auf
stderr. `pnpm inkstitch <svg> [preset]` schreibt DST, PNG und die Kennzahlen gegen das Archiv.
Start eines Ink/Stitch-Aufrufs: rund 12 s für `output` (berichtigt 30.09.2026: `ThreadCatalog`
rechnet 150 Farbpaletten um, für die DST ohne Wirkung), rund 1 s für die übrigen Erweiterungen.

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

**§4.2, Farbfolge-Variante und Breite (29.09.2026, Folge von Schritt 3).** Nach der Entscheidung
des Nutzers zu Schritt 3 (Spec §4.2, §7.8.5, §8.8 nachgezogen):

- **Satin spart die Tatami-Fläche darunter aus** (`cutOutSatin` in `knockdown.ts`, §4.2 Regel
  1): eine später gestickte Satinform schneidet ihren Platz aus der Fläche unter ihr, die
  Fläche bleibt `underlapMm` (Piqué 0,2 mm) unter der Kante; die 20 mm² gelten für alle
  Satinformen zusammen, Laufstich schneidet nie. Meldung je Fläche (`KnockdownReport.satin`),
  ganz überdeckte Flächen als `FILL_COVERED`. Rauchtest gegen die DST.
- **Angrenzende Flächen greifen 0,3 mm** (`TEMPLATE_TOUCH_UNDERLAP_MM`, §4.2 Regel 2). Die
  eingefrorene `resolveOverlaps` bekam dafür nur einen optionalen Parameter
  (`ResolveOptions.touchUnderlapMm`); ohne ihn bleibt es bei 0,8 mm (Test), der Schnitt einer
  Überlappung behält seine 0,8 mm.
- **Farbfolge-Variante** `--ueberlappung <mm²>` (Option `minOverlapMm2`, `orderSwaps` in
  `sequence.ts`): nur zur Sichtprüfung, der Standard bleibt §10.1. Nennt die Überlappungen,
  deren Reihenfolge umdreht.
- **`--breite <mm>`** (`tools/breite.mjs`): skaliert das Motiv proportional auf die Zielbreite,
  bevor eingelesen wird; Ausgabe mit Faktor und Größe davor und danach.
- **`inkstitch_svg_version`** in der Vorlage gemessen und **nicht übernommen** (mehr Zellen ab 6
  Einstichen in fünf von sechs Logos).

Endstand (in Klammern der Stand nach Punkt 4), Preset `pique`:

| Motiv                      |          Stiche |   Sprünge |     Trims | Farbblöcke | Dichtespitze | Zellen >18 | Nadelhäufung |
| -------------------------- | --------------: | --------: | --------: | ---------: | -----------: | ---------: | -----------: |
| STUTTGART 80 mm            | 15.422 (13.578) |   99 (89) |   50 (46) |      6 (6) |      27 (22) |     15 (5) |        7 (7) |
| STUTTGART 250 mm           | 79.432 (74.674) | 221 (198) |   62 (57) |      6 (6) |      29 (29) |    25 (15) |        9 (9) |
| Berufsfeuerwehr Köln 90 mm | 20.274 (20.711) | 180 (168) |   91 (85) |    15 (15) |      32 (29) |    33 (30) |       10 (8) |
| Eislingen Print 200 mm     | 32.639 (32.669) | 341 (341) | 146 (146) |      6 (6) |      20 (20) |      1 (1) |        6 (6) |
| Atzensport Hofbräu 80 mm   | 12.544 (12.005) | 226 (226) | 116 (116) |      7 (7) |      23 (23) |      3 (3) |        7 (7) |
| Atzensport Hofbräu 200 mm  | 45.676 (46.508) | 496 (496) | 115 (115) |      8 (8) |      24 (22) |      4 (4) |        7 (6) |

Gegen die Ziele aus §16 (STUTTGART 80 mm): Nadelhäufung 7 (≤ 8) und Trims/1000 3,24 (≤ 5,6)
gehalten; **Dichtespitze 27 statt ≤ 24 — mit §4.2 nicht mehr erreicht** (nach Punkt 4: 22),
Farbblöcke weiter 6 statt ≤ 4. Regel 1 (mehr Stiche und Zellen über 18 an STUTTGART) und Regel 2
(Köln schlechter) bringen nicht, was §4.2 erwartet; Zahlen, Ursache und Vorschläge (relative
Schwelle für die Farbfolge, Weite der Regel 2) in `docs/backlog.md`. STUTTGART 80 mm auf
120 mm (`--breite 120`): 27.836 Stiche, Dichtespitze 28, Nadelhäufung 9.

_(Überholt am selben Tag: der Nutzer hat §4.2 zurückgenommen, die Vorlage folgt wieder §4.1; die
Tabelle „Endstand" oben ist der Stand mit §4.2 und gilt nicht mehr. Unten der Stand danach.)_

**Rücknahme §4.2 und Zugausgleich je Rail (29.09.2026, Folge von Schritt 3).** Nach den Messungen hat
der Nutzer §4.2 zurückgenommen (Spec §4.2 neu gefasst), und nach dem Vergleich mit der Profi-Mütze
„Stuttgarter Hofbräu" gilt neu §7.8.3 „Zugausgleich lässt Stofflücken offen":

- **Rücknahme** (`1c9aa6d`): `satinCutout` und `touchUnderlapMm` sind Optionen der Vorlage
  (`--aussparen`, `--naht <mm>`), im Standard aus bzw. 0,8 mm. Die DST aller sechs Logos ist
  byte-gleich mit dem Endstand von Schritt 3 (Tabelle „Stand nach Punkt 4" oben); `--ueberlappung`
  und `--breite` liegen hinter ihren Schaltern und ändern am Standardweg nichts.
- **Zugausgleich je Rail** (`50d4ca7`, `rail-pull.ts`): Ink/Stitch nimmt `pull_compensation_mm="a b"`,
  `a` für die erste Rail des Pfads, `b` für die zweite. Eine Rail zu einem Stoffspalt unter 1,0 mm
  (bis zur nächsten anderen Form liegt nur Stoff) bekommt keinen Ausgleich, eine Säule unter 1,0 mm
  keinen auf beiden Rails (Regel 2, in diesem Stand noch für alle schmalen Säulen — überholt, siehe
  „Regel 2 eingeschränkt“ unten). Der Spalt wird je Rail entlang der Sprossen nach außen gemessen, der
  Median über die Säule entscheidet; eine berührende oder überdeckende Form und ein Spalt unter 0,1 mm
  zählen nicht als Spalt. Rauchtest: die Stiche der einen Rail wandern um den Wert, die der anderen
  nicht, und der Spalt Rot/Gold in der DST bleibt offen. `--zug-symmetrisch` gibt den Stand davor.

Stand nach Punkt 4 → mit Zugausgleich je Rail (Zwischenstand `cb1f01c`, Regel 2 für alle schmalen
Säulen), Preset `pique`:

| Motiv                      |          Stiche | Dichtespitze | Zellen >18 | Nadelhäufung | Zellen ab 6 |
| -------------------------- | --------------: | -----------: | ---------: | -----------: | ----------: |
| STUTTGART 80 mm            | 13.578 → 13.577 |      22 → 21 |      5 → 7 |       7 → 10 |       3 → 3 |
| STUTTGART 250 mm           | 74.674 → 74.674 |      29 → 29 |    15 → 15 |        9 → 9 |     33 → 32 |
| Berufsfeuerwehr Köln 90 mm | 20.711 → 20.680 |      29 → 29 |    30 → 40 |        8 → 8 |     11 → 15 |
| Eislingen Print 200 mm     | 32.669 → 32.659 |      20 → 20 |      1 → 1 |        6 → 6 |       1 → 1 |
| Atzensport Hofbräu 80 mm   | 12.005 → 11.928 |      23 → 23 |      3 → 1 |        7 → 7 |       2 → 3 |
| Atzensport Hofbräu 200 mm  | 46.508 → 46.483 |      22 → 23 |      4 → 4 |        6 → 6 |       3 → 5 |

Sprünge, Trims und Farbblöcke sind bei allen sechs unverändert. Gegen §16 (STUTTGART 80 mm) ist die
Nadelhäufung mit 10 (≤ 8) nicht mehr erreicht; sie kommt von der Regel für Säulen unter 1,0 mm, nicht
vom Stoffspalt (Einzelheiten und Hofbräu-Zahlen in `docs/backlog.md`).

**Regel 2 eingeschränkt (29.09.2026, Nutzerentscheidung; Spec §7.8.3 Regel 2 in `a622fff`).** Der
Zwischenstand oben hat die Frage aufgeworfen, ob „Säule unter 1,0 mm ohne Ausgleich“ für alle schmalen
Säulen gelten soll (Nadelhäufung STUTTGART 80 mm 7 → 10). Entschieden: nur für Säulen unter 1,0 mm
(`SATIN_NARROW_WARN_MM`), von denen mindestens eine Rail nach Regel 1 an einem Stoffspalt unter 1,0 mm
liegt (gleiche Messung: entlang der Sprossen nach außen, Median über die Säule; ein Spalt unter 0,1 mm
und eine berührende oder überdeckende Form zählen nicht). Sie bekommen auf beiden Rails keinen
Ausgleich; alle übrigen schmalen Säulen behalten den Ausgleich nach §7.2, symmetrisch. Breite Säulen
ändern sich nicht (nur die Rail zum Spalt bekommt 0). Umsetzung `6eb9f2f`: `railPull` in
`rail-pull.ts` liefert dafür `narrowAtGap`, `template.ts` schreibt die Werte je Rail, `pnpm inkstitch` nennt die schmalen Säulen am
Spalt; `--zug-symmetrisch` gibt weiter den Stand ohne §7.8.3. Zuerst die Tests: schmale Säule ohne
Nachbarn → symmetrisch; Nachbar in 0,5 mm auf einer Seite → 0 auf beiden Rails; breite Säule am Spalt →
nur diese Rail; schmale Säule, deren Nachbar nur berührt → symmetrisch.

Zwischenstand `cb1f01c` (Regel 2 für alle schmalen Säulen) → Regel 2 nur am Stoffspalt, Preset `pique`,
kalter Ink/Stitch-Cache:

| Motiv                      |          Stiche | Dichtespitze | Zellen >18 | Nadelhäufung | Zellen ab 6 |  Trims/1000 |
| -------------------------- | --------------: | -----------: | ---------: | -----------: | ----------: | ----------: |
| STUTTGART 80 mm            | 13.577 → 13.578 |      21 → 22 |      7 → 5 |       10 → 7 |       3 → 3 | 3,39 → 3,39 |
| STUTTGART 250 mm           | 74.674 → 74.674 |      29 → 29 |    15 → 15 |        9 → 9 |     32 → 32 | 0,76 → 0,76 |
| Berufsfeuerwehr Köln 90 mm | 20.680 → 20.711 |      29 → 29 |    40 → 30 |        8 → 8 |     15 → 11 | 4,11 → 4,10 |
| Eislingen Print 200 mm     | 32.659 → 32.669 |      20 → 20 |      1 → 1 |        6 → 6 |       1 → 1 | 4,47 → 4,47 |
| Atzensport Hofbräu 80 mm   | 11.928 → 11.959 |      23 → 24 |      1 → 3 |        7 → 7 |       3 → 3 | 9,73 → 9,70 |
| Atzensport Hofbräu 200 mm  | 46.483 → 46.496 |      23 → 23 |      4 → 4 |        6 → 6 |       5 → 3 | 2,47 → 2,47 |

Sprünge, Trims und Farbblöcke sind bei allen sechs unverändert. STUTTGART 80 mm hat wieder die
Kennzahlen von „Stand nach Punkt 4“ (13.578 Stiche, Dichtespitze 22, Zellen über 18: 5,
Nadelhäufung 7); die DST von Köln ist byte-gleich mit ihr. Gegen §16 (STUTTGART 80 mm) sind
Dichtespitze 22 (≤ 24), Nadelhäufung 7 (≤ 8) und Trims/1000 3,4 (≤ 5,6) wieder erreicht,
Farbblöcke bleiben bei 6 statt ≤ 4 (Spec-Frage in `docs/backlog.md`). Atzensport 80 mm liegt gegen den
Zwischenstand etwas schlechter (Dichtespitze 24, Zellen über 18: 3 statt 1); gegen „Stand nach Punkt 4“
(Dichtespitze 23, Zellen ab 6: 2) bleibt ein Unterschied, der von den Säulen am Stoffspalt kommt
(Regeln 1 und 2).

**Hofbräu-Mütze** (Vorlage aus dem PDF des Nutzers, nicht im Repo; Preset `cap`, 110 mm): alle 28 Säulen
unter 1,0 mm liegen an einem Stoffspalt, keine bekommt den Ausgleich zurück; die Vorlage ist
byte-gleich mit der vom Zwischenstand. Die DST unterscheidet sich nur um einen Stich (9.426 statt
9.427): bei gleicher Vorlage weichen zwei Läufe an dieser Datei um einen Stich ab, zwei von drei
Läufen sind byte-gleich. Der Spalt Rot/Gold ist unverändert (Median der Abstände Gold → nächster roter
Einstich: ganzes Motiv 0,50 mm, „Ho“ 0,50, „Stu“ 0,41; Anteil unter 0,3 mm 21 % / 30 % / 24 %); die
93 Rails am Stoffspalt teilen sich in 61 an breiten Säulen und 32 an den 28 schmalen.

**Atzensport aus dem Vektor-PDF (29.09.2026).** Der Nutzer hat das Atzensport-Hofbräu-Logo als
Vektor-PDF nachgereicht (nicht im Repo). Die Vorlage unter den sechs Kundenlogos ist eine
Nachzeichnung aus einem Bild: fünf statt sieben Farben — der goldene Schatten der Schrift (#D0B259)
ist mit dem Beige des Pferds verschmolzen (#C2AA7D), das Rot stumpfer (#C72C31 statt #E00310) —, und
der Papiergrund in und neben den Buchstaben liegt als 18 cremefarbene Formen (#F4F3EF) in der
Vorlage, die mitgestickt werden. Umgewandelt wie das Hofbräu-PDF (MuPDF, Pfade unverändert, das
Gezeichnete 80 bzw. 200 mm breit), Stand `ce28e5d`, Preset `pique`, Nachzeichnung → PDF:

| Motiv                     |          Stiche |   Sprünge |  Trims/1000 | Farbblöcke | Dichtespitze | Zellen >18 | Nadelhäufung | Mindestgröße |
| ------------------------- | --------------: | --------: | ----------: | ---------: | -----------: | ---------: | -----------: | -----------: |
| Atzensport Hofbräu 80 mm  | 11.959 → 12.450 | 226 → 186 | 9,70 → 9,16 |      7 → 8 |      24 → 22 |      3 → 2 |        7 → 6 | 141 → 147 mm |
| Atzensport Hofbräu 200 mm | 46.496 → 41.746 | 496 → 312 | 2,47 → 2,71 |      8 → 8 |      23 → 19 |      4 → 1 |        6 → 6 | 351 → 296 mm |

Im Bild (Garnfarben, 28 Pixel je mm) ist die Schrift aus dem PDF durchgehend Satin mit goldenem
Schatten; aus der Nachzeichnung war das „o" von „Hofbräu" Tatami mit cremefarbenem Innenraum und der
Schatten ein Laufstich. Die Trims liegen in 80 mm auch aus dem PDF über dem Archiv-p90 — die raue
Kontur war nicht ihre Ursache (27 der 114 setzt §10.2, Sprung ab 5 mm). Der achte Farbblock kommt
aus dem PDF selbst: die Umlautstriche des „ä" tragen ein zweites, fast gleiches Rot (#D1070D) und
werden als eigene Farbe zuletzt gestickt. Offene Punkte in `docs/backlog.md`.

**Probestick-Stand (29.09.2026).** Fünf Dateien mit dem Endstand `ce28e5d`, erzeugt im sauberen
Arbeitsverzeichnis (DST, Vorschau in Garnfarben und Nadelbelegung je Stopp an den Nutzer; nicht im
Repo):

| Datei                             | Preset  |            Größe | Stiche | Farbblöcke | Trims/1000 | Dichtespitze | Nadelhäufung | Mindestgröße |
| --------------------------------- | ------- | ---------------: | -----: | ---------: | ---------: | -----------: | -----------: | -----------: |
| Stuttgarter Hofbräu               | `cap`   |  110,4 × 51,0 mm |  9.427 |          2 |       9,76 |           20 |            6 |       202 mm |
| STUTTGART 80 mm                   | `pique` |   79,4 × 74,6 mm | 13.578 |          6 |       3,39 |           22 |            7 |       118 mm |
| STUTTGART 120 mm (`--breite 120`) | `pique` | 119,0 × 111,6 mm | 25.541 |          6 |       2,00 |           25 |            9 |       223 mm |
| Berufsfeuerwehr Köln 90 mm        | `pique` |   90,2 × 90,2 mm | 20.711 |         15 |       4,10 |           29 |            8 |       167 mm |
| Atzensport Hofbräu 80 mm (PDF)    | `pique` |  79,6 × 113,0 mm | 12.450 |          8 |       9,16 |           22 |            6 |       147 mm |

STUTTGART 120 mm: die Nadelhäufung 9 liegt über dem Archiv (Maximum 8, aus vier Dateien) — eine
Zelle, in der drei Farblagen einstechen (Schwarz, Grau, Schwarz; zwei, vier und drei Einstiche);
im Zwischenstand `cb1f01c` war es 8 an anderer Stelle. Dass die Mindestgröße dort 223 mm statt
118 mm heißt, liegt an der Prüfung selbst (Backlog: „Die Mindestgröße springt mit der Prüfgröße").

**Ink/Stitch mit festem Hash-Seed (29.09.2026).** Beim Messen fiel auf, dass zwei Läufe mit
byte-gleicher Vorlage um einen Stich auseinanderlagen. Nachgemessen am Hofbräu-Motiv mit kaltem
Cache: drei Läufe ohne festen Seed gaben 9.424, 9.425 und 9.426 Stiche (drei verschiedene DSTs),
drei mit `PYTHONHASHSEED=0` dreimal dieselbe DST (9.425). Python würfelt den Hash von
Zeichenketten je Prozess und damit die Reihenfolge von Mengen, die Ink/Stitch durchläuft.
`tools/inkstitch-lauf.mjs` startet Ink/Stitch jetzt immer mit `PYTHONHASHSEED=0`
(`inkstitchEnv`, getestet in `test/inkstitch-lauf.test.ts`); der Stichplan-Cache aus der Zeit davor
ist einmal zu leeren (`inkstitch/README.md`). Nachgeprüft über `pnpm inkstitch`: kalter und warmer
Cache geben dieselbe DST wie die drei Läufe mit festem Seed. Die fünf Probestick-Dateien oben
entstanden vor dieser Änderung; ein Lauf heute kann um wenige Stiche von ihnen abweichen.

**Schritt 5 — Ink/Stitch 3.3.0 statt Entwicklungsstand (30.09.2026, Entscheidung des Nutzers).** Die
Stich-Engine läuft in der offiziellen Version 3.3.0 (Tag `v3.3.0`, Commit
`b0edd96311ece82ee48816dc93466274b12c2a9c`, 31.07.2026) — der Version vom Arbeitsplatz, damit eine
Nacharbeit in Inkscape genauso rechnet wie die Pipeline (ADR 0001); vorher der Entwicklungsstand
`d59c9ab` (17.09.2026). `inkstitch/setup.sh` holt den Commit flach, sonst über den Tag, und prüft ihn
nach dem Holen; bei einem Umstieg ersetzt es den Klon, lässt die venv bei gleichen Pins und weist auf
Ink/Stitchs Stichplan-Cache hin (`~/.config/inkstitch/cache` — sein Schlüssel kennt die Version
nicht; für Messungen zwischen zwei Versionen je Lauf ein leeres `XDG_CONFIG_HOME`). Die Pins in
`inkstitch/requirements.txt` bleiben: Ink/Stitchs eigene `requirements.txt` ist an 3.3.0 dieselbe
wie an `d59c9ab`. **Gemessen** an acht Motiven (sechs Kundenlogos, Atzensport aus dem PDF, Hofbräu),
je Lauf mit leerem Cache und derselben Vorlage: die DST ist mit 3.3.0 **Byte für Byte dieselbe**,
die Laufzeit liegt innerhalb von 2 %. Die elf Commits dazwischen sind Umbauten (Satin-Spalte in ein
Paket zerlegt, Typannotationen), Simulator, Bau und Übersetzungen; `fill_stitch.py`,
`tatami_fill.py`, `stitch_plan.py`, `output.py`, `jump_to_trim.py`, `update.py` und die
Erweiterungen `auto_satin`, `fill_to_satin`, `output` sind in beiden Ständen byte-gleich. Rauchtest
gegen 3.3.0: 12 von 12. Ohne festen Hash-Seed streut auch 3.3.0 (Hofbräu 9.424, 9.426, 9.427
Stiche) — der Seed bleibt nötig.

**Schritt 5 — Nacharbeit-Datei (30.09.2026, Spec §13.4).** Jeder Lauf von `pnpm inkstitch` schreibt
nach der DST das Ink/Stitch-Dokument, aus dem sie entstand, als `<name>.nacharbeit.svg`: Seite in
mm, eine Ebene je Farbblock in Stichfolge („01 Gold #D1B35A"), Objektnamen „Art · Farbe ·
Quell-Kennung", und als letzte, ausgeblendete Ebene „Prüfstellen" (Kreis und Kurztext je
Schwachstelle). Dazu `.pes` (Ink/Stitchs `output --format=pes` auf genau diese Datei),
`.farbfolge.txt` (Nadelbelegung je Stopp, „dieselbe Nadel wie Stopp N?" bis RGB-Abstand 8) und
`.nacharbeit.png` (Garnfarben, Prüfstellen nummeriert). Die Ebenen verschieben kein Objekt und
teilen keine Gruppe. Gebaut in `packages/engine/src/inkstitch/` (`nacharbeit.ts`, `dst-spots.ts`,
ein kleiner XML-Baum `xml.ts`, ohne DOM) und `tools/nacharbeit.mjs`; `--tatami` schreibt keine.

Nachweis: die Nacharbeit-Datei unverändert durch `output` gibt die DST des Laufs Byte für Byte
(kalter Cache, Rauchtest in `test/inkstitch.smoke.test.ts`):

| Motiv                           | Ebenen | Prüfstellen | md5 der DST                      |
| ------------------------------- | -----: | ----------: | -------------------------------- |
| Hofbräu 110 mm (`cap`)          |      2 |         137 | ce94d248824854f14881f4c3d120ed33 |
| STUTTGART 80 mm (`--ohne-tor`)  |      6 |          90 | 7211c05e5198bb756b3befc17fa0ecb0 |
| Atzensport 80 mm (`--ohne-tor`) |      8 |         239 | 67e50d78d5970a35d9db01a971d67db1 |
| Köln 90 mm (`--ohne-tor`)       |     15 |         350 | 127513bed3490f3d5d3f1d7418fa3e46 |

Beim Bauen gefunden: (1) Der Importer rechnete den Ursprung der `viewBox` nicht ein; eine PDF-SVG
wie Hofbräu lag rund 76 mm neben der Seite. Jetzt eingerechnet: Hofbräu 9.425 → 9.420 Stiche,
Atzensport aus dem PDF 12.450 → 12.411 (die Zahlen im Probestick-Stand oben sind damit überholt),
Logos mit Ursprung 0 unverändert. (2) Ein Dokument ohne `inkstitch_svg_version` hält Ink/Stitch für
ein Altdokument und aktualisiert es beim Öffnen (`lib/update.py`, u. a. `running_stitch_length_mm`
1,5 statt 2,5 an Nicht-Satin-Elementen); kopflos antwortet unser Platzhalter still, in Inkscape
käme ein Dialog. Die Nacharbeit-Datei ist deshalb schon aktualisiert und trägt Version 4.
(3) Die Prüfstellen-Ebene braucht neben `display:none` auch `inkstitch:ignore_object`: eingeblendet
und ohne das Attribut würden ihre Kreise gestickt (DST 30.077 statt 30.005 Byte). (4) Das Feld
`LA:` im DST-Kopf kommt aus `sodipodi:docname`; die Datei trägt keinen Namen. Kosten: ein
`output`-Lauf mehr, 18–22 s bei 9.000 bis 21.000 Stichen. Noch nicht geprüft: das Öffnen in Inkscape
am Arbeitsplatz (kein Dialog, Ebenenfolge, Simulator) — hier gibt es kein Inkscape.

**Schritt 4 — Mindestgröße als Tor (30.09. und 01.10.2026, Spec §5.2).** Vor jedem Lauf von
`pnpm inkstitch` sucht das Tor die kleinste Größe ab der bestellten, ab der jeder Satinstrich der
bestellten Größe seine Grenze hält, und erzeugt dort (ganze Millimeter, proportional vergrößert;
nicht für `--tatami`). Die erste Zeile der Ausgabe sagt es — „Bestellt 80 mm · stickbar ab 91 mm ·
erzeugt in 91 mm — bestimmt von z13-bebebe-012 (0.88 mm bei 80 mm, Grenze 1.0 mm)" —, die Dateien
tragen `-91mm` im Namen. `--ohne-tor` stickt für Vergleichsmessungen in der bestellten Größe
(`_unter-mindestgroesse` im Namen, mit Warnung); `pnpm mindestgroesse` meldet dasselbe, ohne zu
erzeugen. Gebaut in `min-size.ts`, `min-size-search.ts`, `hoop.ts` (Engine, ohne IO) und
`tools/tor.mjs`; `analyze()` hat dafür die Option `allowTurned`.

Die Fassung vom 30.09. teilte in jeder geprüften Größe neu ein: jede Haarlinie einer Vektorisierung
wird beim Vergrößern irgendwann schmaler Satin, die Bereiche reihten sich, und die Mindestgröße lief
davon (STUTTGART 80 mm → 252 mm, Köln 90 mm → 567 mm, Eislingen 200 mm → 1.266 mm). **Entscheidungen
des Nutzers vom 01.10.2026** (Spec `f6bfef9`, `b9069e4`; umgesetzt in `0535d4e`, `3ff24a7`, `c78dd2c`):

1. **Die bestellte Größe legt fest, welche Striche zählen** — ob eine Form Satin ist und ob sie eine
   Schattenlinie ist, wird einmal in der bestellten Größe bestimmt (`orderedStrokes`) und über die
   Kennung in jeder Größe wiedergefunden. Gesucht wird über die Größe bis alle halten, dann in ganzen
   Millimetern nach unten; die Mindestgröße ist der Anfang der Reihe haltender Größen, die bis zur
   gefundenen reicht (Zeile „Nach unten", etwa Köln: „143 → 134 mm halten ebenfalls, bei 133 mm liegt
   1 Strich unter der Grenze").
2. **Tragende Satinstriche ab 1,0 mm** statt 1,3 mm; Schattenlinien weiter 0,7 mm.
3. **Prüfstellen statt Größentreiber**: eine Form, die erst in der erzeugten Größe Satin wird und dort
   unter ihrer Grenze liegt (b), und jeder tragende Satinstrich von 1,0 bis unter 1,3 mm (a) — in der
   Nacharbeit-Datei, im Abschnitt „Feinheit" und in `pnpm mindestgroesse`.
4. **Rahmen**: passt das Motiv in der erzeugten Größe nicht in den Rahmen des Presets (`cap`
   130 × 60 mm, sonst 360 × 200 mm), auch gedreht nicht, wird trotzdem erzeugt; eine Zeile gleich
   unter der ersten warnt. `analyze()` am Laufende nimmt denselben Rahmen.

Gemessen am 01.10.2026, Stand `c78dd2c` (Preset `pique`, Hofbräu `cap`; Suche 0,4 bis 14 s):

| Motiv                        | bestellt → erzeugt | bestimmender Strich (Farbe, Breite, Fläche)                     | (a) knapp | (b) erst Satin | Rahmen               |
| ---------------------------- | -----------------: | --------------------------------------------------------------- | --------: | -------------: | -------------------- |
| STUTTGART 80 mm              |         80 → 91 mm | z13-bebebe-012, Randlinie ums Schriftband (0,88 mm, 69,4 mm²)   |         2 |              2 | passt                |
| STUTTGART 250 mm             |       250 → 250 mm | —                                                               |         0 |              0 | 250 × 233 — Warnung  |
| Berufsfeuerwehr Köln 90 mm   |        90 → 134 mm | z25-2e3192-001, Zwickel im Äskulapstab (0,72 mm, 1,6 mm²)       |        13 |             24 | passt                |
| Eislingen Print 200 mm       |       200 → 286 mm | z01-000000-101, Bruchstück der Pinselschrift (0,71 mm, 6,8 mm²) |         6 |              3 | 286 × 444 — Warnung  |
| Atzensport Hofbräu 80 mm     |        80 → 108 mm | z09-2e2c2c-002, Innenohr des Pferds (0,78 mm, 2,1 mm²)          |        12 |             10 | passt                |
| Atzensport Hofbräu 200 mm    |       200 → 222 mm | z06-f4f3ef-004, Lichtreflex in der Nüster (0,92 mm, 3,8 mm²)    |        13 |              1 | 222 × 315 — Warnung  |
| Stuttgarter Hofbräu (`cap`)  |   110,8 → 110,8 mm | —                                                               |         0 |              0 | passt (Cap 130 × 60) |
| Atzensport aus dem PDF 80 mm |        80 → 107 mm | path34, Innenohr des Pferds (0,78 mm, 2,1 mm²)                  |         6 |              7 | passt                |

Nachweis: das Tor ändert nur die Größe, nicht die Vorlage. Die DST von STUTTGART in 91 mm ist
byte-gleich mit einem Lauf mit `--breite 91` vom Stand davor, die von Hofbräu byte-gleich mit dem
Stand davor; die Nacharbeit-Datei durch `output` gibt in beiden Fällen dieselbe DST. Tests 1.137 →
1.204, Rauchtest grün, `kennzahlen` STUTTGART 80 mm weiter 11.192 Stiche. Grenzen in
`docs/backlog.md`: bestimmend sind fast überall Zierteile (nur bei Eislingen Schrift), und dass jede
größere Größe hält, ist gemessen (bis 40 mm darüber), nicht bewiesen.

**Probestick in Mindestgröße (01.10.2026).** Vier Dateien mit Tor, Nacharbeit-Datei und Ink/Stitch
3.3.0 (Stand `0795dbb`; DST, PES, Nacharbeit-Datei, Farbfolge und Vorschau an den Nutzer, nicht im
Repo). Der Probestick soll zeigen, ob die Grenze von 1,0 mm für tragende Satinstriche hält:

| Datei                       | bestellt → erzeugt |            Größe | Stiche | Farbblöcke | Trims/1000 | Dichtespitze | Nadelhäufung | Prüfstellen |
| --------------------------- | -----------------: | ---------------: | -----: | ---------: | ---------: | -----------: | -----------: | ----------: |
| STUTTGART                   |         80 → 91 mm |   90,0 × 84,6 mm | 16.639 |          6 |       2,94 |           26 |            7 |          79 |
| Berufsfeuerwehr Köln        |        90 → 134 mm | 134,2 × 134,2 mm | 34.823 |         15 |       3,45 |           25 |            8 |         331 |
| Atzensport Hofbräu (PDF)    |        80 → 107 mm | 107,0 × 151,4 mm | 19.283 |          8 |       6,85 |           21 |            6 |         208 |
| Stuttgarter Hofbräu (`cap`) |   110,8 → 110,8 mm |  110,4 × 51,0 mm |  9.420 |          2 |       9,77 |           20 |            6 |         137 |

**Mindeststichlänge 0,4 mm in der Vorlage (02.10.2026, Spec §11).** Die Vorlage schreibt
`<inkstitch:min_stitch_len_mm>0.4</inkstitch:min_stitch_len_mm>` in ihr `<metadata>`
(`INKSTITCH_MIN_STITCH_MM`, `template.ts`). Bis dahin galt Ink/Stitchs Standard von 0,1 mm.
Ink/Stitch lässt jeden Stich bis zu dieser Länge weg, Verriegelungen nie. Die Nacharbeit-Datei trägt
den Wert weiter: Der Rauchtest zeigt dieselbe DST Byte für Byte.

Anlass war der Vergleich mit den Profi-Dateien: Stiche unter 0,4 mm hatten wir 2,8–6,0 %, die
Puncher-Dateien Christliche Gemeindereitschule 0,5 % und Elektrotechnik Yer 0,6 %. Neu gerechnet mit
denselben vier Probestick-Logos (Stand `a62dfca` gegen den neuen Stand):

| Datei                       |          Stiche | unter 0,3 mm | unter 0,4 mm | Dichtespitze | Nadelhäufung |
| --------------------------- | --------------: | -----------: | -----------: | -----------: | -----------: |
| STUTTGART 91 mm             | 16.639 → 16.157 |  2,1 → 0,1 % |  3,8 → 1,2 % |      26 → 23 |        7 → 6 |
| Berufsfeuerwehr Köln 134 mm | 34.823 → 33.797 |  2,4 → 0,2 % |  5,0 → 2,3 % |      25 → 23 |        8 → 7 |
| Atzensport (PDF) 107 mm     | 19.283 → 18.755 |  2,0 → 0,4 % |  4,5 → 2,3 % |      21 → 18 |        6 → 7 |
| Stuttgarter Hofbräu (`cap`) |   9.420 → 9.253 |  1,1 → 0,5 % |  2,8 → 1,6 % |      20 → 19 |        6 → 6 |

Kurzstiche zählt das Werkzeug als Zug zwischen zwei Stichen; ein Zug nach Sprung, Schnitt oder
Farbwechsel zählt nicht. Die Mindestgrößen bleiben gleich, die Stichzahl sinkt um 1,8–2,9 %.

- **Was wegfällt.** Bei STUTTGART fallen 482 Stiche weg:
  - 8 Reihenwechsel im Tatami, an Kanten quer zu den Reihen;
  - 110 im Zickzack von Satin oder Unterlage;
  - 364, die nicht weiter zugeordnet sind.
- **Der Rest unter 0,4 mm** ist an der Testscheibe des Rauchtests vollständig Rundung: Stiche knapp
  über 0,4 mm werden auf dem 0,1-mm-Raster der DST zu 0,36 mm. Für die Logos ist er nicht
  aufgeschlüsselt.
- **Offen** (Spec §11): Bei einem Reihenabstand unter 0,4 mm fielen die Reihenwechsel an den meisten
  Kanten weg. Das muss vor einer Dichteänderung gemessen werden.
- **Tests:** 1.204 → 1.205, dazu der Rauchtest 14 → 15, alle grün. Neu ist eine Tatami-Scheibe von
  30 mm: Mit 0,1 mm hat sie 10 Stiche unter 0,3 mm, mit der Vorlage keinen.

**Textur der Vorlage (02.10.2026, Spec §5.3).** `importShapes` erkennt Textur und bereinigt sie vor
der Einteilung, dem Tor und der Vorlage (`import/texture.ts`, Warnung `IMPORT_TEXTURE_CLEANED`, Abschnitt
„Textur" in `pnpm inkstitch` und `pnpm mindestgroesse`). Beleg sind mindestens 3 Körner in einer Form.
Dann werden Löcher unter 0,5 mm² gefüllt, Splitter bis 4 mm² im Abstand bis 0,4 mm angeschlossen und
Staub unter 0,05 mm² verworfen. Die Schwellen gelten in der bestellten Größe, das Tor gibt sie
an jede geprüfte Größe weiter. Anlass war der Profi-Vergleich der Christlichen Gemeindereitschule:
Die Abriebschrift ließ die Breitenmessung 0,4–0,6 mm zu schmal lesen.

Die sechs Logos ohne Textur bleiben unverändert: Vorlage, DST und PES sind in allen zwölf Läufen
(mit Tor und `--ohne-tor`) Byte für Byte gleich. Die beiden Logos mit Textur:

|                                          | Christliche 90,2 mm (Jersey) |  Eislingen 200 mm |
| ---------------------------------------- | ---------------------------: | ----------------: |
| Mindestgröße (Tor)                       |                 138 → 126 mm |      286 → 274 mm |
| Objekte Satin / Lauf / Tatami (ohne Tor) |     57/239/2.224 → 63/219/18 | 59/63/14 → 60/9/6 |
| Rückfälle auf Tatami (mit Tor)           |                      527 → 5 |            14 → 6 |
| Schriftstiche (ohne Tor; Puncher 6.546)  |                5.552 → 6.418 |                 – |
| Fadenschnitte (ohne Tor)                 |                    111 → 111 |          146 → 97 |
| Prüfstellen (ohne Tor)                   |                  3.264 → 528 |       1.310 → 720 |

Die vier Buchstaben, die vorher auf Laufstich fielen, sind jetzt Satin. Das Tor der Christlichen
bestimmt nun ein braunes Pferdeteil von 0,77 mm, also die Zeichnung. Tests 1.205 → 1.255. Grenzen
stehen in `docs/backlog.md`.

**Formen nach Breite teilen (02.10.2026, Spec §7.8.7).** Eine breite Form mit schmalem Band wird in
der Vorlage geteilt (`inkstitch/split.ts`, `planSplit` in `template.ts`, Block „Geteilt" in
`pnpm inkstitch`; `--ohne-teilung` für Vergleiche). Der breite Teil bleibt Tatami, wird zuerst
gestickt und liegt 0,8 mm unter dem Bandende; das Band wird Satin. Ein Band ist:

- mindestens 1,3 mm breit und 15 Breiten lang;
- gleichmäßig breit (Breite am 20. Perzentil durch die am 80. mindestens 0,7);
- an einem Ende an einem Kopf von mindestens 20 mm² angehängt, in den eine Scheibe von zwei
  Bandbreiten passt;
- und seine Säulen müssen halten.

Anlass war der Profi-Vergleich Elektrotechnik Yer: Stecker und Kabel sind ein Pfad, er wurde bisher
als ein Tatami gestickt.

Gemessen auf dem Stand mit Texturbereinigung, acht Logos, je mit Tor und `--ohne-tor`: 14 von 16
DSTs sind Byte für Byte gleich. Nur Elektrotechnik Yer ändert sich:

- Stiche 2.886 → 2.757, Fadenschnitte 14 → 17.
- Das Kabel ist jetzt ein Satinband von 113 × 2,43 mm: 980 → 823 Stiche, der Puncher hat 788.
- Der Stecker bleibt Tatami: 162 Stiche gegen 443 beim Puncher, der ihn als breiten Satin stickt.

Tests 1.255 → 1.299. Rauchtest auf dem Branch der Teilung 16/16.
