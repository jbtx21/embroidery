/**
 * Die Pipeline (Kap. 4):
 *
 *   Design → validate → expand → order → generate → connect → tie → post
 *          → analyze → StitchPlan
 *
 * `generate` ist die einzige teure Stufe und deshalb die einzige gecachte:
 * `hash(objekt.params + objekt.geometrie + preset)` → Stichblock. Alles ab
 * `connect` laeuft immer, weil es billig ist und von der Nachbarschaft der
 * Objekte abhaengt.
 */
import type { Point } from "@texma-stitch/geometry";
import { isGeometryReady } from "@texma-stitch/geometry";
import { analyze } from "./analyze.js";
import type { ConnectOptions, RohBlock } from "./connect.js";
import { CONNECT_STANDARD, connectBlocks } from "./connect.js";
import { expand } from "./expand.js";
import type { FontRegistry } from "./font.js";
import { generateFill } from "./fill.js";
import { stableHash } from "./hash.js";
import { deckPolygon } from "./objekt.js";
import { autoOrder } from "./order.js";
import { postProcess } from "./post.js";
import type { MachineProfile } from "./presets.js";
import { MASCHINE_STANDARD, preset as presetOf } from "./presets.js";
import { generateRunning } from "./running.js";
import { generateSatin } from "./satin.js";
import { tieBlocks } from "./tie.js";
import type { Design, StitchObject, StitchPlan, Warning } from "./types.js";
import { validate } from "./validate.js";
import { warne, WARNUNG } from "./warnings.js";

/** Cache fuer Stichbloecke je Objekt (Kap. 4). */
export interface StitchCache {
  get(key: string): Point[] | undefined;
  set(key: string, value: Point[]): void;
}

export function createCache(): StitchCache {
  const map = new Map<string, Point[]>();
  return {
    get: (key) => map.get(key),
    set: (key, value) => {
      map.set(key, value);
    },
  };
}

export type PlanOptions = {
  maschine?: MachineProfile;
  connect?: ConnectOptions;
  cache?: StitchCache;
  fonts?: FontRegistry;
  /** "design" (Standard) nimmt die Objektliste, "auto" den Vorschlag (Kap. 10.1). */
  order?: "design" | "auto";
};

/** Stiche eines einzelnen Objekts — ohne Verbindungen, ohne Verriegelung. */
export function generateObject(obj: StitchObject): { punkte: Point[]; warnings: Warning[] } {
  switch (obj.type) {
    case "running":
      return { punkte: generateRunning(obj), warnings: [] };
    case "satin": {
      const r = generateSatin(obj);
      return { punkte: r.stitches, warnings: r.warnings };
    }
    case "fill": {
      const r = generateFill(obj);
      return { punkte: r.stitches, warnings: r.warnings };
    }
    case "text":
      // Text ist nach `expand` keiner mehr; kommt trotzdem einer an, ist das ein
      // Fehler in der Reihenfolge und kein stiller Ausfall.
      return {
        punkte: [],
        warnings: [
          warne(
            WARNUNG.UNSUPPORTED_OBJECT,
            "Text wurde nicht aufgeloest — `expand` lief nicht.",
            "error",
            obj.id,
          ),
        ],
      };
  }
}

export function planDesign(design: Design, opts: PlanOptions = {}): StitchPlan {
  if (!isGeometryReady()) {
    throw new Error("Engine nicht initialisiert — vor dem Planen `await initEngine()` aufrufen.");
  }
  const maschine = opts.maschine ?? MASCHINE_STANDARD;
  const preset = presetOf(design.preset);
  const warnings: Warning[] = [];

  const geprueft = validate(design);
  warnings.push(...geprueft.warnings);

  const aufgeloest = expand(geprueft.objects, { preset, fonts: opts.fonts });
  warnings.push(...aufgeloest.warnings);

  const geordnet =
    opts.order === "auto" ? autoOrder(aufgeloest.objects) : aufgeloest.objects;

  const rohe: RohBlock[] = [];
  for (const obj of geordnet) {
    const key = stableHash(obj, design.preset);
    let punkte = opts.cache?.get(key);
    if (!punkte) {
      const erzeugt = generateObject(obj);
      warnings.push(...erzeugt.warnings);
      punkte = erzeugt.punkte;
      opts.cache?.set(key, punkte);
    }
    if (punkte.length === 0) continue;
    const deckung = deckPolygon(obj);
    rohe.push({
      objectId: obj.id,
      threadIndex: obj.threadIndex,
      punkte,
      trimAfter: obj.trimAfter,
      ...(deckung ? { deckung } : {}),
    });
  }

  if (rohe.length === 0) {
    return {
      blocks: [],
      stats: {
        stitches: 0,
        jumps: 0,
        trims: 0,
        colorChanges: 0,
        bboxMm: { w: 0, h: 0 },
        runtimeSec: 0,
        densityMax: 0,
      },
      warnings,
    };
  }

  const verbunden = connectBlocks(rohe, opts.connect ?? CONNECT_STANDARD);
  const verriegelt = tieBlocks(verbunden);
  const fertig = postProcess(verriegelt, maschine.maxJumpMm);

  const { stats, warnings: analyseWarnungen } = analyze(fertig, maschine);
  warnings.push(...analyseWarnungen);

  return { blocks: fertig, stats, warnings };
}
