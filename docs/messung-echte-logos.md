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
| Berufsfeuerwehr Köln 90 mm |  316 → **209** | 30.437 → **24.919** |   358 → **266** |   87 → **68** | 13 → 9 | 37 → **28** | keine      |
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

### Nachtrag: die beiden offenen Punkte sind entschieden _(21.09.2026)_

- **Die Ausdehnungs-Schranke bleibt bei 4.** Sie ist ab jetzt ausdrücklich Rückfall, nicht
  Entscheider: das Budget trennt gesund von gewunden (97–99 % gegen 155–188 %), die
  Ausdehnung fängt nur den Fall ab, in dem eine gewickelte Rail zufällig die Konturlänge
  trifft. Eingetragen in §5.1.
- **Die Schriftlücke zwischen 5,7 und 9 mm bleibt offen, absichtlich.** `excalibur_KOR`
  passt rechnerisch, stilistisch aber nicht — eine Rustikale zwischen zwei Serifenlosen.
  `caffeine_tiny` wird stattdessen bis 9 mm hochskaliert; das macht die Spalten breiter,
  nicht dünner, und heißt deshalb nur noch `info TEXT_ABOVE_FONT_MAX` statt einer Warnung.
  Nach unten, unter `min_scale`, bleibt es `warn`. §9.4.

## Nach dem Reisewege-Fix (21.09.2026)

Befund aus dem Atzensport-Logo: der Fill stickte gerade Strecken **außerhalb** der Form.
`insideTravel` antwortet mit der Geraden, wenn es keinen Weg innen findet, und der Fill hat
sie als Laufstich genommen (§8.7.1). Die Ursache lag eine Ebene tiefer: der
Sichtbarkeitsgraph fand um ein **rundes Loch** keinen Weg, weil seine Knoten auf der Kontur
saßen und sich dort gegenseitig nicht sehen (§5).

Gemessen über alle Fill-Objekte, nach dem kompletten Lauf (also nach `postProcess`):

| Motiv                      | längste Strecke außerhalb | Segmente außerhalb | größter Überstand |
| -------------------------- | ------------------------: | -----------------: | ----------------: |
| STUTTGART 80 mm            |      55,0 mm → **3,2 mm** |       783 → **70** |       **0,27 mm** |
| STUTTGART 250 mm           |     149,0 mm → **2,6 mm** |     4182 → **121** |       **0,30 mm** |
| Berufsfeuerwehr Köln 90 mm |      88,0 mm → **3,3 mm** |      497 → **100** |       **0,37 mm** |
| Eislingen Print 200 mm     |     130,7 mm → **2,3 mm** |      1486 → **46** |       **0,21 mm** |
| Atzensport 80 mm           |      20,0 mm → **2,3 mm** |       107 → **29** |       **0,29 mm** |
| Atzensport 200 mm          |      70,0 mm → **2,5 mm** |       418 → **41** |       **0,33 mm** |

**Der Überstand ist die ehrliche Zahl.** Was bleibt, sind keine Strecken über blanken Stoff,
sondern Ecken enger Wege, die `postProcess` aufschneidet: die Mindeststichlänge von 0,6 mm
(§11) entfernt den Knickpunkt, und die Sehne schneidet die Kurve. 0,21 bis 0,37 mm liegen
unter dem Zugausgleich von 0,2 mm je Seite. Vor `postProcess` bleibt an STUTTGART 80 mm und
Atzensport 80 mm je **ein** Segment von 19.000 übrig (1,9 bzw. 1,6 mm).

### Was der Fix kostet

| Motiv                      |          Stiche |     Sprünge | Trims | Dichte max |
| -------------------------- | --------------: | ----------: | ----: | ---------: |
| STUTTGART 80 mm            | 17.966 → 18.258 |   135 → 170 |    38 |    24 → 33 |
| STUTTGART 250 mm           | 85.935 → 83.267 |   384 → 673 |    64 |    23 → 34 |
| Berufsfeuerwehr Köln 90 mm | 24.919 → 24.550 |   266 → 281 |    68 |    28 → 32 |
| Eislingen Print 200 mm     | 31.368 → 29.334 | 1008 → 1188 |   109 |         22 |
| Atzensport 80 mm           | 14.878 → 14.021 |   281 → 303 |   106 |         27 |
| Atzensport 200 mm          | 49.985 → 48.213 |   518 → 545 |   132 |    22 → 22 |

**Die Trims ändern sich nicht** — ein Sprung im Fill schneidet den Faden nicht, er bleibt in
demselben Block. Die Sprünge steigen dort, wo eine Form nach dem Knockdown in getrennte
Teile zerfällt: dorthin gibt es keinen Weg, und der Sprung ist die richtige Antwort.

**Die Dichte steigt**, weil die Wege jetzt im Material liegen statt daneben. Zwei Schritte
haben das begrenzt (§8.5): Teilstücke werden nach Nähe abgearbeitet statt in der Reihenfolge
des Verschneidens, und beim Sektionswechsel gewinnt ein Einstieg, der direkt erreichbar ist.
Ohne sie lag STUTTGART 80 mm bei **44**; mit ihnen bei 33 (33 Stiche aus einer einzigen
Füllfläche in einem Quadratmillimeter).

**Das reicht noch nicht.** STUTTGART 80 mm meldet `DENSITY_HIGH` jetzt als **Fehler** —
nicht wegen der Spitze (33 liegt unter 40), sondern wegen der Fläche: **2,4 % der Zellen**
liegen über 18 Stiche/mm², erlaubt sind 2 % (§11). Vorher war das Motiv fehlerfrei. Die
dichten Zellen gehören zu vier Fünfteln zu einem einzigen Objekt, der großen grauen
Schildfläche, deren Wege sich in den schmalen Stegen zwischen den ausgeschnittenen
Buchstaben sammeln — dort muss jeder Weg durch.

Die Abwägung gehört auf den Tisch: vorher 55 mm Faden quer über blanken Stoff, jetzt 2,4 %
dichte Zellen. Das erste ist auf dem Stoff sichtbar, das zweite eine Warnschwelle. Die
Möglichkeiten (Wege streuen, Sektionen in Bändern füllen, Reisestichlänge von 2,0 auf 3,0)
stehen im Backlog — die letzte wäre eine Spec-Änderung.

**Laufzeit.** Der Wächter prüft jedes Stichsegment eines Fills. STUTTGART 250 mm braucht
damit 20 s statt 6 s. Für den Batch-Lauf hinnehmbar, für den Editor nicht — im Backlog.

## Reisestichlänge 3,0 und Trim-Regel für Sprünge (21.09.2026)

Zwei Entscheidungen nach der Messung oben: die Reise im Fill sticht mit **3,0 mm** statt 2,0
(§8.5 — unter dem Deckstich ist sie unsichtbar), und ein Sprung im Fill folgt derselben
Trim-Regel wie eine Verbindung zwischen zwei Objekten (§10.2). Ein Sprung ohne Trim lässt
den Faden oben liegen; das war die eigentliche Lücke, nicht die Erleichterung.

| Motiv                      |          Stiche |   Sprünge |     Trims | Dichte max |
| -------------------------- | --------------: | --------: | --------: | ---------: |
| STUTTGART 80 mm            | 18.258 → 17.661 |       170 |   38 → 56 |    33 → 32 |
| STUTTGART 250 mm           | 83.267 → 81.646 |       673 |  64 → 207 |    34 → 32 |
| Berufsfeuerwehr Köln 90 mm | 24.550 → 23.671 | 281 → 280 |   68 → 73 |         32 |
| Eislingen Print 200 mm     | 29.334 → 30.116 |      1188 | 109 → 170 |         22 |
| Atzensport 80 mm           | 14.021 → 13.803 |       303 | 106 → 121 |         27 |
| Atzensport 200 mm          | 48.213 → 46.889 |       545 | 132 → 143 |    22 → 18 |

**Die Prüfung, auf die es ankommt** — längster Sprung ohne Trim über unbedecktem Stoff,
gemessen ab dem letzten Stich, also über Ketten aus mehreren Sprüngen hinweg:

| Motiv             | vorher  |  jetzt | davon über 5 mm |
| ----------------- | ------- | -----: | --------------: |
| STUTTGART 80 mm   | 12,0 mm | 4,9 mm |           **0** |
| STUTTGART 250 mm  | 12,1 mm | 4,3 mm |           **0** |
| Köln 90 mm        | 11,9 mm | 5,0 mm |           **0** |
| Eislingen 200 mm  | 12,0 mm | 4,8 mm |           **0** |
| Atzensport 80 mm  | 12,0 mm | 5,0 mm |           **0** |
| Atzensport 200 mm | 12,0 mm | 4,8 mm |           **0** |

Drei Dinge mussten dafür stimmen, jedes einzeln gemessen:

1. **Ketten statt Einzelsprünge.** Ein Verbindungssprung und ein Sprung im nächsten Objekt
   stehen ohne Stich dazwischen — 10,3 mm Faden an STUTTGART 250 mm, den keine Einzelprüfung
   sieht.
2. **Die Anker an einem Sprung.** Die Mindeststichlänge (§11) räumte den Stich vor oder nach
   einem Sprung weg; damit wuchs der Sprung oder zwei verschmolzen. An Eislingen kamen so
   8 von 11 Fällen zustande.
3. **Die Stufe gehört ans Ende.** Verriegelung und Nachbearbeitung verschieben die Enden
   eines Sprungs; aus 5,0 mm wurden 5,3 mm. Erst nach ihnen ist die Strecke die, die die
   Maschine fährt.

**Die Trims steigen deutlich** — STUTTGART 250 mm von 64 auf 207, Eislingen von 109 auf 170.
Das ist der Preis dafür, dass kein Faden mehr über blanken Stoff läuft, und war so gewollt.
Für die Laufzeit heißt das drei Sekunden je Trim (§11).

**Nebenbei erledigt:** STUTTGART 80 mm meldet `DENSITY_HIGH` wieder nur als **Warnung**.
67 von 3.754 Zellen liegen über 18/mm², also 1,8 % — unter den 2 % aus §11. Die längere
Reisestichlänge hat gereicht; die Wege müssen nicht gestreut werden.

## EPCwin-Presets und prozentualer Zugausgleich (21.09.2026)

Referenz ZSK EPCwin: Produktionswerte sind 0,4–0,6 mm Reihenabstand und 4–5 mm Stichlänge
(§14). Unsere Presets lagen darunter — bis 0,35 mm Abstand und überall 3,0 mm Stichlänge.
Korrigiert auf 0,38–0,45 je nach Ware und 4,0 mm Stichlänge; der Satin-Zugausgleich rechnet
jetzt in Prozent der Spaltenbreite (12 %, Deckel 0,4 mm je Seite) statt in festen
Millimetern (§7.2).

| Motiv                      |          Stiche |       Δ | Dichte max |
| -------------------------- | --------------: | ------: | ---------: |
| STUTTGART 80 mm            | 17.661 → 16.084 |  −8,9 % |    32 → 33 |
| STUTTGART 250 mm           | 81.646 → 75.058 |  −8,1 % |    32 → 34 |
| Berufsfeuerwehr Köln 90 mm | 23.671 → 21.863 |  −7,6 % |    32 → 27 |
| Eislingen Print 200 mm     | 30.116 → 26.499 | −12,0 % |    22 → 18 |
| Atzensport 80 mm           | 13.803 → 12.871 |  −6,8 % |    27 → 29 |
| Atzensport 200 mm          | 46.889 → 43.331 |  −7,6 % |    17 → 17 |

Rund 3.600 Stiche weniger allein bei Eislingen, gut 6.500 bei STUTTGART 250 mm — das sind
sechs bis acht Minuten Maschinenzeit je Stück, bei gleicher Deckung. Die Trim- und
Sprungzahlen bleiben, und die Null aus der Prüfung oben hält: **kein Sprung ohne Trim über
unbedecktem Stoff über 5 mm**, auf keinem der sechs Läufe.

**Die Dichte steigt dort, wo breite Satinspalten liegen** (STUTTGART), und fällt dort, wo
Flächen dominieren (Köln, Eislingen). Grund ist der prozentuale Zugausgleich: eine Spalte
über 3,33 mm Breite bekommt jetzt den Deckel von 0,4 mm je Seite statt der früheren 0,2 —
sie überlappt ihre Nachbarn stärker. Schmale Spalten bekommen umgekehrt weniger: 0,7 mm
Breite ergibt 0,08 mm statt 0,20.

`DENSITY_HIGH` bleibt auf allen sechs Läufen eine **Warnung**. STUTTGART 80 mm liegt bei
67 von 3.518 Zellen über 18/mm², also 1,9 % — dicht an den 2 % aus §11, aber darunter. Die
einzigen Fehler sind `OBJECT_OUTSIDE_HOOP` bei den drei großen Motiven, also die
Rahmengröße.

## Untergrenze für den Zugausgleich (21.09.2026)

Der prozentuale Zugausgleich ohne Boden ließ die Buchstaben hohl stehen: die schmalsten
Spalten des STUTTGART-Logos sind 0,43–0,46 mm breit, 12 % davon sind 0,06 mm statt der
früheren 0,20. Unter der Mindeststichlänge von 0,6 mm (§11) räumt `postProcess` jeden
zweiten Stich weg — `z13-bebebe-020-0` fiel von 289 auf 156 Stiche, ohne Mindeststichlänge
wären es 300 gewesen. Gefunden am gerenderten Bild, nicht an einem Test.

Mit `pullCompMinMm` = 0,2 (dem früheren Festwert) und 15 % für Jersey und Fleece:

| Motiv                      |          Stiche | Trims | Dichte max | Sprung ohne Trim > 5 mm |
| -------------------------- | --------------: | ----: | ---------: | ----------------------: |
| STUTTGART 80 mm            | 16.084 → 17.314 |    58 |         32 |                   **0** |
| STUTTGART 250 mm           | 75.058 → 75.097 |   208 |         34 |                   **0** |
| Berufsfeuerwehr Köln 90 mm | 21.863 → 22.518 |    73 |         32 |                   **0** |
| Eislingen Print 200 mm     | 26.499 → 28.345 |   169 |         22 |                   **0** |
| Atzensport 80 mm           | 12.871 → 13.476 |   121 |         29 |                   **0** |
| Atzensport 200 mm          | 43.331 → 43.496 |   144 |         18 |                   **0** |

Die Stiche kommen dort zurück, wo sie fehlten — in den schmalen Spalten. Die Zusage aus
§10.2 hält unverändert.

**Einordnung gegen das Archiv** (`docs/neuplanung-punchprogramm.md`): STUTTGART 80 mm liegt
mit 17.314 Stichen auf 80,3 × 74,9 mm bei 2,88 Stichen/mm². Der Median der Brustmotive im
Archiv ist 1,30, das 90. Perzentil 2,37. Der Abstand ist damit größer als vor dieser
Korrektur — die Korrektur war trotzdem richtig, weil die Buchstaben sonst nicht lesbar
sind. Woher der Überschuss kommt und in welcher Reihenfolge er abgetragen wird, steht in
der Neuplanung, §1.3.

## Nadelhäufung: die Kennzahl steht (26.09.2026)

Anlass war der Satz „die Programme sind alle nicht stickbar". Durchgemessen wurden unsere
sechs Läufe und vier Produktionsdateien aus dem TEXMA-Archiv mit derselben Prüfung. Was im
Feld der Puncher liegt: Stichlängen (Median 1,70–1,98 mm gegen 1,00–3,30 im Archiv), der
Anteil unter 1 mm (21–26 % gegen 2–50 %) und die Sprunglängen. Was **nicht** im Feld liegt,
ist die Häufung der Einstiche auf Nadeldurchmesser-Raster — deshalb steht sie jetzt als
eigene Kennzahl in `analyze()` (§11, `needleClusters`).

| Datei                      | max je 0,2 mm² | Zellen ≥ 6 | max je mm² | Meldung   |
| -------------------------- | -------------: | ---------: | ---------: | --------- |
| STUTTGART 80 mm            |         **22** |     **82** |         36 | **error** |
| STUTTGART 250 mm           |         **13** |    **221** |         34 | **error** |
| Berufsfeuerwehr Köln 90 mm |         **13** |     **36** |         29 | **error** |
| Atzensport Hofbräu 200 mm  |         **10** |     **37** |         18 | **error** |
| Eislingen Print 200 mm     |              7 |          1 |         18 | warn      |
| Atzensport Hofbräu 80 mm   |              6 |          1 |         20 | warn      |
| Archiv: Willi Lutz Brust   |              5 |          0 |         15 | —         |
| Archiv: Stadt Herrenberg   |              4 |          0 |         13 | —         |
| Archiv: VVS Rücken         |              7 |          1 |         11 | warn      |
| Archiv: Willi Wolf Brust   |              8 |          8 |         31 | warn      |

Die Archivdateien bleiben durchweg unter der Fehlerschwelle, und zwar mit Abstand: die
schlechteste gestickte Datei hat 8 Einstiche in der schlimmsten Zelle, unsere schlechteste 22. Die Schwellen (warn ab 6, error ab 12 oder mehr als 20 Zellen ab 6) sind genau an
dieser Verteilung gesetzt, nicht aus einem Handbuch.

**Der Befund ist härter als erwartet.** Der Plan rechnete damit, dass nur STUTTGART 80 mm
den Fehler auslöst. Es sind **vier von sechs** — und STUTTGART 250 mm hat mit 221 betroffenen
Zellen die breiteste Häufung, obwohl ihr Spitzenwert niedriger liegt. Die Häufung ist also
kein Einzelfehler in einem Motiv, sondern ein Verfahrensproblem: sie wächst mit der Fläche.

Verursacher ist bekannt und unverändert: die Reisewege im Fill sammeln sich in den schmalen
Stegen zwischen ausgeschnittenen Formen (§8.7.1). Die drei Kandidaten für das Abstellen —
Wege streuen, Wege vermeiden (Bänder-Wegeplanung), Unterlage nach Regel — stehen in
`docs/neuplanung-punchprogramm.md` §4.1. Jeder wird einzeln gemessen, mit allen Kennzahlen
vorher/nachher; die Zielmarke ist der schlechteste Archivwert: unter 8 Einstiche je Zelle
und unter 10 Zellen ab 6.

Die Dichte je mm² bleibt daneben stehen und misst weiter das Aussehen. Sie hätte den Befund
nicht geliefert: Atzensport 200 mm liegt mit 18/mm² im grünen Bereich und hat trotzdem 37
Zellen, in denen die Nadel sechsmal ins selbe Loch geht.

## Schritt 2a: Reisewege streuen (26.09.2026)

Ursache der Häufung, punktgenau gemessen: von 1.024 Einstichen in den heißen Zellen von
STUTTGART 80 mm lagen **977 auf exakt derselben Koordinate** — 18-mal derselbe Punkt, alle
aus einem einzigen Fill (`z01-bebebe-001#0`, die graue Schildfläche), an weit auseinander
liegenden Stellen der Stichfolge. Das sind die Ecken des Sichtbarkeitsgraphen, über den
`insideTravel` die Reisewege führt: jeder Weg durch dieselbe Engstelle bekommt dieselbe Ecke,
und eine Ecke ist ein Einstich.

Gegenmaßnahme in §8.7.2: durchlaufender Stichtakt und ein Versatz der erzwungenen Ecken auf
der äußeren Winkelhalbierenden, stetig aus der gelaufenen Weglänge.

| Motiv                     | Stiche vorher → nachher | max je 0,2 mm² |   Zellen ≥ 6 | max je mm² |
| ------------------------- | ----------------------: | -------------: | -----------: | ---------: |
| STUTTGART 80 mm           |         14.778 → 14.916 |    22 → **13** |  82 → **14** |    36 → 38 |
| STUTTGART 250 mm          |         74.980 → 75.125 |    13 → **10** | 221 → **22** |    34 → 30 |
| Berufsfeuerwehr Köln 90   |         20.273 → 20.386 |     13 → **8** |  36 → **13** |    29 → 28 |
| Eislingen Print 200 mm    |         23.296 → 23.386 |          7 → 7 |        1 → 1 |    18 → 18 |
| Atzensport Hofbräu 80 mm  |         11.529 → 11.569 |      6 → **5** |    1 → **0** |    20 → 20 |
| Atzensport Hofbräu 200 mm |         42.664 → 42.664 |     10 → **6** |   37 → **3** |    18 → 18 |

Von vier Fehlern sind zwei geblieben (STUTTGART 80 und 250 mm), zwei Motive sind auf
Warnung gefallen, Atzensport 80 mm meldet nichts mehr. Die Stichzahl steigt um 0,1 bis
0,9 %. **Die Dichte von STUTTGART 80 mm steigt von 36 auf 38 Stiche/mm²** — der versetzte
Weg legt seine Stiche dichter an den Rand des Stegs. Beide Werte bleiben in derselben
Kategorie (Warnung), aber es ist eine Verschlechterung und steht hier, damit sie nicht
untergeht.

**Was übrig bleibt, ist kein Versatzproblem mehr.** In der schlimmsten Zelle von STUTTGART
80 mm liegen jetzt 13 Einstiche auf 13 **verschiedenen** Punkten, alle innerhalb von 0,2 mm:
der Steg ist so eng, dass der Versatz auf seinen Mindestwert 0,15 mm zurückfällt. Der Weg
weiter führt über die **Zahl der Durchgänge** — 13 Reisewege durch eine Engstelle sind das
Verfahren, nicht die Geometrie. Das ist Kandidat 2 aus dem Plan (Bänder statt Greedy in der
Sektionsreihenfolge).

## Schritt 2b: keine Konturunterlage auf Splittern (26.09.2026)

Der Rest der Häufung kam nicht vom Deckstich und nicht von der Gitterunterlage, sondern von
der **Konturunterlage**. Gemessen durch Abschalten einzelner Phasen an STUTTGART 80 mm:

| Variante             | Stiche | Dichte max | Nadel max | Zellen ≥ 6 |
| -------------------- | -----: | ---------: | --------: | ---------: |
| alles an             | 14.916 |         38 |        13 |         14 |
| ohne Gitterunterlage | 13.121 |         32 |        14 |         10 |
| ohne jede Unterlage  | 10.365 |         26 |     **5** |      **0** |

Die Konturunterlage der grauen Schildfläche allein ergab **50 Ringe** und **15 Einstiche in
einer Zelle**: der Knockdown zerschneidet die Fläche in Stege, und die um 0,4 mm eingerückte
Kontur eines Stegs ist ein Band, dessen beide Kanten dieselbe Nadelspur sind. 54 der 661 mm²
dieser Fläche liegen in Bändern, die ein 0,3-mm-Öffnen nicht überstehen.

Regel dagegen (§8.6): die eingerückte Kontur wird geöffnet, was schmaler als 0,8 mm ist,
bekommt keine Unterlage.

| Motiv                     | Stiche vorher → nachher | max je 0,2 mm² | Zellen ≥ 6 | max je mm² |
| ------------------------- | ----------------------: | -------------: | ---------: | ---------: |
| STUTTGART 80 mm           |     14.916 → **13.294** |     13 → **7** | 14 → **2** |    38 → 31 |
| STUTTGART 250 mm          |     75.125 → **71.200** |     10 → **7** | 22 → **7** |    30 → 22 |
| Berufsfeuerwehr Köln 90   |     20.386 → **19.114** |      8 → **7** | 13 → **9** |    28 → 26 |
| Eislingen Print 200 mm    |     23.386 → **22.648** |          7 → 7 |      1 → 1 |    18 → 18 |
| Atzensport Hofbräu 80 mm  |     11.569 → **11.030** |          5 → 5 |      0 → 0 |    20 → 19 |
| Atzensport Hofbräu 200 mm |     42.664 → **42.255** |          6 → 6 |      3 → 3 |    18 → 18 |

**Damit meldet kein Motiv mehr einen Fehler.** Die schlimmste Zelle hat 7 Einstiche (Archiv:
bis 8), die Zahl der Zellen ab 6 liegt zwischen 0 und 9 (Archiv: 0 bis 8). Die Zielmarke des
Plans — unter 8 Einstiche und unter 10 Zellen — ist bei allen sechs erreicht.

Es ist die erste Änderung dieser Sitzung, die **alle** Kennzahlen zugleich verbessert:
Nadelhäufung, Dichte und Stichzahl gehen gemeinsam zurück (−11 % Stiche bei STUTTGART 80 mm).
Der Grund ist, dass hier nichts umverteilt, sondern etwas weggelassen wird, das nie hätte
gestickt werden dürfen.

## Schritt 3: die zwei Stichlängen nachgemessen (26.09.2026)

Der Plan sah vor, beide am 21.09. gesetzten Werte zurückzunehmen — Reisestichlänge 3,0 → 2,0
und Fill-Stichlänge 4,0 → 3,2 —, weil das Archiv einen Laufstich von höchstens 2,0 mm und
eine Fill-Stichlänge mit p90 3,5 zeigt. Gemessen an drei Motiven, jede Änderung einzeln:

| Variante                    | STUTTGART 80: Stiche / Dichte / Nadel |               Köln 90 |    Atzensport 200 |
| --------------------------- | ------------------------------------: | --------------------: | ----------------: |
| heute (Reise 3,0, Fill 4,0) |                     13.294 / 31 / 7/2 |     19.114 / 26 / 7/9 | 42.255 / 18 / 6/3 |
| Reise 2,0                   |                     13.738 / 28 / 7/2 |     19.631 / 25 / 7/8 | 43.406 / 18 / 6/3 |
| Reise 2,0 + Fill 3,2        |                     14.271 / 30 / 7/2 | 20.614 / 24 / **9**/8 | 46.238 / 18 / 6/3 |

**Reisestichlänge 2,0 übernommen.** Kostet 2,7 bis 3,3 % Stiche und senkt die Dichtespitze
von STUTTGART 80 mm von 31 auf 28. Die Begründung vom 21.09., 3,0 setze weniger Einstiche in
einen Steg, hat sich als falsch erwiesen: die Einstiche kamen von den Graphknoten und der
Konturunterlage, nicht von der Stichlänge.

**Fill-Stichlänge bleibt bei 4,0.** Sie auf 3,2 zu senken kostet weitere 4 bis 6 % Stiche und
verschlechtert zwei Kennzahlen: die Dichtespitze von STUTTGART 80 mm steigt wieder auf 30,
und Köln geht von 7 auf **9** Einstiche je Zelle — über das Maximum des Archivs. Der einzige
Gewinn wäre ein p90 der Stichlänge von 3,20 statt 4,00. Der Wert 4,0 steht in §14 auf der
ZSK-EPCwin-Referenz (Produktionswerte 4–5 mm); das Archiv-p90 von 3,5 ist ein Mittel über
zehn Jahre und mehrere Programme. Gegen eine Messung, die zwei Kennzahlen verschlechtert,
reicht das nicht. **Offen für den Probestick** — am Stoff sieht man, ob 4,0 mm im Fill zu
lang liegt.

Stand aller sechs Läufe nach Schritt 3: Nadelhäufung 5 bis 7 Einstiche je Zelle, 0 bis 8
Zellen ab 6 — das Archiv liegt bei 4 bis 8 und 0 bis 8. **Kein Motiv meldet einen Fehler.**

## Kurzstiche am Einstichabstand (26.09.2026)

§7.5 neu gefasst: Auslöser ist der Abstand zum letzten stehengebliebenen Einstich derselben
Rail (< 0,25 mm), Versatz 15 % der Spaltenbreite — statt Krümmungsradius < 1 mm und jedem
zweiten Innenstich auf 70 %. Herkunft der Werte und Verfahren:
`docs/verfahren-aus-inkstitch.md`.

| Motiv                     | Einstiche < 0,25 mm auf derselben Rail |  Dichte max | Zellen > 18 | Nadel max/Zellen |
| ------------------------- | -------------------------------------: | ----------: | ----------: | ---------------: |
| STUTTGART 80 mm           |          736 (5,4 %) → **420 (3,1 %)** |     28 → 28 | 14 → **10** |        7/2 → 7/2 |
| Berufsfeuerwehr Köln 90   |          948 (5,0 %) → **783 (4,1 %)** |     25 → 25 |       7 → 7 |        7/8 → 7/8 |
| Eislingen Print 200 mm    |      1.613 (7,5 %) → **1.343 (6,2 %)** | 18 → **23** |   0 → **3** |    7/1 → **6**/2 |
| Atzensport Hofbräu 200 mm |        1.057 (2,5 %) → **678 (1,6 %)** | 18 → **26** |   0 → **1** |    6/3 → 6/**2** |

**Das Ziel ist erreicht**: die Häufung auf der Rail geht um 17 bis 43 % zurück. Die
Nadelhäufung auf 0,2-mm-Raster bleibt gleich oder sinkt.

**Der Preis steht daneben und wird nicht kleingeredet**: bei zwei Motiven steigt die
Dichtespitze von 18 auf 26 bzw. 23 Stiche/mm². Betroffen sind **1 von 18.522** und **3 von
11.157** Zellen — 0,01 und 0,03 %. Der Grund ist der erwartete: die Einstiche wandern von der
Kante ins Innere der Spalte, und wo mehrere eingezogene Punkte zusammentreffen, steht eine
einzelne heiße Zelle. Die Fehlerschwelle aus §11 liegt bei 2 % der Zellen oder einer Zelle
über 40; beide Motive bleiben Warnung. Bei STUTTGART sinkt die Zahl der Zellen über 18 sogar
von 14 auf 10.

## Füllung als Graph: gemessen und nicht übernommen (26.09.2026)

Der Umbau aus `docs/verfahren-aus-inkstitch.md` §2: statt Reihen zu Sektionen zu bündeln und
greedy anzusteuern, ein Graph aus Reihen und Konturstücken, in einem Eulerpfad abgelaufen
(`packages/engine/src/fill-graph.ts`, 15 Tests). An `fillRegion` verdrahtet und gegen den
Sektionsweg gemessen:

| Motiv                     |              Stiche |       Sprünge |         Trims | Zellen > 18 |         Nadel |          Zeit |
| ------------------------- | ------------------: | ------------: | ------------: | ----------: | ------------: | ------------: |
| STUTTGART 80 mm           |     13.725 → 13.877 | 175 → **162** |   63 → **58** |  10 → **8** | 7/2 → **5/0** |   1,5 → 2,1 s |
| STUTTGART 250 mm          | 73.107 → **72.574** | 482 → **457** |      97 → 102 |  13 → **8** | 6/4 → **8/5** | 17,4 → 21,3 s |
| Berufsfeuerwehr Köln 90   |     19.602 → 19.740 | 388 → **379** | 121 → **120** |   7 → **8** | 7/8 → **7/6** |   4,1 → 4,8 s |
| Eislingen Print 200 mm    | 22.969 → **22.843** | 972 → **949** | 186 → **180** |       3 → 3 |     6/2 → 6/3 |   1,1 → 1,6 s |
| Atzensport Hofbräu 80 mm  |     11.331 → 11.433 | 348 → **335** |     123 → 125 |       0 → 0 |     5/0 → 6/2 |   0,9 → 1,2 s |
| Atzensport Hofbräu 200 mm | 43.380 → **42.428** | 720 → **683** | 163 → **147** |       1 → 1 |     6/2 → 6/2 |   2,4 → 3,9 s |

**Die Sprünge gehen überall zurück**, die Trims meist, die Stichzahl bleibt im Rauschen
(±2 %). Dagegen steht: die **Nadelhäufung steigt bei drei von sechs Läufen**, und die
**Rechenzeit um 27 bis 63 %** — STUTTGART 250 mm von 17,4 auf 21,3 Sekunden.

Das Abbruchkriterium des Plans („wird die Nadelhäufung höher als heute, bleibt `sections`")
greift damit. **`fillRegion` bleibt beim Sektionsweg**, der Graph bleibt als geprüftes Modul
liegen.

**Warum der Gewinn ausbleibt**: Der Graph regelt die Reihenfolge, nicht den Weg. Zwischen zwei
Reihen sucht weiterhin der Sichtbarkeitsgraph (§8.7.1), und genau dort entsteht die Häufung.
Ink/Stitch hat dafür einen **zweiten** Graphen — ein Gitter im Inneren der Fläche, dessen
Kanten teurer werden, je näher sie der Kontur kommen. Ohne den ist der Umbau ein Tausch:
weniger Sprünge gegen mehr Einstiche auf einem Fleck.

**Was nicht funktioniert**, ebenfalls gemessen: die Konturstücke des Graphen selbst als
Laufstich zu sticken. Jede zweite ist konstruktionsbedingt doppelt, und eine doppelte Bahn
liegt exakt auf ihrer eigenen Spur — Eislingen ging von Dichte 23 auf **205** Stiche/mm² und
von 6 auf **78** Einstiche je 0,2-mm-Zelle.
