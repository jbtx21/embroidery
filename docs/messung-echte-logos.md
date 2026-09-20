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

## Nachher: die drei Entscheidungen vom 19.09.2026

Reihenabstand auf Industriewerte (§14), `FILL_TOO_NARROW` (§11), Reihenfolge Mitte → außen
in Ringen (§10.1). Dieselben vier Motive, `order: "auto"`:

| Motiv                      | Stiche vorher |            nachher | Sprünge vorher | nachher | Trims vorher | nachher |      Laufzeit |
| -------------------------- | ------------: | -----------------: | -------------: | ------: | -----------: | ------: | ------------: |
| STUTTGART 80 mm            |        18.174 | **14.306** (−21 %) |             85 |      99 |           35 |      34 |   25 → 20 min |
| STUTTGART 250 mm           |       134.736 | **98.076** (−27 %) |            259 |     268 |           45 |      45 | 187 → 136 min |
| Berufsfeuerwehr Köln 90 mm |        26.653 | **21.431** (−20 %) |            169 |     184 |           59 |      65 |   37 → 30 min |
| Eislingen Print 200 mm     |        47.970 | **37.568** (−22 %) |            265 |     334 |           97 |      96 |   67 → 53 min |

Rund ein Fünftel weniger Stiche bei praktisch gleicher Sprung- und Trimzahl. Die
Ringbreite ist der Grund für den letzten Teil: nach reinem Radius sortiert wären es bei
Eislingen **922 Sprünge** statt 334 gewesen.

`FILL_TOO_NARROW` meldet sich sofort: 15 Flächen bei STUTTGART 80 mm, 10 bei Köln, 32 bei
Eislingen — Flächen über 4 mm², die `FILL_TINY` nicht sieht und die trotzdem als Satin oder
Laufstich gehören.

`DENSITY_HIGH` bleibt, wie vorhergesagt: 28/24/19/21 statt 24/27/21/25. Der Reihenabstand
war nie die Ursache, die übereinanderliegenden Flächen der Druckvorlage sind es.

## Nach der zweiten Welle (§6.1, §8.1, §10.1, §11, §14)

Mindeststichlänge 0,6 mm, krümmungsadaptive Schrittweite, Mitte-nach-außen nur noch für
Cap. `order: "auto"`, Preset Piqué:

| Motiv                      |              Stiche |   Sprünge |   Trims |  Dichte max |      Laufzeit |
| -------------------------- | ------------------: | --------: | ------: | ----------: | ------------: |
| STUTTGART 80 mm            | 14.306 → **12.563** |   99 → 90 | 34 → 39 | 28 → **19** |   20 → 17 min |
| STUTTGART 250 mm           | 98.076 → **93.001** | 268 → 251 | 45 → 45 | 22 → **19** | 136 → 129 min |
| Berufsfeuerwehr Köln 90 mm | 21.431 → **19.012** | 184 → 162 | 65 → 61 | 19 → **14** |   30 → 27 min |
| Eislingen Print 200 mm     | 37.568 → **30.484** | 334 → 294 | 96 → 95 | 21 → **15** |   53 → 43 min |

Gegenüber dem Stand von heute früh (vor beiden Wellen) sind das bei Eislingen 47.970 →
30.484 Stiche, also **36 % weniger**, und bei STUTTGART 80 mm 18.174 → 12.563, **31 %
weniger**.

Der auffälligste Einzeleffekt ist die Mindeststichlänge: Köln und Eislingen fallen von
`DENSITY_HIGH` als **Fehler** auf **Warnung** (19 → 14 bzw. 21 → 15 Stiche/mm²). Was da
wegfällt, sind Nadeleinstiche unter 0,6 mm, die den Zähler füllten, ohne zu decken.
STUTTGART bleibt beim Fehler — dort liegen die Flächen wirklich übereinander.

## Nach der dritten Welle (20.09.2026)

Reisewege im Fill (§8.7), Knockdown (§4.1), Import mit Satin-Erkennung, Ausgleich und 45°
(§5.1), `autoOrder` als Standard mit Z-Ordnungs-Bedingung (§10.1), neues Dichtekriterium
(§11). Preset Piqué, Standardweg:

| Motiv                      |        Objekte |              Stiche |    Sprünge |    Trims | Farbw. | Dichte max |
| -------------------------- | -------------: | ------------------: | ---------: | -------: | -----: | ---------: |
| STUTTGART 80 mm            |   46 → **130** | 12.563 → **18.473** |   99 → 190 |  34 → 48 |  1 → 6 |    19 → 32 |
| STUTTGART 250 mm           |    47 → **92** | 93.001 → **87.086** |  251 → 575 | 45 → 143 |  1 → 6 |    19 → 29 |
| Berufsfeuerwehr Köln 90 mm |  117 → **316** | 19.012 → **30.437** |  162 → 358 |  61 → 87 | 5 → 13 |    14 → 37 |
| Eislingen Print 200 mm     | 136 → **2408** | 30.484 → **52.430** | 294 → 1963 | 95 → 156 |  5 → 5 |    15 → 37 |

**Das ist in den Zahlen ein Rückschritt und im Ergebnis keiner** — mit einer Ausnahme, die
unten steht. Was die Zahlen treiben:

- **Der Knockdown kostet Farbwechsel.** Wer später stickt, liegt oben; die Reihenfolge darf
  überdeckende Objekte deshalb nicht mehr vertauschen (§10.1). STUTTGART kommt damit auf 6
  statt 1 Farbwechsel. Ohne die Bedingung schnitt der Knockdown beim ersten Lauf **das
  Pferd aus dem Wappen** — die Farbgruppierung hatte das schwarze Schild hinter das graue
  Pferd geschoben, und der Schnitt tat genau, was ihm gesagt war.
- **Die Unterlappung von 0,8 mm erhöht die Dichte an jeder Naht.** Das ist ihr Zweck: sie
  verhindert Blitzer. Bei STUTTGART sitzt die Spitze dort, wo acht Flächen zusammenstoßen
  und jede ihre 0,8 mm beisteuert.
- **Auto-Satin beim Import erhöht Objektzahl und Sprünge.** Bei Eislingen von 136 auf 2408
  Objekte und von 294 auf 1963 Sprünge. Die Vorlage besteht dort aus über 2000
  Vektorisierungsfragmenten; jedes schmale wird jetzt eine Satinspalte.

**Gegenprobe ohne Auto-Satin** (STUTTGART 80 mm, Schwelle auf 0): 46 Objekte, 13.576
Stiche, Dichte 35. Der Import mit Ausgleich und Knockdown allein liegt also nah am alten
Stand; die Objektzahl kommt vollständig aus der Satin-Erkennung.

### Was unterwegs schiefging und behoben wurde

1. **Das Pferd verschwand.** Siehe oben — `autoOrder` ist jetzt eine topologische
   Sortierung über die Überdeckungen.
2. **92 Stiche in einem Quadratmillimeter.** `railsForBranch` legte für einen Buchstaben
   von 10 × 13 mm Rails von 38 mm Länge. Zwei Schranken prüfen den Vorschlag jetzt, bevor
   er übernommen wird (§5.1). Dichte damit von 98 auf 32.
3. **`EMPTY_OBJECT`: Satin needs two rails.** Eine Rail kann beim Vereinfachen auf einen
   Punkt zusammenfallen. Solche Spalten werden mit Warnung ausgelassen, nicht still.
4. **Der Schub löschte kleine Flächen.** Eine Sichel schmaler als der doppelte Schub
   verschwand ganz. Sie wird jetzt ohne Ausgleich gestickt, mit Warnung.

### Offen

`railsForBranch` ist die eigentliche Baustelle: die Rail wird punktweise als nächster
Nachbar je Seite gelesen, was auf gekrümmten Formen umschlägt. Richtig wäre, die Kontur in
zwei Ketten zwischen den Astenden zu teilen. Bis dahin sind die beiden Schranken aus §5.1
eine Notbremse, und ein Teil der schmalen Formen wird weiterhin als Fill gestickt.

## Nach der vierten Welle (21.09.2026)

Dichtegrenzen gelockert (§11), `railsForBranch` neu (§7.7.1), Flächen unter 1 mm² beim
Import verworfen (§5.1), sechs Schriften im Repo (§9.4). Preset Piqué, Standardweg:

| Motiv                      |        Objekte |              Stiche |         Sprünge |         Trims | Farbw. |  Dichte max | Fehler     |
| -------------------------- | -------------: | ------------------: | --------------: | ------------: | -----: | ----------: | ---------- |
| STUTTGART 80 mm            |   130 → **80** | 18.473 → **17.966** |   190 → **135** |   48 → **38** |      6 | 32 → **24** | keine      |
| STUTTGART 250 mm           |    92 → **72** | 87.086 → **85.935** |   575 → **384** |  143 → **64** |      6 | 29 → **23** | nur Rahmen |
| Berufsfeuerwehr Köln 90 mm |      209 ← 316 | 30.437 → **24.919** |   358 → **266** |   87 → **68** | 13 → 9 | 37 → **28** | keine      |
| Eislingen Print 200 mm     | 2408 → **926** | 52.430 → **31.368** | 1963 → **1008** | 156 → **109** |      5 | 37 → **22** | nur Rahmen |

**Kein `DENSITY_HIGH`-Fehler mehr, auf keinem der vier.** Zwei Ursachen: die gelockerten
Grenzen aus §11 (2 % statt 1 %, Spitze 40 statt 30) und die Spalten selbst — eine
Satin-Spalte, deren Rails auf der Kontur sitzen, deckt ohne die Überlappungen, die der alte
Vorschlag erzeugte.

**STUTTGART 80 mm hat kein `AUTOSATIN_MIXED` mehr.** Vorher 16, jetzt 0; 74 Satin-Spalten
statt 49. Das war die Messlatte für den Umbau von §7.7.1.

**Eislingen fällt von 2408 auf 926 Objekte und von 1963 auf 1008 Sprünge.** Die 52
verworfenen Splitter unter 1 mm² sind nur ein kleiner Teil davon; den Rest macht die
Satin-Erkennung, die jetzt Spalten findet, wo sie vorher aufgab und Flächen füllte.

### Was der Umbau von §7.7.1 gekostet hat

Zwei Anläufe, beide gemessen:

1. **Kontur an den Astenden schneiden** (wie in §7.7.1 beschrieben): Balken 1,00, T 1,07 —
   gut. An den Verzweigungen kippte es aber, weil ein Astende dort keinen Konturpunkt
   „quer" hat: Rails von 4 gegen 25 Punkten, Breiten von 9 mm bei einem 2,4-mm-Buchstaben.
2. **Konturpunkte auf den Ast projizieren** und die Seite an der lokalen Tangente
   bestimmen. Robust auf Kurven, aber zuerst griffen sich an den Verzweigungen mehrere Äste
   dieselben Punkte: Budget 1,86 beim T, 2,25 beim R.
3. **Jeder Konturpunkt gehört genau einem Ast** — dem, dessen Freiraum am besten passt.
   Damit teilen sich die Äste die Kontur, statt sich darum zu streiten, und die Summe der
   Rails kann die Kontur nicht mehr überschreiten. Gemessen: 97 bis 99 % bei gesunden
   Formen, 155 bis 188 % bei den beiden, die noch winden.

Dazu kam ein Befund, der nichts mit den Rails zu tun hatte: die Mittelachse eines Rechtecks
ist ein Dach mit einem Sporn in jede Ecke — **fünf Äste für einen Balken, neun für ein T**.
Jeder Sporn schnitt seine eigenen Rails aus derselben Kontur. Ein Ast, der kürzer ist als
das 1,5-fache seiner größten Weite, ist eine Ecke und keine Spalte; die Ecken bleiben
trotzdem gedeckt, weil die Rails des langen Astes ohnehin um den ganzen Ring laufen.
