import { useEffect, useState } from "preact/hooks";
import { DEFAULT_MODEL_ID, getModel } from "../config/models";
import { fetchLatestRun, type RunInfo } from "../data/openMeteoSpatial";
import { ageHours, formatRun, formatUtc } from "../lib/time";

// Horná lišta. Vo Fáze 0 iba zobrazuje posledný beh ICON-EU priamo z Open-Meteo S3
// (dôkaz, že dátová cesta A funguje z prehliadača). Výber modelu/hladiny príde vo Fáze 1.
export function TopBar() {
  const model = getModel(DEFAULT_MODEL_ID);
  const [run, setRun] = useState<RunInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    fetchLatestRun(model.spatialId, ctrl.signal)
      .then(setRun)
      .catch((e: unknown) => {
        if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : String(e));
      });
    return () => ctrl.abort();
  }, [model.spatialId]);

  const last = run?.validTimes.at(-1);

  return (
    <header class="topbar">
      <span class="brand">Synoptik</span>
      <span class="run-info" title={run ? `Posledný krok: ${last ? formatUtc(last) : "–"}` : undefined}>
        <b>{model.label}</b>
        {run && (
          <>
            {" · beh "}
            <b>{formatRun(run.referenceTime)}</b>
            <span class="muted">
              {" "}
              ({ageHours(run.referenceTime)} h, {run.validTimes.length} krokov, {run.variables.length} premenných)
            </span>
          </>
        )}
        {!run && !error && <span class="muted"> · načítavam beh…</span>}
        {error && <span class="error"> · {error}</span>}
      </span>
    </header>
  );
}
