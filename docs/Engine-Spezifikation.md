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

**Die Knoten des Sichtbarkeitsgraphen liegen im Material** *(21.09.2026)*. Der Graph nimmt
die Reflexecken — dort und nur dort knickt ein kürzester Weg. Liegt ein Knoten **auf** der
Kontur, sieht er seinen Nachbarn nur entlang der Kontur, und eine Strecke genau auf der
Grenze ist weder innen noch außen: die Kante fällt weg. Bei einem **runden Loch** ist jede
Ecke reflex und jede sieht ihre Nachbarn nur so — der Graph zerfällt, `insideTravel` findet
keinen Weg und gibt die Gerade **quer durch das Loch** zurück. Gefunden am Atzensport-Logo,
21.09.2026. Die Knoten sitzen deshalb 0,12 mm in das Material versetzt (entlang der
Winkelhalbierenden, in drei Stufen bis 0,02 mm, sonst die Ecke selbst). Der Versatz muss
über der Vereinfachung des Graphen (0,1 mm) liegen, weil die Sehne zwischen zwei Nachbarn
sonst noch im Loch liegt.

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
- **Ausdehnung je Spalte:** die Rails einer Spalte dürfen höchstens das **Vierfache** der
  Ausdehnung dieser Spalte messen. Das Budget allein ist blind für eine gewundene Spalte
  zwischen gesunden, weil eine Form mit Löchern genug Kontur hat, sie zu verstecken.

Reißt eine der beiden Schranken, wird die Form ein Fill und meldet `AUTOSATIN_MIXED`.

**Wer wovon entscheidet** *(21.09.2026)*. Seit dem Umbau von `railsForBranch` (§7.7.1)
**entscheidet das Budget**; die Ausdehnung ist die **harte Obergrenze** als Rückfall. Grund
ist die Messung: am STUTTGART-Logo trennt das Budget sauber (gesunde Spalten 97–99 % der
Kontur, gewundene 155–188 %), während die Ausdehnung einen echt gekrümmten Buchstabenbogen
(2,2–2,9 × Ausdehnung) nicht von einer gewundenen Rail (2,5 ×) unterscheiden kann — mit dem
alten Faktor 2 verwarf sie 13 gesunde Buchstaben. Deshalb steht sie jetzt auf **4** und
fängt nur noch den Fall ab, in dem das Budget durchrutscht: Rails, die zufällig fast die
Konturlänge treffen und sich trotzdem wickeln. Sie bleibt stehen — sie kostet nichts.

Ist ein Ast der Form breiter als `maxWidthMm` (§7.4), wird die **ganze** Form ein Fill und
meldet `AUTOSATIN_MIXED` als `info` mit der Zahl der betroffenen Äste. Die Form je Ast in
Satin und Fill zu zerlegen steht nirgends und wäre geraten; ein Entwurf aus Spalten plus
nicht zugeordneter Restfläche ist außerdem nicht stickbar.

**Flächen unter 1 mm² werden verworfen** *(21.09.2026)*. Gemessen an der Zielgröße, also
nach der Skalierung. Eine Fläche von einem Quadratmillimeter ist auf Stoff nicht zu sehen,
kostet aber einen Trim und zwei Sprünge; beim Eislingen-Logo sind es über 2000 solcher
Reste aus der Vektorisierung. Verworfen wird **nicht still**: eine Sammelwarnung
`IMPORT_DROPPED_TINY` nennt die Anzahl und die größte verworfene Fläche (Regel 8). Ab
1 mm² bleibt alles erhalten, und `FILL_TINY` (§11) meldet weiterhin, was unter 4 mm² liegt.

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
- Beide Rails **je Seite** senkrecht nach außen versetzen. Optional asymmetrisch (`pullCompA`, `pullCompB`) für später.

**Der Ausgleich richtet sich nach der Breite der Spalte** *(21.09.2026 — vorher ein fester
Millimeterwert)*. Der Faden zieht die Spalte in der Breite zusammen, und zwar umso mehr, je
breiter sie ist; ein fester Wert ist deshalb für die schmale Spalte zu viel und für die
breite zu wenig. Gemessen an STUTTGART 80 mm: Spaltenbreiten von 0,23 bis 9,81 mm, Median
1,68 — alle bekamen dieselben 0,20 mm.

Neu:

| Größe | Bedeutung |
|---|---|
| `pullCompPct` | Prozent der **medianen Spaltenbreite**, **je Seite**. Standard 12; Jersey und Fleece 15. |
| `pullCompMinMm` | **Untergrenze**, je Seite. Standard 0,2. |
| `pullCompMaxMm` | Obergrenze dafür, je Seite. Standard 0,4. |
| `pullCompMm` | **Override** in Millimetern. Gesetzt, gilt er allein — so bringt eine Schrift mit, womit sie gezeichnet wurde (§9.2). |

**Die Untergrenze ist so wichtig wie der Deckel** *(21.09.2026)*. Der Faden zieht das Gewebe
um einen annähernd **konstanten** Betrag zusammen; der Anteil, der mit der Breite skaliert,
kommt obendrauf. Ein rein proportionaler Ausgleich ist deshalb physikalisch falsch, und
gemessen war er schädlich: die schmalsten Buchstabenspalten des STUTTGART-Logos sind 0,43
bis 0,46 mm breit, 12 % davon sind 0,06 mm statt der früheren 0,20. Die Spalte blieb damit
unter der Mindeststichlänge von 0,6 mm (§11), `postProcess` räumte jeden zweiten Stich weg,
und die Buchstaben standen hohl auf dem Bild — `z13-bebebe-020-0` fiel von 289 auf 156
Stiche. Mit dem Boden von 0,2 mm (dem früheren Festwert und dem Praxisminimum aus §14) sind
es wieder 300.

Die Fachpraxis führt beides ohnehin getrennt: ein fester Millimeterwert **plus** ein
prozentualer Anteil, additiv. Unsere Klammer aus Boden und Deckel bildet das an den Rändern
ab; die saubere Addition steht in `docs/neuplanung-punchprogramm.md` als Änderung an.

Die 12 % sind so gewählt, dass die mittlere Spalte bleibt, wo sie war: 12 % von 1,68 mm
sind 0,20 mm, der alte Festwert. **Jersey und Fleece bekommen 15 %** *(21.09.2026)* —
dehnbare und flauschige Ware zieht stärker zusammen. Schmale Spalten werden dadurch weniger fett (0,7 mm → 0,08
statt 0,20), breite mehr (ab 3,33 mm greift der Deckel von 0,4). Gemessen wird die **mediane**
Breite über elf Stichproben nach Bogenlängenanteil, nicht das Mittel: eine Spalte, die an
einem Ende ausläuft, soll nicht überall so breit behandelt werden.

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
2. Pro Ast: Rails aus der **Kontur schneiden**, siehe 7.7.1.
3. Breite entlang des Astes prüfen: Median > `maxWidthMm` → Fill statt Satin.
4. Ergebnis: mehrere `SatinObject`, verbunden in Reihenfolge entlang des Skeletts.
5. Der Editor zeigt das Ergebnis als Vorschlag, Nutzer korrigiert Rails/Sprossen.

#### 7.7.1 Rails aus der Kontur schneiden *(21.09.2026)*

Bis zum 21.09.2026 stand hier „Rails = jeweils nächster Konturabschnitt links und rechts",
umgesetzt als: für jeden Skelettpunkt den nächsten Konturpunkt auf jeder Seite suchen. Das
hält nur, solange der Ast gerade ist. Auf einer Kurve kippt die Seitenzuordnung, die Rail
springt von einer Seite auf die andere und wieder zurück — die Spalte stickt dieselbe
Stelle mehrfach. Gemessen an einem Buchstaben von 10 × 13 mm: Rails von 38 mm Länge und
**92 Stiche in einem Quadratmillimeter**.

Die Kontur **ist** die Rail; sie muss nur richtig zerteilt werden:

1. **Schnittpunkte bestimmen.** Für jedes Astende den nächsten Punkt auf der Kontur suchen.
   Hat das Skelett Verzweigungen, kommen die Konturpunkte hinzu, die den
   **Verzweigungspunkten** am nächsten liegen — sonst laufen zwei Äste über dieselbe
   Kontur.
2. **Kontur zerschneiden.** Die Schnittpunkte teilen den Ring in Ketten. Ein Ast mit zwei
   Enden bekommt genau die zwei Ketten zwischen seinen Schnittpunkten, eine links und eine
   rechts herum; welche welche ist, entscheidet die Seite des Astes (Kreuzprodukt am
   Mittelpunkt).
3. **Paaren nach Bogenlängenanteil.** Beide Ketten werden auf denselben Parameter t ∈ [0,1]
   gelegt, wie §7.1 es ohne Sprossen ohnehin vorschreibt. Damit läuft die Spalte die Form
   entlang, statt zwischen den Seiten zu springen.
4. **Löcher.** Eine Form mit Löchern hat mehrere Ringe. Geschnitten wird der Ring, auf dem
   die nächsten Punkte der Astenden liegen; ein Ast, dessen Enden auf verschiedenen Ringen
   landen, bekommt keine Spalte und meldet `SATIN_TOO_NARROW`.

Die beiden Schranken aus §5.1 (Rail-Budget gegen die Kontur, Ausdehnung je Spalte) bleiben
als Sicherung bestehen. Sie sollen nach diesem Umbau nicht mehr greifen — tun sie es doch,
ist das ein Befund.

*(21.09.2026)* Gemessen nach dem Umbau: STUTTGART 80 mm hat **kein** `AUTOSATIN_MIXED` mehr
(vorher 16), 74 Satinspalten statt 49. Das Budget greift nicht mehr. Die Ausdehnung schon —
aber gegen gesunde Buchstaben, nicht gegen gewundene Rails; sie steht deshalb auf 4 und ist
nur noch Rückfall (§5.1, „Wer wovon entscheidet"). Das ist eine bewusste Lockerung mit
Messwerten, keine stille.

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
- Greedy: nächste unbesuchte Sektion nach Distanz; Reiseweg mit `insideTravel` als Running (Stichlänge **2,0** — *26.09.2026; am 21.09. auf 3,0 gesetzt, jetzt zurück*) **innerhalb der Form**, damit er später überdeckt wird. Die 3,0 sollten weniger Nadeleinstiche in einen Steg setzen und haben das nicht getan: die Einstiche kamen von den Graphknoten (§8.7.2) und der Konturunterlage (§8.6). Das TEXMA-Archiv zeigt einen Laufstich von höchstens 2,0 mm; gemessen gegen 3,0 kostet der kürzere Reiseweg 3 % mehr Stiche und senkt die Dichtespitze von STUTTGART 80 mm von 31 auf 28. **Verbindungen zwischen Objekten benutzen dieselben 2,0** (§10.2) — die können sichtbar sein.
- Ende bei `endPoint`, falls gesetzt.

**Nächste heißt erreichbare** *(21.09.2026)*. Die Distanz ist die Luftlinie, und hinter
einer Engstelle liegt eine Sektion nah, die nur über einen Umweg zu erreichen ist. Von den
acht nächsten Einstiegen wird deshalb der erste genommen, zu dem die **direkte** Linie
innerhalb der Form liegt; gibt es keinen, bleibt es beim nächsten. Aus demselben Grund
werden mehrere Teilstücke — die der Einsatz der Unterlage erzeugt — nach Nähe abgearbeitet
und nicht in der Reihenfolge, in der das Verschneiden sie ausgibt. Gemessen an STUTTGART
80 mm: ohne diese Reihenfolge 33 Stiche aus **einer** Füllfläche in einem Quadratmillimeter,
Dichtespitze 44; mit ihr 33.

### 8.6 Unterlage
| Typ | Erzeugung |
|---|---|
| contour | Running auf `offset(shape, -insetMm)`, Standard-Inset 0,4 |
| single | Fill mit `spacingMm` 2,0, Winkel `angleDeg + 90`, Inset 0,4, Stichlänge 3,0 |
| double | zwei single-Lagen bei ±45° zum Deckwinkel |

Standard: contour + single. Ab 20 mm Kantenlänge: double.

**Keine Konturunterlage auf Splittern** *(26.09.2026)*. Die eingerückte Kontur wird vor dem
Sticken **geöffnet** (um 0,4 mm geschrumpft und wieder aufgeblasen, `keepWide`): was schmaler
als **0,8 mm** ist, fällt weg. Grund: ein Knockdown (§4.1) zerschneidet die Fläche in Stege,
und die eingerückte Kontur eines Stegs ist ein Band, dessen beide Kanten **dieselbe
Nadelspur** sind. Gemessen an STUTTGART 80 mm: die graue Schildfläche ergab **50 Ringe**,
54 ihrer 661 mm² in Bändern unter Nadelbreite, und die Konturunterlage allein setzte **15
Einstiche in eine 0,2-mm-Zelle** (§11) — mehr als das ganze Archiv. Eine Nadel ist 0,7 bis
0,8 mm dick; unter 0,8 mm Breite haben zwei Spuren keinen Platz. Der Deckstich hält so einen
Steg ohnehin; eine Unterlage darin perforiert ihn nur.

**Wirkung** *(sechs Läufe, 26.09.2026)*: Nadelhäufung von 13 auf 7 Einstiche je Zelle und von
14 auf 2 Zellen (STUTTGART 80 mm), Dichte 38 → 31, Stichzahl −11 %. Alle sechs Läufe liegen
damit im Feld des Archivs — **kein Motiv meldet mehr einen Fehler.**

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

### 8.7.1 Der Reiseweg bleibt in der Form, sonst wird er ein Sprung *(21.09.2026)*

`insideTravel` (§5) antwortet mit der **Geraden**, wenn es keinen Weg innerhalb findet. Der
Fill hat diese Gerade als Laufstich gestickt — quer über blanken Stoff. Gemessen: Atzensport
80 mm, Objekt `z03`, 20 mm am Stück; STUTTGART 250 mm 149 mm; Köln 90 mm 88 mm.

Drei Regeln:

1. **Ein Reisegebiet je Teilfläche.** Alle Phasen eines Fills reisen im selben Gebiet: der
   Form nach dem Knockdown (§4.1), nach Zugausgleich und Unterlappung (§8.1), zuzüglich
   0,05 mm Luft. Die Luft ist nötig, weil Phasen- und Reihenenden **auf** der Kontur liegen
   und ein Punkt auf der Grenze weder innen noch außen ist. Vorher reiste die Gitterunterlage
   in ihrem eigenen, eingerückten Stück — und der Weg von einem Stück zum nächsten lag
   außerhalb davon.
2. **Der Weg wird geprüft, nicht geglaubt.** Liegt er nicht in diesem Gebiet, wird **nicht**
   gestickt, sondern **gesprungen**, und das Objekt meldet `TRAVEL_OUTSIDE` (`warn`, §11)
   mit Anzahl und längster Strecke. Ein Sprung im Fill ist damit nicht mehr ausgeschlossen —
   er ist die ehrliche Antwort auf eine Form, die in getrennte Teile zerfallen ist.
3. **Ein Wächter am Ausgang.** Auch der Reihenwechsel (§8.7, Punkt 4) kann die Form
   verlassen, wenn sie eine Taille hat. Jedes Stichsegment eines Fills wird deshalb geprüft;
   was außen liegt, wird durch den Weg innen ersetzt, und wo es keinen gibt, durch einen
   Sprung.

**Der Weg folgt der Kontur, ohne sie abzuzeichnen.** Jeder Knick der Kontur als Stich wäre
eine Perforation; nur nach Länge abzutasten schneidet Ecken ab. Also: so weit greifen, wie
ein Stich reicht **und** die Sehne innen bleibt.

**Was bleibt** *(gemessen, 21.09.2026)*: `postProcess` entfernt Stiche unter 0,6 mm (§11)
und trifft dabei die Knicke enger Wege. Die Sehne schneidet dann die Ecke — an den sechs
Logos bleibt ein Überstand von **0,21 bis 0,37 mm**, unter dem Zugausgleich von 0,2 mm je
Seite. Das ist der Preis der Mindeststichlänge, kein Rückfall in das alte Verhalten.

### 8.7.2 Reisewege streuen ihre Einstiche *(26.09.2026)*

`insideTravel` führt über die Ecken eines Sichtbarkeitsgraphen, und jeder Weg durch dieselbe
Engstelle bekommt **dieselbe** Ecke. Eine Ecke ist ein Nadeleinstich. Gemessen an STUTTGART
80 mm: **18 Reisewege eines Fills setzten 18 Einstiche auf einen Punkt**, 0,00 mm auseinander
— derselbe Nadelstich, 18-mal (§11, Nadelhäufung). Zwei Regeln dagegen:

1. **Der Stichtakt läuft durch, statt an jedem Wegstück neu zu beginnen.** So macht es ein
   Laufstich, und es trennt die Wege voneinander: sie erreichen die Engstelle mit
   unterschiedlich viel gelaufener Strecke, teilen sie also unterschiedlich. Der Eckstich
   ist ein Zusatzstich, er setzt den Takt nicht zurück.
2. **Eine erzwungene Ecke tritt zur Seite**, auf der **äußeren** Winkelhalbierenden ihrer
   beiden Schenkel — das Hindernis liegt auf der Innenseite, deshalb biegt der Weg dort
   überhaupt. Wie weit: stetig aus der bis dahin gelaufenen Weglänge, zwischen **0,15 und
   1,2 mm**. Gemessen an der Weglänge, **nicht** am Takt: ein Versatz verändert den Takt, ein
   daraus abgeleiteter Versatz würde auf sich selbst zurückwirken, und die Wege sammeln sich
   dann an den Fixpunkten dieser Rückkopplung statt zu streuen. Passt der Versatz nicht in
   den Steg, wird er halbiert und zuletzt aufgegeben — dann bleibt die Ecke, wo der Graph sie
   hingelegt hat. Geprüft wird jeder Versatz: Punkt und beide Schenkel müssen im Reisegebiet
   liegen.

**Wirkung** *(sechs Läufe, 26.09.2026)*: schlimmste Zelle 22 → 13 Einstiche, Zellen ab 6
von 82 → 14 (STUTTGART 80 mm); 13/221 → 10/22 (250 mm); 13/36 → 8/13 (Köln); 10/37 → 6/3
(Atzensport 200 mm). Stichzahl +0,1 bis +0,9 %. **Was bleibt**: in engen Stegen fällt der
Versatz auf 0,15 mm zurück, und was dann noch häuft, sind nicht mehr identische Punkte,
sondern 13 verschiedene Punkte in einer Zelle. Weiter kommt man nur über die **Zahl der
Durchgänge** — die Sektionsreihenfolge (Bänder statt Greedy), nicht über den Versatz.

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

### 9.4 Schriftwahl nach Höhe *(21.09.2026)*

Im Repo liegen sechs Schriften (`packages/fonts/src/inkstitch/`). Die Voreinstellung nimmt
die, die zur Höhe passt: **bis 9 mm `caffeine_tiny`, darüber `caffeine_KOR`.**

`maxHeightMm` kommt neu aus `max_scale` der Schrift, wie `minHeightMm` aus `min_scale`.
`caffeine_tiny` reicht nach eigener Angabe bis 5,7 mm Versalhöhe (`max_scale` 0,55 ×
16,2 mm × 0,641), `caffeine_KOR` beginnt erst bei 8,3 mm.

**Die 9 mm sind Absicht, nicht die Fontgrenze** *(21.09.2026)*. `caffeine_tiny` darf über
ihr Maximum bis 9 mm skaliert werden. Eine Satinschrift hochzuskalieren ist unkritisch: die
Spalten werden **breiter**, nicht dünner — und breiter ist die Richtung, in der nichts
kaputtgeht. Gemeldet wird es trotzdem (Regel 8), aber als `info TEXT_ABOVE_FONT_MAX`, nicht
als Warnung und erst recht nicht als Fehler. Ab 9 mm übernimmt `caffeine_KOR`.

**Nach unten bleibt es eine Warnung.** Unter `min_scale` werden die Spalten zu schmal, dort
geht etwas kaputt: `TEXT_TOO_SMALL` bleibt `warn` (§11).

`excalibur_KOR` schließt die Lücke zwischen 5,7 und 9 mm rechnerisch (5,8–16,2 mm), wird
dafür aber **nicht** genommen: eine Rustikale passt stilistisch nicht zwischen zwei
Serifenlose. Gleichmäßige Schrift schlägt gleichmäßigen Zahlenbereich.

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

**Dieselbe Regel gilt für Sprünge innerhalb eines Blocks** *(21.09.2026)*. Seit §8.7.1
springt ein Fill, wenn er keinen Weg innerhalb der Form findet. Ein Sprung ohne Trim lässt
den Faden **oben auf dem Stoff** liegen — dieselbe Sache, die diese Tabelle zwischen zwei
Objekten verhindert. Also: bis `jumpTrimMm` bleibt er, darüber wird der Faden geschnitten,
es sei denn, ein späteres Objekt derselben Farbe stickt über die Linie.

Drei Feinheiten, alle gemessen:

1. **Gezählt wird ab dem letzten Stich, nicht je Sprung.** Ein Verbindungssprung und ein
   Sprung im folgenden Objekt stehen ohne Stich dazwischen — der Faden spannt über beide.
   An STUTTGART 250 mm macht das 10,3 mm aus.
2. **Die Prüfung läuft als letzte Stufe**, nach Verriegelung und Nachbearbeitung. Die
   Verriegelung (§10.3) verschiebt den Anfang eines Sprungs um bis zu 0,3 mm, und die
   Mindeststichlänge (§11) kann den Stich davor entfernen; erst am Ende ist die Strecke die,
   die die Maschine fährt. Die Stufe setzt ihre Verriegelung selbst: sichern, schneiden,
   nach dem Sprung wieder sichern.
3. **Der erste und der letzte Stich an einem Sprung sind Anker** und werden von §11 nicht
   als zu kurz entfernt — sonst verschmelzen zwei erlaubte Sprünge zu einem unerlaubten.

### 10.3 Verriegelung
- Nach jedem `trim`/`color` und am Anfang: drei Stiche 0,3 mm vor/zurück entlang der ersten Stichrichtung.
- Vor jedem `trim` und am Ende: dasselbe rückwärts.
- Keine Verriegelung bei Running-Verbindungen.

---

## 11. Post-Processing und Analyse

- **Mindeststichlänge 0,6 mm** *(19.09.2026 — vorher 0,3 mm)*. Kürzere Stiche entfernen. Die Praxis zieht die Grenze bei 1 mm: darunter perforiert die Nadel den Stoff, statt ihn zu decken, und auf der Unterseite entstehen Fadenknäuel. 1,0 mm als harte Grenze würde allerdings den Reihenwechsel im Tatami mit abräumen, der bei 0,40 mm Reihenabstand genau 0,40 mm lang ist und dazugehört. 0,6 mm trifft die Stiche, die niemand gewollt hat, und lässt die stehen, die aus dem Verfahren kommen.
- Der Wert ist **konfigurierbar** (`minStitchMm` im Maschinenprofil, §14) — eine Maschine mit anderem Greifer verträgt andere Grenzen.
- **Verriegelung ist ausgenommen.** Verriegelungsstiche sind per Definition kurz und tragen deshalb `tie: true` (§3), sonst würde genau die Verriegelung aus §10.3 hier verschwinden. *(19.09.2026)*
- **Die Anker an einem Sprung sind ausgenommen** *(21.09.2026)*. Der Stich vor einem Sprung legt fest, wo der Sprung beginnt, der Stich danach fängt den Faden. Wird einer von beiden als zu kurz entfernt, wächst der Sprung oder zwei Sprünge verschmelzen — und der Faden liegt über eine Strecke oben, die §10.2 geschnitten hätte.
- Stiche und Sprünge > 12,1 mm in Teilstücke splitten (DST-Limit 121 Einheiten).
- **Rundung: kaufmännisch-symmetrisch** (`roundHalfEven`, halbe Werte zur geraden Zahl), überall dort, wo Millimeter zu ganzen Formateinheiten werden. Grund: die Kreuzprüfung aus §13.2 läuft gegen Python, dessen `round()` genauso rundet. Bei Reihenabstand 0,25 mm liegt jede zweite Koordinate exakt auf der halben DST-Einheit — mit `Math.round` wäre die Datei nicht byte-identisch. *(19.09.2026)*
- Stats:
  - `runtimeSec = stitches / (rpm/60) + trims * 3 + colorChanges * 12`, `rpm` aus Maschinenprofil (Standard 800).
  - Dichte: Raster 1 × 1 mm, Stiche pro Zelle zählen. **Warnung**, sobald das Maximum über 12/mm² liegt. **Fehler** erst, wenn mehr als **2 % der belegten Zellen** über 18/mm² liegen **oder** eine einzelne Zelle über **40/mm²**. *(21.09.2026 — vorher 1 % und 30/mm²; davor, bis 20.09.2026, „Fehler ab 18/mm²" auf den Spitzenwert.)* Der Spitzenwert allein taugt nicht: beim STUTTGART-Logo lösten **9 von 4.047 Zellen** den Fehler aus, während 92 % der Zellen bei höchstens 8/mm² lagen. Eine einzelne heiße Stelle ist eine Warnung wert, keine Ablehnung — eine Zelle über 40 dagegen schon, und eine Fläche, die zu zwei Prozent überfüllt ist, erst recht. Die Grenzen sind am 21.09.2026 gelockert worden: mit dem Knockdown aus §4.1 legt jede Naht ihre 0,8 mm Unterlappung übereinander, und an einem Punkt, wo acht Flächen zusammenstoßen, summiert sich das auf Werte, die gewollt sind.
  - **Nadelhäufung: Raster 0,2 × 0,2 mm, Einstiche pro Zelle zählen** *(26.09.2026)*. **Warnung** ab einer Zelle mit **6** Einstichen, **Fehler** ab **12** in einer Zelle **oder** mehr als **20 Zellen** mit 6 und mehr. Die Dichte oben misst auf 1 mm und mittelt eine Häufung weg; die Nadel ist 0,7–0,8 mm dick, ein Fünftelmillimeter liegt also unter ihr. Wer sechsmal in dasselbe 0,2-mm-Feld sticht, sticht sechsmal in dasselbe Loch: der Stoff reißt, die Nadel bricht. Die Schwellen sind **am TEXMA-Archiv kalibriert** (192 Produktionsdateien, 2016–2025): eine gestickte Datei bringt höchstens **8** Einstiche in eine Zelle und hat **0 bis 8** Zellen ab 6. STUTTGART 80 mm hatte 22 in einer Zelle und 82 solcher Zellen. Die Kennzahl trennt damit **stickbar von nicht stickbar**, während die Dichte oben über das **Aussehen** entscheidet. Stats: `needleMax`, `needleCells`.
- Warnungen (Auswahl): `SATIN_TOO_NARROW`, `SATIN_TOO_WIDE`, `FILL_TINY` (Fläche < 4 mm²), `FILL_TOO_NARROW`, `EDGE_GAP_RISK`, `FILL_COVERED`, `AUTOSATIN_MIXED`, `IMPORT_DROPPED_TINY`, `TRAVEL_OUTSIDE` (§8.7.1), `TEXT_TOO_SMALL`, `TEXT_ABOVE_FONT_MAX` (`info`, §9.4), `DENSITY_HIGH`, `NEEDLE_CLUSTER` (§11, 26.09.2026), `MANY_COLOR_CHANGES` (> 8), `LONG_JUMP` (> 30 mm), `SELF_INTERSECTING_RAILS`, `OBJECT_OUTSIDE_HOOP`, `SHAPE_SPLIT` (Fläche zerfällt beim Normieren in n Teile; die Teilanzahl steht in der Meldung, jedes Teil wird gestickt — nichts wird verworfen). *(19.09.2026)*
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

| Preset | Fill Reihe | Fill Stich | Satin Abstand | Zug Fill | Zug Satin | Schub | Überlappung | Unterlage Fill | Unterlage Satin | Hinweis |
|---|---|---|---|---|---|---|---|---|---|---|
| Piqué | 0,40 | 4,0 | 0,38 | 0,20 | 12 % / 0,2–0,4 | 0,10 | 0,20 | contour + single | contour + zigzag | Standard |
| Jersey | 0,45 | 4,0 | 0,40 | 0,25 | **15 %** / 0,2–0,4 | 0,15 | 0,25 | contour + single | contour + zigzag | dünne Shirtware, Schneidvlies |
| Softshell | 0,42 | 4,0 | 0,40 | 0,25 | 12 % / 0,2–0,4 | 0,10 | 0,20 | contour + single | contour + zigzag | |
| Fleece | 0,40 | 4,0 | 0,40 | 0,30 | **15 %** / 0,2–0,4 | 0,15 | 0,25 | contour + double | contour + zigzag, Inset 0,3 | Topping empfohlen |
| Cap | 0,38 | 4,0 | 0,35 | 0,20 | 12 % / 0,2–0,4 | 0,10 | 0,20 | contour + single | center + contour | Reihenfolge Mitte → außen, unten → oben (§10.1) |
| Frottee | 0,38 | 4,0 | 0,35 | 0,20 | 12 % / 0,2–0,4 | 0,15 | 0,30 | contour + double | contour + zigzag | Knockdown-Fill unter Motiv, Topping |

**Referenz ZSK EPCwin** *(21.09.2026)*. Die Produktionswerte der EPCwin-Dokumentation sind
**0,4 bis 0,6 mm Reihenabstand** und **4 bis 5 mm Stichlänge**. Unsere Werte lagen darunter:
Reihenabstände bis 0,35 mm und durchweg 3,0 mm Stichlänge — dichter und kürzer, als eine
Produktionsdatei braucht, also mehr Nadeleinstiche für dieselbe Deckung. Korrigiert:
Reihenabstand 0,38 bis 0,45 je nach Ware, Stichlänge überall **4,0**. Der Satin bleibt
unverändert; dort entscheidet der Zickzack-Abstand, nicht die Stichlänge. Gemessen an sechs
Läufen kostet das 7 bis 12 % der Stiche (`docs/messung-echte-logos.md`).

**Jersey** *(19.09.2026)*: dünne, dehnbare Shirtware. Die Praxis nennt dafür 0,45 mm — die
lockerste Dichte der Skala, weil zu dichte Stiche den Stoff perforieren. Dehnbar heißt
zugleich mehr Zugausgleich und ein tragendes Schneidvlies.

**Cap-Satin 0,35 statt 0,38** *(19.09.2026)*: auf der Kappe steht das Gewebe unter
Spannung und der Rahmen dreht unter der Nadel; die dichtere Spalte deckt das ab.

**Cap-Zugausgleich 0,20 statt 0,15** *(20.09.2026)*: 0,15 lag unter dem Praxisminimum von
0,2 mm. Der Wert gilt seit dem 21.09.2026 nur noch für den **Fill**; der Satin rechnet in
Prozent seiner Breite (§7.2). Der **Schub beim Satin** bleibt offen — dort steht weiterhin
nur der Zug.

**Der Satin-Zugausgleich ist je Preset** *(21.09.2026)*: 12 %, bei **Jersey und Fleece
15 %**, immer zwischen 0,2 und 0,4 mm je Seite. Dehnbare und flauschige Ware zieht stärker
zusammen; die Breite der Spalte wiegt trotzdem schwerer als die Ware, deshalb der Prozentsatz
und nicht ein fester Aufschlag.

**Schub und Überlappung** *(19.09.2026)*: neue Spalten zu §8.1.1 und §8.1.2. Der Schub
liegt bei rund der Hälfte des Zugs — er wirkt quer und fällt kleiner aus. Beides sind
**Startwerte ohne Probestick**; sie sind die ersten, die in Phase 5 zu messen sind.

**Reihenabstand: Industriewerte.** *(19.09.2026 — vorher 0,25 bis 0,28; am 21.09.2026 auf die EPCwin-Werte oben nachgezogen.)* Die Praxis
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
