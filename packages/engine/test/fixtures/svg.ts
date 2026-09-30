/** Small SVG documents for the importer test (spec §4, week 1). */

/** Two paths, one in a transformed group, with Ink/Stitch attributes. */
export const SVG_TWO_PATHS = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg"
     xmlns:inkstitch="http://inkstitch.org/namespace"
     width="100mm" height="50mm" viewBox="0 0 100 50">
  <g transform="translate(10,5)">
    <path id="kontur" d="M 0 0 L 20 0 L 20 10 Z"
          stroke="#c8102e"
          inkstitch:running_stitch_length_mm="3"
          inkstitch:repeats="3"
          inkstitch:trim_after="true"
          inkstitch:unknown_attribute="ignoriert" />
  </g>
  <path id="bogen" d="M 0 40 C 10 30, 30 30, 40 40" style="stroke:#101010;fill:none" />
</svg>`;

/** Path with an elliptical arc and a relative command. */
export const SVG_ARC = `<svg xmlns="http://www.w3.org/2000/svg" width="20mm" height="20mm" viewBox="0 0 20 20">
  <path id="a" d="M 2 10 a 8 8 0 0 1 16 0 l 0 4" />
</svg>`;

/** No viewBox: the user units are CSS pixels. */
export const SVG_PIXELS = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96">
  <path id="p" d="M0 0 H 96" />
</svg>`;

/** Filled paths: colour on the group, holes as even-odd inner rings. */
export const SVG_FILLED = `<svg xmlns="http://www.w3.org/2000/svg"
     xmlns:inkstitch="http://inkstitch.org/namespace"
     width="60mm" height="40mm" viewBox="0 0 60 40">
  <g id="z01" fill="#c8102e" fill-rule="evenodd">
    <path id="ring" d="M 2 2 L 22 2 L 22 22 L 2 22 Z M 7 7 L 7 17 L 17 17 L 17 7 Z" />
    <path id="zwei-flaechen" d="M 26 2 L 34 2 L 34 10 L 26 10 Z M 38 2 L 46 2 L 46 10 L 38 10 Z" />
  </g>
  <g id="z02" fill="#101010">
    <path id="mit-parametern" d="M 2 26 L 22 26 L 22 34 L 2 34 Z"
          inkstitch:angle="45" inkstitch:row_spacing_mm="0.4"
          inkstitch:max_stitch_length_mm="2.5" inkstitch:staggers="2" />
    <path id="kontur" d="M 30 26 L 50 26 L 50 34" fill="none" stroke="#2e3192" />
  </g>
  <path id="ohne-farbe" d="M 52 12 L 58 12" />
  <path id="stil" d="M 26 14 L 46 14 L 46 22 L 26 22 Z" style="fill:#fedd01" />
</svg>`;

/**
 * A page that does not start at 0: the viewBox of a PDF export (Hofbräu: `viewBox="29.9 367.2 …"`,
 * 76 mm in y before the importer took the origin into account). 80 x 40 user units on a 40 x 20 mm
 * page, origin (100, 200): the path is the whole page, so it has to land on (0, 0) to (40, 20) mm.
 */
export const SVG_VIEWBOX_ORIGIN = `<svg xmlns="http://www.w3.org/2000/svg" width="40mm" height="20mm" viewBox="100 200 80 40">
  <path id="seite" d="M 100 200 L 180 200 L 180 240 L 100 240 Z" fill="#c8102e" />
  <path id="linie" d="M 100 200 L 180 240" style="fill:none;stroke:#101010" />
</svg>`;

/**
 * The same, the way a PDF converter writes it: the paths in y-up PDF units under a flip
 * (`matrix(1,0,0,-1,0,841.8898)`), the page cut out by the viewBox. 500 x 250 units on 100 x 50 mm
 * (0.2 mm per unit), origin (30, 367). The square 100 x 100 units at x 130, y 300 (PDF) is 20 x 20 mm
 * on the page, 20 mm from the left and (441.8898 − 367) × 0.2 = 14.978 mm from the top.
 */
export const SVG_VIEWBOX_PDF = `<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="50mm" viewBox="30 367 500 250">
  <g id="ebene">
    <path id="quadrat" transform="matrix(1,0,0,-1,0,841.8898)" d="M130 300L230 300L230 400L130 400Z" fill="#d2060d" />
  </g>
</svg>`;
