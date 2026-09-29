# Ink/Stitch als Stich-Engine

Entscheidung vom 28.09.2026: **Ink/Stitch erzeugt die Stiche**, TEXMA Stitch bereitet die
Vorlage vor (`pnpm inkstitch`, Presets aus `@texma-stitch/engine`) und prüft das Ergebnis
(`analyze()` auf der zurückgelesenen DST, siehe `tools/inkstitch.mjs`). Entscheidung und
Folgen: `docs/adr/0001-inkstitch-als-stich-engine.md`; Verfahrensvergleich:
`docs/verfahren-aus-inkstitch.md`.

## Lizenz — bitte lesen

Ink/Stitch steht unter **GPL-3.0**. Deshalb:

- **Ink/Stitch wird nicht ins Repo kopiert.** Dieser Ordner enthält nur unseren eigenen,
  schmalen Klebecode (MIT wie der Rest von `texma-stitch`) — Starter, Platzhalter,
  Einrichtung. Die Ink/Stitch-Quelle selbst liegt außerhalb des Repos (siehe unten) und wird
  von `setup.sh` dorthin geklont.
- Ink/Stitch läuft als **eigener Python-Prozess**, den wir per `subprocess`/`child_process`
  aufrufen (`inkstitch/run.py`, `tools/inkstitch-lauf.mjs`) — kein Import seines Codes in
  unseren.
- Interne Nutzung ist freigegeben (Entscheidung J. Boekle, 26.09.2026): `texma-stitch` bleibt
  ein internes TEXMA-Werkzeug, es findet keine Weitergabe statt. Sobald das Werkzeug das Haus
  verlässt, muss das neu geprüft werden. Details: `docs/verfahren-aus-inkstitch.md`.
- Neun Ink/Stitch-Schriften stehen zusätzlich unter CC BY-NC/-ND und bleiben für Kundenarbeit
  gesperrt, unabhängig von alldem — siehe `packages/fonts/src/inkstitch/README.md`.

## Einrichtung

```bash
bash inkstitch/setup.sh
```

Holt Ink/Stitch in einem festen Commit, legt eine eigene venv an und installiert die in
`requirements.txt` gepinnten Pakete. Idempotent: ein zweiter Aufruf mit unveränderter
`requirements.txt` und demselben Commit ist ein No-op in deutlich unter einer Sekunde (Marker
in `$INKSTITCH_HOME/.setup-ok`). Läuft außerdem automatisch bei Sessionstart
(`.claude/settings.json`, `.claude/hooks/session-start.sh`) — ein Fehler dort blockiert die
Sitzung nicht, sondern gibt nur einen Hinweis aus.

Bei fehlenden System-Paketen (PyGObject/pycairo brauchen Header zum Bauen) installiert das
Skript sie selbst, wenn `apt-get` und Root-Rechte vorhanden sind — sonst nennt es die genaue
`apt-get install`-Zeile, die von Hand auszuführen ist.

## Aufruf

```bash
pnpm inkstitch <svg> [preset]        # Vorlage (Satin/Laufstich/Tatami) -> auto_satin -> DST + PNG + Kennzahlen nach ./out/
pnpm inkstitch <svg> [preset] --tatami   # reiner Tatami-Lauf: die Quelle wie gezeichnet, nur Reihenabstand gesetzt
pnpm inkstitch <svg> [preset] --breite 120   # das Motiv proportional auf 120 mm Breite skalieren, dann wie sonst (Ausgabe <name>-120mm.*)
pnpm inkstitch <svg> [preset] --ueberlappung 20   # Variante: Überlappungen unter 20 mm² binden die Farbfolge nicht (Standard: jede, §10.1)
pnpm inkstitch <svg> [preset] --aussparen   # Variante: Satin spart die Tatami-Fläche darunter aus (Spec §4.2 Regel 1, verworfen)
pnpm inkstitch <svg> [preset] --naht 0.3   # Variante: angrenzende Flächen greifen 0,3 mm statt 0,8 mm (Spec §4.2 Regel 2, verworfen)
pnpm inkstitch <svg> [preset] --zug-symmetrisch   # Variante: Zugausgleich beider Rails jeder Säule wie in §7.2 (Standard: je Rail, §7.8.3)
```

`--breite` schreibt `width` und `height` der SVG um (die viewBox bleibt) und liest das Motiv erst dann
ein, sodass alles, was von der Größe abhängt, in der gestickten Größe entschieden wird
(`tools/breite.mjs`). Die Ausgabe nennt den Faktor und die Größe davor und danach; gemeint ist die
Breite der Zeichenfläche, das Motiv darin kann etwas schmaler sein (die DST-Größe am Ende sagt, wie
viel). `--ueberlappung` ist
eine Variante für die Sichtprüfung, kein Standard: die Ausgabe listet die Überlappungen, deren
Reihenfolge sich gegenüber §10.1 umdreht (Kennungen, Farben, Fläche, Lage in mm), und
`out/<name>.tausch.json` hat alle. `--aussparen` und `--naht` schalten die beiden Wege ein, die
Spec §4.2 am 29.09.2026 für den Knockdown probiert und nach der Messung an den sechs Kundenlogos
zurückgenommen hat (Zahlen in `docs/backlog.md`); ohne sie gilt §4.1: Satin schneidet nichts aus,
angrenzende Flächen greifen 0,8 mm.

Der Zugausgleich der Satinsäulen ist je Rail gesetzt (Spec §7.8.3, `packages/engine/src/inkstitch/rail-pull.ts`):
`pull_compensation_mm="a b"` gibt Ink/Stitch zwei Werte, `a` für die erste Rail des Pfads, `b` für die
zweite. Eine Rail zu einem Stoffspalt unter 1,0 mm (bis zur nächsten anderen Form liegt nur Stoff, gemessen
entlang der Sprossen nach außen, Median über die Säule) bekommt 0; eine Säule unter 1,0 mm mit einer
solchen Rail bekommt auf beiden Rails 0, die übrigen schmalen Säulen behalten den Ausgleich aus §7.2.
Die Ausgabe listet beides. `--zug-symmetrisch` gibt beiden Rails wieder den Wert aus §7.2.

Für einzelne Ink/Stitch-Erweiterungen direkt (z. B. zum Verketten mehrerer Schritte):

```bash
PYTHONHASHSEED=0 python inkstitch/run.py --extension=<name> [--id=<id>]... [--<option>=<wert>]... <in.svg>
```

`PYTHONHASHSEED=0` gehört dazu: ohne festen Seed ist das Ergebnis nicht deterministisch (siehe
„Eigenheiten"). `tools/inkstitch-lauf.mjs` setzt ihn selbst.

`--extension=output --format=dst` schreibt DST-Bytes nach stdout; eine Effekt-Erweiterung wie
`fill_to_satin` oder `auto_satin` schreibt das geänderte SVG nach stdout. stderr trägt alles,
was Ink/Stitch selbst meldet — auch Meldungen, die es sonst nur in einem GUI-Dialog zeigen
würde (siehe `run.py`, `patch_abort_message_app`).

Aus TypeScript/JS heraus über `tools/inkstitch-lauf.mjs` (`runInkstitch({ extension, ids,
options, svg })`), das denselben Prozess startet und `{ stdout, stderr, ms }` zurückgibt.

## Umgebungsvariablen

| Variable           | Vorgabe                            | Wirkung                                                                                                                  |
| ------------------ | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `INKSTITCH_HOME`   | `$HOME/.cache/texma-stitch`        | Enthält `inkstitch/` (Klon) und `venv/`.                                                                                 |
| `INKSTITCH_SRC`    | `$INKSTITCH_HOME/inkstitch`        | Übersteuert nur den Ort der Ink/Stitch-Quelle.                                                                           |
| `INKSTITCH_PYTHON` | `$INKSTITCH_HOME/venv/bin/python3` | Übersteuert nur den Python-Interpreter (z. B. eine bereits eingerichtete venv statt einer neuen unter `INKSTITCH_HOME`). |

`setup.sh`, `run.py` und `tools/inkstitch-lauf.mjs` lesen dieselben drei Variablen mit
denselben Vorgaben. `PYTHONHASHSEED` setzt `tools/inkstitch-lauf.mjs` für den Ink/Stitch-Prozess
immer auf `0`, auch gegen einen vorher gesetzten Wert.

## Dateien hier

- `wx_stub.py` — Platzhalter für `wx` (wxPython), damit die rund 80 Ink/Stitch-Erweiterungen
  headless importierbar sind (acht davon importieren `wx` auf Modulebene; wxPython gibt es
  für Linux nicht als Wheel auf PyPI).
- `run.py` — allgemeiner Starter: Platzhalter installieren, Ink/Stitch-Quelle an `sys.path`
  hängen, die GUI-Dialog-Meldung `AbortMessageApp` auf stderr umleiten, dann die gewünschte
  Erweiterung mit den durchgereichten Argumenten laufen lassen.
- `requirements.txt` — feste Versionen für die venv (ohne wxPython, ohne Ink/Stitchs eigene
  Dev-/Test-/Type-Checking-Abhängigkeiten — wir rufen nie die GUI oder die Testsuite auf).
- `setup.sh` — siehe oben.

## Eigenheiten im Kopflos-Betrieb (Stand 28.09.2026)

- **`fill_to_satin` vergibt der neuen Satin-Spalte keine `id`.** Nur ein `inkscape:label`
  (`Satin 0`, `Satin 1`, …). Für eine Kette `fill_to_satin -> auto_satin` muss die
  aufrufende Seite dem Ergebnis-SVG selbst eine `id` geben, bevor sie es an `auto_satin`
  weiterreicht — `auto_satin` braucht zwingend eine explizite `--id`-Auswahl.
- **`auto_satin` fällt bei leerer Auswahl NICHT auf „ganzes Dokument" zurück.** Anders als
  z. B. `output`: `AutoSatin.check_selection()` prüft `self.svg.selection` direkt und bricht
  mit `Please select one or more satin columns.` (via `inkex.errormsg`, geht von selbst nach
  stderr) ab, wenn kein `--id` gegeben wurde — auch wenn die interne
  „keine Auswahl = alles verarbeiten"-Regel an anderer Stelle gilt.
- **Eine `--id` auf eine Gruppe wählt auch deren Inhalt.** `iterate_nodes` (postorder) gibt
  `selected=True` an alle Nachkommen eines ausgewählten Knotens weiter — eine Gruppen-`id`
  reicht, um alles Bestickbare darin auszuwählen.
- **`inkex.errormsg()` geht von Haus aus auf stderr** (nicht auf einen GUI-Dialog) — nur die
  sechs Erweiterungen, die stattdessen `AbortMessageApp` (einen wx-Dialog) nutzen
  (`fill_to_satin`, `satin_multicolor`, `lettering`, `element_info`, `tartan`,
  `apply_palette`), brauchten den Patch in `run.py`.
- **stderr aus einer Erweiterung kommt gesammelt, nicht live.** Ink/Stitch fängt stderr
  während `extension.run()` in einem `StringIO` auf (GTK-Spam unterdrücken,
  `lib/utils/io.py`) und schreibt es erst danach in einem Stück heraus — für einen
  Batch-/Subprozess-Aufruf ohne Belang, für interaktives Live-Mitlesen schon.
- **Fixer Overhead von rund 9 s je Prozessaufruf**, unabhängig von der SVG-Größe (Import von
  numpy/shapely/networkx/PyGObject/…). Für ein einzelnes kleines Test-SVG genauso lang wie für
  ein winziges Detail eines großen Motivs — erst die eigentliche Stichberechnung skaliert mit
  der Vorlage.
- **`output` parst seine eigenen `--<key>=<wert>`-Optionen von Hand** (`Output.parse_arguments`)
  und nimmt dabei jede Option kommentarlos an — ein Tippfehler im Optionsnamen wird nicht
  gemeldet. Effekt-Erweiterungen wie `fill_to_satin`/`auto_satin` nutzen dagegen den normalen
  `argparse`-Weg und melden eine unbekannte Option als Fehler.
- **Ohne festen Hash-Seed nicht deterministisch** (gemessen 29.09.2026). Python würfelt den
  Hash von Zeichenketten je Prozess neu und damit die Reihenfolge von Mengen, die Ink/Stitch
  durchläuft. Hofbräu-Motiv, byte-gleiche Vorlage, kalter Cache: drei Läufe ohne Seed gaben
  9.424, 9.425 und 9.426 Stiche, drei mit `PYTHONHASHSEED=0` dieselbe DST. Ink/Stitch legt
  außerdem jeden Stichplan im Cache ab (`~/.config/inkstitch/cache/stitch_plan`, Schlüssel aus
  Element und Nachbarn, nicht aus dem Seed): Pläne aus Läufen ohne festen Seed können dort
  liegen und wiederkommen. Einmal leeren, danach ist der Cache ohne Folgen:
  `rm -rf ~/.config/inkstitch/cache/stitch_plan`.

## Fadenschnitte, Sprünge und die DST (gelesen am Commit d59c9ab, 29.09.2026)

Wie `trim_after`, Sprünge und die Ausgabe zusammenhängen — vorher in der Quelle nachgesehen
(`lib/stitch_plan/stitch_plan.py`, `lib/output.py`, `lib/extensions/jump_to_trim.py`,
`pystitch/DstWriter.py`):

- **Ohne `inkstitch:trim_after` gibt es keinen Fadenschnitt.** Zwischen zwei Objekten
  _derselben Farbe_ prüft `stitch_groups_to_stitch_plan` nur den Abstand vom letzten zum ersten
  Stich: bis `collapse_len_mm` (Metadaten, Vorgabe **3 mm**) läuft der Faden als gewöhnlicher
  Stich weiter, darüber setzt Ink/Stitch Verriegelung, einen **Sprung** und Verriegelung — der
  Faden liegt danach quer oben auf dem Stoff. Ein Farbwechsel ist ein eigener Datensatz und
  schreibt **keinen** Trim (die Maschine schneidet dort selbst).
- **Mit `trim_after`** setzt Ink/Stitch nach dem letzten Stichblock des Objekts Verriegelung und
  `TRIM`; das nächste Objekt beginnt wieder mit Verriegelung und Sprung.
- **In der DST** ist ein `TRIM` genau die Folge dreier Sprung-Datensätze `+2/+2`, `−4/−4`,
  `+2/+2` (`trim_at = 3` in pystitch; `full_jump = true`, `trims = true` setzt `lib/output.py`).
  `readDst` erkennt diese Folge auch ohne `interpretJumpsAsTrim` als **einen** Trim; die
  Sprünge davor und danach zählen als Sprünge. Belegt: die 31 Trims von `auto_satin --trim`
  im STUTTGART-Lauf vom 28.09. kommen als Trims zurück, und der Rauchtest
  (`RUN_INKSTITCH_TESTS=1`) setzt einen Trim und liest ihn wieder.
- **`auto_satin --trim`** setzt Trims nur innerhalb seiner Folge und **am Ende jeder Folge**,
  unabhängig davon, wie weit das nächste Objekt entfernt ist.
- **`jump_to_trim`** (Erweiterung, `--minimum-jump-length=<mm>`) läuft die Stichgruppen aller
  Objekte in Dokumentreihenfolge ab und setzt `trim_after="True"` an das Objekt _vor_ jedem
  Sprung von mindestens dieser Länge zwischen gleichfarbigen Objekten. Gemessen wird zwischen
  dem tatsächlich letzten und dem tatsächlich ersten Stich — die Vorlage kennt beides nicht,
  weil eine Füllung nur ungefähr in Richtung des nächsten Objekts endet. `pnpm inkstitch`
  ruft sie mit der Schwelle aus Spec §10.2 (`CONNECT_DEFAULTS.jumpTrimMm`, 5 mm) nach dem
  letzten `auto_satin` auf. Grenzen: Sprünge **innerhalb** eines Objekts (etwa zwischen den
  Teilpolygonen eines Pfads) sieht sie nicht, und ein Objekt, das schon `trim_after` oder einen
  Trim-Befehl trägt, bleibt unverändert.

## Tatami-Flächen der Vorlage: Attribute, Unterlage, Zugausgleich (gelesen am Commit d59c9ab, 29.09.2026)

Code und Begründung: `packages/engine/src/inkstitch/tatami.ts`, `template.ts`.

- **Gesetzte Attribute** je Tatami-Fläche: `row_spacing_mm`, `max_stitch_length_mm`, `staggers`,
  `angle`, `fill_underlay` und — wo die Unterlage hält — `fill_underlay_angle`,
  `fill_underlay_row_spacing_mm`, `fill_underlay_inset_mm`, `fill_underlay_max_stitch_length_mm`
  (Spec §14, §8.6). Die Namen stammen aus `lib/elements/fill_stitch.py`; Ink/Stitch ignoriert einen
  unbekannten Namen ohne Meldung, deshalb zeigt der Rauchtest (`RUN_INKSTITCH_TESTS=1`) für jeden
  Namen, dass ein anderer Wert die DST ändert, und für einen falschen, dass sich nichts ändert.
- **`angle` zählt gegen den Uhrzeigersinn**, `fill.ts` im Uhrzeigersinn (y nach unten): die Vorlage
  schreibt das Vorzeichen um (`inkstitchAngleDeg`), und der Rauchtest belegt an einer Fläche, dass
  45° nach rechts unten zeigt.
- **Unterlage.** Ink/Stitch schrumpft die Fläche um `fill_underlay_inset_mm`
  (`shape.buffer(-inset)`) und stickt **jedes Stück**, in das der Einzug zerfällt, als eigene
  Stichgruppe — in der Reihenfolge, in der die Geometriebibliothek sie liefert, ohne Fadenschnitt
  dazwischen (`jump_to_trim` sieht Sprünge innerhalb eines Elements nicht) und für ein Stück, das
  keine Reihe trifft, als Laufstich um seine Kontur (`fallback` in `lib/stitches/tatami_fill.py`).
  Ist der Einzug leer, nimmt es die ganze Fläche. Auf einer ausgefransten Kontur (Bänder,
  ausgeschnittene Flächen) sind das Hunderte Stücke. Gemessen mit `pique` an den sechs Kundenlogos,
  Attribut überall gesetzt: Fäden über 5 mm ohne Fadenschnitt in fünf von sechs Logos (4 bis 55,
  längster 79 mm; vorher keiner), Nadelhäufung bis 14 statt 10. Deshalb setzt die Vorlage die
  Gitterunterlage nur, wo `gridUnderlay` sie hält: der Einzug ist ein Stück (auch bei 0,03 mm mehr
  und weniger Einzug — Ink/Stitchs shapely und unser Clipper runden Bögen verschieden, ein Hals von
  0,8 mm ist bei uns ein Stück und bei ihm zwei), wenigstens 0,8 mm breit, und jede Lage trifft eine
  Reihe. Auf allen anderen Flächen trägt der Deckstich allein.
- **Zugausgleich.** `pull_compensation_mm` gibt es, und es wirkt (die Reihen werden an beiden Enden
  um den Betrag länger). Ink/Stitch baut dafür aber bei **jedem** Stichplan die Fläche aus ihren
  Reihen neu (`adjust_shape_for_pull_compensation`: jede Reihe gepuffert, alle vereinigt, die Kontur
  in Python Punkt für Punkt geglättet), `pnpm inkstitch` rechnet zwei Stichpläne (`jump_to_trim`,
  `output`), und für den Schub (`pushCompMm`, Spec §8.1.1) gibt es kein Attribut. Gemessen mit
  `pique`: STUTTGART 80 mm 64 s → 325 s, Köln 90 mm 245 s → 989 s, STUTTGART 250 mm nach 40 Minuten
  noch im ersten Stichplan (ohne das Attribut 6 Minuten für den ganzen Lauf). Die Vorlage rechnet
  Zug und Schub deshalb selbst in den Umriss (`offsetDirectional`, derselbe Versatz wie in `fill.ts`)
  und setzt das Attribut nicht.
- **Kontur-Unterlage** (Spec §8.6) hat die Füllung von Ink/Stitch nicht; sie bleibt aus.
- **Altdokument-Modus.** Die Vorlage trägt keine `inkstitch_svg_version`; beim ersten Lauf
  (`auto_satin`, sonst `jump_to_trim`) wendet Ink/Stitch deshalb die Updates für alte Dokumente an
  (`lib/update.py`): Satin `start_at_nearest_point` und `end_at_nearest_point` aus, `reverse_rails`
  auf `none`, Füllung `max_stitch_length_mm` 3, wenn keiner gesetzt ist. Danach steht die Version 4 im
  Ergebnis, und die folgenden Läufe lassen es. Ob die Version von Anfang an zu setzen etwas ändert,
  ist nicht gemessen.
