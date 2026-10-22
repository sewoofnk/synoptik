// Radar (R-016): SHMÚ cez Pages Function /api/radar (snímky po 5 min, 3 dni) a RainViewer (celá Európa,
// posledné ~2 h, tiles do zoomu 7, CORS povolený).

export type RadarSource = "shmu" | "rainviewer";

export interface RadarFrame {
  /** čas snímky [ms] */
  t: number;
  /** SHMÚ: názov súboru; RainViewer: cesta `/v2/radar/<id>` */
  key: string;
}

/** Hranice snímok SHMÚ (rovnaké ako vo viewri SHMÚ): [lonW, latN], [lonE, latN], [lonE, latS], [lonW, latS] */
export const SHMU_RADAR_COORDS: [[number, number], [number, number], [number, number], [number, number]] = [
  [13.6, 50.7],
  [23.79, 50.7],
  [23.79, 46.05],
  [13.6, 46.05],
];
export const SHMU_LIGHTNING_COORDS: typeof SHMU_RADAR_COORDS = [
  [16.0038, 49.9],
  [22.9962, 49.9],
  [22.9962, 47.3],
  [16.0038, 47.3],
];

export const SHMU_PRODUCTS: { id: string; label: string }[] = [
  { id: "data.cmax", label: "Maximum odrazivosti" },
  { id: "data.cappi2km", label: "CAPPI 2 km" },
  { id: "data.1hrain", label: "1 h úhrn" },
  { id: "data.etop", label: "EchoTop" },
];

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const j = (await res.json().catch(() => ({ error: `HTTP ${res.status}` }))) as T & { error?: string };
  if (!res.ok || j.error) throw new Error(j.error ?? `HTTP ${res.status}`);
  return j;
}

export async function fetchShmuFrames(product: string, hours: number): Promise<RadarFrame[]> {
  const d = await getJson<{ frames: { t: number; f: string }[] }>(`/api/radar?type=list&product=${product}&hours=${hours}`);
  return d.frames.map((f) => ({ t: f.t, key: f.f }));
}

export const shmuImageUrl = (product: string, f: string) => `/api/radar?type=img&product=${product}&f=${encodeURIComponent(f)}`;
export const shmuLegendUrl = (product: string) => `/api/radar?type=legend&product=${product}`;

const RV_API = "https://api.rainviewer.com/public/weather-maps.json";

export interface RainViewerData {
  host: string;
  frames: RadarFrame[];
}

/** RainViewer: snímky zo staršej k novšej (maximálne 13, ~2 h, bez nowcastu) */
export async function fetchRainViewer(): Promise<RainViewerData> {
  const d = await getJson<{ host: string; radar: { past: { time: number; path: string }[] } }>(RV_API);
  return { host: d.host, frames: d.radar.past.map((p) => ({ t: p.time * 1000, key: p.path })) };
}

/** Šablóna dlaždíc RainViewer: 256 px, farebná schéma 2 (Universal Blue), vyhladenie a sneh */
export const rainViewerTiles = (host: string, path: string) => `${host}${path}/256/{z}/{x}/{y}/2/1_1.png`;
export const RAINVIEWER_MAX_ZOOM = 7;

/**
 * Čistenie snímky SHMÚ (RGBA, in-place): okolie mimo dosahu radarov je nepriehľadná šedá
 * (230,230,230) a snímka má čierny rámik (≈ 2,2,2). Obe sa urobia priehľadné, aby nezakrývali mapu.
 * Vracia počet upravených pixelov.
 */
export function cleanShmuPixels(data: Uint8ClampedArray): number {
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!, a = data[i + 3]!;
    if (a === 0) continue;
    const gray = r === g && g === b;
    if (gray && (r === 230 || r <= 4)) {
      data[i + 3] = 0;
      n++;
    }
  }
  return n;
}

const blobCache = new Map<string, Promise<string>>();

/** Snímka SHMÚ ako blob URL po vyčistení pixelov (cache v pamäti, LRU 80 snímok) */
export function loadShmuImage(product: string, f: string, clean = true): Promise<string> {
  const key = `${product}|${f}|${clean}`;
  const hit = blobCache.get(key);
  if (hit) {
    blobCache.delete(key);
    blobCache.set(key, hit);
    return hit;
  }
  const p = (async () => {
    const res = await fetch(shmuImageUrl(product, f));
    if (!res.ok) throw new Error(`Radar: HTTP ${res.status}`);
    const bmp = await createImageBitmap(await res.blob());
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(bmp, 0, 0);
    if (clean) {
      const img = ctx.getImageData(0, 0, bmp.width, bmp.height);
      cleanShmuPixels(img.data);
      ctx.putImageData(img, 0, 0);
    }
    return URL.createObjectURL(await c.convertToBlob({ type: "image/png" }));
  })();
  p.catch(() => blobCache.delete(key));
  blobCache.set(key, p);
  while (blobCache.size > 80) {
    const k = blobCache.keys().next().value!;
    const old = blobCache.get(k)!;
    blobCache.delete(k);
    old.then((u) => URL.revokeObjectURL(u)).catch(() => undefined);
  }
  return p;
}

/** Snímka najbližšia k času t (ms); null ak je najbližšia ďalej než `maxMs` */
export function nearestFrame(frames: RadarFrame[], t: number, maxMs = 15 * 60_000): number {
  let best = -1;
  let bd = Infinity;
  frames.forEach((f, i) => {
    const d = Math.abs(f.t - t);
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return bd <= maxMs ? best : -1;
}
