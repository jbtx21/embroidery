# Backlog

Was auffiel, aber nicht in den laufenden Meilenstein gehört (CLAUDE.md, Arbeitsweise).
Neue Einträge oben in den passenden Abschnitt.

## Vorgriff auf spätere Wochen — Entscheidung offen

Vor dem Eintreffen von `CLAUDE.md` und dem Wochenplan wurde in einem Zug mehr gebaut
als Woche 1 vorsieht. Der Code ist getestet und grün, steht aber gegen die Regel
„keine Features außerhalb des aktuellen Meilensteins":

| Bereich                                                               | Spec                 | Zustand                     |
| --------------------------------------------------------------------- | -------------------- | --------------------------- |
| Satin (Paarung, Sprossen, Zugausgleich, Split, Kurzstiche, Unterlage) | §7.1–7.6             | fertig, 19 Tests            |
| Fill (Sektionsgraph, Serpentine, Reisewege, Unterlage)                | §8                   | fertig, 19 Tests            |
| Reihenfolge-Vorschlag, Laufstich-Verbindung                           | §10.1, §10.2 Zeile 2 | fertig                      |
| Textsatz gegen das Schriftformat                                      | §9                   | fertig, Schriftdaten fehlen |

**Zu entscheiden:** behalten und als Vorgriff führen, oder auf Woche 1 zurückbauen und
in einem Branch parken. Bis dahin bleibt es drin — getesteten Code wegzuwerfen ist die
teurere Richtung, und `pipeline.ts` würde sonst `NOT_IMPLEMENTED` für Objekttypen melden,
die nachweislich funktionieren.

## Offene Punkte aus der Spec

- **`medialAxis` und Auto-Satin** (§5, §7.7): Stub mit TODO in
  `packages/geometry/src/medial-axis.ts`. Woche 4.
- **Ink/Stitch-Font-Konverter** (§9): Stub in `packages/fonts/src/import-inkstitch.ts`.
  Das JSON-Format steht, Satz und Kerning sind gebaut — es fehlen die SVG-Fonts.
- **PES, JEF, VP3, EXP** (§13.2): laufen über `apps/api` (Python, pyembroidery). Das
  neutrale JSON dorthin ist da.
- **Stichbericht als PDF** (§13.3): von der Spec selbst auf „später" gesetzt.
- **`apps/editor`, `apps/api`** (§2): noch nicht begonnen.
- **Asymmetrischer Zugausgleich, Contour/Guided Fill, Applikation, 3D-Puff** (§17):
  Phase 3 oder nicht geplant.

## Abweichungen, die eine Spec-Entscheidung brauchen

- **DST-Header-Füllung** (§13.1 gegen §13.2). §13.1 sagt „mit `0x1A` gefüllt", §13.2
  verlangt byte-identische Ausgabe gegen pyembroidery — und pyembroidery füllt nach dem
  `0x1A` mit `0x20`. Beides gleichzeitig geht nicht. Umgesetzt ist die pyembroidery-Form,
  weil die Kreuzprüfung in der CI misst statt zu beschreiben. **Frage an die Spec:** §13.1
  präzisieren?
- **Zentrierung und führende Sprünge beim Export.** Steht nicht in §13, ist aber nötig:
  die Maschine startet im Nullpunkt, also ist der Weg dorthin selbst ein Delta und
  unterliegt dem 121-Einheiten-Limit. Ohne das schlägt jeder Export eines Motivs fehl,
  das weiter als 12,1 mm vom Ursprung beginnt. **Frage an die Spec:** als §13.1-Absatz
  aufnehmen?
- **`Stitch.tie`.** §3 kennt nur `{x, y, cmd}`. Ergänzt ist ein optionales `tie?: true`,
  weil die Nachbearbeitung Stiche unter 0,3 mm entfernt (§11) und sonst genau die
  Verriegelung wegwirft, die §10.3 verlangt — die ist per Definition 0,3 mm kurz.
- **`reverse` beim Satin** ist als „Spalte vom anderen Ende her sticken" umgesetzt. §7
  legt die Bedeutung nicht fest.

## Werkzeug

- `printWidth` in Prettier steht auf 100 statt der Voreinstellung 80. Geometriecode mit
  vier Koordinaten je Zeile wird bei 80 unleserlich. Sonst Standardkonfiguration.
- SVG-Vorschau (`renderPlanSvg`) ist eine Zugabe zu §12, das nur Canvas nennt. Sie nutzt
  dieselbe Zerlegung, zeigt also dasselbe, und macht Bilddiffs in der CI möglich.
