# ADR 0001 — Ink/Stitch erzeugt die Stiche

Status: angenommen, 28.09.2026 · Ersetzt: die eigene Stichgenerierung als Produktionsweg

## Kontext

Am 28.09.2026 hat der Nutzer alle sechs Kundenlogos aus der eigenen Engine als unbrauchbar
abgelehnt. Der Vergleich im selben Player mit den Profi-Dateien aus Stickvoll hat gezeigt, dass
nicht der Player täuscht, sondern die Stichgenerierung selbst den Profi-Stand nicht erreicht —
Flächen mit Lücken, Schrift, die man nicht lesen kann. Sechs Runden Nachbessern an Fill,
Auto-Satin und Reihenfolge haben daran nichts Grundsätzliches geändert
(`docs/probesticks.md`, `docs/backlog.md`).

Ein Probelauf mit Ink/Stitch (kopflos, ohne Inkscape) aus denselben sechs Vorlagen ergab
Dateien, die im Player wie Profi-Arbeit aussehen: geschlossene Flächen, lesbare Schrift bis
„CYS SPORTS" und „NotSan 01/24". Kennzahlen Piqué, Reihenabstand 0,4 mm:

| Motiv             |  Stiche | Sprünge | Trims | Farbblöcke | Dichtespitze | Nadelhäufung |
| ----------------- | ------: | ------: | ----: | ---------: | -----------: | -----------: |
| STUTTGART 80 mm   |  17.974 |      52 |     0 |         13 |           39 |            8 |
| STUTTGART 250 mm  | 111.130 |     138 |     0 |         13 |           26 |           10 |
| Köln 90 mm        |  27.139 |     111 |     0 |         23 |           34 |           15 |
| Eislingen 200 mm  |  46.806 |     190 |     0 |         12 |           39 |           12 |
| Atzensport 80 mm  |  16.642 |     245 |     0 |         11 |           29 |            9 |
| Atzensport 200 mm |  58.432 |     565 |     0 |         13 |           26 |            7 |

Archiv zum Vergleich (192 Produktionsdateien): Dichtespitze p90 24, Nadelhäufung max 8,
Trims/1000 Median 1,9. Die Schwächen des Probelaufs liegen in der Vorlage, nicht in
Ink/Stitch: jede Fläche wird Tatami (auch Schrift), verdeckte Flächen werden voll
mitgestickt, die Farbfolge folgt der Ebenenfolge, und ohne `trim_after` gibt es keine
Fadenschnitte.

## Entscheidung

**Ink/Stitch erzeugt die Stiche. TEXMA Stitch bereitet die Vorlage vor und prüft das
Ergebnis.**

- Ink/Stitch läuft als **eigener Prozess** in fester Version aus einem Klon außerhalb des
  Repos. Starter und wx-Platzhalter liegen unter `inkstitch/`, die Einrichtung macht
  `inkstitch/setup.sh`. Version: die **offizielle Version 3.3.0** (31.07.2026) _(30.09.2026,
  Entscheidung des Nutzers — vorher der Entwicklungsstand `d59c9ab` vom 17.09.2026)_. Grund: am
  Arbeitsplatz wird die veröffentlichte Version installiert, und eine Nacharbeit in Inkscape
  (Spec §13.4) muss genauso rechnen wie die Pipeline.
- TEXMA Stitch **bereitet vor**: Einteilung der Formen nach Breite (Satin, Laufstich,
  Tatami), Sprossen für Ink/Stitchs „Füllung zu Satin", verdeckte Flächen ausschneiden,
  Farbfolge, Fadenschnitte, Preset-Werte als `inkstitch:`-Attribute.
- TEXMA Stitch **prüft**: DST-Leser, Kennzahlen gegen das Archiv (`pnpm kennzahlen`), Player,
  Deckungsprüfung der Satinsäulen.
- Die **eigene Stichgenerierung wird eingefroren, nicht gelöscht**: Code und Tests bleiben
  grün, es gibt keine weitere Arbeit an Fill-, Satin- und Reihenfolge-Erzeugung. Geometrie,
  Import, Analyse, Formate und Renderer arbeiten weiter — sie tragen jetzt die Vorbereitung
  und die Prüfung.

## Folgen

- **Lizenz:** Ink/Stitch ist GPL-3.0, die interne Nutzung ist seit 26.09.2026 geklärt. Der
  Quelltext wird nicht ins Repo kopiert; eng nachgebildete Stellen tragen „Abgeleitet aus
  Ink/Stitch (GPL-3.0)". Die neun Ink/Stitch-Schriften unter CC BY-NC bleiben für
  Kundenaufträge gesperrt.
- **Laufzeit:** 11 s bis rund 4,5 min je Logo statt Sekundenbruchteilen. Das Budget aus
  Regel 9 gilt weiter für den eigenen Code, nicht für den Ink/Stitch-Lauf. Für den späteren
  Editor ist das ein offener Punkt (Vorschau aus der eingefrorenen Engine, Ink/Stitch für den
  Export).
- **Umgebung:** Python 3.11, eine venv und System-Pakete für PyGObject. Ein SessionStart-Hook
  richtet das in jeder Sitzung ein; der zweite Aufruf ist ein No-op.
- **Versionswechsel** nur bewusst: neuen Commit eintragen, die sechs Motive neu rechnen, die
  Kennzahlen gegen die vorige Version halten.
- **Spec:** §1 (Zweck) und §16 (Meilensteine) sind angepasst.

## Verworfen

- **Eigene Engine weiter nachbessern:** sechs Runden ohne brauchbares Ergebnis; der Abstand
  zum Profi-Stand ist grundsätzlich, nicht eine Stellschraube.
- **Kaufsoftware** (Tajima, Pulse, Wilcom, Mountek): nicht kopflos aus dem eigenen Ablauf
  aufrufbar, Lizenzkosten je Platz; die Herstellerseiten sind aus dieser Umgebung nicht
  erreichbar und wurden nicht geprüft.
- **pyembroidery allein:** schreibt und liest Formate, erzeugt aber keine Stiche.
