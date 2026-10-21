import { useMemo } from "preact/hooks";
import uPlot from "uplot";
import { getPointModel } from "../config/pointModels";
import { fetchPoint, SURFACE_VARS, type PointSeries } from "../data/pointForecast";
import { fromSI, unitFor, unitLabel, type UnitSettings } from "../lib/units";
import { units } from "../state/store";
import { cssVar, mapSeries, timeAxis, trimTrailingNulls, useAsync, valueAxis } from "./common";
import { UPlotChart } from "./UPlotChart";

// Meteogram: teplota a rosný bod, oblačnosť po hladinách, zrážky, vietor + nárazy so smerom, tlak.
// Hodinový krok, 10 dní (alebo menej podľa dosahu modelu).

const DAYS = 10;
const SYNC = "meteogram";

interface Props {
  lat: number;
  lon: number;
  modelId: string;
}

/** Plugin: šípky smeru vetra (kam vietor fúka) pozdĺž horného okraja grafu */
function windArrows(dirs: (number | null)[]): uPlot.Plugin {
  return {
    hooks: {
      draw: (u) => {
        const ctx = u.ctx;
        const xs = u.data[0];
        const minGap = 18 * uPlot.pxRatio;
        const y = u.bbox.top + 9 * uPlot.pxRatio;
        const len = 6 * uPlot.pxRatio;
        ctx.save();
        ctx.strokeStyle = ctx.fillStyle = cssVar("--text");
        ctx.lineWidth = 1.2 * uPlot.pxRatio;
        let lastX = -Infinity;
        for (let i = 0; i < xs.length; i++) {
          const d = dirs[i];
          if (d === null || d === undefined) continue;
          const x = u.valToPos(xs[i]!, "x", true);
          if (x - lastX < minGap || x < u.bbox.left || x > u.bbox.left + u.bbox.width) continue;
          lastX = x;
          // meteorologický smer = odkiaľ fúka; šípka ukazuje, kam fúka
          const a = ((d + 180) * Math.PI) / 180;
          const dx = Math.sin(a) * len;
          const dy = -Math.cos(a) * len;
          ctx.beginPath();
          ctx.moveTo(x - dx, y - dy);
          ctx.lineTo(x + dx, y + dy);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(x + dx, y + dy, 1.8 * uPlot.pxRatio, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      },
    },
  };
}

/** Plugin: oblačnosť ako tri pásy (nízka/stredná/vysoká), sýtosť = pokrytie */
function cloudBands(layers: (number | null)[][]): uPlot.Plugin {
  return {
    hooks: {
      draw: (u) => {
        const ctx = u.ctx;
        const xs = u.data[0];
        const step = xs.length > 1 ? u.valToPos(xs[1]!, "x", true) - u.valToPos(xs[0]!, "x", true) : 4;
        ctx.save();
        ctx.beginPath();
        ctx.rect(u.bbox.left, u.bbox.top, u.bbox.width, u.bbox.height);
        ctx.clip();
        const color = cssVar("--cloud") || "#6b7785";
        ctx.fillStyle = color;
        layers.forEach((layer, row) => {
          const y0 = u.valToPos(row + 1, "y", true);
          const y1 = u.valToPos(row, "y", true);
          for (let i = 0; i < xs.length; i++) {
            const c = layer[i];
            if (!c) continue;
            ctx.globalAlpha = Math.min(1, c / 100);
            const x = u.valToPos(xs[i]!, "x", true);
            ctx.fillRect(x - step / 2, y0 + 1, step + 0.5, y1 - y0 - 2);
          }
        });
        ctx.restore();
      },
    },
  };
}

function buildCharts(s: PointSeries, us: UnitSettings, hasClouds: boolean) {
  const v = s.vars;
  const n = trimTrailingNulls(s.times, [v.temperature_2m!]);
  const x = s.times.slice(0, n).map((t) => t / 1000);
  const tu = unitFor("temperature", us);
  const su = unitFor("speed", us);
  const pu = unitFor("pressure", us);
  const ru = unitFor("precipitation", us);
  const conv = (q: Parameters<typeof fromSI>[0], u: string) => (val: number) => fromSI(q, val, u);
  const base = (height: number): Omit<uPlot.Options, "width" | "series" | "axes"> => ({
    height,
    cursor: { sync: { key: SYNC }, drag: { x: false, y: false } },
    legend: { show: true, live: true },
    scales: { x: { time: false } },
  });
  const red = "#d62728";
  const green = "#2ca02c";
  const blue = cssVar("--accent");

  const charts: { key: string; options: Omit<uPlot.Options, "width">; data: uPlot.AlignedData }[] = [];

  charts.push({
    key: "temp",
    options: {
      ...base(150),
      series: [
        { label: "UTC", value: (_u, t) => (t == null ? "–" : new Date(t * 1000).toISOString().slice(5, 13).replace("T", " ") + "z") },
        { label: "Teplota", stroke: red, width: 2, value: (_u, val) => (val == null ? "–" : `${val.toFixed(1)}`) },
        { label: "Rosný bod", stroke: green, width: 1.5, value: (_u, val) => (val == null ? "–" : `${val.toFixed(1)}`) },
      ],
      axes: [timeAxis(false), valueAxis(unitLabel("temperature", us))],
    },
    data: [x, mapSeries(v.temperature_2m, n, conv("temperature", tu)), mapSeries(v.dew_point_2m, n, conv("temperature", tu))],
  });

  if (hasClouds) {
    const layers = [v.cloud_cover_low, v.cloud_cover_mid, v.cloud_cover_high].map((l) => mapSeries(l, n, (c) => c));
    charts.push({
      key: "clouds",
      options: {
        ...base(70),
        scales: { x: { time: false }, y: { range: [0, 3] } },
        series: [
          {},
          { label: "Nízka %", paths: () => null, points: { show: false }, stroke: "transparent" },
          { label: "Stredná %", paths: () => null, points: { show: false }, stroke: "transparent" },
          { label: "Vysoká %", paths: () => null, points: { show: false }, stroke: "transparent" },
        ],
        axes: [
          timeAxis(false),
          valueAxis("", { splits: () => [0.5, 1.5, 2.5], values: ["N", "S", "V"], grid: { show: false } }),
        ],
        plugins: [cloudBands(layers)],
      },
      data: [x, ...layers],
    });

    charts.push({
      key: "precip",
      options: {
        ...base(90),
        scales: { x: { time: false }, y: { range: (_u, _min, max) => [0, Math.max(max, ru === "in" ? 0.1 : 2)] } },
        series: [
          {},
          {
            label: "Zrážky / h",
            fill: blue,
            stroke: blue,
            paths: uPlot.paths.bars!({ size: [0.8, 12] }),
            points: { show: false },
            value: (_u, val) => (val == null ? "–" : val.toFixed(ru === "in" ? 2 : 1)),
          },
        ],
        axes: [timeAxis(false), valueAxis(unitLabel("precipitation", us))],
      },
      data: [x, mapSeries(v.precipitation, n, conv("precipitation", ru))],
    });
  }

  charts.push({
    key: "wind",
    options: {
      ...base(120),
      scales: { x: { time: false }, y: { range: (_u, _min, max) => [0, Math.max(max * 1.15, 1)] } },
      series: [
        {},
        { label: "Vietor", stroke: "#1f77b4", width: 2, value: (_u, val) => (val == null ? "–" : val.toFixed(su === "ms" ? 1 : 0)) },
        { label: "Nárazy", stroke: "#9467bd", width: 1, dash: [4, 3], value: (_u, val) => (val == null ? "–" : val.toFixed(su === "ms" ? 1 : 0)) },
      ],
      axes: [timeAxis(false), valueAxis(unitLabel("speed", us))],
      plugins: [windArrows(mapSeries(v.wind_direction_10m, n, (d) => d))],
    },
    // Beaufort ako spojitá stupnica (fromSI), aby graf ostal plynulý
    data: [x, mapSeries(v.wind_speed_10m, n, conv("speed", su)), mapSeries(v.wind_gusts_10m, n, conv("speed", su))],
  });

  charts.push({
    key: "pressure",
    options: {
      ...base(130),
      series: [{}, { label: "Tlak MSL", stroke: cssVar("--text"), width: 1.5, value: (_u, val) => (val == null ? "–" : val.toFixed(pu === "hPa" ? 1 : 2)) }],
      axes: [timeAxis(true), valueAxis(unitLabel("pressure", us))],
    },
    data: [x, mapSeries(v.pressure_msl, n, conv("pressure", pu))],
  });

  return { charts, end: x.at(-1) };
}

export function Meteogram({ lat, lon, modelId }: Props) {
  const m = getPointModel(modelId);
  const st = useAsync(() => fetchPoint(lat, lon, [modelId], [...SURFACE_VARS], DAYS), [lat, lon, modelId]);
  const us = units.value;
  const built = useMemo(() => {
    const s = st.data?.[modelId];
    return s ? buildCharts(s, us, m.hasCloudsAndPrecip) : null;
  }, [st.data, us, modelId, m.hasCloudsAndPrecip]);

  if (st.error) return <p class="error">Nepodarilo sa načítať meteogram: {st.error}</p>;
  if (!built) return <p class="muted">Načítavam meteogram…</p>;
  return (
    <div class="meteogram">
      {!m.hasCloudsAndPrecip && <p class="muted note">{m.label} v Open-Meteo nemá oblačnosť po hladinách ani zrážky.</p>}
      {built.charts.map((c) => (
        <UPlotChart key={c.key} options={c.options} data={c.data} />
      ))}
      <p class="muted note">Klik do grafu nastaví čas mapy. Šípky ukazujú, kam vietor fúka.</p>
    </div>
  );
}
