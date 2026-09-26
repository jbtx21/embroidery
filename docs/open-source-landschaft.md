# Was es an offener Stickerei-Software gibt — und was davon uns hilft

Stand: 26.09.2026. Durchgesehen wurde die GitHub-Suche nach „Embroidery" und das Topic
`embroidery` (die zwanzig meistbeachteten Projekte), dazu die beiden Browser-Digitizer aus
dem Reddit-Umfeld. Die Frage war nicht „was gibt es", sondern **„was nimmt uns Arbeit ab, und
zu welcher Lizenz"**.

## Die Lage in einem Satz

Formate sind ein gelöstes Problem, Punchen ist keins. Jede vollständige Punch-Software im
offenen Feld steht unter GPL-3.0 oder strenger — brauchbar zum Verstehen eines Verfahrens,
nicht als Baustein für uns.

## Die Projekte, nach Nutzen für unsere offenen Punkte

| Projekt                                                                              | Lizenz              | Was es ist                                                                                            | Für uns                                                                                    |
| ------------------------------------------------------------------------------------ | ------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| [pyembroidery](https://github.com/EmbroidePy/pyembroidery) (312★, Python)            | **MIT**             | Liest 40, schreibt 10 Formate. **Keine** Stichgenerierung — ausdrücklich ausgeschlossen               | **Die Referenz für PES/JEF/EXP/VP3.** Wir nutzen es schon als Kreuzprüfung für DST (§13.2) |
| [libembroidery](https://github.com/Embroidermodder/libembroidery) (81★, C)           | Zlib                | Formate lesen/schreiben/umrechnen                                                                     | Zweite Meinung zu §13.2, steht im Backlog                                                  |
| [libpes](https://github.com/frno7/libpes) (49★, C)                                   | GPL-2.0             | PES/PEC im Detail                                                                                     | nur lesen                                                                                  |
| [Ink/Stitch](https://github.com/inkstitch/inkstitch) (1,4k★, Python)                 | **GPL-3.0**         | Die einzige vollständige offene Punch-Software                                                        | Verfahren verstehen, **kein Code** (CLAUDE.md-Regel)                                       |
| [PEmbroider](https://github.com/CreativeInquiry/PEmbroider) (599★, Java)             | **GPL-3.0 + ACSL**  | Füllverfahren, Bildverarbeitung, schreibt sieben Formate                                              | **Für TEXMA gesperrt** — die Anti-Capitalist-Lizenz untersagt kommerzielle Nutzung         |
| [embroidery-streamlines](https://github.com/desmondlzy/embroidery-streamlines) (40★) | MPL-2.0             | Forschungscode zu „Directionality-Aware Design of Embroidery Patterns" (Eurographics 2023)            | **Fachlich der wertvollste Fund** — Richtungsfelder statt fester Winkel                    |
| [stitch_generator](https://github.com/bastanja/stitch_generator) (20★, Python)       | MIT                 | Zierstiche aus Kurven (Mäander, Motivketten), exportiert selbst nichts                                | Ideen für Ziersticharten, nicht für Logos                                                  |
| [stitch.js](https://github.com/stitchables/stitch.js) (22★, JS)                      | MIT                 | Generative Stickerei, auflösungsunabhängig                                                            | Kunstprojekt, kein Digitizing — nimmt uns nichts ab                                        |
| [Buttery Stitches](https://github.com/suzbeanz/buttery-stitches)                     | (Browser-App)       | Tatami, Konturfüllung, Satin mit Split, Text auf Pfad, Unterlage, Export über pyembroidery in Pyodide | Das nächste Vergleichsstück zu uns — dieselbe Aufgabe, anderer Weg                         |
| [StitchWright](https://github.com/samuelmcmanus819/stitchwright)                     | (Browser-App + pip) | Strichzeichnung → Skelett → **Eulerkreis-Routing** → Running/Satin                                    | Genau die Wegeplanung, die bei uns offen ist (§4.1 der Neuplanung)                         |
| [Embroidermodder](https://github.com/Embroidermodder/Embroidermodder) (632★, C++)    | Zlib                | Betrachter und Editor für Stickdateien                                                                | Editor-Vorbild, kein Punchen                                                               |
| [Embroiderly](https://github.com/embroidery-space/embroiderly) (43★, Rust+TS)        | GPL-3.0             | Kreuzstich-Desktop-App (Tauri)                                                                        | Architektur-Vorbild für einen Editor, andere Domäne                                        |

Der Rest des Feldes sind Betrachter (`html5-embroidery`, `embroidery-viewer`,
`EmbroideryReader`), Maschinensteuerungen (`OpenEmbroidery`, `respira`), Garnfarb-Tabellen
(`DMC-ColorCodes`, `embroidery-floss-api`) und generative Werkzeuge (`turtlestitch`,
`stitchcode`). Für ein Punchprogramm: nichts.

## Drei Folgerungen

**1. PES und die anderen Formate kaufen wir nicht neu ein, wir schreiben sie nach.**
pyembroidery steht unter MIT und ist die genaueste öffentliche Beschreibung der Formate, die
es gibt — dieselbe Quelle, gegen die unser DST-Writer schon byte-identisch prüft. Ein
PES-Writer in TypeScript ist damit Fleißarbeit mit einer belastbaren Referenz, kein
Forschungsprojekt. Die Frage ist nur, ob TEXMA ihn braucht: unsere Maschinen fahren DST.

**2. Beim Punchen selbst gibt es nichts zu übernehmen — nur zu verstehen.**
Ink/Stitch ist GPL-3.0 (lesen ja, kopieren nein), PEmbroider zusätzlich unter einer Lizenz,
die kommerzielle Nutzung ausschließt. Das bestätigt den Kurs der Neuplanung: Verfahren aus
Fachliteratur und Messung am Archiv, Code selbst geschrieben. Es heißt aber auch: **niemand
nimmt uns den Kern ab.**

**3. Der Forschungsstand zur Stichrichtung ist frei zugänglich und trifft unseren offenen
Punkt.** „Directionality-Aware Design of Embroidery Patterns" (Zhenyuan Liu u. a.,
Eurographics 2023) baut Füllungen entlang eines Richtungsfeldes statt auf einem festen
Winkel. Unser Import setzt heute 45°, bei Überdeckung −45° (§5.1) — der Abgleich mit der
Punch-Praxis führt „alle Flächen bekommen denselben Stichwinkel" seit dem 19.09.2026 als
offenen Punkt. Das Paper ist die Antwort darauf, das Repo (MPL-2.0) ein Forschungsprototyp
nach eigener Aussage „nowhere near an end-user product". Also: **Paper lesen, Verfahren
nachbauen, Code nicht übernehmen.**

## Was daraus im Backlog landet

- PES-Writer nach pyembroidery-Referenz — **erst wenn ein Kunde oder eine Maschine ihn
  verlangt**. Bis dahin ist DST der einzige Ausgang (§13.1).
- Richtungsfelder für Füllungen (Eurographics 2023) als Qualitätsstufe nach der
  Kleinschrift-Arbeit. Messgröße bleibt der Verzug am Probestick, nicht die Optik im Render.
- Eulerkreis-Routing für Reisewege (StitchWright macht es vor, Ink/Stitch auch) — steht
  bereits als §4.1 in `docs/neuplanung-punchprogramm.md`.
