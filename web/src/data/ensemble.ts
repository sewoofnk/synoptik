// Ensemble z Open-Meteo Ensemble API (R-012). Kontrolný beh = premenná bez prípony,
// členy = `<premenná>_memberNN`. Hodnoty sa prevedú na SI ako pri Forecast API.

import type { Quantity } from "../lib/units";

const API = "https://ensemble-api.open-meteo.com/v1/ensemble";
const CACHE_MS = 15 * 60_000;

export interface EnsembleModel {
  /** hodnota `models=` */
  id: string;
  label: string;
  /** priečinok s meta.json (beh) na ensemble-api.open-meteo.com/data/ */
  metaId: string;
  members: number;
}

// overené 2026-10-21 (počet radov vrátane kontrolného behu, dosah, meta.json)
export const ENSEMBLE_MODELS: readonly EnsembleModel[] = [
  { id: "ecmwf_ifs025", label: "ECMWF ENS 0,25°", metaId: "ecmwf_ifs025_ensemble", members: 51 },
  { id: "icon_seamless", label: "ICON EPS (EU + global)", metaId: "dwd_icon_eu_eps_native", members: 40 },
  { id: "gfs025", label: "GEFS 0,25°", metaId: "ncep_gefs025", members: 31 },
  { id: "ecmwf_aifs025", label: "ECMWF AIFS ENS", metaId: "ecmwf_aifs025_ensemble", members: 51 },
];

export interface EnsembleVar {
  id: string;
  label: string;
  quantity: Quantity;
  /** predvolený prah (SI) a smer pre pravdepodobnosť */
  threshold: number;
  above: boolean;
}

export const ENSEMBLE_VARS: readonly EnsembleVar[] = [
  { id: "temperature_2m", label: "Teplota 2 m", quantity: "temperature", threshold: 273.15, above: false },
  { id: "precipitation", label: "Zrážky (1 h)", quantity: "precipitation", threshold: 1, above: true },
  { id: "wind_gusts_10m", label: "Nárazy vetra", quantity: "speed", threshold: 15, above: true },
  { id: "wind_speed_10m", label: "Vietor 10 m", quantity: "speed", threshold: 10, above: true },
  { id: "temperature_850hPa", label: "Teplota 850 hPa", quantity: "temperature", threshold: 273.15, above: false },
  { id: "pressure_msl", label: "Tlak MSL", quantity: "pressure", threshold: 100000, above: false },
  { id: "cape", label: "CAPE", quantity: "energy", threshold: 500, above: true },
  { id: "cloud_cover", label: "Oblačnosť", quantity: "percent", threshold: 80, above: true },
];

export interface EnsembleData {
  times: number[];
  /** kontrolný beh */
  control: (number | null)[] | null;
  /** členy (bez kontrolného behu) */
  members: (number | null)[][];
}

function toSI(variable: string, v: number | null): number | null {
  if (v === null) return null;
  if (variable.startsWith("temperature") || variable.startsWith("dew_point")) return v + 273.15;
  if (variable === "pressure_msl") return v * 100;
  return v;
}

export function parseEnsemble(json: { hourly: Record<string, (number | null)[]> & { time: number[] } }, variable: string): EnsembleData {
  const h = json.hourly;
  const conv = (arr: (number | null)[]) => arr.map((x) => toSI(variable, x));
  const members = Object.keys(h)
    .filter((k) => k.startsWith(`${variable}_member`))
    .sort()
    .map((k) => conv(h[k]!));
  return { times: h.time.map((t) => t * 1000), control: h[variable] ? conv(h[variable]!) : null, members };
}

const cache = new Map<string, { at: number; promise: Promise<EnsembleData> }>();

export function fetchEnsemble(lat: number, lon: number, model: string, variable: string, days: number): Promise<EnsembleData> {
  const q = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    models: model,
    hourly: variable,
    forecast_days: String(days),
    wind_speed_unit: "ms",
    timeformat: "unixtime",
    timezone: "GMT",
  });
  const url = `${API}?${q}`;
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.promise;
  const promise = fetch(url)
    .then(async (res) => {
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.reason ?? `Ensemble API: HTTP ${res.status}`);
      return parseEnsemble(json, variable);
    })
    .catch((e: unknown) => {
      cache.delete(url);
      throw e;
    });
  cache.set(url, { at: Date.now(), promise });
  return promise;
}

/** Kvantil zoradeného poľa s lineárnou interpoláciou (q v 0–1) */
export function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

export interface EnsembleStats {
  median: (number | null)[];
  p10: (number | null)[];
  p90: (number | null)[];
  /** pravdepodobnosť prekročenia prahu v % (null = žiadny člen nemá hodnotu) */
  prob: (number | null)[];
}

/** Medián, 10./90. percentil a pravdepodobnosť (podiel členov nad/pod prahom) po časoch */
export function ensembleStats(members: (number | null)[][], threshold: number, above: boolean): EnsembleStats {
  const n = members[0]?.length ?? 0;
  const out: EnsembleStats = { median: [], p10: [], p90: [], prob: [] };
  for (let i = 0; i < n; i++) {
    const vals = members.map((m) => m[i]).filter((v): v is number => v !== null && v !== undefined && Number.isFinite(v));
    if (vals.length === 0) {
      out.median.push(null);
      out.p10.push(null);
      out.p90.push(null);
      out.prob.push(null);
      continue;
    }
    vals.sort((a, b) => a - b);
    out.median.push(quantile(vals, 0.5));
    out.p10.push(quantile(vals, 0.1));
    out.p90.push(quantile(vals, 0.9));
    const hits = vals.filter((v) => (above ? v > threshold : v < threshold)).length;
    out.prob.push((100 * hits) / vals.length);
  }
  return out;
}
