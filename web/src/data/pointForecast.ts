// Bodové dáta z Open-Meteo Forecast API. Odpovede sa cachujú 15 min (zadanie, sekcia 3.1).
// Všetky hodnoty sa pri načítaní prevedú na SI (K, Pa, m/s); smery vetra ostávajú v stupňoch.

import type { Sounding } from "../lib/thermo";

const API = "https://api.open-meteo.com/v1/forecast";
const META = "https://api.open-meteo.com/data";
const CACHE_MS = 15 * 60_000;

export const PRESSURE_LEVELS = [1000, 975, 950, 925, 900, 850, 800, 700, 600, 500, 400, 300, 250, 200, 150, 100] as const;

export const SURFACE_VARS = [
  "temperature_2m",
  "dew_point_2m",
  "pressure_msl",
  "surface_pressure",
  "wind_speed_10m",
  "wind_direction_10m",
  "wind_gusts_10m",
  "precipitation",
  "cloud_cover_low",
  "cloud_cover_mid",
  "cloud_cover_high",
] as const;

export const LEVEL_VARS = ["temperature", "dew_point", "wind_speed", "wind_direction", "geopotential_height"] as const;

export function levelVariables(): string[] {
  return PRESSURE_LEVELS.flatMap((l) => LEVEL_VARS.map((v) => `${v}_${l}hPa`));
}

export interface PointSeries {
  /** časy platnosti [ms od epochy] */
  times: number[];
  /** premenná → hodnoty (SI; null = model premennú nemá) */
  vars: Record<string, (number | null)[]>;
  /** nadmorská výška bunky modelu [m] */
  elevation: number;
}

export type PointData = Record<string, PointSeries>;

/** Prevod z jednotiek API (°C, hPa, m/s) na SI podľa názvu premennej */
function toSI(name: string, v: number | null): number | null {
  if (v === null) return null;
  if (name.startsWith("temperature") || name.startsWith("dew_point") || name === "apparent_temperature") return v + 273.15;
  if (name.startsWith("pressure") || name.startsWith("surface_pressure")) return v * 100;
  return v;
}

interface ApiResponse {
  elevation: number;
  hourly: Record<string, (number | null)[]> & { time: number[] };
}

export function parsePointResponse(json: ApiResponse | ApiResponse[], models: string[], variables: string[]): PointData {
  const out: PointData = {};
  // viac modelov → jedna odpoveď s príponou `_<model>`; jeden model → bez prípony
  const multi = models.length > 1;
  const r = Array.isArray(json) ? json[0]! : json;
  const times = r.hourly.time.map((t) => t * 1000);
  for (const m of models) {
    const vars: Record<string, (number | null)[]> = {};
    for (const v of variables) {
      const arr = r.hourly[multi ? `${v}_${m}` : v];
      if (arr) vars[v] = arr.map((x) => toSI(v, x));
    }
    out[m] = { times, vars, elevation: r.elevation };
  }
  return out;
}

const cache = new Map<string, { at: number; promise: Promise<PointData> }>();

export function pointUrl(lat: number, lon: number, models: string[], variables: string[], days: number): string {
  const q = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    models: models.join(","),
    hourly: variables.join(","),
    forecast_days: String(days),
    wind_speed_unit: "ms",
    timeformat: "unixtime",
    timezone: "GMT",
  });
  return `${API}?${q}`;
}

/** Načíta bodovú predpoveď; rovnaká požiadavka v 15 minútach sa vráti z cache */
export function fetchPoint(lat: number, lon: number, models: string[], variables: string[], days: number): Promise<PointData> {
  const url = pointUrl(lat, lon, models, variables, days);
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.promise;
  const promise = fetch(url)
    .then(async (res) => {
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.reason ?? `Open-Meteo: HTTP ${res.status}`);
      return parsePointResponse(json, models, variables);
    })
    .catch((e: unknown) => {
      cache.delete(url); // chybu necachovať
      throw e;
    });
  cache.set(url, { at: Date.now(), promise });
  return promise;
}

export interface ModelRunInfo {
  /** čas inicializácie posledného behu */
  init: Date;
  /** kedy bol beh dostupný */
  available: Date;
}

const runCache = new Map<string, { at: number; promise: Promise<ModelRunInfo> }>();

/** Beh (init time) modelu z meta.json – zadanie vyžaduje zobraziť ho pri každom výstupe */
export const ENSEMBLE_META = "https://ensemble-api.open-meteo.com/data";

export function fetchModelRun(metaId: string, base = META): Promise<ModelRunInfo> {
  const key = `${base}/${metaId}`;
  const hit = runCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.promise;
  const promise = fetch(`${base}/${metaId}/static/meta.json`)
    .then(async (res) => {
      if (!res.ok) throw new Error(`meta.json: HTTP ${res.status}`);
      const j = (await res.json()) as { last_run_initialisation_time: number; last_run_availability_time: number };
      return { init: new Date(j.last_run_initialisation_time * 1000), available: new Date(j.last_run_availability_time * 1000) };
    })
    .catch((e: unknown) => {
      runCache.delete(key);
      throw e;
    });
  runCache.set(key, { at: Date.now(), promise });
  return promise;
}

export interface WindSample {
  p: number;
  /** m/s */
  speed: number;
  /** meteorologický smer, odkiaľ fúka [°] */
  dir: number;
}

export interface SoundingAt {
  sounding: Sounding;
  wind: WindSample[];
  surfaceP: number;
}

/**
 * Sondáž pre krok `idx`: povrch (2 m, tlak pri zemi, nadmorská výška) + hladiny nad zemou.
 * Hladiny pod terénom (p ≥ tlak pri zemi) a hladiny s chýbajúcou hodnotou sa preskočia.
 */
export function buildSounding(series: PointSeries, idx: number): SoundingAt | null {
  const g = (name: string) => series.vars[name]?.[idx] ?? null;
  const ps = g("surface_pressure");
  const t2 = g("temperature_2m");
  const td2 = g("dew_point_2m");
  if (ps === null || t2 === null || td2 === null) return null;

  const p = [ps];
  const t = [t2];
  const td = [Math.min(td2, t2)];
  const z = [series.elevation];
  const wind: WindSample[] = [];
  const w10 = g("wind_speed_10m");
  const d10 = g("wind_direction_10m");
  if (w10 !== null && d10 !== null) wind.push({ p: ps, speed: w10, dir: d10 });

  for (const lvl of PRESSURE_LEVELS) {
    const pl = lvl * 100;
    // aspoň 5 hPa nad zemou, inak by hladina splývala s povrchom
    if (pl >= ps - 500) continue;
    const tl = g(`temperature_${lvl}hPa`);
    const tdl = g(`dew_point_${lvl}hPa`);
    const zl = g(`geopotential_height_${lvl}hPa`);
    if (tl === null || tdl === null || zl === null) continue;
    p.push(pl);
    t.push(tl);
    td.push(Math.min(tdl, tl));
    z.push(zl);
    const sp = g(`wind_speed_${lvl}hPa`);
    const dr = g(`wind_direction_${lvl}hPa`);
    if (sp !== null && dr !== null) wind.push({ p: pl, speed: sp, dir: dr });
  }
  if (p.length < 4) return null;
  return { sounding: { p, t, td, z }, wind, surfaceP: ps };
}
