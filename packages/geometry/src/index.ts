/** Geometry module (spec §5). Unit: millimetres, SVG coordinates (y down). */
export type { Point, Polyline, Polygon, Rect } from "./types.js";
export * from "./vec.js";
export * from "./flatten.js";
export * from "./path-data.js";
export * from "./simplify.js";
export * from "./measure.js";
export * from "./resample.js";
export * from "./polygon.js";
export * from "./transform.js";
export * from "./clip.js";
export * from "./boolean.js";
export * from "./offset.js";
export * from "./edge-index.js";
export * from "./travel.js";
export * from "./delaunay.js";
export * from "./medial-axis.js";
export { initGeometry, isGeometryReady, ringsToPolygons, SCALE } from "./clipper.js";
