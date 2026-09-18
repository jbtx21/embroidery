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
