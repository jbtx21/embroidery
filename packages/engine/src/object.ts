/** Common questions about a stitch object: where it starts, what it covers. */
import type { Point, Polygon } from "@texma-stitch/geometry";
import { polygonBbox } from "@texma-stitch/geometry";
import { satinOutline } from "./satin.js";
import type { StitchObject } from "./types.js";

/** Rough start point — for ordering and distances, not for stitches. */
export function objectStart(obj: StitchObject): Point {
  switch (obj.type) {
    case "fill": {
      const b = polygonBbox(obj.shape);
      return obj.startPoint ?? { x: b.minX, y: b.maxY };
    }
    case "satin":
      return obj.railA[0] ?? { x: 0, y: 0 };
    case "running":
      return obj.path[0] ?? { x: 0, y: 0 };
    case "text":
      return obj.origin;
  }
}

/**
 * The area this object covers later on. Running stitches and text cover nothing,
 * so they have no polygon.
 */
export function coverPolygon(obj: StitchObject): Polygon | undefined {
  switch (obj.type) {
    case "fill":
      return obj.shape;
    case "satin":
      return satinOutline(obj.railA, obj.railB);
    case "running":
    case "text":
      return undefined;
  }
}

/** Ordering rank: areas first, outlines last (spec §10.1). */
export function orderRank(obj: StitchObject): number {
  switch (obj.type) {
    case "fill":
      return 0;
    case "satin":
      return 1;
    case "text":
      return 2;
    case "running":
      return 3;
  }
}
