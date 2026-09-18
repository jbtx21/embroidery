# Umsetzungsstand

Stand: 18.09.2026. Gegenstück zu `engine-spezifikation.md` — Kapitel für Kapitel,
was steht, was bewusst abweicht und was fehlt.

## Gebaut

| Kap. | Inhalt | Wo |
|---|---|---|
| 3 | Datenmodell, Stichplan, Kennzahlen, Warnungen | `engine/src/types.ts` |
| 4 | Pipeline validate → expand → order → generate → connect → tie → post → analyze, Objekt-Cache über stabilen Hash | `engine/src/pipeline.ts`, `hash.ts` |
| 5 | Flachung, Douglas-Peucker, Resampling mit Eckenerhalt, Offset, Mengenoperationen, Scanline-Schnitt, Bogenlänge, `insideTravel` | `geometry/src/*` |
| 6 | Laufstich, Bean Stitch, geschlossene Pfade | `engine/src/running.ts` |
| 7.1–7.6 | Satin: Paarung, Sprossen, Zugausgleich, Zickzack, Split-Satin, Kurzstiche, Unterlage | `engine/src/satin.ts` |
| 8 | Fill: Scanlines, Sektionsgraph, Serpentine auf festem Raster, Reisewege innerhalb der Form, Unterlage contour/single/double | `engine/src/fill.ts` |
| 9 | Textsatz auf Grundlinie und auf Pfad, Kerning, Mindesthöhe — gegen das **Schriftformat** | `engine/src/expand.ts`, `font.ts` |
| 10 | Reihenfolge-Vorschlag, Verbindungsregeln, Verriegelung | `engine/src/order.ts`, `connect.ts`, `tie.ts` |
| 11 | Ministiche entfernen, lange Bewegungen teilen, Kennzahlen, Dichte, Warnungen | `engine/src/post.ts`, `analyze.ts` |
| 12 | Canvas-2D-Renderer, Modi Faden/Linien/Punkte, Sequenz-Regler, Batching je Farbe | `render/src/render.ts` |
| — | SVG-Vorschau aus derselben Zerlegung, plus `pnpm vorschau` | `render/src/svg.ts`, `tools/vorschau.mjs` |
| 13.1 | DST-Writer und -Reader | `formats/src/dst.ts` |
| 14 | Presets Piqué/Softshell/Fleece/Cap/Frottee, Maschinenprofile | `engine/src/presets.ts` |
| 15 | Unit-Tests, DST-Roundtrip, pyembroidery-Kreuzprüfung, Benchmarks | `**/*.test.ts` |

## Dokumentierte Abweichungen

**DST-Header-Füllung (Kap. 13.1).** Die Spezifikation sagt „mit `0x1A` gefüllt".
Umgesetzt ist: `0x1A` als Abschluss, danach `0x20` bis Byte 512. Grund ist Kap. 13.2 —
byte-identische Ausgabe gegen pyembroidery — und pyembroidery füllt mit Leerzeichen.
Beides gleichzeitig geht nicht; die Kreuzprüfung ist das schärfere Kriterium, weil sie
in der CI misst statt zu beschreiben.

**Zentrierung und führende Sprünge beim Export.** Steht nicht in Kap. 13, ist aber
nötig: die Maschine startet im Nullpunkt, also ist der Weg dorthin selbst ein Delta und
unterliegt dem 121-Einheiten-Limit. `writeDst` zentriert das Motiv (abschaltbar über
`center: false`) und fährt den Weg zum ersten Stich als Sprungfolge. Ohne das schlägt
jeder Export eines Motivs fehl, das weiter als 12,1 mm vom Ursprung beginnt.

**`Stitch.tie`.** Kap. 3 kennt nur `{x, y, cmd}`. Ergänzt ist ein optionales
`tie?: true`. Die Nachbearbeitung entfernt Stiche unter 0,3 mm (Kap. 11) und würde
sonst genau die Verriegelung wegwerfen, die Kap. 10.3 verlangt — die ist per Definition
0,3 mm kurz.

**Rundung im DST-Writer.** `roundHalfEven` statt `Math.round`: Python rundet die Hälfte
zur geraden Zahl. Bei Reihenabstand 0,25 mm liegt jede zweite Koordinate genau auf der
halben DST-Einheit, und ohne gleiches Rundungsverhalten ist die Datei nicht
byte-identisch.

**SVG-Vorschau.** Kap. 12 kennt nur Canvas. Ergänzt ist eine SVG-Ausgabe über dieselbe
Zerlegung — sie zeigt also dasselbe. Ohne sie gäbe es bis zum Editor keine Möglichkeit,
eine Änderung an der Engine anzusehen; das ist zu lange blind.

**`reverse` beim Satin** ist als „Spalte vom anderen Ende her sticken" umgesetzt.
Kap. 7 legt die Bedeutung nicht fest; gegen Verdrehen sind die Sprossen da.

## Offen

| Kap. | Was fehlt | Warum |
|---|---|---|
| 5, 7.7 | `medialAxis` und damit Auto-Satin | Eigener Algorithmus (Voronoi der Kontur, Zweige schneiden). Die Spezifikation setzt ihn selbst auf Woche 4; die Pipeline kommt ohne ihn aus, Satin-Objekte entstehen bis dahin im Editor. |
| 2, 9 | `packages/fonts`: Ink/Stitch-Konverter und echte Schriftdaten | Braucht die Ink/Stitch-SVG-Fonts als Eingabe. **Das Format steht** (`engine/src/font.ts`), Satz und Kerning sind gebaut und getestet — es fehlen die Daten, nicht die Logik. |
| 13.2 | PES, JEF, VP3, EXP | Laufen über `apps/api` (Python, pyembroidery). Das neutrale JSON dorthin ist da. |
| 13.3 | Stichbericht als PDF | Von der Spezifikation selbst auf „später" gesetzt. |
| 2 | `apps/editor`, `apps/api` | Nicht Teil der Engine. |
| 15 | Golden Files aus Phase 0 | Die Phase-0-SVGs und -DSTs liegen nicht vor. Der Vergleichsrahmen steht in `test-data/phase0/README.md`; sobald die Dateien da sind, ist es ein Test, kein Umbau. |

## Was die Tests wirklich prüfen

- **Kreuzprüfung Kap. 13.2** ist echt: dieselbe Stichliste geht durch unseren Writer und
  durch pyembroidery, verglichen wird Byte für Byte — Header inklusive. Vier Fälle,
  darunter ein voller Stichplan und krumme Koordinaten auf halben Einheiten.
- **DST-Roundtrip Kap. 15**: schreiben → lesen → schreiben, byte-identisch. Der Reader
  sammelt das Trim-Signal (drei Sprünge mit Summe null) wieder zu einem Trim ein, sonst
  stimmte die Datensatzzahl im Header nicht.
- **Benchmarks Kap. 15**: Logo mit gut 9.000 Stichen unter 300 ms, einzelnes Objekt
  unter 100 ms.
- **Benchmark Kap. 12** misst nur unseren Anteil (Zerlegung und Zeichenaufrufe) gegen
  eine Attrappe, nicht echtes Canvas. Die 16-ms-Zusage gehört in den Editor gemessen.
