import type { ComponentChildren } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { timeIso, validTime } from "../state/store";
import { dayGroups, nearestColumn } from "./tableUtils";

// Hodinová tabuľka ako vo Windy: dni v hlavičke, stĺpce po 3 h, ľavý stĺpec s popiskami
// ostáva pri vodorovnom posúvaní, noc zatienená, stĺpec s časom mapy zvýraznený.
// Klik na stĺpec nastaví čas mapy.

export interface Cell {
  text?: ComponentChildren;
  /** farba pozadia bunky */
  bg?: string;
  /** farba textu */
  color?: string;
  title?: string;
}

export interface TableRow {
  key: string;
  label: ComponentChildren;
  unit?: string;
  /** vyšší riadok (ikony) */
  tall?: boolean;
  /** malé písmo (druhý riadok, napr. nárazy pod vetrom) */
  small?: boolean;
  cell: (hourIndex: number) => Cell | null;
}

interface Props {
  /** hodinové časy [ms] */
  times: number[];
  /** indexy hodín zobrazené ako stĺpce */
  cols: number[];
  rows: TableRow[];
  /** je hodina v noci? */
  isNight?: (hourIndex: number) => boolean;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function ForecastTable({ times, cols, rows, isNight }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const vt = validTime.value;
  const active = vt ? nearestColumn(times, cols, vt.getTime()) : -1;
  const groups = dayGroups(times, cols);

  // pri otvorení posunúť tabuľku tak, aby bol čas mapy viditeľný
  useEffect(() => {
    const el = scroller.current;
    if (!el || active < 0) return;
    const cell = el.querySelector<HTMLElement>(`[data-col="${active}"]`);
    if (cell && (cell.offsetLeft < el.scrollLeft + 90 || cell.offsetLeft > el.scrollLeft + el.clientWidth - 60)) {
      el.scrollLeft = Math.max(0, cell.offsetLeft - 140);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cols.length, active < 0]);

  const setTime = (i: number) => (timeIso.value = new Date(times[i]!).toISOString());
  const cls = (c: number, i: number) => `${isNight?.(i) ? "night" : ""} ${c === active ? "now" : ""}`;

  return (
    <div class="ftable-scroll" ref={scroller}>
      <table class="ftable">
        <thead>
          <tr class="days">
            <th class="lbl" />
            {groups.map((g, k) => (
              <th key={k} colSpan={g.span} class="day">
                {g.label}
              </th>
            ))}
          </tr>
          <tr class="hours">
            <th class="lbl">Hodiny</th>
            {cols.map((i, c) => (
              <th key={i} data-col={c} class={cls(c, i)} onClick={() => setTime(i)} title={new Date(times[i]!).toISOString().slice(0, 13).replace("T", " ") + " UTC"}>
                {pad(new Date(times[i]!).getHours())}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} class={`${r.tall ? "tall" : ""} ${r.small ? "small" : ""}`}>
              <th class="lbl">
                {r.label}
                {r.unit && <span class="unit">{r.unit}</span>}
              </th>
              {cols.map((i, c) => {
                const v = r.cell(i);
                return (
                  <td
                    key={i}
                    class={cls(c, i)}
                    style={v?.bg || v?.color ? { background: v.bg, color: v.color } : undefined}
                    title={v?.title}
                    onClick={() => setTime(i)}
                  >
                    {v?.text ?? ""}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Farba pozadia z farebnej škály (rgba s danou priehľadnosťou) */
export function cellColor(rgba: [number, number, number, number], alpha = 0.55): string {
  return `rgba(${rgba[0]},${rgba[1]},${rgba[2]},${alpha})`;
}
