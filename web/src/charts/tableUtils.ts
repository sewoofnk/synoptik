// Pomôcky pre hodinové tabuľky (ako Windy): 3 h stĺpce, dni v lokálnom čase, agregácia hodín.

const WEEKDAYS_LONG = ["Nedeľa", "Pondelok", "Utorok", "Streda", "Štvrtok", "Piatok", "Sobota"];

/** Indexy hodinových časov pre stĺpce: každá `step`-tá hodina UTC (0, 3, 6 … pri step 3) */
export function columnIndices(times: number[], step = 3): number[] {
  const out: number[] = [];
  for (let i = 0; i < times.length; i++) if (new Date(times[i]!).getUTCHours() % step === 0) out.push(i);
  return out;
}

export interface DayGroup {
  /** napr. „Streda 21“ */
  label: string;
  /** počet stĺpcov dňa */
  span: number;
}

/** Skupiny stĺpcov podľa lokálneho dátumu (hlavička tabuľky) */
export function dayGroups(times: number[], cols: number[]): DayGroup[] {
  const out: DayGroup[] = [];
  let key = "";
  for (const i of cols) {
    const d = new Date(times[i]!);
    const k = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (k !== key) {
      out.push({ label: `${WEEKDAYS_LONG[d.getDay()]} ${d.getDate()}`, span: 0 });
      key = k;
    }
    out[out.length - 1]!.span++;
  }
  return out;
}

/** Súčet hodnôt v hodinách (i − n, i] – zrážky za interval stĺpca; null ak žiadna hodnota */
export function windowSum(arr: (number | null | undefined)[], i: number, n: number): number | null {
  let s = 0;
  let any = false;
  for (let k = Math.max(0, i - n + 1); k <= i; k++) {
    const v = arr[k];
    if (v !== null && v !== undefined) {
      s += v;
      any = true;
    }
  }
  return any ? s : null;
}

/** Maximum v hodinách (i − n, i] – nárazy, kód počasia */
export function windowMax(arr: (number | null | undefined)[], i: number, n: number): number | null {
  let m: number | null = null;
  for (let k = Math.max(0, i - n + 1); k <= i; k++) {
    const v = arr[k];
    if (v !== null && v !== undefined && (m === null || v > m)) m = v;
  }
  return m;
}

/** Stĺpec najbližší k času t [ms] (zvýraznenie času mapy) */
export function nearestColumn(times: number[], cols: number[], t: number): number {
  let best = -1;
  let bestD = Infinity;
  cols.forEach((i, c) => {
    const d = Math.abs(times[i]! - t);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  });
  // mimo rozsahu tabuľky (viac než krok) nezvýrazňovať
  return bestD <= 3 * 3_600_000 ? best : -1;
}
