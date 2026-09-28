#!/usr/bin/env bash
# SessionStart hook: gets Ink/Stitch ready (docs/adr/0001-inkstitch-als-stich-engine.md,
# decision 28.09.2026) so `pnpm inkstitch` and the gated smoke test just work,
# without every session paying for it. inkstitch/setup.sh is idempotent and a
# no-op in well under a second once set up, so this is cheap after the first
# run.
#
# Never blocks the session: most work in this repo needs none of this, so a
# setup failure (no network, no apt/root for a missing system package, ...)
# prints one short hint and this hook still exits 0.
set -u

LOG="$(mktemp)"
if bash "$CLAUDE_PROJECT_DIR/inkstitch/setup.sh" >"$LOG" 2>&1; then
  echo "SessionStart: $(tail -n 1 "$LOG")"
  rm -f "$LOG"
else
  echo "SessionStart-Hinweis: Ink/Stitch-Einrichtung fehlgeschlagen -- bei Bedarf 'bash inkstitch/setup.sh' von Hand ausfuehren (Log: $LOG)."
fi
exit 0
