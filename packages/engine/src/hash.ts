/**
 * Stable hash over object parameters, geometry and preset (spec §4).
 *
 * FNV-1a over a canonical JSON form: keys sorted, numbers rounded to 1/1000 mm.
 * The same input therefore yields the same key — across process boundaries too,
 * which is what the cache in the worker needs.
 */

function canonical(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "null";
    return (Math.round(value * 1000) / 1000).toString();
  }
  if (typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`);
    return `{${entries.join(",")}}`;
  }
  return "null";
}

export function stableHash(...parts: unknown[]): string {
  const text = parts.map(canonical).join("|");
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  // Second pass with a different seed — 32 bits collide too early when a design
  // holds many near-identical objects.
  let g = 0x811c9dc5 ^ text.length;
  for (let i = text.length - 1; i >= 0; i--) {
    g ^= text.charCodeAt(i);
    g = Math.imul(g, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0") + g.toString(16).padStart(8, "0");
}
