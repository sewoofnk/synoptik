import { contours } from "d3-contour";
import { useEffect, useMemo, useRef } from "preact/hooks";
import { colorAt, COLOR_SCALES } from "../config/colorscales";
import { fetchPoint, PRESSURE_LEVELS, type PointSeries } from "../data/pointForecast";
import { fromSI, unitFor } from "../lib/units";
import { timeIso, units, validTime } from "../state/store";
import { useAsync } from "./common";
import { barbPath } from "./skewtGeometry";

// Airgram (ako Windy): čas × tlak, farebná teplota, izotermy po 5 °C (0 °C zvýraznená),
// vlajky vetra v hladinách, šedé pod terénom.

const DAYS = 7;
const P_BOT = 1000; // hPa
const P_TOP = 200;
const H = 280;
const TOP = 20; // hlavička s dňami
const COL = 12; // px na hodinu
const BARB_LEVELS = [925, 850, 700, 500, 400, 300, 250];
const AXIS = [1000, 925, 850, 700, 500, 400, 300, 250, 200];
const WEEKDAYS = ["Ne", "Po", "Ut", "St", "Št", "Pi", "So"];

const yOf = (p: number) => TOP + (H * Math.log(P_BOT / p)) / Math.log(P_BOT / P_TOP);
const pOf = (y: number) => P_BOT / Math.exp(((y - TOP) / H) * Math.log(P_BOT / P_TOP));

const VARS = [
  "surface_pressure",
  ...PRESSURE_LEVELS.filter((l) => l >= P_TOP).flatMap((l) => [
    `temperature_${l}hPa`,
    `wind_speed_${l}hPa`,
    `wind_direction_${l}hPa`,
  ]),
];

/** Teplota [K] v čase i a tlaku p [hPa] interpoláciou v ln p; NaN pod terénom alebo bez dát */
function tempAt(s: PointSeries, i: number, p: number): number {
  const ps = s.vars.surface_pressure?.[i];
  if (ps !== null && ps !== undefined && p * 100 > ps) return NaN;
  let lo: [number, number] | null = null; // (tlak, T) pod p (vyšší tlak)
  let hi: [number, number] | null = null;
  for (const l of PRESSURE_LEVELS) {
    const t = s.vars[`temperature_${l}hPa`]?.[i];
    if (t === null || t === undefined) continue;
    if (l >= p && (!lo || l < lo[0])) lo = [l, t];
    if (l <= p && (!hi || l > hi[0])) hi = [l, t];
  }
  if (!lo || !hi) return lo?.[1] ?? hi?.[1] ?? NaN;
  if (lo[0] === hi[0]) return lo[1];
  const w = Math.log(lo[0] / p) / Math.log(lo[0] / hi[0]);
  return lo[1] + w * (hi[1] - lo[1]);
}

interface Props {
  lat: number;
  lon: number;
  modelId: string;
}

export function Airgram({ lat, lon, modelId }: Props) {
  const st = useAsync(() => fetchPoint(lat, lon, [modelId], VARS, DAYS), [lat, lon, modelId]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const us = units.value;
  const s = st.data?.[modelId];

  const n = useMemo(() => {
    if (!s) return 0;
    const t = s.vars.temperature_850hPa ?? [];
    let k = t.length;
    while (k > 0 && (t[k - 1] === null || t[k - 1] === undefined)) k--;
    return k;
  }, [s]);
  const W = n * COL;

  // rastrová teplota
  useEffect(() => {
    const c = canvas.current;
    if (!c || !s || n < 2) return;
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d")!;
    const img = ctx.createImageData(W, H);
    const scale = COLOR_SCALES.temperature_upper!;
    for (let y = 0; y < H; y++) {
      const p = pOf(y + TOP);
      for (let x = 0; x < W; x++) {
        const f = x / COL;
        const i0 = Math.min(n - 1, Math.floor(f));
        const i1 = Math.min(n - 1, i0 + 1);
        const a = tempAt(s, i0, p);
        const b = tempAt(s, i1, p);
        const t = Number.isNaN(a) ? b : Number.isNaN(b) ? a : a + (b - a) * (f - i0);
        const k = (y * W + x) * 4;
        if (Number.isNaN(t)) {
          img.data.set([150, 150, 150, 255], k); // pod terénom
        } else {
          const col = colorAt(scale, t);
          img.data.set([col[0], col[1], col[2], 215], k);
        }
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [s, n, W]);

  // izotermy (d3-contour na mriežke čas × 60 hladín v ln p)
  const iso = useMemo(() => {
    if (!s || n < 2) return [];
    const NY = 60;
    const grid: number[] = new Array(n * NY);
    for (let k = 0; k < NY; k++) {
      const p = pOf(TOP + (k / (NY - 1)) * H);
      for (let i = 0; i < n; i++) {
        const t = tempAt(s, i, p);
        grid[k * n + i] = Number.isNaN(t) ? -999 : t;
      }
    }
    const th: number[] = [];
    for (let t = 213.15; t <= 313.15; t += 5) th.push(t);
    const gen = contours().size([n, NY]).thresholds(th).smooth(true);
    const sx = (x: number) => (x - 0.5) * COL + COL / 2;
    const sy = (y: number) => TOP + ((y - 0.5) / (NY - 1)) * H;
    return gen(grid).map((mp) => ({
      value: mp.value,
      d: mp.coordinates
        .flatMap((poly) => poly.map((ring) => ring.map(([x, y], j) => `${j ? "L" : "M"}${sx(x!).toFixed(1)},${sy(y!).toFixed(1)}`).join("")))
        .join(""),
    }));
  }, [s, n]);

  if (st.error) return <p class="error pad">Nepodarilo sa načítať: {st.error}</p>;
  if (!s) return <p class="muted pad">Načítavam…</p>;
  if (n < 2) return <p class="muted pad">Model nemá tlakové hladiny pre tento bod.</p>;

  const times = s.times.slice(0, n);
  const vt = validTime.value;
  const vx = vt ? ((vt.getTime() - times[0]!) / 3_600_000) * COL + COL / 2 : -1;
  const tu = unitFor("temperature", us);
  const days = times.map((t, i) => ({ t, i })).filter(({ t }) => new Date(t).getHours() === 0);

  return (
    <div class="airgram">
      <div class="ag-axis" style={{ height: `${TOP + H}px` }}>
        {AXIS.map((p) => (
          <span key={p} style={{ top: `${yOf(p) - 7}px` }}>
            {p}
          </span>
        ))}
      </div>
      <div class="ag-scroll">
        <div
          class="ag-plot"
          style={{ width: `${W}px`, height: `${TOP + H}px` }}
          onClick={(e) => {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            const i = Math.max(0, Math.min(n - 1, Math.floor((e.clientX - r.left) / COL)));
            timeIso.value = new Date(times[i]!).toISOString();
          }}
        >
          <canvas ref={canvas} style={{ top: `${TOP}px`, width: `${W}px`, height: `${H}px` }} />
          <svg width={W} height={TOP + H} viewBox={`0 0 ${W} ${TOP + H}`}>
            {days.map(({ t, i }) => (
              <g key={t}>
                <line class="ag-day" x1={i * COL} x2={i * COL} y1={0} y2={TOP + H} />
                <text class="ag-daylbl" x={i * COL + 4} y={14}>
                  {WEEKDAYS[new Date(t).getDay()]} {new Date(t).getDate()}.
                </text>
              </g>
            ))}
            {AXIS.map((p) => (
              <line key={p} class="ag-isobar" x1={0} x2={W} y1={yOf(p)} y2={yOf(p)} />
            ))}
            {iso.map((c) => (
              <path key={c.value} class={Math.abs(c.value - 273.15) < 0.01 ? "ag-zero" : "ag-iso"} d={c.d} />
            ))}
            {/* popisky izoterm pri každom dni */}
            {days.map(({ i }) =>
              iso
                .filter((c) => Math.round(c.value - 273.15) % 10 === 0)
                .map((c) => {
                  // výška izotermy v danom čase: prvý tlak zdola, kde T klesne pod hodnotu
                  for (let y = H; y > 0; y -= 2) {
                    const t = tempAt(s, i, pOf(TOP + y));
                    if (!Number.isNaN(t) && t <= c.value) {
                      return (
                        <text key={`${i}-${c.value}`} class="ag-isolbl" x={i * COL + 6} y={TOP + y - 2}>
                          {Math.round(fromSI("temperature", c.value, tu))}°
                        </text>
                      );
                    }
                  }
                  return null;
                }),
            )}
            {times.map((_, i) =>
              i % 6 === 3
                ? BARB_LEVELS.map((l) => {
                    const sp = s.vars[`wind_speed_${l}hPa`]?.[i];
                    const dir = s.vars[`wind_direction_${l}hPa`]?.[i];
                    const ps = s.vars.surface_pressure?.[i];
                    if (sp === null || sp === undefined || dir === null || dir === undefined) return null;
                    if (ps && l * 100 > ps) return null;
                    const b = barbPath(i * COL + COL / 2, yOf(l), sp / 0.514444, dir, 15);
                    return (
                      <g key={`${i}-${l}`}>
                        <path class="ag-barb" d={b.stroke} />
                        {b.fill && <path class="ag-barb-fill" d={b.fill} />}
                      </g>
                    );
                  })
                : null,
            )}
            {vx >= 0 && vx <= W && <line class="ag-now" x1={vx} x2={vx} y1={TOP} y2={TOP + H} />}
          </svg>
        </div>
      </div>
    </div>
  );
}
