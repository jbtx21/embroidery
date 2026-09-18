/** DST file back to header and stitches — for round-trip tests and imports. */
import type { Stitch } from "@texma-stitch/engine";
import { decodeRecord, DST_UNITS_PER_MM, TRIM_RECORDS } from "./encode.js";
import type { DstHeader } from "./header.js";
import { DST_HEADER_SIZE, readHeader } from "./header.js";
import type { DstStitch } from "./write.js";

export type DstFile = { header: DstHeader; stitches: DstStitch[] };

const bytesEqual = (a: Uint8Array, b: Uint8Array): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i]);

export function readDst(bytes: Uint8Array): DstFile {
  const header = readHeader(bytes);
  const stitches: DstStitch[] = [];
  let x = 0;
  let y = 0;
  let i = DST_HEADER_SIZE;

  while (i + 2 < bytes.length) {
    // Collect the trim signal again — otherwise the round trip would not be
    // byte-identical, because a trim takes three records but counts as one
    // stitch in the header.
    if (
      i + 8 < bytes.length &&
      bytesEqual(bytes.subarray(i, i + 3), TRIM_RECORDS[0]!) &&
      bytesEqual(bytes.subarray(i + 3, i + 6), TRIM_RECORDS[1]!) &&
      bytesEqual(bytes.subarray(i + 6, i + 9), TRIM_RECORDS[2]!)
    ) {
      stitches.push({ x, y, cmd: "trim" });
      i += 9;
      continue;
    }

    const { dx, dy, kind } = decodeRecord(bytes.subarray(i, i + 3));
    if (kind === "end") {
      stitches.push({ x, y, cmd: "end" });
      break;
    }
    if (kind === "color" || kind === "stop") {
      stitches.push({ x, y, cmd: kind });
      i += 3;
      continue;
    }
    x += dx;
    y += dy;
    stitches.push({ x, y, cmd: kind });
    i += 3;
  }

  return { header, stitches };
}

/** DST stitches read back, converted to millimetres. */
export const unitsToMm = (stitches: DstStitch[]): Stitch[] =>
  stitches.map((s) => ({
    x: s.x / DST_UNITS_PER_MM,
    y: s.y / DST_UNITS_PER_MM,
    cmd: s.cmd,
  }));
