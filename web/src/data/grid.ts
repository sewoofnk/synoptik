// Pravidelná lat/lon mriežka. Riadok 0 = najjužnejší (overené porovnaním s API, R-002).

export interface Grid {
  nx: number;
  ny: number;
  /** Stred bunky [0,0] */
  lat0: number;
  lon0: number;
  dlat: number;
  dlon: number;
}

/** Bbox z crs_wkt v latest.json/meta.json: BBOX[latMin, lonMin, latMax, lonMax] */
export function parseWktBbox(wkt: string): [number, number, number, number] {
  const m = /BBOX\[\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\]/.exec(wkt);
  if (!m) throw new Error("crs_wkt neobsahuje BBOX");
  return [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
}

/** Mriežka z bboxu (stredy krajných buniek) a rozmerov poľa [ny, nx] */
export function gridFromBbox(bbox: [number, number, number, number], ny: number, nx: number): Grid {
  const [latMin, lonMin, latMax, lonMax] = bbox;
  return {
    nx,
    ny,
    lat0: latMin,
    lon0: lonMin,
    dlat: (latMax - latMin) / (ny - 1),
    dlon: (lonMax - lonMin) / (nx - 1),
  };
}

export function gridLatMax(g: Grid): number {
  return g.lat0 + (g.ny - 1) * g.dlat;
}

export function gridLonMax(g: Grid): number {
  return g.lon0 + (g.nx - 1) * g.dlon;
}

/** Bilineárna interpolácia; mimo mriežky NaN */
export function sampleBilinear(g: Grid, data: ArrayLike<number>, lat: number, lon: number): number {
  const fx = (lon - g.lon0) / g.dlon;
  const fy = (lat - g.lat0) / g.dlat;
  if (fx < 0 || fy < 0 || fx > g.nx - 1 || fy > g.ny - 1) return NaN;
  const x0 = Math.min(Math.floor(fx), g.nx - 2);
  const y0 = Math.min(Math.floor(fy), g.ny - 2);
  const tx = fx - x0;
  const ty = fy - y0;
  const i = y0 * g.nx + x0;
  const a = data[i]!, b = data[i + 1]!, c = data[i + g.nx]!, d = data[i + g.nx + 1]!;
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
}

/** Hodnota najbližšej bunky (na porovnanie s API pri cell_selection=nearest) */
export function sampleNearest(g: Grid, data: ArrayLike<number>, lat: number, lon: number): number {
  const x = Math.round((lon - g.lon0) / g.dlon);
  const y = Math.round((lat - g.lat0) / g.dlat);
  if (x < 0 || y < 0 || x >= g.nx || y >= g.ny) return NaN;
  return data[y * g.nx + x]!;
}
