/**
 * Stabiler Hash ueber Objektparameter, Geometrie und Preset (Kap. 4).
 *
 * FNV-1a ueber eine kanonische JSON-Form: Schluessel sortiert, Zahlen auf
 * 1/1000 mm gerundet. Damit liefert dieselbe Eingabe denselben Schluessel — auch
 * ueber Prozessgrenzen hinweg, was der Cache im Worker braucht.
 */

function kanonisch(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "null";
    return (Math.round(value * 1000) / 1000).toString();
  }
  if (typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(kanonisch).join(",")}]`;
  if (typeof value === "object") {
    const eintraege = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${kanonisch(v)}`);
    return `{${eintraege.join(",")}}`;
  }
  return "null";
}

export function stableHash(...parts: unknown[]): string {
  const text = parts.map(kanonisch).join("|");
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  // Zweiter Durchlauf mit anderem Startwert — 32 Bit kollidieren sonst zu frueh,
  // wenn ein Design viele fast gleiche Objekte hat.
  let g = 0x811c9dc5 ^ text.length;
  for (let i = text.length - 1; i >= 0; i--) {
    g ^= text.charCodeAt(i);
    g = Math.imul(g, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0") + g.toString(16).padStart(8, "0");
}
