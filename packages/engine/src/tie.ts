/**
 * Verriegelung (Kap. 10.3).
 *
 * Nach jedem Trim/Farbwechsel und am Anfang: drei Stiche 0,3 mm vor/zurueck
 * entlang der ersten Stichrichtung. Vor jedem Trim und am Ende dasselbe
 * rueckwaerts. Bei Laufstich-Verbindungen bleibt die Verriegelung weg — dort
 * reisst der Faden nicht, weil er nicht getrennt wird.
 */
import type { Point } from "@texma-stitch/geometry";
import type { Stitch, StitchBlock } from "./types.js";

export const TIE_LENGTH_MM = 0.3;

const istKommando = (s: Stitch): boolean => s.cmd !== "stitch" && s.cmd !== "jump";

function richtung(von: Point, nach: Point): Point | undefined {
  const dx = nach.x - von.x;
  const dy = nach.y - von.y;
  const l = Math.hypot(dx, dy);
  if (l < 1e-9) return undefined;
  return { x: dx / l, y: dy / l };
}

const tieStich = (p: Point): Stitch => ({ x: p.x, y: p.y, cmd: "stitch", tie: true });

/** Drei kurze Stiche um `p` herum, entlang `dir`: q, p, q. */
function riegel(p: Point, dir: Point): Stitch[] {
  const q: Point = { x: p.x + dir.x * TIE_LENGTH_MM, y: p.y + dir.y * TIE_LENGTH_MM };
  return [tieStich(q), tieStich(p), tieStich(q)];
}

/**
 * Verriegelt die Bloecke an Ort und Stelle. Arbeitet auf einer Kopie und gibt
 * neue Bloecke zurueck — die Eingabe bleibt unberuehrt, damit der Objekt-Cache
 * (Kap. 4) nichts Verriegeltes zurueckbekommt.
 */
export function tieBlocks(blocks: StitchBlock[]): StitchBlock[] {
  const out: StitchBlock[] = blocks.map((b) => ({
    objectId: b.objectId,
    threadIndex: b.threadIndex,
    stitches: b.stitches.map((s) => ({ ...s })),
  }));

  // Ein Block braucht am Anfang eine Verriegelung, wenn er der erste ist oder
  // wenn davor getrennt bzw. die Farbe gewechselt wurde.
  let davorGetrennt = true;
  for (let bi = 0; bi < out.length; bi++) {
    const block = out[bi]!;
    const s = block.stitches;

    if (davorGetrennt && s.length >= 2) {
      // Anfangsposition ist der erste Eintrag (Stich oder Sprung); die Richtung
      // zeigt auf den naechsten echten Punkt.
      const p0 = s[0]!;
      const naechster = s.find((x, i) => i > 0 && !istKommando(x));
      const dir = naechster ? richtung(p0, naechster) : undefined;
      if (dir) s.splice(1, 0, ...riegel(p0, dir));
    }

    // Verriegelung vor Trim und vor `end`.
    for (let i = 0; i < s.length; i++) {
      const cur = s[i]!;
      if (cur.cmd !== "trim" && cur.cmd !== "end") continue;
      const vorher = s[i - 1];
      const davor = s[i - 2];
      if (!vorher || !davor) continue;
      const dir = richtung(vorher, davor);
      if (!dir) continue;
      const stiche = riegel(vorher, dir);
      s.splice(i, 0, ...stiche);
      // Trim/Farbwechsel/Ende sitzen dort, wo die Nadel jetzt steht.
      const letzte = stiche[stiche.length - 1]!;
      for (let k = i + stiche.length; k < s.length; k++) {
        const kmd = s[k]!;
        if (!istKommando(kmd)) break;
        s[k] = { ...kmd, x: letzte.x, y: letzte.y };
      }
      i += stiche.length;
    }

    const letzte = s[s.length - 1];
    davorGetrennt = letzte?.cmd === "trim" || letzte?.cmd === "color";
  }

  return out;
}
