/**
 * SVG-Vorschau des Stichplans.
 *
 * Nicht Teil von Kap. 12 — dort steht Canvas. Diese Ausgabe ist der Weg, den
 * Plan OHNE Browser anzusehen: fuer Sichtpruefungen, fuer den Stichbericht
 * (Kap. 13.3) und fuer Bilddiffs in der CI. Sie benutzt dieselbe Zerlegung wie
 * der Canvas-Renderer, zeigt also dasselbe.
 */
import type { StitchPlan, Thread } from "@texma-stitch/engine";
import { abdunkeln } from "./farbe.js";
import { planBbox, planZerlegen } from "./render.js";

export type SvgOptions = {
  threads?: Thread[];
  stitchWidthMm?: number;
  bisStich?: number;
  zeigeSpruenge?: boolean;
  zeigeTrims?: boolean;
  /** Rand um das Motiv in Millimetern. */
  randMm?: number;
  /** Bildpunkte je Millimeter. */
  pxProMm?: number;
  hintergrund?: string;
};

const zahl = (v: number): string => (Math.round(v * 1000) / 1000).toString();

const pfad = (punkte: { x: number; y: number }[]): string =>
  punkte.map((p, i) => `${i === 0 ? "M" : "L"}${zahl(p.x)} ${zahl(p.y)}`).join(" ");

export function renderPlanSvg(plan: StitchPlan, opts: SvgOptions = {}): string {
  const breite = opts.stitchWidthMm ?? 0.4;
  const rand = opts.randMm ?? 4;
  const px = opts.pxProMm ?? 4;
  const b = planBbox(plan);
  const w = b.maxX - b.minX + 2 * rand;
  const h = b.maxY - b.minY + 2 * rand;
  const zerlegt = planZerlegen(plan, opts.threads, opts.bisStich);

  const teile: string[] = [];
  teile.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${zahl(w * px)}" height="${zahl(h * px)}" viewBox="${zahl(b.minX - rand)} ${zahl(b.minY - rand)} ${zahl(w)} ${zahl(h)}">`,
  );
  teile.push(
    `<rect x="${zahl(b.minX - rand)}" y="${zahl(b.minY - rand)}" width="${zahl(w)}" height="${zahl(h)}" fill="${opts.hintergrund ?? "#f4f1ea"}"/>`,
  );

  // Schatten zuerst, damit der Faden darueber liegt — wie im Canvas-Renderer.
  teile.push(`<g fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="0.5">`);
  for (const zug of zerlegt.zuege) {
    if (zug.punkte.length < 2) continue;
    teile.push(
      `<path d="${pfad(zug.punkte)}" stroke="${abdunkeln(zug.farbe, 0.55)}" stroke-width="${zahl(breite * 1.25)}"/>`,
    );
  }
  teile.push(`</g>`);

  teile.push(`<g fill="none" stroke-linecap="round" stroke-linejoin="round">`);
  for (const zug of zerlegt.zuege) {
    if (zug.punkte.length < 2) continue;
    teile.push(
      `<path d="${pfad(zug.punkte)}" stroke="${zug.farbe}" stroke-width="${zahl(breite)}"/>`,
    );
  }
  teile.push(`</g>`);

  if (opts.zeigeSpruenge !== false && zerlegt.spruenge.length > 0) {
    const d = zerlegt.spruenge
      .map(([von, nach]) => `M${zahl(von.x)} ${zahl(von.y)}L${zahl(nach.x)} ${zahl(nach.y)}`)
      .join(" ");
    teile.push(
      `<path d="${d}" fill="none" stroke="#8a8a8a" stroke-width="${zahl(breite * 0.4)}" stroke-dasharray="0.8 0.8"/>`,
    );
  }

  if (opts.zeigeTrims !== false && zerlegt.trims.length > 0) {
    const r = breite * 1.5;
    const d = zerlegt.trims
      .map(
        (t) =>
          `M${zahl(t.x - r)} ${zahl(t.y - r)}L${zahl(t.x + r)} ${zahl(t.y + r)}M${zahl(t.x + r)} ${zahl(t.y - r)}L${zahl(t.x - r)} ${zahl(t.y + r)}`,
      )
      .join(" ");
    teile.push(
      `<path d="${d}" fill="none" stroke="#c0392b" stroke-width="${zahl(breite * 0.5)}"/>`,
    );
  }

  teile.push(`</svg>`);
  return teile.join("\n");
}
