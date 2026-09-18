#!/usr/bin/env python3
"""Kreuzpruefung (Kap. 13.2): denselben Stichplan mit pyembroidery nach DST schreiben.

Liest auf stdin ein JSON {"label": str, "stitches": [[x, y, cmd], ...]} mit
Koordinaten in DST-Einheiten (0,1 mm, y nach unten) und schreibt die DST-Datei
auf stdout. Bewusst ueber DstWriter.write statt write_dst: die hoehere Ebene
normalisiert den Plan (Spruenge interpolieren, Verriegelungen ergaenzen) und
wuerde etwas anderes vergleichen als unsere Engine erzeugt.
"""
import io
import json
import sys

from pyembroidery import EmbPattern
from pyembroidery.EmbConstant import COLOR_CHANGE, END, JUMP, STITCH, STOP, TRIM
import pyembroidery.DstWriter as DstWriter

BEFEHL = {
    "stitch": STITCH,
    "jump": JUMP,
    "trim": TRIM,
    "color": COLOR_CHANGE,
    "stop": STOP,
    "end": END,
}


def main() -> int:
    daten = json.load(sys.stdin)
    muster = EmbPattern()
    muster.stitches = [[x, y, BEFEHL[cmd]] for x, y, cmd in daten["stitches"]]
    muster.extras["name"] = daten.get("label", "Untitled")
    # DstWriter fuellt den Header ueber f.tell() auf — stdout kann das nicht,
    # also erst in den Speicher schreiben.
    puffer = io.BytesIO()
    DstWriter.write(muster, puffer)
    sys.stdout.buffer.write(puffer.getvalue())
    return 0


if __name__ == "__main__":
    sys.exit(main())
