// Načítanie jedného poľa (premenná × beh × krok) z Open-Meteo S3 do Float32Array v SI.
// Bloky súborov sa cachujú perzistentne v prehliadači (súbory behu sa nemenia),
// hotové polia v pamäti (LRU).

import { BrowserBlockCache, LruBlockCache, OmDataType, OmHttpBackendPool, type BlockCache } from "@openmeteo/file-reader";
import type { FieldSource } from "../config/layers.config";
import { Lcc, reprojectLcc } from "../lib/lcc";
import { dewpointFromRH } from "../lib/thermo";
import { cropRanges, gridFromBbox, sampleBilinear, type Grid } from "./grid";
import { partFor, stepUrl, type RunInfo } from "./openMeteoSpatial";

/** Premenná v danom kroku nie je (napr. zrážky a nárazy v kroku +0 h – sú to hodnoty za interval) */
export class MissingVariableError extends Error {
  constructor(readonly variable: string) {
    super(`Premenná ${variable} v tomto kroku nie je`);
  }
}

export interface Field {
  /** Premenná Open-Meteo, alebo odvodená, napr. "speed(wind_u_component_10m)" */
  variable: string;
  grid: Grid;
  /** Hodnoty v SI, riadok 0 = juh; NaN = bez dát */
  data: Float32Array;
  min: number;
  max: number;
}

/**
 * Prevod z jednotiek, v ktorých Open-Meteo ukladá premenné, do SI (in-place).
 * Overené porovnaním s API (R-002): teplota °C, tlak hPa, vietor m/s, zrážky mm, oblačnosť/RH %.
 */
export function convertToSI(variable: string, data: Float32Array): void {
  if (variable.startsWith("temperature_") || variable.startsWith("dew_point_")) {
    for (let i = 0; i < data.length; i++) data[i]! += 273.15;
  } else if (variable === "pressure_msl" || variable === "surface_pressure") {
    for (let i = 0; i < data.length; i++) data[i]! *= 100;
  }
}

export function minMax(data: Float32Array): [number, number] {
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < data.length; i++) {
    const v = data[i]!;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return [min, max];
}

const CACHE_NAME = "synoptik-om-v1";

/**
 * Perzistentná cache blokov (Cache API) s pádom na pamäťovú LRU – Cache API chýba mimo
 * zabezpečeného kontextu a v niektorých súkromných oknách `caches.open` vyhodí chybu.
 */
async function createBlockCache(): Promise<BlockCache<string> | BlockCache<bigint>> {
  try {
    await caches.open(CACHE_NAME);
    return new BrowserBlockCache({
      cacheName: CACHE_NAME,
      blockSize: 64 * 1024,
      memCacheTtlMs: 5_000,
      maxBytes: 400 * 1024 * 1024,
      maxConcurrentFetches: 6,
    });
  } catch (e) {
    console.warn("Cache API nedostupné, používam pamäťovú cache:", e);
    return new LruBlockCache(64 * 1024, 2048);
  }
}

const pool = new OmHttpBackendPool({ maxBackends: 128, backendOptions: { retries: 2, timeoutMs: 30_000 } });
let blockCache: Promise<BlockCache<string> | BlockCache<bigint>> | null = null;

const MAX_FIELDS = 48;
const fields = new Map<string, Promise<Field>>();

function remember(key: string, p: Promise<Field>): Promise<Field> {
  fields.set(key, p);
  // chybu necachovať – ďalší pokus sa zopakuje
  p.catch(() => fields.get(key) === p && fields.delete(key));
  while (fields.size > MAX_FIELDS) fields.delete(fields.keys().next().value!);
  return p;
}

function cached(key: string): Promise<Field> | undefined {
  const p = fields.get(key);
  if (p) {
    // obnoviť poradie LRU
    fields.delete(key);
    fields.set(key, p);
  }
  return p;
}

const lccCache = new Map<string, Lcc>();

/** Pole z projektovanej mriežky (LCC) prevzorkované na lat/lon */
function fromProjection(variable: string, raw: Float32Array, ny: number, nx: number, proj: NonNullable<RunInfo["projection"]>): Field {
  const g = proj.grid;
  if (ny !== g.ny || nx !== g.nx) throw new Error(`${variable}: mriežka ${ny}×${nx}, očakávaná ${g.ny}×${g.nx}`);
  const key = JSON.stringify(g);
  let lcc = lccCache.get(key);
  if (!lcc) lccCache.set(key, (lcc = new Lcc(g)));
  const t = proj.target;
  const r = reprojectLcc(raw, lcc, t);
  const [min, max] = minMax(r.data);
  return { variable, grid: gridFromBbox([t.latMin, t.lonMin, t.latMax, t.lonMax], r.ny, r.nx), data: r.data, min, max };
}

async function readVariable(run: RunInfo, validTime: Date, variable: string): Promise<Field> {
  const part = partFor(run, variable, validTime);
  if (!part) throw new MissingVariableError(variable);
  blockCache ??= createBlockCache();
  const cache = await blockCache;
  const url = stepUrl(part.spatialId, part.referenceTime, validTime);
  return pool.withReader(url, cache, async (root) => {
    const v = await root.getChildByName(variable);
    if (!v) throw new MissingVariableError(variable);
    try {
      const [ny, nx] = v.getDimensions() as [number, number];
      if (run.projection) {
        const raw = await v.read({ type: OmDataType.FloatArray, ranges: [{ start: 0, end: ny }, { start: 0, end: nx }] });
        convertToSI(variable, raw);
        return fromProjection(variable, raw, ny, nx, run.projection);
      }
      // globálne modely: iba výrez Európy
      const c = run.crop ? cropRanges(part.bbox, ny, nx, run.crop) : { y0: 0, y1: ny, x0: 0, x1: nx, bbox: part.bbox };
      const data = await v.read({
        type: OmDataType.FloatArray,
        ranges: [
          { start: c.y0, end: c.y1 },
          { start: c.x0, end: c.x1 },
        ],
      });
      convertToSI(variable, data);
      const [min, max] = minMax(data);
      return { variable, grid: gridFromBbox(c.bbox, c.y1 - c.y0, c.x1 - c.x0), data, min, max };
    } finally {
      v.dispose();
    }
  });
}

const fieldKey = (run: RunInfo, validTime: Date, variable: string) =>
  `${run.spatialId}|${run.referenceTime.toISOString()}|${validTime.toISOString()}|${variable}`;

export function loadField(run: RunInfo, validTime: Date, variable: string): Promise<Field> {
  // vietor 10 m len ako rýchlosť a smer (ALADIN) → zložky u/v
  if ((variable === "wind_u_component_10m" || variable === "wind_v_component_10m") && !partFor(run, variable, validTime)) {
    const u = variable.includes("_u_");
    return derived(run, validTime, `${variable}(polar)`, "wind_speed_10m", "wind_direction_10m", (s, d) =>
      // meteorologický smer = odkiaľ fúka
      u ? -s * Math.sin((d * Math.PI) / 180) : -s * Math.cos((d * Math.PI) / 180),
    );
  }
  const key = fieldKey(run, validTime, variable);
  return cached(key) ?? remember(key, readVariable(run, validTime, variable));
}

const sameGrid = (a: Grid, b: Grid) =>
  a.nx === b.nx && a.ny === b.ny && a.lat0 === b.lat0 && a.lon0 === b.lon0 && a.dlat === b.dlat && a.dlon === b.dlon;

/**
 * Polia na spoločnej mriežke. Pri rôznych mriežkach (GFS: 10 m v 0,117°, hladiny v 0,25°)
 * sa jemnejšie bilineárne prevzorkujú na najhrubšiu.
 */
export function align(fs: Field[]): { grid: Grid; arrays: Float32Array[] } {
  const target = fs.reduce((g, f) => (f.grid.dlat > g.dlat ? f.grid : g), fs[0]!.grid);
  const arrays = fs.map((f) => {
    if (sameGrid(f.grid, target)) return f.data;
    const out = new Float32Array(target.nx * target.ny);
    for (let y = 0; y < target.ny; y++) {
      const lat = target.lat0 + y * target.dlat;
      for (let x = 0; x < target.nx; x++) out[y * target.nx + x] = sampleBilinear(f.grid, f.data, lat, target.lon0 + x * target.dlon);
    }
    return out;
  });
  return { grid: target, arrays };
}

/** Odvodené pole z dvoch premenných (bunka po bunke), cachované pod vlastným kľúčom */
function derived(
  run: RunInfo,
  validTime: Date,
  name: string,
  a: string,
  b: string,
  f: (x: number, y: number) => number,
): Promise<Field> {
  const key = fieldKey(run, validTime, name);
  return (
    cached(key) ??
    remember(
      key,
      Promise.all([loadField(run, validTime, a), loadField(run, validTime, b)]).then((fs) => {
        const { grid, arrays } = align(fs);
        const [da, db] = arrays as [Float32Array, Float32Array];
        const data = new Float32Array(da.length);
        for (let i = 0; i < data.length; i++) data[i] = f(da[i]!, db[i]!);
        const [min, max] = minMax(data);
        return { variable: name, grid, data, min, max };
      }),
    )
  );
}

/** Rýchlosť vetra z u/v zložiek */
export function loadSpeed(run: RunInfo, validTime: Date, u: string, v: string): Promise<Field> {
  return derived(run, validTime, `speed(${u})`, u, v, Math.hypot);
}

/** Pole podľa zdroja vrstvy (priama premenná alebo odvodené) */
export function loadSource(run: RunInfo, validTime: Date, src: FieldSource): Promise<Field> {
  switch (src.kind) {
    case "scalar":
      return loadField(run, validTime, src.variable);
    case "speed":
      // model s vetrom 10 m iba ako rýchlosť a smer → rýchlosť priamo (nie z interpolovaných u/v)
      if (src.u === "wind_u_component_10m" && !partFor(run, src.u, validTime)) return loadField(run, validTime, "wind_speed_10m");
      return loadSpeed(run, validTime, src.u, src.v);
    case "dewpoint":
      return derived(run, validTime, `dewpoint(${src.t})`, src.t, src.rh, dewpointFromRH);
    case "diff":
      return derived(run, validTime, `diff(${src.a},${src.b})`, src.a, src.b, (x, y) => x - y);
    case "vdiff":
      return derived2(run, validTime, `vdiff(${src.u1},${src.u2})`, [src.u1, src.v1, src.u2, src.v2], ([u1, v1, u2, v2]) =>
        Math.hypot(u1! - u2!, v1! - v2!),
      );
  }
}

/** Odvodené pole zo štyroch premenných (strih vetra) */
function derived2(run: RunInfo, validTime: Date, name: string, vars: string[], f: (x: number[]) => number): Promise<Field> {
  const key = fieldKey(run, validTime, name);
  return (
    cached(key) ??
    remember(
      key,
      Promise.all(vars.map((v) => loadField(run, validTime, v))).then((fs) => {
        const { grid, arrays } = align(fs);
        const n = arrays[0]!.length;
        const data = new Float32Array(n);
        const buf = new Array<number>(arrays.length);
        for (let i = 0; i < n; i++) {
          for (let k = 0; k < arrays.length; k++) buf[k] = arrays[k]![i]!;
          data[i] = f(buf);
        }
        const [min, max] = minMax(data);
        return { variable: name, grid, data, min, max };
      }),
    )
  );
}
