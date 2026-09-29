/**
 * Ausgabe der Feinheits-Prüfung (docs/Engine-Spezifikation.md §5.2): Textzeilen für die
 * Konsole und das Vorschaubild, gemeinsam für tools/mindestgroesse.mjs (die ganze Liste) und
 * tools/inkstitch.mjs (der Abschnitt „Feinheit“). Gerechnet wird in
 * packages/engine/src/inkstitch/min-size.ts — hier steht nur, wie es aussieht.
 *
 * Das Vorschaubild: alle Formen hellgrau, jeder Befund rot (ein Satinstrich als Form, eine
 * Lücke als das Stück, das das Schließen ergänzt hat), die größten mit ihrer Nummer aus der
 * Liste beschriftet. Nichts davon geht in die Vorlage — die Prüfung meldet nur.
 */
import { Buffer } from "node:buffer";
import { createRequire } from "node:module";
import { URL } from "node:url";
import { GAP_NOISE_MM2 } from "@texma-stitch/engine";

/** Millimeter mit Punkt, wie die übrigen Werkzeuge ihre Zahlen drucken. */
export const mm = (value, digits = 2) => value.toFixed(digits);

export const ART = { "satin-stroke": "Satinstrich", gap: "Lücke" };

/** „hält ab“ wird aufgerundet: „ab 246 mm“ ist dann wahr, „ab 245 mm“ nicht. */
const haeltAb = (f) => `${Math.ceil(f.holdsFromWidthMm)} mm`;

/** Wohin man schauen muss, als „(x, y)“ in Millimetern der SVG. */
const lage = (f) => `(${mm(f.at.x, 1)}, ${mm(f.at.y, 1)})`;

const zahl = (n, eins, viele) => `${n} ${n === 1 ? eins : viele}`;

/** Wie viele Befunde jeder Art es gibt. */
export function befundeJeArt(result) {
  const satin = result.findings.filter((f) => f.kind === "satin-stroke").length;
  return { satin, luecke: result.findings.length - satin };
}

/**
 * Was die Prüfung ergab, als Zeilen: Mindestgröße mit dem Element, das sie bestimmt, die Zahl
 * der Befunde je Art, und was das Schließen fand, aber nicht gezählt hat (Regel 8: nichts
 * verschwindet still).
 */
export function zusammenfassung(result) {
  const { satin, luecke } = befundeJeArt(result);
  const lines = [];
  const d = result.decisive;
  if (d) {
    lines.push(
      `Mindestgröße  ${Math.ceil(result.minimumWidthMm)} mm — bestimmt von ${ART[d.kind]} ${d.id} ` +
        `bei ${lage(d)} mm: gemessen ${mm(d.measuredMm)} mm, Grenze ${d.limitMm} mm`,
    );
  } else {
    lines.push(
      `Mindestgröße  keine zu feinen Elemente bei ${mm(result.widthMm, 1)} mm ` +
        `(kleiner wird nicht geprüft)`,
    );
  }
  if (d) {
    // Die Mindestgröße ist das Größte von allem; welche Art wie viel verlangt, steht hier.
    const teil = (kind, name) => {
      const f = result.findings.find((x) => x.kind === kind);
      return f ? `${name} ab ${Math.ceil(f.holdsFromWidthMm)} mm (${f.id})` : `${name}: keine`;
    };
    lines.push(`davon         ${teil("satin-stroke", "Satinstriche")}, ${teil("gap", "Lücken")}`);
  }
  lines.push(
    `Befunde       ${zahl(satin, "Satinstrich", "Satinstriche")} unter ${result.limits.satinMinMm} mm, ` +
      `${zahl(luecke, "Lücke", "Lücken")} unter ${result.limits.gapMinMm} mm`,
  );
  const i = result.ignored;
  lines.push(
    `Nicht gezählt ${i.noise} Stücke unter ${GAP_NOISE_MM2} mm² (Rauschen) · ${i.compact} ohne Mittelachse ` +
      `(Ecken-Rundungen, kurze Lücken) · ${i.wide} mit gemessener Breite ab der Grenze · ` +
      `${i.covered} von einer späteren Form überdeckt (von ${result.gapPieces} Stücken des Schließens)`,
  );
  return lines;
}

/**
 * Die Befunde als Tabelle, größte Mindestbreite zuerst. Die Nummer ist der Rang in der vollen
 * Liste — dieselbe steht im Vorschaubild. `max` kürzt die Anzeige und sagt es.
 */
export function befundZeilen(findings, { max = Infinity } = {}) {
  const shown = findings.slice(0, max);
  const idW = Math.max(7, ...shown.map((f) => f.id.length));
  const lines = [
    `${"Nr".padStart(4)}  ${"Art".padEnd(11)} ${"Element".padEnd(idW)} ${"gemessen".padStart(9)} ` +
      `${"Grenze".padStart(8)} ${"hält ab".padStart(9)}  ${"Lage (mm)".padEnd(14)} Hinweis`,
  ];
  shown.forEach((f, i) => {
    const hinweis = f.runningAlternative ? "alternativ Laufstich (dünne Zierlinie?)" : "";
    lines.push(
      (
        `${String(i + 1).padStart(4)}  ${ART[f.kind].padEnd(11)} ${f.id.padEnd(idW)} ` +
        `${`${mm(f.measuredMm)} mm`.padStart(9)} ${`${f.limitMm} mm`.padStart(8)} ` +
        `${haeltAb(f).padStart(9)}  ${lage(f).padEnd(14)} ${hinweis}`
      ).trimEnd(),
    );
  });
  if (findings.length > shown.length) {
    lines.push(`      … und ${findings.length - shown.length} weitere (nicht aufgelistet)`);
  }
  return lines;
}

// ---------------------------------------------------------------------------
// Vorschaubild
// ---------------------------------------------------------------------------

const GRAU = "#e2e2e2";
const GRAU_LINIE = "#a6a6a6";
const ROT = "#d40000";

const num = (n) => (Math.round(n * 1e3) / 1e3).toString();
const ringD = (ring) => `M${ring.map((p) => `${num(p.x)},${num(p.y)}`).join("L")}Z`;
/** Außenring und Löcher in einem Pfad — `evenodd` lässt die Löcher offen. */
const polygonD = (poly) => [poly.outer, ...poly.holes].map(ringD).join("");
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Alle Formen samt Seite, damit nichts abgeschnitten wird, was außerhalb der Seite liegt. */
function ausdehnung(shapes, widthMm, heightMm) {
  let minX = 0;
  let minY = 0;
  let maxX = widthMm;
  let maxY = heightMm;
  for (const s of shapes) {
    if (s.kind !== "area") continue;
    for (const p of s.polygon.outer) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Das Vorschaubild als SVG (Modulkopf). Maße in Millimetern der Vorlage, dargestellt mit
 * `pxBreite` Pixeln in der Breite. `heightMm` ist die Höhe der SVG (0, wenn sie keine nennt —
 * dann gelten die Formen).
 */
export function feinheitSvg(
  shapes,
  result,
  { name, heightMm = 0, pxBreite = 1400, beschriftet = 25 },
) {
  const box = ausdehnung(shapes, result.widthMm, heightMm);
  const w = box.maxX - box.minX;
  const h = box.maxY - box.minY;
  // Schrift in Millimetern, so bemessen, dass sie in jedem Logo gleich groß auf dem Bild steht.
  const font = w / 62;
  const kopf = font * 4.6;
  const px = pxBreite / w;
  const { satin, luecke } = befundeJeArt(result);
  const rang = new Map(result.findings.map((f, i) => [f, i + 1]));
  const marken = result.findings.slice(0, beschriftet);

  const out = [];
  out.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(w * px)}" height="${Math.ceil((h + kopf) * px)}" ` +
      `viewBox="${num(box.minX)} ${num(box.minY - kopf)} ${num(w)} ${num(h + kopf)}">`,
  );
  out.push(`<title>Feinheit (Spec §5.2) — ${esc(name)}</title>`);
  out.push(
    `<rect x="${num(box.minX)}" y="${num(box.minY - kopf)}" width="${num(w)}" height="${num(h + kopf)}" fill="#fff"/>`,
  );

  // Kopf: was geprüft wurde, das Ergebnis, was die Farben bedeuten.
  const d = result.decisive;
  const kopfZeilen = [
    [`Feinheit (Spec §5.2) — ${name}`, true],
    [
      `${mm(result.widthMm, 1)} mm breit · ` +
        (d
          ? `Mindestgröße ${Math.ceil(result.minimumWidthMm)} mm (${ART[d.kind]} ${d.id}, ${mm(d.measuredMm)} mm)`
          : `keine zu feinen Elemente`),
      false,
    ],
    [`${zahl(satin, "Satinstrich", "Satinstriche")} · ${zahl(luecke, "Lücke", "Lücken")}`, false],
    [
      `grau: alle Formen · rot: zu fein · beschriftet: die ${marken.length} mit der größten ` +
        `Mindestbreite (L Lücke, S Satinstrich; Nummer wie in der Liste)`,
      false,
    ],
  ];
  kopfZeilen.forEach(([text, fett], i) => {
    out.push(
      `<text x="${num(box.minX + font * 0.6)}" y="${num(box.minY - kopf + font * (1.25 + 1.05 * i))}" ` +
        `font-family="sans-serif" font-size="${num(fett ? font * 1.15 : font * 0.85)}" ` +
        `${fett ? `font-weight="bold" ` : ""}fill="#222">${esc(text)}</text>`,
    );
  });

  // Die Umrisse zeigen den Aufbau auch dort, wo Formen gleichen Grau übereinanderliegen (ein
  // Hintergrund über die ganze Seite, Flächen auf Flächen).
  out.push(
    `<g fill="${GRAU}" fill-rule="evenodd" stroke="${GRAU_LINIE}" stroke-width="${num(0.8 / px)}" ` +
      `stroke-linejoin="round">`,
  );
  for (const s of shapes) if (s.kind === "area") out.push(`<path d="${polygonD(s.polygon)}"/>`);
  out.push(`</g>`);

  // Die Umrandung gibt einer Lücke von einem Viertelmillimeter auf dem Bild mindestens
  // anderthalb Pixel: ohne sie verschwände sie im Grau. Die Füllung ist der Befund.
  out.push(
    `<g fill="${ROT}" fill-rule="evenodd" stroke="${ROT}" stroke-width="${num(1.5 / px)}" stroke-linejoin="round">`,
  );
  for (const f of result.findings) out.push(`<path d="${polygonD(f.polygon)}"/>`);
  out.push(`</g>`);

  // Beschriftung: erst mit weißem Rand, dann die Schrift — auch auf dem Grau lesbar.
  const label = (f) => `${f.kind === "gap" ? "L" : "S"}${rang.get(f)}`;
  for (const pass of [0, 1]) {
    out.push(
      `<g font-family="sans-serif" font-size="${num(font)}" font-weight="bold" text-anchor="middle" ` +
        (pass === 0
          ? `fill="#fff" stroke="#fff" stroke-width="${num(font * 0.32)}" stroke-linejoin="round">`
          : `fill="#8a0000">`),
    );
    for (const f of marken) {
      out.push(`<text x="${num(f.at.x)}" y="${num(f.at.y + font * 0.35)}">${label(f)}</text>`);
    }
    out.push(`</g>`);
  }
  out.push(`</svg>`);
  return out.join("\n") + "\n";
}

/**
 * Das Vorschaubild als PNG. `canvas` hängt am Render-Paket (dort ist es installiert, die
 * Engine kennt es nicht): es wird von dort geladen, nicht aus dem Stamm. Gezeichnet wird das
 * SVG, damit Bild und Datei dasselbe zeigen.
 */
export async function svgZuPng(svgText) {
  const { createCanvas, loadImage } = createRequire(
    new URL("../packages/render/package.json", import.meta.url),
  )("canvas");
  const image = await loadImage(Buffer.from(svgText, "utf8"));
  const canvas = createCanvas(image.width, image.height);
  canvas.getContext("2d").drawImage(image, 0, 0);
  return canvas.toBuffer("image/png");
}
