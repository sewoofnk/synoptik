import { PRESETS, UNIT_OPTIONS, type UnitSettings as Units } from "../lib/units";
import { units } from "../state/store";

const PRESET_LABELS = { metric: "Metrické", aviation: "Letecké", custom: "Vlastné" } as const;

const QUANTITY_LABELS: Record<keyof typeof UNIT_OPTIONS, string> = {
  temperature: "Teplota",
  speed: "Vietor",
  pressure: "Tlak",
  height: "Výška",
  precipitation: "Zrážky",
  distance: "Vzdialenosť",
};

export const OPTION_LABELS: Record<string, string> = {
  C: "°C", F: "°F", K: "K", ms: "m/s", kmh: "km/h", kt: "kt", mph: "mph", bft: "Bft",
  hPa: "hPa", inHg: "inHg", mmHg: "mmHg", m: "m", ft: "ft", mm: "mm", in: "in", km: "km", nm: "NM", mi: "mi",
};

// Jednotky: predvoľby + vlastné nastavenie po veličinách. Zmena sa prejaví hneď všade.
export function UnitsSettings() {
  const u = units.value;
  const setPreset = (p: Units["preset"]) => {
    units.value = p === "custom" ? { ...u, preset: "custom" } : { ...PRESETS[p] };
  };

  return (
    <div class="units-settings">
      <div class="segmented">
        {(Object.keys(PRESET_LABELS) as Units["preset"][]).map((p) => (
          <button key={p} class={u.preset === p ? "active" : ""} onClick={() => setPreset(p)}>
            {PRESET_LABELS[p]}
          </button>
        ))}
      </div>
      <div class="unit-grid">
        {(Object.keys(UNIT_OPTIONS) as (keyof typeof UNIT_OPTIONS)[]).map((q) => (
          <label key={q}>
            <span>{QUANTITY_LABELS[q]}</span>
            <select value={u[q]} onChange={(e) => (units.value = { ...u, preset: "custom", [q]: e.currentTarget.value })}>
              {UNIT_OPTIONS[q].map((o) => (
                <option key={o} value={o}>
                  {OPTION_LABELS[o]}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
    </div>
  );
}
