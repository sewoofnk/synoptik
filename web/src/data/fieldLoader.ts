// Načítanie jedného poľa (premenná × beh × krok) z Open-Meteo S3 do Float32Array v SI.
// Bloky súborov sa cachujú perzistentne v prehliadači (súbory behu sa nemenia),
// hotové polia v pamäti (LRU).

import { BrowserBlockCache, LruBlockCache, OmDataType, OmHttpBackendPool, type BlockCache } from "@openmeteo/file-reader";
import { gridFromBbox, type Grid } from "./grid";
import { stepUrl, type RunInfo } from "./openMeteoSpatial";

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

async function readVariable(run: RunInfo, validTime: Date, variable: string): Promise<Field> {
  blockCache ??= createBlockCache();
  const cache = await blockCache;
  const url = stepUrl(run.spatialId, run.referenceTime, validTime);
  return pool.withReader(url, cache, async (root) => {
    const v = await root.getChildByName(variable);
    if (!v) throw new MissingVariableError(variable);
    try {
      const [ny, nx] = v.getDimensions() as [number, number];
      const data = await v.read({ type: OmDataType.FloatArray, ranges: [{ start: 0, end: ny }, { start: 0, end: nx }] });
      convertToSI(variable, data);
      const [min, max] = minMax(data);
      return { variable, grid: gridFromBbox(run.bbox, ny, nx), data, min, max };
    } finally {
      v.dispose();
    }
  });
}

const fieldKey = (run: RunInfo, validTime: Date, variable: string) =>
  `${run.spatialId}|${run.referenceTime.toISOString()}|${validTime.toISOString()}|${variable}`;

export function loadField(run: RunInfo, validTime: Date, variable: string): Promise<Field> {
  const key = fieldKey(run, validTime, variable);
  return cached(key) ?? remember(key, readVariable(run, validTime, variable));
}

/** Rýchlosť vetra z u/v zložiek (odvodené pole, tiež cachované) */
export function loadSpeed(run: RunInfo, validTime: Date, u: string, v: string): Promise<Field> {
  const variable = `speed(${u})`;
  const key = fieldKey(run, validTime, variable);
  return (
    cached(key) ??
    remember(
      key,
      Promise.all([loadField(run, validTime, u), loadField(run, validTime, v)]).then(([fu, fv]) => {
        const data = new Float32Array(fu.data.length);
        for (let i = 0; i < data.length; i++) data[i] = Math.hypot(fu.data[i]!, fv.data[i]!);
        const [min, max] = minMax(data);
        return { variable, grid: fu.grid, data, min, max };
      }),
    )
  );
}
