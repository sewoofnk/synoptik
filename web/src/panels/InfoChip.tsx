import { ageHours, formatLead, formatRun, formatValidUtc } from "../lib/time";
import { fieldStatus, layer, menuOpen, model, runChoice, runError, runInfo, validTime } from "../state/store";

// Štítok vľavo hore: vrstva, model, beh (init time) a platnosť – zadanie vyžaduje, aby boli vždy viditeľné.
// Klik otvorí menu (výber modelu a behu).
export function InfoChip() {
  const run = runInfo.value;
  const vt = validTime.value;
  const st = fieldStatus.value;

  return (
    <button class="glass info-chip" onClick={() => (menuOpen.value = true)} title="Model, beh a čas platnosti – klik pre výber">
      <span class="ic-line">
        <b>{layer.value.label}</b>
        {st.loading && <span class="spinner" aria-label="Načítavam" />}
      </span>
      <span class="ic-line mono">
        {model.value.label}
        {run ? (
          <>
            {" · beh "}
            <b>{formatRun(run.referenceTime)}</b>
            <span class="muted">
              {" "}
              ({ageHours(run.referenceTime)} h{runChoice.value ? ", zvolený" : ""})
            </span>
          </>
        ) : (
          !runError.value && <span class="muted"> · načítavam…</span>
        )}
      </span>
      {run && vt && (
        <span class="ic-line mono">
          {formatValidUtc(vt)} <span class="muted">{formatLead(vt, run.referenceTime)}</span>
        </span>
      )}
      {runError.value && <span class="ic-line error">{runError.value}</span>}
      {st.error && <span class="ic-line error">⚠ {st.error}</span>}
      {st.note && <span class="ic-line muted">{st.note}</span>}
    </button>
  );
}
