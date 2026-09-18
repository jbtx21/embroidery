/**
 * Neutrales JSON (Kap. 13.2): der Stichplan, wie ihn `apps/api` an pyembroidery
 * weiterreicht. Bewusst duenn — das Format IST der Stichplan plus Kopfdaten.
 */
import type { StitchPlan, Thread } from "@texma-stitch/engine";

export const NEUTRAL_JSON_VERSION = 1 as const;

export type NeutralPlan = {
  version: typeof NEUTRAL_JSON_VERSION;
  name: string;
  /** Einheit der Koordinaten — immer Millimeter. */
  unit: "mm";
  threads: Thread[];
  plan: StitchPlan;
};

export function toNeutralJson(plan: StitchPlan, name: string, threads: Thread[]): NeutralPlan {
  return { version: NEUTRAL_JSON_VERSION, name, unit: "mm", threads, plan };
}

export function fromNeutralJson(text: string): NeutralPlan {
  const daten = JSON.parse(text) as NeutralPlan;
  if (daten.version !== NEUTRAL_JSON_VERSION) {
    throw new Error(`Neutrales JSON: Version ${daten.version} wird nicht gelesen.`);
  }
  return daten;
}
