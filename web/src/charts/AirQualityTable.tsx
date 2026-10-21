import { eaqiBand, fetchAirQuality, type AirVar } from "../data/places";
import { useAsync } from "./common";
import { ForecastTable, type TableRow } from "./ForecastTable";
import { columnIndices } from "./tableUtils";

// Záložka „Kvalita ovzdušia“ (Open-Meteo Air Quality API, CAMS Európa): EAQI a znečisťujúce látky.

/** Hranice pásiem EEA pre jednotlivé látky (µg/m³): dobrá … extrémne zlá */
const BANDS: Partial<Record<AirVar, number[]>> = {
  pm2_5: [10, 20, 25, 50, 75],
  pm10: [20, 40, 50, 100, 150],
  nitrogen_dioxide: [40, 90, 120, 230, 340],
  ozone: [50, 100, 130, 240, 380],
  sulphur_dioxide: [100, 200, 350, 500, 750],
};
const BAND_COLORS = ["#50f0e6", "#50ccaa", "#f0e641", "#ff5050", "#960032", "#7d2181"];

function bandColor(v: AirVar, x: number): string | undefined {
  const b = BANDS[v];
  if (!b) return undefined;
  const k = b.findIndex((lim) => x <= lim);
  return BAND_COLORS[k === -1 ? 5 : k];
}

const LABELS: Record<AirVar, [string, string]> = {
  european_aqi: ["Index EAQI", ""],
  pm2_5: ["PM2.5", "µg/m³"],
  pm10: ["PM10", "µg/m³"],
  dust: ["Prach", "µg/m³"],
  carbon_monoxide: ["CO", "µg/m³"],
  nitrogen_dioxide: ["NO₂", "µg/m³"],
  sulphur_dioxide: ["SO₂", "µg/m³"],
  ozone: ["O₃", "µg/m³"],
};

interface Props {
  lat: number;
  lon: number;
}

export function AirQualityTable({ lat, lon }: Props) {
  const st = useAsync(() => fetchAirQuality(lat, lon), [lat, lon]);
  if (st.error) return <p class="error pad">Nepodarilo sa načítať: {st.error}</p>;
  const d = st.data;
  if (!d) return <p class="muted pad">Načítavam…</p>;
  const cols = columnIndices(d.times, 3);

  const rows: TableRow[] = (Object.keys(LABELS) as AirVar[]).map((v) => ({
    key: v,
    label: LABELS[v][0],
    unit: LABELS[v][1] || undefined,
    tall: v === "european_aqi",
    cell: (i: number) => {
      const x = d.vars[v][i];
      if (x === null || x === undefined) return null;
      if (v === "european_aqi") {
        const b = eaqiBand(x);
        return { text: <span class="aqi">{Math.round(x)}<small>{b.label}</small></span>, bg: b.color, color: x > 80 ? "#fff" : "#1b1f24" };
      }
      const c = bandColor(v, x);
      return { text: x < 10 ? x.toFixed(1) : Math.round(x), bg: c ? `${c}88` : undefined, color: c ? "#1b1f24" : undefined };
    },
  }));

  return (
    <>
      <ForecastTable times={d.times} cols={cols} rows={rows} />
      <p class="muted note pad">Zdroj: Copernicus CAMS (Open-Meteo Air Quality API), 5 dní. Farby podľa pásiem Európskej environmentálnej agentúry.</p>
    </>
  );
}
