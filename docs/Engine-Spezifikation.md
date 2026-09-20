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
  orderMode: 'auto' | 'manual';  // Standard 'auto' (§10.1)           (20.09.2026)
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
  sequence?: string;           // gleiche Folge = Reihenfolge steht fest (§10.1)  (20.09.2026)
};

type FillObject = Base & {
  type: 'fill';
  shape: Polygon;
  angleDeg: number;            // Stichrichtung
  rowSpacingMm: number;        // Reihenabstand = Dichte
  stitchLengthMm: number;
  staggerRows: number;         // Versatz über n Reihen
  pullCompMm: number;          // Ausgleich ENTLANG angleDeg, nach außen (+)   (19.09.2026)
  pushCompMm: number;          // Ausgleich QUER zu angleDeg, nach innen (−)   (19.09.2026)
  underlapMm: number;          // Überlappung unter die Nachbarkontur           (19.09.2026)
  cutsBelow: 'auto' | 'never' | 'always';  // schneidet aus tieferen Fills       (20.09.2026)
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
  → expand()        Text → Satin-Objekte
  → order()         Reihenfolge übernehmen oder Vorschlag berechnen
  → resolveOverlaps()  überdeckte Flächen ausschneiden, Unterlappung setzen (§4.1)
  → generate()      je Objekt: Unterlage → Deckstiche (gecacht per Hash)
  → connect()       Verbindungen zwischen Objekten: Laufstich, Sprung, Trim, Farbwechsel
  → tie()           Verriegelung an Anfang und Ende jedes getrimmten Blocks
  → post()          Ministiche entfernen, lange Sprünge splitten
  → analyze()       Stats, Dichte, Warnungen
StitchPlan
  → render() | export()
```

Cache: `hash(objekt.params + objekt.geometrie + preset)` → Stichblock. Nur geänderte Objekte werden neu gerechnet, `connect()` bis `analyze()` laufen immer (billig).

**Auto-Satin ist kein Pipeline-Schritt** *(20.09.2026 — `expand()` hieß vorher „Text →
Satin-Objekte, Auto-Satin-Kandidaten auflösen")*. §3 kennt keinen Objekttyp, der einen
Kandidaten markiert, und bekommt auch keinen. Auto-Satin entsteht beim **Import** (§5.1)
und ist sonst ein Werkzeug des Editors, dessen Vorschlag der Nutzer korrigiert (§7.7
Punkt 5).

### 4.1 `resolveOverlaps()` — Knockdown *(20.09.2026)*

Druckvorlagen legen den Untergrund als volle Fläche unter das Motiv. Gedruckt deckt die
obere Farbe die untere ab; gestickt wird beides, und die Stelle bekommt doppelte Deckung.
An den vier Testlogos war das die Ursache für `DENSITY_HIGH` als Fehler (gemessen: zwei
Flächen mit 86 % Überdeckung).

Die Stufe läuft **nach `order()`** — erst dann steht fest, was oben und was unten liegt —
und **vor `generate()`**, damit der Cache die geänderte Geometrie sieht.

Daraus folgt eine Bedingung an `order()`: **die Stickreihenfolge darf zwei einander
überdeckende Objekte nicht vertauschen.** Wer später stickt, liegt oben — und wird damit
zum Schneidenden. Beim STUTTGART-Logo hat die Farbgruppierung das schwarze Schild hinter
das graue Pferd geschoben, worauf der Knockdown das Pferd wegschnitt, genau wie ihm gesagt.
§10.1 hält die Reihenfolge deshalb als topologische Sortierung über die Überdeckungen.

Regeln:

1. **Nur Fill schneidet, und nur aus Fill.** Satin, Running und Text schneiden nie und
   werden nie geschnitten. Sie sind Linien und Spalten; was sie abdecken, ist eine Frage
   der Kontur, nicht der Fläche.
2. **Später schneidet aus früher, farbunabhängig.** Wer später gestickt wird, liegt oben.
   Die Farbe spielt keine Rolle — es geht um Deckung, nicht um Farbgleichheit.
3. **Schwelle 20 mm².** Unter dieser überdeckten Fläche wird nicht geschnitten. Darunter
   ist der Schnitt teurer (zusätzliche Kanten, zusätzliche Sektionen) als der doppelte
   Stich.
4. **Die untere Fläche bleibt 0,8 mm unter der oberen.** Ausgeschnitten wird nicht auf
   Kante, sondern um 0,8 mm nach innen versetzt — sonst reißt der Stoffzug genau dort eine
   Lücke auf (§8.1.2). Umgesetzt, indem die obere Form vor dem Abziehen um 0,8 mm
   geschrumpft wird; `underlapMm` der unteren Fläche bleibt unberührt, weil es die Form
   rundum vergrößern würde und nicht nur an der Schnittkante.
5. **Angrenzende Flächen ohne Überdeckung** bekommen dasselbe: berühren sich zwei Fills,
   ohne sich zu überdecken, wird die **frühere** um 0,8 mm unter die spätere erweitert.
6. **`cutsBelow` am oberen Objekt** steuert es je Objekt: `'auto'` (Standard, Regeln oben),
   `'never'` (schneidet nie), `'always'` (schneidet auch unter 20 mm²).

Nichts wird verworfen: eine untere Fläche, die vollständig verschwindet, wird nicht
gestickt und meldet `FILL_COVERED` als `info` — das ist eine Aussage, keine stille
Reparatur (Regel 8).

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

### 5.1 Import aus SVG *(20.09.2026)*

Der Import ist die Stelle, an der aus Grafik ein Stickobjekt wird. Bis zum 20.09.2026 hat
er alles Gefüllte zu einem Fill mit 0° und ohne Ausgleich gemacht — beides war eine
Auslassung, keine Entscheidung.

**Stichart nach der Breite.** Für jede gefüllte Form wird die **mediane Breite** über die
Mittelachse (`medialAxis`, doppelter Radius, nach Astlänge gewichtet) bestimmt:

| mediane Breite | Stichart |
|---|---|
| < 5 mm | **Satin** über `autoSatin` (§7.7) |
| ≥ 5 mm | **Fill** |

**Der Vorschlag wird geprüft, bevor er übernommen wird** *(20.09.2026)*. `railsForBranch`
liest eine Rail Punkt für Punkt vom Skelett ab und kann auf einer gekrümmten Form
aufeinanderfolgende Punkte auf gegenüberliegende Seiten legen — die Rail windet sich, und
die Spalte stickt denselben Quadratmillimeter wieder und wieder. Gemessen an einem
Buchstaben von 10 × 13 mm: Rails von 38 mm und **92 Stiche in einem Quadratmillimeter**.
Zwei Schranken:

- **Rail-Budget:** beide Rails aller Spalten zusammen dürfen die Kontur der Form nicht
  überschreiten (Faktor 1,3 für Abtastung und Endkappen). Die Rails werden von der Kontur
  abgelesen, können zusammen also nicht länger sein als sie — es sei denn, ein Stück wird
  mehrfach benutzt.
- **Ausdehnung je Spalte:** die Rails einer Spalte dürfen höchstens das Doppelte der
  Ausdehnung dieser Spalte messen. Das Budget allein ist blind für eine gewundene Spalte
  zwischen gesunden, weil eine Form mit Löchern genug Kontur hat, sie zu verstecken.

Reißt eine der beiden Schranken, wird die Form ein Fill und meldet `AUTOSATIN_MIXED`.
**Das ist eine Notbremse, keine Lösung** — `railsForBranch` gehört überarbeitet (Kontur in
zwei Ketten zwischen den Astenden teilen statt punktweise nächster Nachbar je Seite). Steht
in `docs/backlog.md`.

Ist ein Ast der Form breiter als `maxWidthMm` (§7.4), wird die **ganze** Form ein Fill und
meldet `AUTOSATIN_MIXED` als `info` mit der Zahl der betroffenen Äste. Die Form je Ast in
Satin und Fill zu zerlegen steht nirgends und wäre geraten; ein Entwurf aus Spalten plus
nicht zugeordneter Restfläche ist außerdem nicht stickbar.

**Zugausgleich aus dem Preset.** `pullCompMm` und `pushCompMm` kommen aus dem Preset (§14).
Sie gehören zum Stoff, und der steht mit dem Preset fest. `underlapMm` bleibt **0** — es
kommt aus `resolveOverlaps()` (§4.1), das als Einziges weiß, was neben und unter der Fläche
liegt.

**Stichwinkel.** Standard **45°**. Alle Flächen im gleichen Winkel wirken flach; 45° ist
zudem der Winkel, der am wenigsten mit den Maschen des Gewirkes fluchtet. Eine Fläche, die
eine frühere überdeckt oder an sie grenzt, bekommt **−45°** — so kreuzen sich die
Richtungen an jeder Naht, statt parallel zu laufen.

---

## 6. Running Stitch

Parameter: `stitchLengthMm` (Standard 2,5), `repeats` (1/3/5), `closed`.

1. Pfad abtasten, Ecken bleiben erhalten (`keepCorners`). Die Schrittweite ist **nicht konstant**, siehe unten.
2. Letzten Abschnitt gleichmäßig aufteilen, damit kein Reststich < 0,5 mm entsteht.
3. Bean Stitch: je Segment vor, zurück, vor (3) bzw. 5 Durchgänge.
4. Geschlossen: letzter Stich = erster Stich.

### 6.1 Krümmungsadaptive Stichlänge *(19.09.2026)*

Ein Stich ist eine Sehne. Auf einer engen Kurve schneidet eine Sehne von 2,5 mm die Kurve
sichtbar ab — die Linie wirkt eckig, und genau davor warnt die Punch-Praxis. Die
Schrittweite richtet sich deshalb nach dem lokalen Radius:

```
step(R) = clamp( sqrt(8 · R · toleranceMm), MIN_ADAPTIVE_MM, stitchLengthMm )
```

- `toleranceMm` ist der größte zugelassene Sehnenabstand (Pfeilhöhe), Standard **0,05 mm** — halb so groß wie die DST-Auflösung von 0,1 mm, also unsichtbar in der Datei.
- `MIN_ADAPTIVE_MM` = **0,8 mm**. Darunter geht die Kurventreue nicht mehr; kürzer wäre eine Perforation, nicht ein Stich (§11).
- `R` ist der Umkreisradius dreier aufeinanderfolgender Pfadpunkte. Liegen sie auf einer Geraden, ist R unendlich und die volle Stichlänge gilt.

Die Grenzen gelten in beide Richtungen: eine Gerade bekommt weiterhin genau
`stitchLengthMm`, ein Kreis von 1 mm Radius bekommt 0,8 mm und keinen kürzeren Stich.

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

Parameter: `angleDeg` (0), `rowSpacingMm` (Preset, §14), `stitchLengthMm` (3,0), `staggerRows` (4), `pullCompMm` (0), `pushCompMm` (0), `underlapMm` (0), `underlay`.

### 8.1 Vorbereitung
1. Richtungsabhängiger Ausgleich, siehe 8.1.1.
2. Überlappung `underlapMm` nach außen, siehe 8.1.2.
3. Koordinaten um `-angleDeg` drehen, damit Reihen waagerecht liegen.

#### 8.1.1 Zug und Schub sind nicht dieselbe Richtung *(19.09.2026)*

Der Faden zieht den Stoff **in Fadenrichtung** zusammen und drückt ihn **quer dazu**
auseinander. Ein isotroper Offset, wie ihn §8.1 bis zum 19.09.2026 vorsah, gleicht deshalb
die eine Richtung richtig aus und die andere falsch herum.

- `pullCompMm` wirkt **entlang `angleDeg`** und vergrößert (+).
- `pushCompMm` wirkt **quer zu `angleDeg`** und verkleinert (−).

Beide zusammen sind ein anisotroper Offset. Umsetzung: um `-angleDeg` drehen, sodass die
Fadenrichtung auf +x liegt; dann zwei elliptische Offsets. Ein elliptischer Offset mit den
Halbachsen (a, b) ist ein Kreis-Offset in einem gestauchten Koordinatensystem: Achse um
`a/b` strecken, um `a` versetzen, zurückstauchen. Für eine Richtung allein wird `b` nicht
null gesetzt, sondern `a/K` mit **K = 40** — der Rest auf der Gegenachse liegt damit bei
`a/40`, bei 0,2 mm Ausgleich also 5 µm und weit unter der DST-Auflösung von 0,1 mm.

Standard ist `pushCompMm` 0: ohne Probestick ist der Schub nicht beziffert. Die Presets
setzen ihn (§14), die Spec schreibt ihn nicht vor.

**Verschwindet eine Form unter dem Ausgleich**, wird sie ohne Ausgleich gestickt und meldet
`INVALID_GEOMETRY` als `warn` *(20.09.2026)*. Eine Sichel, die schmaler ist als der doppelte
Schub, gehört trotzdem zum Motiv; sie gar nicht zu sticken wäre der größere Fehler. Gesagt
wird es trotzdem (Regel 8).

#### 8.1.2 Überlappung unter die Nachbarkontur *(19.09.2026)*

`underlapMm` vergrößert die Form **isotrop** nach außen, bevor gefüllt wird. Das ist nicht
derselbe Zweck wie der Zugausgleich: der gleicht die Bewegung des Stoffs aus, die
Überlappung deckt die Naht. Die Praxis verlangt zwei bis drei Stichbreiten Überlappung
zwischen Fläche und darüberliegender Kontur, sonst reißt der Stoffzug dort eine Lücke auf
(„Blitzer"). Reihenfolge: erst der richtungsabhängige Ausgleich, dann die Überlappung.

#### 8.1.3 Warnung `EDGE_GAP_RISK` *(19.09.2026)*

Die Engine kann nicht wissen, welche Kontur zu welcher Fläche gehört — sie sieht aber, wenn
beide gefährlich nah beieinander liegen, ohne sich zu überlappen. Geprüft wird je Paar aus
einem Fill F und einem **Satin oder einem zweiten Fill** N *(20.09.2026 — vorher nur gegen
Satin; bei importierten Logos ist die Kontur meist selbst eine Fläche, dort griff die
Prüfung nie)*:

- der kleinste Abstand zwischen der Kontur von N (beim Satin: den Rails) und der Kontur von F ist kleiner als **0,3 mm**, **und**
- die von N überdeckte Fläche schneidet die wirksame Fläche von F (also nach `underlapMm`) nicht.

Dann `EDGE_GAP_RISK` als `warn`, mit beiden Objekt-IDs in der Meldung. Geprüft wird auf der
Objektliste, nicht auf den Stichen, und nur für Paare, deren Bounding-Boxen sich bis auf
0,3 mm nähern.

**Nach `resolveOverlaps()` feuert die Warnung nur noch bei `cutsBelow: 'never'`**
*(20.09.2026)*. In jedem anderen Fall setzt §4.1 die Unterlappung selbst; die Warnung wäre
dann ein Hinweis auf etwas, das die Engine bereits erledigt hat. Bei `'never'` hat der
Nutzer den Schnitt ausdrücklich abgelehnt — dann ist der Hinweis berechtigt und nichts wird
verändert (Regel 8).

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

### 8.7 Wege zwischen den Phasen *(20.09.2026)*

Ein Fill besteht aus mehreren Phasen: Konturunterlage, Gitterunterlage (ein- oder
zweilagig), Deckstich — und bei mehreren Teilflächen jede davon erneut. Bis zum 20.09.2026
wurden sie **aneinandergehängt**. Der Übergang von einer Phase zur nächsten war damit ein
einziger Stich über die ganze Strecke: am STUTTGART-Logo 62,8 mm, am Köln-Logo 105,3 mm.

Regeln:

1. **Zwischen zwei Phasen** läuft der Weg mit `insideTravel` innerhalb der Form, als
   Laufstich mit 2,0 mm (wie in §8.5).
2. **Die nächste Phase beginnt nahe dem Cursor.** Bei der Konturunterlage heißt das: der
   Ring wird auf seinen dem Cursor nächsten Punkt gedreht. Beim Fill übernimmt das der
   vorhandene `startPoint`.
3. **Zwischen den Ringen der Konturunterlage** gilt dasselbe — eine Form mit Löchern hat
   mehrere Ringe, und der Weg vom einen zum nächsten ist ein Reiseweg, kein Stich quer
   durch die Form.
4. **Der Reihenwechsel in der Serpentine** wird unterteilt, wenn er länger als
   `stitchLengthMm` ist. Am geraden Rand ist er genau der Reihenabstand, am gekrümmten
   wandert das Reihenende seitwärts: beim 2-mm-Abstand der Gitterunterlage ergibt ein Kreis
   6 mm. Es ist dieselbe Linie wie vorher, nur nicht mehr in einem Stich.

Zusage: **kein Stich im Fill ist länger als 1,5 × `stitchLengthMm`.** Gemessen an den vier
Logos: längster Stich 3,0 mm bei einer Stichlänge von 3,0.

---

## 9. Text (Lettering)

- Schriftformat: JSON, ein Glyph = Liste von `SatinObject` (Rails + Sprossen) in Einheiten der Versalhöhe 1,0, plus `advance`, `kerning`.
- Quelle: Ink/Stitch-Fonts (SVG mit Satin-Spalten), viele unter OFL. Konverter `fonts/import-inkstitch.ts` liest deren SVG und schreibt JSON.

### 9.1 Aufbau einer Ink/Stitch-Schrift *(20.09.2026)*

Eine Schrift sind zwei Dateien aus `inkstitch/embroidery-fonts`, Ordner `src/<name>/`:

| Datei | Inhalt |
|---|---|
| `font.json` | `name`, `horiz_adv_x` je Zeichen, `horiz_adv_x_default`, `horiz_adv_x_space`, `units_per_em`, `size` (Höhe des Gevierts in mm bei Maßstab 1), `min_scale`, `kerning_pairs` |
| `ltr.svg` | die Glyphen, je eine Inkscape-Ebene `inkscape:label="GlyphLayer-X"` |

In einer Glyph-Ebene stehen die Pfade **in Stickreihenfolge**:

- `inkstitch:satin_column="True"` → eine Satin-Spalte. Die Unterpfade eines `d` sind **Rail A, Rail B, dann die Sprossen** — eine Sprosse wird auf ihre beiden Enden reduziert.
- jeder andere Pfad → Laufstich; das sind die Wege, die Ink/Stitch zwischen die Spalten legt.

**Normierung.** Unser Format will die Grundlinie bei y = 0 und die Versalhöhe bei −1. Beides steht als Inkscape-Hilfslinie im SVG: `baseline` und `caps`. Ihr **Abstand** ist die Versalhöhe in Dokumenteinheiten und hängt nicht davon ab, wo der Seitenursprung liegt; die Lage der Grundlinie selbst braucht zusätzlich die Dokumenthöhe, weil Hilfslinien mit y nach **oben** gespeichert werden. Vorschübe und Kerning werden durch dieselbe Versalhöhe geteilt.

**`minHeightMm`** = `min_scale · size · (Versalhöhe / units_per_em)`. `min_scale` begrenzt das Geviert, unsere Höhe ist die Versalhöhe. Für `caffeine_tiny`: 0,25 · 16,2 mm · 0,641 = **2,6 mm**.

`rtl.svg` wird nicht gelesen — §9 setzt von links nach rechts.

**Lizenz je Schrift.** Nicht jede Schrift im Ink/Stitch-Repo darf weitergegeben werden. Die `LICENSE` des Ordners gehört mit ins Repo, und ohne sie kommt keine Schrift herein. `caffeine_tiny` steht unter der SIL Open Font License 1.1.
- `expand()`: Glyphen auf Grundlinie oder Pfad setzen, auf `heightMm` skalieren. Reihenfolge: Buchstabe für Buchstabe, Verbindung zwischen Buchstaben als Running unter dem nächsten Buchstaben, sonst Trim.

### 9.2 Die Schrift bringt ihre Stichparameter mit *(20.09.2026 — vorher „Satin-Parameter aus Preset")*

Ein Glyph ist mit bestimmten Parametern gezeichnet worden, und die Seitenabstände der
Schrift sind darauf abgestimmt. `caffeine_tiny` nennt an jeder Spalte
`pull_compensation_mm="0.05"` und `zigzag_spacing_mm="0.25"`. Werden stattdessen die
Preset-Werte genommen (Piqué: 0,20 und 0,38), wächst jeder Buchstabe um 0,4 mm in der
Breite — gemessen an „TEXMA" in 8 mm bleiben von 0,48 mm Abstand noch 0,08 mm, und mit
0,4 mm Fadenbreite sticken die Buchstaben ineinander.

Also: **was die Schrift sagt, gilt.** Der Zugausgleich, der Zickzack-Abstand und der
Kurzstich-Abstand kommen aus der Schrift. Das Preset füllt, was die Schrift nicht sagt, und
behält die **Unterlage** — die gehört zum Stoff, nicht zum Buchstaben.

### 9.3 Die Reihenfolge der Schrift steht fest *(20.09.2026)*

In einer Glyph-Ebene stehen Spalten und Laufstich-Verbinder **abwechselnd**: Spalte, Weg
zur nächsten Spalte, Spalte. Genau dafür sind die Verbinder da. `autoOrder` sortierte sie
nach §10.1 auseinander — erst alle 25 Spalten von „TEXMA", dann alle 22 Verbinder — und
stickte die Wege zuletzt über die fertigen Buchstaben, mit 23 Trims.

Die Objekte eines Textes bekommen deshalb dasselbe `sequence` (§3) und behalten damit ihre
Reihenfolge. Dasselbe gilt für die Spalten eines Auto-Satin-Vorschlags: auch die sind
bereits geordnet (§7.7).
- Jede Schrift hat `minHeightMm` (typisch 5). Darunter Warnung `TEXT_TOO_SMALL`.
- Phase 1: eine Schrift (serifenlos, Versalhöhe 5–15 mm). Phase 3: 5–10.

---

## 10. Reihenfolge und Verbindungen

### 10.1 Reihenfolge
- **Standard: `autoOrder()`** *(20.09.2026 — vorher „Objektliste wie im Design")*. `Design.orderMode` steuert es: `'auto'` (Standard) rechnet den Vorschlag, `'manual'` nimmt die Objektliste, wie sie ist. Grund: mit der Designreihenfolge braucht das STUTTGART-Logo zwölf Farbwechsel für zwei Farben, mit `auto` einen; beim Köln-Logo 21 statt 5. Eine Voreinstellung, die man in jedem einzelnen Fall ändern muss, ist die falsche Voreinstellung. Wer die Reihenfolge selbst gelegt hat, setzt `'manual'`.
- Vorschlag `autoOrder()`: nach Farbe gruppieren (Farbwechsel minimieren), innerhalb einer Farbe in drei Stufen, danach nach dem kürzesten Weg. Der Nutzer kann den Vorschlag annehmen oder überschreiben.

**Eine Folge bindet die Reihenfolge** *(20.09.2026)*. Objekte mit demselben `sequence` (§3)
behalten ihre Reihenfolge untereinander. Das ist nicht dasselbe wie eine Überdeckung: hier
weiß der Erzeuger — `expand` für einen Text, `autoSatin` für einen Vorschlag —, in welcher
Reihenfolge seine Objekte gestickt gehören, und diese Reihenfolge ist Teil des Ergebnisses.
Zwischen verschiedenen Folgen darf weiter umgruppiert werden.

**Überdeckung bindet die Reihenfolge** *(20.09.2026)*. Zwei Objekte, deren gestickte
Flächen sich überdecken, behalten ihre Reihenfolge aus dem Design — alles andere darf
umgruppiert werden. Umgesetzt als topologische Sortierung: Kanten aus der Designreihenfolge
für jedes überdeckende Paar, dann Kahn mit Vorzug für die Farbe in der Nadel, danach Stufe,
Ring und Weg. Objekte ohne Fläche (Laufstich, Text) binden nichts. Bleibt am Ende ein
Zyklus — Geometrie, die sich gegenseitig überdeckt —, gilt für den Rest die
Designreihenfolge.

Das kostet Farbwechsel: STUTTGART kommt damit auf 6 statt 1. Der Preis ist nicht
verhandelbar, denn ohne die Bedingung schneidet der Knockdown aus §4.1 Teile des Motivs
weg.

**Hintergrund → Details → Konturen** *(19.09.2026)*. Die Stufe geht dem Weg vor, immer:

| Stufe | Rang | Objekte |
|---|---|---|
| Hintergrund | 0 | `fill` — die Flächen, auf denen alles andere liegt |
| Details | 1, 2 | `satin`, `text` |
| Konturen | 3 | `running` — Umrandungen und Linien, zuletzt |

Eine Kontur, die vor ihrer Fläche gestickt wird, verschwindet unter ihr. Deshalb ist die
Reihenfolge keine Optimierung, sondern eine Bedingung. Innerhalb einer Stufe entscheidet
der kürzeste Weg vom zuletzt gestickten Objekt.

**Mitte → außen, unten → oben: Regel für das Cap-Preset** *(19.09.2026 — am selben Tag
zuerst für alle Presets eingeführt, dann auf Cap eingegrenzt)*. Sticken schiebt den Stoff
vor sich her. Auf dem runden Kapp-Rahmen ist die Richtung zwingend: wer eine Kappe wie
Flachware von links nach rechts stickt, verschiebt sie unter dem Motiv. Auf Flachware
wiegt der kürzere Weg schwerer, dort bleibt es beim Weg.

Umsetzung in **Ringen**, nicht nach reinem Radius: innerhalb von Farbe und Stufe wird der
innerste Ring der Breite `max(5 mm, 0,2 · größter Radius)` um die Mitte der
Design-Bounding-Box abgearbeitet, bevor der nächste beginnt. Jede Farbe startet am
**untersten** Objekt ihres innersten Rings (größtes y, §1 zeigt y nach unten), danach
entscheidet innerhalb des Rings der kürzeste Weg. Nach einem Trim darf die Maschine überall
neu ansetzen, deshalb beginnt jede Farbe für sich.

Der Ring ist nicht Kosmetik: nach reinem Radius sortiert springt die Maschine zwischen zwei
Objekten, die zufällig auf demselben Kreis liegen, quer durchs Motiv. Gemessen am
Eislingen-Logo waren das **922 Sprünge statt 265**. Mit Ringen sind es 334.

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

- **Mindeststichlänge 0,6 mm** *(19.09.2026 — vorher 0,3 mm)*. Kürzere Stiche entfernen. Die Praxis zieht die Grenze bei 1 mm: darunter perforiert die Nadel den Stoff, statt ihn zu decken, und auf der Unterseite entstehen Fadenknäuel. 1,0 mm als harte Grenze würde allerdings den Reihenwechsel im Tatami mit abräumen, der bei 0,40 mm Reihenabstand genau 0,40 mm lang ist und dazugehört. 0,6 mm trifft die Stiche, die niemand gewollt hat, und lässt die stehen, die aus dem Verfahren kommen.
- Der Wert ist **konfigurierbar** (`minStitchMm` im Maschinenprofil, §14) — eine Maschine mit anderem Greifer verträgt andere Grenzen.
- **Verriegelung ist ausgenommen.** Verriegelungsstiche sind per Definition kurz und tragen deshalb `tie: true` (§3), sonst würde genau die Verriegelung aus §10.3 hier verschwinden. *(19.09.2026)*
- Stiche und Sprünge > 12,1 mm in Teilstücke splitten (DST-Limit 121 Einheiten).
- **Rundung: kaufmännisch-symmetrisch** (`roundHalfEven`, halbe Werte zur geraden Zahl), überall dort, wo Millimeter zu ganzen Formateinheiten werden. Grund: die Kreuzprüfung aus §13.2 läuft gegen Python, dessen `round()` genauso rundet. Bei Reihenabstand 0,25 mm liegt jede zweite Koordinate exakt auf der halben DST-Einheit — mit `Math.round` wäre die Datei nicht byte-identisch. *(19.09.2026)*
- Stats:
  - `runtimeSec = stitches / (rpm/60) + trims * 3 + colorChanges * 12`, `rpm` aus Maschinenprofil (Standard 800).
  - Dichte: Raster 1 × 1 mm, Stiche pro Zelle zählen. **Warnung**, sobald das Maximum über 12/mm² liegt. **Fehler** erst, wenn mehr als **1 % der belegten Zellen** über 18/mm² liegen **oder** eine einzelne Zelle über **30/mm²**. *(20.09.2026 — vorher „Fehler ab 18/mm²" auf den Spitzenwert.)* Der Spitzenwert allein taugt nicht: beim STUTTGART-Logo lösten **9 von 4.047 Zellen** den Fehler aus, während 92 % der Zellen bei höchstens 8/mm² lagen. Eine einzelne heiße Stelle ist eine Warnung wert, keine Ablehnung — eine Zelle über 30 dagegen schon, und eine Fläche, die zu einem Prozent überfüllt ist, erst recht.
- Warnungen (Auswahl): `SATIN_TOO_NARROW`, `SATIN_TOO_WIDE`, `FILL_TINY` (Fläche < 4 mm²), `FILL_TOO_NARROW`, `EDGE_GAP_RISK`, `FILL_COVERED`, `AUTOSATIN_MIXED`, `TEXT_TOO_SMALL`, `DENSITY_HIGH`, `MANY_COLOR_CHANGES` (> 8), `LONG_JUMP` (> 30 mm), `SELF_INTERSECTING_RAILS`, `OBJECT_OUTSIDE_HOOP`, `SHAPE_SPLIT` (Fläche zerfällt beim Normieren in n Teile; die Teilanzahl steht in der Meldung, jedes Teil wird gestickt — nichts wird verworfen). *(19.09.2026)*
- **`FILL_TOO_NARROW`**: eine Fläche kann groß sein und trotzdem überall zu schmal zum Füllen. `FILL_TINY` misst die Fläche und sieht das nicht — eine Sichel von 114 mm² kommt durch, obwohl 79 % ihrer Reihenstücke kürzer als 1 mm sind. Die Praxis sagt: ein Stich unter 1 mm perforiert den Stoff, statt ihn zu decken. Kriterium: Fläche ≥ 4 mm² (darunter greift `FILL_TINY`), mindestens 8 Reihenstücke, und **mehr als die Hälfte davon kürzer als 1 mm**. Gemeldet als `warn` mit dem Anteil und dem Vorschlag Satin oder Laufstich — die Fläche wird trotzdem gestickt, nichts wird still geändert (Regel 8). Die Zahlen fallen in `scanlines` ohnehin an. *(19.09.2026)*

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

#### 13.1.1 Fremde Dateien lesen *(20.09.2026)*

`readDst` bekommt die Option **`interpretJumpsAsTrim`**, Standard **`false`**.

Unser Writer signalisiert einen Trim als drei Sprünge `+2/+2`, `-4/-4`, `+2/+2`; genau das
sammelt der Reader wieder ein. Fremde Software signalisiert anders, meist als Lauf mehrerer
Sprünge — pyembroidery meldet in fünf geprüften Fremddateien 2 bis 11 Trims, wo unser
Reader Sprünge sieht.

Die Regel „ein Lauf von drei oder mehr Sprüngen ist ein Trim" darf **nicht** Standard
werden: `post()` teilt lange Sprünge selbst in mehrere Sprung-Datensätze (§11), und die
Regel würde die eigenen geteilten Sprünge als Trim lesen. Damit wäre der byte-identische
Roundtrip aus §15 hin. Der **Roundtrip-Test läuft deshalb unverändert mit dem Standard
`false`**; die Option ist für §17 gedacht, wo fremde Dateien nur angezeigt werden und ein
Trim als Kreuz statt als gestrichelte Linie gehört.

### 13.2 Weitere Formate
- Neutrales JSON (`StitchPlan`) → `apps/api` → pyembroidery → PES, JEF, VP3, EXP.
- PES: Farben auf Brother-Palette mappen (nächste Farbe), echte Garnnummern als Sidecar-JSON und im Stichbericht.
- Kreuzprüfung: TS-DST gegen pyembroidery-DST aus demselben JSON muss byte-identisch sein (Test in CI).

### 13.3 Stichbericht (PDF, später)
Vorschau, Größe, Stiche, Farbfolge mit Garnnummern, Trims, Laufzeit, Preset.

---

## 14. Presets

Startwerte, in Phase 5 gegen Probesticks justieren.

| Preset | Fill Reihe | Satin Abstand | Zug | Schub | Überlappung | Unterlage Fill | Unterlage Satin | Hinweis |
|---|---|---|---|---|---|---|---|---|
| Piqué | 0,40 | 0,38 | 0,20 | 0,10 | 0,20 | contour + single | contour + zigzag | Standard |
| Jersey | 0,45 | 0,40 | 0,25 | 0,15 | 0,25 | contour + single | contour + zigzag | dünne Shirtware, Schneidvlies |
| Softshell | 0,35 | 0,40 | 0,25 | 0,10 | 0,20 | contour + single | contour + zigzag | |
| Fleece | 0,35 | 0,40 | 0,30 | 0,15 | 0,25 | contour + double | contour + zigzag, Inset 0,3 | Topping empfohlen |
| Cap | 0,35 | 0,35 | 0,20 | 0,10 | 0,20 | contour + single | center + contour | Reihenfolge Mitte → außen, unten → oben (§10.1) |
| Frottee | 0,35 | 0,35 | 0,20 | 0,15 | 0,30 | contour + double | contour + zigzag | Knockdown-Fill unter Motiv, Topping |

**Jersey** *(19.09.2026)*: dünne, dehnbare Shirtware. Die Praxis nennt dafür 0,45 mm — die
lockerste Dichte der Skala, weil zu dichte Stiche den Stoff perforieren. Dehnbar heißt
zugleich mehr Zugausgleich und ein tragendes Schneidvlies.

**Cap-Satin 0,35 statt 0,38** *(19.09.2026)*: auf der Kappe steht das Gewebe unter
Spannung und der Rahmen dreht unter der Nadel; die dichtere Spalte deckt das ab.

**Cap-Zugausgleich 0,20 statt 0,15** *(20.09.2026)*: 0,15 lag unter dem Praxisminimum von
0,2 mm. Der **Schub beim Satin** (§7.2) bleibt offen — dort steht weiterhin nur der Zug.

**Schub und Überlappung** *(19.09.2026)*: neue Spalten zu §8.1.1 und §8.1.2. Der Schub
liegt bei rund der Hälfte des Zugs — er wirkt quer und fällt kleiner aus. Beides sind
**Startwerte ohne Probestick**; sie sind die ersten, die in Phase 5 zu messen sind.

**Reihenabstand: Industriewerte.** *(19.09.2026 — vorher 0,25 bis 0,28.)* Die Praxis
punchtet 40er-Garn mit **0,40 mm** als Standard, **0,35 mm** auf schwerer Ware (Kappen,
Jacken) und **0,45 mm** auf dünnen Shirts. Die alten Werte lagen 35 bis 60 % darüber und
spreizten untereinander nur 12 % — sie unterschieden die Stoffe praktisch nicht. Gemessen
an zwei echten Logos kostet der Wechsel auf 0,40 rund 21 % der Stiche und 5 bis 6 Minuten
Maschinenzeit je Stück (`docs/profi-abgleich.md`).

Zuordnung: Piqué ist die Standardware. Kappen und Softshell nennt die Praxis ausdrücklich
als schwer. **Fleece und Frottee sind unsere Zuordnung, nicht aus der Quelle**: beide sind
dick und flauschig, die Stiche versinken, deshalb dieselbe Dichte wie schwere Ware. Sie
gehören beim Probestick zuerst geprüft.

Für dünne Jersey-Ware (0,45) gibt es heute kein Preset. Offen in `docs/backlog.md`.

Maschinenprofile: `rpm`, `hoopWMm`, `hoopHMm`, `maxJumpMm`, `minStitchMm` (§11), `threadWeight`.

**`threadWeight`** *(19.09.2026)*: die Garnstärke, `40` (Standard) oder `60`. Sie ist keine
Eigenschaft des Motivs, sondern dessen, was auf der Maschine aufgespult ist, und ändert
zwei Dinge:

| | 40er | 60er |
|---|---|---|
| Dichtefaktor auf `fillRowSpacingMm` und `satinSpacingMm` | 1,0 | **0,8** |
| Faktor auf die Mindesthöhe einer Schrift | 1,0 | **0,7** |

60er Garn ist dünner, deckt also schmaler: die Reihen müssen enger stehen, sonst blitzt der
Stoff durch — daher 0,8 auf die Abstände (Piqué 0,40 → 0,32). Umgekehrt trägt es feinere
Formen, deshalb darf die Schrift kleiner werden: eine Schrift mit `minHeightMm` 5 kommt mit
60er auf **3,5 mm**, was die Praxis als Untergrenze für Kleingedrucktes nennt. Der Faktor
statt einer festen Zahl, damit eine Schrift mit gröberen Spalten ihre eigene Grenze behält.

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
