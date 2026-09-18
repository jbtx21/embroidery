/**
 * Renderer (Kap. 12).
 *
 * Stich = Linie, 0,4 mm breit in WELTkoordinaten, runde Enden, leichter Schatten
 * fuer Fadenoptik. Spruenge gestrichelt grau, Trims als Kreuz, Farbwechsel als
 * Punkt. Modi: Faden, Linien, Punkte; dazu der Sequenz-Regler (`bisStich`).
 *
 * Schnell wird das durch Batching: aufeinanderfolgende Stiche derselben Farbe
 * werden zu EINEM Pfad zusammengefasst und mit zwei stroke-Aufrufen gezeichnet
 * (Schatten, dann Faden) — nicht mit zwei je Stich. Bei 50.000 Stichen ist das
 * der Unterschied zwischen 100.000 Aufrufen und ein paar Dutzend.
 */
import type { Stitch, StitchPlan, Thread } from "@texma-stitch/engine";
import type { Ctx2D, View } from "./context.js";
import { abdunkeln, ERSATZFARBE } from "./farbe.js";

export type RenderMode = "faden" | "linien" | "punkte";

export type RenderOptions = {
  mode?: RenderMode;
  threads?: Thread[];
  view: View;
  /** Nur die ersten n Stiche zeichnen — der Sequenz-Regler aus Kap. 12. */
  bisStich?: number;
  zeigeSpruenge?: boolean;
  zeigeTrims?: boolean;
  zeigeFarbwechsel?: boolean;
  /** Stichbreite in Millimetern. */
  stitchWidthMm?: number;
  /** Flaeche, die vor dem Zeichnen geleert wird (Bildpunkte). */
  clear?: { w: number; h: number };
};

export type RenderStats = {
  /** Gezeichnete Stiche. */
  stitches: number;
  /** stroke-Aufrufe — das Mass fuer die Batching-Guete. */
  strokes: number;
};

/** Ein Zug gleicher Farbe: zusammenhaengende Stiche, die am Stueck gezogen werden. */
type Zug = { farbe: string; punkte: Stitch[] };

const SPRUNG_FARBE = "#8a8a8a";
const TRIM_FARBE = "#c0392b";
const FARBWECHSEL_FARBE = "#2d6cdf";

function farbeVon(threads: Thread[] | undefined, index: number): string {
  return threads?.[index]?.hex ?? ERSATZFARBE;
}

/**
 * Zerlegt den Plan in Zuege, Spruenge, Trims und Farbwechsel. Reine Funktion —
 * hier passiert die Arbeit, das Zeichnen ist danach nur noch Ausgabe.
 */
export function planZerlegen(
  plan: StitchPlan,
  threads: Thread[] | undefined,
  bisStich?: number,
): {
  zuege: Zug[];
  spruenge: [Stitch, Stitch][];
  trims: Stitch[];
  farbwechsel: Stitch[];
  gezeichnet: number;
} {
  const zuege: Zug[] = [];
  const spruenge: [Stitch, Stitch][] = [];
  const trims: Stitch[] = [];
  const farbwechsel: Stitch[] = [];

  const grenze = bisStich ?? Number.POSITIVE_INFINITY;
  let gezaehlt = 0;
  let aktuell: Zug | undefined;
  let letzter: Stitch | undefined;

  for (const block of plan.blocks) {
    const farbe = farbeVon(threads, block.threadIndex);
    for (const s of block.stitches) {
      if (s.cmd === "stitch" || s.cmd === "jump") {
        if (gezaehlt >= grenze) {
          return { zuege, spruenge, trims, farbwechsel, gezeichnet: gezaehlt };
        }
        gezaehlt++;
      }

      switch (s.cmd) {
        case "stitch": {
          if (!aktuell || aktuell.farbe !== farbe) {
            aktuell = { farbe, punkte: [] };
            zuege.push(aktuell);
            // Der Zug beginnt dort, wo die Nadel steht — sonst fehlt der erste
            // Stich nach einem Sprung.
            if (letzter) aktuell.punkte.push(letzter);
          }
          aktuell.punkte.push(s);
          letzter = s;
          break;
        }
        case "jump": {
          if (letzter) spruenge.push([letzter, s]);
          aktuell = undefined; // Sprung unterbricht den Zug
          letzter = s;
          break;
        }
        case "trim":
          trims.push(s);
          aktuell = undefined;
          break;
        case "color":
          farbwechsel.push(s);
          aktuell = undefined;
          break;
        case "stop":
        case "end":
          aktuell = undefined;
          break;
      }
    }
  }

  return { zuege, spruenge, trims, farbwechsel, gezeichnet: gezaehlt };
}

function zugZeichnen(ctx: Ctx2D, zug: Zug): void {
  ctx.beginPath();
  const erster = zug.punkte[0]!;
  ctx.moveTo(erster.x, erster.y);
  for (let i = 1; i < zug.punkte.length; i++) {
    const p = zug.punkte[i]!;
    ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
}

export function renderPlan(ctx: Ctx2D, plan: StitchPlan, opts: RenderOptions): RenderStats {
  const mode = opts.mode ?? "faden";
  const breite = opts.stitchWidthMm ?? 0.4;
  const { view } = opts;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (opts.clear) ctx.clearRect(0, 0, opts.clear.w, opts.clear.h);
  ctx.setTransform(view.scale, 0, 0, view.scale, view.offsetX, view.offsetY);

  const zerlegt = planZerlegen(plan, opts.threads, opts.bisStich);
  let strokes = 0;

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.setLineDash([]);

  if (mode === "punkte") {
    const r = breite * 0.6;
    for (const zug of zerlegt.zuege) {
      ctx.fillStyle = zug.farbe;
      ctx.beginPath();
      for (const p of zug.punkte) {
        ctx.moveTo(p.x + r, p.y);
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      }
      ctx.fill();
    }
  } else {
    for (const zug of zerlegt.zuege) {
      if (zug.punkte.length < 2) continue;
      if (mode === "faden") {
        // Schatten: derselbe Pfad, dunkler und minimal breiter. Erst danach der
        // Faden darueber — das ergibt die Rundung, ohne je Stich zu schattieren.
        ctx.lineWidth = breite * 1.25;
        ctx.strokeStyle = abdunkeln(zug.farbe, 0.55);
        ctx.globalAlpha = 0.5;
        zugZeichnen(ctx, zug);
        strokes++;
        ctx.globalAlpha = 1;
      }
      ctx.lineWidth = mode === "faden" ? breite : breite * 0.25;
      ctx.strokeStyle = zug.farbe;
      zugZeichnen(ctx, zug);
      strokes++;
    }
  }

  if (opts.zeigeSpruenge !== false && zerlegt.spruenge.length > 0) {
    ctx.globalAlpha = 1;
    ctx.lineWidth = breite * 0.4;
    ctx.strokeStyle = SPRUNG_FARBE;
    ctx.setLineDash([0.8, 0.8]);
    ctx.beginPath();
    for (const [von, nach] of zerlegt.spruenge) {
      ctx.moveTo(von.x, von.y);
      ctx.lineTo(nach.x, nach.y);
    }
    ctx.stroke();
    strokes++;
    ctx.setLineDash([]);
  }

  if (opts.zeigeTrims !== false && zerlegt.trims.length > 0) {
    const r = breite * 1.5;
    ctx.lineWidth = breite * 0.5;
    ctx.strokeStyle = TRIM_FARBE;
    ctx.beginPath();
    for (const t of zerlegt.trims) {
      ctx.moveTo(t.x - r, t.y - r);
      ctx.lineTo(t.x + r, t.y + r);
      ctx.moveTo(t.x + r, t.y - r);
      ctx.lineTo(t.x - r, t.y + r);
    }
    ctx.stroke();
    strokes++;
  }

  if (opts.zeigeFarbwechsel !== false && zerlegt.farbwechsel.length > 0) {
    const r = breite * 1.2;
    ctx.fillStyle = FARBWECHSEL_FARBE;
    ctx.beginPath();
    for (const f of zerlegt.farbwechsel) {
      ctx.moveTo(f.x + r, f.y);
      ctx.arc(f.x, f.y, r, 0, Math.PI * 2);
    }
    ctx.fill();
  }

  ctx.restore();
  return { stitches: zerlegt.gezeichnet, strokes };
}

/** Bounding-Box aller Stiche in Millimetern — Grundlage fuer `fitView`. */
export function planBbox(plan: StitchPlan): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of plan.blocks) {
    for (const s of b.stitches) {
      if (s.cmd !== "stitch" && s.cmd !== "jump") continue;
      if (s.x < minX) minX = s.x;
      if (s.y < minY) minY = s.y;
      if (s.x > maxX) maxX = s.x;
      if (s.y > maxY) maxY = s.y;
    }
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return { minX, minY, maxX, maxY };
}
