import { colorAt, COLOR_SCALES } from "../config/colorscales";
import { POINT_MODELS } from "../config/pointModels";
import { fetchPoint } from "../data/pointForecast";
import { formatValue, unitLabel } from "../lib/units";
import { units } from "../state/store";
import { WindArrow } from "./BasicTable";
import { useAsync } from "./common";
import { cellColor, ForecastTable, type TableRow } from "./ForecastTable";
import { columnIndices, windowMax } from "./tableUtils";

// Záložka „Vietor“ (ako Windy): riadok pre každý model – šípka + rýchlosť, pod ňou nárazy.

const DAYS = 10;
const VARS = ["wind_speed_10m", "wind_direction_10m", "wind_gusts_10m", "is_day"];
const MODELS = ["icon_eu", "chmi_aladin_central_europe_2km", "ecmwf_ifs025", "gfs_seamless", "icon_d2", "meteofrance_arpege_europe", "ukmo_global_deterministic_10km"];

interface Props {
  lat: number;
  lon: number;
}

export function WindTable({ lat, lon }: Props) {
  const st = useAsync(() => fetchPoint(lat, lon, MODELS, VARS, DAYS), [lat, lon]);
  const us = units.value;
  if (st.error) return <p class="error pad">Nepodarilo sa načítať: {st.error}</p>;
  const d = st.data;
  if (!d) return <p class="muted pad">Načítavam…</p>;

  const present = POINT_MODELS.filter((m) => MODELS.includes(m.id) && d[m.id]?.vars.wind_speed_10m?.some((x) => x !== null));
  if (present.length === 0) return <p class="muted pad">Žiadny model tu nemá vietor.</p>;
  const first = d[present[0]!.id]!;
  // najdlhší dosah zo všetkých modelov
  let n = 0;
  for (const m of present) {
    const w = d[m.id]!.vars.wind_speed_10m!;
    let k = w.length;
    while (k > 0 && w[k - 1] === null) k--;
    n = Math.max(n, k);
  }
  const times = first.times.slice(0, n);
  const cols = columnIndices(times, 3);
  const wScale = COLOR_SCALES.wind!;

  const rows: TableRow[] = present.flatMap((m) => {
    const v = d[m.id]!.vars;
    return [
      {
        key: `${m.id}-w`,
        label: <span class="mlabel" style={{ borderColor: m.color }}>{m.label}</span>,
        cell: (i: number) => {
          const sp = v.wind_speed_10m?.[i];
          const dir = v.wind_direction_10m?.[i];
          if (sp === null || sp === undefined) return null;
          return {
            text: (
              <span class="wcell">
                {dir !== null && dir !== undefined && <WindArrow dir={dir} />}
                <b>{formatValue("speed", sp, us)}</b>
              </span>
            ),
            bg: cellColor(colorAt(wScale, sp), 0.55),
          };
        },
      },
      {
        key: `${m.id}-g`,
        label: "",
        small: true,
        cell: (i: number) => {
          const g = windowMax(v.wind_gusts_10m ?? [], i, 3);
          return g === null ? null : { text: formatValue("speed", g, us), title: "nárazy (max za 3 h)" };
        },
      },
    ] satisfies TableRow[];
  });
  rows.unshift({ key: "u", label: <span class="muted">vietor / nárazy</span>, unit: unitLabel("speed", us), small: true, cell: () => null });

  return <ForecastTable times={times} cols={cols} rows={rows} isNight={(i) => first.vars.is_day?.[i] === 0} />;
}
