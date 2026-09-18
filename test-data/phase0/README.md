# Golden Files aus Phase 0

Hier gehören die Ink/Stitch-SVGs und die daraus gestickten DST-Dateien aus Phase 0 hin —
je Motiv `name.svg` und `name.dst`.

Der Vergleich aus Kap. 15 läuft dann so:

1. SVG durch die Engine (Vektorisierung ist NICHT Teil der Engine — die Objekte kommen
   aus dem Editor oder aus einer Beschreibungsdatei `name.objects.json`).
2. Stichzahl gegen die Ink/Stitch-DST: Abweichung unter 10 %.
3. Bounding-Box: Abweichung unter 0,3 mm.
4. Renderbild-Diff: SSIM über 0,9.

Solange die Dateien fehlen, gibt es diesen Test nicht — und er wird nicht durch einen
schwächeren ersetzt, der nichts prüft.
