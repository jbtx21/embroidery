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

| Kennzahl                               |                                    Wert |
| -------------------------------------- | --------------------------------------: |
| Stiche                                 |                                  13.314 |
| Sprünge / Trims / Farbwechsel          |                            164 / 55 / 6 |
| Größe                                  |                          80,0 × 74,8 mm |
| Dichte, Spitze                         |    24 Stiche/mm² (Warnung, kein Fehler) |
| Nadelhäufung                           | 5 Einstiche je 0,2 mm, keine Zelle ab 6 |
| Maschinenzeit (800 U/min, rechnerisch) |                                20,6 min |
| Objekte                                |     68 — 43 Satin, 23 Fill, 2 Laufstich |

_(27.09.2026 neu erzeugt — jede frühere Datei ist auszutauschen: Stichwinkel nach den
wenigsten Reihenbrüchen statt fest 45° (§8.2) und die Reihenfolge in zwei Durchgängen über
die echten Start- und Endpunkte statt über den Objektanfang (§10.1). Von 13.738 auf 13.314
Stiche, 175 → 164 Sprünge, 66 → 55 Trims, Dichtespitze 28 → 24, Nadelhäufung 7 → 5
Einstiche je 0,2 mm — keine Zelle mehr ab 6, das Archiv liegt bei 4 bis 8. Einordnung gegen
die 192 Archivdateien (`pnpm kennzahlen`): 4,13 Trims und 12,32 Sprünge je 1000 Stiche,
2,22 Stiche/mm² — alles im Feld bis p90, nichts darüber.
Vorher, 26.09.2026: Nadelhäufung als Kennzahl (§11), gestreute Reisewege (§8.7.2), keine
Konturunterlage auf Splittern (§8.6), Reisestichlänge zurück auf 2,0 (§8.5) — von 17.314 auf
13.738 Stiche, Dichtespitze 32 → 28 und die schlimmste Nadelstelle von 22 auf 7 Einstiche je
0,2 mm. Vorher, 21.09.2026, dreimal nachgezogen: nach dem Reisewege-Fix (§8.7.1), nach der
Trim-Regel für Sprünge (§10.2) samt Reisestichlänge 3,0 mm (§8.5), zuletzt nach den
EPCwin-Presets (§14, Stichlänge 4,0) und dem prozentualen Satin-Zugausgleich (§7.2). Am
Anfang standen hier 17.966 Stiche, 135 Sprünge, 38 Trims und Dichte 24 — mit Laufstichen,
die bis zu 55 mm über blanken Stoff liefen, und Sprüngen, die den Faden oben liegen ließen.
Zahlen und Begründung in `docs/messung-echte-logos.md`.)_

Satinbreiten über alle 43 Spalten: min 1,21 mm · 25 % 1,50 mm · **median 2,23 mm** ·
75 % 2,43 mm · **max 4,24 mm**. Zwei Spalten liegen über 4 mm, keine über 6 mm, keine im
Mittel unter 1 mm — sechs verengen sich örtlich darunter, die schmalste Sprosse auf 0,75 mm.
Am 21.09. standen hier 74 Spalten von 0,23 bis 9,81 mm; seit der Mindestbreite aus §7.4
(25.09.) gibt Auto-Satin Formen, in denen es gar keine Spalte findet, als Fill weiter (17 ×
`AUTOSATIN_MIXED`) und stickt eine einzelne zu schmale Spalte als dreifachen Laufstich
(hier zwei Objekte).

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

Die 103 Meldungen des Laufs (17 Hinweise und eine Warnung beim Import, 85 beim Rechnen,
kein Fehler), nach Code:

| Code                      | Anzahl | Wo hinsehen                                         |
| ------------------------- | -----: | --------------------------------------------------- |
| `EDGE_GAP_RISK`           |     28 | Fill-Kante an Satin-Rail, engste Stelle 0,01 mm     |
| `AUTOSATIN_MIXED`         |     17 | Formen ohne Spalte, als Fill gestickt (Import)      |
| `FILL_TOO_NARROW`         |     13 | über 4 mm², Reihen durchweg unter 1 mm              |
| `FILL_TINY`               |     12 | Reste über 1 mm², unter 4 mm²                       |
| `SELF_INTERSECTING_RAILS` |     11 | Ecken und enge Bögen                                |
| `SHAPE_SPLIT`             |      9 | Form zerfiel beim Ausschneiden, bis zu 6 Teile      |
| `SATIN_TOO_NARROW`        |      6 | örtlich unter 1 mm, schmalste Sprosse 0,75 mm       |
| `TRAVEL_OUTSIDE`          |      5 | Fill springt statt zu sticken (§8.7.1), bis 22,4 mm |
| `IMPORT_DROPPED_TINY`     |      1 | zwei Flächen unter 1 mm² weggelassen (Import)       |
| `DENSITY_HIGH`            |      1 | 11 von 3532 Zellen über 18/mm², Spitze 24 (§11)     |

### Die Punkte für die Auswertung

Je Punkt: was man ansieht, was es bedeutet, welcher Knopf.

**1. Zugausgleich — liegt die Satinkontur der Buchstaben auf dem Fill, oder gibt es
Blitzer?**
Ein Blitzer ist Stoff, der zwischen Fill-Kante und Satinkontur durchscheint. Die Engine
gibt dem Fill 0,20 mm Unterlappung unter die Kontur (`underlapMm`) und weitet den Satin um
0,20 mm je Seite (`pullCompMm`). 28 Stellen hat sie selbst als knapp gemeldet
(`EDGE_GAP_RISK`), die engste mit 0,01 mm Abstand — dort zuerst hinsehen. Dass es 28 statt
der vier vom 21.09. sind, liegt an den 17 Formen, die jetzt als Fill statt als Satin laufen:
sie haben Kanten, wo vorher Rails waren. Blitzer → `underlapMm` auf 0,3 und/oder
`pullCompMm` auf 0,25. Satin steht über und die Kontur wirkt fett → `pullCompMm` runter,
nicht die Unterlappung.

- Befund: _offen_

**2. Unterlage — versinkt der Fill im Piqué, wellt der Stoff?**
Piqué hat Struktur; versinkt der Deckstich, ist die Unterlage zu dünn (jetzt: Kontur +
einfache Unterlage mit 2,0 mm Abstand). Wellt der Stoff, ist sie zu dicht oder der
Reihenabstand zu eng (0,40 mm). Beides zusammen heißt: Unterlage verdichten **und**
Reihenabstand lockern, nicht nur eines.

- Befund: _offen_

**3. Satinbreite an den Bannerenden (4 mm) — sauber oder Schlaufen?**
Schlaufen entstehen, wenn die Spalte breiter ist, als der Stich hält. Zwei Spalten liegen
über 4 mm, die breiteste bei **4,24 mm** — deutlich entspannter als die 9,81 mm vom 21.09.,
weil die breiten Formen inzwischen als Fill laufen. §7.4 nennt `maxWidthMm`; greift die
Breite nicht, fehlt entweder die Teilung oder der Grenzwert steht zu hoch.

- Befund: _offen_

**4. Ecken der Buchstaben — sauber gedeckt oder offen?**
Elf Spalten melden `SELF_INTERSECTING_RAILS`; das sind die Stellen, an denen sich die
Rails in einer Ecke kreuzen. Offene Ecken heißen: die Spalte endet vor der Ecke. Zu dicke
Ecken heißen: sie wird doppelt gedeckt.
Der Verdacht aus dem Plan vom 21.09. — Formen, die `autoOrder` auseinanderreißt — ist
abgearbeitet: seit dem 25.09. tragen alle Teile einer Form eine gemeinsame Folge (`sequence`,
§10.1), in diesem Motiv 13 Formen mit zwei bis fünf Objekten. Zeigt eine Ecke trotzdem einen
Ansatz, liegt es an der Spalte selbst, nicht an der Reihenfolge.

- Befund: _offen_

**5. Die graue Schildfläche — ein Grat an den Stegen?**
Ihre Reisewege sammeln sich in den schmalen Stegen zwischen den ausgeschnittenen
Buchstaben; dort ist die dichteste Stelle des Motivs (24 Stiche/mm², 11 von 3532 Zellen
über 18). Die Wege werden inzwischen an den Ecken gestreut (§8.7.2) und die Konturunterlage
liegt nicht mehr auf Splittern (§8.6) — die Nadelhäufung ist damit auf 5 Einstiche je
0,2-mm-Zelle gefallen, keine Zelle erreicht 6. Ob das reicht, entscheidet der Stoff: zeigt
er einen Grat oder wird steif, muss der Reihenabstand in den Stegen lockern.

- Befund: _offen_

**6. Fadenreste — 55 Trims statt 38.**
Der Faden wird jetzt überall dort geschnitten, wo ein Sprung ihn sonst über blanken Stoff
ziehen würde (§10.2). Auf dem Stoff heißt das: keine Verbindungsfäden zwischen den Teilen.
Schneidet die Maschine schlecht, heißt es stattdessen: mehr Reste zum Nacharbeiten. Beides
ansehen und gegeneinander halten.

- Befund: _offen_

### Vergleich mit einer Puncher-Datei

Keine gepunchte Datei desselben Logos im Repo — die Stickvoll-Dateien sind andere Motive
und dürfen ohnehin nicht weitergegeben werden. Sobald eine vorliegt: Stichzahl,
Sprünge, Trims und Farbwechsel gegeneinanderstellen, und zwar **pro Fläche**, weil die
Größe selten gleich ist. Ein Unterschied von ±10 % ist kein Befund; ein Faktor 1,5 ist
einer.

| Kennzahl    | Engine | Puncher |   Δ |
| ----------- | -----: | ------: | --: |
| Stiche      | 13.314 | _offen_ |     |
| Sprünge     |    164 | _offen_ |     |
| Trims       |     55 | _offen_ |     |
| Farbwechsel |      6 | _offen_ |     |

### Ergebnis

_offen — wird nach dem Stick ausgefüllt. Danach entscheidet sich, ob die Presets
nachjustiert werden oder Phase 2 (Editor) beginnt._
