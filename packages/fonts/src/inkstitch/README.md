# Ink/Stitch-Schriften

Quelle: <https://github.com/inkstitch/embroidery-fonts>, Ordner `src/<name>/`.

Je Schrift liegen hier drei Dateien:

| Datei | Inhalt |
| --- | --- |
| `font.json` | Name, Vorschübe (`horiz_adv_x`), `units_per_em`, `size` in mm, `min_scale` |
| `ltr.svg` | die Glyphen, eine Inkscape-Ebene `GlyphLayer-X` je Zeichen |
| `LICENSE` | die Lizenz genau dieser Schrift |

`rtl.svg` liegt nicht hier — wir setzen nur von links nach rechts (§9).

**Lizenz prüfen, bevor eine Schrift dazukommt.** `caffeine_tiny` steht unter der
SIL Open Font License 1.1 und darf weitergegeben werden; nicht jede Schrift im
Ink/Stitch-Repo tut das. Die Lizenzdatei gehört mit in den Ordner.

Gelesen wird das von `importInkstitchFont` (`../import-inkstitch.ts`).
