// Prístup k mapovým poliam Open-Meteo na AWS S3 (data_spatial).
// Štruktúra: data_spatial/<model>/<YYYY>/<MM>/<DD>/<hhmm>Z/<YYYY-MM-DDThhmm>.om
// Posledný dokončený beh: data_spatial/<model>/latest.json

export const S3_BASE = "https://openmeteo.s3.amazonaws.com/data_spatial";

/** Surový obsah latest.json (iba polia, ktoré používame) */
interface LatestJson {
  completed: boolean;
  reference_time: string;
  valid_times: string[];
  variables: string[];
  last_modified_time?: string;
}

export interface RunInfo {
  spatialId: string;
  /** Init time behu (UTC) */
  referenceTime: Date;
  /** Časy platnosti dostupných krokov (UTC) */
  validTimes: Date[];
  variables: string[];
  completed: boolean;
  lastModified: Date | null;
}

/** Open-Meteo používa ISO bez sekúnd ("2026-10-21T12:00Z"), Date ho prečíta priamo. */
function parseUtc(s: string): Date {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new Error(`Neplatný čas: ${s}`);
  return d;
}

export function parseLatest(spatialId: string, json: unknown): RunInfo {
  const j = json as Partial<LatestJson>;
  if (typeof j.reference_time !== "string" || !Array.isArray(j.valid_times) || !Array.isArray(j.variables)) {
    throw new Error(`Neočakávaný formát latest.json pre ${spatialId}`);
  }
  return {
    spatialId,
    referenceTime: parseUtc(j.reference_time),
    validTimes: j.valid_times.map(parseUtc),
    variables: j.variables,
    completed: j.completed === true,
    lastModified: j.last_modified_time ? parseUtc(j.last_modified_time) : null,
  };
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

export async function fetchLatestRun(spatialId: string, signal?: AbortSignal): Promise<RunInfo> {
  // latest.json sa mení pri každom novom behu – necachovať
  const res = await fetch(`${S3_BASE}/${spatialId}/latest.json`, { cache: "no-cache", signal });
  if (!res.ok) throw new Error(`latest.json ${spatialId}: HTTP ${res.status}`);
  return parseLatest(spatialId, await res.json());
}
