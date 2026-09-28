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
pnpm inkstitch <svg> [preset]        # Vorlage -> DST + PNG-Vorschau + Kennzahlen nach ./out/
```

Für einzelne Ink/Stitch-Erweiterungen direkt (z. B. zum Verketten mehrerer Schritte):

```bash
python inkstitch/run.py --extension=<name> [--id=<id>]... [--<option>=<wert>]... <in.svg>
```

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
denselben Vorgaben.

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
