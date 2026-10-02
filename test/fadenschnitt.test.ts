import { describe, expect, it } from "vitest";
import { trimLines } from "../tools/fadenschnitt.mjs";

type Reason = "forced" | "short" | "hidden" | "stitched" | "long" | "visible";
const decision = (id: string, cut: boolean, reason: Reason, visibleMm: number) => ({
  id,
  cut,
  reason,
  lengthMm: 4,
  visibleMm,
});

describe("trimLines (die Ausgabe der Fadenschnitt-Regel, Spec §10.2.1)", () => {
  it("nennt die geprüften Verbindungen, die Schnitte und warum sie bleiben oder entfallen", () => {
    const decisions = [
      decision("a", true, "long", 4),
      decision("b", true, "long", 0.2),
      decision("c", true, "visible", 3),
      decision("d", false, "hidden", 0.4),
      decision("e", false, "hidden", 0),
      decision("f", false, "stitched", 0.1),
    ];
    const lines = trimLines({
      plan: { decisions, cut: ["a", "b", "c"], stitched: [{ id: "f", lengthMm: 6 }] },
      probe: { moves: 6, cuts: 6 },
      fallback: undefined,
    });
    expect(lines).toEqual([
      "Fadenschnitte (Spec §10.2.1): 6 Verbindungen ab 3 mm geprüft, 3 geschnitten, 3 ohne Schnitt",
      "  geschnitten: 2 über 5 mm lang (davon 1 verdeckt, aber über 7 mm), 1 mit über 1 mm auf blankem Stoff · ohne Schnitt: 2 verdeckt als Sprung, 1 verdeckt durchgestickt",
    ]);
  });

  it("nennt, was die Quelle verlangt hat und was Ink/Stitch ohnehin durchstickt, wo es vorkommt", () => {
    const decisions = [decision("a", true, "forced", 0), decision("b", false, "short", 2)];
    const [, second] = trimLines({
      plan: { decisions, cut: ["a"], stitched: [] },
      probe: { moves: 1, cuts: 2 },
      fallback: undefined,
    });
    expect(second).toContain("1 von der Quelle verlangt");
    expect(second).toContain("1 kurz");
  });

  it("sagt bei einer Sonde, die sich nicht zuordnen ließ, dass alle ihre Schnitte bleiben, und warum", () => {
    const lines = trimLines({
      plan: undefined,
      probe: { moves: 7, cuts: 7 },
      fallback: "Die Sonde hat 6 Trims, aber 7 Objekte tragen trim_after",
    });
    expect(lines[0]).toBe(
      "Fadenschnitte: Zuordnung nicht möglich — alle 7 Schnitte der Sonde bleiben",
    );
    expect(lines[1]).toContain("6 Trims, aber 7 Objekte");
  });
});
