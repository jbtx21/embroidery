/**
 * Runs a single Ink/Stitch extension as its own subprocess
 * (docs/adr/0001-inkstitch-als-stich-engine.md, decision 28.09.2026: Ink/Stitch generates
 * the stitches, TEXMA Stitch prepares the template and checks the result).
 * Ink/Stitch itself is never imported into this repo -- it is cloned next to
 * it by inkstitch/setup.sh and driven through inkstitch/run.py. See
 * inkstitch/README.md for the environment variables this module reads
 * (INKSTITCH_HOME / INKSTITCH_SRC / INKSTITCH_PYTHON) and their defaults.
 *
 * One call runs one extension. Chaining several (fill_to_satin -> auto_satin
 * -> output) is the caller's job: run one, write its stdout to a temp SVG,
 * feed that path into the next call.
 */
import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RUN_PY = resolve(REPO_ROOT, "inkstitch", "run.py");

const DEFAULT_INKSTITCH_HOME = resolve(homedir(), ".cache", "texma-stitch");

/** $INKSTITCH_HOME, defaulting to ~/.cache/texma-stitch (inkstitch/setup.sh). */
export function inkstitchHome() {
  return process.env.INKSTITCH_HOME ? resolve(process.env.INKSTITCH_HOME) : DEFAULT_INKSTITCH_HOME;
}

/** $INKSTITCH_SRC overrides; otherwise $INKSTITCH_HOME/inkstitch. */
export function inkstitchSrc() {
  return process.env.INKSTITCH_SRC
    ? resolve(process.env.INKSTITCH_SRC)
    : resolve(inkstitchHome(), "inkstitch");
}

/** $INKSTITCH_PYTHON overrides; otherwise $INKSTITCH_HOME/venv/bin/python3. */
export function inkstitchPython() {
  return process.env.INKSTITCH_PYTHON
    ? resolve(process.env.INKSTITCH_PYTHON)
    : resolve(inkstitchHome(), "venv", "bin", "python3");
}

/** True once inkstitch/setup.sh has run: the checkout and the interpreter both exist. */
export function isInkstitchReady() {
  return existsSync(resolve(inkstitchSrc(), "inkstitch.py")) && existsSync(inkstitchPython());
}

export const SETUP_HINT = "Ink/Stitch fehlt — `bash inkstitch/setup.sh` ausführen";

/**
 * Runs one Ink/Stitch extension on `svg` and resolves with its raw output.
 * Rejects (with stderr attached to the message) if the process is missing,
 * fails to start, or exits with a non-zero code -- never resolves with a
 * partial or guessed result (CLAUDE.md: keine stillen Reparaturen).
 *
 * @param {object} args
 * @param {string} args.extension Extension name, e.g. "output", "fill_to_satin", "auto_satin".
 * @param {string[]} [args.ids] Element ids to select (repeatable --id=<id>).
 * @param {Record<string, string | number | boolean>} [args.options] Extra --<key>=<value> options
 *   (e.g. { format: "dst" } or { trim: true }).
 * @param {string} args.svg Path to the input SVG.
 * @returns {Promise<{ stdout: Buffer, stderr: string, ms: number }>}
 */
export function runInkstitch({ extension, ids = [], options = {}, svg }) {
  if (!extension) throw new Error("runInkstitch: extension fehlt");
  if (!svg) throw new Error("runInkstitch: svg fehlt");
  if (!isInkstitchReady()) {
    return Promise.reject(new Error(SETUP_HINT));
  }

  const args = [
    RUN_PY,
    `--extension=${extension}`,
    ...ids.map((id) => `--id=${id}`),
    ...Object.entries(options).map(([key, value]) => `--${key}=${value}`),
    svg,
  ];

  return new Promise((resolvePromise, reject) => {
    const started = performance.now();
    let child;
    try {
      child = spawn(inkstitchPython(), args, {
        env: { ...process.env, INKSTITCH_SRC: inkstitchSrc() },
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (err) {
      reject(new Error(`Ink/Stitch-Prozess nicht startbar (${inkstitchPython()}): ${err.message}`));
      return;
    }

    const stdoutChunks = [];
    const stderrChunks = [];
    child.stdout.on("data", (chunk) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk) => stderrChunks.push(chunk));

    child.on("error", (err) => {
      reject(new Error(`Ink/Stitch-Prozess nicht startbar (${inkstitchPython()}): ${err.message}`));
    });

    child.on("close", (code) => {
      const ms = performance.now() - started;
      const stdout = Buffer.concat(stdoutChunks);
      const stderr = Buffer.concat(stderrChunks).toString("utf8");
      if (code !== 0) {
        reject(
          new Error(
            `Ink/Stitch (--extension=${extension}) endete mit Code ${code} nach ${(ms / 1000).toFixed(1)} s` +
              (stderr ? `\n${stderr}` : ""),
          ),
        );
        return;
      }
      resolvePromise({ stdout, stderr, ms });
    });
  });
}
