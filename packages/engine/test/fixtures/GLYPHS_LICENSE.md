# Herkunft und Lizenz von `glyphs.ts`

Die Blockbuchstaben-Fixtures in `glyphs.ts` (T, L, E, H, A, K, O, S, X, B, R, 4, 8) sind
Konturen aus der Schrift **DejaVu Sans Bold**, offline mit `fontTools` extrahiert, auf
Millimeter skaliert (Versalhöhe ≈ 10 mm) und mit dem Clipper2-Build dieses Repos
(`normalizePolygon`) auf saubere Kontur/Loch-Zuordnung normiert. Es werden nur die
resultierenden Zahlenwerte (Polygon-Koordinaten) übernommen — kein Font-Binary, kein
Font-Code.

Das Extraktionsskript selbst ist Werkzeug, kein Bestandteil der Engine, und liegt nicht in
diesem Repo (Scratchpad der Session). Zum Regenerieren: Konturen je Zeichen mit
`fontTools.pens.recordingPen` aus `/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf`
lesen, quadratische Kurven auf 0,03 mm flachen, y gemäß SVG-Konvention nach unten spiegeln,
je Zeichen mit `normalizePolygon` (siehe `packages/geometry/src/boolean.ts`) auf ein
einzelnes `Polygon` (Außenring + Löcher) reduzieren.

## Lizenz der Schrift (Bitstream Vera / DejaVu, permissiv)

DejaVu fonts, Copyright (c) 2003 by Bitstream, Inc. Alle Rechte vorbehalten. Bitstream Vera
ist eine Marke von Bitstream, Inc. Die DejaVu-Änderungen sind Public Domain.

> Permission is hereby granted, free of charge, to any person obtaining a copy of the fonts
> accompanying this license ("Fonts") and associated documentation files (the "Font
> Software"), to reproduce and distribute the Font Software, including without limitation
> the rights to use, copy, merge, publish, distribute, and/or sell copies of the Font
> Software, and to permit persons to whom the Font Software is furnished to do so, subject
> to the following conditions: the above copyright and trademark notices and this
> permission notice shall be included in all copies of one or more of the Font Software
> typefaces. […] THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
> EXPRESS OR IMPLIED […].

Volltext: `https://dejavu-fonts.github.io/License.html`. Diese Fixture-Datei enthält keine
Kopie der Schrift selbst (kein `.ttf`), nur abgeleitete Zahlenwerte — die Bedingungen oben
sind trotzdem der Vollständigkeit halber genannt, weil die Formen aus der Schrift stammen.
