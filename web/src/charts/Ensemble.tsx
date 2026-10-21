import { useMemo, useState } from "preact/hooks";
import type uPlot from "uplot";
import { ENSEMBLE_MODELS, ENSEMBLE_VARS, ensembleStats, fetchEnsemble } from "../data/ensemble";
import { ENSEMBLE_META, fetchModelRun } from "../data/pointForecast";
import { ageHours, formatRun } from "../lib/time";
import { fromSI, toSI, unitFor, unitLabel } from "../lib/units";
import { units } from "../state/store";
import { cssVar, mapSeries, timeAxis, trimTrailingNulls, useAsync, valueAxis } from "./common";
import { UPlotChart } from "./UPlotChart";

// Ensemble: členy ako tenké čiary, medián, pásmo 10.–90. percentilu, kontrolný beh,
// pod tým pravdepodobnosť prekročenia prahu.

const DAYS = 10;

interface Props {
  lat: number;
  lon: number;
}

export function Ensemble({ lat, lon }: Props) {
  const [modelId, setModelId] = useState(ENSEMBLE_MODELS[0]!.id);
  const [varId, setVarId] = useState(ENSEMBLE_VARS[0]!.id);
  const ev = ENSEMBLE_VARS.find((v) => v.id === varId)!;
  const em = ENSEMBLE_MODELS.find((m) => m.id === modelId)!;
  const us = units.value;
  const unit = unitFor(ev.quantity, us);
  // prah v SI; pri zmene veličiny sa nastaví predvolený
  const [thr, setThr] = useState<{ varId: string; si: number; above: boolean }>({ varId, si: ev.threshold, above: ev.above });
  const threshold = thr.varId === varId ? thr : { varId, si: ev.threshold, above: ev.above };

  const st = useAsync(() => fetchEnsemble(lat, lon, modelId, varId, DAYS), [lat, lon, modelId, varId]);
  const run = useAsync(() => fetchModelRun(em.metaId, ENSEMBLE_META), [em.metaId]);

  const charts = useMemo(() => {
    const d = st.data;
    if (!d || d.members.length === 0) return null;
    const n = trimTrailingNulls(d.times, d.members);
    if (n === 0) return null;
    const x = d.times.slice(0, n).map((t) => t / 1000);
    const conv = (v: number) => fromSI(ev.quantity, v, unit);
    const members = d.members.map((m) => mapSeries(m, n, conv));
    const stats = ensembleStats(
      d.members.map((m) => m.slice(0, n)),
      threshold.si,
      threshold.above,
    );
    const member = cssVar("--muted") || "#888";
    const accent = cssVar("--accent");
    const mIdx = members.length;
    const series: uPlot.Series[] = [
      {},
      ...members.map(() => ({ stroke: member, width: 0.6, alpha: 0.35, points: { show: false } }) as uPlot.Series),
      { label: "P10", stroke: accent, width: 1, dash: [3, 3] },
      { label: "P90", stroke: accent, width: 1, dash: [3, 3] },
      { label: "Medián", stroke: accent, width: 2.4 },
      { label: "Kontrolný", stroke: "#d62728", width: 1.4, dash: [6, 3] },
    ];
    const main: Omit<uPlot.Options, "width"> = {
      height: 260,
      legend: { show: false },
      cursor: { drag: { x: false, y: false }, sync: { key: "ens" } },
      scales: { x: { time: false } },
      series,
      bands: [{ series: [mIdx + 2, mIdx + 1], fill: "rgba(61,139,253,0.18)" }],
      axes: [timeAxis(false), valueAxis(unitLabel(ev.quantity, us))],
    };
    const mainData: uPlot.AlignedData = [
      x,
      ...members,
      mapSeries(stats.p10, n, conv),
      mapSeries(stats.p90, n, conv),
      mapSeries(stats.median, n, conv),
      mapSeries(d.control ?? [], n, conv),
    ];
    const prob: Omit<uPlot.Options, "width"> = {
      height: 110,
      cursor: { drag: { x: false, y: false }, sync: { key: "ens" } },
      scales: { x: { time: false }, y: { range: [0, 100] } },
      series: [
        { label: "UTC", value: (_u, t) => (t == null ? "–" : new Date(t * 1000).toISOString().slice(5, 13).replace("T", " ") + "z") },
        { label: "Pravdepodobnosť %", stroke: accent, fill: "rgba(61,139,253,0.25)", width: 1.5, value: (_u, v) => (v == null ? "–" : v.toFixed(0)) },
      ],
      axes: [timeAxis(true), valueAxis("%", { splits: () => [0, 50, 100] })],
    };
    return { main, mainData, prob, probData: [x, stats.prob.slice(0, n)] as uPlot.AlignedData, members: members.length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.data, us, threshold.si, threshold.above]);

  const thrDisplay = Math.round(fromSI(ev.quantity, threshold.si, unit) * 10) / 10;

  return (
    <div class="ensemble">
      <div class="compare-controls">
        <div class="row-2">
          <select value={modelId} onChange={(e) => setModelId(e.currentTarget.value)} aria-label="Ensemble model">
            {ENSEMBLE_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          <select value={varId} onChange={(e) => setVarId(e.currentTarget.value)} aria-label="Veličina">
            {ENSEMBLE_VARS.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </div>
        <p class="run-line mono">
          {em.label}
          {run.data && (
            <>
              {" · beh "}
              <b>{formatRun(run.data.init)}</b>
              <span class="muted"> ({ageHours(run.data.init)} h)</span>
            </>
          )}
          {charts && <span class="muted"> · {charts.members} členov</span>}
        </p>
      </div>
      {st.error && <p class="error">Nepodarilo sa načítať ensemble: {st.error}</p>}
      {!st.error && !charts && (st.loading ? <p class="muted">Načítavam ensemble…</p> : <p class="muted">Model túto veličinu v tomto bode nemá.</p>)}
      {charts && (
        <>
          <UPlotChart options={charts.main} data={charts.mainData} />
          <p class="muted note">
            Sivé: členy · modrá: medián, čiarkovane 10. a 90. percentil (pásmo) · červená: kontrolný beh
          </p>
          <div class="threshold">
            <span>Pravdepodobnosť</span>
            <div class="segmented small">
              <button class={threshold.above ? "active" : ""} onClick={() => setThr({ ...threshold, above: true })}>
                &gt;
              </button>
              <button class={!threshold.above ? "active" : ""} onClick={() => setThr({ ...threshold, above: false })}>
                &lt;
              </button>
            </div>
            <input
              type="number"
              inputMode="decimal"
              step="any"
              value={thrDisplay}
              onChange={(e) => {
                const v = Number(e.currentTarget.value);
                if (Number.isFinite(v)) setThr({ ...threshold, si: toSI(ev.quantity, v, unit) });
              }}
              aria-label="Prah"
            />
            <span>{unitLabel(ev.quantity, us)}</span>
          </div>
          <UPlotChart options={charts.prob} data={charts.probData} />
          <p class="muted note">Klik do grafu nastaví čas mapy.</p>
        </>
      )}
    </div>
  );
}
