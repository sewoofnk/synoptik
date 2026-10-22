// Pages Function /api/radar – radar SHMÚ (R-016). Zdroj nemá CORS, preto ide cez nás s cache:
//   ?type=list&product=data.cmax&hours=3   zoznam snímok [{t, f}] od najstaršej (cache 60 s)
//   ?type=img&product=data.cmax&f=cmax…png  snímka PNG (názov súboru je nemenný → cache 1 rok)
//   ?type=legend&product=data.cmax          legenda produktu (PNG)
// RainViewer (celá Európa) má CORS, prehliadač ho volá priamo.

const SHMU = "https://www.shmu.sk";
const UA = "Synoptik (personal non-commercial app; https://cloudy8.pages.dev)";
const PRODUCTS = new Set(["data.cmax", "data.1hrain", "data.cappi2km", "data.etop", "data.lightning"]);

interface Ctx {
  request: Request;
  waitUntil(p: Promise<unknown>): void;
}

const err = (msg: string, status: number) =>
  new Response(JSON.stringify({ error: msg }), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

/** Odpoveď z cache Cloudflare, inak vyrobiť a uložiť */
async function cached(ctx: Ctx, key: string, produce: () => Promise<Response>): Promise<Response> {
  const cache = (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default;
  const req = new Request(`https://cloudy-radar.cache/${key}`);
  if (cache) {
    const hit = await cache.match(req);
    if (hit) return hit;
  }
  const res = await produce();
  if (cache && res.ok) ctx.waitUntil(cache.put(req, res.clone()));
  return res;
}

interface ShmuItem {
  fname: string;
  dt_utc: number | string;
}
interface ShmuProduct {
  product: string;
  items: ShmuItem[];
}

async function list(product: string, hours: number): Promise<Response> {
  const res = await fetch(`${SHMU}/api/v1/meteo/getradardata`, { headers: { "user-agent": UA } });
  if (!res.ok) return err(`SHMÚ: HTTP ${res.status}`, 502);
  const all = (await res.json()) as ShmuProduct[];
  const p = all.find((x) => x.product === product);
  if (!p) return err("Produkt nenájdený", 404);
  const min = Date.now() - hours * 3_600_000;
  const frames = p.items
    .map((i) => ({ t: Number(i.dt_utc) * 1000, f: i.fname }))
    .filter((i) => i.t >= min)
    .sort((a, b) => a.t - b.t);
  return new Response(JSON.stringify({ source: "SHMÚ", product, frames }), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=60" },
  });
}

async function png(url: string, maxAge: number): Promise<Response> {
  const res = await fetch(url, { headers: { "user-agent": UA } });
  if (!res.ok) return err(`SHMÚ: HTTP ${res.status}`, res.status === 404 ? 404 : 502);
  return new Response(res.body, { headers: { "content-type": "image/png", "cache-control": `public, max-age=${maxAge}` } });
}

export const onRequestGet = async (ctx: Ctx): Promise<Response> => {
  const url = new URL(ctx.request.url);
  const type = url.searchParams.get("type");
  const product = url.searchParams.get("product") ?? "";
  if (!PRODUCTS.has(product)) return err("Neznámy produkt", 400);
  try {
    if (type === "list") {
      const hours = Math.min(12, Math.max(1, Number(url.searchParams.get("hours") ?? 3) || 3));
      return await cached(ctx, `list-${product}-${hours}`, () => list(product, hours));
    }
    if (type === "img") {
      const f = url.searchParams.get("f") ?? "";
      if (!/^[A-Za-z0-9._-]{5,80}\.png$/.test(f)) return err("Neplatný súbor", 400);
      // názov obsahuje čas snímky, obsah sa nemení
      return await cached(ctx, `img-${product}-${f}`, () => png(`${SHMU}/data/dataradary/${product}/${f}`, 31_536_000));
    }
    if (type === "legend") {
      return await cached(ctx, `legend-${product}`, () => png(`${SHMU}/img/radary/${product}.png`, 604_800));
    }
    return err("Neznámy typ (list | img | legend)", 400);
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e), 502);
  }
};
