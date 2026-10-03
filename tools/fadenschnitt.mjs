/**
 * The thread cuts of an Ink/Stitch run (spec §10.2.1, packages/engine/src/inkstitch/trims.ts): which
 * of the cuts between two objects of one colour stay, and the document with exactly those.
 *
 * Ink/Stitch writes a cut only where an object carries `inkstitch:trim_after` (or a trim command, which
 * `auto_satin --trim` sets: for every jump of a run whose part outside both columns is over 1 mm and
 * at the end of every run, whatever follows). So the run is routed without `--trim`, and the cuts are
 * set here, from what Ink/Stitch really stitches:
 *
 * 1. The probe: `jump_to_trim` from `PROBE_MIN_MM` (1 mm: a shorter move cannot lie more than that on
 *    bare fabric) puts a cut after every object that is followed by a move of that length or more —
 *    those Ink/Stitch writes as a jump (over 3 mm) and those it would stitch straight on. Its document
 *    is stitched (`output`), and every one of those moves is now a trim in the DST with its two ends
 *    in place.
 * 2. `planTrims` reads that DST: the k-th trim is the cut after the k-th object that carries
 *    `trim_after` in the probe document, and the rule (spec §10.2.1: short, hidden, stitched, visible,
 *    long) says which of them stay.
 * 3. `withoutTrimAfter` takes the cuts that do not stay out of the probe document again, and
 *    `withMinJumpLength` tells Ink/Stitch to stitch across the hidden connections between 5 and 7 mm
 *    (no jump may stay open). What is left is the document `pnpm inkstitch` stitches, and the one the
 *    Nacharbeit file is made from — an Ink/Stitch output like the document `jump_to_trim` alone used
 *    to leave, with its document version.
 *
 * A probe that cannot be matched (a different number of trims than objects with `trim_after`) is not
 * guessed at: every cut of the probe stays and the result says so (`fallback`) — more cuts than
 * needed, but no thread on the fabric that the rule would have had to judge.
 */
import { readFileSync, writeFileSync } from "node:fs";
import {
  blockColoursOf,
  HIDDEN_JUMP_MAX_MM,
  HIDDEN_STITCH_MAX_MM,
  PLAIN_STITCH_MM,
  planTrims,
  PROBE_MIN_MM,
  trimAfterIds,
  VISIBLE_MAX_MM,
  withMinJumpLength,
  withoutTrimAfter,
} from "@texma-stitch/engine";
import { readDst, unitsToMm } from "@texma-stitch/formats";
import { runInkstitch } from "./inkstitch-lauf.mjs";

/** The stitches of an Ink/Stitch DST, in mm. */
const stitchesOf = (bytes) => unitsToMm(readDst(new Uint8Array(bytes)).stitches);

/**
 * Sets the cuts of a routed document (module doc).
 *
 * @param {object} args
 * @param {string} args.routedPath the document after `auto_satin` (without `--trim`)
 * @param {string} args.probePath where the probe document goes (the routed one with a cut after every jump)
 * @param {string} args.outPath where the document goes that has the cuts that stay
 * @param {string[]} [args.colours] the colour of every object of the template, in stitch order: the
 *   colour blocks of the DST are known from it, and blocks of one colour hide each other's thread
 * @returns {Promise<{
 *   plan: import("@texma-stitch/engine").TrimPlan | undefined,
 *   probe: { moves: number, cuts: number },
 *   own: number,
 *   fallback: string | undefined,
 *   calls: { what: string, ms: number }[],
 *   stderr: string[],
 * }>}
 */
export async function setTrims({ routedPath, probePath, outPath, colours }) {
  const calls = [];
  const stderr = [];
  const run = async (what, args) => {
    const result = await runInkstitch(args);
    calls.push({ what, ms: result.ms });
    if (result.stderr.trim()) {
      stderr.push(
        ...result.stderr
          .trim()
          .split("\n")
          .map((l) => `${what}: ${l}`),
      );
    }
    return result;
  };

  const routed = readFileSync(routedPath, "utf8");
  // Cuts the source asked for stay whatever the rule says: they are in the routed document already
  // (the probe's `jump_to_trim` leaves an object that carries one as it is).
  const own = new Set(trimAfterIds(routed));

  const probe = await run("jump_to_trim (Sonde)", {
    extension: "jump_to_trim",
    options: { "minimum-jump-length": PROBE_MIN_MM },
    svg: routedPath,
  });
  const probeSvg = probe.stdout.toString("utf8");
  writeFileSync(probePath, probeSvg);
  const flagged = trimAfterIds(probeSvg);

  const dst = await run("output --format=dst (Sonde)", {
    extension: "output",
    options: { format: "dst" },
    svg: probePath,
  });
  const stitches = stitchesOf(dst.stdout);

  const targets = flagged.map((id) => ({ id, forced: own.has(id) }));
  const result = {
    probe: { moves: targets.length - own.size, cuts: targets.length },
    own: own.size,
    calls,
    stderr,
  };
  // The colours of the blocks are only believed where they make as many blocks as the DST has.
  const changes = stitches.filter((s) => s.cmd === "color").length;
  const blockColours = colours === undefined ? undefined : blockColoursOf(colours);
  const known = blockColours !== undefined && blockColours.length === changes + 1;
  try {
    const plan = planTrims(stitches, targets, known ? { blockColours } : {});
    const gone = plan.decisions.filter((d) => !d.cut).map((d) => d.id);
    writeFileSync(outPath, withMinJumpLength(withoutTrimAfter(probeSvg, gone), plan.stitched));
    return { ...result, plan, fallback: undefined };
  } catch (err) {
    // Not matched: every cut of the probe stays.
    writeFileSync(outPath, probeSvg);
    return { ...result, plan: undefined, fallback: err.message };
  }
}

/**
 * The lines of the output of `pnpm inkstitch` about the cuts: how many moves of 1 mm and more the rule
 * judged, how many of the cuts stay and why, how many do not.
 */
export function trimLines({ plan, probe, fallback }) {
  if (plan === undefined) {
    return [
      `Fadenschnitte: Zuordnung nicht möglich — alle ${probe.cuts} Schnitte der Sonde bleiben`,
      `  (${fallback})`,
    ];
  }
  const by = { forced: 0, short: 0, hidden: 0, stitched: 0, long: 0, visible: 0 };
  for (const d of plan.decisions) by[d.reason]++;
  const kept = plan.decisions.length - plan.cut.length;
  // Hidden and yet cut: too long to stitch across, and no jump may stay open (spec §10.2.1).
  const hiddenLong = plan.decisions.filter(
    (d) => d.reason === "long" && d.visibleMm <= VISIBLE_MAX_MM,
  ).length;
  // Short and yet cut: a stitch Ink/Stitch would have set straight on, over bare fabric.
  const visibleShort = plan.decisions.filter(
    (d) => d.reason === "visible" && d.lengthMm <= PLAIN_STITCH_MM,
  ).length;
  return [
    `Fadenschnitte (Spec §10.2.1): ${plan.decisions.length} Verbindungen ab ${PROBE_MIN_MM} mm geprüft, ` +
      `${plan.cut.length} geschnitten, ${kept} ohne Schnitt`,
    `  geschnitten: ${by.long} über ${HIDDEN_JUMP_MAX_MM} mm lang (davon ${hiddenLong} verdeckt, aber über ` +
      `${HIDDEN_STITCH_MAX_MM} mm), ${by.visible} mit über ${VISIBLE_MAX_MM} mm auf blankem Stoff` +
      (visibleShort > 0 ? ` (davon ${visibleShort} bis ${PLAIN_STITCH_MM} mm lang)` : "") +
      (by.forced > 0 ? `, ${by.forced} von der Quelle verlangt` : "") +
      ` · ohne Schnitt: ${by.hidden} verdeckt als Sprung, ${by.stitched} verdeckt durchgestickt` +
      (by.short > 0 ? `, ${by.short} verdeckt als Stich bis ${PLAIN_STITCH_MM} mm` : ""),
  ];
}
