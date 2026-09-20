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
| Stiche                                 |                                    17.966 |
| Sprünge / Trims / Farbwechsel          |                              135 / 38 / 6 |
| Größe                                  |                            80,3 × 74,9 mm |
| Dichte, Spitze                         |                             24 Stiche/mm² |
| Maschinenzeit (800 U/min, rechnerisch) |                                  25,6 min |
| Objekte                                | 80 — davon 74 Satinspalten, 6 Füllflächen |

Satinbreiten über alle 74 Spalten: min 0,23 mm · 25 % 1,17 mm · **median 1,68 mm** ·
75 % 2,63 mm · **max 9,81 mm**. Vier Spalten liegen über 4 mm, eine über 6 mm, achtzehn
unter 1 mm.

Preset Piqué, die Werte, an denen im Zweifel gedreht wird:

| Parameter                                |                                 Wert |
| ---------------------------------------- | -----------------------------------: |
| `fillRowSpacingMm`                       |                                 0,40 |
| `fillStitchLengthMm` / `fillStaggerRows` |                              3,0 / 4 |
| `satinSpacingMm`                         |                                 0,38 |
| `pullCompMm` / `pushCompMm`              |                          0,20 / 0,10 |
| `underlapMm`                             |                                 0,20 |
| Fill-Unterlage                           |  Kontur + einfach, 2,0 mm, Inset 0,4 |
| Satin-Unterlage                          | Kontur + Zickzack, 3,0 mm, Inset 0,4 |

Die 60 Warnungen des Laufs, nach Code:

| Code                      | Anzahl | Wo hinsehen                                             |
| ------------------------- | -----: | ------------------------------------------------------- |
| `SATIN_TOO_NARROW`        |     34 | die 18 Spalten unter 1 mm Breite                        |
| `SELF_INTERSECTING_RAILS` |     15 | Ecken und enge Bögen                                    |
| `EDGE_GAP_RISK`           |      4 | Fill-Kante an Satin-Rail, unter 0,3 mm ohne Überlappung |
| `FILL_TINY`               |      4 | Reste über 1 mm², unter 4 mm²                           |
| `SHAPE_SPLIT`             |      2 | Form zerfiel beim Normieren                             |
| `DENSITY_HIGH`            |      1 | Warnung, kein Fehler (§11)                              |

### Die vier Punkte

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

### Vergleich mit einer Puncher-Datei

Keine gepunchte Datei desselben Logos im Repo — die Stickvoll-Dateien sind andere Motive
und dürfen ohnehin nicht weitergegeben werden. Sobald eine vorliegt: Stichzahl,
Sprünge, Trims und Farbwechsel gegeneinanderstellen, und zwar **pro Fläche**, weil die
Größe selten gleich ist. Ein Unterschied von ±10 % ist kein Befund; ein Faktor 1,5 ist
einer.

| Kennzahl    | Engine | Puncher |   Δ |
| ----------- | -----: | ------: | --: |
| Stiche      | 17.966 | _offen_ |     |
| Sprünge     |    135 | _offen_ |     |
| Trims       |     38 | _offen_ |     |
| Farbwechsel |      6 | _offen_ |     |

### Ergebnis

_offen — wird nach dem Stick ausgefüllt. Danach entscheidet sich, ob die Presets
nachjustiert werden oder Phase 2 (Editor) beginnt._
