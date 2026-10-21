import { useEffect, useState } from "preact/hooks";
import type uPlot from "uplot";

// Spoločné pomôcky pre grafy bodových nástrojov.

export interface AsyncState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

/** Načíta dáta pri zmene závislostí; zastarané výsledky zahodí */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ data: null, error: null, loading: true });
  useEffect(() => {
    let alive = true;
    setState((s) => ({ data: s.data, error: null, loading: true }));
    load()
      .then((data) => alive && setState({ data, error: null, loading: false }))
      .catch((e: unknown) => alive && setState({ data: null, error: e instanceof Error ? e.message : String(e), loading: false }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Spoločná x os (čas v UTC) */
export function timeAxis(show = true): uPlot.Axis {
  const muted = cssVar("--muted");
  return {
    show,
    stroke: muted,
    grid: { stroke: cssVar("--border"), width: 1 },
    ticks: { stroke: cssVar("--border"), width: 1 },
    font: "11px system-ui, sans-serif",
    size: show ? 30 : 0,
    values: (_u, splits) =>
      splits.map((s) => {
        const d = new Date(s * 1000);
        const h = d.getUTCHours();
        return h === 0 ? `${d.getUTCDate()}.${d.getUTCMonth() + 1}.` : `${String(h).padStart(2, "0")}z`;
      }),
  };
}

export function valueAxis(label: string, opts: Partial<uPlot.Axis> = {}): uPlot.Axis {
  return {
    label,
    labelSize: 14,
    labelFont: "11px system-ui, sans-serif",
    stroke: cssVar("--muted"),
    grid: { stroke: cssVar("--border"), width: 1 },
    ticks: { stroke: cssVar("--border"), width: 1 },
    font: "11px system-ui, sans-serif",
    size: 44,
    ...opts,
  };
}

/** Odstráni koncové časy, kde model už nemá dáta (všetky sledované rady sú null) */
export function trimTrailingNulls(times: number[], series: (number | null)[][]): number {
  let n = times.length;
  while (n > 0 && series.every((s) => s[n - 1] === null || s[n - 1] === undefined)) n--;
  return n;
}

/** Konverzia radu do zobrazovacej jednotky (null ostáva null) */
export function mapSeries(s: (number | null)[] | undefined, n: number, f: (v: number) => number): (number | null)[] {
  const out: (number | null)[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const v = s?.[i];
    out[i] = v === null || v === undefined ? null : f(v);
  }
  return out;
}
