/**
 * Satin (Kap. 7).
 *
 * Reihenfolge der Stufen: Rails normieren → Zugausgleich → Paarung (mit oder ohne
 * Sprossen) → Kurzstiche → Zickzack (mit Split) → Unterlage davor.
 */
import type { Point, Polygon, Polyline } from "@texma-stitch/geometry";
import {
  arcLength,
  cumulativeLengths,
  dedupe,
  dist,
  lerp,
  nearestPoint,
  offsetPolyline,
  pointAt,
  resample,
} from "@texma-stitch/geometry";
import type { SatinObject, Warning } from "./types.js";
import { warne, WARNUNG } from "./warnings.js";

/** Eine Sprosse: gepaarte Punkte auf Rail A und Rail B. */
export type SatinRung = { a: Point; b: Point };

export const SATIN_MIN_WIDTH_MM = 1.0;
export const SATIN_RUNNING_HINT_MM = 0.6;
export const SATIN_MAX_WIDTH_MM = 12.0;
/** Innenradius, unter dem Kurzstiche greifen (Kap. 7.5). */
export const SHORT_STITCH_RADIUS_MM = 1.0;
export const SHORT_STITCH_FACTOR = 0.7;
export const CENTER_UNDERLAY_STITCH_MM = 2.5;

// ---------------------------------------------------------------------------
// Sprossen und Paarung (Kap. 7.1)
// ---------------------------------------------------------------------------

/**
 * Bogenlaenge, bei der die Sprosse `seg` die Rail schneidet. Ohne echten
 * Schnittpunkt (die Sprosse endet kurz vor der Rail) faellt die Funktion auf die
 * Projektion des Sprossen-Mittelpunkts zurueck — der Editor zeichnet Sprossen mit
 * der Hand, da darf ein halber Millimeter fehlen.
 */
export function rungCutLength(rail: Polyline, seg: [Point, Point]): number {
  const cum = cumulativeLengths(rail);
  const [p, q] = seg;
  const rx = q.x - p.x;
  const ry = q.y - p.y;
  for (let i = 0; i + 1 < rail.length; i++) {
    const a = rail[i]!;
    const b = rail[i + 1]!;
    const sx = b.x - a.x;
    const sy = b.y - a.y;
    const denom = rx * sy - ry * sx;
    if (Math.abs(denom) < 1e-12) continue;
    const t = ((a.x - p.x) * sy - (a.y - p.y) * sx) / denom;
    const u = ((a.x - p.x) * ry - (a.y - p.y) * rx) / denom;
    if (t >= -1e-9 && t <= 1 + 1e-9 && u >= -1e-9 && u <= 1 + 1e-9) {
      return cum[i]! + u * Math.hypot(sx, sy);
    }
  }
  const mid: Point = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
  return nearestPoint(rail, mid, cum).length;
}

type Abschnitt = { a0: number; a1: number; b0: number; b1: number };

/** Rails anhand der Sprossen in Abschnitte teilen (Kap. 7.1). */
export function abschnitte(
  railA: Polyline,
  railB: Polyline,
  rungs: [Point, Point][],
): Abschnitt[] {
  const lenA = arcLength(railA);
  const lenB = arcLength(railB);
  if (rungs.length === 0) return [{ a0: 0, a1: lenA, b0: 0, b1: lenB }];

  const cuts = rungs
    .map((r) => ({ a: rungCutLength(railA, r), b: rungCutLength(railB, r) }))
    .sort((x, y) => x.a - y.a);

  const out: Abschnitt[] = [];
  let prevA = 0;
  let prevB = 0;
  for (const c of cuts) {
    // Sprossen genau am Rand oder solche, die die Reihenfolge auf Rail B
    // umkehren wuerden, ueberspringen — sonst entstehen Abschnitte mit
    // negativer Laenge und die Spalte verdreht sich genau dort, wo die Sprosse
    // das verhindern sollte.
    if (c.a - prevA < 1e-6 || c.b - prevB < 1e-6) continue;
    out.push({ a0: prevA, a1: c.a, b0: prevB, b1: c.b });
    prevA = c.a;
    prevB = c.b;
  }
  if (lenA - prevA > 1e-6 && lenB - prevB > 1e-6) {
    out.push({ a0: prevA, a1: lenA, b0: prevB, b1: lenB });
  }
  return out.length > 0 ? out : [{ a0: 0, a1: lenA, b0: 0, b1: lenB }];
}

/**
 * Paarung: innerhalb eines Abschnitts nach Bogenlaengen-Anteil. Die Zahl der
 * Sprossen richtet sich nach der LAENGEREN Seite, damit die Aussenkurve keine
 * Luecken bekommt (Kap. 7.3).
 */
export function pairRails(
  railA: Polyline,
  railB: Polyline,
  rungs: [Point, Point][],
  spacingMm: number,
): SatinRung[] {
  if (railA.length < 2 || railB.length < 2) return [];
  const cumA = cumulativeLengths(railA);
  const cumB = cumulativeLengths(railB);
  const spacing = Math.max(spacingMm, 0.05);

  const out: SatinRung[] = [];
  const parts = abschnitte(railA, railB, rungs);
  for (let s = 0; s < parts.length; s++) {
    const p = parts[s]!;
    const lenA = p.a1 - p.a0;
    const lenB = p.b1 - p.b0;
    const n = Math.max(1, Math.ceil(Math.max(lenA, lenB) / spacing));
    for (let j = s === 0 ? 0 : 1; j <= n; j++) {
      const f = j / n;
      out.push({
        a: pointAt(railA, p.a0 + lenA * f, cumA),
        b: pointAt(railB, p.b0 + lenB * f, cumB),
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Zugausgleich (Kap. 7.2)
// ---------------------------------------------------------------------------

/**
 * Beide Rails um `pullCompMm` senkrecht nach aussen versetzen. "Aussen" heisst:
 * weg von der anderen Rail — das Vorzeichen leitet sich aus der Lage der Spalte
 * ab, nicht aus der Zeichenrichtung.
 */
export function applyPullComp(
  railA: Polyline,
  railB: Polyline,
  pullCompMm: number,
): [Polyline, Polyline] {
  if (pullCompMm === 0) return [railA, railB];
  return [
    offsetPolyline(railA, pullCompMm * aussenVorzeichen(railA, railB)),
    offsetPolyline(railB, pullCompMm * aussenVorzeichen(railB, railA)),
  ];
}

/** +1, wenn die linke Normale von `self` von `other` weg zeigt, sonst -1. */
function aussenVorzeichen(self: Polyline, other: Polyline): number {
  const i = Math.floor(self.length / 2);
  const a = self[Math.max(0, i - 1)]!;
  const b = self[Math.min(self.length - 1, i + 1)]!;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l = Math.hypot(dx, dy);
  if (l < 1e-12) return 1;
  const nLeft = { x: dy / l, y: -dx / l };
  const self0 = self[i]!;
  const gegen = nearestPoint(other, self0).point;
  const zuAnderer = { x: gegen.x - self0.x, y: gegen.y - self0.y };
  return nLeft.x * zuAnderer.x + nLeft.y * zuAnderer.y > 0 ? -1 : 1;
}

// ---------------------------------------------------------------------------
// Kurzstiche (Kap. 7.5)
// ---------------------------------------------------------------------------

/**
 * In engen Kurven jeden zweiten Stich auf der Innenseite auf 70 % kuerzen.
 *
 * Der Innenradius wird ueber den Strahlensatz geschaetzt: laufen Aussen- und
 * Innenrail im selben Winkelschritt, verhalten sich ihre Schrittweiten wie
 * (r + w) zu r, also r = w * dInnen / (dAussen - dInnen).
 */
export function applyShortStitches(rungs: SatinRung[]): SatinRung[] {
  if (rungs.length < 2) return rungs;
  const out = rungs.map((r) => ({ a: { ...r.a }, b: { ...r.b } }));
  for (let i = 1; i < out.length; i++) {
    if (i % 2 === 0) continue; // nur jeder zweite Stich
    const cur = out[i]!;
    const prev = rungs[i - 1]!;
    const dA = dist(rungs[i]!.a, prev.a);
    const dB = dist(rungs[i]!.b, prev.b);
    const w = dist(cur.a, cur.b);
    if (w < 1e-9) continue;
    const dInnen = Math.min(dA, dB);
    const dAussen = Math.max(dA, dB);
    if (dAussen - dInnen < 1e-9) continue;
    const r = (w * dInnen) / (dAussen - dInnen);
    if (r >= SHORT_STITCH_RADIUS_MM) continue;
    if (dA < dB) cur.a = lerp(cur.a, cur.b, 1 - SHORT_STITCH_FACTOR);
    else cur.b = lerp(cur.b, cur.a, 1 - SHORT_STITCH_FACTOR);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Zickzack und Split-Satin (Kap. 7.3, 7.4)
// ---------------------------------------------------------------------------

/**
 * Punktfolge des Zickzacks: A, B, A, B … Jeder Schritt quert die Spalte, die
 * Einstiche auf derselben Rail liegen `spacingMm` auseinander.
 */
export function zigzagSequence(rungs: SatinRung[]): Point[] {
  const out: Point[] = [];
  for (const r of rungs) {
    out.push({ ...r.a }, { ...r.b });
  }
  return out;
}

/**
 * Split-Satin (Kap. 7.4): Querungen breiter als `maxWidthMm` in
 * `ceil(b / maxWidthMm)` Teilstiche zerlegen. Die Zwischenpunkte wandern je
 * Querung um ein Viertel weiter, damit keine Linie quer durch die Spalte
 * entsteht.
 */
export function splitWideStitches(seq: Point[], maxWidthMm: number, staggerRows = 4): Point[] {
  if (seq.length < 2 || maxWidthMm <= 0) return seq;
  const out: Point[] = [{ ...seq[0]! }];
  for (let i = 0; i + 1 < seq.length; i++) {
    const from = seq[i]!;
    const to = seq[i + 1]!;
    const w = dist(from, to);
    const k = Math.ceil(w / maxWidthMm);
    if (k > 1) {
      const versatz = (i % staggerRows) / staggerRows / k;
      for (let j = 1; j < k; j++) {
        const f = Math.min(0.999, Math.max(0.001, j / k + versatz));
        out.push(lerp(from, to, f));
      }
    }
    out.push({ ...to });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Unterlage (Kap. 7.6)
// ---------------------------------------------------------------------------

/** Mittellinie der Spalte: die Mittelpunkte der Sprossen. */
export const centerLine = (rungs: SatinRung[]): Polyline =>
  rungs.map((r) => lerp(r.a, r.b, 0.5));

/** Rail um `insetMm` nach innen (zur anderen Rail hin) versetzen. */
function inset(rail: Polyline, other: Polyline, insetMm: number): Polyline {
  if (insetMm === 0) return rail;
  return offsetPolyline(rail, -insetMm * aussenVorzeichen(rail, other));
}

/** Haengt `next` an `out` an — in der Richtung, die den kuerzeren Weg ergibt. */
function anhaengen(out: Point[], next: Point[]): void {
  if (next.length === 0) return;
  if (out.length === 0) {
    out.push(...next.map((p) => ({ ...p })));
    return;
  }
  const end = out[out.length - 1]!;
  const vorwaerts = dist(end, next[0]!) <= dist(end, next[next.length - 1]!);
  const folge = vorwaerts ? next : [...next].reverse();
  for (const p of folge) out.push({ ...p });
}

// ---------------------------------------------------------------------------
// Erzeugung
// ---------------------------------------------------------------------------

/** Umriss der Spalte — gebraucht fuer Verbindungen (Kap. 10.2) und Anzeige. */
export function satinOutline(railA: Polyline, railB: Polyline): Polygon {
  return { outer: [...railA.map((p) => ({ ...p })), ...[...railB].reverse().map((p) => ({ ...p }))], holes: [] };
}

export type SatinErgebnis = { stitches: Point[]; rungs: SatinRung[]; warnings: Warning[] };

export function generateSatin(obj: SatinObject): SatinErgebnis {
  const warnings: Warning[] = [];
  let railA = dedupe(obj.railA, 1e-6);
  let railB = dedupe(obj.railB, 1e-6);
  let rungs = obj.rungs;

  if (railA.length < 2 || railB.length < 2) {
    warnings.push(warne(WARNUNG.EMPTY_OBJECT, "Satin ohne zwei Rails.", "error", obj.id));
    return { stitches: [], rungs: [], warnings };
  }

  if (obj.reverse) {
    railA = [...railA].reverse();
    railB = [...railB].reverse();
    rungs = [...rungs].reverse();
  }

  const [compA, compB] = applyPullComp(railA, railB, obj.pullCompMm);
  let paare = pairRails(compA, compB, rungs, obj.spacingMm);
  if (paare.length === 0) {
    warnings.push(warne(WARNUNG.EMPTY_OBJECT, "Satin ergibt keine Sprossen.", "error", obj.id));
    return { stitches: [], rungs: [], warnings };
  }

  const breiten = paare.map((r) => dist(r.a, r.b));
  const minBreite = Math.min(...breiten);
  const maxBreite = Math.max(...breiten);
  if (minBreite < SATIN_RUNNING_HINT_MM) {
    warnings.push(
      warne(
        WARNUNG.SATIN_TOO_NARROW,
        `Spalte nur ${minBreite.toFixed(2)} mm breit — als Laufstich stricken.`,
        "warn",
        obj.id,
      ),
    );
  } else if (minBreite < SATIN_MIN_WIDTH_MM) {
    warnings.push(
      warne(
        WARNUNG.SATIN_TOO_NARROW,
        `Spalte nur ${minBreite.toFixed(2)} mm breit.`,
        "warn",
        obj.id,
      ),
    );
  }
  if (maxBreite > SATIN_MAX_WIDTH_MM) {
    warnings.push(
      warne(
        WARNUNG.SATIN_TOO_WIDE,
        `Spalte bis ${maxBreite.toFixed(1)} mm breit — als Flaeche stricken.`,
        "warn",
        obj.id,
      ),
    );
  }

  if (obj.shortStitches) paare = applyShortStitches(paare);

  const stitches: Point[] = [];

  // Unterlage: center → contour → zigzag (Kap. 7.6)
  if (obj.underlay.center) {
    const mitte = centerLine(paare);
    anhaengen(stitches, resample(mitte, CENTER_UNDERLAY_STITCH_MM, true));
  }
  if (obj.underlay.contour) {
    const innenA = inset(compA, compB, obj.underlay.insetMm);
    const innenB = inset(compB, compA, obj.underlay.insetMm);
    anhaengen(stitches, resample(innenA, CENTER_UNDERLAY_STITCH_MM, true));
    anhaengen(stitches, resample(innenB, CENTER_UNDERLAY_STITCH_MM, true));
  }
  if (obj.underlay.zigzag) {
    const innenA = inset(compA, compB, obj.underlay.insetMm);
    const innenB = inset(compB, compA, obj.underlay.insetMm);
    const grob = pairRails(innenA, innenB, rungs, obj.underlay.zigzagSpacingMm);
    anhaengen(stitches, splitWideStitches(zigzagSequence(grob), obj.maxWidthMm));
  }

  // Deckstiche
  const deck = splitWideStitches(zigzagSequence(paare), obj.maxWidthMm);
  anhaengen(stitches, deck);

  return { stitches: dedupe(stitches, 1e-6), rungs: paare, warnings };
}
