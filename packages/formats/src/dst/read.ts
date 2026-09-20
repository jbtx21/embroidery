/** DST file back to header and stitches — for round-trip tests and imports. */
import type { Stitch } from "@texma-stitch/engine";
import { decodeRecord, DST_UNITS_PER_MM, TRIM_RECORDS } from "./encode.js";
import type { DstHeader } from "./header.js";
import { DST_HEADER_SIZE, readHeader } from "./header.js";
import type { DstStitch } from "./write.js";

export type DstFile = { header: DstHeader; stitches: DstStitch[] };

/** A run of at least this many jumps reads as a trim in foreign files (spec §13.1.1). */
export const FOREIGN_TRIM_JUMPS = 3;

export type ReadOptions = {
  /**
   * Read a run of jumps as a trim (spec §13.1.1). Default `false`, and it has to
   * stay that way: `post()` splits long jumps into several jump records itself,
   * so the rule would read our own split jumps as trims and break the
   * byte-identical round trip of §15. Meant for foreign files, which are only
   * displayed (§17).
   */
  interpretJumpsAsTrim?: boolean;
};

const bytesEqual = (a: Uint8Array, b: Uint8Array): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i]);

export function readDst(bytes: Uint8Array, opts: ReadOptions = {}): DstFile {
  const header = readHeader(bytes);
  const stitches: DstStitch[] = [];
  let x = 0;
  let y = 0;
  let i = DST_HEADER_SIZE;
  let jumpRun = 0;

  /** Turn the last `jumpRun` jumps into one trim at the position they reached. */
  const foldJumpsIntoTrim = (): void => {
    if (jumpRun < FOREIGN_TRIM_JUMPS) return;
    const last = stitches[stitches.length - 1]!;
    stitches.splice(stitches.length - jumpRun, jumpRun, { x: last.x, y: last.y, cmd: "trim" });
  };

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
      jumpRun = 0;
      i += 9;
      continue;
    }

    const { dx, dy, kind } = decodeRecord(bytes.subarray(i, i + 3));
    if (kind === "end") {
      if (opts.interpretJumpsAsTrim) foldJumpsIntoTrim();
      stitches.push({ x, y, cmd: "end" });
      break;
    }
    if (kind === "color" || kind === "stop") {
      if (opts.interpretJumpsAsTrim) foldJumpsIntoTrim();
      jumpRun = 0;
      stitches.push({ x, y, cmd: kind });
      i += 3;
      continue;
    }
    x += dx;
    y += dy;
    stitches.push({ x, y, cmd: kind });
    if (opts.interpretJumpsAsTrim) {
      if (kind === "jump") {
        jumpRun++;
      } else {
        // The run ended one record ago — the stitch just pushed is not part of
        // it, so fold what came before and put it back on top.
        const current = stitches.pop()!;
        foldJumpsIntoTrim();
        stitches.push(current);
        jumpRun = 0;
      }
    }
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
