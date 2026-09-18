/** Farbwerkzeug fuer die Fadenoptik. */

export type Rgb = { r: number; g: number; b: number };

export function parseHex(hex: string): Rgb {
  const t = hex.replace("#", "").trim();
  const voll =
    t.length === 3
      ? `${t[0]!}${t[0]!}${t[1]!}${t[1]!}${t[2]!}${t[2]!}`
      : t.padEnd(6, "0").slice(0, 6);
  return {
    r: Number.parseInt(voll.slice(0, 2), 16) || 0,
    g: Number.parseInt(voll.slice(2, 4), 16) || 0,
    b: Number.parseInt(voll.slice(4, 6), 16) || 0,
  };
}

export const toHex = ({ r, g, b }: Rgb): string =>
  `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;

/** `f` = 0,7 heisst: 30 % dunkler. Fuer den Schatten unter dem Faden. */
export function abdunkeln(hex: string, f: number): string {
  const c = parseHex(hex);
  return toHex({ r: c.r * f, g: c.g * f, b: c.b * f });
}

/** Ersatzfarbe, wenn das Design fuer einen Index kein Garn hinterlegt hat. */
export const ERSATZFARBE = "#7a7a7a";
