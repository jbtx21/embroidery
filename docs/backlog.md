# Backlog

Was auffiel, aber nicht in den laufenden Meilenstein gehört (CLAUDE.md, Arbeitsweise).
Neue Einträge oben in den passenden Abschnitt.

## StitchPencil als Ideenquelle (02.10.2026)

StitchPencil ist eine iPad-App zum Digitalisieren von Hand (Handbuch 0.9.1 vom 01.10.2026,
`.hoop`-Format Version 1 vom 26.09.2026, beides vom Nutzer, nicht im Repo). Sie hat einen eigenen
Stichgenerator, nicht Ink/Stitch. **Entscheidung des Nutzers vom 02.10.2026: nur Ideenquelle**,
kein Weg über das iPad und kein `.hoop`-Export. Übernommen ist bisher nur die Mindeststichlänge
(Spec §11). Die übrigen Kandidaten, jeweils erst gegen die Profi-Dateien messen (Phase 1b
Schritt 6):

- **Tatami-Dichte.** StitchPencil: Auf Jersey mit 40er-Garn schließt sich die Fläche erst bei etwa
  0,20 mm Reihenabstand (0,22 mm sprenkelt noch), Webware 0,25 mm. Unsere Presets: 0,40 mm
  (Piqué), 0,45 mm (Jersey). Gemessen:
  - Christliche Gemeindereitschule, Pferdekörper: 0,20 mm.
  - Elektrotechnik Yer: keine Tatami-Fläche. Die 0,19 mm dort sind ein breiter Satin, also der
    halbe Abstand Spitze zu Spitze.
  - Archivtabelle, 121 Dateien mit Füllung: Median 0,43 mm, p10 0,26 mm.

  Offen, bis die 22 Profi-DSTs vom 02.10.2026 mit einem geprüften Schätzer gemessen sind. Vor einer
  Änderung die Wechselwirkung mit der Mindeststichlänge messen (Spec §11, „Offen").

- **Schmaler Satin als Linie.** Bis 1,5 mm ohne Unterlage, die Ecke dreht mit. Wir legen unter
  3 mm einen Mittellauf.
- **Zugausgleich.** Bei StitchPencil stickt eine 1-mm-Säule etwa 1,2 mm breit, bei uns 1,4 mm:
  Wir geben mindestens 0,2 mm je Seite (§7.2). Gemessen an den Profi-Dateien:
  - Elektrotechnik Yer: 0,06 mm je Seite, wir 0,26 mm.
  - Christliche Gemeindereitschule: etwa 0,07 mm, wir 0,13 mm. Die Lage der Puncher-Datei ist dort
    nur auf etwa 0,2 mm genau angepasst.
- **Teilen breiter Säulen.** Ab etwa 10 mm, versetzt; wir teilen ab 7 mm (`SATIN_SPLIT_MM`).
- **Prüfbericht.** Fadenlagen am fertigen Stichplan zählen statt an den Umrissen. Eine Stelle
  erst ab einigen Nadelbreiten im Quadrat melden, einen Knoten dagegen in jeder Größe. „Faden liegt
  offen auf dem Stoff" als eigener Befund.
- **Gleiche Garne zusammenlegen.** StitchPencil legt nur exakt dasselbe Garn zusammen, ähnliche
  Farben nicht. Das spricht dafür, die Schwelle für „dieselbe Nadel?" in der Farbfolge-Datei bei
  einem RGB-Abstand von 8 zu lassen (§13.4).
- Schon da: Garnstärke 60 rechnet mit 80 % des Abstands (`densityFactor`, §14). StitchPencil
  leitet denselben Wert aus der Wurzel der Garnfeinheit her.
- Lizenz: StitchPencil liefert Ink/Stitch-Schriften mit und überlässt die Lizenzfrage dem
  Anwender. Unsere Sperre der neun CC-BY-NC-Schriften für Kundenaufträge gilt dort genauso.

## Mindestgrößen-Tor (01.10.2026)

- **Zierteile bestimmen die Mindestgröße.** Von sieben vergrößerten Messungen bestimmt nur bei
  Eislingen Schrift (Bruchstück der Pinselschrift); sonst eine Randlinie ums Schriftband
  (STUTTGART), ein blauer Zwickel von 0,8 × 2,7 mm im Äskulapstab (Köln), das Innenohr des Pferds
  (Atzensport), ein Lichtreflex in der Nüster. Ein Puncher vergrößert für solche Teile kein Logo, er
  stickt sie als Laufstich oder schmalen Satin. Denkbar: Schrift erkennen und nur sie die Größe
  bestimmen lassen, oder eine Flächengrenze für Größentreiber. Entscheiden mit den Profi-Paaren
  (Phase 1b Schritt 6) und dem Probestick.
- **Kleine Formen messen nicht proportional** (Mittelachse mit Abtastung): Köln-Zwickel 0,91 mm bei
  131 mm, 1,14 mm bei 144 mm; ein Splitter von 1,5 × 0,75 mm 0,995 mm bei 103 mm, 0,842 mm bei
  104 mm. Die Suche prüft deshalb von der gefundenen Größe nach unten; dass jede größere hält, ist an
  sechs Logos bis 40 mm darüber gemessen, nicht bewiesen. Feinere Abtastung für kleine Formen
  könnte das glätten.
- **Rahmen:** Die Rahmenzeile misst die Umrisse (ohne Zugausgleich), `analyze()` die Stiche; knapp
  unter dem Rahmenmaß kann `analyze()` noch warnen. Ein Rand zwischen Stickfeld und Rahmen ist nicht
  berücksichtigt.

## Nacharbeit-Datei und Ink/Stitch 3.3.0 (30.09.2026)

- **Am Arbeitsplatz prüfen** (Nutzer): die Nacharbeit-Datei in Inkscape mit Ink/Stitch 3.3.0 öffnen
  — kein Dialog, Ebenenfolge, Ebene „Prüfstellen" einblenden, Parameter eines Objekts, Simulator.
  Hier gibt es kein Inkscape; abgeleitet ist das aus dem Quelltext und kopflosen Läufen.
- **`output` startet in rund 12 s**, fast alles in `ThreadCatalog()` (150 Farbpaletten, für die DST
  ohne Wirkung). Probeweise mit einem Eingriff in `run.py` (nicht eingebaut): `output` auf der
  Hofbräu-Vorlage 9,0 statt 19,7 s, dieselbe DST. Mit der Nacharbeit-Datei läuft `output` zweimal
  mehr (Prüfung, PES). Entscheidung offen, ob `run.py` den Katalog für DST/PES überspringen soll.
- **Kein Schalter für die Nacharbeit-Datei.** Sie kostet je Lauf 20–60 s (STUTTGART 252 mm: 65 s,
  davon 62 s PES). Für Messreihen wäre `--ohne-nacharbeit` nützlich.
- **Lage der Prüfstellen** ist die Mitte der Objekt-Box; bei langen, dünnen Objekten liegt der
  Kreis nicht immer auf dem Objekt (darum steht die Kennung im Text). Besser: ein Punkt auf der
  Form selbst. Bei Köln sind es 350 Prüfstellen — die Vorschau wird dicht.
- **Rückfall-Gründe englisch.** Die Texte bei „Rückfall Tatami/Laufstich" kommen aus den
  `Warning`-Meldungen der Vorlage (Code englisch); in der Nacharbeit-Datei sollten sie deutsch sein.

## Probestick-Stand und Atzensport aus dem PDF (29.09.2026)

Beim Erzeugen der fünf Probestick-Dateien und beim Umstieg von der Atzensport-Nachzeichnung auf das
Vektor-PDF des Nutzers (Zahlen in `docs/umsetzungsstand.md`).

- **Die Mindestgröße springt mit der Prüfgröße (Spec-Frage §5.2).** §5.2 misst die Satinstriche in
  der Größe, in der geprüft wird. Wird ein Motiv größer, wird ein Strich, der vorher Laufstich war, ab
  0,7 mm Satin (§7.8.1) — und fordert dann 1,3 mm. STUTTGART in 80 mm: Mindestgröße 118 mm (bestimmt
  von „CYS SPORTS", 0,88 mm); dasselbe Motiv in 120 mm (`--breite 120`): 223 mm, bestimmt von einem
  grauen Strich, der dort 0,70 mm breit ist (in 80 mm 0,47 mm, Laufstich). Atzensport aus dem PDF: in
  80 mm 147 mm (goldene Schattenlinie 0,71 mm), in 200 mm 296 mm (ein Haarstrich der Schrift, dort
  0,88 mm, in 80 mm 0,35 mm). Die Zahl aus der kleinen Größe gilt also nur, solange kein weiterer
  Strich über 0,7 mm wächst. Denkbar: die Mindestgröße über die Größen suchen (die kleinste, in der
  kein Satinstrich zwischen 0,7 und 1,3 mm liegt), oder schmale Satinstriche als eigene Klasse
  zulassen (nächster Punkt).
- **1,3 mm ist für Schattenlinien zu streng (Spec-Frage §5.2).** Die Profi-Mütze „Stuttgarter
  Hofbräu" zeigt die goldenen Schattenlinien in 110 mm sauber gestickt; gezeichnet sind sie dort
  0,75 mm breit. Unsere Prüfung verlangt für dasselbe Motiv 202 mm, für Atzensport aus dem PDF
  (goldener Schatten 0,71 mm in 80 mm) 147 mm. Die 1,3 mm stammen aus dem p5 der typischen
  Satinbreite je Archivdatei (Median je Datei), beschreiben also die übliche Säule einer Datei, nicht
  die schmalste, die hält. Erst den Probestick der Hofbräu-Datei abwarten.
- **Nahe Farben werden eigene Farbblöcke.** Im Atzensport-PDF tragen die Umlautstriche des „ä" ein
  Rot #D1070D, die übrige Schrift #E00310 — für die Vorlage zwei Farben, für jeden Sticker ein Faden.
  Die Vorlage stickt die Umlautstriche als achten Farbblock zuletzt. Denkbar: Farben unter einem
  kleinen Abstand zusammenlegen und das in der Ausgabe nennen (§10.1 sagt dazu nichts).
- ~~**Der Importer übergeht den Ursprung der viewBox.**~~ _Erledigt 30.09.2026 (`77099ef`, mit der
  Nacharbeit-Datei, Spec §13.4): der Importer zieht den Ursprung ab, dann skaliert er. Hofbräu
  9.425 → 9.420 Stiche, Atzensport aus dem PDF 12.450 → 12.411; Logos mit Ursprung 0 unverändert._
  Vorher lagen die Formen einer PDF-SVG um den Ursprung verschoben (Hofbräu: 76 mm in y), und die
  Lagen in den Berichten stimmten nicht („path33 bei (36.9, 88.3) mm" im 51 mm hohen Motiv).
- **Atzensport 80 mm: die Trims bleiben auch aus dem PDF über p90** (9,16 statt 9,70 je 1000). Die
  raue Nachzeichnung war nicht die Ursache; 27 der 114 Trims setzt §10.2 (Sprung ab 5 mm), die
  übrigen setzt Ink/Stitch selbst (u. a. `auto_satin --trim`, siehe `inkstitch/README.md`). Dasselbe bei der
  Hofbräu-Mütze (9,76 je 1000, zwei Farben). Offen, wie weit das der Motivart geschuldet ist (viele
  einzelne Buchstaben mit Schatten) — der Probestick zeigt, ob es stört.
- **STUTTGART 120 mm: Nadelhäufung 9.** Eine Zelle, in der drei Farblagen einstechen (Schwarz 2,
  Grau 4, Schwarz 3 Einstiche); über dem Archiv (Maximum 8, aus nur vier Dateien).

## Ink/Stitch-Vorlage, Zugausgleich je Rail und Profi-Vergleich Hofbräu (29.09.2026)

Nach der Rücknahme von §4.2 (Spec §4.2 neu gefasst) und dem neuen §7.8.3 „Zugausgleich lässt
Stofflücken offen" umgesetzt (`50d4ca7`, `rail-pull.ts`) und am Hofbräu-Motiv (Vorlage aus dem PDF des
Nutzers, nicht im Repo; 110 mm, Preset `cap`, 19 rote Buchstaben von 2,4 mm, 60 goldene
Schattenlinien von 0,75 mm) und an den sechs Kundenlogos gemessen.

- **Der Spalt bleibt offen.** Abstand der Einstiche Gold → nächster roter Einstich in der DST
  (goldene Einstiche mit einem roten innerhalb von 1,2 mm; Median, Anteil unter 0,3 mm), dazu der
  gezeichnete Abstand der Konturen im Entwurf:

  | Ausschnitt            |   gezeichnet | symmetrisch (§7.2) | je Rail (§7.8.3) |
  | --------------------- | -----------: | -----------------: | ---------------: |
  | ganzes Motiv          | 0,465 (19 %) |        0,30 (49 %) |      0,50 (21 %) |
  | „Ho" von Hofbräu      | 0,476 (23 %) |        0,28 (52 %) |      0,50 (30 %) |
  | „Stu" von Stuttgarter | 0,394 (23 %) |        0,32 (48 %) |      0,41 (24 %) |

  Symmetrisch schrumpft der Spalt um rund 0,2 mm (die Hälfte der goldenen Einstiche hat einen roten
  unter 0,3 mm neben sich), je Rail liegt er wieder beim gezeichneten Wert. In den Bildern
  (12 bis 100 Pixel je mm, Garnfarben auf Schwarz) liegt zwischen Rot und Gold schwarzer Stoff,
  vorher berühren sich beide. Stiche 9.446 → 9.426, Nadelhäufung 8 → 6, 28 Säulen unter 1,0 mm
  und 93 Rails am Stoffspalt ohne Ausgleich (61 an breiten, 32 an schmalen Säulen; kleinster Spalt
  0,17 mm).

- **Regel (b) — entschieden am 29.09.2026: nur für Säulen am Stoffspalt (Nutzerentscheidung, Spec
  §7.8.3 Regel 2 in `a622fff`).** Die Frage war, ob „Säule unter 1,0 mm ohne Ausgleich“ für alle
  schmalen Säulen gelten soll oder nur für die an einem Stoffspalt. Im Versuch (Scratchpad, beide
  Regeln einzeln abschaltbar) gab „Rail am Stoffspalt ohne Ausgleich“ (a) allein am Hofbräu-Motiv
  dieselbe Verteilung (Median 0,50, 21 % unter 0,3 mm), denn beide Rails, die sich gegenüberliegen,
  sind ausgenommen; (b) für alle schmalen Säulen änderte daran nichts, verschlechterte aber die
  Kennzahlen: STUTTGART 80 mm Nadelhäufung 7 → 10 und Zellen über 18 5 → 7, Köln 30 → 40 und Zellen ab 6
  Einstichen 11 → 15, Atzensport 200 mm 3 → 5. Die Zelle mit 10 Einstichen liegt an einer
  Zickzackspitze am Ende einer schmalen Säule. Umgesetzt und gemessen (`rail-pull.ts`, Preset
  `pique`, Regel (b) für alle schmalen → nur am Stoffspalt): STUTTGART 80 mm Nadelhäufung 10 → 7,
  Zellen über 18 7 → 5 (dieselben Kennzahlen wie vor §7.8.3, §16 mit Nadelhäufung ≤ 8 wieder
  erreicht); Köln Zellen über 18 40 → 30, ab 6 Einstichen 15 → 11 (DST byte-gleich mit dem Stand vor
  §7.8.3); Atzensport 200 mm Zellen ab 6 5 → 3; Atzensport 80 mm Zellen über 18 1 → 3, Dichtespitze
  23 → 24 (die Rail-Regel (a) bleibt); STUTTGART 250 mm und Eislingen unverändert. Hofbräu-Mütze
  unverändert: alle 28 Säulen unter 1,0 mm liegen an einem Stoffspalt, keine bekommt den Ausgleich
  zurück, die Vorlage ist byte-gleich, der Spalt Rot/Gold gleich (Median 0,50 mm ganz und „Ho“,
  0,41 mm „Stu“; 21 % / 30 % / 24 % unter 0,3 mm). Zahlen je Logo: `docs/umsetzungsstand.md`,
  „Regel 2 eingeschränkt“.
- **Was die Spec offenließ.** (1) Untergrenze des Spalts: 0,1 mm (die DST-Auflösung, wie §5.2
  Regel 3); ein Spalt darunter ist eine Haarnaht zwischen gezeichneten Formen, die der Faden ohnehin
  schließt. Ohne Untergrenze bekämen berührende Formen mit Nähten von 0,01 mm keinen Ausgleich.
  (2) Der Median über die Säule: liegt die andere Form nur an einem Teil der Säule (weniger als die
  Hälfte der Sprossen), behält die Rail ihren Ausgleich. (3) Eine Säule ohne Sprossen (kurzer
  Balken mit schrägen Enden) hat nichts, woran sich messen ließe, und behält ihren Ausgleich.
  (4) Ink/Stitchs `pull_compensation_percent` setzt die Vorlage nicht; dort ist nichts asymmetrisch zu
  setzen.
- **Offen: der Zug der Tatami-Flächen.** §7.8.3 gilt für Satinsäulen. Tatami-Flächen bekommen Zug 0,2 mm
  entlang der Reihen und Schub 0,1 mm quer dazu im Umriss (`compensateArea`, §8.1.1) und wachsen so
  ebenfalls in einen Stoffspalt zu einer Nachbarform hinein; die Spec sagt dazu nichts.

## Ink/Stitch-Vorlage, Folge von Schritt 3 (29.09.2026) — §4.2 gemessen, Farbfolge-Variante, Breite

_(Nachtrag: §4.2 ist am selben Tag zurückgenommen worden, die Messungen unten sind die Begründung
(Spec §4.2 in `1ceb429`, Rücknahme im Code in `1c9aa6d`; beide Wege bleiben als Optionen).)_

Nach der Entscheidung des Nutzers (Spec §4.2, §7.8.5, §8.8 nachgezogen) umgesetzt und an den
sechs Kundenlogos gemessen: Preset `pique`, kalter Ink/Stitch-Cache, Vergleich mit dem Stand nach
Punkt 4 von Schritt 3. Die Zahlen je Punkt stehen auch in den Commit-Nachrichten (`42cdd31`,
`febaeac`, `fc4e1c8`, `281833d`, `dffac53`). Die Spec ist an keiner Stelle geändert; wo eine
Regel nicht bringt, was §4.2 von ihr erwartet, steht die Frage mit Zahlen hier.

- **§4.2 Regel 1 (Satin spart die Tatami-Fläche darunter aus) verbessert die Kennzahlen nicht —
  Spec-Frage.** Umgesetzt wie beschrieben (`cutOutSatin` in `knockdown.ts`); gemessen, Stand nach
  Punkt 4 → mit Regel 1:

  | Motiv             |          Stiche |  Dichte | Zellen >18 | Nadel | Zellen ≥6 |   Sprünge |     Trims | ausgespart |
  | ----------------- | --------------: | ------: | ---------: | ----: | --------: | --------: | --------: | ---------: |
  | STUTTGART 80 mm   | 13.578 → 15.370 | 22 → 27 |     5 → 14 | 7 → 7 |     3 → 8 |  89 → 100 |   46 → 50 |    202 mm² |
  | STUTTGART 250 mm  | 74.674 → 79.432 | 29 → 29 |    15 → 25 | 9 → 9 |   33 → 31 | 198 → 221 |   57 → 62 |   2927 mm² |
  | Köln 90 mm        | 20.711 → 20.711 | 29 → 29 |    30 → 30 | 8 → 8 |   11 → 11 | 168 → 168 |   85 → 85 |          0 |
  | Eislingen 200 mm  | 32.669 → 32.639 | 20 → 20 |      1 → 1 | 6 → 6 |     1 → 1 | 341 → 341 | 146 → 146 |     25 mm² |
  | Atzensport 80 mm  | 12.005 → 12.544 | 23 → 23 |      3 → 3 | 7 → 7 |     2 → 2 | 226 → 226 | 116 → 116 |    176 mm² |
  | Atzensport 200 mm | 46.508 → 45.695 | 22 → 24 |      4 → 4 | 6 → 7 |     3 → 3 | 496 → 496 | 115 → 115 |   1846 mm² |

  Die Beobachtung in §4.2 stimmt (unter Satin lagen 3–10 % aller Stiche, dort die meisten
  Zellen über 18), der Schluss nicht: von den Zellen über 18, die vorher unter Satin lagen
  (aus den Stichlisten, ohne Verriegelungen), verschwinden STUTTGART 80 mm 1 von 2, 250 mm 1 von
  13, Köln 0 von 4, Atzensport 200 mm 0 von 1. Satin- und Linienstiche bleiben, wie sie sind,
  alle Mehrstiche stehen im Tatami (STUTTGART 80 mm 11.698 → 14.658, 250 mm 70.173 → 78.892,
  Atzensport 80 mm 6.846 → 7.973, 200 mm 40.953 → 42.198). Grund: jede Reihe, die eine
  Satinform kreuzt, endet an deren Kante und setzt dahinter neu an — zwei Reihenenden statt
  eines durchlaufenden Stichs, und jedes neue Teil bekommt Verriegelung, Sprung und Trim
  (STUTTGART 80 mm: Tatami-Objekte 8 → 18). Diese Reihenenden liegen an der Satinkante, wo die
  Zellen schon vom Satin fast voll sind; ausgespart werden nur 202 mm² Fläche, das sind rund
  130 Stiche (bei 0,4 mm Reihenabstand und 4 mm Stichlänge).

  Versuche an STUTTGART 80 mm (Scratchpad, nicht übernommen): Satin-Unterlappung 0,5 mm statt
  0,2 mm — 13.921 Stiche, Dichte 25, Zellen über 18: 12, aber nur noch 45 mm² ausgespart, weil
  schmale Striche aus dem Schnitt fallen; Teile unter 3 mm² nicht sticken, allein — 15.299
  Stiche, Dichte 24, 12 Zellen; beides — 13.923 Stiche, 25, 12. Ohne Regel 1: 13.578, 22, 5
  Zellen. Fragen: Ist das Ziel die Stichzahl, die Dichte oder die doppelte Deckung unter der
  Schrift (Steife des Stickbilds)? Wenn die Dichte, hilft das Aussparen bei diesem Preset nicht;
  wenn die Deckung, braucht es den Probestick, nicht die Kennzahl. Eine Regel „nur Flächen
  aussparen, die der Satin mit mindestens N mm Breite deckt" (breite Buchstaben ja, dünne Striche
  nein) verhielte sich wie die 0,5 mm Unterlappung.

- **§4.2 Regel 2 (angrenzende Flächen greifen 0,3 mm statt 0,8 mm) macht Köln schlechter —
  Spec-Frage.** Nur Köln bewegt sich (STUTTGART 250 mm, Eislingen und Atzensport unverändert bis
  auf ±30 Stiche, STUTTGART 80 mm +52 Stiche): 20.711 → 20.274 Stiche, Dichte 29 → 32, Zellen
  über 18 30 → 33, Nadelhäufung 8 → 10, Zellen ab 6 Einstichen 11 → 16, Sprünge 168 → 180, Trims
  85 → 91. Die Kurve über die Weite ist nicht monoton:

  | Weite der Regel 5 |        0 |      0,2 |      0,3 |      0,5 |      0,6 |      0,8 |
  | ----------------- | -------: | -------: | -------: | -------: | -------: | -------: |
  | Stiche            |   19.848 |   19.776 |   20.274 |   20.537 |   20.683 |   20.711 |
  | Dichtespitze      |       26 |       26 |       32 |       29 |       29 |       29 |
  | Zellen über 18    |       15 |       16 |       33 |       33 |       27 |       30 |
  | Nadelhäufung      |        6 |        7 |       10 |        9 |        8 |        8 |
  | Zellen ab 6       |        5 |        6 |       16 |       17 |        8 |       11 |
  | Sprünge / Trims   | 160 / 81 | 164 / 82 | 180 / 91 | 171 / 88 | 166 / 83 | 168 / 85 |

  0,3 mm ist die schlechteste getestete Weite; ohne Regel 5 (die Beobachtung, auf die §4.2 sich
  stützt) und mit 0,2 mm halbieren sich die Zellen. Die meisten heißen Zellen in Köln sitzen
  (Zählung aus den Stichlisten) an den Nähten der Flächen `z03` (schwarz), `z06` und `z17`
  (blau), wo die Randstreifen von drei Flächen in eine Zelle fallen. Was die Regel gegen den
  „Blitzer" an der Naht leistet (§8.1.2), zeigt nur der Probestick; für die Kennzahlen sind 0
  und 0,2 mm die bessere Weite, ob sie an der Naht einen Blitzer lassen, ist offen.

- **Farbfolge-Variante `--ueberlappung <mm²>` (Option `minOverlapMm2` der Vorlage): 20 mm²
  verdeckt Einzelheiten, eine relative Schwelle nicht — Spec-Frage.** Der Standard bleibt §10.1
  (jede Überlappung bindet); die Variante steht nur zur Sichtprüfung da. `pnpm inkstitch <svg>
--ueberlappung 20` nennt die Überlappungen, deren Reihenfolge umdreht (Kennung, Farbe, mm², Lage
  in mm), `out/<name>.tausch.json` hat alle; Ausschnitte vorher/nachher je Stelle liegen im
  Scratchpad der Sitzung. Standard → 20 mm²:

  | Motiv             |          Stiche |  Dichte | Zellen >18 |  Nadel | Zellen ≥6 |   Sprünge |     Trims | Blöcke |  umgedreht (andere Farbe) |
  | ----------------- | --------------: | ------: | ---------: | -----: | --------: | --------: | --------: | -----: | ------------------------: |
  | STUTTGART 80 mm   | 15.422 → 15.074 | 27 → 30 |    15 → 12 |  7 → 8 |     8 → 9 |  99 → 100 |   50 → 51 |  6 → 3 | 25 (215 mm², größte 15,6) |
  | STUTTGART 250 mm  | 79.432 → 79.262 | 29 → 29 |    25 → 26 |  9 → 9 |   31 → 30 | 221 → 224 |   62 → 62 |  6 → 6 |    4 (17 mm², größte 4,4) |
  | Köln 90 mm        | 20.274 → 20.427 | 32 → 30 |    33 → 30 | 10 → 7 |   16 → 13 | 180 → 189 |   91 → 99 | 15 → 6 | 61 (1,5 mm², größte 0,73) |
  | Eislingen 200 mm  | 32.639 → 32.263 | 20 → 20 |      1 → 1 |  6 → 6 |     1 → 1 | 341 → 350 | 146 → 146 |  6 → 6 |       0 (1 gleiche Farbe) |
  | Atzensport 80 mm  | 12.544 → 12.486 | 23 → 23 |      3 → 4 |  7 → 7 |     2 → 4 | 226 → 219 | 116 → 117 |  7 → 5 |  22 (95 mm², größte 12,9) |
  | Atzensport 200 mm | 45.676 → 45.236 | 24 → 24 |      4 → 4 |  7 → 7 |     3 → 4 | 496 → 348 | 115 → 114 |  8 → 6 |  17 (82 mm², größte 14,1) |

  Die Kennzahlen bewegen sich wenig; was sich ändert, ist das Bild: eine kleine Fläche, die im
  Standard oben liegt, wird vor der großen gestickt und liegt danach darunter. STUTTGART 250 mm
  verliert die beiden Augen des Pferds, STUTTGART 80 mm die Schrift im Band und den grauen Rand
  der Bandenden, Atzensport dunkle Einzelheiten im Kopf des Pferds. Was in Köln umdreht, sind
  Randstreifen von unter 0,75 mm² (61 Stellen, zusammen 1,5 mm²).

  Die umgedrehten Überlappungen trennen sich klar nach dem Anteil an der **kleineren** der beiden
  Formen: was Einzelheiten verdeckt, deckt 26 bis 100 % von ihr (STUTTGART 250 mm, Atzensport 80
  mm und zwölf von 17 in Atzensport 200 mm: 100 %; STUTTGART 80 mm 22 von 25 über 25 %), was
  eine Naht ist, unter 7 % (Köln alle, größter Anteil 6,2 %, meist unter 1 %). Eine **relative**
  Schwelle („bindet, wenn die Überlappung mindestens 5 % der kleineren Form deckt") behielte
  alle Einzelheiten und gäbe die Nähte frei. Blöcke Standard → relativ 5 % (Scratchpad-Versuch
  an `coverPrecedence`, nicht im Repo): STUTTGART 80 mm 6 → 6, 250 mm 6 → 6, Eislingen 6 → 6, Köln
  15 → 6 (57 Stellen, zusammen 1,5 mm², höchstens 3,7 % der kleineren Form), Atzensport 80 mm
  7 → 6 (5 Stellen, 0,08 mm²), 200 mm 8 → 7 (20 Stellen, 0,49 mm²). Läufe mit dieser Schwelle:

  | Motiv             |          Stiche |  Dichte | Zellen >18 |   Nadel | Zellen ≥6 |   Sprünge |     Trims | Blöcke |
  | ----------------- | --------------: | ------: | ---------: | ------: | --------: | --------: | --------: | -----: |
  | Köln 90 mm        | 20.274 → 20.358 | 32 → 32 |    33 → 40 | 10 → 10 |   16 → 15 | 180 → 185 |   91 → 96 | 15 → 6 |
  | Atzensport 80 mm  | 12.544 → 12.561 | 23 → 23 |      3 → 3 |   7 → 6 |     2 → 3 | 226 → 217 | 116 → 117 |  7 → 6 |
  | Atzensport 200 mm | 45.676 → 45.699 | 24 → 22 |      4 → 3 |   7 → 7 |     3 → 3 | 496 → 392 | 115 → 114 |  8 → 7 |

  Die höchstens 4 Blöcke für STUTTGART 80 mm (§16) erreicht keine Schwelle ohne Schaden:
  relativ 5 % lässt es bei 6 (nichts unter 5 % dreht um), relativ 25 % gibt 5 (Blöcke nur
  gezählt, nicht angesehen), 20 mm² gibt 3 und verdeckt dafür Schrift und Rand.

- **Ink/Stitch-Altdokument-Modus: die Version 4 in der Vorlage ändert das Ergebnis und macht
  Nadelhäufung schlechter — nicht übernommen.** Die Vorlage trägt weiter keine
  `inkstitch_svg_version`. Mit `<metadata><inkstitch:inkstitch_svg_version>4</…>` (Scratchpad-Kopie,
  gleicher Stand sonst) rechnet Ink/Stitch die Satinsäulen der Vorlage mit den neuen
  Vorgaben statt mit denen, die das Update alter Dokumente (`lib/update.py`) setzt
  (`start_at_nearest_point` und `end_at_nearest_point` aus, `reverse_rails` `none`); Standard →
  Version 4:

  | Motiv             |          Stiche |  Dichte | Zellen >18 |   Nadel | Zellen ≥6 |   Sprünge |     Trims |
  | ----------------- | --------------: | ------: | ---------: | ------: | --------: | --------: | --------: |
  | STUTTGART 80 mm   | 15.422 → 14.945 | 27 → 27 |    15 → 17 |   7 → 9 |     8 → 7 |   99 → 98 |   50 → 49 |
  | STUTTGART 250 mm  | 79.432 → 76.164 | 29 → 31 |    25 → 25 |  9 → 10 |   31 → 36 | 221 → 209 |   62 → 61 |
  | Köln 90 mm        | 20.274 → 20.033 | 32 → 28 |    33 → 36 | 10 → 10 |   16 → 21 | 180 → 178 |   91 → 91 |
  | Eislingen 200 mm  | 32.639 → 32.480 | 20 → 27 |      1 → 2 |   6 → 7 |    1 → 10 | 341 → 327 | 146 → 146 |
  | Atzensport 80 mm  | 12.544 → 12.707 | 23 → 27 |      3 → 4 |   7 → 8 |    2 → 11 | 226 → 216 | 116 → 116 |
  | Atzensport 200 mm | 45.676 → 44.420 | 24 → 22 |      4 → 7 |   7 → 7 |    3 → 15 | 496 → 468 | 115 → 115 |

  Fünf von sechs Logos bekommen mehr Zellen über 18 und mehr Zellen ab 6 Einstichen (bis
  3 → 15), vier eine höhere Nadelhäufung — „nichts schlechter" gilt nicht. Ein Weg dahin wäre,
  die Version zu setzen und die drei Vorgaben ausdrücklich an jede Säule zu schreiben; das
  sollte am Ergebnis nichts ändern (nicht gemessen) und spart nur das Update im ersten Lauf.

- **`--breite <mm>`:** STUTTGART 80 mm auf 120 mm (Faktor 1,5, Endstand mit §4.2): 27.836
  Stiche, 133 Sprünge, 54 Trims (1,94 je 1000, Archiv 1,9), 6 Farbblöcke, Dichtespitze 28,
  Zellen über 18: 16, Nadelhäufung 9 (Archiv 6, über allem), 17 Zellen ab 6 Einstichen (bei
  80 mm 8), Fäden auf dem Stoff 0; Satin 30 statt 24 Formen, Laufstich 8 statt 16, Tatami 22
  statt 17. Gemeint ist die Breite der Zeichenfläche; das Motiv darin ist etwas schmaler
  (119,0 mm im DST).

## Ink/Stitch-Vorlage, Schritt 3 (29.09.2026) — offen und Spec-Fragen

Was bei den Punkten 0 bis 4 auffiel und nicht mehr in den Schritt gehört. Zahlen: die sechs
Kundenlogos, Preset `pique`, Stand nach Punkt 4 (`docs/umsetzungsstand.md`). Die Spec ist an
keiner Stelle geändert; wo eine Regel stört, steht die Frage mit Zahlen hier.

- **Farbblöcke „höchstens 4" (STUTTGART 80 mm) gehen unter §10.1 nicht — Spec-Frage.** §10.1
  verbietet, zwei sich überlappende Objekte zu vertauschen, „ein Haar Überlappung ist auch eine
  Überlappung". STUTTGART 80 mm hat zwei Farben, aber eine Kette von sechs Flächen, die
  abwechselnd schwarz und grau übereinanderliegen (`z04-000000-003` → `z05-bebebe-001` →
  `z08-000000-001` → `z09-bebebe-001` → `z12-000000-001` → `z13-bebebe-011`): sechs Blöcke sind
  das Minimum, und die Suche findet es (mit zehnfach größerem Strahl dasselbe). Ab welcher
  Überlappung die Reihenfolge zählt, bestimmt die Zahl der Blöcke:

  | Überlappung zählt ab | jede (§10.1) | 1 mm² | 4 mm² | 20 mm² | 100 mm² |
  | -------------------- | -----------: | ----: | ----: | -----: | ------: |
  | STUTTGART 80 mm      |            6 |     6 |     6 |      3 |       3 |
  | STUTTGART 250 mm     |            6 |     6 |     6 |      6 |       3 |
  | Köln 90 mm           |           15 |     6 |     6 |      6 |       6 |
  | Eislingen 200 mm     |            6 |     6 |     6 |      6 |       6 |
  | Atzensport 80 mm     |            7 |     6 |     6 |      5 |       5 |
  | Atzensport 200 mm    |            8 |     7 |     6 |      6 |       5 |

  20 mm² ist die Schwelle des Knockdowns (§4.1): darunter wird nichts ausgeschnitten, die
  Reihenfolge entschiede dort nur, welcher Faden obenauf liegt. Dieselbe Schwelle für beide wäre
  der Vorschlag; er würde in der Vorlage nur `minOverlapMm2` an `sequenceByColour` reichen.
  _(Stand 29.09.: als Variante `--ueberlappung` gebaut, die Sichtprüfung macht der Nutzer; 20 mm²
  verdecken Einzelheiten, eine relative Schwelle nicht — siehe oben.)_

- **Regel 5 des Knockdowns (berührende Flächen wachsen 0,8 mm unter die spätere) — Spec-Frage.**
  Ohne sie ändert sich nur Köln spürbar (die übrigen fünf um höchstens 1 Dichtespitze und 31
  Stiche): Zellen über 18 Stichen 30 → 15, Nadelhäufung 8 → 6, Zellen ab 6 Einstichen 11 → 5,
  Stiche 20.711 → 19.838. Was die Regel verhindert (ein „Blitzer" an der Naht, §8.1.2), lässt
  sich nur am Probestick sehen.
  _(Stand 29.09.: entschieden, §4.2 Regel 2 — 0,3 mm; gemessen macht das Köln schlechter, siehe
  oben.)_
- **Satin auf Tatami-Grund (§4.1: nur Fill schneidet und nur aus Fill) — Spec-Frage.** Fläche
  der Satinformen, die über früher gestickter Tatami liegt, und Tatami-Stiche darunter:

  | Motiv             | Satin über Tatami | Tatami-Stiche darunter | Anteil aller Stiche |
  | ----------------- | ----------------: | ---------------------: | ------------------: |
  | STUTTGART 80 mm   |   410 von 916 mm² |                    684 |               5,2 % |
  | STUTTGART 250 mm  | 3694 von 5704 mm² |                  5.290 |               7,1 % |
  | Köln 90 mm        |    98 von 892 mm² |                  1.936 |               9,8 % |
  | Eislingen 200 mm  |  127 von 3823 mm² |                    997 |               3,2 % |
  | Atzensport 80 mm  |  351 von 1262 mm² |                    501 |               4,6 % |
  | Atzensport 200 mm | 2339 von 3957 mm² |                  2.882 |               6,3 % |

  Von den Zellen über 18 Stichen (aus der Stichliste, ohne Verriegelungen) liegen in
  STUTTGART 80 mm 2 von 2, in STUTTGART 250 mm 13 von 17 dort, wo Satin über Tatami liegt.
  _(Stand 29.09.: entschieden, §4.2 Regel 1; gemessen bringt das Aussparen die Zellen nicht
  weg und kostet Stiche, siehe oben.)_

- **Gitterunterlage nur auf einem Teil der Tatami-Fläche.** Ink/Stitchs `fill_underlay` zerlegt
  ausgefranste Flächen in Stücke, die es ohne Fadenschnitt abfährt (`tatami.ts`). Die Vorlage
  setzt sie nur, wo der Einzug ein breites Stück ist (`gridUnderlay`); Anteil der Tatami-Fläche
  mit Unterlage: STUTTGART 80 mm 81 %, 250 mm 88 %, Köln 4 %, Eislingen 96 %, Atzensport 80 mm
  17 %, 200 mm 99 %. Der Rest trägt der Deckstich allein. Vollständig ginge es mit der Unterlage
  als eigene Fill-Objekte je Stück (geöffnet nach §8.6 `keepWide`, nächstes zuerst nach §8.5),
  zwischen denen `jump_to_trim` schneiden kann; dort gehörte auch die Konturunterlage hin, die
  eine Füllung von Ink/Stitch nicht hat.
- **`jump_to_trim` sieht Sprünge innerhalb eines Elements nicht.** Die Vorlage hält deshalb
  jedes Tatami einteilig (Teile werden Objekte, ein kompensiertes Polygon wird vor dem Schreiben auf
  das 1-µm-Raster gelegt, damit shapely es nicht in mehrere zerlegt). Was Ink/Stitch selbst
  zerlegt, bleibt ohne Fadenschnitt; `pnpm inkstitch` zählt es als „Fäden auf dem Stoff"
  (alle sechs Läufe: 0).
- **Schub zerlegt Haarflächen (§8.1.1) — Spec-Frage.** Eislingen 200 mm hat zwei Flächen von
  42 und 18 mm², die unter dem Schub von 0,1 mm in 55 und 110 Teile zerfallen (108 unter
  1 mm²). Als Objekte kostet jedes Teil Trim und Sprung: Trims/1000 4,1 → 6,6, Sprünge/1000
  9,6 → 16,1. Die Vorlage gibt solchen Flächen nur den Zug. Die Spec sagt nur, was bei
  völligem Verschwinden geschieht.
- **Farbblöcke Köln 15, Atzensport 7 und 8** liegen über der Untergrenze aus den Ketten
  (11, 5, 5), weil sie nicht erreichbar ist (die Suche liefert mit zehnfach größerem Strahl
  dasselbe).
- **Atzensport 80 mm: Trims/1000 9,7 (Ziel 5,6).** 124 Objekte auf 12.005 Stiche, davon 15
  Formen unter 1 mm²; §5.2 (Mindestgröße) meldet sie künftig, die Vorlage lässt sie stehen.
- **Ink/Stitch-Altdokument-Modus.** Die Vorlage trägt keine `inkstitch_svg_version`; im ersten
  Lauf wendet Ink/Stitch die Updates alter Dokumente an (Satin `start_at_nearest_point` und
  `end_at_nearest_point` aus, `reverse_rails` auf `none`, Füllung `max_stitch_length_mm` 3
  wo keiner steht). _(Gemessen 29.09.: die Version 4 ändert das Ergebnis und verschlechtert
  Nadelhäufung, nicht übernommen — Zahlen oben.)_
- **Spec §7.8.5** sagt „sonst bleibt sie Tatami"; seit Punkt 0 läuft eine Form unter 1,0 mm,
  die als Säule nicht hält, als Laufstich entlang der Achse. _(Erledigt: Spec nachgezogen,
  `d8df0c9`.)_

## Satin für Schrift und schmale Formen — offen (28.09.2026)

Eigene Satinsäulen (`packages/engine/src/inkstitch/`: `strokes.ts` Strichplan,
`columns.ts` Säulen, `template.ts` Vorlage) statt `fill_to_satin`; `pnpm inkstitch` setzt
Schrift jetzt als Satin, `--tatami` behält den reinen Tatami-Lauf.

- **Blöcke an Strichenden sind keine eigenen Säulen.** Fuß des Varsity-„T", Zunge des
  „G", Tropfenserifen: der Block gehört zum Ende des Strichs, der ihn trägt, die Stiche
  fächern über ihn. Ein Puncher setzt ihn quer als eigene kurze Säule. Braucht eine Regel,
  wann ein Block (Achse kürzer als 1,5 × Radius) eine eigene Säule wird.
- **Glätten stickt Kerben unter 2 × Radius zu.** Gewollt für die Pinseltextur von „SEGEN
  SEIN" (Löcher, Kanten); beim „R" von „CYS SPORTS" (0,2 mm geglättet) schließt es auch den
  Schlitz zwischen den Beinen am Fuß. Am Stickbild prüfen, ob 0,4 mm als Obergrenze hält.
- **Kreis in der Stichfolge** (Kontur-Bänder mit Einschnürung, z. B. `z13-bebebe-010` in
  STUTTGART 250 mm): zwei Striche enden jeweils unter dem anderen. Heute Tatami; auflösbar,
  indem ein Ende obenauf liegt statt darunter.
- **Nadelhäufung stammt aus gestapelten Flächen**, nicht aus der Satin: STUTTGART 80/250 mm,
  Pferd (Tatami) über zwei Schildflächen (54 der 102 Zellen ab 6 Einstichen im 250-mm-Lauf)
  — gleich im reinen Tatami-Lauf. Satin auf Tatami-Grund (CYS SPORTS auf dem Banner) kommt
  dazu; Aussparen des Grunds unter der Schrift ist nicht Teil dieser Arbeit.
- **Ink/Stitch stickt eine Kontur ohne Strichmuster als schmalen Zickzack**, nicht als
  Laufstich (0,2-mm-Schritte, mit Bean dreifach). Die Vorlage setzt deshalb
  `inkstitch:stroke_method="running_stitch"` ausdrücklich. Der reine Tatami-Lauf
  (`--tatami`) reicht die Quelle unverändert durch und hat das Problem bei Konturlinien
  weiterhin.
- **Glätten nur bei rauer Kontur.** Das rote Band mit den drei Kronen (Köln) ist nach Breite
  „schmal", seine Kronen sind Löcher; Glätten hätte sie zugestickt (+20 % Fläche). Regel:
  geglättet wird nur, wenn die Öffnung ≥ 0,5 % Fläche abnimmt (Textur) oder die Schließung
  ≤ 5 % dazugibt (`isTextureSmoothing`) — sonst Tatami mit Grund. Schwellen an sechs Logos
  gemessen, nicht an mehr.
- **Laufzeit:** `auto_satin` braucht je Folge 0,6–27 s, davon nur ~0,6 s Start; ein
  Ein-Prozess-Umbau von `inkstitch/run.py` spart bei 15 Folgen ~9 s von ~165 s und ist
  deshalb nicht gemacht. Der erste Aufruf nach dem Booten braucht ~8 s (kalter Import).

## Abnahme 28.09.: alle sechs Läufe unbrauchbar — Ursachen gegen eine Profi-Datei in derselben Darstellung klären

- **Alle sechs Läufe abgelehnt.** Der Nutzer hat sie im Stich-Player geprüft und als „alle
  unbrauchbar" zurückgewiesen — trotz gemessener Verbesserungen (Deckungsprüfung für
  Auto-Satin, Durchgänge nach Breite; Zahlen in `docs/messung-echte-logos.md` und
  `docs/umsetzungsstand.md`). Eine Messung ist keine Abnahme.
- ~~**Nächster Schritt: Ursachen gegen eine Profi-Datei in derselben Darstellung klären.**~~
  _(28.09.2026 erledigt: drei professionell gepunchte Stickvoll-Dateien im selben Player
  erscheinen satt und sauber — Flächen geschlossen, Schrift als Satin, 13–49 Sprünge. Unsere
  Läufe nicht: Flächen wirken schraffiert, Schrift ohne Satin, 127–235 Sprünge und 47–79
  Trims. Der Player ist also nicht die Ursache, die Stichgenerierung ist es.)_
- **Entscheidung 28.09.2026: Ink/Stitch als Stich-Engine.** Die eigene Stichgenerierung ist
  vom Profi-Stand weit entfernt; der Nutzer hat entschieden, die Stiche von Ink/Stitch
  (GPL-3.0, interne Nutzung seit 26.09.2026 geklärt) erzeugen zu lassen. Erst ein Probelauf
  mit den sechs Motiven im selben Player, dann der Einbau — Plan und Ergebnis folgen in
  `docs/umsetzungsstand.md`.

## Offen aus der Schriftarbeit (27./28.09.2026)

- **Köln 90 mm: Nadelhäufung 11** (vorher 7, Archiv-Max 8). In der schlimmsten Zelle sind 8
  von 11 Einstichen Blockenden mehrerer Fill-Stücke, die übereinander verriegeln (`tie.ts`).
  Ursache belegen, dann ändern.
- **„CYS SPORTS" im Banner kaum lesbar** — bestand schon vor den Änderungen dieses
  Wochenendes. 5,3–5,8 mm hohe Buchstaben mit 0,9–1,2 mm Strich; der Fill-Zugausgleich von
  0,2 mm je Seite macht die kleinen Punzen von S und O zu.
- **`medianShapeWidthMm` überschätzt dünne Ringe an den Ecken** (0,45-mm-Wand: 10-mm-Ring
  0,50 mm, 20-mm-Ring 0,62 mm). Die Grenze `SINGLE_PASS_MAX_MM` = 0,7 mm fängt nur das
  Symptom ab; die Wurzel liegt in der Messfunktion selbst.
- **`OBJECT_OUTSIDE_HOOP` bei drei Motiven** (STUTTGART 250 mm, Eislingen Print 200 mm,
  Atzensport Hofbräu 200 mm): über 200 mm Höhe gegen den Standardrahmen 360 × 200 mm. Kein
  Engine-Fehler — eine Rahmenfrage (größerer Rahmen oder Teilung). `docs/umsetzungsstand.md`
  war an dieser Stelle falsch und ist berichtigt.
- **Auto-Satin-Wurzel: Blockbuchstaben mit Kreuzungen (T, L) werden Keile statt
  überlappender Spalten.** Die Deckungsprüfung (§5.1) fängt das heute ab und schickt sie als
  Fill weiter — weniger Glanz, aber die eigentliche Ursache in `auto-satin.ts` bleibt
  unbehoben.
- **Sackgasse, verworfen:** die Zierlinie über Lücken unter 0,5 mm schließen (Modul
  `close-gaps`, gebaut, nicht eingecheckt). Nadelhäufung sank von 8 auf 6, aber bei dieser
  Schrift trägt die Zierlinie Form — Beine des A, Balken des G, Bein des R stehen nur als
  Zierlinie in der Vorlage und wären verschwunden. Wiederaufnahme nur für Schriften, deren
  Zierlinie keine Form trägt.

## Trims und Sprünge — der Rest hängt an der Vorlage (26.09.2026)

- **Zwei-Pass-Reihenfolge ist eingebaut** (§10.1) und hat geholfen, wo es weh tat: Köln −16 %
  Trims, STUTTGART 80 mm −11 %. Der Preis ist ein zweiter `precedence`-Lauf (STUTTGART 250 mm
  17,4 → 20,4 s).
- **Gemessen und verworfen**: berührende Flächen vereinigen (Köln: 0 von 78 Paaren verschmelzen
  wirklich) und Verbindungen unter Deckung legen (nur 3–7 % der Trims laufen unter einer
  späteren Fläche). Beides steht mit Zahlen in `docs/messung-echte-logos.md`.
- **Was bleibt, ist die Stückelung**: Atzensport 80 mm hat 151 Objekte und 41 Füllflächen unter
  4 mm²; STUTTGART 80 mm bei gleicher Größe 68 Objekte und ein Drittel der Trims. Der Hebel
  liegt vor der Engine (Vorlage vereinfachen) und später im Editor. _(Offen, nicht als
  Engine-Aufgabe.)_
- **Ein Maßstab mit Vorbehalt**: das Archiv sind Puncher-Dateien aus sauberen Vorlagen, unsere
  Testmotive vektorisierte Druckgrafiken. Das Verhältnis Sprünge zu Trims stimmt (4 : 1 wie im
  Archiv), die absolute Zahl nicht.

## Füllung als Graph — halb fertig (26.09.2026)

- **`fill-graph.ts` liegt gebaut und getestet im Repo, ist aber nicht im Stichweg.** Reihen und
  Konturstücke als Graph, Eulerisierung, Hierholzer-Pfad, Ringstücke als Weg — 15 Tests. An
  `fillRegion` verdrahtet bringt es weniger Sprünge und Trims, aber mehr Nadelhäufung (drei von
  sechs Läufen) und 27 bis 63 % Rechenzeit. Messung in `docs/messung-echte-logos.md`.
- **Was fehlt, ist der zweite Graph**: ein Gitter im Inneren der Fläche für die Wege ZWISCHEN
  den Reihen, dessen Kanten teurer werden, je näher sie der Kontur kommen (Ink/Stitchs
  `build_travel_graph`). Erst damit wird aus der Reihenfolge ein Gewinn — ohne ihn sucht
  weiterhin der Sichtbarkeitsgraph, und dort entsteht die Häufung. _(Hoch; der nächste
  Versuch.)_
- **Rechenzeit ist dabei ein Abnahmekriterium, kein Nebenaspekt.** STUTTGART 250 mm liegt schon
  heute bei 17,4 s, mit dem Graphen bei 21,3 s. Regel 9 verlangt 0,3 s.
- **Sackgasse, damit sie niemand zweimal geht:** die Konturstücke des Graphen als Laufstich zu
  sticken. Jede zweite Kante ist doppelt, die doppelte Bahn liegt auf ihrer eigenen Spur —
  Eislingen: Dichte 23 → 205, Nadelhäufung 6 → 78.

## Aus der Sichtung der offenen Software (26.09.2026)

Vollständig in `docs/open-source-landschaft.md`.

- **PES/JEF/EXP-Writer nach pyembroidery (MIT).** Dieselbe Referenz, gegen die der DST-Writer
  byte-identisch prüft. Fleißarbeit mit belastbarer Vorlage — aber **erst wenn eine Maschine
  oder ein Kunde es verlangt**; TEXMA fährt DST. _(Niedrig.)_
- **Richtungsfelder für Füllungen** statt fester 45°: „Directionality-Aware Design of
  Embroidery Patterns" (Eurographics 2023). Trifft den offenen Punkt „alle Flächen bekommen
  denselben Stichwinkel" aus `docs/profi-abgleich.md`. Paper nachbauen, Code (MPL-2.0,
  Forschungsprototyp) nicht übernehmen. _(Mittel, nach der Kleinschrift-Arbeit.)_
- **Lizenzwarnung: PEmbroider ist für TEXMA gesperrt** — GPL-3.0 **plus** Anti-Capitalist
  Software License, die kommerzielle Nutzung untersagt. Nicht einmal als Code-Vorlage. Neben
  Ink/Stitch (GPL-3.0, nur lesen) damit die zweite Quelle, die ausscheidet.

## Aus dem zweiten Prozess-Abgleich (26.09.2026)

Vollständig in `docs/profi-abgleich.md`, Abschnitt „Zweiter Abgleich".

- **Die Reihenfolge braucht die echten Endpunkte, nicht bessere Schätzwerte.** `autoOrder`
  misst vom Anfang des zuletzt gewählten Objekts. Beide naheliegenden Korrekturen sind
  gemessen und **verschlechtern** (Köln 90 mm: Dichte 25 → 28, Nadel 7 → 10). Der Weg wäre
  ein zweiter Durchgang: Objekte generieren, echte Endpunkte einsammeln, dann ordnen — und
  Spalten/Konturen umdrehen (`reverse`), wenn das Ende näher am nächsten Objekt liegt. Das
  ist der Profi-Mechanismus „Auto Start/End". _(Mittel; misst sich an Sprüngen und Trims.)_
- **Laufstiche binden die Reihenfolge nicht.** `precedence` kennt nur Objekte mit Fläche
  (`object.ts:33`), eine Kontur kann damit vor der Fläche landen, die sie überdeckt. An vier
  Logos gemessen: tritt nicht auf (0 von 406 Laufstichen). _(Niedrig, aber echtes Risiko.)_
- **Keine Verriegelung vor einem Farbwechsel ohne Trim.** §10.3 nennt nur `trim` und `end`;
  bei `trimAfter: "never"` plus Farbwechsel endet ein Block unvernäht, obwohl die Maschine
  den Faden physisch unterbricht. _(Klein, Spec-Frage.)_
- **Kleinschrift ist eine Warnung, kein Verfahren.** Weder Dichte noch Spaltenbreite hängen
  an `heightMm`; `font-choice.ts` (Schriftwahl nach Höhe, §9.4) wird nur in Tests aufgerufen,
  nicht in `expand`. Der Kurzstich-Abstand der Schrift wird gelesen und dann verworfen
  (`import-inkstitch.ts:156` → `satin.ts` rechnet mit Festwerten). _(Hoch — der Fachtext
  nennt Kleinschrift den kritischsten Punkt der manuellen Nacharbeit.)_
- **Kein Arbeitsformat.** Objekte lassen sich nicht speichern und wieder öffnen; das neutrale
  JSON trägt nur Stiche. Damit widerspricht das Repo seiner eigenen Regel 5 („Stiche werden
  nie gespeichert, nur Objekte") — gespeichert wird bisher ausschließlich das Gegenteil.
  _(Hoch, Voraussetzung für den Editor.)_
- **Kein Stich-Simulator.** `upToStitch` ist ein Standbild, kein Player. _(Editor-Phase.)_
- **Nur DST.** PES/JEF/EXP/VP3 weder lesen noch schreiben; §2 verspricht einen PES-Reader.
  _(Mittel — für TEXMA-Maschinen reicht DST, für Kundenvergleiche nicht.)_

## Aus dem Abgleich mit EPCwin (21.09.2026)

- **Satin-Ecküberstich.** _(Phase 3.)_ An einer Ecke einer Satinspalte muss die äußere Rail
  über den Schnittpunkt hinauslaufen, sonst klafft die Ecke auf der Außenseite und staucht
  sich auf der Innenseite. EPCwin führt das als eigene Einstellung. Unsere Spalten enden
  heute exakt am Rail-Ende; bei den Buchstabenformen aus §7.7.1 fällt das an jedem Knick an.
- **Fill-Umkehrverhalten am Reihenende.** _(Niedrig.)_ EPCwin unterscheidet Hut- und
  Zickzack-Umkehr: die eine setzt den Wendepunkt versetzt, die andere lässt die Reihen
  spitz zusammenlaufen. Wir kennen nur die eine Form (§8.3). Auf sichtbaren Kanten macht das
  einen Unterschied, auf verdeckten nicht.

## Aus dem Reisewege-Fix (21.09.2026)

- **Die Reisewege bündeln sich.** Sie laufen jetzt innerhalb der Form (§8.7.1) — und mehrere
  hintereinander gern auf derselben Linie an der Kontur. STUTTGART 80 mm: Dichtespitze von
  24 auf 33. Zwei Reihenfolge-Regeln (§8.5) haben 44 auf 33 gedrückt, die Reisestichlänge
  von 3,0 mm dann auf 32 — damit liegt das Motiv mit 1,8 % dichter Zellen wieder unter der
  Fehlerschwelle (2 %, §11). _(21.09.2026: entschieden, dass gestreut wird, wenn der
  Probestick am Steg einen Grat zeigt — vorher nicht.)_ **Offen bleibt:** Sektionen in
  Bändern füllen statt greedy, falls die Stege doch auffallen.
- **Die Mindeststichlänge schneidet Ecken enger Wege ab.** `postProcess` entfernt den
  Knickpunkt (§11), die Sehne schneidet die Kurve: 0,21 bis 0,37 mm Überstand an den sechs
  Logos. **Frage:** Knickpunkte eines Reisewegs wie Verriegelungen schützen (dann Stiche
  unter 0,6 mm), oder den Überstand hinnehmen? Er liegt unter dem Zugausgleich.
- **Der Wächter kostet Laufzeit.** Jedes Stichsegment eines Fills wird gegen die Form
  geprüft; STUTTGART 250 mm braucht 20 s statt 6 s. **Frage:** nur Segmente prüfen, die
  keine Füllreihe sind (dafür müsste `fillRegion` sie markieren)?
- **`insideTravel` ist der Flaschenhals dahinter.** Der Graph wird je Aufruf für ein frisch
  gedrehtes Polygon neu gebaut, weil der Cache auf der Objektidentität sitzt. **Frage:** das
  Reisegebiet einmal je Winkel drehen und wiederverwenden?

## Aus der Abnahme vor dem ersten Probestick (21.09.2026)

- **Über hundert Warnungen für ein Logo sind für den Editor zu viel.** Nach Code gruppieren,
  mit Anzahl, Details aufklappbar — STUTTGART 80 mm sind (Stand 27.09.2026) 28 ×
  `EDGE_GAP_RISK`, 17 × `AUTOSATIN_MIXED` und acht weitere Codes, das sind zehn Zeilen statt
  hundertdrei.
  **Gehört in Phase 2 (Editor), nicht in die Engine:** die Engine meldet jeden Fall einzeln,
  weil jeder Fall ein Objekt hat; das Zusammenfassen ist Darstellung.
- **Importierte Buchstabenformen unter 5 mm bekommen keine Warnung.** `TEXT_TOO_SMALL`
  (§9) greift nur bei Textobjekten, nicht bei Buchstaben, die als Pfade im SVG ankommen.
  „CYS SPORTS" im STUTTGART-Logo ist 3,5 mm hoch und wird als Satin gestickt — in der
  Vorschau klumpig, auf Stoff nicht lesbar. Ein Puncher würde die Schrift vergrößern oder
  weglassen. **Vorschlag:** `SATIN_GROUP_SMALL`, wenn eine Gruppe von Satinspalten aus einer
  Form unter 5 mm Ausdehnung kommt. Voraussetzung ist der nächste Punkt — ohne gemeinsames
  `sequence` gibt es keine Gruppe, nur einzelne Spalten.
- ~~**Der Import gibt den Spalten einer Form kein gemeinsames `sequence`.** §10.1 sagt: „auch
  die Spalten eines Auto-Satin-Vorschlags sind bereits geordnet". `expand` setzt es für
  Texte (`sequence: obj.id`), der SVG-Import und `autoSatin` setzen es nicht — gemessen an
  STUTTGART 80 mm: 74 Spalten, keine einzige mit `sequence`. Folge: **sechs von 47 Formen
  werden von `autoOrder` auseinandergerissen**, eine viermal.~~ _(25.09.2026 behoben,
  Commit `c8e50ec`: `autoSatin` setzt `sequence: idPrefix` auf jedes Teil einer Form — Spalte
  wie Laufstich. STUTTGART 80 mm hat jetzt 13 Formen mit zwei bis fünf Objekten, jede in
  einer Folge; `autoOrder` reißt keine mehr auseinander.)_

## Offen nach der vierten Welle (21.09.2026)

- ~~**Die Ausdehnungs-Schranke aus §5.1 ist von 2,0 auf 4,0 gelockert.** Ganz streichen?~~
  _(21.09.2026 entschieden: bleibt bei 4,0. Sie kostet nichts und fängt den Fall ab, in dem
  das Budget durchrutscht — Rails, die zufällig fast die Konturlänge treffen und sich
  trotzdem wickeln. Rolle in §5.1 eingetragen: Budget entscheidet, Ausdehnung ist harte
  Obergrenze.)_
- ~~**Die Schriftwahl nach Höhe setzt `caffeine_tiny` über ihre eigene Grenze.** Umschalt-
  punkt auf 5,7 mm ziehen und `excalibur_KOR` dazwischenschieben?~~ _(21.09.2026
  entschieden: kein `excalibur_KOR` — eine Rustikale passt stilistisch nicht zwischen zwei
  Serifenlose. `caffeine_tiny` darf bis 9 mm hochskaliert werden, weil die Spalten dabei
  breiter werden statt dünner; Meldung dafür ist `info TEXT_ABOVE_FONT_MAX`. Unter
  `min_scale` bleibt es `warn`. §9.4.)_
- **Eislingen hat noch 926 Objekte und 1008 Sprünge.** Deutlich besser als die 2408 und
  1963 vorher, aber die Vorlage bleibt eine Vektorisierung aus Hunderten Fragmenten.
  **Frage:** Mindestfläche für die Satin-Erkennung, oder gehört das in die Vorbereitung?

## Offen nach der dritten Welle (20.09.2026)

- **`railsForBranch` überarbeiten.** _(Am 21.09.2026 erledigt, §7.7.1 — Konturpunkte werden
  auf den Ast projiziert und jeder gehört genau einem Ast. STUTTGART 80 mm meldet kein
  `AUTOSATIN_MIXED` mehr.)_ Die Rail wird punktweise als nächster Nachbar je Seite
  vom Skelett gelesen. Auf einer gekrümmten Form schlägt die Seitenzuordnung um, die Rail
  windet sich, und die Spalte stickt dieselbe Stelle mehrfach — gemessen 92 Stiche in einem
  Quadratmillimeter bei einem Buchstaben von 10 × 13 mm. Richtig wäre, die Kontur zwischen
  den beiden Astenden in zwei Ketten zu teilen und nach Bogenlänge zu paaren. Die beiden
  Schranken in §5.1 sind bis dahin eine Notbremse. **Eigene Sitzung.**
- **Auto-Satin auf Vektorisierungsfragmenten.** Beim Eislingen-Logo macht §5.1 aus 136
  Objekten 2408 und aus 294 Sprüngen 1963, weil die Vorlage aus über 2000 Fragmenten
  besteht. **Frage:** soll die Satin-Erkennung eine Mindestfläche oder Mindestlänge
  bekommen, oder gehört das in die Vorbereitung der Vorlage?
- **Die Unterlappung summiert sich an Knotenpunkten.** Wo acht Flächen zusammenstoßen,
  legt jede ihre 0,8 mm übereinander. **Frage:** soll `resolveOverlaps` die Unterlappung
  an Mehrfachnähten begrenzen?
- **Die Dichtegrenzen aus §11 kennen die Garnstärke nicht.** `caffeine_tiny` schreibt
  60er Garn vor und setzt seinen Zickzack auf 0,25 mm; „TEXMA" in 8 mm kommt damit auf
  19 Stiche/mm² und meldet `DENSITY_HIGH`. Mit 60er Garn ist das richtig gestickt, mit 40er
  wäre es zu dicht — die Meldung ist also nicht falsch, aber sie misst gegen 40er.
  §14 hat für die Abstände längst einen Dichtefaktor (0,8 bei 60er). **Frage an die Spec:**
  sollen die Grenzen aus §11 mit demselben Faktor mitskalieren?
- **`SATIN_TOO_NARROW` misst das Minimum und trifft damit jede Schrift.** §7.4 warnt unter
  1 mm Spaltenbreite, gemessen über die schmalste Sprosse. Eine Schriftspalte läuft am
  Buchstabenende spitz zu — „TEXMA" in 8 mm erzeugt deshalb 23 Warnungen, die kleinste über
  0,08 mm. Das ist Schriftgestaltung, kein Fehler. **Frage an die Spec:** soll das Kriterium
  auf die mediane Breite oder auf einen Anteil der Spalte gehen?
- **Golden Files für §15 gibt es nirgends zu holen.** Geprüft am 20.09.2026: das
  Ink/Stitch-Repo (`inkstitch/inkstitch`) hat in `tests/` **keine** SVG-DST-Paare, nur
  Lettering-Fixtures und ein Style-Cascade-SVG. Die Abnahme aus §15 braucht also Dateien,
  die **bei TEXMA entstehen**: SVG in Inkscape mit Ink/Stitch parametrisieren, als DST
  exportieren, beide ins Repo. Das ist keine offene Suche mehr, sondern eine Zulieferung.
- **Der Konverter liest nur den Einzeldatei-Aufbau.** 132 der 142 Schriften haben
  `ltr.svg`; fünf legen einen Ordner `ltr/` mit einer SVG je Glyph an
  (`ags_garamond_latin_grec`, `honoka`, `mai_en_fleur`, `roman_ags_bicolor`, `sunset`).
  Ink/Stitch kennt zusätzlich `.xz`-gepackte Varianten, die im Fonts-Repo aber nicht
  vorkommen. Kleine Erweiterung, sobald eine dieser Schriften gebraucht wird.
- **Neun Ink/Stitch-Schriften sind für Kundenarbeit gesperrt.** Acht stehen unter
  CC BY-NC-SA 4.0 (nicht gewerblich), eine unter CC BY-ND 4.0 (keine Bearbeitung — die
  Umwandlung ins JSON ist eine). Namen in `packages/fonts/src/inkstitch/README.md`. 103
  sind OFL, 27 CC BY-SA, 3 Public Domain.
- **`libembroidery` (Zlib) als zweite Meinung zu §13.2.** PES, JEF, VP3 und EXP laufen bei
  uns über `apps/api` und pyembroidery (MIT). `Embroidermodder/libembroidery` liest und
  schreibt dieselben Formate unter Zlib-Lizenz — brauchbar als Kreuzprüfung oder als
  Format-Referenz. `frno7/libpes` wäre genauer für PES, steht aber unter GPL-3.0 und
  scheidet damit für uns aus.
- **Ink/Stitch ist GPL-3.0 — seit 26.09.2026 entschärft.** `texma-stitch` bleibt ein internes
  TEXMA-Werkzeug (Entscheidung J. Boekle), damit entsteht keine Weitergabe und keine
  Offenlegungspflicht. Verfahren dürfen im Detail übernommen werden; eng nachgebildete Stellen
  tragen den Vermerk `Abgeleitet aus Ink/Stitch (GPL-3.0)`, damit sie auffindbar bleiben, falls
  das Werkzeug doch einmal das Haus verlässt. **Unverändert gesperrt** bleiben die neun
  Schriften unter CC BY-NC (Nutzungsbeschränkung, greift auch intern) und PEmbroider.
  Einzelheiten: `docs/verfahren-aus-inkstitch.md`.

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

Vollständig mit Messungen in `docs/profi-abgleich.md`. **Sieben der neun Punkte sind
entschieden und umgesetzt**, Zahlen in `docs/messung-echte-logos.md`:

| #   | Punkt                                  | Wo                                                                  |
| --- | -------------------------------------- | ------------------------------------------------------------------- |
| 1   | §14 Reihenabstände auf Industriewerte  | erledigt, 1. Welle                                                  |
| 3   | §11 Breitenkriterium `FILL_TOO_NARROW` | erledigt, 1. Welle                                                  |
| 4   | Kontur-Überlappung gegen Blitzer       | erledigt als §8.1.2 `underlapMm` + §8.1.3 `EDGE_GAP_RISK`           |
| 5   | Push-Ausgleich                         | erledigt **für Fill** (§8.1.1) — §7.2 Satin fehlt noch, siehe unten |
| 6   | §10.1 Mitte → außen, unten → oben      | erledigt, auf Cap eingegrenzt                                       |
| 8   | §6 krümmungsadaptive Stichlänge        | erledigt als §6.1                                                   |
| 9   | Preset für dünne Jersey-Ware           | erledigt, §14                                                       |

Offen bleiben:

2. **§11 Dichtemaß.** Das Maximum über alle 1-mm-Zellen lässt eine einzige Stelle die ganze
   Datei abstempeln (STUTTGART: 9 von 4.047 Zellen lösen den Fehler aus, 92 % liegen bei
   höchstens 8/mm²). Fläche über dem Grenzwert wäre aussagekräftiger. Seit der
   Mindeststichlänge von 0,6 mm ist der Druck geringer — zwei der vier Logos melden nur
   noch `warn` —, die Frage bleibt.
3. **§8 Stichwinkel.** Der Import setzt für jede Fläche 0°. Gleiche Winkel überall wirken
   flach; die Praxis variiert sie für Tiefe.
   5b. **§7.2 Push-Ausgleich beim Satin.** §8.1.1 trennt Zug und Schub für den Fill. Beim
   Satin steht Push weiterhin nur als „für später" in §7.2, zusammen mit dem asymmetrischen
   Ausgleich (`pullCompA`, `pullCompB`).
   5c. **Cap-Zugausgleich 0,15 mm** liegt unter dem Praxisminimum 0,2 mm. Bewusst nicht
   mitgeändert: die Frage war auf die Reihenabstände gestellt, nicht auf den Zug.

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
