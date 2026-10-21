import { MODELS } from "../config/models";
import { ageHours, formatLead, formatRun, formatValidUtc } from "../lib/time";
import { model, modelId, runChoice, runError, runInfo, runs, validTime } from "../state/store";
import { UnitsMenu } from "./UnitsMenu";

// Horná lišta: model, beh, platnosť a jednotky. Model + beh + platnosť musia byť vždy viditeľné.
export function TopBar() {
  const run = runInfo.value;
  const vt = validTime.value;
  const choice = runChoice.value;

  return (
    <header class="topbar">
      <span class="brand">Synoptik</span>

      <label class="field">
        <span class="sr-only">Model</span>
        <select
          value={modelId.value}
          onChange={(e) => (modelId.value = e.currentTarget.value)}
          title="Model (M)"
        >
          {MODELS.map((m) => (
            <option key={m.id} value={m.id} disabled={!m.enabled}>
              {m.label}
              {m.enabled ? "" : " – neskôr"}
            </option>
          ))}
        </select>
      </label>

      <label class="field">
        <span class="sr-only">Beh</span>
        <select
          value={choice ?? ""}
          onChange={(e) => (runChoice.value = e.currentTarget.value || null)}
          title="Beh modelu (init time)"
        >
          <option value="">Najnovší{run && !choice ? ` (${formatRun(run.referenceTime)})` : ""}</option>
          {runs.value.map((r) => (
            <option key={r.toISOString()} value={r.toISOString()}>
              {formatRun(r)}
            </option>
          ))}
        </select>
      </label>

      <span class="run-info" title={run ? `Beh ${formatRun(run.referenceTime)}, ${run.validTimes.length} krokov` : undefined}>
        {run && (
          <>
            <b>{model.value.label}</b>
            {" · beh "}
            <b>{formatRun(run.referenceTime)}</b>
            <span class="muted"> ({ageHours(run.referenceTime)} h)</span>
            {vt && (
              <>
                {" · platí "}
                <b>{formatValidUtc(vt)}</b>
                <span class="muted"> {formatLead(vt, run.referenceTime)}</span>
              </>
            )}
          </>
        )}
        {!run && !runError.value && <span class="muted">načítavam beh…</span>}
        {runError.value && <span class="error">{runError.value}</span>}
      </span>

      <span class="spacer" />
      <UnitsMenu />
    </header>
  );
}
