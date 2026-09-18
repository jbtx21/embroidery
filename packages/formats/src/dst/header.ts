/**
 * DST header (spec §13.1): 512 bytes with the fields LA, ST, CO, +X -X +Y -Y,
 * AX AY MX MY and PD.
 *
 * Documented deviation from spec §13.1: the header ends with `0x1A` and is then
 * padded with `0x20`, not filled with `0x1A` throughout. Otherwise the
 * byte-identical cross-check demanded by spec §13.2 would be impossible, because
 * pyembroidery pads with spaces. See docs/backlog.md.
 */

export const DST_HEADER_SIZE = 512;

export type DstHeaderFields = {
  label: string;
  /** Number of records in the plan (a trim counts once, not as three jumps). */
  records: number;
  colorChanges: number;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  /** Last absolute position in DST units, y still pointing down. */
  last: { x: number; y: number };
};

const padRight = (text: string, width: number): string =>
  text.length >= width ? text.slice(0, width) : text + " ".repeat(width - text.length);

const padLeft = (value: number, width: number): string => {
  const text = String(value);
  return text.length >= width ? text : " ".repeat(width - text.length) + text;
};

export function headerText(f: DstHeaderFields): string {
  return [
    `LA:${padRight(f.label, 16)}\r`,
    `ST:${padLeft(f.records, 7)}\r`,
    `CO:${padLeft(f.colorChanges, 3)}\r`,
    `+X:${padLeft(Math.abs(f.bounds.maxX), 5)}\r`,
    `-X:${padLeft(Math.abs(f.bounds.minX), 5)}\r`,
    `+Y:${padLeft(Math.abs(f.bounds.maxY), 5)}\r`,
    `-Y:${padLeft(Math.abs(f.bounds.minY), 5)}\r`,
    `AX:${f.last.x >= 0 ? "+" : "-"}${padLeft(Math.abs(f.last.x), 5)}\r`,
    `AY:${-f.last.y >= 0 ? "+" : "-"}${padLeft(Math.abs(-f.last.y), 5)}\r`,
    `MX:+${padLeft(0, 5)}\r`,
    `MY:+${padLeft(0, 5)}\r`,
    `PD:******\r`,
  ].join("");
}

export function writeHeader(f: DstHeaderFields): Uint8Array {
  const text = headerText(f);
  const out = new Uint8Array(DST_HEADER_SIZE).fill(0x20);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 0xff;
  out[text.length] = 0x1a;
  return out;
}

function field(text: string, name: string): string {
  const i = text.indexOf(`${name}:`);
  if (i === -1) return "";
  const end = text.indexOf("\r", i);
  return text.slice(i + name.length + 1, end === -1 ? undefined : end).trim();
}

export type DstHeader = {
  label: string;
  records: number;
  colorChanges: number;
  extents: { plusX: number; minusX: number; plusY: number; minusY: number };
};

export function readHeader(bytes: Uint8Array): DstHeader {
  const text = new TextDecoder("latin1").decode(bytes.subarray(0, DST_HEADER_SIZE));
  return {
    label: field(text, "LA"),
    records: Number.parseInt(field(text, "ST"), 10) || 0,
    colorChanges: Number.parseInt(field(text, "CO"), 10) || 0,
    extents: {
      plusX: Number.parseInt(field(text, "+X"), 10) || 0,
      minusX: Number.parseInt(field(text, "-X"), 10) || 0,
      plusY: Number.parseInt(field(text, "+Y"), 10) || 0,
      minusY: Number.parseInt(field(text, "-Y"), 10) || 0,
    },
  };
}
