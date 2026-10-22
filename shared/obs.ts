// Spracovanie pozorovaní pre Pages Function /api/obs (R-014). Čisté funkcie bez závislostí,
// testované vo Vitest (web/src/lib/obs.shared.test.ts).

/** Výrez Európy pre pozorovania [latMin, lonMin, latMax, lonMax] */
export const OBS_BBOX: [number, number, number, number] = [30, -30, 72, 45];

export interface MetarObs {
  id: string;
  lat: number;
  lon: number;
  /** nadmorská výška [m] */
  elev: number | null;
  /** čas pozorovania [ms] */
  time: number;
  /** °C */
  t: number | null;
  td: number | null;
  /** smer [°], 0 = bezvetrie, null = premenlivý/chýba */
  wd: number | null;
  /** kt */
  ws: number | null;
  wg: number | null;
  /** dohľadnosť [m] (≥ 10 km = 9999) */
  vis: number | null;
  /** QNH [hPa] */
  qnh: number | null;
  /** jav, napr. "-RA BR" */
  wx: string;
  /** oblačnosť [pokrytie, základňa ft AGL] */
  clouds: [string, number | null][];
  /** VFR | MVFR | IFR | LIFR */
  cat: string;
  raw: string;
}

/** Rozdelenie riadku CSV s úvodzovkami (raw_text obsahuje čiarky len zriedka, ale môže) */
export function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (q) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

function qnhFromRaw(raw: string): number | null {
  const m = / Q(\d{4})(?!\d)/.exec(raw);
  return m ? Number(m[1]) : null;
}

const num = (s: string | undefined): number | null => {
  if (s === undefined || s === "") return null;
  const v = Number(s.replace("+", ""));
  return Number.isFinite(v) ? v : null;
};

/**
 * Hromadný súbor aviationweather.gov `metars.cache.csv` → METAR v bboxe, pre každú stanicu
 * najnovší. Stĺpce podľa hlavičky (overené 2026-10-22).
 */
export function parseMetarCsv(text: string, bbox = OBS_BBOX): MetarObs[] {
  const lines = text.split(/\r?\n/);
  const header = splitCsv(lines[0] ?? "");
  const col = (name: string) => header.indexOf(name);
  const iRaw = col("raw_text"), iId = col("station_id"), iTime = col("observation_time");
  const iLat = col("latitude"), iLon = col("longitude"), iT = col("temp_c"), iTd = col("dewpoint_c");
  const iWd = col("wind_dir_degrees"), iWs = col("wind_speed_kt"), iWg = col("wind_gust_kt");
  const iVis = col("visibility_statute_mi"), iAlt = col("altim_in_hg"), iWx = col("wx_string");
  const iCat = col("flight_category"), iElev = col("elevation_m");
  // sky_cover / cloud_base_ft_agl sa opakujú 4×
  const sky: number[] = [];
  header.forEach((h, i) => h === "sky_cover" && sky.push(i));

  const best = new Map<string, MetarObs>();
  for (let k = 1; k < lines.length; k++) {
    const line = lines[k];
    if (!line) continue;
    const f = splitCsv(line);
    const lat = num(f[iLat]);
    const lon = num(f[iLon]);
    if (lat === null || lon === null) continue;
    if (lat < bbox[0] || lat > bbox[2] || lon < bbox[1] || lon > bbox[3]) continue;
    const id = f[iId] ?? "";
    const time = Date.parse(f[iTime] ?? "");
    if (!id || Number.isNaN(time)) continue;
    const prev = best.get(id);
    if (prev && prev.time >= time) continue;
    const visRaw = f[iVis] ?? "";
    const visMi = num(visRaw.replace("+", ""));
    const alt = num(f[iAlt]);
    const wd = num(f[iWd]);
    best.set(id, {
      id,
      lat,
      lon,
      elev: num(f[iElev]),
      time,
      t: num(f[iT]),
      td: num(f[iTd]),
      // "VRB" sa v stĺpci smeru objaví ako prázdne alebo text
      wd: wd,
      ws: num(f[iWs]),
      wg: num(f[iWg]),
      vis: visMi === null ? null : visRaw.endsWith("+") || visMi >= 6 ? 9999 : Math.round(visMi * 1609.344),
      // presné QNH zo skupiny Qxxxx v správe; inHg (Axxxx) iba prepočtom
      qnh: qnhFromRaw(f[iRaw] ?? "") ?? (alt === null ? null : Math.round(alt * 33.8639 * 10) / 10),
      wx: f[iWx] ?? "",
      clouds: sky.map((i) => [f[i] ?? "", num(f[i + 1])] as [string, number | null]).filter(([c]) => c !== ""),
      cat: f[iCat] ?? "",
      raw: f[iRaw] ?? "",
    });
  }
  return [...best.values()];
}

export interface SynopRow {
  wmo: string;
  /** termín [ms] */
  time: number;
  /** správa bez prefixu „AAXX“ hlavičky OGIMET (od AAXX ďalej) */
  msg: string;
}

/** Európske bloky WMO (01–17 Európa, 22/26/27 SZ Rusko a Pobaltie, 33/34 Ukrajina, Moldavsko, J Rusko) */
const EUROPE_BLOCKS = /^(0[1-9]|1[0-7]|2[267]|3[34])/;

/** Riadky OGIMET getsynop („IIiii,YYYY,MM,DD,HH,mm,AAXX …==“) → európske SYNOP, bez NIL */
export function parseOgimet(text: string): SynopRow[] {
  const out = new Map<string, SynopRow>();
  for (const line of text.split(/\r?\n/)) {
    const m = /^(\d{5}),(\d{4}),(\d{2}),(\d{2}),(\d{2}),(\d{2}),(AAXX .*?)=*\s*$/.exec(line);
    if (!m) continue;
    const wmo = m[1]!;
    if (!EUROPE_BLOCKS.test(wmo) || /\bNIL\b/.test(m[7]!)) continue;
    const time = Date.UTC(+m[2]!, +m[3]! - 1, +m[4]!, +m[5]!, +m[6]!);
    out.set(wmo, { wmo, time, msg: m[7]! });
  }
  return [...out.values()];
}

/** Posledný hlavný synoptický termín (00/03/…/21 UTC), ktorý je aspoň `lagMin` minút v minulosti */
export function latestSynopTerm(now: Date, lagMin = 75): Date {
  const t = new Date(now.getTime() - lagMin * 60_000);
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), Math.floor(t.getUTCHours() / 3) * 3));
}

/** Formát času pre OGIMET: YYYYMMDDHHmm */
export function ogimetTime(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}00`;
}
