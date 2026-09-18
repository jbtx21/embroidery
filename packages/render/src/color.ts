/** Colour helpers for the thread look. */

export type Rgb = { r: number; g: number; b: number };

/**
 * Reads `#rgb` and `#rrggbb`. Anything else comes back black rather than
 * half-parsed: `parseInt` would happily read "en" out of "nonsense" and hand out
 * a colour nobody asked for.
 */
export function parseHex(hex: string): Rgb {
  const t = hex.replace("#", "").trim().toLowerCase();
  const full = /^[0-9a-f]{3}$/.test(t)
    ? `${t[0]!}${t[0]!}${t[1]!}${t[1]!}${t[2]!}${t[2]!}`
    : /^[0-9a-f]{6}$/.test(t)
      ? t
      : "000000";
  return {
    r: Number.parseInt(full.slice(0, 2), 16),
    g: Number.parseInt(full.slice(2, 4), 16),
    b: Number.parseInt(full.slice(4, 6), 16),
  };
}

export const toHex = ({ r, g, b }: Rgb): string =>
  `#${[r, g, b]
    .map((v) =>
      Math.max(0, Math.min(255, Math.round(v)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;

/** `f = 0.7` means 30 % darker. Used for the shadow underneath the thread. */
export function darken(hex: string, f: number): string {
  const c = parseHex(hex);
  return toHex({ r: c.r * f, g: c.g * f, b: c.b * f });
}

/** Fallback colour when the design has no thread for an index. */
export const FALLBACK_COLOR = "#7a7a7a";
