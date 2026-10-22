// Serializácia pohľadu (model, beh, vrstva, prekrytia, čas, poloha mapy) do URL hash.
// Čisté funkcie bez závislosti od DOM – testované.

import { LEVELS, type Level, type OverlayId } from "../config/layers.config";

export interface ViewState {
  model: string;
  /** null = vždy najnovší beh */
  run: string | null;
  layer: string;
  level: Level;
  overlays: OverlayId[];
  /** ISO čas platnosti; null = prvý krok behu */
  time: string | null;
  center: [number, number];
  zoom: number;
}

const OVERLAY_IDS: readonly OverlayId[] = ["isobars", "isotherms", "particles", "metar", "synop"];

/** "2026-10-21T06:00:00.000Z" → "2026-10-21T06" (hodinová presnosť stačí) */
export function compactTime(iso: string): string {
  return iso.slice(0, 13);
}

function expandTime(s: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}$/.test(s)) return null;
  const d = new Date(`${s}:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function encodeHash(s: ViewState): string {
  const p = new URLSearchParams();
  p.set("m", s.model);
  p.set("r", s.run ? compactTime(s.run) : "latest");
  p.set("l", s.layer);
  p.set("lv", String(s.level));
  p.set("o", s.overlays.join(","));
  if (s.time) p.set("t", compactTime(s.time));
  p.set("v", `${s.center[0].toFixed(2)},${s.center[1].toFixed(2)},${s.zoom.toFixed(2)}`);
  // čiarky v hash nechať čitateľné
  return "#" + p.toString().replace(/%2C/g, ",");
}

/** Prečíta hash; neplatné alebo chýbajúce položky vezme z `fallback` */
export function decodeHash(hash: string, fallback: ViewState): ViewState {
  const p = new URLSearchParams(hash.replace(/^#/, ""));
  const out: ViewState = { ...fallback, overlays: [...fallback.overlays], center: [...fallback.center] };
  const m = p.get("m");
  if (m) out.model = m;
  const r = p.get("r");
  if (r === "latest") out.run = null;
  else if (r) out.run = expandTime(r) ?? out.run;
  const l = p.get("l");
  if (l) out.layer = l;
  const lv = p.get("lv");
  if (lv) {
    const level = (lv === "sfc" ? "sfc" : Number(lv)) as Level;
    if (LEVELS.includes(level)) out.level = level;
  }
  const o = p.get("o");
  if (o !== null) out.overlays = o.split(",").filter((x): x is OverlayId => (OVERLAY_IDS as string[]).includes(x));
  const t = p.get("t");
  if (t) out.time = expandTime(t) ?? out.time;
  const v = p.get("v")?.split(",").map(Number);
  if (v && v.length === 3 && v.every(Number.isFinite)) {
    const [lng, lat, zoom] = v as [number, number, number];
    if (Math.abs(lat) <= 85 && zoom >= 0 && zoom <= 22) {
      out.center = [lng, lat];
      out.zoom = zoom;
    }
  }
  return out;
}
