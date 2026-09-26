# Was aus den offenen Projekten zu holen ist

Stand: 26.09.2026. Ausgewertet wurden die Dokumentationen der Projekte aus
`docs/open-source-landschaft.md`. Ink/Stitch hat ein eigenes Dokument
(`verfahren-aus-inkstitch.md`); hier steht der Rest.

**Verfahren und Zahlen sind nicht schutzfähig — Code ist es.** Entnommen wird also, was ein
Projekt _tut_ und mit _welchen Werten_, nicht wie es dort geschrieben steht. Quelle und Lizenz
stehen an jeder Zeile, damit später nachvollziehbar bleibt, woher ein Wert kommt.

Jede Zeile trägt einen Status: **übernommen**, **verworfen** (mit Grund) oder **offen**.

---

## 1. Die Messlatte: unser eigenes Archiv

Bevor ein fremder Wert übernommen wird, zählt der eigene Bestand. 192 Produktionsdateien
(TEXMA-Archiv 2016–2025, ausgewertet im Scratchpad — die Dateien selbst bleiben draußen):

| Kennzahl             |  p10 | Median |  p90 |  max |
| -------------------- | ---: | -----: | ---: | ---: |
| Trims je 1000 Stiche | 0,30 |   1,90 | 5,60 | 10,1 |
| Sprünge je 1000      | 3,10 |   7,80 | 18,9 | 67,7 |
| Stiche je mm²        | 0,63 |   1,22 | 2,37 | 4,36 |
| Dichtespitze je mm²  |   11 |     15 |   24 |   44 |

Unsere sechs Läufe am 26.09.2026, gemessen mit `pnpm kennzahlen`:

| Lauf                      | Trims/1000 | Sprünge/1000 | Stiche/mm² | Einordnung                      |
| ------------------------- | ---------: | -----------: | ---------: | ------------------------------- |
| STUTTGART 250 mm          |   **1,33** |     **6,59** |       1,25 | alles bis Median                |
| Atzensport Hofbräu 200 mm |       3,76 |        16,60 |       0,76 | bis p90                         |
| STUTTGART 80 mm           |       4,59 |        12,75 |       2,29 | bis p90, Dichte über p90        |
| Berufsfeuerwehr Köln 90   |       6,17 |        19,79 |       2,41 | Trims, Sprünge, Menge > p90     |
| Eislingen Print 200 mm    |       8,10 |    **42,32** |       0,37 | Trims und Sprünge > p90         |
| Atzensport Hofbräu 80 mm  |  **10,86** |        30,71 |       1,22 | Trims **über allem** (max 10,1) |

**Die kleinen Motive sind die Problemfälle**: 80 bis 90 mm mit vielen Einzelobjekten. Das
größte Motiv, STUTTGART 250 mm, liegt in jeder Kennzahl im Median-Bereich — die Verfahren
stimmen, die Stückelung kleiner Motive nicht.

**Die Stichdichte liegt damit im Feld** — der früher genannte Faktor 2 gegen das Archiv ist
abgearbeitet. Was heraussticht, sind **Sprünge und Trims**. Das ist die Richtung, in die die
Verfahren unten zeigen.

---

## 2. Buttery Stitches (Browser-Digitizer, TypeScript)

Quelle: <https://github.com/suzbeanz/buttery-stitches>. Nächstes Vergleichsstück zu uns:
dieselbe Aufgabe, anderer Weg. Die README nennt Werte und Algorithmen im Klartext.

### Verfahren

| Was                                                                                             | Status                                                                                                                  |
| ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Boustrophedon-Zellzerlegung** für konkave Flächen — Reihen brechen an den kritischen Punkten  | **haben wir**, unter anderem Namen: `sections()` bricht eine Kette ab, wo sich die Konnektivität ändert                 |
| **Winkelwahl „fewest fragments"** — der Stichwinkel, bei dem die Reihen am wenigsten zerbrechen | **offen, nächster Schritt.** Wir setzen 45°, bei Überdeckung −45° (§5.1). Jeder Bruch ist ein Fragment und ein Reiseweg |
| **2-opt** auf der Reihenfolge innerhalb einer Farbe                                             | **offen.** Unser `autoOrder` ist Greedy ohne Verbesserungsrunde                                                         |
| **A\*-Wegesuche mit ~60 mm Umwegerlaubnis**, um Verbindungen unter vorhandene Stiche zu legen   | **offen.** Wir prüfen nur die Gerade und nur gegen Objekte derselben Farbe (`connect.ts`)                               |
| Konturfüllung (konzentrische Ringe im Reihenabstand) als zweite Füllart                         | **offen.** Wir haben nur Tatami                                                                                         |
| Medial axis über Chamfer-(3,4)-Distanztransformation + Zhang–Suen-Thinning                      | **verworfen** — unsere Mittelachse läuft über Delaunay (`medial-axis.ts`) und ist an den Kundenlogos geprüft            |
| Douglas–Peucker (0,15–0,5 mm) + Catmull–Rom zum Glätten                                         | **haben wir** als `simplify` + Bézier-Flattening                                                                        |
| Farbzusammenführung: ΔE < 10, oder ΔE < 30 wenn die kleinere Farbe < 6 % der Fläche ausmacht    | **offen**, interessant für den Import: Eislingen hat 379 Laufstich-Fragmente aus Vektorisierungsresten                  |

### Werte im Vergleich

| Wert                          | Buttery Stitches                                | TEXMA Stitch                            | Status                                                                              |
| ----------------------------- | ----------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------- |
| Tatami-Reihenabstand          | 0,35 mm (0,30–0,50)                             | 0,38–0,45 je Stoff (§14)                | **behalten** — unsere Werte stehen auf der ZSK-EPCwin-Referenz                      |
| Satin-Zickzack                | 0,40 mm                                         | 0,38–0,40                               | deckt sich                                                                          |
| Satin-Split ab                | 6 mm                                            | 7 mm                                    | **offen** — Wilcom nennt 7, Buttery 6; der Probestick entscheidet                   |
| Satin → Laufstich unter       | 1,2 mm (Linienkunst)                            | 0,6 mm                                  | **offen** — wir warnen ab 1,0 und schlagen ab 0,6 Laufstich vor (§7.4)              |
| Zugausgleich                  | 0,2 mm (0–0,6)                                  | 12 % mit Boden 0,2/Deckel 0,4           | **behalten** — prozentual ist genauer, der Boden entspricht ihrem Festwert          |
| Verriegelung                  | 0,8 mm über 3 Stiche                            | 0,3 mm über 3 Stiche                    | **offen** — unsere Verriegelung ist kurz; 0,8 mm hält besser, kostet Sichtbarkeit   |
| Mindeststichlänge             | 0,3 mm                                          | 0,6 mm                                  | **behalten** — begründet in §11, sonst stirbt der Reihenwechsel im Tatami           |
| Edge-run-Inset                | 0,4 mm                                          | 0,4 mm                                  | deckt sich                                                                          |
| Stoffprofile als **Faktoren** | Strick: Reihen ×0,9, Zug ×1,5                   | absolute Werte je Preset                | **offen** — Faktoren wären erweiterbar, unsere Presets sind eine geschlossene Union |
| Linienkunst-Erkennung         | Breite < 2,2 mm, Länge ≥ 5 mm, Elongation ≥ 3,5 | Mittelachse + `SATIN_MIN_COLUMN_MM` 1,2 | **offen** als zweite Meinung für Auto-Satin                                         |
| Ziel Trim-Ökonomie            | ~1 Trim je 1000 Stiche                          | 1,3 – 10,9                              | **Ziel ist der Archiv-Median 1,9**, nicht ihre 1,0                                  |

---

## 3. StitchWright (Browser + CLI, Python)

Quelle: <https://github.com/samuelmcmanus819/stitchwright>. Enger Zuschnitt — Strichzeichnungen,
keine Flächen —, aber die Wegeplanung ist genau unser offener Punkt.

| Was                                                                                 | Status                                                                                     |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Skelett je Farbe, Sporne unter 15 px abschneiden, Kreuzungsbündel zusammenfassen    | **haben wir** in `auto-satin.ts` (Mittelachse, `railsForBranch`)                           |
| **Eulerkreis je Zusammenhangskomponente** — ein durchgehender Weg über alle Striche | **teilweise**: `fill-graph.ts` kann das, ist aber auf Reihenebene gescheitert (Rechenzeit) |
| Satin aus der **lokalen Halbbreite der Distanztransformation**                      | **haben wir** als `columnWidthMm` über Bogenlängen-Stichproben                             |
| Laufstich 2,0 mm, Satin-Schritt 0,4 mm                                              | deckt sich mit §8.5 und §14                                                                |
| Reihenfolge der Läufe per Nearest-Neighbour                                         | wie bei uns — ohne 2-opt                                                                   |

---

## 4. pyembroidery (Formate, MIT)

Quelle: <https://github.com/EmbroidePy/pyembroidery>. Unser DST-Writer prüft bereits
byte-identisch dagegen (§13.2).

| Was                                                                                | Status                                                                            |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Schreibt PES, DST, EXP, JEF, VP3, U01, PEC, XXX, TBF, GCODE; liest 40 Formate      | **Referenz für später** — PES erst, wenn eine Maschine oder ein Kunde es verlangt |
| Verriegelung als Voreinstellung: `CONTINGENCY_TIE_ON/OFF_THREE_SMALL` (drei kurze) | **deckt sich** mit §10.3                                                          |
| DST: maximale Stichlänge 12,1 mm                                                   | **haben wir** (§11)                                                               |
| `explicit_trim`, `sequin_contingency`, `encode` als Schreiboptionen                | **offen** — Sequins brauchen wir nicht, `explicit_trim` beim PES-Writer           |
| **Keine** Stichgenerierung — Füllungen und Satin sind ausdrücklich ausgeschlossen  | bestätigt: den Kern nimmt uns niemand ab                                          |

---

## 5. Was daraus als nächstes gebaut wird

In dieser Reihenfolge, jeder Schritt einzeln gemessen:

1. **Kennzahlen-Werkzeug** — Trims und Sprünge je 1000 Stiche neben den Archivperzentilen.
   Ohne sie misst jeder Schritt am falschen Ziel.
2. **Winkelwahl nach wenigsten Fragmenten** (Buttery Stitches) — greift die Ursache an, nicht
   die Folge.
3. **Reihenfolge auf Zellebene** mit 2-opt statt Greedy auf Luftlinie.
4. **Verbindungen unter vorhandene Stiche**, Umweg erlaubt — Ziel ist der Archiv-Median von
   1,9 Trims je 1000 Stiche.

Alles Weitere bleibt in dieser Datei stehen, bis jemand es braucht.
