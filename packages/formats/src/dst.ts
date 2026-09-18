/**
 * Tajima DST (Kap. 13.1).
 *
 * Header 512 Byte, danach Datensaetze zu 3 Byte mit Delta-Kodierung in 0,1 mm.
 * Die Bitbelegung folgt der Tajima-Spezifikation; die Referenz fuer jede
 * Einzelheit — Feldbreiten, Fuellbytes, Trim-Signal — ist pyembroidery, weil
 * Kap. 13.2 byte-identische Ausgabe gegen genau diese Bibliothek verlangt.
 *
 * Abweichung von Kap. 13.1 (dokumentiert): der Header endet mit `0x1A` und wird
 * danach mit `0x20` aufgefuellt, nicht durchgehend mit `0x1A`. Anders waere die
 * geforderte Kreuzpruefung nicht erfuellbar.
 */
import type { Stitch, StitchBlock, StitchPlan } from "@texma-stitch/engine";

/** DST-Einheiten je Millimeter. */
export const DST_UNITS_PER_MM = 10;
/** Groesstes Delta je Achse in DST-Einheiten. */
export const DST_MAX_DELTA = 121;
export const DST_HEADER_SIZE = 512;

export type DstOptions = {
  /** Label im Header, hoechstens 16 Zeichen. */
  label?: string;
  /**
   * Motiv auf den Nullpunkt zentrieren (Standard). Stickmaschinen starten im
   * Nullpunkt — eine Datei, deren Koordinaten alle positiv sind, laeuft sonst
   * aus dem Rahmen.
   */
  center?: boolean;
};

// ---------------------------------------------------------------------------
// Datensaetze
// ---------------------------------------------------------------------------

type RecordKind = "stitch" | "jump" | "color" | "stop" | "end";

/**
 * Ein Datensatz. `x`/`y` sind Deltas in DST-Einheiten; y wird gespiegelt, weil
 * DST y nach oben zaehlt und wir nach unten (Kap. 1).
 */
export function encodeRecord(x: number, y: number, kind: RecordKind): Uint8Array {
  let dx = x;
  let dy = -y;
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;

  if (kind === "color" || kind === "stop") return Uint8Array.from([0, 0, 0b11000011]);
  if (kind === "end") return Uint8Array.from([0, 0, 0b11110011]);

  if (kind === "jump") b2 += 1 << 7;
  b2 += (1 << 0) + (1 << 1);

  if (dx > 40) {
    b2 += 1 << 2;
    dx -= 81;
  }
  if (dx < -40) {
    b2 += 1 << 3;
    dx += 81;
  }
  if (dx > 13) {
    b1 += 1 << 2;
    dx -= 27;
  }
  if (dx < -13) {
    b1 += 1 << 3;
    dx += 27;
  }
  if (dx > 4) {
    b0 += 1 << 2;
    dx -= 9;
  }
  if (dx < -4) {
    b0 += 1 << 3;
    dx += 9;
  }
  if (dx > 1) {
    b1 += 1 << 0;
    dx -= 3;
  }
  if (dx < -1) {
    b1 += 1 << 1;
    dx += 3;
  }
  if (dx > 0) {
    b0 += 1 << 0;
    dx -= 1;
  }
  if (dx < 0) {
    b0 += 1 << 1;
    dx += 1;
  }
  if (dx !== 0) throw new Error(`DST: dx ${x} ueberschreitet ${DST_MAX_DELTA} Einheiten.`);

  if (dy > 40) {
    b2 += 1 << 5;
    dy -= 81;
  }
  if (dy < -40) {
    b2 += 1 << 4;
    dy += 81;
  }
  if (dy > 13) {
    b1 += 1 << 5;
    dy -= 27;
  }
  if (dy < -13) {
    b1 += 1 << 4;
    dy += 27;
  }
  if (dy > 4) {
    b0 += 1 << 5;
    dy -= 9;
  }
  if (dy < -4) {
    b0 += 1 << 4;
    dy += 9;
  }
  if (dy > 1) {
    b1 += 1 << 7;
    dy -= 3;
  }
  if (dy < -1) {
    b1 += 1 << 6;
    dy += 3;
  }
  if (dy > 0) {
    b0 += 1 << 7;
    dy -= 1;
  }
  if (dy < 0) {
    b0 += 1 << 6;
    dy += 1;
  }
  if (dy !== 0) throw new Error(`DST: dy ${y} ueberschreitet ${DST_MAX_DELTA} Einheiten.`);

  return Uint8Array.from([b0, b1, b2]);
}

/** Trim-Signal: drei Spruenge mit Summe null (Tajima-Konvention). */
export const TRIM_RECORDS: Uint8Array[] = [
  encodeRecord(2, 2, "jump"),
  encodeRecord(-4, -4, "jump"),
  encodeRecord(2, 2, "jump"),
];

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

/**
 * Rundung auf die naechste ganze Zahl, bei genau 0,5 zur GERADEN Zahl.
 *
 * Nicht Geschmackssache: die Kreuzpruefung aus Kap. 13.2 laeuft gegen Python,
 * und `round()` rundet dort kaufmaennisch-symmetrisch. `Math.round` rundet 2,5
 * auf 3, Python auf 2 — bei Koordinaten auf dem halben Zehntelmillimeter
 * (Reihenabstand 0,25 mm!) waere die Datei sonst nicht byte-identisch.
 */
export function roundHalfEven(v: number): number {
  const gerundet = Math.round(v);
  if (Math.abs(v % 1) !== 0.5) return gerundet;
  const unten = Math.floor(v);
  return unten % 2 === 0 ? unten : unten + 1;
}

const links = (text: string, breite: number): string =>
  text.length >= breite ? text.slice(0, breite) : text + " ".repeat(breite - text.length);

const rechts = (value: number, breite: number): string => {
  const text = String(value);
  return text.length >= breite ? text : " ".repeat(breite - text.length) + text;
};

function headerBytes(
  label: string,
  records: number,
  colorChanges: number,
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  letzte: { x: number; y: number },
): Uint8Array {
  const zeilen = [
    `LA:${links(label, 16)}\r`,
    `ST:${rechts(records, 7)}\r`,
    `CO:${rechts(colorChanges, 3)}\r`,
    `+X:${rechts(Math.abs(bounds.maxX), 5)}\r`,
    `-X:${rechts(Math.abs(bounds.minX), 5)}\r`,
    `+Y:${rechts(Math.abs(bounds.maxY), 5)}\r`,
    `-Y:${rechts(Math.abs(bounds.minY), 5)}\r`,
    `AX:${letzte.x >= 0 ? "+" : "-"}${rechts(Math.abs(letzte.x), 5)}\r`,
    `AY:${-letzte.y >= 0 ? "+" : "-"}${rechts(Math.abs(-letzte.y), 5)}\r`,
    `MX:+${rechts(0, 5)}\r`,
    `MY:+${rechts(0, 5)}\r`,
    `PD:******\r`,
  ].join("");

  const out = new Uint8Array(DST_HEADER_SIZE).fill(0x20);
  for (let i = 0; i < zeilen.length; i++) out[i] = zeilen.charCodeAt(i) & 0xff;
  out[zeilen.length] = 0x1a;
  return out;
}

// ---------------------------------------------------------------------------
// Schreiben
// ---------------------------------------------------------------------------

/** Stich in DST-Einheiten (0,1 mm), y weiterhin nach unten. */
export type DstStitch = { x: number; y: number; cmd: Stitch["cmd"] };

export function planToUnits(blocks: StitchBlock[]): DstStitch[] {
  const out: DstStitch[] = [];
  for (const b of blocks) {
    for (const s of b.stitches) {
      out.push({ x: s.x * DST_UNITS_PER_MM, y: s.y * DST_UNITS_PER_MM, cmd: s.cmd });
    }
  }
  return out;
}

export function writeDstFromUnits(stitches: DstStitch[], opts: DstOptions = {}): Uint8Array {
  const label = opts.label ?? "Untitled";

  let minX = 0;
  let minY = 0;
  let maxX = 0;
  let maxY = 0;
  if (stitches.length > 0) {
    minX = Infinity;
    minY = Infinity;
    maxX = -Infinity;
    maxY = -Infinity;
    for (const s of stitches) {
      if (s.x < minX) minX = s.x;
      if (s.y < minY) minY = s.y;
      if (s.x > maxX) maxX = s.x;
      if (s.y > maxY) maxY = s.y;
    }
  }

  const letzter = stitches[stitches.length - 1];
  const header = headerBytes(
    label,
    stitches.length,
    stitches.filter((s) => s.cmd === "color").length,
    {
      minX: Math.trunc(minX),
      minY: Math.trunc(minY),
      maxX: Math.trunc(maxX),
      maxY: Math.trunc(maxY),
    },
    letzter ? { x: Math.trunc(letzter.x), y: Math.trunc(letzter.y) } : { x: 0, y: 0 },
  );

  const teile: Uint8Array[] = [header];
  // Die Nadelposition laeuft ganzzahlig mit: das Delta entsteht immer aus der
  // WAHREN Zielposition minus der bereits gerundeten Position. Sonst summieren
  // sich die Rundungsfehler ueber tausende Stiche auf (Kap. 13.1).
  let xx = 0;
  let yy = 0;
  for (const s of stitches) {
    const dx = roundHalfEven(s.x - xx);
    const dy = roundHalfEven(s.y - yy);
    xx += dx;
    yy += dy;
    if (s.cmd === "trim") {
      for (const r of TRIM_RECORDS) teile.push(r);
    } else {
      teile.push(encodeRecord(dx, dy, s.cmd));
    }
  }

  const laenge = teile.reduce((sum, t) => sum + t.length, 0);
  const out = new Uint8Array(laenge);
  let offset = 0;
  for (const t of teile) {
    out.set(t, offset);
    offset += t.length;
  }
  return out;
}

/**
 * Bringt eine Stichliste in die Form, die DST wirklich vertraegt:
 *
 * 1. Zentrieren (Standard): die Maschine faengt im Nullpunkt an. Eine Datei, die
 *    30 cm vom Nullpunkt entfernt beginnt, faehrt der Maschine in den Rahmen.
 * 2. Fuehrende Spruenge: der Weg vom Nullpunkt zum ersten Stich ist selbst ein
 *    Delta und muss dieselbe Grenze einhalten wie jeder andere.
 * 3. Zu weite Bewegungen teilen. Die Engine tut das schon in `post()`, aber die
 *    Grenze gehoert zum FORMAT — wer hier eine fremde Liste hereinreicht, darf
 *    sich darauf verlassen.
 */
export function prepareUnits(
  stitches: DstStitch[],
  opts: { center?: boolean } = {},
): DstStitch[] {
  if (stitches.length === 0) return [];

  let verschobenX = 0;
  let verschobenY = 0;
  if (opts.center !== false) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const s of stitches) {
      if (s.x < minX) minX = s.x;
      if (s.y < minY) minY = s.y;
      if (s.x > maxX) maxX = s.x;
      if (s.y > maxY) maxY = s.y;
    }
    // Ganzzahlig verschieben, damit die Koordinaten auf demselben Raster bleiben.
    verschobenX = -Math.round((minX + maxX) / 2);
    verschobenY = -Math.round((minY + maxY) / 2);
  }

  const verschoben = stitches.map((s) => ({ ...s, x: s.x + verschobenX, y: s.y + verschobenY }));

  const out: DstStitch[] = [];
  let cx = 0;
  let cy = 0;
  let ersteBewegung = true;

  for (const s of verschoben) {
    if (s.cmd !== "stitch" && s.cmd !== "jump") {
      out.push({ ...s, x: cx, y: cy });
      continue;
    }

    if (ersteBewegung) {
      ersteBewegung = false;
      const schritte = Math.max(
        Math.ceil(Math.abs(s.x) / DST_MAX_DELTA),
        Math.ceil(Math.abs(s.y) / DST_MAX_DELTA),
      );
      for (let k = 1; k <= schritte; k++) {
        out.push({ x: (s.x * k) / schritte, y: (s.y * k) / schritte, cmd: "jump" });
      }
      // Ein Sprung ist damit schon gesetzt; ein Stich braucht noch seinen
      // eigenen Datensatz an derselben Stelle.
      if (s.cmd !== "jump" || schritte === 0) out.push({ ...s });
      cx = s.x;
      cy = s.y;
      continue;
    }

    const dx = s.x - cx;
    const dy = s.y - cy;
    const schritte = Math.max(
      1,
      Math.ceil(Math.abs(dx) / DST_MAX_DELTA),
      Math.ceil(Math.abs(dy) / DST_MAX_DELTA),
    );
    for (let k = 1; k < schritte; k++) {
      out.push({ x: cx + (dx * k) / schritte, y: cy + (dy * k) / schritte, cmd: s.cmd });
    }
    out.push({ ...s });
    cx = s.x;
    cy = s.y;
  }

  return out;
}

export function writeDst(plan: StitchPlan, opts: DstOptions = {}): Uint8Array {
  return writeDstFromUnits(prepareUnits(planToUnits(plan.blocks), opts), opts);
}

// ---------------------------------------------------------------------------
// Lesen (Kap. 13, Reader fuer Import und Vergleich)
// ---------------------------------------------------------------------------

export type DstHeader = {
  label: string;
  records: number;
  colorChanges: number;
  extents: { plusX: number; minusX: number; plusY: number; minusY: number };
};

export type DstDatei = { header: DstHeader; stitches: DstStitch[] };

function feld(text: string, name: string): string {
  const i = text.indexOf(`${name}:`);
  if (i === -1) return "";
  const ende = text.indexOf("\r", i);
  return text.slice(i + name.length + 1, ende === -1 ? undefined : ende).trim();
}

const gleich = (a: Uint8Array, b: Uint8Array): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i]);

export function readDst(bytes: Uint8Array): DstDatei {
  const kopf = new TextDecoder("latin1").decode(bytes.subarray(0, DST_HEADER_SIZE));
  const header: DstHeader = {
    label: feld(kopf, "LA"),
    records: Number.parseInt(feld(kopf, "ST"), 10) || 0,
    colorChanges: Number.parseInt(feld(kopf, "CO"), 10) || 0,
    extents: {
      plusX: Number.parseInt(feld(kopf, "+X"), 10) || 0,
      minusX: Number.parseInt(feld(kopf, "-X"), 10) || 0,
      plusY: Number.parseInt(feld(kopf, "+Y"), 10) || 0,
      minusY: Number.parseInt(feld(kopf, "-Y"), 10) || 0,
    },
  };

  const stitches: DstStitch[] = [];
  let x = 0;
  let y = 0;
  let i = DST_HEADER_SIZE;
  while (i + 2 < bytes.length) {
    const rec = bytes.subarray(i, i + 3);

    // Trim-Signal wieder einsammeln — sonst waere der Roundtrip nicht
    // byte-identisch, weil ein Trim drei Datensaetze belegt, aber ein Stich ist.
    if (
      i + 8 < bytes.length &&
      gleich(rec, TRIM_RECORDS[0]!) &&
      gleich(bytes.subarray(i + 3, i + 6), TRIM_RECORDS[1]!) &&
      gleich(bytes.subarray(i + 6, i + 9), TRIM_RECORDS[2]!)
    ) {
      stitches.push({ x, y, cmd: "trim" });
      i += 9;
      continue;
    }

    const b0 = rec[0]!;
    const b1 = rec[1]!;
    const b2 = rec[2]!;

    if (b2 === 0b11110011) {
      stitches.push({ x, y, cmd: "end" });
      break;
    }
    if (b2 === 0b11000011) {
      stitches.push({ x, y, cmd: "color" });
      i += 3;
      continue;
    }

    let dx = 0;
    let dy = 0;
    if (b0 & (1 << 0)) dx += 1;
    if (b0 & (1 << 1)) dx -= 1;
    if (b0 & (1 << 2)) dx += 9;
    if (b0 & (1 << 3)) dx -= 9;
    if (b1 & (1 << 0)) dx += 3;
    if (b1 & (1 << 1)) dx -= 3;
    if (b1 & (1 << 2)) dx += 27;
    if (b1 & (1 << 3)) dx -= 27;
    if (b2 & (1 << 2)) dx += 81;
    if (b2 & (1 << 3)) dx -= 81;

    if (b0 & (1 << 7)) dy += 1;
    if (b0 & (1 << 6)) dy -= 1;
    if (b0 & (1 << 5)) dy += 9;
    if (b0 & (1 << 4)) dy -= 9;
    if (b1 & (1 << 7)) dy += 3;
    if (b1 & (1 << 6)) dy -= 3;
    if (b1 & (1 << 5)) dy += 27;
    if (b1 & (1 << 4)) dy -= 27;
    if (b2 & (1 << 5)) dy += 81;
    if (b2 & (1 << 4)) dy -= 81;

    x += dx;
    y -= dy; // zurueck in unser y-nach-unten
    stitches.push({ x, y, cmd: b2 & (1 << 7) ? "jump" : "stitch" });
    i += 3;
  }

  return { header, stitches };
}

/** Gelesene DST-Stiche zurueck nach Millimetern. */
export const unitsToMm = (stitches: DstStitch[]): Stitch[] =>
  stitches.map((s) => ({
    x: s.x / DST_UNITS_PER_MM,
    y: s.y / DST_UNITS_PER_MM,
    cmd: s.cmd,
  }));
