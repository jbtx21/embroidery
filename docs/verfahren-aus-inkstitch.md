# Verfahren aus Ink/Stitch — gelesen, beschrieben, selbst gebaut

Stand: 26.09.2026.

## Wie diese Datei zu lesen ist

Ink/Stitch steht unter **GPL-3.0**. Das heißt: Der Quellcode darf gelesen werden, und die
**Verfahren** darin sind keine geschützte Ausdrucksform — Tatsachen, Schwellenwerte und
Algorithmen sind frei. Geschützt ist der Code selbst. Eine Übersetzung nach TypeScript wäre
ein abgeleitetes Werk und würde `texma-stitch` bei einer Weitergabe unter GPL-3.0 zwingen.

Deshalb dieses Dokument: Was Ink/Stitch tut, **in eigenen Worten und mit Zahlen**, als
Vorlage für unsere eigene Umsetzung. Kein Codeauszug, keine Übersetzung. Die Zeilenangaben
dienen dem Nachprüfen, nicht dem Abschreiben.

Quelle: `inkstitch-src` (im Arbeitscontainer geklont), Stand 09.2026.

---

## 1. Kurzstiche — umgesetzt am 26.09.2026

**Was Ink/Stitch tut** (`lib/elements/satin_column/satin_column.py`, `inset_short_stitches_sawtooth`):

Jede Rail wird für sich betrachtet. Für jeden Einstich wird der Abstand zum letzten Einstich
derselben Rail gemessen, der **stehen geblieben** ist — nicht zum direkten Vorgänger. Liegt er
unter `short_stitch_distance_mm` (Vorgabe **0,25 mm**), wird der Punkt um
`short_stitch_inset` (Vorgabe **15 %** der Spaltenbreite an dieser Stelle) nach innen gezogen;
der Bezugspunkt bleibt liegen. Liegt er darüber, bleibt der Punkt und wird neuer Bezugspunkt.
Mehrere Prozentwerte hintereinander ergeben gestaffelte Stufen (daher „sawtooth"); der
Versatz wird zusätzlich auf ein Drittel der Split-Stichlänge gedeckelt.

**Warum das besser ist als unser altes Verfahren**: Wir haben den Krümmungsradius geschätzt
(< 1 mm) und jeden zweiten Innenstich auf 70 % gezogen. Der Radius ist ein Umweg — was zählt,
ist der Abstand der Löcher im Stoff. Und „jeder zweite" löst eine Häufung von fünf Stichen nur
zur Hälfte auf.

**Bei uns**: §7.5, `applyShortStitches` in `packages/engine/src/satin.ts`. Den Deckel auf ein
Drittel der Split-Stichlänge haben wir nicht übernommen — unser Split läuft als eigene Stufe
(`splitWideStitches`), der Versatz trifft ihn nicht.

**Gemessen**: Einstiche unter 0,25 mm auf derselben Rail −17 bis −43 %; Nadelhäufung gleich
oder besser; Dichtespitze bei zwei von vier Motiven höher, in 1 bzw. 3 von über 11.000 Zellen.

---

## 2. Füllung als Graph mit Eulerpfad — offen

**Was Ink/Stitch tut** (`lib/stitches/tatami_fill.py`):

1. Reihen aus dem Gitter schneiden — wie bei uns (§8.2).
2. Einen Graphen bauen, dessen **Knoten die Reihenenden** sind und dessen Kanten zweierlei
   sind: die **Reihen selbst** und die **Konturstücke** zwischen benachbarten Reihenenden.
   Jede zweite Konturkante wird zusätzlich doppelt eingetragen.
3. Ist der Graph nicht eulersch, wird er **eulerisiert** (Kanten verdoppeln, bis jeder Knoten
   geraden Grad hat).
4. Ein Eulerpfad durch diesen Graphen ist die Stickreihenfolge: **jede Reihe genau einmal**,
   und die Verbindungen laufen entlang der Kontur statt quer durch die Fläche.

**Was das für uns hieße**: Unsere Sektionslogik (`sections`, `fillRegion`) zerlegt eine
zerklüftete Fläche in viele Ketten und verbindet sie greedy — beim STUTTGART-Schild 96
Sektionen im Deckstich und 79 in der Unterlage, also 175 Reisewege in einem Objekt. Der
Graph-Ansatz kennt keine Sektionen; er kennt Reihen und Kanten und läuft sie in einem Zug ab.
Das ist der strukturelle Unterschied, nicht eine bessere Heuristik.

**Aufwand**: Die Teile liegen da — Reihen (§8.2), Kontur, Wegprüfung. Es fehlt der Graph, die
Eulerisierung und ein Pfadlauf. Kein Fremdcode nötig; `networkx` hat dafür Standardverfahren,
die in jedem Algorithmenbuch stehen.

---

## 3. Reisewege auf einem eigenen Gitter — offen

**Was Ink/Stitch tut** (`build_travel_graph` in derselben Datei):

Für die Wege **innerhalb** der Fläche („underpath") wird ein **kreuzschraffiertes Gitter** über
die Fläche gelegt und daraus ein eigener Graph gebaut. Kürzeste Wege laufen über dieses
Gitter. Entscheidend ist die Gewichtung: **Kanten auf der Kontur sind teurer**, und Kanten im
Inneren werden teurer, **je näher sie der Kontur kommen**. Der Weg wird also in die Mitte der
Fläche gedrängt.

**Was das für uns hieße**: Unsere Reisewege laufen über einen Sichtbarkeitsgraphen, dessen
Knoten die Ecken der Form sind — 0,12 mm innerhalb der Kontur. Genau daher kam die
Nadelhäufung vom 26.09.2026 (18 Einstiche auf einem Punkt, §8.7.2). Wir haben sie mit einem
Versatz entschärft; ein Gitter im Inneren würde das Problem gar nicht erst erzeugen, und die
Gewichtung gegen Randnähe hält die Wege aus den Stegen heraus.

---

## 4. Werte der Satin-Unterlagen — zum Abgleich

Aus den Parameterangaben in `satin_column.py`:

| Unterlage            | Ink/Stitch                                          | TEXMA Stitch (§7.6, §14) |
| -------------------- | --------------------------------------------------- | ------------------------ |
| Mittellauf           | Stichlänge 3 mm, **2 Durchgänge**, Position 50 %    | 2,5 mm, ein Durchgang    |
| Kontur               | Stichlänge 3 mm, Inset **0,4 mm** je Seite          | Inset 0,4 mm             |
| Zickzack             | Abstand **3 mm**, Inset erbt halbierten Kontur-Wert | Abstand aus Preset       |
| Split breiter Säulen | `split_staggers` 4, dazu Zufalls-Jitter             | fest, ohne Streuung      |

Offen: die zwei Durchgänge beim Mittellauf (hält den Stoff besser, kostet wenig) und die
Streuung der Teilungsnaht beim Split — beide stehen im Backlog.

---

## Was daraus nicht wird

Kein Code. Keine Übersetzung. Wo ein Verfahren übernommen wird, steht es vorher in der Spec —
in eigenen Worten, mit unseren Messwerten, und mit der Herkunft der Zahlen wie oben.
