# TEXMA Stitch — Engine-Spezifikation

Stand: 19.09.2026 · Zielgruppe: Entwicklung (Claude Code) · Status: Entwurf für Phase 1

**Änderungen 19.09.2026** — beschlossen nach den ersten Umsetzungsfunden, Einzelheiten in
`backlog.md`:

- §3 `Stitch` bekommt `tie?: true`.
- §11 Rundung kaufmännisch-symmetrisch (`roundHalfEven`).
- §13.1 Header nach `0x1A` mit `0x20` auffüllen; Export zentriert auf die
  Bounding-Box-Mitte; Weg vom Nullpunkt zum ersten Stich als Sprungfolge.
- §11 Warnung `SHAPE_SPLIT` mit Teilanzahl, wenn eine Fläche beim Normieren zerfällt.

---

## 1. Zweck und Grundsätze

Die Engine wandelt **Stickobjekte** (Pfade + Parameter) deterministisch in **Stiche** um. Stiche werden nie gespeichert, nur Objekte. Jede Änderung im Editor löst eine Neuberechnung der betroffenen Objekte aus.

Grundsätze:

- Reines TypeScript, keine DOM-Abhängigkeit. Läuft im Web Worker (Editor) und in Node (Tests, Server-Export).
- Interne Einheit: **Millimeter**, Fließkomma. Erst der Export rundet auf 0,1 mm (DST-Einheit).
- Koordinatensystem wie SVG: Ursprung oben links, y nach unten.
- Deterministisch: gleiche Eingabe → byte-identische Ausgabe. Kein Zufall.
- Algorithmen nach Vorbild Ink/Stitch (GPL, nur interne Nutzung).
- Qualitätsreferenz: die Phase-0-Dateien aus Ink/Stitch.

Nicht Teil der Engine: Vektorisierung (Vectorizer.AI), UI, Persistenz, TexOS.

---

## 2. Repository-Struktur

Monorepo mit pnpm workspaces, TypeScript strict, Vitest.

```
texma-stitch/
  packages/
    geometry/    Pfade, Polygone, Offset, Schnitt, Vereinfachung (Clipper2 WASM)
    engine/      Stichgenerierung: running, satin, fill, text, order, connect, validate
    formats/     Writer: DST (TS), neutrales JSON; Reader: DST/PES für Import und Vergleich
    fonts/       Stickschriften als JSON (Glyphen = Satin-Objekte)
    render/      Canvas-2D-Renderer für Stiche (Fadenoptik, Sprünge, Punkte)
  apps/
    editor/      React + Canvas, später
    api/         Python FastAPI: Vectorizer.AI, pyembroidery-Export, Speicherung
  test-data/
    phase0/      Ink/Stitch-SVGs und DSTs aus Phase 0 als Golden Files
```

Abhängigkeiten der Engine: `clipper2-wasm` (Polygon-Ops), sonst nichts. Kein Paper.js in der Engine, das gehört zum Editor.

---

## 3. Datenmodell

```ts
type Point = { x: number; y: number };                 // mm
type Polyline = Point[];                                // geflachter Pfad
type Polygon = { outer: Polyline; holes: Polyline[] };  // geschlossen, Orientierung normiert

type Thread = { brand: 'madeira' | 'isacord'; number: string; hex: string; name: string };

type Design = {
  id: string;
  widthMm: number; heightMm: number;
  preset: PresetId;
  objects: StitchObject[];   // Reihenfolge = Stickreihenfolge
  threads: Thread[];
};

type StitchObject = FillObject | SatinObject | RunningObject | TextObject;

type Base = {
  id: string;
  threadIndex: number;
  visible: boolean;
  locked: boolean;
  trimAfter: 'auto' | 'always' | 'never';
};

type FillObject = Base & {
  type: 'fill';
  shape: Polygon;
  angleDeg: number;            // Stichrichtung
  rowSpacingMm: number;        // Reihenabstand = Dichte
  stitchLengthMm: number;
  staggerRows: number;         // Versatz über n Reihen
  pullCompMm: number;          // Offset nach außen (+) oder innen (−)
  underlay: { contour: boolean; fill: 'none' | 'single' | 'double'; spacingMm: number; insetMm: number };
  startPoint?: Point; endPoint?: Point;
};

type SatinObject = Base & {
  type: 'satin';
  railA: Polyline; railB: Polyline;
  rungs: [Point, Point][];     // optionale Sprossen zur Paarung
  spacingMm: number;           // Zickzack-Abstand
  pullCompMm: number;
  maxWidthMm: number;          // darüber Split-Satin
  underlay: { center: boolean; contour: boolean; zigzag: boolean; insetMm: number; zigzagSpacingMm: number };
  shortStitches: boolean;      // Kurzstiche in engen Kurven
  reverse: boolean;
};

type RunningObject = Base & {
  type: 'running';
  path: Polyline;
  closed: boolean;
  stitchLengthMm: number;
  repeats: 1 | 3 | 5;          // 1 = Laufstich, 3 = Bean Stitch
};

type TextObject = Base & {
  type: 'text';
  text: string;
  fontId: string;
  heightMm: number;
  letterSpacing: number;
  origin: Point;
  onPath?: Polyline;
  trimBetweenWords: boolean;
};
```

Ausgabe der Engine:

```ts
type Stitch = {
  x: number; y: number;
  cmd: 'stitch' | 'jump' | 'trim' | 'color' | 'stop' | 'end';
  tie?: true;                  // Verriegelungsstich (19.09.2026), siehe 10.3 und 11
};
type StitchBlock = { objectId: string; threadIndex: number; stitches: Stitch[] };
type StitchPlan = {
  blocks: StitchBlock[];
  stats: Stats;
  warnings: Warning[];
};
type Stats = {
  stitches: number; jumps: number; trims: number; colorChanges: number;
  bboxMm: { w: number; h: number };
  runtimeSec: number;          // Schätzung, siehe 11
  densityMax: number;          // Stiche pro mm² im dichtesten 1-mm-Raster
};
type Warning = { objectId?: string; code: string; message: string; severity: 'info' | 'warn' | 'error' };
```

---

## 4. Pipeline

```
Design
  → validate()      Geometrie prüfen, Objekte reparieren oder markieren
  → expand()        Text → Satin-Objekte, Auto-Satin-Kandidaten auflösen
  → order()         Reihenfolge übernehmen oder Vorschlag berechnen
  → generate()      je Objekt: Unterlage → Deckstiche (gecacht per Hash)
  → connect()       Verbindungen zwischen Objekten: Laufstich, Sprung, Trim, Farbwechsel
  → tie()           Verriegelung an Anfang und Ende jedes getrimmten Blocks
  → post()          Ministiche entfernen, lange Sprünge splitten
  → analyze()       Stats, Dichte, Warnungen
StitchPlan
  → render() | export()
```

Cache: `hash(objekt.params + objekt.geometrie + preset)` → Stichblock. Nur geänderte Objekte werden neu gerechnet, `connect()` bis `analyze()` laufen immer (billig).

---

## 5. Geometrie-Modul

| Funktion | Beschreibung | Toleranz |
|---|---|---|
| `flatten(bezier)` | Adaptive Flachung kubischer/quadratischer Béziers zu Polylines | 0,05 mm |
| `simplify(polyline)` | Douglas-Peucker | 0,02 mm |
| `offset(polygon, d)` | Clipper2, Join = round, positiv nach außen | — |
| `union/difference/intersect` | Clipper2, Ergebnis mit Löchern | — |
| `resample(polyline, step, keepCorners)` | Punkte im Abstand `step`, Ecken > 30° bleiben erhalten | — |
| `clipLine(line, polygon)` | Schnittsegmente einer Geraden mit Polygon inkl. Löcher | — |
| `nearestPoint(polyline, p)` | nächster Punkt und Parameter | — |
| `arcLength(polyline)`, `pointAt(polyline, t)` | Bogenlänge, Punkt bei Länge | — |
| `insideTravel(polygon, a, b)` | kürzester Weg von a nach b, der im Polygon bleibt (Sichtbarkeitsgraph über Kontur + Löcher) | — |
| `medialAxis(polygon)` | Skelett für Auto-Satin (Voronoi der Kontur, Zweige geschnitten) | Phase 1 Woche 4 |

Polygone werden beim Import normiert: Außenring im Uhrzeigersinn, Löcher gegen, Selbstschnitte mit Clipper-Union aufgelöst.

---

## 6. Running Stitch

Parameter: `stitchLengthMm` (Standard 2,5), `repeats` (1/3/5), `closed`.

1. Pfad mit `resample(step = stitchLengthMm, keepCorners = true)`.
2. Letzten Abschnitt gleichmäßig aufteilen, damit kein Reststich < 0,5 mm entsteht.
3. Bean Stitch: je Segment vor, zurück, vor (3) bzw. 5 Durchgänge.
4. Geschlossen: letzter Stich = erster Stich.

---

## 7. Satin

Eingabe: `railA`, `railB`, optional `rungs`.

### 7.1 Paarung der Rails
- Ohne Sprossen: Punkte nach Bogenlängen-Anteil paaren (t ∈ [0,1] auf beiden Rails).
- Mit Sprossen: jede Sprosse schneidet beide Rails, teilt sie in Abschnitte. Innerhalb eines Abschnitts wieder nach Anteil. Sprossen sind das Werkzeug des Editors gegen Verdrehen.

### 7.2 Zugausgleich
- Beide Rails um `pullCompMm` senkrecht nach außen versetzen (Standard 0,2 mm). Optional asymmetrisch (`pullCompA`, `pullCompB`) für später.

### 7.3 Zickzack
- Abstand `spacingMm` (Standard 0,4). Gemessen auf der **längeren** Seite jedes Abschnitts, damit die Außenkurve keine Lücken bekommt.
- Anzahl Sprossen pro Abschnitt: `ceil(maxRailLength / spacingMm)`.
- Stiche wechseln A → B → A. Breite pro Sprosse = Abstand der Endpunkte.

### 7.4 Breitenkontrolle
- Breite > `maxWidthMm` (Standard 7): Split-Satin, Sprosse in `ceil(b / maxWidthMm)` Teilstiche teilen, Zwischenpunkte versetzt (Stagger), damit keine Linie entsteht.
- Breite < 1 mm: Warnung `SATIN_TOO_NARROW`. Breite < 0,6 mm: Vorschlag Running.
- Breite > 12 mm: Warnung `SATIN_TOO_WIDE`, Vorschlag Fill.

### 7.5 Kurzstiche
- In Kurven mit Innenradius < 1 mm jeden zweiten Stich auf der Innenseite auf 70 % verkürzen (Fadenberg vermeiden). Aktiv wenn `shortStitches = true`.

### 7.6 Unterlage
Reihenfolge: center → contour → zigzag → Deckstiche.

| Typ | Erzeugung | Standard |
|---|---|---|
| center | Running auf Mittellinie (Mittelpunkte der Sprossen), Stichlänge 2,5 | Breite < 3 mm |
| contour | Running auf beiden Rails, um `insetMm` (0,4) nach innen versetzt | Breite ≥ 3 mm |
| zigzag | Zickzack mit `zigzagSpacingMm` (3,0), Rails um `insetMm` versetzt | Breite ≥ 3 mm |

### 7.7 Auto-Satin (Form → Satin)
1. `medialAxis(shape)` → Skelett, an Verzweigungen in Äste teilen.
2. Pro Ast: Rails = jeweils nächster Konturabschnitt links und rechts.
3. Breite entlang des Astes prüfen: Median > `maxWidthMm` → Fill statt Satin.
4. Ergebnis: mehrere `SatinObject`, verbunden in Reihenfolge entlang des Skeletts.
5. Der Editor zeigt das Ergebnis als Vorschlag, Nutzer korrigiert Rails/Sprossen.

---

## 8. Fill

Parameter: `angleDeg` (0), `rowSpacingMm` (0,25), `stitchLengthMm` (3,0), `staggerRows` (4), `pullCompMm` (0), `underlay`.

### 8.1 Vorbereitung
1. Form mit `offset(pullCompMm)` versetzen.
2. Koordinaten um `-angleDeg` drehen, damit Reihen waagerecht liegen.

### 8.2 Scanlines
- Reihen im Abstand `rowSpacingMm` von unten nach oben.
- Je Reihe `clipLine` → Liste von Segmenten, sortiert nach x.

### 8.3 Sektionen
- Segmente aufeinanderfolgender Reihen sind verbunden, wenn sie sich in x überlappen.
- Zusammenhängende Ketten ohne Verzweigung = Sektion. Bei Verzweigung (ein Segment überlappt zwei in der nächsten Reihe) endet die Sektion.
- Ergebnis: Sektionsgraph (Knoten = Sektionen, Kanten = Nachbarschaft).

### 8.4 Stiche innerhalb einer Sektion
- Serpentine: Reihe 1 links→rechts, Reihe 2 rechts→links usw.
- Stiche im Abstand `stitchLengthMm`, Versatz je Reihe `(row mod staggerRows) / staggerRows * stitchLengthMm`, gemessen von einem festen Raster, nicht vom Segmentanfang (sonst wandert der Versatz).
- Erster und letzter Stich immer auf der Kontur.

### 8.5 Sektionsreihenfolge und Reisewege
- Start: Sektion nächst `startPoint`, sonst unten links.
- Greedy: nächste unbesuchte Sektion nach Distanz; Reiseweg mit `insideTravel` als Running (Stichlänge 2,0) **innerhalb der Form**, damit er später überdeckt wird. Kein Sprung im Fill.
- Ende bei `endPoint`, falls gesetzt.

### 8.6 Unterlage
| Typ | Erzeugung |
|---|---|
| contour | Running auf `offset(shape, -insetMm)`, Standard-Inset 0,4 |
| single | Fill mit `spacingMm` 2,0, Winkel `angleDeg + 90`, Inset 0,4, Stichlänge 3,0 |
| double | zwei single-Lagen bei ±45° zum Deckwinkel |

Standard: contour + single. Ab 20 mm Kantenlänge: double.

---

## 9. Text (Lettering)

- Schriftformat: JSON, ein Glyph = Liste von `SatinObject` (Rails + Sprossen) in Einheiten der Versalhöhe 1,0, plus `advance`, `kerning`.
- Quelle: Ink/Stitch-Fonts (SVG mit Satin-Spalten), viele unter OFL. Konverter `fonts/import-inkstitch.ts` liest deren SVG und schreibt JSON.
- `expand()`: Glyphen auf Grundlinie oder Pfad setzen, auf `heightMm` skalieren, Satin-Parameter aus Preset. Reihenfolge: Buchstabe für Buchstabe, Verbindung zwischen Buchstaben als Running unter dem nächsten Buchstaben, sonst Trim.
- Jede Schrift hat `minHeightMm` (typisch 5). Darunter Warnung `TEXT_TOO_SMALL`.
- Phase 1: eine Schrift (serifenlos, Versalhöhe 5–15 mm). Phase 3: 5–10.

---

## 10. Reihenfolge und Verbindungen

### 10.1 Reihenfolge
- Standard: Objektliste wie im Design.
- Vorschlag `autoOrder()`: nach Farbe gruppieren (Farbwechsel minimieren), innerhalb einer Farbe nach Distanz. Unterlagen und Hintergrundflächen zuerst, Konturen zuletzt. Der Nutzer kann den Vorschlag annehmen oder überschreiben.

### 10.2 Verbindung zweier Blöcke
Entscheidung zwischen Blockende A und Blockanfang B:

| Bedingung | Aktion |
|---|---|
| Farbe unterschiedlich | `trim`, `color` |
| Distanz ≤ 3 mm und Weg liegt unter einem späteren Objekt derselben Farbe oder innerhalb von B | Running-Verbindung, kein Trim |
| Distanz ≤ `jumpTrimMm` (5) | `jump`, kein Trim |
| sonst | `trim`, `jump` |

`trimAfter` am Objekt überschreibt: `always` → immer Trim, `never` → nie.

### 10.3 Verriegelung
- Nach jedem `trim`/`color` und am Anfang: drei Stiche 0,3 mm vor/zurück entlang der ersten Stichrichtung.
- Vor jedem `trim` und am Ende: dasselbe rückwärts.
- Keine Verriegelung bei Running-Verbindungen.

---

## 11. Post-Processing und Analyse

- Stiche < 0,3 mm entfernen, außer Verriegelung. Verriegelungsstiche sind per Definition 0,3 mm kurz und tragen deshalb `tie: true` (§3), sonst würde genau die Verriegelung aus §10.3 hier verschwinden. *(19.09.2026)*
- Stiche und Sprünge > 12,1 mm in Teilstücke splitten (DST-Limit 121 Einheiten).
- **Rundung: kaufmännisch-symmetrisch** (`roundHalfEven`, halbe Werte zur geraden Zahl), überall dort, wo Millimeter zu ganzen Formateinheiten werden. Grund: die Kreuzprüfung aus §13.2 läuft gegen Python, dessen `round()` genauso rundet. Bei Reihenabstand 0,25 mm liegt jede zweite Koordinate exakt auf der halben DST-Einheit — mit `Math.round` wäre die Datei nicht byte-identisch. *(19.09.2026)*
- Stats:
  - `runtimeSec = stitches / (rpm/60) + trims * 3 + colorChanges * 12`, `rpm` aus Maschinenprofil (Standard 800).
  - Dichte: Raster 1 × 1 mm, Stiche pro Zelle zählen. Warnung ab 12/mm², Fehler ab 18/mm².
- Warnungen (Auswahl): `SATIN_TOO_NARROW`, `SATIN_TOO_WIDE`, `FILL_TINY` (Fläche < 4 mm²), `TEXT_TOO_SMALL`, `DENSITY_HIGH`, `MANY_COLOR_CHANGES` (> 8), `LONG_JUMP` (> 30 mm), `SELF_INTERSECTING_RAILS`, `OBJECT_OUTSIDE_HOOP`, `SHAPE_SPLIT` (Fläche zerfällt beim Normieren in n Teile; die Teilanzahl steht in der Meldung, jedes Teil wird gestickt — nichts wird verworfen). *(19.09.2026)*

---

## 12. Rendering

- Canvas 2D, Zoom und Pan vom Editor.
- Stich = Linie, Breite 0,4 mm in Weltkoordinaten, runde Enden, leichter Schatten pro Stich für Fadenoptik. Farbe aus `threads[]`.
- Sprünge gestrichelt grau, Trims als Kreuz, Farbwechsel als Punkt.
- Modi: Faden, Linien, Punkte, Sequenz (Slider bis Stich n).
- Ziel: 50.000 Stiche in < 16 ms neu zeichnen (Offscreen-Canvas, Pfad-Batching pro Farbe).

---

## 13. Export

### 13.1 DST-Writer (TypeScript, `packages/formats`)
- Header 512 Byte: `LA:` Label 16 Zeichen, `ST:` Stiche, `CO:` Farbwechsel, `+X -X +Y -Y` Extents, `AX AY MX MY`, `PD:******`, abgeschlossen mit `0x1A` und danach mit `0x20` bis Byte 512 aufgefüllt. *(19.09.2026 — vorher „mit `0x1A` gefüllt"; pyembroidery füllt mit Leerzeichen, und §13.2 verlangt byte-identische Ausgabe gegen genau diese Bibliothek.)*
- Datensatz 3 Byte, Koordinaten in 0,1 mm, Delta-Kodierung, Bits nach Tajima-Spezifikation. `jump`, `color` (Stop), `end` (`0x00 0x00 0xF3`).
- Rundungsfehler akkumulieren: Delta immer aus gerundeter Absolutposition berechnen, nicht aus gerundeten Deltas. Gerundet wird nach §11 kaufmännisch-symmetrisch.
- **Zentrierung:** das Motiv wird vor dem Schreiben auf die Mitte seiner Bounding-Box verschoben, ganzzahlig in DST-Einheiten. Die Maschine startet im Nullpunkt; eine Datei mit durchweg positiven Koordinaten fährt aus dem Rahmen. Abschaltbar über `center: false`, wenn eine Datei bewusst im Absolutkoordinatensystem bleiben soll. *(19.09.2026)*
- **Nullpunkt-Anfahrt:** der Weg vom Nullpunkt zum ersten Stich ist selbst ein Delta und unterliegt dem 121-Einheiten-Limit. Er wird als Folge von `jump`-Datensätzen gefahren, danach folgt der erste Stich an seiner Position. Dasselbe gilt für jede andere Bewegung, die das Limit überschreitet — die Engine teilt sie bereits in §11, der Writer prüft es für fremde Stichlisten erneut. *(19.09.2026)*

### 13.2 Weitere Formate
- Neutrales JSON (`StitchPlan`) → `apps/api` → pyembroidery → PES, JEF, VP3, EXP.
- PES: Farben auf Brother-Palette mappen (nächste Farbe), echte Garnnummern als Sidecar-JSON und im Stichbericht.
- Kreuzprüfung: TS-DST gegen pyembroidery-DST aus demselben JSON muss byte-identisch sein (Test in CI).

### 13.3 Stichbericht (PDF, später)
Vorschau, Größe, Stiche, Farbfolge mit Garnnummern, Trims, Laufzeit, Preset.

---

## 14. Presets

Startwerte, in Phase 5 gegen Probesticks justieren.

| Preset | Fill Reihe | Satin Abstand | Zugausgleich | Unterlage Fill | Unterlage Satin | Hinweis |
|---|---|---|---|---|---|---|
| Piqué | 0,25 | 0,38 | 0,20 | contour + single | contour + zigzag | Standard |
| Softshell | 0,27 | 0,40 | 0,25 | contour + single | contour + zigzag | |
| Fleece | 0,28 | 0,40 | 0,30 | contour + double | contour + zigzag, Inset 0,3 | Topping empfohlen |
| Cap | 0,25 | 0,38 | 0,15 | contour + single | center + contour | Reihenfolge Mitte → außen, unten → oben |
| Frottee | 0,25 | 0,35 | 0,20 | contour + double | contour + zigzag | Knockdown-Fill unter Motiv, Topping |

Maschinenprofile: `rpm`, `hoopWMm`, `hoopHMm`, `maxJumpMm`.

---

## 15. Tests

- **Unit**: jede Geometriefunktion, jeder Stichtyp mit einfachen Formen (Rechteck, Kreis, Ring, Bogen, S-Kurve).
- **Golden Files**: Phase-0-SVGs durch die Engine, Vergleich mit Ink/Stitch-DST:
  - Stichzahl ±10 %
  - Bounding Box ±0,3 mm
  - Renderbild-Diff (SSIM > 0,9)
- **Format**: DST-Roundtrip (write → read → write byte-identisch), Kreuzprüfung mit pyembroidery.
- **Benchmark**: Logo mit 10.000 Stichen, Neuberechnung eines Objekts < 100 ms, Gesamtlauf < 300 ms.
- **Maschine**: je Meilenstein ein Probestick auf Piqué, Bewertung durch Stickverantwortlichen.

---

## 16. Meilensteine Phase 1

| Woche | Inhalt | Nachweis |
|---|---|---|
| 1 | Repo, `geometry`, Running, DST-Writer, Renderer minimal | Kontur-Logo gestickt |
| 2 | Fill mit Sektionen, Reisewegen, Unterlage | Flächenlogo gestickt, Vergleich Golden File |
| 3 | Satin mit Paarung, Sprossen, Zugausgleich, Split, Unterlage, Kurzstiche | Schriftzug aus Satin gestickt |
| 4 | Reihenfolge, Verbindungen, Verriegelung, Post, Stats, Warnungen, Auto-Satin Basis, pyembroidery-Kreuzprüfung | Komplettes Kundenlogo gestickt, Stichzahl vs. Puncher |

Abnahme Phase 1: drei Phase-0-Motive stickbar ohne manuelle Nachbearbeitung der Stiche, Abweichung zur Ink/Stitch-Stichzahl < 10 %.

---

## 17. Offene Punkte

- Asymmetrischer Zugausgleich (A/B getrennt): Phase 3.
- Fill mit Kurvenverlauf (Contour Fill, Guided Fill): Phase 3, nur wenn Bedarf.
- Applikation, 3D-Puff: nicht geplant.
- Import fremder DST/PES zur Weiterbearbeitung: Reader vorhanden, Rückführung in Objekte nicht möglich, nur Anzeige.
