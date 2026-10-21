// Načítanie jedného poľa (premenná × beh × krok) z Open-Meteo S3 do Float32Array v SI.
// Bloky súborov sa cachujú perzistentne v prehliadači (súbory behu sa nemenia),
// hotové polia v pamäti (LRU).

import { BrowserBlockCache, LruBlockCache, OmDataType, OmHttpBackendPool, type BlockCache } from "@openmeteo/file-reader";
import type { FieldSource } from "../config/layers.config";
import { dewpointFromRH } from "../lib/thermo";
import { cropRanges, gridFromBbox, type Grid } from "./grid";
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
  const key = fieldKey(run, validTime, variable);
  return cached(key) ?? remember(key, readVariable(run, validTime, variable));
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
      Promise.all([loadField(run, validTime, a), loadField(run, validTime, b)]).then(([fa, fb]) => {
        if (fa.data.length !== fb.data.length) throw new Error(`${a} a ${b} majú rôzne mriežky`);
        const data = new Float32Array(fa.data.length);
        for (let i = 0; i < data.length; i++) data[i] = f(fa.data[i]!, fb.data[i]!);
        const [min, max] = minMax(data);
        return { variable: name, grid: fa.grid, data, min, max };
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
      return loadSpeed(run, validTime, src.u, src.v);
    case "dewpoint":
      return derived(run, validTime, `dewpoint(${src.t})`, src.t, src.rh, dewpointFromRH);
    case "diff":
      return derived(run, validTime, `diff(${src.a},${src.b})`, src.a, src.b, (x, y) => x - y);
  }
}
