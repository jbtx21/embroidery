# Probesticks

Alles vor dem ersten Probestick ist Rechnung. Hier steht, was die Engine vorhatte, was auf
dem Stoff herauskam und was daraus folgte. Ein Abschnitt je Stick, neueste oben. Die Zahlen
unter „Soll" stammen aus dem Lauf, der die Datei erzeugt hat, nicht aus der Erinnerung.

---

## Probestick 1 — STUTTGART 80 mm auf Piqué _(21.09.2026)_

Erste echte Abnahme der Engine.

|                         |                               |
| ----------------------- | ----------------------------- |
| Datei                   | `out/STUTTGART_Logo_80mm.dst` |
| Preset                  | Piqué (Standard)              |
| Stoff / Vlies           | Piqué, Standardvlies          |
| Maschine / Nadel / Garn | _offen_                       |
| Gestickt am / von       | _offen_                       |

### Was die Engine vorhat (Soll)

| Kennzahl                               |                                 Wert |
| -------------------------------------- | -----------------------------------: |
| Stiche                                 |                               11.192 |
| Sprünge / Trims / Farbwechsel          |                         127 / 47 / 4 |
| Größe                                  |                       79,3 × 74,2 mm |
| Dichte, Spitze                         | 22 Stiche/mm² (Warnung, kein Fehler) |
| Nadelhäufung                           | 6 Einstiche je 0,2 mm, 2 Zellen ab 6 |
| Maschinenzeit (800 U/min, rechnerisch) |                             17,1 min |
| Objekte                                | 59 — 12 Satin, 18 Fill, 29 Laufstich |

_(28.09.2026 neu erzeugt — jede frühere Datei ist auszutauschen: am Stich-Player fiel auf,
dass die Schrift nicht mehr zu erkennen war. Ursache, gemessen an diesem Motiv: Auto-Satin
deckte die Buchstabenkerne nur zu 37–52 % mit Garn, der Rest blieb blanker Stoff — die
vorhandenen Schranken (`railBudgetRatio`, `worstRailExtent`) prüfen nur die Rail-LÄNGE, nicht
die Deckung. Neu: `columnCoverage` ≥ `COLUMN_COVERAGE_MIN` = 0,85 (§5.1); darunter wird die
Form ein Fill. Zweitens folgt die Zahl der Durchgänge eines schmalen Randes jetzt der Breite:
ein Durchgang bis `SINGLE_PASS_MAX_MM` = 0,7 mm, sonst drei (Bohnenstich, §7.4) — 0,7 statt
zunächst versuchter 0,6 mm, weil die Breitenmessung dünne Eckringe überschätzt (ein
0,45-mm-Rahmen misst dort bis 0,62 mm).
Von 13.314 über 12.017 (Deckungsprüfung, Commit 3228ecc) auf **11.192 Stiche** (Variante D,
Commits ab65c73/9f5c084); Sprünge 164 → 127, Trims 55 → 47, Dichtespitze 24 → 22. Die
Nadelhäufung steigt dabei bewusst von 5 auf 6 Einstiche je 0,2 mm (2 Zellen ab 6) — der Preis
für die höhere Spaltendeckung, das Archiv liegt bei 4 bis 8. Geprüft und verworfen: die
Zierlinie über kleine Lücken zu schließen — bei dieser Schrift trägt sie Form (Beine des A,
Balken des G, Bein des R) und wäre mitverschwunden.
**Das ist eine Messung, keine Abnahme**: der Nutzer hat alle sechs neu gerechneten Läufe am
Stich-Player geprüft und als „alle unbrauchbar" abgelehnt (28.09.2026) — siehe
`docs/umsetzungsstand.md`. Deckungsmessung, Stickbarkeits-Einordnung und die Zahlen aller
sechs Läufe in `docs/messung-echte-logos.md`.
Zuvor, in Kürze: 27.09.2026 Stichwinkel nach den wenigsten Reihenbrüchen und Reihenfolge über
die echten Enden (13.738 → 13.314 Stiche, Nadelhäufung 7 → 5); 26.09.2026 Nadelhäufung als
Kennzahl, gestreute Reisewege, keine Konturunterlage auf Splittern, Reisestichlänge 2,0
(17.314 → 13.738 Stiche, schlimmste Nadelstelle 22 → 7); 21.09.2026 dreimal nachgezogen
(Reisewege-Fix, Trim-Regel, EPCwin-Presets, prozentualer Zugausgleich) ausgehend von
anfänglich 17.966 Stichen bis 17.314. Alle Zwischenwerte weiterhin in
`docs/messung-echte-logos.md`.)_

Satinbreiten über alle 12 Spalten: min 1,28 mm · 25 % 2,22 mm · **median 2,36 mm** ·
75 % 2,97 mm · **max 4,24 mm**. Zwei Spalten liegen über 4 mm — dieselben zwei wie am 27.09.,
von den Fixes dieses Wochenendes unberührt —, keine über 6 mm, keine im Mittel unter 1 mm;
fünf verengen sich örtlich darunter, die schmalste Sprosse auf 0,78 mm. Am 27.09. standen
hier noch 43 Spalten (min 1,21 mm), am 21.09. 74 Spalten von 0,23 bis 9,81 mm.

Die Deckungsprüfung aus §5.1 (neu, 27.09.) schickt Formen, deren Spalten die Fläche nicht zu
mindestens 85 % tragen, als Fill weiter (12 × `AUTOSATIN_MIXED`) — dazu 6 Flächen, die von
vornherein zu breit für einen Versuch als Satin sind; zusammen die 18 Fill-Objekte. Die
Mindestbreite aus §7.4 (seit 25.09.) sticht eine einzelne zu schmale Spalte weiterhin als
Laufstich statt als Satin, jetzt mit der Zahl der Durchgänge nach Breite gestaffelt (Variante
D, §7.4): 26 einfach bis 0,7 mm, 3 als Bohnenstich darüber — zusammen die 29
Laufstich-Objekte.

Preset Piqué, die Werte, an denen im Zweifel gedreht wird:

| Parameter                                |                                 Wert |
| ---------------------------------------- | -----------------------------------: |
| `fillRowSpacingMm`                       |                                 0,40 |
| `fillStitchLengthMm` / `fillStaggerRows` |                              4,0 / 4 |
| `satinSpacingMm`                         |                                 0,38 |
| `pullCompMm` (Fill) / `pushCompMm`       |                          0,20 / 0,10 |
| Satin-Zugausgleich                       |   12 % der Breite, höchstens 0,40 mm |
| `underlapMm`                             |                                 0,20 |
| Fill-Unterlage                           |  Kontur + einfach, 2,0 mm, Inset 0,4 |
| Satin-Unterlage                          | Kontur + Zickzack, 3,0 mm, Inset 0,4 |

Die 38 Meldungen des Laufs (12 Hinweise und eine Warnung beim Import, 25 beim Rechnen,
kein Fehler), nach Code:

| Code                      | Anzahl | Wo hinsehen                                                          |
| ------------------------- | -----: | -------------------------------------------------------------------- |
| `AUTOSATIN_MIXED`         |     12 | Formen, deren Spalten die Fläche nicht zu 85 % decken (Import, §5.1) |
| `TRAVEL_OUTSIDE`          |      6 | Fill springt statt zu sticken (§8.7.1), bis 22,4 mm                  |
| `SELF_INTERSECTING_RAILS` |      5 | Ecken und enge Bögen                                                 |
| `SATIN_TOO_NARROW`        |      5 | örtlich unter 1 mm, schmalste Sprosse 0,78 mm                        |
| `FILL_TINY`               |      4 | Reste bis 2,5 mm², drei davon unter 0,1 mm²                          |
| `SHAPE_SPLIT`             |      2 | Form zerfiel beim Ausschneiden, bis zu 4 Teile                       |
| `IMPORT_DROPPED_TINY`     |      1 | zwei Flächen unter 1 mm² weggelassen, größte 0,45 mm² (Import)       |
| `EDGE_GAP_RISK`           |      1 | Fill-Kante an Satin-Rail, einzige Stelle 0,29 mm                     |
| `DENSITY_HIGH`            |      1 | 3 von 3523 Zellen über 18/mm², Spitze 22 (§11)                       |
| `NEEDLE_CLUSTER`          |      1 | 2 Zellen ab 6 Einstichen je 0,2 mm, Spitze 6 (§11)                   |

### Die Punkte für die Auswertung

Je Punkt: was man ansieht, was es bedeutet, welcher Knopf.

**1. Zugausgleich — liegt die Satinkontur der Buchstaben auf dem Fill, oder gibt es
Blitzer?**
Ein Blitzer ist Stoff, der zwischen Fill-Kante und Satinkontur durchscheint. Die Engine
gibt dem Fill 0,20 mm Unterlappung unter die Kontur (`underlapMm`) und weitet den Satin um
0,20 mm je Seite (`pullCompMm`). Nur noch eine Stelle hat sie selbst als knapp gemeldet
(`EDGE_GAP_RISK`, 0,29 mm Abstand) — dort zuerst hinsehen. Am 27.09. waren es 28: die 12
Formen, die jetzt statt vieler einzelner Spalten als eine zusammenhängende Fill-Fläche
laufen, haben entsprechend weniger innere Kanten gegen Nachbarobjekte. Blitzer →
`underlapMm` auf 0,3 und/oder `pullCompMm` auf 0,25. Satin steht über und die Kontur wirkt
fett → `pullCompMm` runter, nicht die Unterlappung.

- Befund: _offen_

**2. Unterlage — versinkt der Fill im Piqué, wellt der Stoff?**
Piqué hat Struktur; versinkt der Deckstich, ist die Unterlage zu dünn (jetzt: Kontur +
einfache Unterlage mit 2,0 mm Abstand). Wellt der Stoff, ist sie zu dicht oder der
Reihenabstand zu eng (0,40 mm). Beides zusammen heißt: Unterlage verdichten **und**
Reihenabstand lockern, nicht nur eines.

- Befund: _offen_

**3. Satinbreite an den Bannerenden (4 mm) — sauber oder Schlaufen?**
Schlaufen entstehen, wenn die Spalte breiter ist, als der Stich hält. Zwei Spalten liegen
über 4 mm, die breiteste unverändert bei **4,24 mm** — dieselben zwei wie am 27.09.
**Richtigstellung:** die alte Begründung dafür („entspannter, weil die breiten Formen
inzwischen als Fill laufen") war die Antwort auf den Sprung von 9,81 mm (21.09.) auf
4,24 mm (25.09., Breitenschnitt `maxWidthMm`) und bleibt dafür richtig — sie hat aber nichts
mit den beiden Fixes dieses Wochenendes zu tun. Die Deckungsprüfung `columnCoverage` (§5.1)
wirft Keile mit zu wenig Deckung raus, nicht zu breite Spalten; an diesen beiden
Bannerenden ändert sie nichts. Was sich geändert hat, ist die Zahl der übrigen Spalten
insgesamt: von 43 (27.09.) auf 12 — der Rest lief entweder durch die Deckungsprüfung in
Fill oder, als schmaler Rand, in Laufstich (Variante D). §7.4 nennt `maxWidthMm`; greift die
Breite nicht, fehlt entweder die Teilung oder der Grenzwert steht zu hoch.

- Befund: _offen_

**4. Ecken der Buchstaben — sauber gedeckt oder offen?**
Fünf Spalten melden `SELF_INTERSECTING_RAILS` (27.09.: elf); das sind die Stellen, an denen
sich die Rails in einer Ecke kreuzen. Offene Ecken heißen: die Spalte endet vor der Ecke. Zu
dicke Ecken heißen: sie wird doppelt gedeckt.
Der Verdacht aus dem Plan vom 21.09. — Formen, die `autoOrder` auseinanderreißt — bleibt
abgearbeitet: alle Teile einer Form tragen weiterhin eine gemeinsame Folge (`sequence`,
§10.1), in diesem Motiv jetzt 8 Formen mit zwei bis fünf Objekten (27.09.: 13, derselbe
Bereich). Zeigt eine Ecke trotzdem einen Ansatz, liegt es an der Spalte selbst, nicht an der
Reihenfolge.

- Befund: _offen_

**5. Die graue Schildfläche — ein Grat an den Stegen?**
Ihre Reisewege sammeln sich weiterhin in den schmalen Stegen zwischen den ausgeschnittenen
Buchstaben; dort ist die dichteste Stelle des Motivs (22 Stiche/mm², 3 von 3523 Zellen über
18). Anders als am 27.09. ist die Nadelhäufung hier nicht weiter gefallen, sondern leicht
gestiegen: 6 Einstiche je 0,2-mm-Zelle, 2 Zellen erreichen das (27.09.: 5 bzw. keine) — die
schmalen Buchstabenränder laufen jetzt als Laufstich auf derselben Linie, und wo mehrere
zusammentreffen, stapeln sich die Einstiche. Das Archiv-Maximum bleibt 8, hier liegt es
deutlich darunter. Ob das reicht, entscheidet der Stoff: zeigt er einen Grat oder wird
steif, muss der Reihenabstand in den Stegen lockern.

- Befund: _offen_

**6. Fadenreste — 47 Trims statt 55.**
Der Faden wird weiterhin überall dort geschnitten, wo ein Sprung ihn sonst über blanken
Stoff ziehen würde (§10.2). Auf dem Stoff heißt das: keine Verbindungsfäden zwischen den
Teilen. Schneidet die Maschine schlecht, heißt es stattdessen: mehr Reste zum Nacharbeiten.
Beides ansehen und gegeneinander halten.

- Befund: _offen_

### Vergleich mit einer Puncher-Datei

Keine gepunchte Datei desselben Logos im Repo — die Stickvoll-Dateien sind andere Motive
und dürfen ohnehin nicht weitergegeben werden. Sobald eine vorliegt: Stichzahl,
Sprünge, Trims und Farbwechsel gegeneinanderstellen, und zwar **pro Fläche**, weil die
Größe selten gleich ist. Ein Unterschied von ±10 % ist kein Befund; ein Faktor 1,5 ist
einer.

| Kennzahl    | Engine | Puncher |   Δ |
| ----------- | -----: | ------: | --: |
| Stiche      | 11.192 | _offen_ |     |
| Sprünge     |    127 | _offen_ |     |
| Trims       |     47 | _offen_ |     |
| Farbwechsel |      4 | _offen_ |     |

### Ergebnis

_offen — wird nach dem Stick ausgefüllt. Danach entscheidet sich, ob die Presets
nachjustiert werden oder Phase 2 (Editor) beginnt._
