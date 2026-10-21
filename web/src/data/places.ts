// Doplnkové bodové dáta: názov miesta (OSM Nominatim, spätné geokódovanie) a kvalita ovzdušia
// (Open-Meteo Air Quality API, CAMS). Obe s cache; Nominatim má limit 1 požiadavka/s (R-013).

const NOMINATIM = "https://nominatim.openstreetmap.org/reverse";
const AIR = "https://air-quality-api.open-meteo.com/v1/air-quality";
const CACHE_MS = 15 * 60_000;

const placeCache = new Map<string, Promise<string | null>>();
let lastNominatim = 0;

/** Najbližšia obec/mesto; null ak nič (more) alebo chyba. Kľúč cache zaokrúhlený na ~1 km. */
export function reverseGeocode(lat: number, lon: number): Promise<string | null> {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  let p = placeCache.get(key);
  if (p) return p;
  p = (async () => {
    // ohľaduplnosť k Nominatim: najviac 1 požiadavka za sekundu
    const wait = lastNominatim + 1100 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastNominatim = Date.now();
    const q = new URLSearchParams({ lat: lat.toFixed(4), lon: lon.toFixed(4), zoom: "12", format: "jsonv2", "accept-language": "sk" });
    const res = await fetch(`${NOMINATIM}?${q}`);
    if (!res.ok) return null;
    const j = (await res.json()) as { name?: string; address?: Record<string, string> };
    const a = j.address ?? {};
    return a.village ?? a.town ?? a.city ?? a.municipality ?? j.name ?? null;
  })().catch(() => null);
  placeCache.set(key, p);
  return p;
}

export const AIR_VARS = ["european_aqi", "pm2_5", "pm10", "dust", "carbon_monoxide", "nitrogen_dioxide", "sulphur_dioxide", "ozone"] as const;
export type AirVar = (typeof AIR_VARS)[number];

export interface AirData {
  times: number[];
  vars: Record<AirVar, (number | null)[]>;
}

const airCache = new Map<string, { at: number; promise: Promise<AirData> }>();

export function fetchAirQuality(lat: number, lon: number): Promise<AirData> {
  const q = new URLSearchParams({
    latitude: lat.toFixed(3),
    longitude: lon.toFixed(3),
    hourly: AIR_VARS.join(","),
    forecast_days: "5",
    timeformat: "unixtime",
    timezone: "GMT",
  });
  const url = `${AIR}?${q}`;
  const hit = airCache.get(url);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.promise;
  const promise = fetch(url)
    .then(async (res) => {
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.reason ?? `Air Quality API: HTTP ${res.status}`);
      const h = j.hourly as Record<string, (number | null)[]> & { time: number[] };
      const vars = Object.fromEntries(AIR_VARS.map((v) => [v, h[v] ?? []])) as AirData["vars"];
      return { times: h.time.map((t) => t * 1000), vars };
    })
    .catch((e: unknown) => {
      airCache.delete(url);
      throw e;
    });
  airCache.set(url, { at: Date.now(), promise });
  return promise;
}

/** Európsky index kvality ovzdušia (EEA): pásmo a farba */
export function eaqiBand(v: number): { label: string; color: string } {
  if (v <= 20) return { label: "Dobrá", color: "#50f0e6" };
  if (v <= 40) return { label: "Prijateľná", color: "#50ccaa" };
  if (v <= 60) return { label: "Stredná", color: "#f0e641" };
  if (v <= 80) return { label: "Zlá", color: "#ff5050" };
  if (v <= 100) return { label: "Veľmi zlá", color: "#960032" };
  return { label: "Extrémne zlá", color: "#7d2181" };
}
