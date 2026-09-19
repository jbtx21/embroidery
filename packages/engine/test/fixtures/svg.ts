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
