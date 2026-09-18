/**
 * Polygon offset via Clipper2 (spec §5): join = round, positive outwards.
 *
 * Outwards really means outwards — holes shrink along the way because they run
 * with the opposite winding. This is the basis of pull compensation (spec §7.2,
 * §8.1) and of the underlay inset (spec §7.6, §8.6).
 */
import type { Polygon, Polyline } from "./types.js";
import {
  arcToleranceUnits,
  clipper,
  pathsToRings,
  ringsToPaths,
  ringsToPolygons,
  SCALE,
  withPaths,
} from "./clipper.js";
import { rings } from "./polygon.js";

export function offset(poly: Polygon, deltaMm: number): Polygon[] {
  if (deltaMm === 0) {
    return [
      {
        outer: poly.outer.map((p) => ({ ...p })),
        holes: poly.holes.map((h) => h.map((p) => ({ ...p }))),
      },
    ];
  }
  const c = clipper();
  const paths = ringsToPaths(rings(poly));
  return withPaths([paths], () => {
    const res = c.InflatePaths64(
      paths,
      deltaMm * SCALE,
      c.JoinType.Round,
      c.EndType.Polygon,
      2,
      arcToleranceUnits(),
    );
    return withPaths([res], () => ringsToPolygons(pathsToRings(res)));
  });
}

/** Offset applied to several polygons. */
export function offsetAll(polys: Polygon[], deltaMm: number): Polygon[] {
  return polys.flatMap((p) => offset(p, deltaMm));
}

/**
 * Shift an open polyline sideways — used for satin pull compensation on the
 * rails (spec §7.2). Clipper only offsets areas, so we do this directly: every
 * point moves along the averaged normal of its adjacent segments.
 *
 * `deltaMm > 0` shifts to the left (counter-clockwise in the SVG system).
 */
export function offsetPolyline(line: Polyline, deltaMm: number): Polyline {
  if (line.length < 2 || deltaMm === 0) return line.map((p) => ({ ...p }));
  const out: Polyline = [];
  for (let i = 0; i < line.length; i++) {
    const prev = line[i - 1];
    const cur = line[i]!;
    const next = line[i + 1];

    let nx = 0;
    let ny = 0;
    let count = 0;
    if (prev) {
      const dx = cur.x - prev.x;
      const dy = cur.y - prev.y;
      const l = Math.hypot(dx, dy);
      if (l > 1e-12) {
        nx += dy / l;
        ny += -dx / l;
        count++;
      }
    }
    if (next) {
      const dx = next.x - cur.x;
      const dy = next.y - cur.y;
      const l = Math.hypot(dx, dy);
      if (l > 1e-12) {
        nx += dy / l;
        ny += -dx / l;
        count++;
      }
    }
    if (count === 0) {
      out.push({ ...cur });
      continue;
    }
    const nl = Math.hypot(nx, ny);
    if (nl < 1e-9) {
      out.push({ ...cur }); // reversal: no meaningful normal
      continue;
    }
    // Miter correction: at a corner the point has to travel further so that the
    // offset stays perpendicular to BOTH segments. Capped so that sharp angles
    // do not throw spikes.
    const miter = Math.min(1 / Math.max(nl / count, 0.2), 4);
    out.push({ x: cur.x + (nx / nl) * deltaMm * miter, y: cur.y + (ny / nl) * deltaMm * miter });
  }
  return out;
}
