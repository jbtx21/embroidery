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
import { applyToPolygon, rotator, scaler } from "./transform.js";

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

// ---------------------------------------------------------------------------
// Directional offset (spec §8.1.1)
// ---------------------------------------------------------------------------

/**
 * How flat the offset ellipse is made when only one direction is wanted.
 *
 * A one-sided offset is an ellipse with a zero semi-axis, which the scale trick
 * below cannot express. K = 40 leaves `delta / 40` on the other axis — 5 µm at a
 * 0.2 mm compensation, fifty times under the 0.1 mm the DST format can even
 * record (spec §8.1.1).
 */
export const ANISO_RATIO = 40;

/**
 * Offset with an ellipse instead of a circle, by doing the circle offset in a
 * stretched coordinate system: stretch the other axis by `a/b`, offset by `a`,
 * stretch back. `axis` names the direction the offset mainly acts in.
 */
function ellipticalOffset(poly: Polygon, deltaMm: number, axis: "x" | "y"): Polygon[] {
  if (deltaMm === 0) return offset(poly, 0);
  const k = ANISO_RATIO;
  const stretch = axis === "x" ? scaler(1, k) : scaler(k, 1);
  const squash = axis === "x" ? scaler(1, 1 / k) : scaler(1 / k, 1);
  return offset(applyToPolygon(stretch, poly), deltaMm).map((part) => applyToPolygon(squash, part));
}

/**
 * Pull and push are not the same direction (spec §8.1.1).
 *
 * The thread pulls the fabric together ALONG its own direction and presses it
 * apart ACROSS it, so one isotropic offset gets one of the two wrong way round.
 * `alongMm` grows the shape along `angleDeg`, `acrossMm` shrinks it across.
 */
export function offsetDirectional(
  poly: Polygon,
  alongMm: number,
  acrossMm: number,
  angleDeg: number,
): Polygon[] {
  if (alongMm === 0 && acrossMm === 0) return offset(poly, 0);

  // Turn the thread direction onto +x, compensate, turn back.
  const upright = applyToPolygon(rotator(-angleDeg), poly);
  const pulled = alongMm === 0 ? [upright] : ellipticalOffset(upright, alongMm, "x");
  const pushed =
    acrossMm === 0 ? pulled : pulled.flatMap((part) => ellipticalOffset(part, -acrossMm, "y"));
  return pushed.map((part) => applyToPolygon(rotator(angleDeg), part));
}
