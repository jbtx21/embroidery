#!/usr/bin/env python3
"""
Generic headless starter for Ink/Stitch extensions.

    python inkstitch/run.py --extension=<name> [--id=<id>]... [--<option>=<value>]... <in.svg>

Runs a single Ink/Stitch extension (one class in inkstitch-src/lib/extensions/)
outside of Inkscape, the way Inkscape itself would invoke it: as a subprocess
whose argv Ink/Stitch parses itself (inkstitch.py's own argument handling:
module-level code up to Ink/Stitch 3.3.0, a main() in later development
versions -- runpy runs either). This script only wires up the three things
Inkscape normally provides and a plain "python inkstitch.py ..." does not:

- A stub for `wx` (see wx_stub.py) -- lib/extensions/__init__.py imports all
  ~80 extensions, and eight of them import wx at module level even though
  most extensions never touch it at runtime. wxPython has no Linux wheel on
  PyPI, so we fake the module instead of building it.
- Ink/Stitch's own source directory on sys.path (INKSTITCH_SRC).
- lib.gui.abort_message.AbortMessageApp patched to print to stderr instead
  of opening a wx dialog nobody is there to see (see patch_abort_message_app
  below) -- CLAUDE.md "keine stillen Reparaturen": a message Ink/Stitch would
  otherwise show in a GUI dialog must not just vanish because nothing is
  there to show it.

stdout carries exactly the extension's own output and nothing else: DST
bytes for `--extension=output --format=dst`, the modified SVG for an effect
extension such as fill_to_satin or auto_satin (Ink/Stitch writes the result
document to sys.stdout.buffer when no --output is given -- see inkex's
InkscapeExtension.run()/save_raw()). stderr carries whatever Ink/Stitch
itself writes there: inkex.errormsg() already goes to stderr on its own;
the AbortMessageApp patch below covers the messages that otherwise would
not.

One process per extension: chaining several stitch-editing extensions means
running this script several times, feeding the SVG result of one call into
the next (tools/inkstitch-lauf.mjs runs one call; the caller chains them).
"""

import os
import runpy
import sys
from pathlib import Path

THIS_DIR = Path(__file__).resolve().parent

DEFAULT_INKSTITCH_HOME = Path.home() / ".cache" / "texma-stitch"

USAGE = (
    "Aufruf: python inkstitch/run.py --extension=<name> [--id=<id>]... "
    "[--<option>=<wert>]... <in.svg>"
)


def resolve_inkstitch_src() -> Path:
    """INKSTITCH_SRC overrides; otherwise $INKSTITCH_HOME/inkstitch, and
    INKSTITCH_HOME defaults to ~/.cache/texma-stitch (see setup.sh)."""
    env_src = os.environ.get("INKSTITCH_SRC")
    if env_src:
        return Path(env_src).expanduser().resolve()
    env_home = os.environ.get("INKSTITCH_HOME")
    home_dir = Path(env_home).expanduser().resolve() if env_home else DEFAULT_INKSTITCH_HOME
    return home_dir / "inkstitch"


def patch_abort_message_app() -> None:
    """
    Ink/Stitch surfaces some messages only through a wx dialog:
    lib/gui/abort_message.py's AbortMessageApp(message, url), a wx.App
    subclass whose OnInit() opens a window with the message and whose
    MainLoop() runs the (real) event loop. Six extensions use it for the
    case where they have nothing embroiderable to work with -- fill_to_satin
    is the one this project actually drives headless
    (lib/extensions/fill_to_satin.py: FillToSatin.print_error(), called e.g.
    when a fill has no rungs selected).

    With wx_stub installed, AbortMessageApp still imports fine (it is a
    class definition, module-level code only) and instantiates without
    error, but MainLoop() on a stub object is a silent no-op: the message
    the user would have seen in the dialog just disappears. That is exactly
    the "stille Reparatur" CLAUDE.md forbids, so this replaces the class
    with one that prints the same message to stderr instead.

    Must run BEFORE `lib.extensions` (and so before inkstitch.py's own
    main()) is imported: every extension that uses AbortMessageApp imports
    it by value (`from ..gui.abort_message import AbortMessageApp`) at
    module load time, which binds whatever `lib.gui.abort_message.AbortMessageApp`
    is *at that moment*. Importing lib.gui.abort_message here first and
    patching the attribute on the already-loaded module means every later
    `from ..gui.abort_message import AbortMessageApp` (inside fill_to_satin,
    satin_multicolor, lettering, element_info, tartan, apply_palette) picks
    up the replacement, because a module is only ever executed once and
    every one of those imports resolves against the same module object.
    """
    import lib.gui.abort_message as abort_message

    class AbortMessageApp:
        """Headless replacement: prints to stderr instead of doing nothing
        (CLAUDE.md: keine stillen Reparaturen). Keeps the same constructor
        and MainLoop() shape as the wx.App original so call sites
        (`app = AbortMessageApp(message, url); app.MainLoop()`) do not
        need to change."""

        def __init__(self, message, url=None):
            self.message = message
            self.url = url
            text = f"Ink/Stitch: {message}"
            if url:
                text += f"\n{url}"
            print(text, file=sys.stderr)

        def MainLoop(self):  # noqa: N802 -- matches wx.App's method name
            return True

    abort_message.AbortMessageApp = AbortMessageApp


def main() -> None:
    args = sys.argv[1:]
    if not args or not any(a.startswith("--extension=") for a in args):
        print(USAGE, file=sys.stderr)
        sys.exit(2)

    positional = [a for a in args if not a.startswith("-")]
    if len(positional) != 1:
        print(
            f"FEHLER: genau ein SVG-Pfad erwartet, {len(positional)} gefunden: {positional}\n{USAGE}",
            file=sys.stderr,
        )
        sys.exit(2)
    svg_arg = positional[0]
    svg_path = Path(svg_arg)
    if not svg_path.is_file():
        print(f"FEHLER: SVG-Datei nicht gefunden: {svg_arg}", file=sys.stderr)
        sys.exit(2)
    # Resolve while the caller's cwd is still in effect -- we chdir into
    # INKSTITCH_SRC further down.
    svg_abs = str(svg_path.resolve())

    inkstitch_src = resolve_inkstitch_src()
    entry_point = inkstitch_src / "inkstitch.py"
    if not entry_point.is_file():
        print(
            f"FEHLER: Ink/Stitch nicht gefunden unter {inkstitch_src} (INKSTITCH_SRC). "
            "Einrichtung fehlt oder ist unvollstaendig -- bash inkstitch/setup.sh ausfuehren.",
            file=sys.stderr,
        )
        sys.exit(1)

    sys.path.insert(0, str(THIS_DIR))
    import wx_stub  # noqa: E402

    wx_stub.install()

    sys.path.insert(0, str(inkstitch_src))

    # Matches the working directory the proven scratchpad run used. Ink/Stitch's
    # own resource lookup is script-relative either way (lib/utils/paths.py,
    # get_resource_dir) so this is belt and braces, not a known requirement.
    os.chdir(inkstitch_src)

    patch_abort_message_app()

    # Everything the caller passed except the svg path, in the order given,
    # plus the resolved absolute svg path at the end. inkstitch.py's own
    # ArgumentParser pulls out --extension itself (module level in 3.3.0, main() in
    # later development versions); each extension's own arg_parser pulls out --id
    # (repeatable) and its --<option>s from what remains (lib/extensions/base.py,
    # inkex's EffectExtension/SvgInputMixin).
    forwarded = [a for a in args if a.startswith("-")]
    sys.argv = ["inkstitch.py", *forwarded, svg_abs]

    runpy.run_path(str(entry_point), run_name="__main__")


if __name__ == "__main__":
    main()
