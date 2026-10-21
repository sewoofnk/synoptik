import { useRef } from "preact/hooks";
import { formatLocal } from "../lib/time";
import { playing, runInfo, setTimeIndex, stepTime, timeIndex, validTime } from "../state/store";
import { Icon } from "./icons";

const WEEKDAYS = ["Ne", "Po", "Ut", "St", "Št", "Pi", "So"];
const pad = (n: number) => String(n).padStart(2, "0");

/** Index kroku najbližšieho k času t [ms] */
export function nearestStep(times: Date[], t: number): number {
  let best = 0;
  for (let i = 1; i < times.length; i++) {
    if (Math.abs(times[i]!.getTime() - t) < Math.abs(times[best]!.getTime() - t)) best = i;
  }
  return best;
}

// Časová os (ako Windy): dni ako úseky podľa skutočného času, posúvanie prstom alebo myšou.
// Kroky modelu sú nepravidelné (ICON-EU po +78 h každé 3 h), preto sa pozícia počíta z času.
export function Timeline() {
  const track = useRef<HTMLDivElement>(null);
  const run = runInfo.value;
  const vt = validTime.value;
  if (!run || !vt) return <div class="timeline glass" />;

  const times = run.validTimes;
  const t0 = times[0]!.getTime();
  const t1 = times.at(-1)!.getTime();
  const span = Math.max(1, t1 - t0);
  const frac = (vt.getTime() - t0) / span;

  // úseky dní (UTC) v rozsahu behu
  const days: { start: number; end: number; d: Date }[] = [];
  const first = new Date(t0);
  let dayStart = Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), first.getUTCDate());
  while (dayStart < t1) {
    const end = dayStart + 86_400_000;
    days.push({ start: Math.max(dayStart, t0), end: Math.min(end, t1), d: new Date(dayStart) });
    dayStart = end;
  }

  const seek = (clientX: number) => {
    const r = track.current?.getBoundingClientRect();
    if (!r || r.width === 0) return;
    const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    setTimeIndex(nearestStep(times, t0 + f * span));
  };

  const onPointerDown = (e: PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    playing.value = false;
    seek(e.clientX);
  };
  const onPointerMove = (e: PointerEvent) => {
    if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) seek(e.clientX);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    // šípky rieši globálna skratka; Home/End skočí na začiatok/koniec
    if (e.key === "Home") setTimeIndex(0);
    else if (e.key === "End") setTimeIndex(times.length - 1);
    else return;
    e.preventDefault();
  };

  const bubble = `${WEEKDAYS[vt.getUTCDay()]} ${pad(vt.getUTCHours())}z`;

  return (
    <div class="timeline glass">
      <button class="round play" onClick={() => (playing.value = !playing.value)} aria-label={playing.value ? "Pauza (medzerník)" : "Prehrať (medzerník)"}>
        <Icon name={playing.value ? "pause" : "play"} size={18} />
      </button>
      <button class="step desktop-only" onClick={() => stepTime(-1)} aria-label="Predchádzajúci krok (←)">
        <Icon name="prev" size={18} />
      </button>
      <div
        ref={track}
        class="tl-track"
        role="slider"
        tabIndex={0}
        aria-label="Čas platnosti"
        aria-valuemin={0}
        aria-valuemax={times.length - 1}
        aria-valuenow={timeIndex.value}
        aria-valuetext={`${bubble}, lokálne ${formatLocal(vt)}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onKeyDown={onKeyDown}
      >
        <div class="tl-days">
          {days.map(({ start, end, d }) => (
            <span key={start} class="tl-day" style={{ left: `${((start - t0) / span) * 100}%`, width: `${((end - start) / span) * 100}%` }}>
              <b>{WEEKDAYS[d.getUTCDay()]}</b> <span class="tl-date">{d.getUTCDate()}.</span>
            </span>
          ))}
        </div>
        <div class="tl-rail">
          <div class="tl-progress" style={{ width: `${frac * 100}%` }} />
        </div>
        <div class="tl-handle" style={{ left: `${frac * 100}%` }}>
          {/* bublina sa posúva tak, aby na okrajoch nevyčnievala z osi */}
          <span class="tl-bubble" style={{ transform: `translateX(${-frac * 100}%)` }}>
            {bubble}
          </span>
        </div>
      </div>
      <button class="step desktop-only" onClick={() => stepTime(1)} aria-label="Ďalší krok (→)">
        <Icon name="next" size={18} />
      </button>
    </div>
  );
}
