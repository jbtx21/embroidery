/**
 * Flaechenstich (Kap. 8).
 *
 * Reihen liegen nach dem Drehen waagerecht. Das Raster fuer Reihen UND Versatz
 * ist absolut (Vielfache von Reihenabstand bzw. Stichlaenge ab dem Ursprung) —
 * sonst wandert der Versatz mit dem Segmentanfang und die Stichreihen bilden
 * sichtbare Linien (Kap. 8.4).
 */
import type { Point, Polygon } from "@texma-stitch/geometry";
import {
  clipHorizontal,
  dedupe,
  dist,
  insideTravel,
  offset,
  polygonArea,
  polygonBbox,
  rotator,
  applyToPolygon,
  closeRing,
  rings,
} from "@texma-stitch/geometry";
import type { FillObject, Warning } from "./types.js";
import { runningStitches } from "./running.js";
import { warne, WARNUNG } from "./warnings.js";

/** Stichlaenge der Reisewege innerhalb der Flaeche (Kap. 8.5). */
export const TRAVEL_STITCH_MM = 2.0;
/** Flaeche, unter der eine Fuellung keinen Sinn mehr ergibt (Kap. 11). */
export const FILL_TINY_MM2 = 4;
/** Ab dieser Kantenlaenge Doppel-Unterlage (Kap. 8.6). */
export const DOUBLE_UNDERLAY_EDGE_MM = 20;

export type FillParams = {
  angleDeg: number;
  rowSpacingMm: number;
  stitchLengthMm: number;
  staggerRows: number;
};

type Segment = {
  /** Absoluter Reihenindex auf dem festen Raster. */
  row: number;
  y: number;
  x0: number;
  x1: number;
  /** Index innerhalb der Reihe — fuer den Sektionsgraphen. */
  idx: number;
};

type Section = { segments: Segment[] };

// ---------------------------------------------------------------------------
// Scanlines (Kap. 8.2)
// ---------------------------------------------------------------------------

/** Reihen von unten nach oben. Im SVG-System heisst unten: grosses y. */
export function scanlines(poly: Polygon, rowSpacingMm: number): Segment[][] {
  const spacing = Math.max(rowSpacingMm, 0.02);
  const b = polygonBbox(poly);
  const kUnten = Math.floor(b.maxY / spacing);
  const kOben = Math.ceil(b.minY / spacing);
  const rows: Segment[][] = [];
  for (let k = kUnten; k >= kOben; k--) {
    const y = k * spacing;
    const hits = clipHorizontal(y, poly);
    const segs: Segment[] = hits
      .map((h, idx) => ({ row: k, y, x0: Math.min(h.ta, h.tb), x1: Math.max(h.ta, h.tb), idx }))
      .filter((s) => s.x1 - s.x0 > 1e-6);
    if (segs.length > 0) rows.push(segs.map((s, idx) => ({ ...s, idx })));
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Sektionen (Kap. 8.3)
// ---------------------------------------------------------------------------

const ueberlappt = (a: Segment, b: Segment): boolean => a.x0 < b.x1 - 1e-9 && b.x0 < a.x1 - 1e-9;

/**
 * Zusammenhaengende Ketten ohne Verzweigung. Verzweigt ein Segment nach oben auf
 * zwei — oder laufen zwei auf eines zu — endet die Sektion.
 */
export function sections(rows: Segment[][]): Section[] {
  const key = (r: number, i: number): string => `${r}:${i}`;
  const benutzt = new Set<string>();
  const out: Section[] = [];

  for (let r = 0; r < rows.length; r++) {
    const reihe = rows[r]!;
    for (let i = 0; i < reihe.length; i++) {
      if (benutzt.has(key(r, i))) continue;
      const kette: Segment[] = [];
      let ri = r;
      let ii = i;
      for (;;) {
        const seg = rows[ri]![ii]!;
        kette.push(seg);
        benutzt.add(key(ri, ii));

        const naechste = rows[ri + 1];
        if (!naechste) break;
        const hoch = naechste
          .map((s, si) => ({ s, si }))
          .filter((x) => ueberlappt(seg, x.s) && !benutzt.has(key(ri + 1, x.si)));
        if (hoch.length !== 1) break; // Verzweigung nach oben
        const kandidat = hoch[0]!;
        const runter = rows[ri]!.filter((s) => ueberlappt(s, kandidat.s));
        if (runter.length !== 1) break; // Zusammenlauf von unten
        ri += 1;
        ii = kandidat.si;
      }
      out.push({ segments: kette });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Stiche in einer Sektion (Kap. 8.4)
// ---------------------------------------------------------------------------

/**
 * Stichpunkte einer Reihe. Die Positionen kommen aus dem festen Raster
 * `(m + versatz) * stitchLength`; Anfang und Ende liegen immer auf der Kontur.
 */
export function rowStitches(seg: Segment, params: FillParams, nachRechts: boolean): Point[] {
  const step = Math.max(params.stitchLengthMm, 0.2);
  const stagger = Math.max(1, Math.round(params.staggerRows));
  // Modulo, das auch fuer negative Reihenindizes im Bereich [0, stagger) bleibt.
  const versatz = (((seg.row % stagger) + stagger) % stagger) / stagger;

  const xs: number[] = [seg.x0];
  const mVon = Math.ceil(seg.x0 / step - versatz);
  const mBis = Math.floor(seg.x1 / step - versatz);
  for (let m = mVon; m <= mBis; m++) {
    const x = (m + versatz) * step;
    if (x > seg.x0 + 1e-9 && x < seg.x1 - 1e-9) xs.push(x);
  }
  xs.push(seg.x1);

  const punkte = xs.map((x) => ({ x, y: seg.y }));
  return nachRechts ? punkte : punkte.reverse();
}

type Eintritt = { punkt: Point; vonUnten: boolean; nachRechts: boolean };

function eintritte(section: Section): Eintritt[] {
  const erste = section.segments[0]!;
  const letzte = section.segments[section.segments.length - 1]!;
  return [
    { punkt: { x: erste.x0, y: erste.y }, vonUnten: true, nachRechts: true },
    { punkt: { x: erste.x1, y: erste.y }, vonUnten: true, nachRechts: false },
    { punkt: { x: letzte.x0, y: letzte.y }, vonUnten: false, nachRechts: true },
    { punkt: { x: letzte.x1, y: letzte.y }, vonUnten: false, nachRechts: false },
  ];
}

/** Serpentine durch die Sektion — Reihe fuer Reihe, Richtung wechselnd. */
export function sectionStitches(section: Section, params: FillParams, ein: Eintritt): Point[] {
  const reihen = ein.vonUnten ? section.segments : [...section.segments].reverse();
  const out: Point[] = [];
  let rechts = ein.nachRechts;
  for (const seg of reihen) {
    out.push(...rowStitches(seg, params, rechts));
    rechts = !rechts;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Sektionsreihenfolge und Reisewege (Kap. 8.5)
// ---------------------------------------------------------------------------

/**
 * Greedy: naechste unbesuchte Sektion nach Distanz. Der Reiseweg laeuft INNERHALB
 * der Form (`insideTravel`), damit ihn die spaeteren Deckstiche verdecken — im
 * Fill gibt es keinen Sprung.
 */
export function fillRegion(
  poly: Polygon,
  params: FillParams,
  startPoint?: Point,
  endPoint?: Point,
): Point[] {
  const drehen = rotator(-params.angleDeg);
  const zurueck = rotator(params.angleDeg);
  const gedreht = applyToPolygon(drehen, poly);

  const rows = scanlines(gedreht, params.rowSpacingMm);
  if (rows.length === 0) return [];
  const sekt = sections(rows);
  if (sekt.length === 0) return [];

  const b = polygonBbox(gedreht);
  let cursor: Point = startPoint ? drehen(startPoint) : { x: b.minX, y: b.maxY };

  const offen = new Set(sekt.map((_, i) => i));
  const out: Point[] = [];
  while (offen.size > 0) {
    let besterIndex = -1;
    let besterEintritt: Eintritt | undefined;
    let besteDistanz = Infinity;
    for (const i of offen) {
      for (const e of eintritte(sekt[i]!)) {
        const d = dist(cursor, e.punkt);
        if (d < besteDistanz) {
          besteDistanz = d;
          besterIndex = i;
          besterEintritt = e;
        }
      }
    }
    if (besterIndex === -1 || !besterEintritt) break;
    offen.delete(besterIndex);

    if (out.length > 0) {
      const weg = insideTravel(gedreht, cursor, besterEintritt.punkt);
      const gestochen = runningStitches(weg, { stitchLengthMm: TRAVEL_STITCH_MM });
      // Ersten Punkt weglassen — der Cursor steht schon dort.
      for (let i = 1; i < gestochen.length; i++) out.push(gestochen[i]!);
    }

    const stiche = sectionStitches(sekt[besterIndex]!, params, besterEintritt);
    for (const p of stiche) out.push(p);
    cursor = out[out.length - 1] ?? cursor;
  }

  if (endPoint) {
    const ziel = drehen(endPoint);
    const weg = insideTravel(gedreht, cursor, ziel);
    const gestochen = runningStitches(weg, { stitchLengthMm: TRAVEL_STITCH_MM });
    for (let i = 1; i < gestochen.length; i++) out.push(gestochen[i]!);
  }

  return out.map(zurueck);
}

// ---------------------------------------------------------------------------
// Unterlage (Kap. 8.6)
// ---------------------------------------------------------------------------

/** Kontur-Unterlage: Laufstich auf der nach innen versetzten Kontur. */
export function contourUnderlay(poly: Polygon, insetMm: number, stitchLengthMm = 2.5): Point[] {
  const innen = offset(poly, -Math.abs(insetMm));
  const out: Point[] = [];
  for (const teil of innen) {
    for (const ring of rings(teil)) {
      out.push(...runningStitches(closeRing(ring), { stitchLengthMm }));
    }
  }
  return out;
}

/** Laengste Kante der Bounding-Box — entscheidet single gegen double (Kap. 8.6). */
export function laengsteKanteMm(poly: Polygon): number {
  const b = polygonBbox(poly);
  return Math.max(b.maxX - b.minX, b.maxY - b.minY);
}

// ---------------------------------------------------------------------------
// Erzeugung
// ---------------------------------------------------------------------------

export type FillErgebnis = { stitches: Point[]; warnings: Warning[] };

export function generateFill(obj: FillObject): FillErgebnis {
  const warnings: Warning[] = [];
  const flaeche = polygonArea(obj.shape);
  if (flaeche < FILL_TINY_MM2) {
    warnings.push(
      warne(
        WARNUNG.FILL_TINY,
        `Flaeche nur ${flaeche.toFixed(1)} mm² — als Satin oder Laufstich stricken.`,
        "warn",
        obj.id,
      ),
    );
  }

  const teile = obj.pullCompMm === 0 ? [obj.shape] : offset(obj.shape, obj.pullCompMm);
  if (teile.length === 0) {
    warnings.push(
      warne(WARNUNG.INVALID_GEOMETRY, "Flaeche verschwindet durch den Zugausgleich.", "error", obj.id),
    );
    return { stitches: [], warnings };
  }

  const deckParams: FillParams = {
    angleDeg: obj.angleDeg,
    rowSpacingMm: obj.rowSpacingMm,
    stitchLengthMm: obj.stitchLengthMm,
    staggerRows: obj.staggerRows,
  };

  const stitches: Point[] = [];
  for (const teil of teile) {
    if (obj.underlay.contour) {
      stitches.push(...contourUnderlay(teil, obj.underlay.insetMm));
    }
    if (obj.underlay.fill !== "none") {
      const innen = offset(teil, -Math.abs(obj.underlay.insetMm));
      const winkel =
        obj.underlay.fill === "double"
          ? [obj.angleDeg - 45, obj.angleDeg + 45]
          : [obj.angleDeg + 90];
      for (const w of winkel) {
        for (const i of innen) {
          stitches.push(
            ...fillRegion(i, {
              angleDeg: w,
              rowSpacingMm: obj.underlay.spacingMm,
              stitchLengthMm: 3.0,
              staggerRows: obj.staggerRows,
            }),
          );
        }
      }
    }
    stitches.push(...fillRegion(teil, deckParams, obj.startPoint, obj.endPoint));
  }

  return { stitches: dedupe(stitches, 1e-6), warnings };
}
