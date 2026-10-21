import { useRef } from "preact/hooks";
import { getPointModel, POINT_MODELS } from "../config/pointModels";
import { Ensemble } from "../charts/Ensemble";
import { Meteogram } from "../charts/Meteogram";
import { ModelCompare } from "../charts/ModelCompare";
import { SkewT } from "../charts/SkewT";
import { useAsync } from "../charts/common";
import { fetchModelRun } from "../data/pointForecast";
import { ageHours, formatRun } from "../lib/time";
import { point, pointModelId, pointTab, type PointTab } from "../state/store";
import { Icon } from "./icons";

// Bodový panel (desktop vľavo, mobil list zdola) po kliknutí na mapu: Meteogram / Skew-T / Porovnanie modelov.

const TABS: { id: PointTab; label: string }[] = [
  { id: "meteogram", label: "Meteogram" },
  { id: "skewt", label: "Skew-T" },
  { id: "compare", label: "Modely" },
  { id: "ensemble", label: "Ensemble" },
];

function coord(v: number, pos: string, neg: string): string {
  return `${Math.abs(v).toFixed(3)}° ${v >= 0 ? pos : neg}`;
}

function RunLine({ modelId }: { modelId: string }) {
  const m = getPointModel(modelId);
  const run = useAsync(() => fetchModelRun(m.metaId), [m.metaId]);
  return (
    <span class="run-line">
      <b>{m.label}</b>
      {run.data && (
        <>
          {" · beh "}
          <b>{formatRun(run.data.init)}</b>
          <span class="muted"> ({ageHours(run.data.init)} h)</span>
        </>
      )}
    </span>
  );
}

export function PointPanel() {
  const dragY = useRef<number | null>(null);
  const p = point.value;
  if (!p) return null;
  const tab = pointTab.value;
  const modelId = pointModelId.value;

  return (
    <section class="sheet point-panel" aria-label="Bodová predpoveď">
      {/* úchyt listu na mobile: potiahnutie nadol zavrie */}
      <div
        class="sheet-grip"
        onPointerDown={(e) => {
          dragY.current = e.clientY;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerUp={(e) => {
          if (dragY.current !== null && e.clientY - dragY.current > 60) point.value = null;
          dragY.current = null;
        }}
        aria-hidden="true"
      >
        <span />
      </div>
      <header class="sheet-head">
        <div class="sheet-title">
          <b>
            {coord(p.lat, "N", "S")} {coord(p.lon, "E", "W")}
          </b>
          {tab !== "compare" && tab !== "ensemble" && <RunLine modelId={modelId} />}
        </div>
        <button class="icon-btn" onClick={() => (point.value = null)} aria-label="Zavrieť (Esc)" title="Zavrieť (Esc)">
          <Icon name="close" />
        </button>
      </header>
      <nav class="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} class={tab === t.id ? "active" : ""} onClick={() => (pointTab.value = t.id)}>
            {t.label}
          </button>
        ))}
        {tab !== "compare" && tab !== "ensemble" && (
          <select class="tab-model" value={modelId} onChange={(e) => (pointModelId.value = e.currentTarget.value)} aria-label="Model">
            {POINT_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        )}
      </nav>
      <div class="sheet-body">
        {tab === "meteogram" && <Meteogram lat={p.lat} lon={p.lon} modelId={modelId} />}
        {tab === "skewt" && <SkewT lat={p.lat} lon={p.lon} modelId={modelId} />}
        {tab === "compare" && <ModelCompare lat={p.lat} lon={p.lon} />}
        {tab === "ensemble" && <Ensemble lat={p.lat} lon={p.lon} />}
      </div>
    </section>
  );
}
