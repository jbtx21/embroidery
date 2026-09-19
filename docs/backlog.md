# Backlog

Was auffiel, aber nicht in den laufenden Meilenstein gehört (CLAUDE.md, Arbeitsweise).
Neue Einträge oben in den passenden Abschnitt.

## Offen nach der zweiten Welle (19.09.2026)

- **Der Import setzt Zug, Schub und Überlappung auf 0.** `pullCompMm` war das schon vorher;
  `pushCompMm` und `underlapMm` (§8.1.1, §8.1.2) folgen dem. Die Presets tragen die Werte
  (§14), aber niemand liest sie beim Import — die Spalten in §14 wirken erst, wenn der
  Editor sie setzt. Absicht: der Ausgleich gehört zum Stoff und zu dem, was neben der Fläche
  liegt, und das SVG sagt zu beidem nichts. **Die Überlappung pauschal auf jede importierte
  Fläche zu legen wäre falsch** — sie ist für eine Fläche unter einer Kontur gedacht, nicht
  zwischen zwei angrenzenden Farbflächen, wo sie nur die Dichte erhöht. **Frage:** soll der
  Import den Zugausgleich aus dem Preset übernehmen und die Überlappung dem Editor lassen?
- **`EDGE_GAP_RISK` prüft Fill gegen Satin, nicht Fill gegen Fill.** §8.1.3 ist so
  geschrieben, weil die Praxis von „Fläche und darüberliegender Kontur" spricht. Bei
  importierten Logos ist die Kontur aber oft selbst eine Fläche. **Frage:** auf Fill-Paare
  ausweiten?

## Abgleich mit der Punch-Praxis (19.09.2026)

Vollständig mit Messungen in `docs/profi-abgleich.md`. **Drei der acht Punkte sind
entschieden und umgesetzt** (§14 Industriewerte, §11 `FILL_TOO_NARROW`, §10.1 Mitte →
außen in Ringen) — Zahlen in `docs/messung-echte-logos.md`. Offen bleiben:

2. **§11 Dichtemaß.** Das Maximum über alle 1-mm-Zellen lässt eine einzige Stelle die ganze
   Datei abstempeln (STUTTGART: 9 von 4.047 Zellen lösen den Fehler aus, 92 % liegen bei
   höchstens 8/mm²). Fläche über dem Grenzwert wäre aussagekräftiger.
3. **§11 Breitenkriterium.** `FILL_TINY` misst Fläche < 4 mm². Eine 114-mm²-Sichel mit 79 %
   Reihenstücken unter 1 mm fällt durch. 35–42 % aller Reihenstücke eines Motivs liegen
   unter 1 mm und tragen zusammen 3–4 % der Deckung.
4. **§7/§8 Kontur-Überlappung** gegen Blitzer: existiert nicht. Aus SVG importierte Kontur
   und Fläche liegen exakt auf Kante.
5. **§7.2 Push-Ausgleich** ist auf „für später" gesetzt. Cap-Zugausgleich 0,15 mm liegt
   unter dem Praxisminimum 0,2 mm.
6. **§10.1 Mitte → außen, unten → oben** ist nicht umgesetzt — obwohl §14 es im Hinweis des
   Cap-Presets verspricht. `autoOrder` sortiert nach nächster Entfernung.
7. **§8 Stichwinkel.** Der Import setzt für jede Fläche 0°. Gleiche Winkel überall wirken
   flach.
8. **§6 krümmungsabhängige Stichlänge** im Laufstich: nicht vorhanden.
9. **Kein Preset für dünne Jersey-Ware.** Die Praxis nennt 0,45 mm für dünne Shirts; §14
   hat dafür keinen Platz. Ein sechstes Preset wäre eine Spec-Änderung.

## Aus der Messung an echten Kundenlogos (19.09.2026)

Zahlen und Belege: `docs/messung-echte-logos.md`.

- **Übereinanderliegende Flächen werden doppelt gestickt.** Druckvorlagen legen den
  Untergrund als volle Fläche unter das Motiv; die Engine stickt beides. Alle vier Logos
  melden deshalb `DENSITY_HIGH` als Fehler (19–27 Stiche/mm²). **Frage an die Spec:** soll
  `expand()` überdeckte Flächen abziehen (§4 kennt keine Stufe, die Objekte gegeneinander
  verrechnet; §8 keinen Knockdown), und nach welcher Regel — nur bei voller Überdeckung,
  nur innerhalb einer Farbe, mit welchem Überstand?
- **`autoOrder` sollte der Standardweg sein.** Mit der Designreihenfolge braucht
  STUTTGART zwölf Farbwechsel für zwei Farben, mit `order: "auto"` einen. Köln 21 → 5.
  §10.1 beschreibt „auto" als Vorschlag. **Frage an die Spec:** umdrehen?
- **Regel 9 hält auf echter Geometrie noch nicht.** Nach dem Umbau von `insideTravel`
  (Graph-Cache, nur einspringende Ecken als Knoten, Kantenindex) rechnet das teuerste
  Objekt statt gar nicht in 1,1 s; ein ganzes Motiv braucht 0,17 s (STUTTGART 80 mm) bis
  5,7 s (Eislingen). Die Zeit steckt in den Sichtbarkeitstests, nicht in der Stichzahl —
  STUTTGART 250 mm hat 134.735 Stiche und braucht 0,67 s, Eislingen 48.027 Stiche und
  5,7 s. Nächster Schritt wäre, die **Zahl** der Tests zu senken (A\* statt Dijkstra,
  Zielsichtbarkeit erst beim Entnehmen prüfen). Eigene Sitzung.
- **`pnpm bench` misst zu kleine Formen.** Die Zusage „voller Lauf unter 300 ms" ist dort
  grün, weil die Benchmark-Formen ein Dutzend Kanten haben. Ein Benchmarkfall mit einer
  Kontur in der Größenordnung eines echten Logos (2.000+ Kanten, Löcher) würde den
  Unterschied zeigen. Braucht eine Vorlage, die ins Repo darf.
- **`FILL_TINY` in Massen** (Köln 64, Eislingen 71): Flächen von 0,3 bis 4 mm² aus der
  Vektorisierung. Gehört in die Vorbereitung der Vorlage. Die Engine meldet es richtig.

## Wartet auf Zulieferung

- **Phase-0-Motive** (§15, §16 Abnahme Woche 1): `test-data/phase0/` enthält nur die
  README. Ohne je ein SVG und die zugehörige Ink/Stitch-DST laufen weder der
  Golden-File-Vergleich noch die Abnahme der Woche. Der Rahmen steht und greift
  (`test/golden.test.ts`, Vergleichslogik eigens geprüft) — es fehlen die Dateien.
  Am 19.09.2026 kamen fünf Stickvoll-Motive als DST/EXP/HUS/JEF/PES/VP3/XXX. Sie taugen
  nicht als Golden Files: **kein SVG dabei**, also fehlt die Eingabeseite, die durch die
  Engine laufen müsste. Dazu untersagt ihre Lizenz („Bitte lesen.txt") Weitergabe und
  gewerbliche Nutzung — ein Commit ins Repo wäre Weitergabe. Sie liegen deshalb nicht im
  Repo. Was §15 braucht, ist das SVG mit den Ink/Stitch-Parametern und die daraus
  gestickte DST vom selben Motiv.
- **Ink/Stitch-Schriften** (§9): keine Fontdateien im Repo. Der Konverter
  (`packages/fonts/src/import-inkstitch.ts`) ist bewusst noch ein Stub: die genaue
  Struktur der Ink/Stitch-SVG-Fonts lässt sich hier nicht aus erster Hand prüfen
  (inkstitch.org und GitHub sind aus dieser Umgebung nicht erreichbar, nur die
  npm-Registry). Ihn ohne eine echte Datei zu schreiben hieße raten — dagegen steht
  CLAUDE.md, Arbeitsweise. Sobald eine Schrift abgelegt ist, ist es eine überschaubare
  Sitzung.

## Entschieden am 19.09.2026

- **Vorgriff auf spätere Wochen bleibt.** Satin (§7.1–7.6), Fill (§8),
  Reihenfolge/Laufstich-Verbindung (§10.1, §10.2) und Textsatz (§9) sind gebaut und
  getestet. Sie bleiben im Code und gelten ab jetzt als regulärer Bestand, nicht als
  Vorgriff. Ab hier gilt „keine Features außerhalb des Meilensteins" wieder.
- **DST-Header-Füllung**: `0x1A` als Abschluss, danach `0x20` bis Byte 512. In §13.1
  eingetragen.
- **Zentrierung auf die Bounding-Box-Mitte** und **Nullpunkt-Anfahrt als Sprungfolge**:
  in §13.1 eingetragen.
- **`roundHalfEven`**: in §11 als allgemeine Rundungsregel eingetragen.
- **`Stitch.tie`**: in §3 eingetragen.
- **`SHAPE_SPLIT`**: neue Warnung mit Teilanzahl, wenn eine Fläche beim Normieren
  zerfällt. In §11 eingetragen, in `validate.ts` umgesetzt.

## Fremde DST lesen: Trims werden nicht erkannt

Geprüft am 19.09.2026 gegen fünf echte Maschinendateien eines fremden Digitalisierers
(Stickvoll, DST). Unser Reader kommt mit allen fünf zurecht: die Datensatzzahl deckt sich
exakt mit dem `ST:`-Feld, die Farbwechsel mit `CO:`, die Extents auf eine Einheit genau.
Der Renderer gibt die Motive korrekt wieder.

Ein Unterschied bleibt: pyembroidery meldet in denselben Dateien Trims (2 bis 11 je
Datei), unser Reader nicht — er sieht dort Sprünge. Grund: wir sammeln nur genau das
Trim-Signal wieder ein, das unser eigener Writer schreibt (drei Sprünge `+2/+2`, `-4/-4`,
`+2/+2`). Fremde Software signalisiert Trims anders, meist als Lauf mehrerer Sprünge.

**Nicht verallgemeinert**, und zwar mit Absicht: `post()` teilt lange Sprünge in mehrere
Sprung-Datensätze (§11). Eine Regel „drei Sprünge hintereinander sind ein Trim" würde
genau diese geteilten Sprünge in unseren eigenen Dateien als Trim lesen und den
byte-identischen Roundtrip aus §15 zerstören. Für §17 („Import fremder DST … nur
Anzeige") wäre die Erkennung trotzdem richtig, weil Trims als Kreuz statt als gestrichelte
Linie gezeichnet gehören. **Frage an die Spec:** soll der Reader einen Modus für fremde
Dateien bekommen, der Sprungläufe als Trim deutet?

## Offene Punkte aus der Spec

- **PES, JEF, VP3, EXP** (§13.2): laufen über `apps/api` (Python, pyembroidery). Das
  neutrale JSON dorthin ist da.
- **Stichbericht als PDF** (§13.3): von der Spec selbst auf „später" gesetzt.
- **`apps/editor`, `apps/api`** (§2): noch nicht begonnen.
- **Asymmetrischer Zugausgleich, Contour/Guided Fill, Applikation, 3D-Puff** (§17):
  Phase 3 oder nicht geplant.

## Abweichungen, die noch eine Spec-Entscheidung brauchen

- **`reverse` beim Satin** ist als „Spalte vom anderen Ende her sticken" umgesetzt. §7
  legt die Bedeutung nicht fest; gegen Verdrehen sind die Sprossen da.
- **Auto-Satin ist nicht in `expand()` verdrahtet.** §4 nennt „Auto-Satin-Kandidaten
  auflösen" als Aufgabe von `expand()`, aber §3 kennt keinen Objekttyp, der einen
  Kandidaten markiert. Einen zu erfinden wäre eine Spec-Änderung. `autoSatin(shape, opts)`
  ist deshalb eine Funktion, die der Editor aufruft — passend zu §7.7 Punkt 5, wo der
  Nutzer das Ergebnis als Vorschlag korrigiert. **Frage an die Spec:** soll §3 einen
  Kandidatentyp bekommen, oder bleibt Auto-Satin Editor-Werkzeug?
- **Zu breiter Ast → Fill für die ganze Form.** §7.7 Punkt 3 sagt „Median > `maxWidthMm`
  → Fill statt Satin" je Ast. Die Form je Ast aufzuteilen steht nirgends und wäre geraten;
  ein Entwurf aus Satin-Spalten plus nicht zugeordneter Restfläche ist außerdem nicht
  stickbar. Umgesetzt: ist ein Ast zu breit, wird die GANZE Form als Fill vorgeschlagen,
  mit `SATIN_TOO_WIDE` und der Zahl der betroffenen Äste. **Frage an die Spec:** so
  festschreiben?

## Bekannte Eigenschaften von Auto-Satin

Beides ist keine Fehlfunktion, sondern folgt aus dem Verfahren. §7.7 Punkt 5 sieht genau
deshalb die Korrektur durch den Nutzer vor.

- **Spalten überlappen an den Verzweigungen.** Wo Äste zusammenlaufen, decken zwei Spalten
  dieselbe Stelle ab. Die Dichteprüfung aus §11 meldet das zuverlässig — beim
  L-Winkel-Probelauf mit `DENSITY_HIGH`. Der Editor löst es, indem der Nutzer die Rails
  an der Verzweigung trennt.
- **`pruneFactor` tauscht Spaltenzahl gegen Randabdeckung.** Größere Werte schneiden die
  kurzen Eckäste weg (ein 40 × 4-Balken wird dann eine Spalte statt fünf), dafür bleiben
  die äußersten Millimeter der Form unbedeckt. Der Standard 1,0 liefert die Mittelachse
  so, wie sie mathematisch ist.

## Werkzeug

- `printWidth` in Prettier steht auf 100 statt der Voreinstellung 80. Geometriecode mit
  vier Koordinaten je Zeile wird bei 80 unleserlich. Sonst Standardkonfiguration.
- SVG-Vorschau (`renderPlanSvg`) ist eine Zugabe zu §12, das nur Canvas nennt. Sie nutzt
  dieselbe Zerlegung, zeigt also dasselbe, und macht Bilddiffs in der CI möglich.
