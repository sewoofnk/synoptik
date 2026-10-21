// Izočiary z poľa: marching squares (d3-contour) → GeoJSON LineString.
// Čisté funkcie (bežia vo Web Workeri, testované vo Vitest).

import { contours } from "d3-contour";
import type { Grid } from "../data/grid";

export interface ContourRequest {
  data: Float32Array;
  grid: Grid;
  /** Interval izočiar (SI) */
  interval: number;
  /** Faktor zriedenia mriežky (priemer blokov factor×factor) – vyhladí šum a zrýchli výpočet */
  factor: number;
}

export interface ContourFeature {
  type: "Feature";
  properties: { v: number };
  geometry: { type: "LineString"; coordinates: [number, number][] };
}

/** Zriedenie priemerom blokov; vracia nové pole a zodpovedajúcu mriežku */
export function downsample(data: Float32Array, g: Grid, f: number): { data: Float32Array; grid: Grid } {
  if (f <= 1) return { data, grid: g };
  const nx = Math.floor(g.nx / f), ny = Math.floor(g.ny / f);
  const out = new Float32Array(nx * ny);
  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) {
      let s = 0, n = 0;
      for (let dy = 0; dy < f; dy++) {
        for (let dx = 0; dx < f; dx++) {
          const v = data[(y * f + dy) * g.nx + x * f + dx]!;
          if (!Number.isNaN(v)) { s += v; n++; }
        }
      }
      out[y * nx + x] = n ? s / n : NaN;
    }
  }
  return {
    data: out,
    grid: {
      nx, ny,
      lat0: g.lat0 + ((f - 1) / 2) * g.dlat,
      lon0: g.lon0 + ((f - 1) / 2) * g.dlon,
      dlat: g.dlat * f,
      dlon: g.dlon * f,
    },
  };
}

export function thresholds(min: number, max: number, interval: number): number[] {
  const out: number[] = [];
  for (let t = Math.ceil(min / interval) * interval; t <= max; t += interval) out.push(Math.round(t * 1e6) / 1e6);
  return out;
}

/**
 * d3-contour vracia uzavreté polygóny; tam, kde kontúra vyjde z mriežky, sa uzavrie po okraji.
 * Body na okraji (presne 0 alebo n) vyhodíme a čiaru v nich rozdelíme.
 */
export function ringsToLines(ring: [number, number][], nx: number, ny: number): [number, number][][] {
  const onEdge = ([x, y]: [number, number]) => x <= 0 || y <= 0 || x >= nx || y >= ny;
  const lines: [number, number][][] = [];
  let cur: [number, number][] = [];
  for (const p of ring) {
    if (onEdge(p)) {
      if (cur.length > 1) lines.push(cur);
      cur = [];
    } else cur.push(p);
  }
  if (cur.length > 1) lines.push(cur);
  // uzavretá kontúra bez okraja: prvý a posledný úsek spojiť, ak ring začína uprostred čiary
  if (lines.length > 1 && !onEdge(ring[0]!) && !onEdge(ring[ring.length - 1]!)) {
    const last = lines.pop()!;
    lines[0] = [...last, ...lines[0]!];
  }
  return lines;
}

export function computeContours(req: ContourRequest): ContourFeature[] {
  const { data, grid } = downsample(req.data, req.grid, req.factor);
  let min = Infinity, max = -Infinity;
  for (const v of data) if (!Number.isNaN(v)) { if (v < min) min = v; if (v > max) max = v; }
  if (!Number.isFinite(min)) return [];
  const th = thresholds(min, max, req.interval);
  const gen = contours().size([grid.nx, grid.ny]).thresholds(th).smooth(true);
  // d3: hodnota i leží v strede pixelu [i, i+1] → súradnica x = i + 0.5
  const toLonLat = ([x, y]: [number, number]): [number, number] => [
    Math.round((grid.lon0 + (x - 0.5) * grid.dlon) * 1e4) / 1e4,
    Math.round((grid.lat0 + (y - 0.5) * grid.dlat) * 1e4) / 1e4,
  ];
  const out: ContourFeature[] = [];
  for (const mp of gen(Array.from(data))) {
    for (const polygon of mp.coordinates) {
      for (const ring of polygon) {
        for (const line of ringsToLines(ring as [number, number][], grid.nx, grid.ny)) {
          out.push({
            type: "Feature",
            properties: { v: mp.value },
            geometry: { type: "LineString", coordinates: line.map(toLonLat) },
          });
        }
      }
    }
  }
  return out;
}
