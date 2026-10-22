// Pozorovania na mape (R-014): METAR (farba podľa letovej kategórie) a SYNOP (staničný model:
// krúžok oblačnosti v osminách, vlajka vetra, teplota, rosný bod, tlak MSL).
// Stanice sa preriedia podľa mriežky na obrazovke, aby sa symboly neprekrývali; všetky vrstvy
// potom kreslia rovnakú podmnožinu staníc (bez kolízií MapLibre medzi vrstvami).

import { Popup, type GeoJSONSource, type Map as MlMap, type MapMouseEvent } from "maplibre-gl";
import type { MetarObs, SynopStation } from "../data/obs";
import { fetchTaf } from "../data/obs";
import { formatValue, type UnitSettings } from "../lib/units";

const KT = 0.514444;
const CELL_PX = 64; // jedna stanica na bunku mriežky obrazovky
export const CAT_COLORS: Record<string, string> = { VFR: "#22a447", MVFR: "#1f6feb", IFR: "#e5484d", LIFR: "#c026d3" };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const pad = (n: number) => String(n).padStart(2, "0");
const utc = (ms: number) => {
  const d = new Date(ms);
  return `${d.getUTCDate()}.${d.getUTCMonth() + 1}. ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
};

/** Vlajka vetra (sever hore, žrď zo stredu nahor) ako obrázok pre MapLibre */
function barbImage(kt: number, dark: boolean): ImageData {
  const S = 64; // px pri pixelRatio 2 → 32 CSS px
  const c = new OffscreenCanvas(S, S);
  const ctx = c.getContext("2d")!;
  const cx = S / 2, cy = S / 2, len = 28, gap = 6, fl = 13;
  const draw = (color: string, w: number) => {
    ctx.strokeStyle = ctx.fillStyle = color;
    ctx.lineWidth = w;
    ctx.lineCap = "round";
    if (kt < 3) {
      ctx.beginPath();
      ctx.arc(cx, cy, 9, 0, Math.PI * 2);
      ctx.stroke();
      return;
    }
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx, cy - len);
    ctx.stroke();
    let v = Math.round(kt / 5) * 5;
    let y = cy - len;
    while (v >= 50) {
      ctx.beginPath();
      ctx.moveTo(cx, y);
      ctx.lineTo(cx + fl, y + gap * 0.6);
      ctx.lineTo(cx, y + gap * 1.4);
      ctx.closePath();
      ctx.fill();
      y += gap * 1.8;
      v -= 50;
    }
    while (v >= 10) {
      ctx.beginPath();
      ctx.moveTo(cx, y);
      ctx.lineTo(cx + fl, y - 4);
      ctx.stroke();
      y += gap;
      v -= 10;
    }
    if (v >= 5) {
      if (y === cy - len) y += gap;
      ctx.beginPath();
      ctx.moveTo(cx, y);
      ctx.lineTo(cx + fl / 2, y - 2);
      ctx.stroke();
    }
  };
  draw(dark ? "rgba(0,0,0,0.85)" : "rgba(255,255,255,0.9)", 5.5);
  draw(dark ? "#f2f4f7" : "#14181f", 2.6);
  return ctx.getImageData(0, 0, S, S);
}

/** Krúžok oblačnosti (WMO 2700): 0–8 osmín, 9 = obloha nezistiteľná, x = chýba */
function cloudImage(n: number | "x", dark: boolean): ImageData {
  const S = 36;
  const c = new OffscreenCanvas(S, S);
  const ctx = c.getContext("2d")!;
  const cx = S / 2, cy = S / 2, r = 11;
  const fg = dark ? "#f2f4f7" : "#14181f";
  ctx.fillStyle = dark ? "#1b1f26" : "#ffffff";
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = fg;
  if (typeof n === "number" && n > 0 && n <= 8) {
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * n) / 8);
    ctx.closePath();
    ctx.fill();
  }
  ctx.strokeStyle = fg;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  if (n === 9 || n === "x") {
    ctx.beginPath();
    ctx.moveTo(cx - 7, cy - 7);
    ctx.lineTo(cx + 7, cy + 7);
    if (n === 9) {
      ctx.moveTo(cx + 7, cy - 7);
      ctx.lineTo(cx - 7, cy + 7);
    }
    ctx.stroke();
  }
  return ctx.getImageData(0, 0, S, S);
}

interface Pt {
  lon: number;
  lat: number;
  /** vyššia priorita sa ukáže skôr (pri preriedení) */
  prio: number;
}

/** Preriedenie: najviac jedna stanica na bunku mriežky obrazovky, prednosť má vyššia priorita */
function thin<T extends Pt>(map: MlMap, items: T[]): T[] {
  const b = map.getBounds();
  const w = map.getCanvas().clientWidth, h = map.getCanvas().clientHeight;
  const taken = new Set<string>();
  const out: T[] = [];
  for (const it of [...items].sort((a, c) => c.prio - a.prio)) {
    if (it.lat < b.getSouth() - 1 || it.lat > b.getNorth() + 1 || it.lon < b.getWest() - 1 || it.lon > b.getEast() + 1) continue;
    const p = map.project([it.lon, it.lat]);
    if (p.x < -CELL_PX || p.y < -CELL_PX || p.x > w + CELL_PX || p.y > h + CELL_PX) continue;
    const key = `${Math.floor(p.x / CELL_PX)},${Math.floor(p.y / CELL_PX)}`;
    if (taken.has(key)) continue;
    taken.add(key);
    out.push(it);
  }
  return out;
}

const LAYERS = {
  metarDot: "obs-metar-dot",
  metarBarb: "obs-metar-barb",
  metarT: "obs-metar-t",
  metarTd: "obs-metar-td",
  metarId: "obs-metar-id",
  synopCloud: "obs-synop-cloud",
  synopBarb: "obs-synop-barb",
  synopT: "obs-synop-t",
  synopTd: "obs-synop-td",
  synopP: "obs-synop-p",
};
export const OBS_CLICK_LAYERS = [LAYERS.metarDot, LAYERS.metarBarb, LAYERS.synopCloud, LAYERS.synopBarb];

export class ObsOverlay {
  private metar: (MetarObs & Pt)[] = [];
  private synop: (SynopStation & Pt)[] = [];
  private units: UnitSettings | null = null;
  private popup = new Popup({ closeButton: true, maxWidth: "340px", className: "obs-popup" });

  constructor(private map: MlMap) {
    map.on("moveend", () => this.render());
    for (const id of OBS_CLICK_LAYERS) {
      map.on("click", id, (e) => this.onClick(e));
      map.on("mouseenter", id, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", id, () => (map.getCanvas().style.cursor = ""));
    }
  }

  /** Obrázky, zdroje a vrstvy (po každom načítaní štýlu) */
  addLayers(before: string | undefined, dark: boolean) {
    const map = this.map;
    for (let kt = 0; kt <= 150; kt += 5) {
      const name = `barb-${kt}`;
      if (map.hasImage(name)) map.removeImage(name);
      map.addImage(name, barbImage(kt, dark), { pixelRatio: 2 });
    }
    for (const n of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, "x"] as const) {
      const name = `cc-${n}`;
      if (map.hasImage(name)) map.removeImage(name);
      map.addImage(name, cloudImage(n, dark), { pixelRatio: 2 });
    }
    for (const src of ["obs-metar", "obs-synop"]) {
      if (!map.getSource(src)) map.addSource(src, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    }
    const halo = dark ? "rgba(10,12,16,0.9)" : "rgba(255,255,255,0.95)";
    const sym = { "icon-allow-overlap": true, "icon-ignore-placement": true, "text-allow-overlap": true, "text-ignore-placement": true } as const;
    const text = (id: string, src: string, field: string, anchor: string, offset: [number, number], color: string, size = 12) => {
      if (map.getLayer(id)) return;
      map.addLayer(
        {
          id,
          type: "symbol",
          source: src,
          layout: {
            ...sym,
            "text-field": ["get", field],
            "text-font": ["Noto Sans Bold"],
            "text-size": size,
            "text-anchor": anchor as "center",
            "text-offset": offset,
          },
          paint: { "text-color": color, "text-halo-color": halo, "text-halo-width": 1.6 },
        },
        before,
      );
    };
    const barb = (id: string, src: string) => {
      if (map.getLayer(id)) return;
      map.addLayer(
        {
          id,
          type: "symbol",
          source: src,
          filter: ["has", "kt5"],
          layout: {
            ...sym,
            "icon-image": ["concat", "barb-", ["get", "kt5"]],
            "icon-rotate": ["get", "dir"],
            "icon-rotation-alignment": "map",
          },
        },
        before,
      );
    };
    // SYNOP
    barb(LAYERS.synopBarb, "obs-synop");
    if (!map.getLayer(LAYERS.synopCloud)) {
      map.addLayer(
        { id: LAYERS.synopCloud, type: "symbol", source: "obs-synop", layout: { ...sym, "icon-image": ["concat", "cc-", ["get", "cc"]] } },
        before,
      );
    }
    text(LAYERS.synopT, "obs-synop", "t", "bottom-right", [-0.7, -0.15], dark ? "#ff8a7a" : "#c8281e");
    text(LAYERS.synopTd, "obs-synop", "td", "top-right", [-0.7, 0.15], dark ? "#7ee08a" : "#16803c");
    text(LAYERS.synopP, "obs-synop", "p", "bottom-left", [0.7, -0.15], dark ? "#e6edf3" : "#1b1f24", 11);
    // METAR
    barb(LAYERS.metarBarb, "obs-metar");
    if (!map.getLayer(LAYERS.metarDot)) {
      map.addLayer(
        {
          id: LAYERS.metarDot,
          type: "circle",
          source: "obs-metar",
          paint: {
            "circle-radius": 6,
            "circle-color": ["coalesce", ["get", "color"], "#8a94a3"],
            "circle-stroke-color": dark ? "#0e1116" : "#ffffff",
            "circle-stroke-width": 1.8,
          },
        },
        before,
      );
    }
    text(LAYERS.metarT, "obs-metar", "t", "bottom-right", [-0.6, -0.1], dark ? "#ff8a7a" : "#c8281e");
    text(LAYERS.metarTd, "obs-metar", "td", "top-right", [-0.6, 0.1], dark ? "#7ee08a" : "#16803c");
    text(LAYERS.metarId, "obs-metar", "label", "top-left", [0.6, 0.15], dark ? "#cfd6df" : "#3b4450", 10);
    this.render();
  }

  setMetar(obs: MetarObs[] | null) {
    // priorita: veľké letiská (dlhší TAF/viac správ nevieme) → aspoň stabilné poradie podľa kódu
    this.metar = (obs ?? []).map((o) => ({ ...o, prio: o.id.startsWith("LZ") ? 2 : 1 }));
    this.render();
  }

  setSynop(st: SynopStation[] | null) {
    // hlavné stanice (index končiaci 0) a slovenské majú prednosť
    this.synop = (st ?? []).map((s) => ({ ...s, prio: (s.wmo.startsWith("118") || s.wmo.startsWith("119") ? 2 : 0) + (s.wmo.endsWith("0") ? 1 : 0) }));
    this.render();
  }

  setUnits(u: UnitSettings) {
    this.units = u;
    this.render();
  }

  private render() {
    const map = this.map;
    const u = this.units;
    const ms = map.getSource("obs-metar") as GeoJSONSource | undefined;
    const ss = map.getSource("obs-synop") as GeoJSONSource | undefined;
    if (!ms || !ss || !u) return;
    const tf = (k: number | null) => (k === null ? "" : formatValue("temperature", k, u, 0));
    const barbProps = (dir: number | null, kt: number | null) =>
      kt === null || dir === null ? {} : { kt5: Math.min(150, Math.round(kt / 5) * 5), dir };

    ms.setData({
      type: "FeatureCollection",
      features: thin(map, this.metar).map((o) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [o.lon, o.lat] },
        properties: {
          id: o.id,
          color: CAT_COLORS[o.cat] ?? null,
          t: tf(o.t === null ? null : o.t + 273.15),
          td: tf(o.td === null ? null : o.td + 273.15),
          label: o.wx ? `${o.id} ${o.wx}` : o.id,
          ...barbProps(o.wd, o.ws),
        },
      })),
    });
    ss.setData({
      type: "FeatureCollection",
      features: thin(map, this.synop).map((st) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [st.lon, st.lat] },
        properties: {
          wmo: st.wmo,
          cc: st.s.n === null ? "x" : String(st.s.n),
          t: tf(st.s.t),
          td: tf(st.s.td),
          // tlak MSL po staro-synopticky: posledné tri číslice v desatinách hPa (1018,2 → 182)
          p: st.s.pmsl === null ? "" : String(Math.round(st.s.pmsl / 10) % 1000).padStart(3, "0"),
          ...barbProps(st.s.dir, st.s.ff === null ? null : st.s.ff / KT),
        },
      })),
    });
  }

  private onClick(e: MapMouseEvent & { features?: { properties: Record<string, unknown> }[] }) {
    const f = e.features?.[0];
    if (!f || !this.units) return;
    const u = this.units;
    const id = f.properties.id as string | undefined;
    const wmo = f.properties.wmo as string | undefined;
    const row = (k: string, v: string) => (v ? `<tr><th>${k}</th><td>${esc(v)}</td></tr>` : "");
    if (id) {
      const o = this.metar.find((x) => x.id === id);
      if (!o) return;
      const k = (c: number | null) => (c === null ? "" : formatValue("temperature", c + 273.15, u) + " " + (u.temperature === "C" ? "°C" : u.temperature === "F" ? "°F" : "K"));
      const html = `<div class="obs-pop">
        <div class="obs-head"><b>${esc(o.id)}</b> <span class="cat" style="background:${CAT_COLORS[o.cat] ?? "#8a94a3"}">${esc(o.cat || "?")}</span>
        <span class="muted">${utc(o.time)}</span></div>
        <table>${row("Vietor", o.ws === null ? "" : `${o.wd === null ? "VRB" : String(o.wd).padStart(3, "0") + "°"} ${o.ws} kt${o.wg ? ` nárazy ${o.wg} kt` : ""}`)}
        ${row("Dohľadnosť", o.vis === null ? "" : o.vis >= 9999 ? "≥ 10 km" : `${o.vis} m`)}
        ${row("Jav", o.wx)}
        ${row("Oblačnosť", o.clouds.map(([c, b]) => (b === null ? c : `${c} ${b} ft`)).join(", "))}
        ${row("T / Td", `${k(o.t)} / ${k(o.td)}`)}
        ${row("QNH", o.qnh === null ? "" : `${o.qnh} hPa`)}</table>
        <pre>${esc(o.raw)}</pre><div class="taf muted">TAF: načítavam…</div></div>`;
      this.popup.setLngLat([o.lon, o.lat]).setHTML(html).addTo(this.map);
      fetchTaf(o.id)
        .then((t) => {
          const el = this.popup.getElement()?.querySelector(".taf");
          if (el) el.outerHTML = t.raw ? `<pre class="taf">${esc(t.raw)}</pre>` : `<div class="taf muted">TAF pre ${esc(o.id)} nie je.</div>`;
        })
        .catch(() => {
          const el = this.popup.getElement()?.querySelector(".taf");
          if (el) el.textContent = "TAF sa nepodarilo načítať.";
        });
    } else if (wmo) {
      const st = this.synop.find((x) => x.wmo === wmo);
      if (!st) return;
      const s = st.s;
      const ww = s.ww === null ? null : wwText(s.ww);
      const html = `<div class="obs-pop">
        <div class="obs-head"><b>${esc(st.name)}</b> <span class="muted">${esc(st.wmo)} · ${utc(st.time)}</span></div>
        <table>${row("Teplota", s.t === null ? "" : formatValue("temperature", s.t, u, 1) + "°")}
        ${row("Rosný bod", s.td === null ? "" : formatValue("temperature", s.td, u, 1) + "°")}
        ${row("Vietor", s.ff === null ? "" : `${s.dir === null ? "premenlivý" : s.dir + "°"} ${formatValue("speed", s.ff, u)}${s.gust ? `, nárazy ${formatValue("speed", s.gust, u)}` : ""} ${unitText(u)}`)}
        ${row("Oblačnosť", s.n === null ? "" : s.n === 9 ? "obloha nezistiteľná" : `${s.n}/8`)}
        ${row("Tlak MSL", s.pmsl === null ? "" : formatValue("pressure", s.pmsl, u) + " " + u.pressure)}
        ${row("Tendencia 3 h", s.tendency === null ? "" : `${s.tendency.dp >= 0 ? "+" : ""}${(s.tendency.dp / 100).toFixed(1)} hPa`)}
        ${row("Zrážky", s.precip === null ? "" : `${s.precip.mm} mm za ${s.precip.hours} h`)}
        ${row("Počasie", ww ?? "")}
        ${row("Dohľadnosť", s.vis === null ? "" : s.vis >= 10000 ? `${s.vis / 1000} km` : `${s.vis} m`)}</table>
        <pre>${esc(st.msg)}</pre></div>`;
      this.popup.setLngLat([st.lon, st.lat]).setHTML(html).addTo(this.map);
    }
  }

  dispose() {
    this.popup.remove();
  }
}

function unitText(u: UnitSettings): string {
  return ({ ms: "m/s", kmh: "km/h", kt: "kt", mph: "mph", bft: "Bft" } as Record<string, string>)[u.speed] ?? "";
}

/** Súčasné počasie ww (WMO 4677) – hrubé skupiny po slovensky */
export function wwText(ww: number): string {
  if (ww <= 3) return "bez javov";
  if (ww <= 5) return ww === 4 ? "dym" : "zákal";
  if (ww <= 9) return "prach / piesok";
  if (ww === 10) return "dymno";
  if (ww <= 12) return "prízemná hmla";
  if (ww === 13) return "blýskavica";
  if (ww <= 16) return "zrážky v okolí";
  if (ww === 17) return "búrka bez zrážok";
  if (ww === 18) return "húlava";
  if (ww === 19) return "tromba";
  if (ww <= 29) return "jav v poslednej hodine";
  if (ww <= 39) return "prachová / snehová víchrica";
  if (ww <= 49) return "hmla";
  if (ww <= 59) return "mrholenie";
  if (ww <= 69) return "dážď";
  if (ww <= 79) return "sneženie";
  if (ww <= 90) return "prehánky";
  return "búrka";
}

/** Je pod kliknutím stanica? (aby klik na stanicu neotvoril bodovú predpoveď) */
export function isObsHit(map: MlMap, point: { x: number; y: number }): boolean {
  const layers = OBS_CLICK_LAYERS.filter((l) => map.getLayer(l));
  return layers.length > 0 && map.queryRenderedFeatures([point.x, point.y], { layers }).length > 0;
}

