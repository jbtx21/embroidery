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

| Kennzahl                               |                                      Wert |
| -------------------------------------- | ----------------------------------------: |
| Stiche                                 |                                    17.314 |
| Sprünge / Trims / Farbwechsel          |                              168 / 58 / 6 |
| Größe                                  |                            80,3 × 74,9 mm |
| Dichte, Spitze                         |      32 Stiche/mm² (Warnung, kein Fehler) |
| Maschinenzeit (800 U/min, rechnerisch) |                                  25,8 min |
| Objekte                                | 80 — davon 74 Satinspalten, 6 Füllflächen |

_(21.09.2026 dreimal nachgezogen: nach dem Reisewege-Fix (§8.7.1), nach der Trim-Regel für
Sprünge (§10.2) samt Reisestichlänge 3,0 mm (§8.5), zuletzt nach den EPCwin-Presets (§14,
Stichlänge 4,0) und dem prozentualen Satin-Zugausgleich (§7.2). Am Anfang standen hier 17.966
Stiche, 135 Sprünge, 38 Trims und Dichte 24 — mit Laufstichen, die bis zu 55 mm über
blanken Stoff liefen, und Sprüngen, die den Faden oben liegen ließen. Zahlen und
Begründung in `docs/messung-echte-logos.md`.)_

Satinbreiten über alle 74 Spalten: min 0,23 mm · 25 % 1,17 mm · **median 1,68 mm** ·
75 % 2,63 mm · **max 9,81 mm**. Vier Spalten liegen über 4 mm, eine über 6 mm, achtzehn
unter 1 mm.

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

Die 65 Warnungen des Laufs, nach Code:

| Code                      | Anzahl | Wo hinsehen                                                  |
| ------------------------- | -----: | ------------------------------------------------------------ |
| `SATIN_TOO_NARROW`        |     35 | die Spalten unter 1 mm Breite                                |
| `SELF_INTERSECTING_RAILS` |     15 | Ecken und enge Bögen                                         |
| `EDGE_GAP_RISK`           |      4 | Fill-Kante an Satin-Rail, unter 0,3 mm ohne Überlappung      |
| `FILL_TINY`               |      4 | Reste über 1 mm², unter 4 mm²                                |
| `TRAVEL_OUTSIDE`          |      4 | Stellen, an denen der Fill springt statt zu sticken (§8.7.1) |
| `SHAPE_SPLIT`             |      2 | Form zerfiel beim Normieren                                  |
| `DENSITY_HIGH`            |      1 | Warnung: 1,9 % der Zellen über 18/mm², Spitze 33 (§11)       |

### Die Punkte für die Auswertung

Je Punkt: was man ansieht, was es bedeutet, welcher Knopf.

**1. Zugausgleich — liegt die Satinkontur der Buchstaben auf dem Fill, oder gibt es
Blitzer?**
Ein Blitzer ist Stoff, der zwischen Fill-Kante und Satinkontur durchscheint. Die Engine
gibt dem Fill 0,20 mm Unterlappung unter die Kontur (`underlapMm`) und weitet den Satin um
0,20 mm je Seite (`pullCompMm`). Vier Stellen hat sie selbst als knapp gemeldet
(`EDGE_GAP_RISK`) — dort zuerst hinsehen. Blitzer → `underlapMm` auf 0,3 und/oder
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
Schlaufen entstehen, wenn die Spalte breiter ist, als der Stich hält. Vier Spalten liegen
über 4 mm, die breiteste bei **9,81 mm** — das ist die eigentliche Kandidatin. §7.4 nennt
`maxWidthMm`; greift die Breite nicht, fehlt entweder die Teilung oder der Grenzwert steht
zu hoch.

- Befund: _offen_

**4. Ecken der Buchstaben — sauber gedeckt oder offen?**
Fünfzehn Spalten melden `SELF_INTERSECTING_RAILS`; das sind die Stellen, an denen sich die
Rails in einer Ecke kreuzen. Offene Ecken heißen: die Spalte endet vor der Ecke. Zu dicke
Ecken heißen: sie wird doppelt gedeckt.
Dazu ein zweiter Verdacht aus dem Plan: **sechs von 47 Formen werden auseinandergerissen**
(eine viermal) — ihre Spalten werden nicht hintereinander gestickt, weil der Import den
Spalten einer Form kein gemeinsames `sequence` gibt, anders als §10.1 es beschreibt. Wenn
eine Ecke einen Ansatz zeigt, ist das der erste Verdächtige (siehe `docs/backlog.md`).

- Befund: _offen_

**5. Die graue Schildfläche — ein Grat an den Stegen?**
Ihre Reisewege sammeln sich in den schmalen Stegen zwischen den ausgeschnittenen
Buchstaben; dort ist die dichteste Stelle des Motivs (32 Stiche/mm²). Mit 3,0 mm
Reisestichlänge liegt sie wieder unter der Fehlerschwelle aus §11 — ob das reicht,
entscheidet der Stoff. Zeigt er einen Grat oder wird steif, werden die Wege gestreut.

- Befund: _offen_

**6. Fadenreste — 56 Trims statt 38.**
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
| Stiche      | 17.314 | _offen_ |     |
| Sprünge     |    168 | _offen_ |     |
| Trims       |     58 | _offen_ |     |
| Farbwechsel |      6 | _offen_ |     |

### Ergebnis

_offen — wird nach dem Stick ausgefüllt. Danach entscheidet sich, ob die Presets
nachjustiert werden oder Phase 2 (Editor) beginnt._
