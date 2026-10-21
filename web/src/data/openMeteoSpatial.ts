// Prístup k mapovým poliam Open-Meteo na AWS S3 (data_spatial).
// Štruktúra: data_spatial/<model>/<YYYY>/<MM>/<DD>/<hhmm>Z/<YYYY-MM-DDThhmm>.om
// Posledný dokončený beh: data_spatial/<model>/latest.json, metadáta behu: <run>/meta.json

import type { Bbox } from "../config/models";
import { parseWktBbox } from "./grid";

export const S3_BUCKET = "https://openmeteo.s3.amazonaws.com";
export const S3_BASE = `${S3_BUCKET}/data_spatial`;

/** Surový obsah latest.json / meta.json (iba polia, ktoré používame) */
interface MetaJson {
  completed: boolean;
  reference_time: string;
  valid_times: string[];
  variables: string[];
  crs_wkt: string;
  last_modified_time?: string;
}

/** Jeden priečinok data_spatial v rámci behu */
export interface RunPart {
  spatialId: string;
  /** Init time behu (UTC) */
  referenceTime: Date;
  /** Časy platnosti dostupných krokov (UTC), vzostupne */
  validTimes: Date[];
  variables: string[];
  /** [latMin, lonMin, latMax, lonMax] stredov krajných buniek */
  bbox: Bbox;
}

/**
 * Beh modelu. Polia RunPart patria hlavnému priečinku; `variables` je zjednotenie všetkých
 * častí (GFS = ncep_gfs025 + ncep_gfs013) a `parts` určuje, odkiaľ sa premenná číta.
 */
export interface RunInfo extends RunPart {
  completed: boolean;
  lastModified: Date | null;
  parts: RunPart[];
  /** Výrez, ktorý sa číta (globálne modely); null = celá mriežka */
  crop: Bbox | null;
}

/** Open-Meteo používa ISO bez sekúnd ("2026-10-21T12:00Z"), Date ho prečíta priamo. */
function parseUtc(s: string): Date {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new Error(`Neplatný čas: ${s}`);
  return d;
}

export function parseMeta(spatialId: string, json: unknown): RunInfo {
  const j = json as Partial<MetaJson>;
  if (
    typeof j.reference_time !== "string" ||
    !Array.isArray(j.valid_times) ||
    !Array.isArray(j.variables) ||
    typeof j.crs_wkt !== "string"
  ) {
    throw new Error(`Neočakávaný formát metadát pre ${spatialId}`);
  }
  return {
    spatialId,
    referenceTime: parseUtc(j.reference_time),
    validTimes: j.valid_times.map(parseUtc).sort((a, b) => a.getTime() - b.getTime()),
    variables: j.variables,
    completed: j.completed === true,
    lastModified: j.last_modified_time ? parseUtc(j.last_modified_time) : null,
    bbox: parseWktBbox(j.crs_wkt),
    parts: [],
    crop: null,
  };
}

/**
 * Spojí hlavný beh s doplnkovými priečinkami toho istého behu. Doplnok s iným init time
 * sa nepoužije (premenné by pochádzali z iného behu, než ukazuje UI).
 */
export function combineRuns(primary: RunInfo, extras: RunInfo[], crop: Bbox | null): RunInfo {
  const part = (r: RunInfo): RunPart => ({
    spatialId: r.spatialId,
    referenceTime: r.referenceTime,
    validTimes: r.validTimes,
    variables: r.variables,
    bbox: r.bbox,
  });
  const same = extras.filter((e) => e.referenceTime.getTime() === primary.referenceTime.getTime());
  const parts = [part(primary), ...same.map(part)];
  return { ...primary, parts, crop, variables: [...new Set(parts.flatMap((p) => p.variables))] };
}

/** Časť behu, z ktorej sa číta premenná v danom kroku (prvá, ktorá ju má) */
export function partFor(run: RunInfo, variable: string, validTime: Date): RunPart | null {
  const t = validTime.getTime();
  const parts = run.parts.length ? run.parts : [run];
  return parts.find((p) => p.variables.includes(variable) && p.validTimes.some((v) => v.getTime() === t)) ?? null;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Priečinok behu, napr. "2026/10/21/0900Z" */
export function runPath(referenceTime: Date): string {
  const d = referenceTime;
  return `${d.getUTCFullYear()}/${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}/${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}Z`;
}

/** URL súboru jedného časového kroku (obsahuje všetky premenné) */
export function stepUrl(spatialId: string, referenceTime: Date, validTime: Date): string {
  const v = validTime;
  const name = `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}T${pad(v.getUTCHours())}${pad(v.getUTCMinutes())}`;
  return `${S3_BASE}/${spatialId}/${runPath(referenceTime)}/${name}.om`;
}

async function fetchJson(url: string, signal?: AbortSignal): Promise<unknown> {
  // metadáta sa menia s novým behom – vždy revalidovať
  const res = await fetch(url, { cache: "no-cache", signal });
  if (!res.ok) throw new Error(`${url.replace(S3_BASE, "")}: HTTP ${res.status}`);
  return res.json();
}

export async function fetchLatestRun(spatialId: string, signal?: AbortSignal): Promise<RunInfo> {
  return parseMeta(spatialId, await fetchJson(`${S3_BASE}/${spatialId}/latest.json`, signal));
}

export async function fetchRunMeta(spatialId: string, referenceTime: Date, signal?: AbortSignal): Promise<RunInfo> {
  return parseMeta(spatialId, await fetchJson(`${S3_BASE}/${spatialId}/${runPath(referenceTime)}/meta.json`, signal));
}

/** Z XML výpisu S3 (ListObjectsV2 s delimiter=/) vytiahne časy behov */
export function parseRunPrefixes(xml: string): Date[] {
  const out: Date[] = [];
  for (const m of xml.matchAll(/<Prefix>[^<]*\/(\d{4})\/(\d{2})\/(\d{2})\/(\d{2})(\d{2})Z\/<\/Prefix>/g)) {
    out.push(new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!)));
  }
  return out;
}

/**
 * Behy za posledných `days` dní (UTC), najnovší prvý. Zahŕňa aj rozpracované behy –
 * tie spoznáme až podľa meta.json (completed / chýbajúci súbor).
 */
export async function listRuns(spatialId: string, days = 3, now = new Date(), signal?: AbortSignal): Promise<Date[]> {
  const dayPrefixes = Array.from({ length: days }, (_, i) => {
    const d = new Date(now.getTime() - i * 86_400_000);
    return `data_spatial/${spatialId}/${d.getUTCFullYear()}/${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}/`;
  });
  const lists = await Promise.all(
    dayPrefixes.map(async (prefix) => {
      const res = await fetch(`${S3_BUCKET}/?list-type=2&delimiter=/&prefix=${encodeURIComponent(prefix)}`, { signal });
      return res.ok ? parseRunPrefixes(await res.text()) : [];
    }),
  );
  return lists.flat().sort((a, b) => b.getTime() - a.getTime());
}
