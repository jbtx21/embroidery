# Backlog

Was auffiel, aber nicht in den laufenden Meilenstein gehört (CLAUDE.md, Arbeitsweise).
Neue Einträge oben in den passenden Abschnitt.

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
