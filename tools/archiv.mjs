/**
 * The TEXMA archive reference (docs/verfahren-aus-open-source.md §1): percentiles
 * from 192 production files, 2016-2025. The files themselves are not in the repo
 * (customer logos) -- only their percentiles are. Shared by tools/kennzahlen.mjs
 * (our own engine's plan) and tools/inkstitch.mjs (a DST from the Ink/Stitch
 * subprocess, docs/adr/0001-inkstitch-als-stich-engine.md) so the table
 * and the "where does this land" verdict exist exactly once.
 */
export const ARCHIV = {
  trimsPer1000: { p10: 0.3, median: 1.9, p90: 5.6, max: 10.1 },
  jumpsPer1000: { p10: 3.1, median: 7.8, p90: 18.9, max: 67.7 },
  stitchesPerMm2: { p10: 0.63, median: 1.22, p90: 2.37, max: 4.36 },
  densityMax: { p10: 11, median: 15, p90: 24, max: 44 },
  /** Needle penetrations per 0.2 mm cell: measured on four archive files (§11). */
  needleMax: { p10: 4, median: 6, p90: 8, max: 8 },
};

/** Where a value sits in the archive -- that is the actual statement. */
export function einordnen(wert, { p10, median, p90, max }) {
  if (wert <= p10) return "unter p10";
  if (wert <= median) return "bis Median";
  if (wert <= p90) return "bis p90";
  if (wert <= max) return "über p90";
  return "ÜBER ALLEM";
}

/** One formatted line: value, unit, archive median, and the verdict from einordnen(). */
export function zeile(name, wert, einheit, feld) {
  return `  ${name.padEnd(22)} ${wert.padStart(8)} ${einheit.padEnd(14)} Archiv ${String(
    ARCHIV[feld].median,
  ).padStart(5)} (Median) · ${einordnen(Number(wert), ARCHIV[feld])}`;
}
