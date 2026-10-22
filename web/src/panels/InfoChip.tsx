import { ageHours, formatLead, formatRun, formatValidUtc } from "../lib/time";
import { currentStep, fieldStatus, layer, menuOpen, model, obsStatus, runChoice, runError, runInfo, validTime } from "../state/store";

const utcHm = (ms: number) => {
  const d = new Date(ms);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}Z`;
};

// Štítok vľavo hore: vrstva, model, beh (init time) a platnosť – zadanie vyžaduje, aby boli vždy viditeľné.
// Klik otvorí menu (výber modelu a behu).
export function InfoChip() {
  const run = runInfo.value;
  const step = currentStep.value;
  // beh, z ktorého je zobrazený krok (v histórii minulý beh)
  const ref = step?.ref ?? run?.referenceTime ?? null;
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
        {run && ref ? (
          <>
            {" · beh "}
            <b>{formatRun(ref)}</b>
            <span class="muted">
              {" "}
              ({ageHours(ref)} h{runChoice.value && !step?.history ? ", zvolený" : ""})
            </span>
            {step?.history && <span class="hist-tag">história</span>}
          </>
        ) : (
          !runError.value && <span class="muted"> · načítavam…</span>
        )}
      </span>
      {ref && vt && (
        <span class="ic-line mono">
          {formatValidUtc(vt)} <span class="muted">{formatLead(vt, ref)}</span>
        </span>
      )}
      {(obsStatus.value.metar || obsStatus.value.synop) && (
        <span class="ic-line mono obs-line">
          {"Pozorovania: "}
          {obsStatus.value.metar && <>METAR {utcHm(obsStatus.value.metar.time)}</>}
          {obsStatus.value.metar && obsStatus.value.synop && " · "}
          {obsStatus.value.synop && <>SYNOP {utcHm(obsStatus.value.synop.term)}</>}
        </span>
      )}
      {obsStatus.value.error && <span class="ic-line error">{obsStatus.value.error}</span>}
      {runError.value && <span class="ic-line error">{runError.value}</span>}
      {st.error && <span class="ic-line error">⚠ {st.error}</span>}
      {st.note && <span class="ic-line muted">{st.note}</span>}
    </button>
  );
}
