# TEXMA Stitch — Engine-Spezifikation

Stand: 19.09.2026 · Zielgruppe: Entwicklung (Claude Code) · Status: Entwurf für Phase 1

**Änderungen 19.09.2026** — beschlossen nach den ersten Umsetzungsfunden, Einzelheiten in
`backlog.md`:

- §3 `Stitch` bekommt `tie?: true`.
- §11 Rundung kaufmännisch-symmetrisch (`roundHalfEven`).
- §13.1 Header nach `0x1A` mit `0x20` auffüllen; Export zentriert auf die
  Bounding-Box-Mitte; Weg vom Nullpunkt zum ersten Stich als Sprungfolge.
- §11 Warnung `SHAPE_SPLIT` mit Teilanzahl, wenn eine Fläche beim Normieren zerfällt.

**Änderung 28.09.2026** — Ink/Stitch erzeugt die Stiche (`docs/adr/0001-inkstitch-als-stich-engine.md`):

- §1 neu gefasst: TEXMA Stitch bereitet die Vorlage vor und prüft das Ergebnis; die eigene
  Stichgenerierung ist eingefroren.
- §2 `inkstitch/` ergänzt.
- §16 Phase 1b ergänzt, die Abnahme Phase 1 entfällt.

**Änderung 29.09.2026** — §7.8 neu: Satin für die Ink/Stitch-Vorlage (Einteilung nach Breite mit
Satin ab 0,7 mm, Strichplan, Säulen, Glätten rauer Konturen, Prüfgrenzen). §7.4 verweist darauf. §5.2 neu:
Feinheit und Mindestgröße (Satinstrich mindestens 1,3 mm, Lücke mindestens 0,8 mm als Schätzwert).
§4.2 neu: Aussparen in der Ink/Stitch-Vorlage (am selben Tag gemessen und zurückgenommen, siehe dort). §7.8.5: schmale Rückfälle werden Laufstich. §8.8 neu:
Tatami in der Ink/Stitch-Vorlage (Preset-Werte, Unterlage nur wo sie hält, Zug und Schub im
Umriss).
§5.2 zweite Fassung: Mindestgröße aus den Satinstrichen, Lücken als zweite Zahl, Rauschfilter.
§5.2 und §7.8.3 *(29.09.2026, Profi-Vergleich Hofbräu)*: Stofflücken zwischen Farben werden
geprüft; der Zugausgleich lässt Stoffspalte unter 1,0 mm offen, Säulen unter 1,0 mm an einem
solchen Spalt ohne Ausgleich (am selben Tag eingeschränkt: zuerst galt das für alle Säulen unter
1,0 mm).

**Änderung 30.09.2026** — §5.2: Mindestgröße als **Tor** (unter der Mindestgröße wird in der
Mindestgröße erzeugt, nicht erzwungen), gesucht über die Größe statt hochgerechnet, Schattenlinien
ab 0,7 mm. §13.4 neu: Nacharbeit-Datei für Inkscape mit Ink/Stitch (Ebene je Farbe,
Prüfstellen). §16: Phase 1b Schritte 4 bis 6. Ink/Stitch in der offiziellen Version 3.3.0 (ADR 0001).

**Änderung 01.10.2026** — §5.2 Tor: Welche Striche zählen, legt die bestellte Größe fest (die
Einteilung in jeder geprüften Größe trieb die Mindestgröße bis 1.266 mm); tragende Satinstriche
ab 1,0 statt 1,3 mm, dazwischen Prüfstellen; passt die Größe nicht in den Rahmen, wird erzeugt
und gewarnt. §13.4: Prüfstellen-Ebene mit `inkstitch:ignore_object`, Dokumentversion 4,
Schwelle „dieselbe Nadel".

**Änderung 02.10.2026** — §11: Die Ink/Stitch-Vorlage setzt die Mindeststichlänge auf 0,4 mm
(Ink/Stitch-Standard 0,1 mm). Unsere DSTs hatten sechs- bis zehnmal so viele Stiche unter 0,4 mm
wie die Profi-Dateien.

---

## 1. Zweck und Grundsätze *(28.09.2026 neu gefasst — vorher: die Engine erzeugt die Stiche selbst)*

**Ink/Stitch erzeugt die Stiche** — als eigener Prozess in fester Version (ADR 0001). TEXMA Stitch **bereitet die Vorlage vor** (Formen nach Breite einteilen, Sprossen für Satin setzen, verdeckte Flächen ausschneiden, Farbfolge und Fadenschnitte festlegen, Preset-Werte als `inkstitch:`-Attribute) und **prüft das Ergebnis** (DST-Leser, Kennzahlen gegen das Archiv, Player, Deckung der Satinsäulen). Stiche werden nie gespeichert, nur Objekte.

Die eigene Stichgenerierung (Kap. 6–8, 10) ist **eingefroren**: Code und Tests bleiben grün, weiterentwickelt wird sie nicht. Was diese Spec dort beschreibt, bleibt Referenz für Vorbereitung und Prüfung, ist aber kein Bauauftrag mehr.

Grundsätze:

- Reines TypeScript, keine DOM-Abhängigkeit. Läuft im Web Worker (Editor) und in Node (Tests, Server-Export). Ink/Stitch läuft daneben als Python-Prozess.
- Interne Einheit: **Millimeter**, Fließkomma. Erst der Export rundet auf 0,1 mm (DST-Einheit).
- Koordinatensystem wie SVG: Ursprung oben links, y nach unten.
- Deterministisch: gleiche Eingabe → byte-identische Ausgabe. Kein Zufall. Für Ink/Stitch heißt das: gleiche Vorlage und gleicher Commit → gleiche DST.
- Ink/Stitch (GPL-3.0, interne Nutzung) wird aufgerufen, nicht ins Repo kopiert. Eigener Code, der Ink/Stitch eng nachbildet, trägt „Abgeleitet aus Ink/Stitch (GPL-3.0)".
- Qualitätsreferenz: die Profi-Dateien aus Stickvoll und die Kennzahlen des TEXMA-Archivs (192 Produktionsdateien); die Phase-0-Dateien, sobald sie vorliegen.

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
  inkstitch/     Starter, wx-Platzhalter und Einrichtung für Ink/Stitch (28.09.2026);
                 Ink/Stitch selbst liegt als Klon außerhalb des Repos
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

### 4.2 Aussparen in der Ink/Stitch-Vorlage — gemessen und verworfen *(29.09.2026)*

Die Vorlage für Ink/Stitch (§7.8, §8.8) spart **nach §4.1** aus. Zwei Abweichungen waren am
29.09.2026 beschlossen, wurden an den sechs Kundenlogos gemessen und am selben Tag vom Nutzer
**zurückgenommen** — beide machten es schlechter:

1. **Satin spart die Fläche darunter aus** (0,2 mm Unterlappung). STUTTGART 80 mm: Dichtespitze
   22 → 27, Zellen über 18 Stichen/mm² 5 → 14, Stiche +13 %; von den dichten Zellen unter Satin
   verschwand bei STUTTGART 250 mm 1 von 13. Ursache: Ink/Stitch zerlegt die Fläche an jeder
   Satinkante in Stücke, jedes mit eigener Verriegelung, eigenem Sprung und Fadenschnitt
   (Tatami-Objekte STUTTGART 80 mm: 8 → 18). Satin schneidet also weiterhin nicht (§4.1 Regel 1).
2. **Angrenzende Flächen greifen 0,3 mm statt 0,8 mm untereinander.** Köln 90 mm nach Weite
   (Dichtespitze / Zellen über 18 / Nadelhäufung): 0 mm 26 / 15 / 6 — 0,3 mm 32 / 33 / 10 —
   0,8 mm 29 / 30 / 8. 0,3 mm war die schlechteste gemessene Weite. Es bleibt bei 0,8 mm, bis
   ein Probestick zeigt, ob weniger ohne Blitzer an der Naht geht.

Beide Wege sind im Code als abschaltbare Optionen geblieben (`cutOutSatin`, `touchUnderlapMm`),
im Standard aus bzw. 0,8 mm.

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

### 5.2 Feinheit und Mindestgröße *(29.09.2026)*

Ein Logo, das als Druck funktioniert, ist gestickt nicht in jeder Größe sauber: zu schmale
Satinstriche sinken in den Stoff, zu schmale Lücken sticken zu. Diese Prüfung läuft **vor**
dem Sticken auf der Vorlage in der bestellten Größe (Größe der SVG in mm oder die bestellte
Breite). Sie ändert nichts an den Formen (Regel 8); was sie entscheidet, ist die Größe: unter der
Mindestgröße wird nicht gestickt (**Tor**, unten). *(30.09.2026 — vorher meldete sie nur, und der
Nutzer entschied: größer sticken, vereinfachen oder so lassen.)*

**Grenzen** (Entscheidung 29.09.2026, Schattenlinien 30.09.2026, tragende Striche 01.10.2026):

| Prüfung | Grenze | Herkunft |
|---|---|---|
| Satinstrich, tragend (Formen, die §7.8.1 in der bestellten Größe als Satin einteilt), mittlere Breite | mindestens **1,0 mm** *(01.10.2026, vorher 1,3 mm)* | Übliche Untergrenze für Satin. Die 1,3 mm aus dem TEXMA-Archiv (p5 der mittleren Satinbreite je Datei in 192 Produktionsdateien, Minimum 1,05, Median 1,98) beschreiben die typische Säule einer Datei, nicht die schmalste, die hält. Am Tor gemessen: mit 1,3 mm STUTTGART 80 → 118 mm, Köln 90 → 169 mm; mit 1,0 mm 91 und 134 mm. Tragende Satinstriche zwischen 1,0 und 1,3 mm werden Prüfstellen (§13.4; Schattenlinien nicht, ihre Grenze ist 0,7 mm); der Probestick bestätigt oder korrigiert |
| Schattenlinie: Satinstrich, von dem mindestens eine Rail an einem Stoffspalt unter 1,0 mm liegt (Messung wie §7.8.3 Regel 1) | mindestens **0,7 mm** — als Satin hält er also immer | Profi-Mütze „Stuttgarter Hofbräu": goldene Schattenlinien von 0,75 mm in 110 mm sauber gestickt |
| Lücke innerhalb einer Farbe — Punze, Kerbe, Abstand zwischen Buchstaben | mindestens **0,8 mm** | **Schätzwert**: 2 × Zugausgleich (§7.2, 0,2 mm je Seite) plus eine Fadenstärke. Wird an Profi-Dateien und am Probestick nachgemessen |

Die Schattenlinie hängt nicht an der Breite der Säule (anders als §7.8.3 Regel 2, die nur Säulen
unter 1,0 mm meint): sonst hätte sie wieder einen Größenbereich, in dem sie zu schmal ist — eine
Schattenlinie von 1,1 mm wäre durchgefallen, eine von 0,9 mm nicht.

**Lücken** werden je Farbe gesucht: die Formen einer Farbe werden vereinigt und um die halbe
Grenze geschlossen (nach außen und zurück, wie §7.8.4); was dabei dazukommt, ist eine Lücke
schmaler als die Grenze. Ausgenommen sind Lücken, die eine später gestickte Form ganz
überdeckt — dort liegt ein anderes Element, keine Lücke.

**Stofflücken zwischen Farben** *(29.09.2026)* werden genauso gesucht, aber über **alle** Formen
zusammen: was beim Schließen der Vereinigung aller Formen dazukommt, ist Stoff, der zwischen
zwei Elementen sichtbar bleiben soll — etwa der Spalt zwischen Buchstabe und Schatten (Hofbräu,
110 mm: 0,53 mm). Sie erscheinen als eigene Art „Stofflücke" in Liste und Bild und zählen zur
zweiten Zahl; dieselben Rauschfilter gelten. Eine Stelle, die schon als Lücke einer Farbe
gemeldet ist, wird nicht doppelt gemeldet.

**Rauschfilter für Lücken** *(29.09.2026, zweite Fassung)*. Vektorisierte Logos haben
Haarschlitze zwischen gleichfarbigen Formen, Eckrundungen und hauchdünne Späne; sie sind
keine Lücken auf dem Stoff. Die erste Fassung (Stücke unter 0,02 mm² verwerfen) ließ sie durch:
jede konkave Ecke gibt beim Schließen (1 − π/4) · 0,4² = 0,034 mm² dazu, und ein Haarschlitz
von 0,013 mm Breite im Köln-Logo ergab als „Mindestgröße" 5.538 mm. Deshalb:

1. Späne unter 0,01 mm werden vor dem Messen abgetragen (Öffnen um 0,005 mm).
2. Gemessen wird mit **0,1 mm** Abtastung (`medianShapeWidthMm` mit `sampleMm`; die
   Standard-Abtastung bis 2 mm las eine 0,2-mm-Lücke als 0,32 mm).
3. Stücke unter **0,1 mm** Breite zählen nicht — das ist die DST-Auflösung, feiner gibt es auf
   dem Stoff nichts.
4. Stücke ohne Mittelachse zählen nicht (Eckrundungen); nur ein vom Schließen ganz gefülltes
   **Loch** wird mit seinem einbeschriebenen Kreis gemessen und zählt, wenn der mindestens
   0,1 mm hat. Ob ein Stück eine Achse hat, entscheidet die **Standard-Abtastung**; die
   0,1-mm-Abtastung liest nur seine Breite. Bei 0,1 mm Abtastung bekäme jede Eckrundung eine
   Achse und läse 0,12 mm (gemessen: STUTTGART 80 mm 134 statt 49 Lücken). Preis: ein Streifen
   von 0,1 bis 0,15 mm hat bei Standard-Abtastung keine Achse und fällt heraus.

**Ergebnis** je zu feinem Element: Art (Satinstrich oder Lücke), gemessene Breite, Grenze, und
die **Logobreite, ab der es hält** (bestellte Breite × Grenze ÷ gemessene Breite).

- Die **Mindestgröße** des Logos kommt aus den **Satinstrichen** allein: ab dieser Breite hält
  jeder Satinstrich seine Grenze (1,0 mm, Schattenlinien 0,7 mm). Das Element, das sie bestimmt,
  wird genannt. *(29.09.2026, zweite Fassung — vorher das größte Maß aller Befunde, Lücken
  eingeschlossen. Wie sie gesucht wird: Tor, unten.)*
- Die Lücken ergeben eine **zweite Zahl**: ab welcher Breite alle Lücken offen bleiben. Feine
  Zierkanäle (STUTTGART: 0,25 mm zwischen Rand und Körper der Buchstaben) treiben sie weit
  über die Mindestgröße; ob sie zusticken dürfen, entscheidet der Nutzer.
- Die Ausgabe listet die Elemente nach „hält ab" und markiert sie im Vorschaubild. Eine
  Satinform zwischen 0,7 und 1,0 mm kann auch eine dünne Zierlinie sein, die als Laufstich
  besser aufgehoben wäre; die Prüfung nennt es als Möglichkeit.

**Tor** *(30.09.2026, Entscheidung des Nutzers: „Nicht stickbare Größen dürfen nicht erzwungen
werden, sondern Mindestgröße angeben und daraus das Stickprogramm erstellen.")*

- Liegt die bestellte Größe unter der Mindestgröße, entsteht das Stickprogramm **in der
  Mindestgröße**, auf ganze Millimeter aufgerundet und proportional vergrößert. Die Ausgabe sagt es an erster Stelle — bestellte
  Größe, Mindestgröße, erzeugte Größe, das bestimmende Element — und die Dateien tragen die
  erzeugte Breite im Namen. Das ist keine stille Reparatur (Regel 8): die Größe ändert sich
  sichtbar, die Formen nicht.
- **Die bestellte Größe legt fest, welche Striche zählen** *(01.10.2026, Entscheidung des Nutzers
  — die Fassung vom 30.09. teilte in jeder geprüften Größe neu ein)*. Ob eine Form Satin ist
  (§7.8.1) und ob sie eine Schattenlinie ist, wird in der bestellten Größe R bestimmt. Gesucht
  wird über die Größe: aus Breite und Grenze die nächste ganze Größe, dort nachgemessen, weiter, bis
  jeder dieser Satinstriche seine Grenze hält; von der gefundenen Größe aus wird in ganzen
  Millimetern nach unten geprüft. Die **Mindestgröße** ist der Anfang der Reihe haltender Größen,
  die bis zur gefundenen reicht — nicht die erste haltende von unten, denn kleine Formen messen
  nicht genau proportional (Atzensport 80 mm hält bei 106 mm, bei 107 mm nicht, ab 108 mm wieder;
  Köln 90 mm: Proportion 144 mm, gefunden 134 mm). Formen, die erst beim Vergrößern Satin werden und dort unter
  ihrer Grenze liegen, treiben die Größe nicht — sie werden Prüfstellen (§13.4). Grund, gemessen
  am 30.09.2026: Mit der Einteilung in jeder geprüften Größe wird jede Haarlinie beim Vergrößern
  irgendwann schmaler Satin, die Bereiche reihen sich, und die Mindestgröße lief davon
  (STUTTGART 80 mm → 252 mm, Köln 90 mm → 567 mm, Eislingen 200 mm → 1.266 mm), getrieben von
  Zierteilen wie einem blauen Zwickel von 0,8 × 2,7 mm. Mit der Einteilung von R wird ein
  gezählter Strich beim Vergrößern breiter; bis auf die Messung kleiner Formen ist die Suche damit
  monoton, und einen Bereich darüber, in dem das Logo wieder durchfällt, gibt es nicht mehr
  (gemessen, nicht bewiesen: an allen sechs vergrößerten Kundenlogos hielt jede Größe bis 40 mm
  über der gefundenen).
- **Rahmen** *(01.10.2026, Entscheidung des Nutzers)*. Passt das Motiv in der erzeugten Größe
  nicht in den Rahmen des Presets, auch um 90° gedreht nicht, wird trotzdem erzeugt, und die
  Ausgabe warnt deutlich: der Rahmen ist eine Frage der Maschine (größerer Rahmen, Teilung), das
  Motiv selbst ist in dieser Größe stickbar.
- **Nur nach oben.** Unter der bestellten Größe wird nicht gesucht. Offen bleibt der umgekehrte
  Fall: in sehr kleiner Größe fallen alle Striche unter 0,7 mm, werden Laufstich und bestehen die
  Prüfung, obwohl Schrift so nicht lesbar ist. Die Nacharbeit-Datei (§13.4) markiert jede Fläche,
  die dadurch zur Linie wird; eine Regel dafür braucht die Profi-Vergleiche (§16, Phase 1b
  Schritt 6).
- **Vergleichsmessungen** (die sechs Kundenlogos in ihren bisherigen Größen) schalten das Tor mit
  `--ohne-tor` ab. Eine so erzeugte Datei unter der Mindestgröße trägt `_unter-mindestgroesse` im
  Namen, und die Ausgabe warnt. Stickprogramme für Aufträge entstehen nie mit diesem Schalter.
- Die Lücken (zweite Zahl) gehen nicht ins Tor; sie stehen in Liste, Bild und Nacharbeit-Datei.

### 5.3 Textur erkennen und bereinigen *(02.10.2026, Entscheidung des Nutzers: „Texturen in Vektor-Vorlagen erkennen und bereinigen, bevor Formen eingeteilt und vermessen werden.“)*

Abriebschrift und Kreidebuchstaben bestehen in der Vorlage aus einem Körper je Buchstabe, Tausenden
Körnern als Löchern und Splittern daneben. Auf dem Stoff ist davon nichts zu sehen — der Faden ist
0,4 mm breit —, aber jede Stufe danach liest es als Form: die Breitenmessung (§5.1, §7.8.1), das
Tor (§5.2) und die Vorlage (§7.8, §8.8).

**Anlass** *(Profi-Vergleich Christliche Gemeindereitschule, Preset Jersey, 90,2 mm, Stand afe6f5f)*.
Die Schrift besteht aus 48 Buchstabenpfaden mit 600 Teilformen (48 Körper, rund 550 Splitter) und
6.703 Löchern. Gemessen: die mittlere Breite der Buchstaben liest 0,95 mm (der schmalste 0,61 mm),
nach der Bereinigung unten 1,28 mm (der schmalste 1,09 mm; der Puncher 1,50 mm je Säule); das Tor
verlangt 138 mm, wo der Puncher in 90 mm sauber stickt; rund 2.200 Teile werden Tatami-Objekte mit
eigenem Verriegelungsstich, Sprung und Fadenschnitt; vier Buchstaben fallen auf Laufstich zurück
(„rail leaves the letter“). Eislingen 200 mm („SEGEN SEIN“, Kreide): 1.179 Löcher, 64 Splitter, das
Tor sucht 286 mm.

**Wo sie sitzt.** In `importShapes` (§5.1), unmittelbar nach dem Lesen der Pfade — also **vor** der
Einteilung nach Breite, **vor** dem Tor und **vor** der Vorlage. Das Tor und der Lauf lesen die SVG
je Größe neu über `importShapes` (`tools/tor.mjs`, `tools/inkstitch.mjs`) und sehen deshalb in jeder
Größe dieselben Formen. Abschaltbar über `importShapes(text, { texture: false })`, nur für
Vergleichsmessungen.

**Die Regeln.** Vier Schritte, in dieser Reihenfolge; jede Schwelle steht für eine Grenze, die der
Faden setzt, und ist an den acht Referenzlogos gemessen (Tabelle unten):

| Größe | Wert | Maß | Herkunft |
|---|---|---|---|
| Beleg (`TEXTURE_EVIDENCE_*`) | mindestens **3 Löcher** von 0,001 bis unter 0,05 mm² in **einer** Form | Texturkörner sind Löcher dieser Größe, viele und in einer Form; ein gezeichnetes Loch ist so klein nur selten | die sechs Logos ohne Textur: höchstens 1 je Form; Christliche: 0 oder mindestens 6, 57 Formen; Eislingen: 43 Formen |
| Löcher (`TEXTURE_HOLE_MAX_MM2`) | unter **0,5 mm²** | ein Loch unter einem Kreis von 0,8 mm bleibt nicht offen (§5.2: Lücke mindestens 0,8 mm) | Christliche: größtes Korn 0,48 mm², kleinstes echtes Loch 1,30 mm² |
| Staub (`SPECK_MAX_MM2`) | Teile unter **0,05 mm²** | ein Teil, das in einen Kreis von 0,25 mm passt, ist schmaler als ein Faden: es liegt unter jedem Stich | Christliche: 542 weiße Teile unter 0,05 mm², **keines** von 0,05 bis 0,2 mm²; danach die echten (i-Punkte 1,85 mm²) |
| Splitter (`SPLINTER_MAX_MM2`, `SPLINTER_REACH_MM`) | Teile bis **4 mm²** (`FILL_TINY`, §11) im Abstand bis **0,4 mm** | einen Spalt unter 0,4 mm schließt der Zugausgleich beider Seiten (2 × 0,2 mm, §7.2) | Eislingen: 61 von 64 Teilen unter 3 mm² liegen im Abstand bis 0,4 mm, das nächste bei 0,46 mm, dann 0,77 mm; der i-Punkt der Christliche 0,66 mm |

1. **Beleg.** Eine Form hat Textur, wenn sie mindestens 3 Löcher von 0,001 bis unter 0,05 mm² trägt.
   Löcher unter 0,001 mm² zählen nicht: das sind Rundungsreste der Pfadumrechnung (Dreiecke von
   5·10⁻⁷ bis 1,4·10⁻⁵ mm²; Köln 86, STUTTGART 20 bis 22, die Form „z25“ im Köln-Logo allein 51).
2. **Löcher.** In einer Form mit Beleg werden **alle** Löcher unter `TEXTURE_HOLE_MAX_MM2` gefüllt —
   die Körner und die größeren Löcher der Kreide —, in keiner anderen Form eins. Größere Löcher
   bleiben (Gegenräume, Augen, Kronen).
3. **Staub.** Ein Teil unter `SPECK_MAX_MM2` — gemessen nach dem Füllen der Löcher — wird nicht
   übernommen, in jeder Form und auf jeder Farbe.
4. **Splitter.** In eine Form mit Beleg geht ein Teil auf, wenn alles zutrifft: gleiche Farbe;
   kleiner als die Form; höchstens `SPLINTER_MAX_MM2`; **auf freiem Grund** (keine Fläche einer
   anderen Farbe schneidet es); im Abstand von höchstens `SPLINTER_REACH_MM` zur Form oder zu einem
   Splitter, der schon aufgegangen ist. Liegt es im Abstand zu mehreren Formen, geht es in die
   nächste. Geschlossen wird **nur der Spalt**: die Form und ihre Splitter werden um die halbe
   Reichweite aufgeweitet, vereinigt und um dasselbe zurückgenommen (wie §7.8.4); von dem, was dabei
   dazukommt, wird nur übernommen, was Form und Splitter zugleich berührt. Die Kerben der Form
   selbst bleiben. Der Splitter verliert nichts, seine Fläche geht in die Form; schließt er dabei
   nicht an, bleibt er eine eigene Form.

Die Formen behalten Kennung und Reihenfolge; die Form, in die Splitter aufgehen, behält ihre Kennung.

**Was nicht bereinigt wird** — gemessen und verworfen:

| Fall | Warum nicht | Gemessen |
|---|---|---|
| **Kontur schließen** (Kerben und Schlitze um 0,2 mm, wie es der Versuch im Profi-Vergleich tat) | Echte Schlitze und Texturkerben trennt kein Flächenmaß: die Verteilung der Stücke je Größenklasse fällt stetig (4.100 · 421 · 41 · 18 · 6 · 1 für unter 0,01 · 0,05 · 0,1 · 0,2 · 0,5 · 1 mm²), und 25 Stücke ab 0,1 mm² sind Zeichen der Schrift: der V-Schlitz des „y“ (0,79 mm², Breite des Buchstabens 1,38 → 2,16 mm), die Kerben zwischen den Serifen der „w“ (0,49 × 1,62 mm, 0,26 mm²). Das Tor ändert sich durch das Schließen nicht (126 mm mit und ohne) | Christliche, 57 Texturformen, Schließen um 0,2 mm: 4.587 Stücke |
| **Löcher in Formen ohne Beleg** | die Kronen im roten Band des Kölner Wappens (26 Löcher von 0,062 bis 0,7 mm², Schlitze von 1,9 × 0,04 mm), die Gegenräume der STUTTGART-Buchstaben (0,26 bis 0,42 mm², 0,5 mm breit) und die Wappentropfen sind gezeichnet; kein Maß für ein Loch trennt sie von Körnern, der Beleg tut es | Köln, STUTTGART: höchstens 1 Loch von 0,001 bis 0,05 mm² je Form |
| **Kleinstlöcher überall füllen** (unter 0,01 mm², auch in Formen ohne Beleg — der erste Entwurf) | es bringt nichts und verändert die Messung: die Rundungsreste ändern die Abtastung der Mittelachse — in Köln werden drei weitere Formen Tatami („columns cover 36 %“), in STUTTGART 80 mm wächst die Mindestgröße von 91 auf 93 mm | Köln 88, STUTTGART 80 mm 20 Löcher |
| **Teile ab 0,05 mm²** | die Kontur des Pferdes besteht aus 181 Fragmenten von 0,05 bis 3 mm², die einander überlappen; das Auge aus fünf Stücken von 0,12 bis 0,16 mm². Das ist Zeichnung | Christliche |
| **Spalte zwischen Formen** | nur ein Splitter bis 4 mm² geht in eine Texturform. Die Bereinigung schließt nie einen Spalt zwischen zwei Formen über 4 mm² und nie einen zwischen Farben; die gewollten Kanäle bleiben (Hofbräu 0,40 und 0,53 mm, STUTTGART 0,25 mm, §5.2, §7.8.3). Köln hat 6 Teile im Abstand bis 0,4 mm auf freiem Grund; ohne Beleg an der Form bleiben sie | die sechs Logos ohne Textur bleiben **Form für Form unverändert** |
| **i-Punkte und Punkte** | sie liegen ab 0,66 mm von ihrer Form und werden eigene Tatami-Blöcke, wie sie der Puncher stickt; ihre Körner füllt Schritt 2 | Christliche: 5 i-Punkte (1,85 mm²), 4 Punkte (nach dem Füllen 3,3 mm²) |

**Die bestellte Größe legt die Schwellen fest.** Alle Flächen und Längen oben gelten in der bestellten
Größe R. Liest `importShapes` die Vorlage in einer anderen Größe w (das Tor in jedem Schritt seiner
Suche, der Lauf in der erzeugten Größe), gelten sie mit dem Verhältnis λ = w ÷ R: Flächen mit λ²,
Längen mit λ (`importShapes(text, { orderedWidthMm: R })`; ohne die Angabe ist R die Größe der
Datei). So entscheidet jede Größe wie R, und das Tor und der Lauf sehen dieselben Formen, nur
größer. Mit Schwellen fest in mm läge ein Korn, das in R unter 0,05 mm² liegt, bei 1,3 R darüber;
die Löcher kämen zurück, die Breite der Buchstaben bräche ein, und die Suche des Tors (§5.2: ein
gezählter Strich wird mit der Größe breiter) liefe davon: Eislingen 200 mm → **333 mm** statt
**274 mm** mit λ (ohne Bereinigung 286 mm).

**Ergebnis** (`ImportShapesResult.texture`; Warnung `IMPORT_TEXTURE_CLEANED` als `warn`, Regel 8):
die Zahl der Formen mit Textur, der gefüllten Löcher mit ihrer Fläche, der verworfenen Teile mit
Fläche und dem größten Teil, der aufgegangenen Splitter mit Fläche — mit den Kennungen. `pnpm
inkstitch` und `pnpm mindestgroesse` nennen sie unter „Textur“. Wo nichts zu bereinigen ist, gibt es
keine Warnung. Die Bereinigung ist deterministisch und idempotent: ein zweiter Lauf findet an den
Ergebnisformen keinen Beleg mehr.

**Messung** *(02.10.2026, die acht Referenzlogos in ihrer Größe, Katalog und Skripte unter
`$S/textur`)*: Löcher je Größenklasse, Beleg je Form, Teile:

| Logo | Formen | Löcher | unter 0,001 | 0,001 bis 0,05 | 0,05 bis 0,5 | ab 0,5 | Beleg, größter je Form | Formen mit Beleg | Teile unter 0,05 mm² |
|---|---|---|---|---|---|---|---|---|---|
| STUTTGART 80 mm | 46 | 48 | 20 | 0 | 4 | 24 | 0 | 0 | 0 |
| STUTTGART 250 mm | 47 | 51 | 22 | 1 | 0 | 28 | 1 | 0 | 0 |
| Köln 90 mm | 117 | 214 | 86 | 2 | 27 | 99 | 1 | 0 | 0 |
| Atzensport 80 mm | 113 | 7 | 0 | 0 | 0 | 7 | 0 | 0 | 0 |
| Hofbräu 110 mm | 79 | 6 | 0 | 0 | 0 | 6 | 0 | 0 | 0 |
| Elektro Yer 90 mm | 25 | 3 | 0 | 0 | 0 | 3 | 0 | 0 | 0 |
| **Eislingen 200 mm** | 136 | 1.179 | 53 | 808 | 297 | 21 | 45 | **43** | 0 |
| **Christliche 90,2 mm** | 840 | 6.703 | 0 | 6.567 | 124 | 12 | 278 | **57** | 546 |

**Grenzen.** (1) Eine Textur ohne Körner unter 0,05 mm² hat keinen Beleg: zwei „I“ der Kreideschrift
in Eislingen tragen je 4 Löcher von 0,02 bis 0,12 mm², bleiben, wie sie sind, und bestimmen jetzt
das Tor (0,78 mm bei 200 mm). (2) Die rauhe Kontur bleibt; beim Satin glättet sie §7.8.4. (3) Die
Fragmente der Pferdekontur sind keine Textur, werden aber je ein eigenes Objekt (rund 200
Laufstich-Objekte in der Vorlage der Christliche); sie zu einer Linie zu vereinigen wäre ein
eigener Schritt. (4) Die Schwellen sind an acht Logos gemessen, zwei davon mit Textur; ein Probestick auf
Jersey bestätigt oder korrigiert sie.

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

**Zahl der Durchgänge folgt der Breite** *(28.09.2026)*. Der schmale Ast aus `autoSatin`
(Spalte unter `SATIN_MIN_COLUMN_MM`, 1,2 mm) wird als Laufstich gestickt statt als Satin
(25.09.2026); wie oft, entscheidet jetzt die gemessene Breite (`medianShapeWidthMm`,
Konstante `SINGLE_PASS_MAX_MM` in `packages/engine/src/import/svg.ts`): bis 0,7 mm ein
Durchgang — ein Faden deckt die Breite bereits —, darüber drei (Bean Stitch). Gemessen am
Logo STUTTGART 80 mm: die 0,44–0,48 mm schmalen Ränder der Blockbuchstaben brauchen einen
Durchgang, die 0,89–1,22 mm breiten Striche der Bannerschrift bleiben bei drei. Die Grenze
liegt bei 0,7 und nicht bei 0,6, weil die Breitenmessung dünne Ringe an den Ecken
überschätzt: eine 0,45-mm-Wand misst als Quadratring 0,50 (10 mm Kante) bis 0,62 mm
(20 mm Kante), die Rahmen der Bandenden im selben Logo 0,61–0,62 mm. Bei 0,6 liefen sie
dreifach, und wo ihre Ecken sich treffen, stapelten sich 8 Einstiche. Gerade Striche misst
sie genau (0,75 mm → 0,78). Ergebnis am selben Logo: 11.192 statt 12.017 Stiche,
Nadelhäufung 6 statt 8.

Für die Ink/Stitch-Vorlage gilt die Einteilung aus §7.8.1: Satin ab 0,7 mm, darunter ein
einfacher Laufstich *(29.09.2026)*.

### 7.5 Kurzstiche *(26.09.2026 neu gefasst — vorher: Innenradius < 1 mm, jeder zweite Stich auf 70 %)*

Das Kriterium liegt am **Abstand zwischen zwei Einstichen auf derselben Rail**, nicht an der
Krümmung. Was den Stoff aufreißt, ist die Nadel neben ihrem eigenen Loch — und das passiert
auf einer breiten Spalte in einer flachen Biegung genauso wie auf einer schmalen in einer
engen. Aktiv, wenn `shortStitches = true`.

- **Auslöser: Abstand < 0,25 mm** zum letzten Einstich derselben Rail, der **stehen geblieben**
  ist. Nicht zum direkten Vorgänger: bei mehreren gedrängten Stichen hintereinander sähe
  jeder zweite weit genug entfernt aus, und die Häufung wäre nur halb aufgelöst.
- **Versatz: 15 % der Spaltenbreite** an dieser Stelle, nach innen. Ein Anteil, kein fester
  Faktor — auf einer 6-mm-Spalte sind das 0,9 mm, auf einer 1-mm-Spalte 0,15 mm.
- Beide Rails werden **getrennt** beurteilt. Ein Punkt, der stehen bleibt, wird zum neuen
  Bezugspunkt seiner Rail.
- Herkunft der Werte: Ink/Stitch-Voreinstellungen (`short_stitch_distance_mm` 0,25,
  `short_stitch_inset` 15 %) — die genaueste veröffentlichte Angabe zu diesem Verfahren.
  **Gelesen, nicht übernommen** (GPL-3.0, siehe `docs/verfahren-aus-inkstitch.md`).

**Gemessen** *(26.09.2026, vier Logos)*: Einstiche unter 0,25 mm auf derselben Rail gehen um
17 bis 43 % zurück (STUTTGART 80 mm 736 → 420, Atzensport 200 mm 1.057 → 678). Die
Nadelhäufung auf 0,2 mm bleibt gleich oder sinkt. **Preis**: die Dichtespitze steigt bei zwei
Motiven von 18 auf 26 bzw. 23 Stiche/mm² — betroffen sind 1 von 18.522 und 3 von 11.157
Zellen, also 0,01 bzw. 0,03 %. Das ist der erwartete Effekt: die Einstiche wandern von der
Kante ins Innere der Spalte. Beide bleiben weit unter der Fehlerschwelle aus §11.

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

### 7.8 Satin für die Ink/Stitch-Vorlage *(29.09.2026)*

Seit ADR 0001 stickt Ink/Stitch die Satinsäulen; TEXMA Stitch legt fest, wo sie liegen
(`packages/engine/src/inkstitch/`: `classify.ts`, `strokes.ts`, `columns.ts`, `smooth.ts`,
`template.ts`). Jede Säule geht als **native Ink/Stitch-Satinsäule** in die Vorlage: ein Pfad
mit zwei Rails und Sprossen, `inkstitch:satin_column`. Ink/Stitchs eigenes Werkzeug „Füllung
zu Satin" wird nicht benutzt. Es lässt jedes Stückende in einem Punkt zusammenlaufen und
fächert an Kreuzungen und Ecken; auf einem Testblatt mit 13 Buchstaben (DejaVu Sans Bold)
setzte es 10 statt 13 als Satin, bei Dichtespitze 21 statt 12 und Nadelhäufung 7 statt 4.

#### 7.8.1 Einteilung nach Breite

Gemessen mit `medianShapeWidthMm` (§5.1):

- **bis 0,7 mm** (`SINGLE_PASS_MAX_MM`): einfacher Laufstich entlang der Mittelachse — ein
  Faden deckt die Breite (§7.4). Einen dreifachen Laufstich gibt es in der Vorlage nicht.
- **über 0,7 mm bis unter 5 mm** (`AUTOSATIN_MAX_WIDTH_MM`): Satin, unter 1,0 mm mit
  `SATIN_TOO_NARROW` (§7.4).
- **ab 5 mm**: Tatami.

Die Grenze liegt bei 0,7 und nicht bei den 0,6 mm aus §7.4 (Entscheidung 29.09.2026): Die
Breitenmessung überschätzt dünne Ringe (§7.4). Die 0,45-mm-Ränder der Bandrahmen im
STUTTGART-Logo messen 0,61–0,62 mm und bleiben so Laufstich; der „/" in „NotSan 01/24"
(0,73 mm) und „CYS SPORTS" (0,88–1,24 mm) werden Satin.

#### 7.8.2 Strichplan

Aus der Mittelachse (§5) entsteht der Plan, den ein Puncher vor dem Setzen macht
(`strokeGraph`):

1. Astenden, die zusammenfallen, bilden einen Knoten. Knoten, die ein Ast kürzer als ihr
   Freiraum verbindet, sind **eine** Kreuzung — die Taille der „8" ist eine.
2. Ein Ast, der zu seiner Kreuzung zurückkehrt, ist ein **Ring** (O, die Bäuche der 8).
3. An jeder Kreuzung **läuft das gegenläufigste Astpaar durch**, wenn es sich mit mindestens
   140° trifft (`PASS_THROUGH_MIN_DEG`); wiederholt, solange Paare übrig sind (X: zwei Paare).
   Gemessen: der Balken des T läuft mit rund 161° weiter, die Arme des E treffen den Stamm mit
   93–100°.
4. Ketten, die als Säule lang genug sind (1,5 × Freiraum, `STROKE_CHAIN_FACTOR`), sind
   **Striche**; kürzere hängen als **Anhängsel** am Strich, von dem sie abgehen (Serifen,
   Ecken eines rechtwinkligen Endes, Beulen).
5. Jedes Strichende ist **frei**, **stößt an** einen durchlaufenden Strich oder trifft andere
   an einer **Ecke**. An der Ecke läuft ein Strich bis zur Außenkante weiter, die anderen
   stoßen an ihn: zuerst ein **tragender** Strich — einer, der durch eine Kreuzung läuft oder
   unter dem andere enden (Stamm von B, P, R; Stamm und Balken der 4) —, sonst der längere.
   Ergäbe das eine Stichfolge im Kreis, nimmt die Ecke der nächste Kandidat. Laufen zwei
   anstoßende Striche vor dem durchlaufenden ineinander (Arm und Bein des K, unter 150°), geht
   der längere bis zum durchlaufenden, der andere endet unter ihm.
6. Was anstößt, wird vorher gestickt und liegt unter dem Strich, an den es stößt.

Auf Wunsch (`splitSharpBends`) gilt ein Knick von mindestens 110° innerhalb von 2,5
Freiräumen als zwei Striche, die sich an einer Ecke treffen — die stumpfen Füße eines „w".

#### 7.8.3 Säulen

- **Rails folgen der Kontur.** Entlang der Strichachse (Schritt 0,2 mm) wird beidseits die
  Normale geschlagen. Wo sie auf Kontur trifft, die zu diesem Strich gehört, liegt ein
  Railpunkt; dazwischen läuft die Rail auf der Kontur selbst, Ecken und Serifen eingeschlossen.
  Zu einem Strich gehört, was der Freiraumkreis seiner Äste berührt.
- **Öffnungen werden überbrückt.** Wo ein anderer Strich einmündet, läuft die Rail als Gerade
  vom letzten Punkt vor der Öffnung zum ersten danach.
- **Enden.** Ein freies Ende läuft bis zu seinen Ecken aus (rechtwinklig) oder bis zur Spitze
  (rund, spitz). Der Strich, der eine Ecke behält, läuft über sie bis zur Außenkante. Ein
  anstoßender Strich läuft geradeaus weiter, bis er `underlapMm` (Preset, §14) unter der Kante
  des anderen liegt.
- **Sprossen** sind die Normalen selbst: mindestens alle 1,2 mm und beidseits jeder Öffnung,
  0,05 mm über die Rails hinaus, damit Ink/Stitch sie als kreuzend erkennt.
- **Parameter aus dem Preset:** Zickzackabstand `satinSpacingMm` (§7.3), Zugausgleich nach der
  Breite der Säule (§7.2), Split ab 7 mm (§7.4), Unterlage nach Breite (§7.6: unter 3 mm
  Mittellaufstich, ab 3 mm Kontur und Zickzack). Die Schalter in `satinUnderlay` (§14, immer
  Kontur und Zickzack) werden dafür nicht gelesen — offener Punkt zwischen §7.6 und §14.

**Zugausgleich lässt Stofflücken offen** *(29.09.2026, Entscheidung nach dem Vergleich mit
einer Profi-Mütze „Stuttgarter Hofbräu")*. Der Zugausgleich (§7.2) verbreitert jede Säule nach
beiden Seiten; zwischen zwei Formen frisst er den Stoffspalt, der sichtbar bleiben soll. Gemessen
am Hofbräu-Motiv in 110 mm: rote Buchstaben 2,4 mm (0,29 mm Ausgleich je Seite), goldene
Schattenlinien 0,75 mm (0,2 mm), der Spalt dazwischen 0,53 mm — übrig blieben 0,04 mm, auf der
Profi-Mütze bleibt dort sichtbar Stoff. Deshalb, mit Ink/Stitchs Zugausgleich je Rail
(`pull_compensation_mm` mit zwei Werten):

1. **Zur Seite eines Stoffspalts unter 1,0 mm** bekommt eine Säule keinen Zugausgleich. Stoffspalt
   heißt: bis zur nächsten anderen Form (gleich welcher Farbe, nicht dieselbe Form) liegt nur Stoff.
   Die Grenze liegt 0,2 mm über der Lückengrenze aus §5.2, damit zwei Säulen mit Ausgleich einen
   Spalt ab 1,0 mm nicht unter 0,5 mm drücken.
2. **Säulen unter 1,0 mm an einem Stoffspalt** (`SATIN_NARROW_WARN_MM`, dünne Schattenlinien
   neben einer anderen Form) bekommen **keinen** Zugausgleich, auch nicht zur freien Seite. Sie
   werden so schmal gestickt, wie sie gezeichnet sind. An einem Stoffspalt heißt: mindestens eine
   Rail liegt nach Regel 1 an einem Spalt unter 1,0 mm. Übrige schmale Säulen behalten den
   Ausgleich nach §7.2 *(29.09.2026, gemessen: ohne Ausgleich für alle schmalen Säulen stieg an
   STUTTGART 80 mm die Nadelhäufung von 7 auf 10 — die Zelle an einer Zickzackspitze am Ende einer
   schmalen Säule —, an Köln 90 mm die Zahl der Zellen über 18 von 30 auf 40; der Spalt Rot/Gold im
   Hofbräu-Motiv öffnet sich mit Regel 1 allein genauso)*.

#### 7.8.4 Glätten rauer Konturen

Pinselschrift („SEGEN SEIN") hat alle paar Zehntelmillimeter eine Kerbe oder Beule; ihre
Mittelachse verzweigt an jeder, und kein Strichplan hält. Scheitert eine Form als Satin, wird
sie geschlossen und geöffnet (`smoothOutline`: nach außen und zurück, dann nach innen und
zurück), mit 0,2, dann 0,3, dann 0,4 mm — der kleinste Radius, der trägt, gilt. Gemessen an
„SEGEN SEIN": 0 von 34 Teilen halten ungeglättet, 18 mit 0,2 mm, 33 mit 0,4 mm.

Geglättet wird nur **Textur**: eine Kontur, die beim Öffnen mindestens 0,5 % ihrer Fläche
verliert (`TEXTURE_EDGE_MIN`), oder eine, die beim Schließen höchstens 5 % gewinnt
(`CLEAN_FILL_MAX`). Gezeichnete Löcher bleiben — die Kronen im roten Band des Kölner Wappens
würden 20 % der Fläche zusticken. Jede Glättung meldet sich als `info`, und die Deckung wird
gegen die **Originalkontur** gemessen. Preis: Kerben unter dem doppelten Radius werden
zugestickt (beim „R" von „CYS SPORTS" der Schlitz zwischen den Beinen am Fuß, siehe Backlog).

#### 7.8.5 Prüfgrenzen

Eine Form wird nur Satin, wenn alle vier Grenzen halten; sonst bleibt sie Tatami, und der Grund
steht in der Ausgabe (Regel 8).

| Grenze | Wert | Warum |
|---|---|---|
| Rail außerhalb der Form (`RAIL_OUTSIDE_MAX_MM`) | höchstens 0,15 mm | weniger als der kleinste Zugausgleich (§7.2, 0,2 mm) — darin verbreitert Ink/Stitch die Säule ohnehin |
| Rails einer Säule | kreuzen sich nicht | eine gekreuzte Säule stickt verdreht |
| Anteil einer Säule auf anderen (`COLUMN_OVERLAP_MAX`) | höchstens 60 % | mehr heißt: der Plan hat eine Kreuzung als einen Strich gelesen; sich kreuzende Striche teilen bis ein Drittel (4: 31 %, X: 19 %) |
| Deckung aller Säulen einer Form | mindestens 0,85 (`COLUMN_COVERAGE_MIN`, §5.1) | sonst bleibt Stoff sichtbar |

Ausnahme *(29.09.2026)*: Eine Form unter 1,0 mm (`SATIN_NARROW_WARN_MM`), die als Säule nicht
hält, wird **einfacher Laufstich** entlang der Achse statt Tatami. Eine Fläche aus ein, zwei
Reihen auf so schmaler Form ist dichter und unruhiger als der Faden, den die Form bis 0,7 mm
ohnehin bekäme. Gemessen im Köln-Logo: Dichtespitze 34 → 30.

#### 7.8.6 Reihenfolge und Verbindungen

Die Säulen einer Form kommen in Stichfolge (was unter einem Strich endet, zuerst). Satinformen
gleicher Farbe, die in der Vorlage aufeinander folgen, bilden eine **Folge**; je Folge ein
Aufruf von Ink/Stitchs „Satinsäulen automatisch führen" (`auto_satin --preserve_order --trim`).
Der Weg zwischen den Säulen läuft verdeckt unter späteren Säulen, und nie über eine andere
Farbe oder ein dazwischen gesticktes Objekt; wo das nicht geht, setzt Ink/Stitch einen
Fadenschnitt.

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

**Der Winkel folgt der Form** *(26.09.2026)*. Gewählt wird der Winkel, bei dem die Reihen am
seltensten **brechen** — gezählt werden die Stücke jenseits des ersten in jeder Reihe, über
die Kandidaten 0° bis 165° in Schritten von 15° (`bestFillAngle`, `rowBreaks`). Nicht die Zahl
der Stücke: die misst nur, wie weit die Form quer zu den Reihen reicht, und auf einem
Rechteck gewänne immer die kurze Seite.

**Gedreht wird nur bei deutlichem Gewinn** — ein Kandidat muss die Brüche mindestens
**halbieren** (`ANGLE_GAIN` = 0,5), sonst bleibt der Winkel aus §5.1 stehen. Grund: Die
Diagonale ist das, was die Praxis gegen Verzug einsetzt; Reihen parallel zum Gewebe ziehen am
stärksten. Ein Kreisring bricht bei jedem Winkel ungefähr gleich oft — welcher dort gewänne,
entschiede die Rundung, nicht die Form.

**Gemessen** *(vier Logos, 26.09.2026)*: die Regel greift bei 6 von 23 bis 18 von 78 Flächen
und senkt deren Brüche um 67 bis 94 % (Köln 90 mm: 235 → 32). Stichzahl −2,7 % (STUTTGART
80 mm), Nadelhäufung dort von 7 auf **5** Einstiche je 0,2 mm und von 2 auf **0** Zellen,
Rechenzeit unverändert. **Sprünge und Trims bleiben gleich** — sie entstehen zwischen den
Objekten, nicht innerhalb einer Fläche (§10.2).

Verfahren von Buttery Stitches („fewest-fragments"), Kriterium auf Brüche statt Stücke
geändert — `docs/verfahren-aus-open-source.md`.

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

### 8.8 Tatami in der Ink/Stitch-Vorlage *(29.09.2026)*

Die Tatami-Flächen der Vorlage (`packages/engine/src/inkstitch/tatami.ts`) tragen die Werte des
Presets (§14) als `inkstitch:`-Attribute: Reihenabstand, Stichlänge, Versatz und den Stichwinkel
nach §8.2 mit der Kreuzungsregel aus §5.1. Jeder Attributname ist gegen die Ink/Stitch-Quelle
geprüft, und der Rauchtest zeigt je Attribut, dass es die Stiche ändert — einen falsch
geschriebenen Namen übergeht Ink/Stitch still. Drei Punkte weichen vom Wortlaut von §8 ab:

1. **Zug und Schub (§8.1.1) stehen im Umriss** der Fläche, mit demselben Versatz wie `fill.ts`,
   nicht im Ink/Stitch-Attribut `pull_compensation_mm`. Das Attribut wirkt, baut die Fläche
   aber bei jedem Stichplan aus ihren Reihen neu auf und kennt keinen Schub. Gemessen: STUTTGART
   80 mm 64 s → 325 s, Köln 90 mm 245 s → 989 s, STUTTGART 250 mm nach über einer Stunde nicht
   fertig statt 6 Minuten. Zerlegt der Schub eine Fläche (Haarflächen im Eislingen-Logo: 42 und
   18 mm² in 55 und 110 Teile), bekommt sie nur den Zug; verschwindet sie ganz, bleibt sie wie
   gezeichnet (§8.1.1) — beides mit Meldung. Der Umriss wird auf ein 1-µm-Raster gelegt, weil
   sich sonst dünne Spitzen in Ink/Stitchs Geometrie selbst kreuzen.
2. **Die Gitterunterlage (§8.6) nur, wo sie hält**: der eingerückte Umriss bleibt ein Stück, ist
   an einer Stelle mindestens 0,8 mm breit, und jede Lage trifft eine Reihe. Sonst stickt
   Ink/Stitch jedes Stück der Unterlage als eigene Gruppe ohne Fadenschnitt dazwischen —
   gemessen: in fünf von sechs Logos Fäden über 5 mm auf dem Stoff (bis 79 mm), Nadelhäufung bis
   14. Anteil der Tatami-Fläche mit Unterlage: STUTTGART 80 mm 81 %, Köln 4 %, Eislingen 96 %.
3. **Keine Konturunterlage** (§8.6): Ink/Stitchs Füllung hat nur die Gitterunterlage. Offener
   Punkt — ginge über eigene Konturobjekte je Fläche.

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

**Die Reihenfolge wird zweimal bestimmt** *(26.09.2026)*. Der erste Durchgang läuft vor dem
Rechnen, weil der Knockdown aus §4.1 ihn braucht — dort ist der Anfang eines Objekts eine
Schätzung aus der Bounding Box und sein Ende gar nicht bekannt. Sobald die Stiche stehen,
wird dieselbe Frage mit den **echten** ersten und letzten Stichen erneut gestellt
(`autoOrder(objects, { ends })`, `reorderByEnds` in `pipeline.ts`), und erst dann entscheidet
der Weg vom Ende des zuletzt gestickten Objekts, wie §10.1 es verlangt.

Es ändert sich nur die **Folge**, kein Stich: die Bedingungen sind dieselben (Überlappung hält
die Reihenfolge, Farbe bleibt in der Nadel, Flächen vor Konturen).

**Gemessen** *(sechs Läufe, 26.09.2026)*: Trims je 1000 Stiche bei Köln 90 mm 6,70 → **5,60**,
bei STUTTGART 80 mm 4,64 → **4,13**; Sprünge 20,6 → **17,9** und 12,9 → **12,3**. Bei den
großen Motiven sind die Sprünge besser und die Trims gleich. **Preis**: der zweite Durchgang
rechnet die Überlappungen erneut — STUTTGART 250 mm braucht 20,4 statt 17,4 Sekunden.

Ein früherer Versuch, das Ende zu **schätzen** (Mitte der oberen Kante), hat alle Kennzahlen
verschlechtert und ist zurückgenommen worden: eine falsche Schätzung ist schlechter als eine
grobe, die auf der Form liegt.

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
- **In der Ink/Stitch-Vorlage: 0,4 mm** *(02.10.2026, Entscheidung des Nutzers)*. Die Punkte oben gelten für die eingefrorene eigene Engine. Bei Ink/Stitch entscheidet die Dokument-Einstellung `min_stitch_len_mm` (Ink/Stitch-Standard 0,1 mm): Ink/Stitch lässt beim Erzeugen jeden Stich weg, der **höchstens** so lang ist (`ColorBlock.filter_duplicate_stitches`). Ausgenommen sind Verriegelungsstiche (`lock_stitch`), der erste Stich nach einem Sprung sowie Schnitt-, Stopp- und Farbwechselbefehle. Die Vorlage schreibt deshalb `<inkstitch:min_stitch_len_mm>0.4</inkstitch:min_stitch_len_mm>` in ihr `<metadata>`. Ink/Stitch ergänzt dort nur fehlende Werte. Die Nacharbeit-Datei (§13.4) übernimmt den Wert mit dem Kopf der Datei, am Arbeitsplatz entsteht also dieselbe DST.
  - **Anlass:** Unsere Probestick-DSTs hatten 2,8–6,0 % Stiche unter 0,4 mm, die beiden Profi-Dateien aus Schritt 6 (§16) nur 0,5 und 0,6 %. Die iPad-App StitchPencil entfernt Stiche unter 0,4 mm beim Import mit der Begründung, dass daran bei hoher Drehzahl der Faden reißt.
  - **Gemessen** an STUTTGART 91 mm (Piqué): Stiche unter 0,3 mm von 2,1 auf 0,1 %, unter 0,4 mm von 3,8 auf 1,2 %. Es fallen 482 Stiche weg (−2,9 %), davon 8 Reihenwechsel im Tatami; die Maße bleiben gleich. Atzensport 107 mm: unter 0,4 mm von 4,4 auf 2,1 %.
  - **Offen** (vor jeder Änderung des Reihenabstands messen): Der Reihenwechsel an einer Tatami-Kante ist Reihenabstand / sin α lang, α ist der Winkel zwischen Kante und Reihen. Bei 0,40 mm Reihenabstand ist er nie kürzer als 0,4 mm und fällt nur an Kanten quer zu den Reihen weg (die 8 Stiche oben). Bei 0,2 mm ist er an jeder Kante mit α ≥ 30° höchstens 0,4 mm und fiele weg. So dicht stickt der Puncher den Pferdekörper der Christlichen Gemeindereitschule; ob das die Regel ist, klärt Schritt 6 (§16). Dann braucht Tatami einen eigenen Wert: Ink/Stitch erlaubt `min_stitch_length_mm` je Objekt.
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

### 13.4 Nacharbeit-Datei *(30.09.2026, Entscheidung des Nutzers: „Das Stickprogramm wird automatisch entwickelt, und wir passen es an den Schwachstellen manuell an.")*

Jeder Lauf von `pnpm inkstitch` schreibt neben DST auch das Ink/Stitch-Dokument, aus dem die DST
entstanden ist (nach Führung der Säulen und Fadenschnitten), als `<name>.nacharbeit.svg` — zum
Öffnen in Inkscape mit Ink/Stitch in derselben Version wie die Pipeline (ADR 0001):

- **Maße:** Dokumentgröße in mm, Ursprung oben links bei 0; die Formen liegen dort, wo sie in
  der gelieferten SVG liegen (der Importer rechnet den Ursprung der `viewBox` mit ein).
- **Eine Ebene je Farbblock** in Stichfolge, benannt mit Nummer, Farbname und Farbwert
  („01 Gold #D1B35A"). Ink/Stitch stickt Ebenen in Dokumentfolge; die Farbfolge bleibt.
- **Sprechende Namen** je Objekt (`inkscape:label`): Art (Satin, Tatami, Laufstich), Farbe und
  die Kennung der Quellform.
- **Alle Parameter als `inkstitch:`-Attribute**, wie die Vorlage sie setzt — im Ink/Stitch-
  Parameterdialog sichtbar und änderbar.
- **Ebene „Prüfstellen", ausgeblendet und mit `inkstitch:ignore_object`** — ausgeblendet allein
  reicht nicht: blendet jemand die Ebene ein, stickte Ink/Stitch ihre Kreise mit (gemessen
  30.09.2026, DST 30.077 statt 30.005 Byte). Je Schwachstelle ein Kreis und ein kurzer Text — was,
  gemessen, Grenze, Vorschlag. Schwachstellen sind: Satinstriche unter ihrer Grenze (nur mit
  `--ohne-tor`), tragende Satinstriche zwischen 1,0 und 1,3 mm, Formen, die erst in der erzeugten Größe
  Satin werden und dort unter ihrer Grenze liegen (§5.2, Tor), Säulen unter 1,0 mm, Formen, die
  als Satin nicht hielten (Rückfall Tatami oder Laufstich, §7.8.5), Satin auf geglätteter Kontur
  (§7.8.4), Flächen, die unter 0,7 mm zur Linie werden, Tatami ohne Gitterunterlage (§8.8),
  Lücken und Stofflücken unter 0,8 mm (§5.2), Nadelhäufung ab 6 Einstichen je 0,2 mm und Zellen
  über 18 Stichen je mm² aus der DST, Sprünge über 5 mm ohne Fadenschnitt.
- **Dokumentversion:** Die Datei trägt `inkstitch_svg_version` (4) und ist schon aktualisiert, wie
  Ink/Stitch es beim Öffnen täte (`lib/update.py`) — sonst fragte Inkscape per Dialog, und eine
  andere Antwort stickte anders als die Pipeline. Ein weiterer Lauf von Ink/Stitch ändert an ihr
  nichts mehr. Sie trägt keinen Dokumentnamen (`sodipodi:docname` steht im Kopf der DST, Feld `LA:`).

Daneben: DST **und PES** (Ink/Stitchs `output`), die Vorschau in Garnfarben mit den markierten
Prüfstellen und die Nadelbelegung je Stopp (`<name>.farbfolge.txt`; „dieselbe Nadel wie Stopp N?"
bei zwei Farben bis RGB-Abstand 8 — gemessen 1,4 für dasselbe Rot aus zwei PDF-Quellen, 15,8 für
zwei verschiedene Rot derselben Datei).

**Nachweis:** Die Nacharbeit-Datei unverändert durch Ink/Stitchs `output` gibt dieselbe DST,
Byte für Byte, wie der Lauf (Rauchtest). Für einen externen Puncher ist dieselbe Datei eine
saubere Vektorvorlage mit einer Ebene je Farbe.

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

Abnahme Phase 1: drei Phase-0-Motive stickbar ohne manuelle Nachbearbeitung der Stiche, Abweichung zur Ink/Stitch-Stichzahl < 10 %. *(Entfällt seit 28.09.2026 — Ink/Stitch ist jetzt der Erzeuger, siehe Phase 1b.)*

### Phase 1b — Ink/Stitch als Stich-Engine *(28.09.2026)*

| Schritt | Inhalt | Nachweis |
|---|---|---|
| 1 | Einbau: Starter, Einrichtung, `pnpm inkstitch <svg> [preset]`, Rauchtest | die sechs Kundenlogos reproduzieren den Probelauf vom 28.09.2026 |
| 2 | Schrift und schmale Formen als Satin: Einteilung nach Breite, Sprossen aus der Mittelachse, Ink/Stitch „Füllung zu Satin" → „Satinsäulen automatisch führen" | jeder Buchstabe von „STUTTGART", „CYS SPORTS", „Berufsfeuerwehr Köln", „NotSan 01/24", „SEGEN SEIN" als Satin, Deckung ≥ 0,85, im Player lesbar |
| 3 | Verdeckte Flächen ausschneiden, gleiche Farben zusammenziehen, Fadenschnitte, Preset-Werte als Attribute | STUTTGART 80 mm: höchstens 4 Farbblöcke, Dichtespitze ≤ 24, Nadelhäufung ≤ 8, Trims/1000 ≤ 5,6 |
| 4 *(30.09.2026, 01.10.2026)* | Mindestgröße als Tor (§5.2): Einteilung der bestellten Größe, tragende Striche ab 1,0 mm, Schattenlinien ab 0,7 mm, erzeugt in der Mindestgröße, Rahmen nur gewarnt | STUTTGART bestellt in 80 mm → erzeugt in der Mindestgröße, mit Meldung; Hofbräu 110 mm bleibt 110 mm; in der gefundenen Größe hält jeder gezählte Strich seine Grenze; was erst dort Satin wird, steht als Prüfstelle in der Nacharbeit-Datei |
| 5 *(30.09.2026)* | Nacharbeit-Datei (§13.4) und Ink/Stitch in der offiziellen Version 3.3.0 (ADR 0001) | Nacharbeit-Datei unverändert → dieselbe DST, Byte für Byte; Prüfstellen-Ebene ausgeblendet und nicht gestickt; die sechs Kundenlogos gegen den Stand vor dem Versionswechsel gemessen |
| 6 *(30.09.2026)* | Parameter gegen Puncher-Dateien: 10–20 Paare aus Original-Logo und Puncher-DST aus dem TEXMA-Archiv (nicht im Repo) | je Paar Stichzahl je Farbe, Satin- und Füllabstand, Unterlage, Trims gegenübergestellt; Presets so eingestellt, dass die Stichzahl die des Punchers auf ±15 % trifft |

Abnahme Phase 1b: Probestick STUTTGART 80 mm und Köln 90 mm auf Piqué, Bewertung durch den Stickverantwortlichen.

---

## 17. Offene Punkte

- Asymmetrischer Zugausgleich (A/B getrennt): Phase 3.
- Fill mit Kurvenverlauf (Contour Fill, Guided Fill): Phase 3, nur wenn Bedarf.
- Applikation, 3D-Puff: nicht geplant.
- Import fremder DST/PES zur Weiterbearbeitung: Reader vorhanden, Rückführung in Objekte nicht möglich, nur Anzeige.
