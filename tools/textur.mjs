/**
 * Die Textur-Bereinigung in der Ausgabe (docs/Engine-Spezifikation.md §5.3): was `importShapes` an der
 * Vorlage bereinigt hat, mit Zahlen — die Bereinigung ist keine stille Reparatur (Regel 8). Gerechnet
 * wird in packages/engine/src/import/texture.ts; hier steht, wie der Bericht gelesen wird. Zahlen
 * mit Punkt, wie in den übrigen Werkzeugen.
 */

/** Ein Maß mit drei gültigen Stellen, ohne Nachkomma-Nullen: „0.117“, „9.4“, „126“. */
const zahl = (value) => String(Number(value.toPrecision(3)));

/** Wie viele Kennungen eine Zeile höchstens nennt. */
const KENNUNGEN_MAX = 5;

const kennungen = (ids) =>
  ids.length <= KENNUNGEN_MAX
    ? ids.join(", ")
    : `${ids.slice(0, KENNUNGEN_MAX).join(", ")} … und ${ids.length - KENNUNGEN_MAX} weitere`;

/**
 * Die Zeilen unter „Textur (Spec §5.3)“ für den Bericht einer Bereinigung (`ImportShapesResult.texture`):
 * die Formen mit Textur und der Beleg, die gefüllten Löcher, die verworfenen Teile, die Splitter. Wo
 * nichts bereinigt wurde, eine einzige Zeile, die das sagt — damit die Prüfung in der Ausgabe zu sehen
 * ist. Ohne Bericht (die Bereinigung war aus) keine Zeile. `bestelltMm` ist die bestellte Breite: ist
 * die Vorlage in einer anderen Größe gelesen (Faktor ≠ 1), nennt die Überschrift beide, und die
 * Schwellen stehen so, wie sie in dieser Größe gelten.
 */
export function texturZeilen(bericht, { bestelltMm } = {}) {
  if (bericht === undefined) return [];
  const { scale, limits: g } = bericht;
  const geleseneMm = bestelltMm > 0 ? bestelltMm * scale : undefined;
  const kopf =
    geleseneMm !== undefined && Math.abs(scale - 1) > 1e-9
      ? `Textur (Spec §5.3) in ${zahl(geleseneMm)} mm, bestellt ${zahl(bestelltMm)} mm (Faktor ${scale.toFixed(2)})`
      : "Textur (Spec §5.3)";
  const formen = bericht.textured.length;
  const geloescht = bericht.holes.filled + bericht.specks.dropped + bericht.splinters.merged;
  if (formen === 0 && geloescht === 0) {
    return [kopf, "  keine Textur gefunden, nichts bereinigt"];
  }
  const zeilen = [kopf];
  if (formen > 0) {
    const koerner = bericht.textured.map((t) => t.grains);
    zeilen.push(
      `  ${formen} ${formen === 1 ? "Form" : "Formen"} mit Textur (mindestens 3 Löcher von ` +
        `${zahl(g.evidenceMinMm2)} bis unter ${zahl(g.evidenceMaxMm2)} mm², je ${Math.min(...koerner)} bis ` +
        `${Math.max(...koerner)}): ${kennungen(bericht.textured.map((t) => t.id))}`,
    );
    zeilen.push(
      `  ${bericht.holes.filled} Löcher unter ${zahl(g.holeMaxMm2)} mm² in ihnen gefüllt ` +
        `(zusammen ${zahl(bericht.holes.areaMm2)} mm²)`,
    );
  }
  if (bericht.specks.dropped > 0) {
    zeilen.push(
      `  ${bericht.specks.dropped} ${bericht.specks.dropped === 1 ? "Teil" : "Teile"} unter ` +
        `${zahl(g.speckMm2)} mm² verworfen (zusammen ${zahl(bericht.specks.areaMm2)} mm², das größte ` +
        `${zahl(bericht.specks.largestMm2)} mm²)`,
    );
  }
  if (bericht.splinters.merged > 0) {
    zeilen.push(
      `  ${bericht.splinters.merged} Splitter ` +
        `(bis ${zahl(g.splinterMaxMm2)} mm², Abstand bis ${zahl(g.reachMm)} mm) in ihre Form geschlossen ` +
        `(zusammen ${zahl(bericht.splinters.areaMm2)} mm²): ` +
        kennungen(bericht.splinters.into.map((i) => `${i.merged.length}× in ${i.id}`)),
    );
  }
  return zeilen;
}
