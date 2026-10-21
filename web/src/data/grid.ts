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

/**
 * Indexy výrezu [y0, y1) × [x0, x1) mriežky s rozmermi ny × nx a bboxom stredov buniek,
 * ktorý pokryje `crop` (orezané na mriežku). Vracia aj bbox stredov krajných buniek výrezu.
 */
export function cropRanges(
  bbox: [number, number, number, number],
  ny: number,
  nx: number,
  crop: [number, number, number, number],
): { y0: number; y1: number; x0: number; x1: number; bbox: [number, number, number, number] } {
  const [latMin, lonMin, latMax, lonMax] = bbox;
  const dlat = (latMax - latMin) / (ny - 1);
  const dlon = (lonMax - lonMin) / (nx - 1);
  const clamp = (v: number, n: number) => Math.max(0, Math.min(n, v));
  const y0 = clamp(Math.floor((crop[0] - latMin) / dlat), ny - 1);
  const y1 = clamp(Math.ceil((crop[2] - latMin) / dlat) + 1, ny);
  const x0 = clamp(Math.floor((crop[1] - lonMin) / dlon), nx - 1);
  const x1 = clamp(Math.ceil((crop[3] - lonMin) / dlon) + 1, nx);
  return {
    y0,
    y1,
    x0,
    x1,
    bbox: [latMin + y0 * dlat, lonMin + x0 * dlon, latMin + (y1 - 1) * dlat, lonMin + (x1 - 1) * dlon],
  };
}
