import { describe, expect, it } from "vitest";
import { TEST_FONT } from "../../engine/test/fixtures/font.js";
import { fontRegistry, kerningOf } from "./types.js";
import { importInkstitchFont } from "./import-inkstitch.js";

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

describe("Ink/Stitch converter", () => {
  it("says clearly that it is not built yet", () => {
    // CLAUDE.md rule 8: no silent guessing. The format is fixed, the data is missing.
    expect(() => importInkstitchFont("<svg/>")).toThrow(/not implemented/i);
  });
});
