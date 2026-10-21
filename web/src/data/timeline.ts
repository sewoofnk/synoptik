// Časová os s históriou (ako Windy): minulosť poskladaná z minulých behov, potom aktuálny beh.
// Pre každý minulý čas sa použije krátkodobá predpoveď (+1 až +6 h) z behu, ktorý bol
// vtedy najnovší. Krok +0 h sa v histórii nepoužije – nemá zrážky ani nárazy (R-004).

export interface Step {
  /** Čas platnosti */
  t: Date;
  /** Init time behu, z ktorého krok pochádza */
  ref: Date;
  /** Krok z minulého behu */
  history: boolean;
}

const HOUR = 3_600_000;

/**
 * @param current    aktuálny (zvolený) beh – jeho kroky tvoria predpoveď
 * @param runs       init time behov modelu (ľubovoľné poradie, môžu obsahovať aj aktuálny a novšie)
 * @param stepHours  natívny krok modelu v krátkom predstihu (ICON-EU, GFS 1 h; ECMWF 3 h)
 * @param now        teraz (od neho sa počíta dĺžka histórie)
 * @param historyDays koľko dní dozadu (S3 uchováva 7 dní)
 */
export function buildTimeline(
  current: { referenceTime: Date; validTimes: Date[] },
  runs: Date[],
  stepHours: number,
  now: Date,
  historyDays = 7,
): Step[] {
  const ref = current.referenceTime.getTime();
  const step = stepHours * HOUR;
  // začiatok histórie zarovnaný na krok modelu
  const start = Math.ceil((now.getTime() - historyDays * 24 * HOUR) / step) * step;
  const past = [...new Set(runs.map((r) => r.getTime()))].filter((r) => r < ref).sort((a, b) => a - b);

  const out: Step[] = [];
  for (let i = 0; i < past.length; i++) {
    const r = past[i]!;
    const next = past[i + 1] ?? ref;
    // (r, next] – predstih +1 krok až po init time nasledujúceho behu
    for (let t = r + step; t <= next; t += step) {
      if (t >= start && t < ref + step) out.push({ t: new Date(t), ref: new Date(r), history: true });
    }
  }
  const lastHistory = out.length ? out[out.length - 1]!.t.getTime() : -Infinity;
  for (const v of current.validTimes) {
    if (v.getTime() > lastHistory) out.push({ t: v, ref: current.referenceTime, history: false });
  }
  return out;
}

/** Index kroku najbližšieho k času t [ms] */
export function nearestStepIndex(steps: Step[], t: number): number {
  let best = 0;
  for (let i = 1; i < steps.length; i++) {
    if (Math.abs(steps[i]!.t.getTime() - t) < Math.abs(steps[best]!.t.getTime() - t)) best = i;
  }
  return best;
}
