import { useRef } from "preact/hooks";
import { AirQualityTable } from "../charts/AirQualityTable";
import { Airgram } from "../charts/Airgram";
import { BasicTable } from "../charts/BasicTable";
import { useAsync } from "../charts/common";
import { Ensemble } from "../charts/Ensemble";
import { Meteogram } from "../charts/Meteogram";
import { ModelCompare } from "../charts/ModelCompare";
import { SkewT } from "../charts/SkewT";
import { WindTable } from "../charts/WindTable";
import { getPointModel, POINT_MODELS } from "../config/pointModels";
import { reverseGeocode } from "../data/places";
import { fetchModelRun } from "../data/pointForecast";
import { ageHours, formatRun } from "../lib/time";
import { point, pointModelId, pointTab, type PointTab } from "../state/store";
import { Icon } from "./icons";

// Spodný panel predpovede pre miesto (ako Windy): hlavička s názvom miesta, obsah záložky,
// dole lišta záložiek a výber zdroja (modelu). Desktop cez celú šírku nad časovou osou,
// mobil ako list zdola (potiahnutie úchytu nadol ho zavrie).

const TABS: { id: PointTab; label: string }[] = [
  { id: "basic", label: "Základné" },
  { id: "meteogram", label: "Meteogram" },
  { id: "wind", label: "Vietor" },
  { id: "airgram", label: "Airgram" },
  { id: "air", label: "Kvalita ovzdušia" },
  { id: "skewt", label: "Skew-T" },
  { id: "compare", label: "Modely" },
  { id: "ensemble", label: "Ensemble" },
];

/** Záložky, ktoré používajú zvolený zdroj (model); ostatné majú vlastný výber */
const USES_MODEL: ReadonlySet<PointTab> = new Set(["basic", "meteogram", "airgram", "skewt"]);

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

function PlaceName({ lat, lon }: { lat: number; lon: number }) {
  const name = useAsync(() => reverseGeocode(lat, lon), [lat, lon]);
  return <b class="place">{name.data ?? (name.loading ? "…" : "Bod na mape")}</b>;
}

export function PointPanel() {
  const dragY = useRef<number | null>(null);
  const p = point.value;
  if (!p) return null;
  const tab = pointTab.value;
  const modelId = pointModelId.value;
  const usesModel = USES_MODEL.has(tab);

  return (
    <section class="fpanel" aria-label="Predpoveď pre miesto">
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
      <header class="fp-head">
        <div class="fp-title">
          <PlaceName lat={p.lat} lon={p.lon} />
          <span class="muted mono">
            {coord(p.lat, "N", "S")} {coord(p.lon, "E", "W")}
          </span>
          {usesModel && <RunLine modelId={modelId} />}
        </div>
        <button class="fp-close" onClick={() => (point.value = null)} aria-label="Zavrieť (Esc)" title="Zavrieť (Esc)">
          <Icon name="close" size={22} />
        </button>
      </header>
      <div class={`fp-body ${tab}`}>
        {tab === "basic" && <BasicTable lat={p.lat} lon={p.lon} modelId={modelId} />}
        {tab === "meteogram" && <Meteogram lat={p.lat} lon={p.lon} modelId={modelId} />}
        {tab === "wind" && <WindTable lat={p.lat} lon={p.lon} />}
        {tab === "airgram" && <Airgram lat={p.lat} lon={p.lon} modelId={modelId} />}
        {tab === "air" && <AirQualityTable lat={p.lat} lon={p.lon} />}
        {tab === "skewt" && <SkewT lat={p.lat} lon={p.lon} modelId={modelId} />}
        {tab === "compare" && <ModelCompare lat={p.lat} lon={p.lon} />}
        {tab === "ensemble" && <Ensemble lat={p.lat} lon={p.lon} />}
      </div>
      <nav class="fp-tabs" role="tablist">
        <div class="fp-tablist">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} class={tab === t.id ? "active" : ""} onClick={() => (pointTab.value = t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        {usesModel && (
          <label class="fp-source">
            <span>Zdroj:</span>
            <select value={modelId} onChange={(e) => (pointModelId.value = e.currentTarget.value)} aria-label="Zdroj (model)">
              {POINT_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </nav>
    </section>
  );
}
