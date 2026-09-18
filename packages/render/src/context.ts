/**
 * Die Teilmenge von CanvasRenderingContext2D, die der Renderer braucht.
 *
 * Bewusst als eigenes Interface: so laeuft der Renderer im Browser, auf einem
 * OffscreenCanvas und im Test gegen eine Attrappe — ohne DOM-Typen im Paket.
 * Ein echtes CanvasRenderingContext2D erfuellt dieses Interface.
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

/** Ansicht: Weltkoordinaten (mm) auf Bildpunkte. */
export type View = { scale: number; offsetX: number; offsetY: number };

/** Ansicht, die `bbox` mittig in ein Fenster von `w` x `h` Bildpunkten legt. */
export function fitView(
  bbox: { minX: number; minY: number; maxX: number; maxY: number },
  w: number,
  h: number,
  randPx = 20,
): View {
  const breite = Math.max(bbox.maxX - bbox.minX, 1e-6);
  const hoehe = Math.max(bbox.maxY - bbox.minY, 1e-6);
  const scale = Math.min((w - 2 * randPx) / breite, (h - 2 * randPx) / hoehe);
  return {
    scale,
    offsetX: w / 2 - ((bbox.minX + bbox.maxX) / 2) * scale,
    offsetY: h / 2 - ((bbox.minY + bbox.maxY) / 2) * scale,
  };
}
