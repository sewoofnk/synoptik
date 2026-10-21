import { colorAt, COLOR_SCALES } from "../config/colorscales";
import { fetchPoint } from "../data/pointForecast";
import { format, formatValue, unitLabel } from "../lib/units";
import { dominantCode, weatherSymbol } from "../lib/weatherCode";
import { units } from "../state/store";
import { useAsync } from "./common";
import { cellColor, ForecastTable, type TableRow } from "./ForecastTable";
import { columnIndices, windowMax, windowSum } from "./tableUtils";

// Záložka „Základné“ (ako Windy): ikona počasia, teplota a pocitová, zrážky, vietor + nárazy, smer.

const DAYS = 10;
const VARS = [
  "weather_code",
  "is_day",
  "temperature_2m",
  "apparent_temperature",
  "precipitation",
  "wind_speed_10m",
  "wind_gusts_10m",
  "wind_direction_10m",
];

/** Šípka smeru vetra (kam fúka), otočená podľa meteorologického smeru */
export function WindArrow({ dir }: { dir: number }) {
  return (
    <span class="warrow" style={{ transform: `rotate(${dir + 180}deg)` }} aria-label={`${Math.round(dir)}°`}>
      ↑
    </span>
  );
}

interface Props {
  lat: number;
  lon: number;
  modelId: string;
}

export function BasicTable({ lat, lon, modelId }: Props) {
  const st = useAsync(() => fetchPoint(lat, lon, [modelId], VARS, DAYS), [lat, lon, modelId]);
  const us = units.value;
  const s = st.data?.[modelId];
  if (st.error) return <p class="error pad">Nepodarilo sa načítať: {st.error}</p>;
  if (!s) return <p class="muted pad">Načítavam…</p>;

  const v = s.vars;
  const T = v.temperature_2m ?? [];
  // koniec dosahu modelu
  let n = T.length;
  while (n > 0 && T[n - 1] === null) n--;
  const times = s.times.slice(0, n);
  const cols = columnIndices(times, 3);
  const tScale = COLOR_SCALES.temperature!;
  const wScale = COLOR_SCALES.wind!;
  const pScale = COLOR_SCALES.precipitation!;
  const num = (x: number | null | undefined) => (x === null || x === undefined ? null : x);

  const rows: TableRow[] = [
    {
      key: "icon",
      label: "Počasie",
      tall: true,
      cell: (i) => {
        const sym = weatherSymbol(dominantCode((v.weather_code ?? []).slice(Math.max(0, i - 2), i + 1)), v.is_day?.[i] !== 0);
        return sym ? { text: <span class="wicon">{sym.icon}</span>, title: sym.label } : null;
      },
    },
    {
      key: "t",
      label: "Teplota",
      unit: unitLabel("temperature", us),
      cell: (i) => {
        const x = num(T[i]);
        return x === null ? null : { text: <b>{formatValue("temperature", x, us, 0)}°</b>, bg: cellColor(colorAt(tScale, x), 0.5) };
      },
    },
    {
      key: "app",
      label: "Pocitová",
      small: true,
      cell: (i) => {
        const x = num(v.apparent_temperature?.[i]);
        return x === null ? null : { text: `${formatValue("temperature", x, us, 0)}°` };
      },
    },
    {
      key: "p",
      label: "Zrážky",
      unit: unitLabel("precipitation", us),
      cell: (i) => {
        const x = windowSum(v.precipitation ?? [], i, 3);
        if (x === null || x < 0.1) return null;
        // škála zrážok je pri malých hodnotách priehľadná → minimálne svetlomodrá
        const c = colorAt(pScale, Math.max(x, 0.15));
        return {
          text: formatValue("precipitation", x, us),
          bg: cellColor(c, 0.7),
          title: `${format("precipitation", x, us)} za 3 h`,
        };
      },
    },
    {
      key: "w",
      label: "Vietor",
      unit: unitLabel("speed", us),
      cell: (i) => {
        const x = num(v.wind_speed_10m?.[i]);
        return x === null ? null : { text: <b>{formatValue("speed", x, us)}</b>, bg: cellColor(colorAt(wScale, x), 0.55) };
      },
    },
    {
      key: "g",
      label: "Nárazy",
      small: true,
      cell: (i) => {
        const x = windowMax(v.wind_gusts_10m ?? [], i, 3);
        return x === null ? null : { text: formatValue("speed", x, us), bg: cellColor(colorAt(wScale, x), 0.4) };
      },
    },
    {
      key: "d",
      label: "Smer vetra",
      cell: (i) => {
        const x = num(v.wind_direction_10m?.[i]);
        return x === null ? null : { text: <WindArrow dir={x} />, title: `${Math.round(x)}°` };
      },
    },
  ];

  return <ForecastTable times={times} cols={cols} rows={rows} isNight={(i) => v.is_day?.[i] === 0} />;
}
