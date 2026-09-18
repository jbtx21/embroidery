/**
 * The subset of CanvasRenderingContext2D the renderer needs.
 *
 * Deliberately its own interface: that way the renderer runs in the browser, on
 * an OffscreenCanvas and in tests against a stub — without pulling DOM types
 * into the package. A real CanvasRenderingContext2D satisfies this interface.
 */
export interface Ctx2D {
  save(): void;
  restore(): void;
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  stroke(): void;
  fill(): void;
  arc(x: number, y: number, r: number, startAngle: number, endAngle: number): void;
  setLineDash(segments: number[]): void;
  lineWidth: number;
  lineCap: string;
  lineJoin: string;
  strokeStyle: string;
  fillStyle: string;
  globalAlpha: number;
}

/** View: world coordinates (mm) onto pixels. */
export type View = { scale: number; offsetX: number; offsetY: number };

/** A view that centres `bbox` inside a window of `w` x `h` pixels. */
export function fitView(
  bbox: { minX: number; minY: number; maxX: number; maxY: number },
  w: number,
  h: number,
  paddingPx = 20,
): View {
  const width = Math.max(bbox.maxX - bbox.minX, 1e-6);
  const height = Math.max(bbox.maxY - bbox.minY, 1e-6);
  const scale = Math.min((w - 2 * paddingPx) / width, (h - 2 * paddingPx) / height);
  return {
    scale,
    offsetX: w / 2 - ((bbox.minX + bbox.maxX) / 2) * scale,
    offsetY: h / 2 - ((bbox.minY + bbox.maxY) / 2) * scale,
  };
}
