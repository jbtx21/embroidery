/**
 * Ausgabe der Feinheits-Prüfung (docs/Engine-Spezifikation.md §5.2): Textzeilen für die
 * Konsole und das Vorschaubild, gemeinsam für tools/mindestgroesse.mjs (die ganze Liste) und
 * tools/inkstitch.mjs (der Abschnitt „Feinheit“). Gerechnet wird in
 * packages/engine/src/inkstitch/min-size.ts — hier steht nur, wie es aussieht.
 *
 * Zwei Zahlen (Spec §5.2, zweite Fassung): die **Mindestgröße** aus den Satinstrichen allein
 * und „**Lücken offen ab**“ aus den Lücken; beide mit dem Element, das sie bestimmt. Zu den
 * Lücken zählen die Lücken innerhalb einer Farbe (L) und die **Stofflücken** zwischen Farben
 * (F, Spec „Stofflücken zwischen Farben“): Stoff, der zwischen zwei Elementen offen bleibt.
 *
 * **Prüfstellen des Tors** (Spec §5.2, „Tor“, und §13.4; Stand 01.10.2026): wo die Prüfung die Menge der
 * Satinstriche der bestellten Größe kennt (`ordered`), unterscheidet sie zwei weitere Arten von Satin-
 * Befunden — „Erst Satin“ (E): eine Form, die in der bestellten Größe kein Satin war, in der geprüften
 * Größe Satin ist und unter ihrer Grenze liegt; und „Satin knapp“ (K): ein Satinstrich, der hält, aber
 * schmaler ist als die übliche Säule (1,3 mm). Beide bestimmen die Größe nicht; sie stehen als
 * Prüfstellen in der Nacharbeit-Datei, und `pruefstellenZeile` zählt sie.
 *
 * Das Vorschaubild: alle Formen hellgrau, jeder Befund farbig (ein Satinstrich als Form in Rot,
 * eine Lücke in Rot und eine Stofflücke in Blau als das Stück, das das Schließen ergänzt hat),
 * die größten und die beiden bestimmenden Elemente mit ihrer Nummer aus der Liste beschriftet.
 * Blau, weil eine Stofflücke oft neben einem roten Satinstrich liegt (der Spalt zwischen einem
 * Buchstaben und der Schattenlinie) und in demselben Rot nicht zu erkennen wäre. Nichts davon
 * geht in die Vorlage — die Prüfung meldet nur.
 */
import { Buffer } from "node:buffer";
import { createRequire } from "node:module";
import { URL } from "node:url";
import { GAP_SLIVER_MM, GAP_THIN_MM } from "@texma-stitch/engine";

/** Millimeter mit Punkt, wie die übrigen Werkzeuge ihre Zahlen drucken. */
export const mm = (value, digits = 2) => value.toFixed(digits);

export const ART = {
  "satin-stroke": "Satinstrich",
  "satin-late": "Erst Satin",
  "satin-near": "Satin knapp",
  gap: "Lücke",
  "fabric-gap": "Stofflücke",
};

/** Der Buchstabe vor der Nummer im Vorschaubild: S Satinstrich, E erst Satin, K knapp, L Lücke, F Stofflücke. */
const KENNUNG = {
  "satin-stroke": "S",
  "satin-late": "E",
  "satin-near": "K",
  gap: "L",
  "fabric-gap": "F",
};

/** Eine Grenze: „1.0“, „0.8“, „0.65“ — ganze Zahlen mit einer Stelle, sonst so, wie sie ist. */
const grenze = (value) => (Number.isInteger(value) ? value.toFixed(1) : String(value));

/** „hält ab“ wird aufgerundet: „ab 246 mm“ ist dann wahr, „ab 245 mm“ nicht. */
const haeltAb = (f) => `${Math.ceil(f.holdsFromWidthMm)} mm`;

/** Wohin man schauen muss, als „(x, y)“ in Millimetern der SVG. */
const lage = (f) => `(${mm(f.at.x, 1)}, ${mm(f.at.y, 1)})`;

const zahl = (n, eins, viele) => `${n} ${n === 1 ? eins : viele}`;

/** Wie viele Befunde jeder Art es gibt; `spaet` und `knapp` sind die Prüfstellen des Tors. */
export function befundeJeArt(result) {
  const je = (kind) => result.findings.filter((f) => f.kind === kind).length;
  return {
    satin: je("satin-stroke"),
    luecke: je("gap"),
    stoff: je("fabric-gap"),
    spaet: je("satin-late"),
    knapp: je("satin-near"),
  };
}

/**
 * Die Prüfstellen des Tors an Satinstrichen in einer Größe, als eine Zeile: wie viele Formen erst in
 * dieser Größe Satin sind und unter ihrer Grenze liegen, und wie viele Satinstriche von der Grenze bis
 * unter die übliche Säule breit sind. `findings` sind die Befunde dieser Größe (jede Art), `breiteMm`
 * die Größe, `limits` die Grenzen der Prüfung (`satinMinMm`, `typicalMm`).
 */
export function pruefstellenZeile(findings, { breiteMm, limits }) {
  const je = (kind) => findings.filter((f) => f.kind === kind).length;
  return (
    `${spalte("Prüfstellen")}${zahl(je("satin-late"), "Form", "Formen")} erst in ` +
    `${Number(breiteMm.toFixed(1))} mm Satin, unter ${grenze(limits.satinMinMm)} mm · ` +
    `${zahl(je("satin-near"), "Satinstrich", "Satinstriche")} von ${grenze(limits.satinMinMm)} ` +
    `bis unter ${grenze(limits.typicalMm)} mm`
  );
}

/** Die Beschriftungen der Zusammenfassung sind gleich breit: die Zahlen stehen untereinander. */
const spalte = (name) => name.padEnd(17);

/**
 * Was die Prüfung ergab, als Zeilen: die Mindestgröße aus den Satinstrichen mit dem Strich,
 * der sie bestimmt; „Lücken offen ab“ mit der Lücke oder Stofflücke, die es bestimmt; die Zahl
 * der Befunde je Art; und was der Filter für Lücken und für Stofflücken herausgenommen hat
 * (Regel 8: nichts verschwindet still).
 *
 * Die Mindestgröße ist hier die **Hochrechnung aus dieser einen Größe** (`result.minimumWidthMm`).
 * Wo das Tor sie gesucht hat (tools/tor.mjs, Spec §5.2), steht die gesuchte an anderer Stelle —
 * dann lässt `ohneMindestgroesse` diese Zeile weg, statt eine zweite Zahl daneben zu stellen.
 */
export function zusammenfassung(result, { ohneMindestgroesse = false } = {}) {
  const { satin, luecke, stoff } = befundeJeArt(result);
  const lines = [];

  const d = result.decisive;
  if (ohneMindestgroesse) {
    // Das Tor hat die Mindestgröße gesucht und sagt sie selbst.
  } else if (!d) {
    lines.push(`${spalte("Mindestgröße")}keine Satinstriche im Logo`);
  } else if (d.measuredMm < d.limitMm) {
    lines.push(
      `${spalte("Mindestgröße")}${Math.ceil(result.minimumWidthMm)} mm — bestimmt von ` +
        `Satinstrich ${d.id} bei ${lage(d)} mm: gemessen ${mm(d.measuredMm)} mm, Grenze ${grenze(d.limitMm)} mm`,
    );
  } else {
    // Jeder Strich hält: die Zahl sagt, wie weit das Logo schrumpfen könnte.
    lines.push(
      `${spalte("Mindestgröße")}${Math.ceil(result.minimumWidthMm)} mm — schmalster Satinstrich ` +
        `${d.id} bei ${lage(d)} mm: ${mm(d.measuredMm)} mm, Grenze ${grenze(d.limitMm)} mm; ` +
        `die bestellten ${mm(result.widthMm, 1)} mm halten`,
    );
  }

  const g = result.decisiveGap;
  if (g) {
    lines.push(
      `${spalte("Lücken offen ab")}${Math.ceil(result.gapsOpenFromWidthMm)} mm — bestimmt von ` +
        `${ART[g.kind]} ${g.id} bei ${lage(g)} mm: gemessen ${mm(g.measuredMm)} mm, Grenze ${grenze(g.limitMm)} mm`,
    );
  } else {
    lines.push(
      `${spalte("Lücken offen ab")}keine zu feinen Lücken bei ${mm(result.widthMm, 1)} mm`,
    );
  }

  lines.push(
    `${spalte("Befunde")}${zahl(satin, "Satinstrich", "Satinstriche")} unter ${grenze(result.limits.satinMinMm)} mm, ` +
      `${zahl(luecke, "Lücke", "Lücken")} unter ${grenze(result.limits.gapMinMm)} mm, ` +
      `${zahl(stoff, "Stofflücke", "Stofflücken")} (zwischen Farben) unter ${grenze(result.limits.gapMinMm)} mm`,
  );
  // Kannte die Prüfung die Menge der bestellten Größe, sind die Prüfstellen des Tors Teil des Befunds.
  if (result.ordered) {
    lines.push(
      pruefstellenZeile(result.findings, { breiteMm: result.widthMm, limits: result.limits }),
    );
  }
  const i = result.ignored;
  lines.push(
    `${spalte("Nicht gezählt")}${i.slivers} Stücke ganz von Spänen (unter ${GAP_SLIVER_MM} mm) · ` +
      `${i.thin} unter ${GAP_THIN_MM} mm Breite · ${i.compact} ohne Mittelachse ` +
      `(Ecken-Rundungen, kurze Lücken) · ${i.wide} mit gemessener Breite ab der Grenze · ` +
      `${i.covered} von einer späteren Form überdeckt (von ${result.gapPieces} Stücken des Schließens)`,
  );
  const f = result.fabricIgnored;
  lines.push(
    `${spalte("  Stofflücken:")}${f.slivers} Stücke ganz von Spänen (unter ${GAP_SLIVER_MM} mm) · ` +
      `${f.thin} unter ${GAP_THIN_MM} mm Breite · ${f.compact} ohne Mittelachse · ` +
      `${f.wide} mit gemessener Breite ab der Grenze · ${f.duplicate} schon als Lücke einer Farbe ` +
      `gemeldet (von ${result.fabricPieces} Stücken des Schließens aller Formen)`,
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
    // Eine Stofflücke gehört keiner Farbe: sie liegt zwischen den Farben der Formen ringsum.
    const hinweise = [
      f.kind === "fabric-gap" && f.color !== ""
        ? `zwischen ${f.color.split("+").join(" und ")}`
        : "",
      f.kind === "satin-late" ? "erst in dieser Größe Satin" : "",
      f.kind === "satin-near" ? "schmaler als die übliche Säule (Probestick)" : "",
      f.runningAlternative ? "alternativ Laufstich (dünne Zierlinie?)" : "",
      f.measure === "inscribed-circle" ? "Loch: Breite = einbeschriebener Kreis" : "",
    ].filter((h) => h !== "");
    const hinweis = hinweise.join("; ");
    lines.push(
      (
        `${String(i + 1).padStart(4)}  ${ART[f.kind].padEnd(11)} ${f.id.padEnd(idW)} ` +
        `${`${mm(f.measuredMm)} mm`.padStart(9)} ${`${grenze(f.limitMm)} mm`.padStart(8)} ` +
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
const BLAU = "#0057d9";

const num = (n) => (Math.round(n * 1e3) / 1e3).toString();
const ringD = (ring) => `M${ring.map((p) => `${num(p.x)},${num(p.y)}`).join("L")}Z`;
/** Außenring und Löcher in einem Pfad — `evenodd` lässt die Löcher offen. */
const polygonD = (poly) => [poly.outer, ...poly.holes].map(ringD).join("");
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Alle Formen samt Seite, damit nichts abgeschnitten wird, was außerhalb der Seite liegt. Die Seite
 * zählt nur, wo sie die Formen berührt: liegt die Zeichnung ganz neben der Seite, bestünde das
 * Bild zu großen Teilen aus Leere. (Bis 30.09.2026 zog der Import den Ursprung der viewBox nicht
 * ab, und eine SVG aus einem PDF — Hofbräu, `viewBox="29.9 367.2 …"` — lag so weit neben der
 * Seite; seit Spec §13.4 rechnet er ihn ein, die Formen liegen auf der Seite.)
 */
function ausdehnung(shapes, widthMm, heightMm) {
  const seite = { minX: 0, minY: 0, maxX: widthMm, maxY: heightMm };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of shapes) {
    if (s.kind !== "area") continue;
    for (const p of s.polygon.outer) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }
  if (minX > maxX) return seite; // keine Fläche: die Seite
  const beruehrt =
    minX <= seite.maxX && seite.minX <= maxX && minY <= seite.maxY && seite.minY <= maxY;
  if (!beruehrt) return { minX, minY, maxX, maxY };
  return {
    minX: Math.min(minX, seite.minX),
    minY: Math.min(minY, seite.minY),
    maxX: Math.max(maxX, seite.maxX),
    maxY: Math.max(maxY, seite.maxY),
  };
}

/**
 * Das Vorschaubild als SVG (Modulkopf). Maße in Millimetern der Vorlage, dargestellt mit
 * `pxBreite` Pixeln in der Breite. `heightMm` ist die Höhe der SVG (0, wenn sie keine nennt —
 * dann gelten die Formen). `mindest` ersetzt im Kopf den Text zur Mindestgröße (die Hochrechnung
 * aus dieser Größe) durch den des Tors (`torKurz`, tools/tor.mjs).
 */
export function feinheitSvg(
  shapes,
  result,
  { name, heightMm = 0, pxBreite = 1400, beschriftet = 25, mindest },
) {
  const box = ausdehnung(shapes, result.widthMm, heightMm);
  const w = box.maxX - box.minX;
  const h = box.maxY - box.minY;
  // Schrift in Millimetern, so bemessen, dass sie in jedem Logo gleich groß auf dem Bild steht.
  const font = w / 62;
  const kopf = font * 5.8;
  const px = pxBreite / w;
  const { satin, luecke, stoff, spaet, knapp } = befundeJeArt(result);
  const pruef = spaet + knapp > 0;
  const rang = new Map(result.findings.map((f, i) => [f, i + 1]));
  // Die größten, und immer die beiden Elemente, die die Zahlen bestimmen.
  const oben = Math.min(beschriftet, result.findings.length);
  const marken = result.findings.filter(
    (f, i) => i < beschriftet || f === result.decisive || f === result.decisiveGap,
  );

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

  // Kopf: was geprüft wurde, die beiden Zahlen, was die Farben bedeuten.
  const d = result.decisive;
  const g = result.decisiveGap;
  const kopfZeilen = [
    [`Feinheit (Spec §5.2) — ${name}`, true],
    [
      `${mm(result.widthMm, 1)} mm breit · ` +
        (mindest !== undefined
          ? mindest
          : d
            ? `Mindestgröße ${Math.ceil(result.minimumWidthMm)} mm ` +
              `(${d.measuredMm < d.limitMm ? "" : "schmalster "}Satinstrich ${d.id}, ${mm(d.measuredMm)} mm)`
            : `keine Satinstriche`),
      false,
    ],
    [
      (g
        ? `Lücken offen ab ${Math.ceil(result.gapsOpenFromWidthMm)} mm (${g.id}, ${mm(g.measuredMm)} mm)`
        : `keine zu feinen Lücken`) +
        ` · ${zahl(satin, "Satinstrich", "Satinstriche")} · ${zahl(luecke, "Lücke", "Lücken")}` +
        ` · ${zahl(stoff, "Stofflücke", "Stofflücken")}` +
        (pruef
          ? ` · ${zahl(spaet, "Form", "Formen")} erst Satin · ${zahl(knapp, "Satinstrich", "Satinstriche")} knapp`
          : ""),
      false,
    ],
    [
      `grau: alle Formen · rot: zu fein (ein Satinstrich als Form, eine Lücke als Stück) · ` +
        `blau: Stofflücke (Stück)`,
      false,
    ],
    [
      `beschriftet: die ${oben} mit der größten Mindestbreite und die bestimmenden · ` +
        `L Lücke, F Stofflücke, S Satinstrich${pruef ? ", E erst Satin, K knapp" : ""} · Nummer wie in der Liste`,
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
  // Rot: Satinstriche und Lücken; Blau darüber: Stofflücken.
  for (const [farbe, art] of [
    [ROT, (f) => f.kind !== "fabric-gap"],
    [BLAU, (f) => f.kind === "fabric-gap"],
  ]) {
    const befunde = result.findings.filter(art);
    if (befunde.length === 0) continue;
    out.push(
      `<g fill="${farbe}" fill-rule="evenodd" stroke="${farbe}" stroke-width="${num(1.5 / px)}" stroke-linejoin="round">`,
    );
    for (const f of befunde) out.push(`<path d="${polygonD(f.polygon)}"/>`);
    out.push(`</g>`);
  }

  // Beschriftung: erst mit weißem Rand, dann die Schrift — auch auf dem Grau lesbar.
  const label = (f) => `${KENNUNG[f.kind]}${rang.get(f)}`;
  for (const pass of [0, 1]) {
    out.push(
      `<g font-family="sans-serif" font-size="${num(font)}" font-weight="bold" text-anchor="middle" ` +
        (pass === 0
          ? `fill="#fff" stroke="#fff" stroke-width="${num(font * 0.32)}" stroke-linejoin="round">`
          : `fill="#8a0000">`),
    );
    for (const f of marken) {
      // Die Schrift einer Stofflücke ist dunkelblau wie ihr Stück (der Rand bleibt weiß).
      const farbe = pass === 1 && f.kind === "fabric-gap" ? ` fill="#00287a"` : "";
      out.push(
        `<text x="${num(f.at.x)}" y="${num(f.at.y + font * 0.35)}"${farbe}>${label(f)}</text>`,
      );
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
