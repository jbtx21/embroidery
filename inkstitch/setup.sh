#!/usr/bin/env bash
# Sets up Ink/Stitch as its own process, entirely outside this repo (GPL-3.0;
# see inkstitch/README.md -- Ink/Stitch is never copied into the repo, only
# cloned next to it and driven as a subprocess by inkstitch/run.py).
#
#   bash inkstitch/setup.sh
#
# Idempotent: once set up, a repeat run is a no-op in well under a second
# (MARKER_FILE below, keyed on requirements.txt + the pinned commit + the
# resolved python/src paths). Steps: check/install the system packages
# PyGObject and pycairo need to build, clone Ink/Stitch at INKSTITCH_COMMIT,
# create a venv and pip install requirements.txt, then smoke-check the
# result actually imports.
#
# Env vars:
#   INKSTITCH_HOME    Where the clone and the venv live.
#                      Default: ~/.cache/texma-stitch (holds inkstitch/ and venv/)
#   INKSTITCH_SRC     Overrides just the clone location: use this existing
#                      checkout instead of $INKSTITCH_HOME/inkstitch.
#   INKSTITCH_PYTHON  Overrides just the interpreter: install into this
#                      python instead of creating $INKSTITCH_HOME/venv.
set -euo pipefail

# Ink/Stitch 3.3.0, the official release of 31.07.2026 (ADR 0001, decision 30.09.2026):
# the version the workstation installs, so a rework in Inkscape computes like the
# pipeline. INKSTITCH_COMMIT is the COMMIT the tag points at. v3.3.0 is an annotated
# tag: `git rev-parse v3.3.0` (edcd8a4d...) names the tag object, the commit is
# `git rev-parse 'v3.3.0^{commit}'`. A version change means: new commit here, re-run
# the six motifs, hold the metrics against the previous version.
INKSTITCH_TAG="v3.3.0"
INKSTITCH_COMMIT="b0edd96311ece82ee48816dc93466274b12c2a9c"
INKSTITCH_REPO_URL="https://github.com/inkstitch/inkstitch"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REQUIREMENTS_FILE="$SCRIPT_DIR/requirements.txt"

INKSTITCH_HOME="${INKSTITCH_HOME:-$HOME/.cache/texma-stitch}"
SRC_DIR="${INKSTITCH_SRC:-$INKSTITCH_HOME/inkstitch}"
if [ -n "${INKSTITCH_PYTHON:-}" ]; then
  PYTHON_BIN="$INKSTITCH_PYTHON"
  VENV_DIR=""
else
  VENV_DIR="$INKSTITCH_HOME/venv"
  PYTHON_BIN="$VENV_DIR/bin/python3"
fi
MARKER_FILE="$INKSTITCH_HOME/.setup-ok"

fail() {
  echo "FEHLER: $1" >&2
  exit 1
}

command -v python3 >/dev/null 2>&1 || fail "python3 nicht gefunden."
command -v git >/dev/null 2>&1 || fail "git nicht gefunden."
[ -f "$REQUIREMENTS_FILE" ] || fail "requirements.txt fehlt: $REQUIREMENTS_FILE"

# --- idempotency marker -------------------------------------------------
marker_value() {
  {
    cat "$REQUIREMENTS_FILE"
    echo "commit:$INKSTITCH_COMMIT"
    echo "python:$PYTHON_BIN"
    echo "src:$SRC_DIR"
  } | sha256sum | cut -d' ' -f1
}
EXPECTED_MARKER="$(marker_value)"

if [ -f "$MARKER_FILE" ] \
  && [ "$(cat "$MARKER_FILE" 2>/dev/null)" = "$EXPECTED_MARKER" ] \
  && [ -f "$SRC_DIR/inkstitch.py" ] \
  && [ -x "$PYTHON_BIN" ]; then
  echo "Ink/Stitch ist eingerichtet (INKSTITCH_HOME=$INKSTITCH_HOME) -- nichts zu tun."
  exit 0
fi

echo "Ink/Stitch-Einrichtung: INKSTITCH_HOME=$INKSTITCH_HOME"
mkdir -p "$INKSTITCH_HOME"

# --- 1. system packages (only what's missing, only with apt-get + root) -
# PyGObject and pycairo compile a small C extension against GObject
# Introspection and Cairo; without the matching -dev packages the pip
# install below fails deep inside a meson build with a pkg-config error.
PY_MINOR="$(python3 -c 'import sys; print(f"{sys.version_info[0]}.{sys.version_info[1]}")' 2>/dev/null || true)"
REQUIRED_APT_PKGS=(libgirepository-2.0-dev gobject-introspection libcairo2-dev pkg-config python3-dev)
if [ -n "$PY_MINOR" ]; then
  REQUIRED_APT_PKGS+=("python${PY_MINOR}-dev")
fi

MISSING_PKGS=()
for pkg in "${REQUIRED_APT_PKGS[@]}"; do
  dpkg -s "$pkg" >/dev/null 2>&1 || MISSING_PKGS+=("$pkg")
done

if [ "${#MISSING_PKGS[@]}" -gt 0 ]; then
  if command -v apt-get >/dev/null 2>&1 && [ "$(id -u)" = "0" ]; then
    echo "Installiere fehlende System-Pakete: ${MISSING_PKGS[*]}"
    apt-get update -qq || fail "apt-get update fehlgeschlagen."
    apt-get install -y --no-install-recommends "${MISSING_PKGS[@]}" \
      || fail "apt-get install fehlgeschlagen fuer: ${MISSING_PKGS[*]}"
  else
    fail "Fehlende System-Pakete: ${MISSING_PKGS[*]}. Bitte als root installieren: apt-get update && apt-get install -y ${MISSING_PKGS[*]}"
  fi
fi

# --- 2. Ink/Stitch source at the pinned commit --------------------------
if [ -n "${INKSTITCH_SRC:-}" ]; then
  [ -f "$SRC_DIR/inkstitch.py" ] \
    || fail "INKSTITCH_SRC=$SRC_DIR gesetzt, aber dort liegt kein inkstitch.py -- Pfad pruefen oder INKSTITCH_SRC entfernen, damit hierhin geklont wird."
  ACTUAL_COMMIT="$(git -C "$SRC_DIR" rev-parse HEAD 2>/dev/null || true)"
  if [ "$ACTUAL_COMMIT" != "$INKSTITCH_COMMIT" ]; then
    echo "Hinweis: $SRC_DIR steht auf Commit ${ACTUAL_COMMIT:-unbekannt}, eingerichtet ist gegen $INKSTITCH_COMMIT getestet." >&2
  fi
else
  ACTUAL_COMMIT=""
  [ -d "$SRC_DIR/.git" ] && ACTUAL_COMMIT="$(git -C "$SRC_DIR" rev-parse HEAD 2>/dev/null || true)"
  if [ "$ACTUAL_COMMIT" != "$INKSTITCH_COMMIT" ]; then
    # A clone that stood on another commit: the switch is reported at the end (the
    # stitch-plan cache outlives the clone and does not know the version).
    SWITCHED_FROM="$ACTUAL_COMMIT"
    echo "Hole Ink/Stitch $INKSTITCH_TAG ($INKSTITCH_COMMIT) nach $SRC_DIR"
    rm -rf "$SRC_DIR"
    mkdir -p "$SRC_DIR"
    git -C "$SRC_DIR" init -q
    git -C "$SRC_DIR" remote add origin "$INKSTITCH_REPO_URL"
    # By commit first (GitHub serves any commit a ref still reaches, and the release
    # tag keeps this one reachable); if the commit is refused, the tag. Either way the
    # commit is checked below, so a tag that was moved cannot pass.
    if ! git -C "$SRC_DIR" fetch --depth 1 origin "$INKSTITCH_COMMIT" 2>/dev/null; then
      echo "Commit nicht direkt abrufbar -- hole den Tag $INKSTITCH_TAG"
      git -C "$SRC_DIR" fetch --depth 1 origin "refs/tags/$INKSTITCH_TAG" \
        || fail "git fetch fehlgeschlagen ($INKSTITCH_REPO_URL @ $INKSTITCH_COMMIT bzw. Tag $INKSTITCH_TAG). Netzwerk pruefen."
    fi
    git -C "$SRC_DIR" checkout -q FETCH_HEAD
    ACTUAL_COMMIT="$(git -C "$SRC_DIR" rev-parse HEAD)"
    [ "$ACTUAL_COMMIT" = "$INKSTITCH_COMMIT" ] \
      || fail "Commit-Pruefung fehlgeschlagen: erwartet $INKSTITCH_COMMIT, erhalten $ACTUAL_COMMIT."
  fi
fi

# --- 3. venv + pip install ------------------------------------------------
if [ -n "${INKSTITCH_PYTHON:-}" ]; then
  [ -x "$PYTHON_BIN" ] || fail "INKSTITCH_PYTHON=$PYTHON_BIN ist nicht ausfuehrbar."
elif [ ! -x "$PYTHON_BIN" ]; then
  echo "Lege venv an: $VENV_DIR"
  python3 -m venv "$VENV_DIR" || fail "python3 -m venv fehlgeschlagen ($VENV_DIR)."
fi

echo "Installiere Python-Pakete ($REQUIREMENTS_FILE)"
"$PYTHON_BIN" -m pip install --disable-pip-version-check --quiet --upgrade pip \
  || fail "pip-Upgrade fehlgeschlagen ($PYTHON_BIN)."
"$PYTHON_BIN" -m pip install --disable-pip-version-check -r "$REQUIREMENTS_FILE" \
  || fail "pip install fehlgeschlagen ($REQUIREMENTS_FILE)."

# --- 4. smoke-check ---------------------------------------------------
"$PYTHON_BIN" -c "import inkex, lxml, shapely, networkx, PIL, cairo, gi" \
  || fail "Smoke-Test fehlgeschlagen: Kernpakete lassen sich mit $PYTHON_BIN nicht importieren."

echo "$EXPECTED_MARKER" > "$MARKER_FILE"
# Ink/Stitch keeps every stitch plan it computes in $XDG_CONFIG_HOME/inkstitch/cache
# (default ~/.config/inkstitch/cache), under a key that names the element and its
# neighbours but not the version: after a switch an old plan can come back as if the
# new version had computed it. Nothing outside INKSTITCH_HOME is touched here.
SWITCH_NOTE=""
if [ -n "${SWITCHED_FROM:-}" ]; then
  SWITCH_NOTE=" -- Umstieg von ${SWITCHED_FROM:0:7} auf ${INKSTITCH_COMMIT:0:7} ($INKSTITCH_TAG): Stichplan-Cache leeren: rm -rf \"\${XDG_CONFIG_HOME:-\$HOME/.config}/inkstitch/cache\""
fi
echo "Ink/Stitch eingerichtet: SRC=$SRC_DIR PYTHON=$PYTHON_BIN$SWITCH_NOTE"
