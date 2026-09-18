/**
 * Core geometry types. The unit is millimetres (floating point) throughout, and
 * the coordinate system matches SVG: origin top left, y pointing down (spec §1).
 */

export type Point = { x: number; y: number };

/** A flattened path. Open unless stated otherwise. */
export type Polyline = Point[];

/**
 * Closed polygon with holes. Orientation is normalised on import: outer ring
 * clockwise, holes counter-clockwise (spec §5). The first point is NOT repeated
 * at the end — the ring closes implicitly.
 */
export type Polygon = { outer: Polyline; holes: Polyline[] };

export type Rect = { minX: number; minY: number; maxX: number; maxY: number };
