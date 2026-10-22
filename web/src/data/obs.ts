// Pozorovania z Pages Function /api/obs (R-014) a zoznam staníc SYNOP (statický JSON z NOAA ISD).

import type { MetarObs, SynopRow } from "../../../shared/obs";
import { decodeSynop, type Synop } from "../lib/synop";

export type { MetarObs };

export interface MetarData {
  fetched: number;
  obs: MetarObs[];
}

export interface SynopStation {
  wmo: string;
  name: string;
  lat: number;
  lon: number;
  elev: number | null;
  time: number;
  msg: string;
  s: Synop;
}

export interface SynopData {
  term: number;
  stations: SynopStation[];
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const j = (await res.json().catch(() => ({ error: `HTTP ${res.status}` }))) as T & { error?: string };
  if (!res.ok || j.error) throw new Error(j.error ?? `HTTP ${res.status}`);
  return j;
}

export function fetchMetar(): Promise<MetarData> {
  return getJson<MetarData>("/api/obs?type=metar");
}

export interface Taf {
  id: string;
  raw: string | null;
  issued: string | null;
}

const tafCache = new Map<string, { at: number; p: Promise<Taf> }>();
export function fetchTaf(id: string): Promise<Taf> {
  const hit = tafCache.get(id);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.p;
  const p = getJson<Taf>(`/api/obs?type=taf&id=${encodeURIComponent(id)}`);
  p.catch(() => tafCache.delete(id));
  tafCache.set(id, { at: Date.now(), p });
  return p;
}

let stationsP: Promise<Record<string, [string, number, number, number | null]>> | null = null;

export async function fetchSynop(): Promise<SynopData> {
  stationsP ??= getJson("/data/synop-stations.json");
  const [st, d] = await Promise.all([stationsP, getJson<{ term: number; rows: SynopRow[] }>("/api/obs?type=synop")]);
  const stations: SynopStation[] = [];
  for (const r of d.rows) {
    const meta = st[r.wmo];
    const s = decodeSynop(r.msg);
    // bez súradníc (~18 % staníc nie je v ISD) alebo nečitateľná správa → vynechať
    if (!meta || !s) continue;
    stations.push({ wmo: r.wmo, name: meta[0], lat: meta[1], lon: meta[2], elev: meta[3], time: r.time, msg: r.msg, s });
  }
  return { term: d.term, stations };
}
