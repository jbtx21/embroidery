/**
 * Which font to set a text in (spec §9.4).
 *
 * The default pair is `caffeine_tiny` up to 9 mm and `caffeine_KOR` above it.
 * That is a house rule, not a property of the fonts — `expand` warns when the
 * height leaves what the chosen font itself declares (§9.4).
 */
import type { Font, FontRegistry } from "@texma-stitch/fonts";

/** Height at which the default pair switches over (spec §9.4). */
export const FONT_SWITCH_MM = 9;
export const FONT_SMALL_ID = "caffeine_tiny";
export const FONT_LARGE_ID = "caffeine_KOR";

/** The id the house rule picks for a cap height (spec §9.4). */
export const fontIdForHeight = (heightMm: number): string =>
  heightMm <= FONT_SWITCH_MM ? FONT_SMALL_ID : FONT_LARGE_ID;

/**
 * The font for a height, out of what is registered. Falls back to any font that
 * declares the height inside its own range, and then to the house pick — better
 * a warning from `expand` than no letters at all.
 */
export function fontForHeight(
  fonts: FontRegistry,
  heightMm: number,
  all: Font[],
): Font | undefined {
  const wanted = fonts.get(fontIdForHeight(heightMm));
  if (wanted) return wanted;
  const fits = all.filter(
    (f) => heightMm >= f.minHeightMm && (f.maxHeightMm === undefined || heightMm <= f.maxHeightMm),
  );
  return fits[0] ?? all[0];
}
