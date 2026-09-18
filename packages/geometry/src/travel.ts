/**
 * Kuerzester Weg von a nach b, der im Polygon bleibt (Kap. 5, `insideTravel`).
 *
 * Sichtbarkeitsgraph ueber Kontur und Loecher plus Dijkstra. Der haeufige Fall —
 * a sieht b direkt — wird vorher abgefangen, sonst wuerde der Fill bei jedem
 * Sektionswechsel einen Graphen bauen (Kap. 8.5).
 */
import type { Point, Polygon, Polyline } from "./types.js";
import { pointInPolygon, rings } from "./polygon.js";
import { simplify } from "./simplify.js";
import { dist } from "./vec.js";

/** Grobere Vereinfachung fuer den Graphen: 0,1 mm aendern den Reiseweg nicht. */
const GRAPH_SIMPLIFY_MM = 0.1;

type Edge = { a: Point; b: Point };

function polygonEdges(poly: Polygon): Edge[] {
  const out: Edge[] = [];
  for (const ring of rings(poly)) {
    for (let i = 0; i < ring.length; i++) {
      out.push({ a: ring[i]!, b: ring[(i + 1) % ring.length]! });
    }
  }
  return out;
}

const cross2 = (ax: number, ay: number, bx: number, by: number): number => ax * by - ay * bx;

/**
 * Liegt die Strecke a-b vollstaendig im Polygon?
 *
 * Erst alle Beruehrpunkte mit der Kontur sammeln, dann die Mitte jedes Abschnitts
 * dazwischen pruefen. Das faengt auch den Fall ab, in dem die Strecke genau durch
 * einen einspringenden Eckpunkt laeuft und ausserhalb weiterlaeuft — ein reiner
 * Kreuzungstest sieht das nicht.
 */
export function segmentInside(poly: Polygon, a: Point, b: Point, edges?: Edge[]): boolean {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abLen = Math.hypot(abx, aby);
  if (abLen < 1e-9) return pointInPolygon(poly, a);

  const eps = 1e-9;
  const ts: number[] = [0, 1];
  for (const e of edges ?? polygonEdges(poly)) {
    const cdx = e.b.x - e.a.x;
    const cdy = e.b.y - e.a.y;
    const denom = cross2(abx, aby, cdx, cdy);
    const acx = e.a.x - a.x;
    const acy = e.a.y - a.y;
    if (Math.abs(denom) > eps) {
      const t = cross2(acx, acy, cdx, cdy) / denom;
      const u = cross2(acx, acy, abx, aby) / denom;
      if (t >= -eps && t <= 1 + eps && u >= -eps && u <= 1 + eps) {
        ts.push(Math.min(1, Math.max(0, t)));
      }
    } else if (Math.abs(cross2(acx, acy, abx, aby)) <= eps * Math.max(1, abLen)) {
      // kollinear: Endpunkte der Kante auf ab projizieren
      for (const p of [e.a, e.b]) {
        const t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / (abLen * abLen);
        if (t > -eps && t < 1 + eps) ts.push(Math.min(1, Math.max(0, t)));
      }
    }
  }

  ts.sort((p, q) => p - q);
  for (let i = 0; i + 1 < ts.length; i++) {
    const t0 = ts[i]!;
    const t1 = ts[i + 1]!;
    if (t1 - t0 < 1e-7) continue;
    const m = (t0 + t1) / 2;
    if (!pointInPolygon(poly, { x: a.x + abx * m, y: a.y + aby * m })) return false;
  }
  return true;
}

/**
 * Reiseweg innerhalb des Polygons. Gibt immer mindestens [a, b] zurueck: wenn
 * kein Weg im Inneren existiert (a oder b liegen draussen, oder die Form
 * zerfaellt), ist die direkte Strecke das ehrlichste Ergebnis — der Aufrufer
 * erkennt das daran, dass der Weg nicht innen liegt, und macht daraus einen
 * Sprung.
 */
export function insideTravel(poly: Polygon, a: Point, b: Point): Polyline {
  const edges = polygonEdges(poly);
  if (segmentInside(poly, a, b, edges)) return [{ ...a }, { ...b }];

  // Graph aufbauen: a, b und alle (vereinfachten) Konturpunkte.
  const nodes: Point[] = [{ ...a }, { ...b }];
  for (const ring of rings(poly)) {
    for (const p of simplify([...ring, ring[0]!], GRAPH_SIMPLIFY_MM).slice(0, -1)) {
      nodes.push({ ...p });
    }
  }

  const n = nodes.length;
  const adj: number[][] = Array.from({ length: n }, () => []);
  const cost: number[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (!segmentInside(poly, nodes[i]!, nodes[j]!, edges)) continue;
      const d = dist(nodes[i]!, nodes[j]!);
      adj[i]!.push(j);
      cost[i]!.push(d);
      adj[j]!.push(i);
      cost[j]!.push(d);
    }
  }

  // Dijkstra, lineare Auswahl — n ist die Eckenzahl einer Stickform.
  const dists = new Array<number>(n).fill(Infinity);
  const prev = new Array<number>(n).fill(-1);
  const done = new Array<boolean>(n).fill(false);
  dists[0] = 0;
  for (;;) {
    let u = -1;
    let best = Infinity;
    for (let i = 0; i < n; i++) {
      if (!done[i] && dists[i]! < best) {
        best = dists[i]!;
        u = i;
      }
    }
    if (u === -1 || u === 1) break;
    done[u] = true;
    const neighbours = adj[u]!;
    for (let k = 0; k < neighbours.length; k++) {
      const v = neighbours[k]!;
      const nd = dists[u]! + cost[u]![k]!;
      if (nd < dists[v]!) {
        dists[v] = nd;
        prev[v] = u;
      }
    }
  }

  if (!Number.isFinite(dists[1]!)) return [{ ...a }, { ...b }];

  const path: Polyline = [];
  for (let at = 1; at !== -1; at = prev[at]!) {
    path.push({ ...nodes[at]! });
    if (at === 0) break;
  }
  path.reverse();
  return path;
}
