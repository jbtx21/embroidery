# Backlog

Was auffiel, aber nicht in den laufenden Meilenstein gehört (CLAUDE.md, Arbeitsweise).
Neue Einträge oben in den passenden Abschnitt.

## Wartet auf Zulieferung

- **Phase-0-Motive** (§15, §16 Abnahme Woche 1): `test-data/phase0/` enthält nur die
  README. Ohne je ein SVG und die zugehörige Ink/Stitch-DST laufen weder der
  Golden-File-Vergleich noch die Abnahme der Woche. Der Rahmen steht und greift
  (`test/golden.test.ts`, Vergleichslogik eigens geprüft) — es fehlen die Dateien.
- **Ink/Stitch-Schriften** (§9): keine Fontdateien im Repo. Der Konverter
  (`packages/fonts/src/import-inkstitch.ts`) ist bewusst noch ein Stub: die genaue
  Struktur der Ink/Stitch-SVG-Fonts lässt sich hier nicht aus erster Hand prüfen
  (inkstitch.org und GitHub sind aus dieser Umgebung nicht erreichbar, nur die
  npm-Registry). Ihn ohne eine echte Datei zu schreiben hieße raten — dagegen steht
  CLAUDE.md, Arbeitsweise. Sobald eine Schrift abgelegt ist, ist es eine überschaubare
  Sitzung.

## Entschieden am 19.09.2026

- **Vorgriff auf spätere Wochen bleibt.** Satin (§7.1–7.6), Fill (§8),
  Reihenfolge/Laufstich-Verbindung (§10.1, §10.2) und Textsatz (§9) sind gebaut und
  getestet. Sie bleiben im Code und gelten ab jetzt als regulärer Bestand, nicht als
  Vorgriff. Ab hier gilt „keine Features außerhalb des Meilensteins" wieder.
- **DST-Header-Füllung**: `0x1A` als Abschluss, danach `0x20` bis Byte 512. In §13.1
  eingetragen.
- **Zentrierung auf die Bounding-Box-Mitte** und **Nullpunkt-Anfahrt als Sprungfolge**:
  in §13.1 eingetragen.
- **`roundHalfEven`**: in §11 als allgemeine Rundungsregel eingetragen.
- **`Stitch.tie`**: in §3 eingetragen.
- **`SHAPE_SPLIT`**: neue Warnung mit Teilanzahl, wenn eine Fläche beim Normieren
  zerfällt. In §11 eingetragen, in `validate.ts` umgesetzt.

## Offene Punkte aus der Spec

- **`medialAxis` und Auto-Satin** (§5, §7.7): Stub mit TODO in
  `packages/geometry/src/medial-axis.ts`. Woche 4.
- **PES, JEF, VP3, EXP** (§13.2): laufen über `apps/api` (Python, pyembroidery). Das
  neutrale JSON dorthin ist da.
- **Stichbericht als PDF** (§13.3): von der Spec selbst auf „später" gesetzt.
- **`apps/editor`, `apps/api`** (§2): noch nicht begonnen.
- **Asymmetrischer Zugausgleich, Contour/Guided Fill, Applikation, 3D-Puff** (§17):
  Phase 3 oder nicht geplant.

## Abweichungen, die noch eine Spec-Entscheidung brauchen

- **`reverse` beim Satin** ist als „Spalte vom anderen Ende her sticken" umgesetzt. §7
  legt die Bedeutung nicht fest; gegen Verdrehen sind die Sprossen da.

## Werkzeug

- `printWidth` in Prettier steht auf 100 statt der Voreinstellung 80. Geometriecode mit
  vier Koordinaten je Zeile wird bei 80 unleserlich. Sonst Standardkonfiguration.
- SVG-Vorschau (`renderPlanSvg`) ist eine Zugabe zu §12, das nur Canvas nennt. Sie nutzt
  dieselbe Zerlegung, zeigt also dasselbe, und macht Bilddiffs in der CI möglich.
