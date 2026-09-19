# Messung an vier echten Kundenlogos

Stand: 19.09.2026. Gemessen an den vier bereinigten SVGs aus `Testmotive_TEXMA_Stitch.zip`
(STUTTGART 80 mm und 250 mm, Berufsfeuerwehr Köln 90 mm, Eislingen Print 200 mm).
Preset `pique`, Standard-Maschinenprofil.

Die Dateien liegen **nicht im Repo**: es sind Kundenlogos mit fremden Wort-/Bildmarken.
Ob sie als Testdaten eingecheckt werden, ist eine Entscheidung von TEXMA, nicht von der
Engine. Alles unten ist deshalb Messwert, kein Test.

## Ergebnis

| Motiv                      | Reihenfolge |  Stiche | Farbw. | Trims | Sprünge | Größe            | Dichte max | Rechenzeit |
| -------------------------- | ----------- | ------: | -----: | ----: | ------: | ---------------- | ---------: | ---------: |
| STUTTGART 80 mm            | design      |  18.173 |     12 |    35 |      92 | 79,9 × 74,3 mm   |     24/mm² |     0,17 s |
| STUTTGART 80 mm            | auto        |  18.174 |  **1** |    35 |      85 | 79,9 × 74,3 mm   |     24/mm² |     0,17 s |
| STUTTGART 250 mm           | design      | 134.735 |     12 |    45 |     255 | 249,9 × 232,8 mm |     27/mm² |     0,67 s |
| STUTTGART 250 mm           | auto        | 134.736 |  **1** |    45 |     259 | 249,9 × 232,8 mm |     27/mm² |     0,67 s |
| Berufsfeuerwehr Köln 90 mm | design      |  26.728 |     21 |    71 |     202 | 90,0 × 89,8 mm   |     19/mm² |     1,52 s |
| Berufsfeuerwehr Köln 90 mm | auto        |  26.653 |  **5** |    59 |     169 | 90,0 × 89,8 mm   |     21/mm² |     1,39 s |
| Eislingen Print 200 mm     | design      |  48.027 |     11 |   107 |     314 | 200,0 × 310,0 mm |     25/mm² |     5,79 s |
| Eislingen Print 200 mm     | auto        |  47.970 |  **5** |    97 |     265 | 200,0 × 310,0 mm |     25/mm² |     5,69 s |

Zwei Läufe hintereinander liefern byte-gleiche Stichfolgen (SHA-1 über alle Blöcke) —
Regel 3 hält auch auf dieser Größe.

## Befund 1: `autoOrder` ist die halbe Miete

Die Objektreihenfolge des Designs stickt Farbe für Farbe so, wie die Ebenen im SVG liegen:
zwölf Farbwechsel für zwei Farben. `order: "auto"` (§10.1) fasst sie zu einem zusammen.
Bei Köln 21 → 5, bei Eislingen 11 → 5. Die Stichzahl bleibt praktisch gleich, die Sprünge
gehen leicht zurück. Für die Maschine ist das der Unterschied zwischen zwölf Fadenwechseln
und einem.

**`autoOrder` gehört damit in den Standardweg**, nicht in eine Option. Das ist eine
Spec-Frage zu §10.1, wo „auto" als Vorschlag beschrieben ist.

## Befund 2: übereinanderliegende Flächen — `DENSITY_HIGH` bei allen vier

Alle vier Motive melden `DENSITY_HIGH` als **error**: 19 bis 27 Stiche/mm². Die Ursache ist
nicht die Engine, sondern die Vorlage. Es sind Druckdaten: beim STUTTGART-Logo liegt das
schwarze Wappenschild als volle Fläche unter dem Pferd, in Köln eine schwarze Scheibe von
90 mm unter dem ganzen Motiv. Der Drucker deckt das ab — die Stickmaschine stickt beides,
erst den Untergrund, dann das Motiv darauf. Die Fläche bekommt doppelte Deckung, und bei
0,25 mm Reihenabstand doppelt gestickt heißt: geht so nicht durch den Stoff.

Richtig wäre, die überdeckten Teile vor dem Füllen abzuziehen (`difference` liegt in
`packages/geometry`, der Schnitt selbst wäre klein). Das ist aber **eine Änderung an der
Pipeline aus §4** — eine Stufe, die Objekte gegeneinander verrechnet, gibt es dort nicht,
und §8 kennt keinen Knockdown. Nicht geraten, sondern als **Frage an die Spec** notiert:
soll `expand()` überdeckte Flächen ausschneiden, und mit welcher Regel (nur bei voller
Überdeckung, nur innerhalb derselben Farbe, mit welchem Überstand)?

Bis dahin ist die Warnung die richtige Antwort: sie sagt laut, was los ist, und repariert
nichts still (Regel 8).

## Befund 3: Rechenzeit — Regel 9 hält auf echter Geometrie noch nicht

Regel 9 verlangt einen kompletten Lauf unter 300 ms. Erreicht wird das nur vom kleinsten
Motiv (0,17 s). Köln braucht 1,4 s, Eislingen 5,7 s.

Vor dieser Sitzung war es kein Faktor 5, sondern unbrauchbar: der erste Versuch, Köln zu
planen, lief **fünf Minuten bei 100 % CPU ohne ein einziges fertiges Objekt** und wurde
abgebrochen. Ursache war `insideTravel` (§5): für jeden Reiseweg innerhalb einer Fläche
wurde der komplette Sichtbarkeitsgraph neu gebaut, und jeder Sichtbarkeitstest lief über
alle Kanten der Form. Bei der schwarzen Detailebene von Köln — 2.266 Kanten, 41 Löcher,
3.945 mm² — sind das Milliarden von Operationen je Objekt.

Drei Änderungen, alle nur Buchführung; der gefundene Weg ist derselbe:

1. **Graph je Form einmal bauen und behalten.** Er hängt nicht von Start und Ziel ab.
2. **Nur einspringende Ecken werden Knoten.** Ein kürzester Weg im Polygon knickt
   nirgends sonst ab. Bei Köln: 2.266 Kanten → 1.127 vereinfachte Punkte → **713 Knoten**.
3. **Kantenindex** (`packages/geometry/src/edge-index.ts`): ein gleichmäßiges Gitter über
   die Kanten beantwortet „welche Kante könnte diese Strecke schneiden" und „liegt dieser
   Punkt innen", ohne jedes Mal alle Kanten anzufassen. Dazu ein Abbruch beim ersten
   echten Schnittpunkt — für fast jedes Knotenpaar ist das die Antwort.

Gemessen am teuersten Objekt (`z03-010101-001`, 12.714 Stiche):

| Stand                              |                     Zeit |
| ---------------------------------- | -----------------------: |
| vorher                             | abgebrochen nach > 300 s |
| Graph-Cache + einspringende Ecken  |                 6.101 ms |
| \+ Kantenindex und Schnitt-Abbruch |             **1.141 ms** |

Der Rest steckt laut CPU-Profil weiterhin in den Sichtbarkeitstests: 264 Reisewege × 2 ×
713 Knoten = 376.000 Tests, dazu 254.000 für den Graphen selbst. Der nächste Schritt wäre,
die Zahl der Tests zu senken (A\* statt Dijkstra, Zielsichtbarkeit erst beim Entnehmen
prüfen), nicht die einzelnen schneller zu machen. Das ist Arbeit für eine eigene Sitzung
und steht im Backlog.

`pnpm bench` misst weiterhin unter 300 ms — es misst aber Formen mit einem Dutzend Kanten.
Die Zusage aus Regel 9 gilt erst, wenn sie an einem echten Logo gemessen ist.

## Befund 4: Kleinkram, der der Vorlage gehört

- **`FILL_TINY` in Massen**: Köln 64, Eislingen 71 Warnungen. Flächen von 0,3 bis 4 mm² —
  Antialiasing-Reste und Haarlinien aus der Vektorisierung. Sie kosten Trims und Sprünge
  und sind auf Stoff nicht zu sehen. Gehört in die Vorbereitung der Vorlage, nicht in die
  Engine.
- **Eislingen ist 310 mm hoch**, nicht 200. Der Dateiname nennt die Breite. `200 × 310 mm`
  passt in keinen üblichen Rahmen — `OBJECT_OUTSIDE_HOOP` meldet es korrekt.
- **STUTTGART 250 mm** ebenso: 250 × 233 mm gegen einen Rahmen von 360 × 200 mm.
- Die Zeile `Laufzeit` im Demo-Werkzeug ist die geschätzte **Maschinenlaufzeit** in
  Sekunden (Köln: 2.470 s ≈ 41 min). In Minuten wäre sie lesbarer.
