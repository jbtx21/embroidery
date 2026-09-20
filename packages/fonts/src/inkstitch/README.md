# Ink/Stitch-Schriften

Quelle: <https://github.com/inkstitch/embroidery-fonts>, Ordner `src/<name>/`.

Je Schrift liegen hier drei Dateien — 132 der 142 Schriften haben diesen
Aufbau, fünf legen statt `ltr.svg` einen Ordner `ltr/` mit einer Datei je
Glyph an (den liest der Konverter noch nicht, siehe `docs/backlog.md`):

| Datei       | Inhalt                                                                     |
| ----------- | -------------------------------------------------------------------------- |
| `font.json` | Name, Vorschübe (`horiz_adv_x`), `units_per_em`, `size` in mm, `min_scale` |
| `ltr.svg`   | die Glyphen, eine Inkscape-Ebene `GlyphLayer-X` je Zeichen                 |
| `LICENSE`   | die Lizenz genau dieser Schrift                                            |

`rtl.svg` liegt nicht hier — wir setzen nur von links nach rechts (§9).

## Lizenz prüfen, bevor eine Schrift dazukommt

Die Lizenzdatei gehört mit in den Ordner. Stand 20.09.2026 verteilen sich die
142 Schriften im Ink/Stitch-Repo so (`font_license` aus `font.json`):

| Lizenz                    | Anzahl | für TEXMA                                                |
| ------------------------- | -----: | -------------------------------------------------------- |
| SIL Open Font License 1.1 |    103 | in Ordnung, auch gewerblich                              |
| CC BY-SA 4.0 / 2.5        |     27 | in Ordnung, Share-alike beachten                         |
| Public Domain             |      3 | in Ordnung                                               |
| **CC BY-NC-SA 4.0**       |  **8** | **nicht gewerblich — für Kundenarbeit gesperrt**         |
| **CC BY-ND 4.0**          |  **1** | **keine Bearbeitung — die Umwandlung ins JSON ist eine** |

Die neun gesperrten: `flowery_crosses`, `flowery_multicolor`, `handkerchief`,
`ladies_present`, `magic_crosses`, `nautical`, `priscilla`, `very_crossy`
(alle NC) und `infinipicto` (ND). `fold_inkstitch` hat gar keine LICENSE-Datei.

TEXMA stickt gewerblich. Eine NC-Schrift auf einem Kundenteil ist ein
Lizenzverstoß, und der Datei sieht man das hinterher nicht an.

Gelesen wird das von `importInkstitchFont` (`../import-inkstitch.ts`).
