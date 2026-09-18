/**
 * Verbindungen zwischen Bloecken (Kap. 10.2).
 *
 * | Bedingung                                             | Aktion               |
 * |-------------------------------------------------------|----------------------|
 * | Farbe unterschiedlich                                  | trim, color          |
 * | Distanz <= 3 mm und Weg liegt unter einem spaeteren     | Running-Verbindung   |
 * | Objekt derselben Farbe oder innerhalb von B             | (kein Trim)          |
 * | Distanz <= jumpTrimMm (5)                               | jump, kein Trim      |
 * | sonst                                                   | trim, jump           |
 *
 * `trimAfter` am Objekt uebersteuert: `always` immer Trim, `never` nie. Ein
 * Farbwechsel bleibt auch bei `never` ein Farbwechsel — nur der Trim entfaellt.
 */
import type { Point, Polygon } from "@texma-stitch/geometry";
import { dist, insideTravel, segmentInside } from "@texma-stitch/geometry";
import { runningStitches } from "./running.js";
import type { Stitch, StitchBlock, TrimAfter } from "./types.js";

export type ConnectOptions = {
  /** Bis hierher Sprung statt Trim. */
  jumpTrimMm: number;
  /** Bis hierher kommt eine Laufstich-Verbindung in Frage. */
  runningConnectMm: number;
  travelStitchMm: number;
};

export const CONNECT_STANDARD: ConnectOptions = {
  jumpTrimMm: 5,
  runningConnectMm: 3,
  travelStitchMm: 2.0,
};

export type RohBlock = {
  objectId: string;
  threadIndex: number;
  punkte: Point[];
  trimAfter: TrimAfter;
  /** Flaeche, die dieses Objekt abdeckt — fuer den Verdeckungstest. */
  deckung?: Polygon;
};

type Aktion = {
  trim: boolean;
  color: boolean;
  /** Punkte der Laufstich-Verbindung ohne den Startpunkt, sonst leer. */
  travel: Point[];
  jump: boolean;
};

/** Liegt der Weg unter einem spaeteren Objekt derselben Farbe oder in B? */
function verdeckt(
  von: Point,
  nach: Point,
  index: number,
  bloecke: RohBlock[],
  farbe: number,
): Polygon | undefined {
  for (let i = index; i < bloecke.length; i++) {
    const b = bloecke[i]!;
    if (b.threadIndex !== farbe) continue;
    if (!b.deckung) continue;
    if (segmentInside(b.deckung, von, nach)) return b.deckung;
  }
  return undefined;
}

export function entscheide(
  index: number,
  bloecke: RohBlock[],
  opts: ConnectOptions,
): Aktion {
  const a = bloecke[index]!;
  const b = bloecke[index + 1]!;
  const endA = a.punkte[a.punkte.length - 1]!;
  const startB = b.punkte[0]!;
  const d = dist(endA, startB);
  const farbwechsel = a.threadIndex !== b.threadIndex;

  if (farbwechsel) {
    return { trim: a.trimAfter !== "never", color: true, travel: [], jump: d > 1e-6 };
  }

  if (a.trimAfter === "always") {
    return { trim: true, color: false, travel: [], jump: d > 1e-6 };
  }

  if (d <= opts.runningConnectMm) {
    // Der Weg muss unter einem spaeteren Objekt derselben Farbe liegen (Index
    // index+1 schliesst B selbst ein — "innerhalb von B" ist derselbe Test).
    const flaeche = verdeckt(endA, startB, index + 1, bloecke, a.threadIndex);
    if (flaeche) {
      const weg = insideTravel(flaeche, endA, startB);
      const gestochen = runningStitches(weg, { stitchLengthMm: opts.travelStitchMm });
      return { trim: false, color: false, travel: gestochen.slice(1), jump: false };
    }
  }

  if (d <= opts.jumpTrimMm) {
    return { trim: false, color: false, travel: [], jump: d > 1e-6 };
  }

  return { trim: a.trimAfter !== "never", color: false, travel: [], jump: d > 1e-6 };
}

const stich = (p: Point): Stitch => ({ x: p.x, y: p.y, cmd: "stitch" });

/**
 * Rohe Punktbloecke zu Stichbloecken mit Kommandos. Trim und Farbwechsel haengen
 * am Ende von Block A, Sprung und Laufstich-Verbindung am Anfang von Block B —
 * so wie die Maschine sie abarbeitet.
 */
export function connectBlocks(
  rohe: RohBlock[],
  opts: ConnectOptions = CONNECT_STANDARD,
): StitchBlock[] {
  const gefuellt = rohe.filter((b) => b.punkte.length > 0);
  if (gefuellt.length === 0) return [];

  const out: StitchBlock[] = gefuellt.map((b) => ({
    objectId: b.objectId,
    threadIndex: b.threadIndex,
    stitches: b.punkte.map(stich),
  }));

  for (let i = 0; i + 1 < gefuellt.length; i++) {
    const aktion = entscheide(i, gefuellt, opts);
    const a = out[i]!;
    const b = out[i + 1]!;
    const endA = a.stitches[a.stitches.length - 1]!;

    if (aktion.trim) a.stitches.push({ x: endA.x, y: endA.y, cmd: "trim" });
    if (aktion.color) a.stitches.push({ x: endA.x, y: endA.y, cmd: "color" });

    if (aktion.travel.length > 0) {
      // Der letzte Reisepunkt IST der Blockanfang — den doppelten verwerfen.
      b.stitches.splice(0, 1, ...aktion.travel.map(stich));
    } else if (aktion.jump) {
      const erster = b.stitches[0]!;
      b.stitches[0] = { x: erster.x, y: erster.y, cmd: "jump" };
    }
  }

  // Abschluss: `end` an der letzten Position.
  const letzter = out[out.length - 1]!;
  const letzte = letzter.stitches[letzter.stitches.length - 1]!;
  letzter.stitches.push({ x: letzte.x, y: letzte.y, cmd: "end" });
  return out;
}
