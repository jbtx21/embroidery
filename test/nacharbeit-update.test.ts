/**
 * settleUpdate (tools/nacharbeit.mjs): lets Ink/Stitch open the Nacharbeit file the way Inkscape will and
 * says whether it would change. The real thing runs in the smoke test (RUN_INKSTITCH_TESTS=1, test/
 * inkstitch.smoke.test.ts); here Ink/Stitch is replaced by an answer per call, to hold every branch.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runInkstitch = vi.fn();
vi.mock("../tools/inkstitch-lauf.mjs", () => ({
  runInkstitch: (args: unknown) => runInkstitch(args),
}));

const { settleUpdate } = await import("../tools/nacharbeit.mjs");

const versioned = (v: number): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkstitch="http://inkstitch.org/namespace"><metadata>` +
  `<inkstitch:inkstitch_svg_version>${v}</inkstitch:inkstitch_svg_version></metadata></svg>`;
const answer = (text: string) => ({ stdout: Buffer.from(text), stderr: "", ms: 100 });

let dir: string;
let file: string;
beforeEach(() => {
  runInkstitch.mockReset();
  dir = mkdtempSync(join(tmpdir(), "texma-settle-"));
  file = join(dir, "n.svg");
  writeFileSync(file, versioned(0));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("settleUpdate", () => {
  it("asks update_svg from the current version of the format, on the file", async () => {
    runInkstitch.mockResolvedValue(answer(""));
    await settleUpdate(file);
    expect(runInkstitch).toHaveBeenCalledTimes(1);
    expect(runInkstitch).toHaveBeenCalledWith({
      extension: "update_svg",
      options: { "update-from": 4 },
      svg: file,
    });
  });

  it("finds nothing to do where Ink/Stitch saves nothing: the file stays as it is", async () => {
    runInkstitch.mockResolvedValue(answer(""));
    expect(await settleUpdate(file)).toEqual({
      checked: true,
      changed: false,
      settled: true,
      ms: 100,
    });
    expect(readFileSync(file, "utf8")).toBe(versioned(0));
  });

  it("replaces the file with the updated document, and asks once more", async () => {
    runInkstitch.mockResolvedValueOnce(answer(versioned(4))).mockResolvedValueOnce(answer(""));
    const r = await settleUpdate(file);
    expect(r).toMatchObject({ checked: true, changed: true, settled: true });
    expect(readFileSync(file, "utf8")).toBe(versioned(4));
    expect(runInkstitch).toHaveBeenCalledTimes(2);
  });

  it("says it is not settled where Ink/Stitch still changes the file the second time", async () => {
    runInkstitch.mockResolvedValue(answer(versioned(4)));
    expect(await settleUpdate(file)).toMatchObject({
      checked: true,
      changed: true,
      settled: false,
    });
  });

  it("says it is not settled where the updated document does not carry the version", async () => {
    runInkstitch.mockResolvedValueOnce(answer(versioned(3))).mockResolvedValueOnce(answer(""));
    expect(await settleUpdate(file)).toMatchObject({ changed: true, settled: false });
  });

  it("says it could not ask, with the first line of why, and leaves the file alone", async () => {
    runInkstitch.mockRejectedValue(
      new Error("Ink/Stitch (--extension=update_svg) endete mit Code 1\nTraceback …"),
    );
    expect(await settleUpdate(file)).toEqual({
      checked: false,
      error: "Ink/Stitch (--extension=update_svg) endete mit Code 1",
    });
    expect(readFileSync(file, "utf8")).toBe(versioned(0));
  });
});
