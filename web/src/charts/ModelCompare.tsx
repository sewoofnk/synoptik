import { useMemo, useState } from "preact/hooks";
import type uPlot from "uplot";
import { POINT_MODELS } from "../config/pointModels";
import { fetchModelRun, fetchPoint, type ModelRunInfo, type PointData } from "../data/pointForecast";
import { formatRun } from "../lib/time";
import { fromSI, unitFor, unitLabel, type Quantity } from "../lib/units";
import { units } from "../state/store";
import { mapSeries, timeAxis, trimTrailingNulls, useAsync, valueAxis } from "./common";
import { UPlotChart } from "./UPlotChart";

// Porovnanie modelov: jedna veličina, viac modelov v jednom grafe.

const DAYS = 10;

interface CompareVar {
  id: string;
  label: string;
  quantity: Quantity;
}

const VARS: CompareVar[] = [
  { id: "temperature_2m", label: "Teplota 2 m", quantity: "temperature" },
  { id: "dew_point_2m", label: "Rosný bod 2 m", quantity: "temperature" },
  { id: "pressure_msl", label: "Tlak MSL", quantity: "pressure" },
  { id: "wind_speed_10m", label: "Vietor 10 m", quantity: "speed" },
  { id: "wind_gusts_10m", label: "Nárazy vetra", quantity: "speed" },
  { id: "precipitation", label: "Zrážky (1 h)", quantity: "precipitation" },
  { id: "cloud_cover", label: "Oblačnosť celková", quantity: "percent" },
  { id: "temperature_850hPa", label: "Teplota 850 hPa", quantity: "temperature" },
  { id: "geopotential_height_500hPa", label: "Geopotenciál 500 hPa", quantity: "height" },
];

const DEFAULT_MODELS = ["icon_eu", "chmi_aladin_central_europe_2km", "ecmwf_ifs025", "gfs_seamless"];

interface Props {
  lat: number;
  lon: number;
}

export function ModelCompare({ lat, lon }: Props) {
  const [varId, setVarId] = useState(VARS[0]!.id);
  const [selected, setSelected] = useState<string[]>(DEFAULT_MODELS);
  const cv = VARS.find((v) => v.id === varId)!;
  // poradie modelov podľa registra → stabilná URL pre cache
  const models = POINT_MODELS.filter((m) => selected.includes(m.id));
  const ids = models.map((m) => m.id);

  const st = useAsync(() => (ids.length ? fetchPoint(lat, lon, ids, [varId], DAYS) : Promise.resolve({} as PointData)), [lat, lon, varId, ids.join()]);
  const runs = useAsync(
    () => Promise.all(models.map((m) => fetchModelRun(m.metaId).catch(() => null))),
    [ids.join()],
  );
  const us = units.value;

  const chart = useMemo(() => {
    const d = st.data;
    if (!d || ids.length === 0) return null;
    const present = models.filter((m) => d[m.id]?.vars[varId]?.some((v) => v !== null));
    if (present.length === 0) return { empty: true as const };
    const times = d[present[0]!.id]!.times;
    const n = trimTrailingNulls(times, present.map((m) => d[m.id]!.vars[varId]!));
    const unit = unitFor(cv.quantity, us);
    const runMap = new Map<string, ModelRunInfo | null>(models.map((m, i) => [m.id, runs.data?.[i] ?? null]));
    const dec = cv.quantity === "temperature" || cv.quantity === "precipitation" ? 1 : unit === "inHg" ? 2 : cv.quantity === "pressure" ? 1 : 0;
    const options: Omit<uPlot.Options, "width"> = {
      height: 300,
      cursor: { drag: { x: false, y: false } },
      scales: { x: { time: false } },
      series: [
        { label: "UTC", value: (_u, t) => (t == null ? "–" : new Date(t * 1000).toISOString().slice(5, 13).replace("T", " ") + "z") },
        ...present.map((m) => {
          const r = runMap.get(m.id);
          return {
            label: r ? `${m.label} (${formatRun(r.init)})` : m.label,
            stroke: m.color,
            width: m.id === "icon_eu" ? 2 : 1.5,
            value: (_u: uPlot, val: number | null) => (val == null ? "–" : val.toFixed(dec)),
          };
        }),
      ],
      axes: [timeAxis(true), valueAxis(unitLabel(cv.quantity, us))],
    };
    const data: uPlot.AlignedData = [
      times.slice(0, n).map((t) => t / 1000),
      ...present.map((m) => mapSeries(d[m.id]!.vars[varId], n, (v) => fromSI(cv.quantity, v, unit))),
    ];
    const missing = models.filter((m) => !present.includes(m)).map((m) => m.label);
    return { empty: false as const, options, data, missing };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.data, runs.data, us, varId]);

  const toggle = (id: string, on: boolean) => setSelected((s) => (on ? [...s, id] : s.filter((x) => x !== id)));

  return (
    <div class="compare">
      <div class="compare-controls">
        <select value={varId} onChange={(e) => setVarId(e.currentTarget.value)}>
          {VARS.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label}
            </option>
          ))}
        </select>
        <div class="model-checks">
          {POINT_MODELS.map((m) => (
            <label key={m.id} class="opt">
              <input type="checkbox" checked={selected.includes(m.id)} onChange={(e) => toggle(m.id, e.currentTarget.checked)} />
              <span class="swatch" style={{ background: m.color }} />
              {m.label}
            </label>
          ))}
        </div>
      </div>
      {st.error && <p class="error">Nepodarilo sa načítať: {st.error}</p>}
      {ids.length === 0 && <p class="muted">Vyber aspoň jeden model.</p>}
      {!st.error && ids.length > 0 && !chart && <p class="muted">Načítavam…</p>}
      {chart?.empty && <p class="muted">Vybrané modely túto veličinu v tomto bode nemajú.</p>}
      {chart && !chart.empty && (
        <>
          <UPlotChart options={chart.options} data={chart.data} />
          {chart.missing.length > 0 && <p class="muted note">Bez dát v tomto bode: {chart.missing.join(", ")}</p>}
          <p class="muted note">V zátvorke je posledný beh modelu podľa Open-Meteo. Klik do grafu nastaví čas mapy.</p>
        </>
      )}
    </div>
  );
}
