// Pages Function /api/obs – pozorovania pre mapu (R-014):
//   ?type=metar        METAR celej Európy z hromadného súboru aviationweather.gov (cache 10 min)
//   ?type=taf&id=LZKZ  TAF jednej stanice z aviationweather.gov Data API (cache 10 min)
//   ?type=synop        SYNOP posledného termínu z OGIMET (cache 30 min, 1 požiadavka na termín)
// Odpovede sa cachujú v Cloudflare (caches.default), takže zdroje sa volajú zriedka.

import { latestSynopTerm, ogimetTime, parseMetarCsv, parseOgimet } from "../../shared/obs";

interface Ctx {
  request: Request;
  waitUntil(p: Promise<unknown>): void;
}

const UA = "Synoptik (personal non-commercial app; https://synoptik-ezo.pages.dev)";
const METAR_URL = "https://aviationweather.gov/data/cache/metars.cache.csv.gz";
const TAF_URL = "https://aviationweather.gov/api/data/taf";
const OGIMET_URL = "https://www.ogimet.com/cgi-bin/getsynop";

function json(body: unknown, status = 200, maxAge = 0): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": maxAge ? `public, max-age=${maxAge}` : "no-store",
    },
  });
}

/** Odpoveď z cache Cloudflare, inak vyrobiť a uložiť */
async function cached(ctx: Ctx, key: string, ttl: number, produce: () => Promise<unknown>): Promise<Response> {
  const cache = (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default;
  const req = new Request(`https://synoptik-obs.cache/${key}`);
  if (cache) {
    const hit = await cache.match(req);
    if (hit) return hit;
  }
  const res = json(await produce(), 200, ttl);
  if (cache) ctx.waitUntil(cache.put(req, res.clone()));
  return res;
}

async function gunzipText(res: Response): Promise<string> {
  if (!res.body) return "";
  const stream = res.body.pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

async function metar() {
  const res = await fetch(METAR_URL, { headers: { "user-agent": UA } });
  if (!res.ok) throw new Error(`aviationweather.gov: HTTP ${res.status}`);
  const obs = parseMetarCsv(await gunzipText(res));
  return { source: "aviationweather.gov", fetched: Date.now(), obs };
}

async function taf(id: string) {
  const res = await fetch(`${TAF_URL}?ids=${id}&format=json`, { headers: { "user-agent": UA } });
  if (!res.ok) throw new Error(`aviationweather.gov: HTTP ${res.status}`);
  const list = (await res.json()) as { rawTAF?: string; issueTime?: string; validTimeFrom?: number; validTimeTo?: number }[];
  const t = list[0];
  return t ? { id, raw: t.rawTAF ?? "", issued: t.issueTime ?? null, from: t.validTimeFrom ?? null, to: t.validTimeTo ?? null } : { id, raw: null };
}

async function synop() {
  // posledný termín; ak je ešte neúplný (málo staníc), o termín skôr
  let term = latestSynopTerm(new Date());
  for (let attempt = 0; attempt < 2; attempt++) {
    const t = ogimetTime(term);
    const res = await fetch(`${OGIMET_URL}?begin=${t}&end=${t}`, { headers: { "user-agent": UA } });
    if (!res.ok) throw new Error(`OGIMET: HTTP ${res.status}`);
    const rows = parseOgimet(await res.text());
    if (rows.length >= 500 || attempt === 1) return { source: "OGIMET", term: term.getTime(), fetched: Date.now(), rows };
    term = new Date(term.getTime() - 3 * 3_600_000);
  }
  throw new Error("OGIMET: žiadne dáta");
}

export const onRequestGet = async (ctx: Ctx): Promise<Response> => {
  const url = new URL(ctx.request.url);
  const type = url.searchParams.get("type");
  try {
    if (type === "metar") return await cached(ctx, "metar", 600, metar);
    if (type === "synop") {
      // kľúč podľa termínu – nový termín = nové stiahnutie
      const key = `synop-${ogimetTime(latestSynopTerm(new Date()))}`;
      return await cached(ctx, key, 1800, synop);
    }
    if (type === "taf") {
      const id = (url.searchParams.get("id") ?? "").toUpperCase();
      if (!/^[A-Z0-9]{4}$/.test(id)) return json({ error: "Neplatný ICAO kód" }, 400);
      return await cached(ctx, `taf-${id}`, 600, () => taf(id));
    }
    return json({ error: "Neznámy typ (metar | taf | synop)" }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }
};
