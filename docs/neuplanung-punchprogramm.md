# Punchprogramm — Neuplanung von Grund auf (v3)

Stand: 21.09.2026 · Grundlage: `Neuplanung_Punchprogramm_v2.md` (TEXMA), Archiv mit 192
Profi-Stickdateien 2016–2025, Fachrecherche zu Wilcom EmbroideryStudio, Tajima DG17 by
Pulse, ZSK EPCwin, Melco DesignShop, Brother PE-Design, Embrilliance, Ink/Stitch.

Dieses Dokument ersetzt die Planung, nicht die Spezifikation. `docs/Engine-Spezifikation.md`
bleibt die Wahrheit für das, was gebaut ist; hier steht, was gebaut werden soll und warum.

---

## 0. Die eine Zahl, um die es geht

STUTTGART 80 mm, unsere Engine: **2,67 Stiche/mm²** Bounding Box.
Archiv, Brustmotive 60–120 mm (n = 133): Median **1,30**, p75 1,79, p90 **2,37**.

Wir liegen über dem 90. Perzentil dessen, was unsere eigenen Puncher in neun Jahren
abgeliefert haben. Das ist der Abstand, den diese Planung schließen soll. Alles andere —
Objekttypen, Editor, Automatik — ist danach.

---

## 1. Was das Archiv wirklich sagt

192 Dateien, gemessen mit dem beiliegenden `analyze_archive.py` (pyembroidery + numpy,
Klassifikation über Richtungswechsel in 12-Stich-Fenstern). **Ich habe die CSV nachgerechnet
und weiche in zwei Punkten von v2 ab.**

### 1.1 Größenklassen (bestätigt)

| Klasse            |   n | Stiche Median | p25–p75      | Stiche/mm² Median |  p75 |  p90 |
| ----------------- | --: | ------------: | ------------ | ----------------: | ---: | ---: |
| klein < 60 mm     |  16 |         1.405 | 823–2.177    |              1,66 | 2,62 | 2,83 |
| Brust 60–120 mm   | 133 |         3.782 | 2.557–6.351  |              1,30 | 1,79 | 2,37 |
| mittel 120–200 mm |  17 |         6.923 | 5.769–9.975  |              1,01 | 1,32 | 2,20 |
| Rücken > 200 mm   |  26 |        20.325 | 8.446–33.559 |              0,61 | 0,87 | 1,65 |

Stiche/mm² fällt mit der Größe — große Motive haben mehr leere Fläche in der Box. Der
Vergleich muss deshalb **immer innerhalb der Klasse** laufen. v2 hat das richtig gesehen.

### 1.2 Stichparameter — zwei Korrekturen an v2

| Parameter             | v2 sagt                                | CSV sagt (nachgerechnet)                                                          | Befund                                                                                        |
| --------------------- | -------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Fill-Reihenabstand    | „eng um **0,35**", p10–p90 = 0,33–0,39 | n=121, p10 **0,26** · p25 0,36 · **Median 0,43** · p75 0,63 · p90 0,78 · max 0,92 | **Nicht eng.** Die Verteilung ist breit und zweigipflig: 17 Dateien unter 0,30, 25 über 0,70. |
| Fill-Stichlänge       | Median **3,4**                         | n=103, Median **3,00** · p75 3,30 · p90 3,50 · max 4,00                           | 55 von 103 Dateien liegen bei ≤ 3,0.                                                          |
| Laufstich             | Median 1,65                            | n=174, Median **1,60** · p75 1,80 · p90 1,89 · **max 2,00**                       | bestätigt                                                                                     |
| Satin-Zickzackabstand | Median 0,40                            | n=190, Median **0,40** · p25 0,40 · p75 0,41                                      | bestätigt, sehr eng                                                                           |
| Satin-Breite          | Median 2,1                             | n=190, Median **1,99** · p75 2,62 · p90 3,50 · max 7,48                           | bestätigt                                                                                     |
| Dichte max je Datei   | p75 = 18, max 44                       | Median **15** · p75 **18** · p90 **24** · max 44                                  | bestätigt                                                                                     |
| Trims/1.000           | 1,3–2,1                                | Median **1,9** · p75 3,7 · p90 5,6 · max 10,1                                     | Median bestätigt, Streuung größer                                                             |
| Sprünge/1.000         | 7,6–9,1                                | Median **7,8** · p75 13,3 · p90 18,9 · max 67,7                                   | Median bestätigt, Streuung viel größer                                                        |

**Was die Reihenabstands-Verteilung bedeutet.** Nach Größenklasse: klein 0,62 · Brust 0,45 ·
mittel 0,37 · Rücken 0,43 (Mediane). Es gibt keinen Hausstandard 0,35. Die Puncher wählen
den Abstand nach Motiv, Stoff und Größe — kleine Motive **offener**, mittlere dichter. Ein
fester Preset-Wert bildet das nicht ab; was es braucht, ist eine **Regel** (siehe §4.2).

Unsere 0,40 liegt damit nicht zu dicht. **Der Stichzahl-Überschuss kommt woanders her.**

### 1.3 Wo unser Überschuss herkommt — Hypothesen in Prüfreihenfolge

Der Faktor 2 gegen den Archiv-Median ist nicht durch den Reihenabstand erklärbar (0,40 vs.
0,43 Median = 7 %). Die verbleibenden Kandidaten, nach erwarteter Wirkung:

1. **Unterlage pauschal statt nach Regel.** Wir geben jeder Fläche Kontur **und** Gitter,
   unabhängig von ihrer Größe. Das Archiv zeigt Gitter-Unterlagen nur bei größeren Flächen
   (Abstand 1,1–2,7 mm, Median 1,7). Bei 130 Objekten im STUTTGART-Logo mit vielen kleinen
   Flächen ist das der größte Einzelposten.
2. **Unterlappung 0,8 mm an jeder Knockdown-Kante.** Summiert sich bei vielen Nachbarn; an
   einem Punkt mit acht Flächen achtmal.
3. **Reisestichlänge 3,0 mm** — über dem Archiv-**Maximum** von 2,0. Das war meine Änderung
   von heute, begründet aus dem EPCwin-Handbuch. Das Archiv widerlegt sie: verdeckte Wege
   laufen dort mit 1,2–2,0 mm.
4. **Fill-Stichlänge 4,0** — über p90 (3,5). Ebenfalls heute eingeführt.
5. **Auto-Satin auf Fragmenten**: Eislingen 926 Objekte. Jedes Objekt kostet Unterlage,
   Verriegelung, An- und Abfahrt.

### 1.4 Was das Archiv nicht kann

Es sind Stichdaten, keine Objekte — wir sehen das Ergebnis, nicht die Entscheidung. Für
Golden Files braucht es die Vorlagen. v2 nennt die fünf Kandidaten (Willi Lutz Brust +
Rücken, Stadt Herrenberg, Waldseilgarten, Feuerwehr Herrenberg, Sonnenapotheke) — die
Beschaffung ist die einzige Aufgabe in diesem Plan, die nicht am Rechner erledigt werden
kann.

---

## 2. Was die Expertenprogramme gemeinsam haben

Belegstufen: **[A]** Primärquelle im Volltext (Ink/Stitch-Quellcode), **[B]**
Herstellerdoku, **[C]** Fachpresse, **[D]** Branchenblogs (widersprüchlich).

### 2.1 Das gemeinsame Modell

Alle arbeiten **objektbasiert**: Ein Design ist eine Liste von Objekten (Kontur + Stichtyp +
Parametersatz), aus denen Stiche _berechnet_ werden [B, C]. Genau unser Ansatz. Drei
Steuerungsebenen, die v2 richtig benennt: Objektparameter → Style/Fabric → automatische
Regeln.

### 2.2 Parameter, die wir nicht haben — mit belegten Werten

**Kompensation ist additiv, nicht entweder/oder.** Ink/Stitch führt drei getrennte
Parameter [A]:

| Parameter                   | Bedeutung                                                               |
| --------------------------- | ----------------------------------------------------------------------- |
| `pull_compensation_mm`      | fester Betrag je Seite; **zwei Werte durch Leerzeichen = asymmetrisch** |
| `pull_compensation_percent` | zusätzlich, prozentual zur Stichbreite                                  |
| `push_compensation_mm`      | **verkürzt die Säule an Anfang und Ende**                               |

Das ist exakt der Fehler von heute in einem Satz: Wir haben den festen Betrag _durch_ den
prozentualen **ersetzt**, statt beide zu addieren. Der feste Anteil deckt den
materialbedingten Sockel, der prozentuale skaliert mit der Breite.

Zweitens: **Push ist etwas anderes, als wir denken.** Unser `pushCompMm` schiebt quer zur
Stichrichtung nach innen. Ink/Stitch verkürzt die Säule **längs**, an den Enden. Die
Fachliteratur beschreibt das Phänomen so: „the embroidered 'I' will be slightly taller than
the one on your screen" [C] — der Schub wirkt in Stichrichtung. Unsere Definition ist
gegenüber der Praxis um 90° verdreht. **Zu klären.**

**Kurzstiche — die präziseste öffentlich verfügbare Spezifikation** [A]:

| Parameter                  | Default     | Bedeutung                                                                            |
| -------------------------- | ----------- | ------------------------------------------------------------------------------------ |
| `short_stitch_inset`       | **15 %**    | Rückversatz; zwei Werte = gestaffelte Stufen bei mehreren Kurzstichen hintereinander |
| `short_stitch_distance_mm` | **0,25 mm** | Auslöser: Einstichabstand kleiner als dies                                           |

Unsere Regel (Radius < 1 mm → jeder zweite Innenstich auf 70 %) ist gröber und trifft nicht
dasselbe Kriterium. Der Auslöser gehört an den **Einstichabstand**, nicht an den Radius.

**Unterlagen — der Branchenstandard-Satz** [B, Melco]: ZigZag, Fill, Center Walk, Edge Walk,
Double ZigZag, primär und sekundär kombinierbar.

| Wert                                                            | Beleg                                                                                                                                    |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Inset 0,4 mm je Seite                                           | **[A]** Ink/Stitch `contour_underlay_inset_mm` — und unabhängig davon [D] „0,4–0,6 mm". Die einzige kreuzvalidierte Zahl im ganzen Feld. |
| Zickzack-Inset = halber Kontur-Inset (0,2)                      | [A]                                                                                                                                      |
| Unterlagen-Reihenabstand = **3 × Füll-Reihenabstand**           | [A]                                                                                                                                      |
| Unterlagen-Winkel 90° zum Deckstich (einlagig), 45° (zweilagig) | **[B]** Wilcom + [A] Ink/Stitch                                                                                                          |
| Zickzack-Unterlage ab ca. 4 mm Säulenbreite                     | [D], Einzelnennung                                                                                                                       |
| **Reihenfolge: Zickzack zuerst, Edge Run danach**               | [D], fachlich begründet: der Zickzack fixiert, der Edge Run definiert die Kante                                                          |

**Eckenverhalten beim Satin** — drei Strategien [B/C/D]: **Pivot** (dreht um die Innenecke,
erzeugt dort Stichkonzentration), **Mitre/Gehrung** (läuft in die Ecke aus und wieder heraus,
mit Überlappung; parametrisiert über Auslösewinkel und Überlappungsbetrag; „sweats and knits
needing more overlap than nylon or twill"), **Cap/Kappe** (drei Säulen: Eingang, Endkappe,
Ausgang). Wir haben nichts davon — unsere Ecken laufen rund.

**Auto-Split breiter Säulen** [B, Wilcom]: „A length of **7,00 mm** is recommended to
preserve the satin effect", mit **zufällig verteilten** Einstichen, damit keine Naht in der
Säulenmitte entsteht. Ink/Stitch [A]: `split_method` ∈ {Default, Simple, Staggered},
`split_staggers` = 4, dazu `random_split_jitter_percent`. Unser Split ist fest und erzeugt
genau die Mittelnaht, die beide Programme vermeiden.

**Satin-Auto-Spacing** [B, Wilcom]: Der Zickzack-Abstand variiert mit der Säulenbreite — je
breiter, desto offener, über eine hinterlegte Tabelle, prozentual skalierbar. Unser Abstand
ist konstant. Das Archiv stützt Wilcom: Satin-Abstand p25–p75 = 0,40–0,41 bei Breiten von
1,4 bis 7,5 mm — die Puncher halten den Abstand erstaunlich konstant, was gegen eine starke
Breitenabhängigkeit spricht. **Offen, gegen das Archiv zu prüfen.**

**Reisewege** [B, Hatch]: „Travel on Edge setting is activated automatically for spacings
larger than 0.9 mm" — ab offenen Füllungen wechselt die Software selbsttätig die Strategie,
damit Verbindungsstiche nicht sichtbar durch die Fläche laufen.

**Mindeststichlänge** [C]: „Most needles are between 7 and 8 points in diameter, so try to
keep stitches 10 points (1,0 mm) long or longer." Das ist die einzige Faustregel im Feld mit
physikalischer Herleitung. Unsere 0,6 mm liegt darunter.

**Maschinengrenzen** [B, Wilcom]: max. Stichlänge **12,7 mm** binär (Barudan), **12,1 mm**
ternär (Tajima). Haben wir.

**DST hat kein Trim-Kommando** [D]: Maschinen erkennen Trims an aufeinanderfolgenden Jumps,
Standard 3. Haben wir als Option.

### 2.3 Was wir übernehmen, was nicht

Übernehmen (in dieser Reihenfolge): Auto-Underlay nach Regel · additive Kompensation ·
Kurzstich-Kriterium am Einstichabstand · Smart Corners · Auto-Split mit Streuung · Branching ·
Column B (Satin mit eigenen Winkeln je Sprosse) · Text auf Bogen und Kreis · Stitch Player.

Nicht bauen (v2, unverändert): Fotostickerei, Fur Stitch, Fractal Fill, Pailletten, Bohren,
Chenille, Applikation, 3D-Foam.

---

## 3. Zielmodell

### 3.1 Objekttypen

```ts
type StitchObject =
  | RunObject // Laufstich, Bean, Mehrfachdurchgang mit Versatz
  | SatinObject // zwei Rails, Sprossen optional            (heute: Satin)
  | SatinPathObject // Mittellinie + Breite                     NEU  (Column C)
  | FillObject // Fläche, ein Winkel                       (heute: Fill)
  | FillGuidedObject // Fläche + Führungslinien, Winkel interpoliert   NEU (Complex Turning)
  | TextObject // Grundlinie line | arc | circle           (heute: nur line)
  | ManualObject; // Einzelstiche, nur im Editor              NEU
```

`SatinObject` bekommt **Winkel je Sprosse** (Column B) statt nur Paarung nach Bogenlänge.

### 3.2 Parameter, die jedes Objekt trägt

```ts
type Compensation = {
  pullMm: number; // fester Sockel je Seite      (Archiv/Praxis: 0,15–0,25)
  pullPct: number; // zusätzlich, % der Breite    (12–15)
  pullMaxMm: number; // Deckel                      (0,4)
  pullAsymmetric?: [number, number]; // je Seite getrennt
  pushMm: number; // LÄNGS, verkürzt die Enden   — neue Definition, §2.2
};

type Underlay =
  | { kind: "none" }
  | { kind: "centerWalk"; stitchLengthMm: number; repeats: number; position: number }
  | { kind: "edgeWalk"; insetMm: number; stitchLengthMm: number }
  | { kind: "zigzag"; insetMm: number; spacingMm: number }
  | { kind: "doubleZigzag"; insetMm: number; spacingMm: number }
  | { kind: "fill"; angleOffsetDeg: number; rowSpacingMm: number; insetMm: number }
  | { kind: "mesh"; spacingMm: number };
// Reihenfolge ist Teil des Objekts: Underlay[] statt Flags. Zickzack vor Edge Walk.

type Corners = {
  mode: "pivot" | "mitre" | "cap" | "auto";
  mitreBelowDeg: number; // 60
  capBelowDeg: number; // 30
  overlapMm: number;
}; // stoffabhängig

type ShortStitches = {
  triggerDistanceMm: number; // 0,25
  insetPct: number[];
}; // [15, 25] gestaffelt
```

### 3.3 Das Dokument

Heute fehlt ein Dateiformat für das `Design` — gespeichert wird nur der Stichplan, also
genau das, was laut eigener Regel 5 nie gespeichert werden soll. Neu:

```ts
type Document = {
  version: number; // Migrationen möglich
  design: Design;
  source?: { svg: string; hash: string }; // die Vorlage bleibt am Dokument
  groups: Group[]; // Gruppe ist Pflicht, nicht optional
  styleId: string; // welcher Parametersatz galt
  history?: Revision[];
};
type Group = { id: string; label: string; objectIds: string[]; ordered: boolean };
```

Jedes Objekt trägt zusätzlich seine **Herkunft**: `origin: "import" | "auto" | "human"` —
ohne das kann der Editor nicht erklären, warum etwas ein Fill ist, und der Nutzer weiß
nicht, was er gefahrlos überschreiben darf.

---

## 4. Verfahren

### 4.1 Fill — Wegeplanung als Graph

Heute: Sektionen, Greedy-Nachbarsuche, Wächter, der jedes Stichsegment prüft. Das hat uns
in dieser Sitzung 20 s Laufzeit, gebündelte Wege in Stegen und eine Dichtespitze von 44
eingebracht.

Neu, wie Ink/Stitch es löst [A/B]: Die Reihenenden bilden einen **Graphen**; Kanten sind
Reihen (müssen gestickt werden) und mögliche Wege (dürfen benutzt werden). Gesucht ist ein
Weg, der jede Reihe genau einmal nimmt — ein Eulerpfad auf dem um Wegkanten ergänzten
Graphen. Das ersetzt Greedy **und** Wächter: Wege, die nicht im Graphen sind, entstehen gar
nicht erst.

`underpath` als Objektparameter (Ink/Stitch-Default `True`): Wege laufen innerhalb der Form
unter der Deckschicht. Ab Reihenabstand > 0,9 mm automatisch auf Kantenweg umschalten [B].

### 4.2 Unterlage nach Regel statt pauschal

Der größte Hebel für die Stichzahl (§1.3). Als Funktion der Geometrie, Schwellen aus dem
Style:

```
Satin, Breite w:      w < 2 mm      → centerWalk
                      2 ≤ w < 5 mm  → edgeWalk
                      w ≥ 5 mm      → zigzag + edgeWalk   (in dieser Reihenfolge)

Fill, Fläche a:       a < 30 mm²    → edgeWalk
                      30 ≤ a < 400  → edgeWalk + fill(90°, 3 × rowSpacing)
                      a ≥ 400 mm²   → edgeWalk + fill(±45°, 3 × rowSpacing)
```

Die Schwellen sind aus der Recherche (§2.2) und v2; sie gehören gegen das Archiv geprüft,
sobald die Klassifikation Unterlagen von Deckstichen trennt.

### 4.3 Satin

- **Ecken**: Winkel messen, unter 60° Gehrung, unter 30° Kappe, sonst Übergang.
- **Split** mit gestaffelten, gestreuten Einstichen statt fester Teilung.
- **Kurzstiche** am Einstichabstand (0,25 mm) mit gestaffeltem Rückversatz.
- **Zugausgleich** additiv (§3.2).
- **Auto-Spacing** nach Breite — erst nachdem das Archiv gezeigt hat, ob es das hergibt.

### 4.4 Reihenfolge und Verbindungen

`Branching` als eigener Schritt: berührende Objekte gleicher Farbe werden zu **einem**
Stickweg ohne Trim zusammengefasst, Rückwege verdeckt geführt [B, Wilcom: „Objects are
resequenced, connectors minimized, and stitches regenerated"]. Unsere `sequence`-Krücke wird
dadurch überflüssig.

---

## 5. Architektur

```
packages/kernel     Punkt, Polylinie, Polygon, Transformation, Einheiten
packages/geom       Boolesche Ops, Offset, Skelett, Sichtbarkeit, Resampling
packages/model      Dokument, Objekte, Gruppen, Styles, Serialisierung, Migration
packages/stitch     Ein Ordner je Stichtyp: run/, satin/, fill/, text/
packages/plan       Pipeline als Stufenregister + Invarianten-Prüfer
packages/formats    DST, EXP/PES später, Stichplan-JSON, Dokumentformat
packages/render     Canvas / SVG / PNG
apps/studio         Der Arbeitsplatz
apps/cli            Batch: Ordner rein, DST + Bericht raus
```

Drei Änderungen tragen den Gewinn:

1. **`model` trennt Dokument von Rechnung** — heute hängen `formats` und `render` am Motor,
   obwohl sie nur Typen brauchen.
2. **`plan` macht die Pipeline zu Daten**: jede Stufe ein Objekt mit Namen, Ein- und Ausgabe
   und **den Zusagen, die sie hält**. Nach der letzten Stufe prüft ein Prüfer alle Zusagen.
   Heute mutieren vier Stufen dieselbe Blockliste per `splice` mit von Hand korrigierten
   Laufindizes — die fragilste Stelle im Repo und die, die zuletzt dreimal nachgebessert
   wurde.
3. **`stitch` je Typ ein Ordner** statt 22 flacher Dateien mit `export *`.

**Zur Geometrie:** Die Bestandsaufnahme bewertet `packages/geometry` als den tragfähigsten
Teil (eigene Delaunay, Kantenindex, anisotroper Offset, 995 Zeilen Tests). Der Neubau
übernimmt die **Verfahren** und macht nur die **Form** neu, mit den bestehenden Tests als
Abnahme. Sonst werden Fehler ein zweites Mal bezahlt, die schon bezahlt sind — die
Fehlermuster 1 (Geometrie an Rändern) und 4 (klein grün, echt rot) sitzen genau dort.

---

## 6. Qualitätstor: der Profi-Index

Jeder Lauf wird gegen die Archiv-Verteilung **seiner Größenklasse** gemessen. Schwellen aus
meiner Nachrechnung (v2 hatte strengere Werte, die die eigene Praxis nicht hergibt — p90 der
Dichtemaxima ist 24, nicht 22):

| Kennzahl        | grün             | gelb         | rot     |
| --------------- | ---------------- | ------------ | ------- |
| Stiche/mm² BBox | ≤ p75 der Klasse | ≤ p90        | darüber |
| Dichte max      | ≤ 18 (p75)       | ≤ 24 (p90)   | darüber |
| Zellen > 18/mm² | ≤ 0,5 %          | ≤ 1 %        | darüber |
| Trims/1.000     | ≤ 3,7 (p75)      | ≤ 5,6 (p90)  | darüber |
| Sprünge/1.000   | ≤ 13 (p75)       | ≤ 19 (p90)   | darüber |
| Farbwechsel     | ≤ Farben + 1     | ≤ Farben + 3 | darüber |

Der Index läuft in `analyze()`, steht in der Demo-Ausgabe und später im Editor. Freigabe:
alles grün, oder gelb mit Begründung.

### Invarianten-Prüfer

Die harten Zusagen (kein Stich > 1,5 × Stichlänge, kein ungetrimmter Sprung > 5 mm über
blankem Stoff, Mindeststichlänge, Dichte, Determinismus, byte-identisches DST) laufen als
**eine** Prüfung über jedes Ergebnis, nach der letzten Stufe. Damit wäre der Fehler von
heute beim Erzeugen aufgefallen und nicht am Bild.

### Bildvergleich

Jedes Testmotiv rendert ein PNG; Abweichung gegen das hinterlegte Bild schlägt fehl. Die
hohlen Buchstaben wären ein Diff gewesen.

---

## 7. Phasen

| Phase        | Inhalt                                                                                                               | Abnahme                                                                     |
| ------------ | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| **0**        | Regression (Zugausgleich-Boden) raus, Reisestichlänge 3,0 → 2,0 und Fill-Stichlänge 4,0 → 3,2 zurücknehmen           | Buchstaben massiv, sechs Läufe gemessen                                     |
| **1**        | Archiv ins Repo, Profi-Index, Invarianten-Prüfer, Bildvergleich, Auto-Underlay-Regel, Verriegelung nach Archivmuster | Alle sechs Motive grün/gelb; Stichzahl STUTTGART halbiert; Probestick Piqué |
| **2**        | `model` + Dokumentformat + Gruppen + Styles mit Beleg                                                                | Design speichern, laden, Runde drehen                                       |
| **3**        | `plan` als Stufenregister; Fill-Wegeplanung als Graph                                                                | Laufzeit < 2 s je Motiv, Dichte im Index grün                               |
| **4**        | Satin: Ecken, Split mit Streuung, Kurzstiche am Einstichabstand, additive Kompensation                               | Probestick 2                                                                |
| **5**        | `apps/studio`: drei Ansichten, Objektliste, Parameter, Undo, Stitch Player                                           | Ein Kundenlogo vollständig am Bildschirm gepuncht                           |
| **6**        | Werkzeuge: Rails/Sprossen, SatinB, SatinPath, Branching, Text auf Bogen                                              | Puncher arbeitet zwei Wochen nur damit                                      |
| **7**        | Automatik: Import-Regeln, Auto-Satin mit Fix Gap, Auto-Order                                                         | 20 Kundenlogos importiert, Nacharbeitszeit gemessen                         |
| **8**        | TexOS: Design am Auftrag, Kalkulation, Freigabe, Stichbericht                                                        | Angebot aus Logo in unter fünf Minuten                                      |
| **parallel** | Golden Files (5 Vorlagen), Fonts (15–20 Schriften)                                                                   | Stichzahl ±15 % zum Puncher                                                 |
| **später**   | FillGuided (Complex Turning)                                                                                         | Pferd ohne Nacharbeit                                                       |

---

## 8. Zu entscheiden

1. **Archiv ins Repo** unter `test-data/archive/`, Dateinamen anonymisiert? (v2 §6.1)
2. **Vorlagen der fünf Motive** — wer sucht sie in TexOS oder beim Puncher? (v2 §6.2)
3. **Phase 1 vor Editor** bestätigen. (v2 §6.3)
4. **Satin bis 10 mm mit Warnung** statt hartem Limit 7? Das Archiv zeigt Breiten bis 7,5 mm
   — die 10 mm sind Fachliteratur, nicht Hauspraxis. (v2 §6.4)
5. **Push-Kompensation**: längs (Praxis, verkürzt die Enden) statt quer (unsere heutige
   Definition)? Das ist eine echte Spec-Änderung an §8.1.1.
6. **Mindeststichlänge 0,6 → 1,0 mm**? Die Praxis begründet 1,0 physikalisch über den
   Nadeldurchmesser. Unsere 0,6 war nötig, um den Reihenwechsel im Tatami nicht abzuräumen —
   mit der Graph-Wegeplanung (§4.1) entfällt dieser Grund.
7. **Reihenabstand**: bei 0,40 bleiben (Archiv-Median 0,43) statt auf 0,36 zu senken, wie v2
   vorschlägt? Meine Nachrechnung stützt v2 hier nicht.
