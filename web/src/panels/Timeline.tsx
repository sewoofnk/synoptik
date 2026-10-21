import { formatDayUtc, formatLead, formatLocal, formatValidUtc } from "../lib/time";
import { fieldStatus, playing, playSpeed, runInfo, setTimeIndex, stepTime, timeIndex, validTime } from "../state/store";

const SPEEDS = [1, 2, 4, 8];

// Spodná lišta: časová os po krokoch modelu (nepravidelné – ICON-EU po +78 h každé 3 h).
export function Timeline() {
  const run = runInfo.value;
  const i = timeIndex.value;
  const vt = validTime.value;
  const status = fieldStatus.value;
  if (!run || !vt) return <footer class="timeline" />;

  const n = run.validTimes.length;
  const t0 = run.validTimes[0]!.getTime();
  const span = Math.max(1, run.validTimes[n - 1]!.getTime() - t0);
  // značky polnocí UTC, umiestnené podľa času (nie indexu)
  const days = run.validTimes.filter((d) => d.getUTCHours() === 0);

  return (
    <footer class="timeline">
      <div class="tl-controls">
        <button class="btn" onClick={() => stepTime(-1)} title="Predchádzajúci krok (←)" aria-label="Predchádzajúci krok">
          ◀
        </button>
        <button
          class="btn play"
          onClick={() => (playing.value = !playing.value)}
          title="Prehrať / pauza (medzerník)"
          aria-label={playing.value ? "Pauza" : "Prehrať"}
        >
          {playing.value ? "❚❚" : "▶"}
        </button>
        <button class="btn" onClick={() => stepTime(1)} title="Ďalší krok (→)" aria-label="Ďalší krok">
          ▶
        </button>
        <select
          value={playSpeed.value}
          onChange={(e) => (playSpeed.value = Number(e.currentTarget.value))}
          title="Rýchlosť prehrávania"
        >
          {SPEEDS.map((s) => (
            <option key={s} value={s}>
              {s} krok/s
            </option>
          ))}
        </select>
      </div>

      <div class="tl-track">
        <input
          type="range"
          min={0}
          max={n - 1}
          step={1}
          value={i}
          onInput={(e) => setTimeIndex(Number(e.currentTarget.value))}
          aria-label="Čas platnosti"
        />
        <div class="tl-days">
          {days.map((d) => {
            // pozícia v rámci rozsahu indexov (slider je po indexoch)
            const k = run.validTimes.indexOf(d);
            return (
              <span key={d.toISOString()} style={{ left: `${(k / (n - 1)) * 100}%` }}>
                {formatDayUtc(d)}
              </span>
            );
          })}
        </div>
      </div>

      <div class="tl-now" title={`Rozsah behu: ${Math.round(span / 3_600_000)} h, ${n} krokov`}>
        <b>{formatValidUtc(vt)}</b>
        <span class="muted">
          {formatLocal(vt)} lokálne · {formatLead(vt, run.referenceTime)}
        </span>
        {status.loading && <span class="spinner" aria-label="Načítavam" />}
        {status.error && <span class="error" title={status.error}>⚠ chyba dát</span>}
        {status.note && <span class="muted">{status.note}</span>}
      </div>
    </footer>
  );
}
