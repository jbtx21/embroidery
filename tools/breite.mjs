/**
 * `pnpm inkstitch <svg> --breite <mm>`: the motif scaled proportionally to a target
 * width, before anything is imported.
 *
 * The size of an SVG is `width` and `height` of the root element against its
 * viewBox (`unitScale` in packages/engine/src/import/svg.ts), so rewriting the two
 * makes the import read the drawing at the new size — and everything that depends
 * on the size (what §5.1 leaves out as too small, the flattening tolerance) is
 * decided at the size that is stitched, not at the one the file came in. Scaling
 * the shapes after the import would keep what was dropped at the smaller size
 * dropped.
 *
 * The width asked for is that of the drawing area, the `width` of the file; the
 * motif inside may be a little narrower (the size of the DST, printed at the end
 * of the run, says how much).
 */

/** The value of an attribute in one start tag, quotes of either kind. */
const attribute = (name) => new RegExp(`(?<=\\s)${name}\\s*=\\s*("[^"]*"|'[^']*')`);

/** A length in mm, four decimals at most and no trailing zeros. */
const mmText = (mm) => `${Number(mm.toFixed(4))}mm`;

/**
 * `svgText` scaled to `targetMm` wide. `widthMm` and `heightMm` are the size the
 * engine reads from the file (`importShapes`), in mm whatever unit the file says.
 * Returns the new text, the factor, and the size before and after.
 */
export function scaleSvgToWidth(svgText, targetMm, { widthMm, heightMm }) {
  if (!(targetMm > 0) || !Number.isFinite(targetMm)) {
    throw new Error(`Die Zielbreite muss eine positive Zahl in mm sein, nicht "${targetMm}"`);
  }
  if (!(widthMm > 0) || !(heightMm > 0)) {
    throw new Error(
      "Die SVG nennt keine Größe (width und height am Wurzelelement) — es gibt nichts, woran sich skalieren ließe",
    );
  }
  const tag = /<svg\b[^>]*>/.exec(svgText);
  if (!tag) throw new Error("kein <svg>-Starttag gefunden");
  if (!attribute("viewBox").test(tag[0])) {
    throw new Error(
      "Die SVG hat keine viewBox: ohne sie folgt die Zeichnung der Größe nicht, --breite braucht eine",
    );
  }

  const factor = targetMm / widthMm;
  const to = { widthMm: widthMm * factor, heightMm: heightMm * factor };
  let start = tag[0];
  for (const [name, mm] of [
    ["width", to.widthMm],
    ["height", to.heightMm],
  ]) {
    const found = attribute(name).exec(start);
    if (!found) throw new Error(`Das Wurzelelement hat kein ${name}`);
    const quote = found[1][0];
    start = start.replace(attribute(name), () => `${name}=${quote}${mmText(mm)}${quote}`);
  }
  return {
    text: svgText.replace(tag[0], () => start),
    factor,
    from: { widthMm, heightMm },
    to: { widthMm: Number(to.widthMm.toFixed(4)), heightMm: Number(to.heightMm.toFixed(4)) },
  };
}
