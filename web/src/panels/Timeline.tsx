import { useEffect, useRef, useState } from "preact/hooks";
import { nearestStepIndex } from "../data/timeline";
import { formatLocal } from "../lib/time";
import { goToNow, playing, setTimeIndex, steps, stepTime, timeIndex, validTime } from "../state/store";
import { Icon } from "./icons";

const WEEKDAYS = ["Ne", "Po", "Ut", "St", "Št", "Pi", "So"];
const pad = (n: number) => String(n).padStart(2, "0");
const DAY = 86_400_000;

// Časová os (ako Windy): história z minulých behov + predpoveď, dni ako úseky podľa skutočného času,
// posúvanie prstom alebo myšou. Kroky sú nepravidelné, preto sa pozícia počíta z času, nie z indexu.
export function Timeline() {
  const track = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [track.current]);

  const all = steps.value;
  const vt = validTime.value;
  if (all.length === 0 || !vt) return <div class="timeline glass" />;

  const t0 = all[0]!.t.getTime();
  const t1 = all.at(-1)!.t.getTime();
  const span = Math.max(1, t1 - t0);
  const pos = (t: number) => ((t - t0) / span) * 100;
  const frac = (vt.getTime() - t0) / span;
  const historyEnd = all.findIndex((s) => !s.history);
  const historyEndT = historyEnd > 0 ? all[historyEnd - 1]!.t.getTime() : null;
  const now = Date.now();
  const inHistory = all[timeIndex.value]?.history ?? false;

  // úseky dní (UTC); pri dlhej osi popisovať iba každý k-tý deň
  const pxPerDay = (width * DAY) / span;
  const every = Math.max(1, Math.ceil(34 / pxPerDay));
  const days: { start: number; end: number; d: Date; label: boolean }[] = [];
  const first = new Date(t0);
  let dayStart = Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), first.getUTCDate());
  for (let k = 0; dayStart < t1; k++) {
    const end = dayStart + DAY;
    days.push({ start: Math.max(dayStart, t0), end: Math.min(end, t1), d: new Date(dayStart), label: k % every === 0 });
    dayStart = end;
  }

  const seek = (clientX: number) => {
    const r = track.current?.getBoundingClientRect();
    if (!r || r.width === 0) return;
    const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    setTimeIndex(nearestStepIndex(all, t0 + f * span));
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
    else if (e.key === "End") setTimeIndex(all.length - 1);
    else return;
    e.preventDefault();
  };

  const bubble = `${WEEKDAYS[vt.getUTCDay()]} ${pad(vt.getUTCHours())}z`;
  const nearNow = Math.abs(vt.getTime() - now) < 2 * 3_600_000;

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
        aria-valuemax={all.length - 1}
        aria-valuenow={timeIndex.value}
        aria-valuetext={`${bubble}, lokálne ${formatLocal(vt)}${inHistory ? ", história" : ""}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onKeyDown={onKeyDown}
      >
        <div class="tl-days">
          {days.map(({ start, end, d, label }) => (
            <span key={start} class="tl-day" style={{ left: `${pos(start)}%`, width: `${pos(end) - pos(start)}%` }}>
              {label && (
                <>
                  <b>{WEEKDAYS[d.getUTCDay()]}</b>
                  {pxPerDay * every >= 52 && <span class="tl-date"> {d.getUTCDate()}.</span>}
                </>
              )}
            </span>
          ))}
        </div>
        <div class="tl-rail">
          {historyEndT !== null && <div class="tl-history" style={{ width: `${pos(historyEndT)}%` }} title="História – minulé behy" />}
          <div class="tl-progress" style={{ width: `${frac * 100}%` }} />
        </div>
        {now > t0 && now < t1 && <div class="tl-now" style={{ left: `${pos(now)}%` }} title="Teraz" />}
        <div class="tl-handle" style={{ left: `${frac * 100}%` }}>
          {/* bublina sa posúva tak, aby na okrajoch nevyčnievala z osi */}
          <span class={`tl-bubble ${inHistory ? "past" : ""}`} style={{ transform: `translateX(${-frac * 100}%)` }}>
            {bubble}
          </span>
        </div>
      </div>
      <button class="step desktop-only" onClick={() => stepTime(1)} aria-label="Ďalší krok (→)">
        <Icon name="next" size={18} />
      </button>
      <button class={`now-btn ${nearNow ? "" : "away"}`} onClick={goToNow} title="Skok na aktuálny čas">
        Teraz
      </button>
    </div>
  );
}
