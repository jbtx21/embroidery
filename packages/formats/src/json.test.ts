import { beforeAll, describe, expect, it } from "vitest";
import { initGeometry } from "@texma-stitch/geometry";
import { planDesign } from "@texma-stitch/engine";
import { polygonOf, rect } from "../../engine/test/fixtures/shapes.js";
import { design, fillObject, THREAD_BLACK } from "../../engine/test/fixtures/designs.js";
import {
  fromNeutralJson,
  NEUTRAL_JSON_VERSION,
  stringifyNeutralJson,
  toNeutralJson,
} from "./json.js";

beforeAll(async () => {
  await initGeometry();
});

const plan = () => planDesign(design([fillObject("f", polygonOf(rect(0, 0, 10, 10)))]));

describe("neutral JSON", () => {
  it("round-trips", () => {
    const neutral = toNeutralJson(plan(), "Probe", [THREAD_BLACK]);
    const back = fromNeutralJson(stringifyNeutralJson(neutral));
    expect(back.plan.stats).toEqual(neutral.plan.stats);
    expect(back.unit).toBe("mm");
    expect(back.threads[0]!.hex).toBe(THREAD_BLACK.hex);
  });

  it("serialises the same plan to the same text", () => {
    const p = plan();
    const a = stringifyNeutralJson(toNeutralJson(p, "Probe", [THREAD_BLACK]));
    const b = stringifyNeutralJson(toNeutralJson(p, "Probe", [THREAD_BLACK]));
    expect(a).toBe(b);
  });

  it("keeps the tie flag", () => {
    const text = stringifyNeutralJson(toNeutralJson(plan(), "Probe", []));
    expect(text).toContain('"tie":true');
  });

  it("carries the current version", () => {
    expect(NEUTRAL_JSON_VERSION).toBe(1);
    expect(toNeutralJson(plan(), "x", []).version).toBe(NEUTRAL_JSON_VERSION);
  });

  it("rejects a foreign version", () => {
    expect(() => fromNeutralJson(JSON.stringify({ version: 99 }))).toThrow();
  });
});
