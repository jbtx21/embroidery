# Abgleich mit der Punch-Praxis

Stand: 19.09.2026. Die Engine gegen die Regeln gehalten, nach denen in der industriellen
Stickerei digitalisiert wird. Gemessen wurde an den vier echten Kundenlogos
(`docs/messung-echte-logos.md`), nicht an den Testfiguren.

Die Spec ist die Wahrheit (CLAUDE.md). Wo unten eine Zahl der Praxis widerspricht, die aus
der Spec stammt, steht der Befund samt Messung — geändert wird erst nach Entscheidung.

## Erfüllt

| Regel aus der Praxis                                        | Wo                                                  |
| ----------------------------------------------------------- | --------------------------------------------------- |
| Satin nicht breiter als 7 mm, darüber Split-Satin           | §7.4, `satin.ts`                                    |
| Satin unter 1 mm warnen, unter 0,6 mm Laufstich vorschlagen | §7.4, `SATIN_TOO_NARROW`                            |
| Kurzstiche in engen Kurven (Fadenberg innen)                | §7.5, Innenradius < 1 mm, 70 %                      |
| Unterlage im 90°-Winkel zum Deckstich                       | §8.6, `single` = `angleDeg + 90`                    |
| Unterlage nach Breite: center / contour / zigzag            | §7.6                                                |
| Zugausgleich senkrecht nach außen                           | §7.2, `satin.ts`; auch für Fill (`fill.ts:281`)     |
| Hintergrund vor Details vor Konturen                        | `orderRank`: fill < satin < text < running          |
| Farbwechsel minimieren                                      | `autoOrder` — STUTTGART 12 → 1, Köln 21 → 5         |
| Verbindungswege unter spätere Deckung legen                 | `connect.ts` (`cover`), `insideTravel`              |
| Mindesthöhe für Text, sonst Warnung                         | `TEXT_TOO_SMALL`, `minHeightMm` je Schrift (typ. 5) |
| DST als Industrieformat                                     | §13.1, byte-identisch gegen pyembroidery            |

## Nicht erfüllt

### 1. Die Stichdichte liegt durchweg über dem Industriestandard

Praxis: Reihenabstand **0,40 mm** für 40er-Garn, 0,35 für schwere Ware, 0,45 für dünne
Shirts. Unsere Presets (§14): Piqué 0,25 · Softshell 0,27 · Fleece 0,28 · Cap 0,25 ·
Frottee 0,25. Das ist 35 bis 60 % dichter als der Standard — und die fünf Presets
unterscheiden sich untereinander nur um 12 %, während die Praxis über 29 % spreizt.
Genau das ist der Punkt: dieselbe Datei kann nicht auf ein dünnes T-Shirt und auf einen
schweren Hoodie.

Gemessen, was der Wechsel auf Industriewerte kostet bzw. bringt:

| Motiv                      |            0,25 mm |         0,35 mm |         0,40 mm |         0,45 mm |
| -------------------------- | -----------------: | --------------: | --------------: | --------------: |
| STUTTGART 80 mm            | 18.174 St · 25 min | 15.970 · 22 min | 14.334 · 20 min | 13.126 · 18 min |
| Berufsfeuerwehr Köln 90 mm | 26.653 St · 37 min | 23.613 · 33 min | 21.396 · 31 min | 19.859 · 29 min |

Auf 0,40 mm sind das rund **21 % weniger Stiche und 5 bis 6 Minuten weniger
Maschinenzeit je Stück**. Der Wert steht in §14 und ist dort ausdrücklich als
„Startwert, in Phase 5 gegen Probesticks justieren" markiert.

### 2. Die Dichte-Warnung hängt nicht an der Dichte

Wichtig für die Bewertung von Befund 1: der Wechsel auf 0,40 mm räumt `DENSITY_HIGH`
**nicht** weg. Gemessen an STUTTGART 80 mm steigt das Maximum sogar von 24 auf 28
Stiche/mm². Ursache sind nicht die Füllreihen, sondern die übereinanderliegenden Flächen
der Druckvorlage — geprüft mit `intersect`: `z08 ∩ z12` decken sich zu 86 %, `z04 ∩ z08`
zu 80 %. Die beiden Befunde sind unabhängig voneinander.

Dazu kommt, dass §11 das Maximum über alle 1-mm-Zellen nimmt. Bei STUTTGART 80 mm liegen
von 4.047 belegten Zellen 92 % bei höchstens 8 Stichen/mm²; den Fehler lösen **9 Zellen**
aus. Eine einzige schlechte Stelle stempelt die ganze Datei ab. Ein Maß, das die Fläche
über dem Grenzwert nennt statt nur den Spitzenwert, wäre aussagekräftiger.

### 3. `FILL_TINY` misst die Fläche, das Problem ist die Breite

Praxis: ein Stich darf nie kürzer als 1 mm sein, sonst perforiert die Nadel den Stoff und
es entstehen Vogelnester. Unsere Prüfung warnt bei Flächen **unter 4 mm²**. Das greift
daneben, sobald eine Fläche groß, aber überall schmal ist — Sicheln, Konturflächen,
Buchstabenreste.

Gemessen an den Reihenstücken, aus denen der Füllstich entsteht:

| Motiv                      | Reihenstücke | davon unter 1 mm | Anteil an der Reihen**länge** |
| -------------------------- | -----------: | ---------------: | ----------------------------: |
| STUTTGART 80 mm            |        4.051 |   1.714 (42,3 %) |                         3,0 % |
| Berufsfeuerwehr Köln 90 mm |        7.442 |   2.644 (35,5 %) |                         3,9 % |

Über ein Drittel aller Nadeleinstiche im Füllstich trägt zusammen 3 bis 4 Prozent der
Deckung. Die schlimmsten Einzelfälle liegen weit über der 4-mm²-Schwelle und werden
deshalb von `FILL_TINY` nicht gemeldet:

- `z03-bebebe-003`: **114,1 mm²**, 79 % der 435 Reihenstücke unter 1 mm
- `z13-bebebe-012`: 69,4 mm², 52 % von 131
- `z05-ac0109-002`: 47,0 mm², 91 % von 253

Im fertigen Plan stehen sie als Serien: Köln 402 Serien von mindestens drei
aufeinanderfolgenden Stichen unter 1 mm, zusammen 12,9 % aller Stiche, die längste Serie
**151 Stiche**. Bei STUTTGART 152 Serien, längste 179. Sie stammen aus den Füllreihen,
nicht aus den Verbindungswegen (nachgemessen: von 1.521 Reisestichen sind 190 kurz, die
längste Serie dort ist 3).

Vorschlag: ein Breitenkriterium neben dem Flächenkriterium — Anteil der Reihenstücke unter
1 mm über einem Schwellwert → Warnung „als Satin oder Laufstich anlegen". Die Zahlen dafür
fallen in `scanlines` ohnehin an.

### 4. Kein Überlappen von Kontur und Fläche (Blitzer)

Praxis: Außenkonturen müssen die darunterliegende Fläche um zwei bis drei Stichbreiten
überlappen, sonst reißt der Stoffzug eine Lücke auf. Die Engine kennt das nicht. Der
Zugausgleich (§7.2) verbreitert jedes Objekt für sich, aber es gibt keine Regel, die eine
Kontur gegen die Fläche verrechnet, an der sie liegt. Bei aus SVG importierten Logos liegen
Kontur und Fläche exakt auf Kante — der Fall, vor dem die Regel warnt.

### 5. Kein Push-Ausgleich

§7.2 kennt nur das Versetzen nach außen (Pull). Dass der Stoff quer zur Fadenrichtung
auseinandergedrückt wird und die Fläche dort schmaler angelegt werden muss, ist nicht
modelliert. Das Feld für asymmetrischen Ausgleich (`pullCompA`, `pullCompB`) ist in §7.2
als „für später" vermerkt.

Nebenbei: der Zugausgleich der Presets liegt bei 0,15 bis 0,30 mm, die Praxis nennt 0,2
bis 0,4 mm. Cap mit 0,15 mm liegt unter dem Minimum.

### 6. „Von der Mitte nach außen, von unten nach oben" ist nicht umgesetzt

Die Regel verhindert, dass der Stoff beim Sticken vor sich hergeschoben wird — bei Kappen
ist sie zwingend, sonst verzieht sich das Motiv auf dem runden Rahmen. `autoOrder` sortiert
nach Farbe, dann nach Rang, dann nach **nächster Entfernung** zum Cursor. Eine Mitte-nach-
außen-Regel gibt es nicht.

Das ist mehr als eine Lücke: §14 verspricht sie im Hinweis des Cap-Presets
(„Reihenfolge Mitte → außen, unten → oben"), und §10.1 kennt keine Regel, die das einlösen
würde. Der Hinweis steht als Text im Preset und bewirkt nichts.

### 7. Alle Flächen bekommen denselben Stichwinkel

`import/svg.ts:293` setzt `angleDeg: 0`, wenn das SVG keinen Ink/Stitch-Winkel mitbringt —
und das tut ein Logo aus der Grafikabteilung nie. Praxis: der Winkel gehört variiert, sonst
wirkt das Motiv flach. Bei STUTTGART stehen damit Wappen, Pferd und Schriftband alle in
derselben Richtung.

### 8. Laufstich verkürzt in engen Kurven nicht

Praxis: in engen Kurven muss die Stichlänge herunter, sonst wirkt die Linie eckig.
`runningStitches` teilt zwischen den Ecken gleichmäßig mit fester Länge (§6). Eine
Anpassung an die Krümmung gibt es nicht.

## Was davon Spec-Entscheidungen sind

1. §14 Reihenabstände auf Industriewerte (0,40 Standard, 0,35 schwer, 0,45 dünn)?
2. §11 Dichtemaß: Fläche über dem Grenzwert statt Spitzenwert einer einzelnen Zelle?
3. §11 Breitenkriterium neben `FILL_TINY`?
4. §7/§8 Kontur-Überlappung gegen Blitzer — und wer legt sie fest, Engine oder Editor?
5. §7.2 Push-Ausgleich aus „für später" holen? Cap-Zugausgleich auf 0,2 mm?
6. §10.1 Reihenfolge Mitte → außen, unten → oben — mindestens für das Cap-Preset, das sie
   heute verspricht?
7. §8 Standardwinkel beim Import, und ob die Engine Winkel überhaupt variieren darf?
8. §6 krümmungsabhängige Stichlänge?
