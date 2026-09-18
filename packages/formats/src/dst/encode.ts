/**
 * Tajima DST records (spec §13.1).
 *
 * Three bytes per record, deltas in 0.1 mm, bits for ±1, ±3, ±9, ±27, ±81 per
 * axis plus the jump bit; colour change (stop) and the end record 00 00 F3.
 *
 * The reference for every detail is pyembroidery, because spec §13.2 requires
 * byte-identical output against exactly that library.
 */

/** DST units per millimetre. */
export const DST_UNITS_PER_MM = 10;
/** Largest delta per axis in DST units. */
export const DST_MAX_DELTA = 121;

export type RecordKind = "stitch" | "jump" | "color" | "stop" | "end";

/**
 * Encode one record. `x`/`y` are deltas in DST units; y is mirrored because DST
 * counts y upwards while we count downwards (spec §1).
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
  if (dx !== 0) throw new Error(`DST: dx ${x} exceeds ${DST_MAX_DELTA} units.`);

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
  if (dy !== 0) throw new Error(`DST: dy ${y} exceeds ${DST_MAX_DELTA} units.`);

  return Uint8Array.from([b0, b1, b2]);
}

/** Decode one record back into a delta (in our y-down system) and its kind. */
export function decodeRecord(rec: Uint8Array): { dx: number; dy: number; kind: RecordKind } {
  const b0 = rec[0] ?? 0;
  const b1 = rec[1] ?? 0;
  const b2 = rec[2] ?? 0;

  if (b2 === 0b11110011) return { dx: 0, dy: 0, kind: "end" };
  if (b2 === 0b11000011) return { dx: 0, dy: 0, kind: "color" };

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

  // Back into our y-down system. `dy === 0 ? 0 : -dy` avoids handing out -0,
  // which compares equal to 0 but is not Object.is-equal to it.
  return { dx, dy: dy === 0 ? 0 : -dy, kind: b2 & (1 << 7) ? "jump" : "stitch" };
}

/** Trim signal: three jumps summing to zero (Tajima convention). */
export const TRIM_RECORDS: Uint8Array[] = [
  encodeRecord(2, 2, "jump"),
  encodeRecord(-4, -4, "jump"),
  encodeRecord(2, 2, "jump"),
];

/**
 * Round to the nearest integer, ties to the EVEN one.
 *
 * Not a matter of taste: the cross-check from spec §13.2 runs against Python,
 * where `round()` is banker's rounding. `Math.round` turns 2.5 into 3, Python
 * into 2 — with coordinates on the half tenth of a millimetre (row spacing
 * 0.25 mm!) the file would otherwise not be byte-identical.
 */
export function roundHalfEven(v: number): number {
  const rounded = Math.round(v);
  if (Math.abs(v % 1) !== 0.5) return rounded;
  const down = Math.floor(v);
  return down % 2 === 0 ? down : down + 1;
}
