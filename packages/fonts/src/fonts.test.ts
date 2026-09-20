import { describe, expect, it } from "vitest";
import { TEST_FONT } from "../../engine/test/fixtures/font.js";
import { fontRegistry, kerningOf } from "./types.js";

describe("font registry", () => {
  it("finds a font by id", () => {
    const registry = fontRegistry([TEST_FONT]);
    expect(registry.get("test")).toBe(TEST_FONT);
    expect(registry.get("nope")).toBeUndefined();
  });

  it("reads kerning pairs, zero when absent", () => {
    expect(kerningOf(TEST_FONT, "I", "I")).toBe(-0.02);
    expect(kerningOf(TEST_FONT, "I", ".")).toBe(0);
    expect(kerningOf({ ...TEST_FONT, kerning: undefined }, "I", "I")).toBe(0);
  });
});
