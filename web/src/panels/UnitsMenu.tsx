import { useEffect, useRef, useState } from "preact/hooks";
import { PRESETS, UNIT_OPTIONS, type UnitSettings } from "../lib/units";
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

const OPTION_LABELS: Record<string, string> = {
  C: "°C", F: "°F", K: "K", ms: "m/s", kmh: "km/h", kt: "kt", mph: "mph", bft: "Bft",
  hPa: "hPa", inHg: "inHg", mmHg: "mmHg", m: "m", ft: "ft", mm: "mm", in: "in", km: "km", nm: "NM", mi: "mi",
};

// Prepínač jednotiek: predvoľby + vlastné nastavenie po veličinách. Zmena sa prejaví hneď všade.
export function UnitsMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const u = units.value;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const setPreset = (p: UnitSettings["preset"]) => {
    units.value = p === "custom" ? { ...u, preset: "custom" } : { ...PRESETS[p] };
  };

  return (
    <div class="units" ref={ref}>
      <button class="btn" onClick={() => setOpen(!open)} aria-expanded={open} title="Jednotky">
        {PRESET_LABELS[u.preset]} ▾
      </button>
      {open && (
        <div class="popover" role="dialog" aria-label="Jednotky">
          <div class="segmented">
            {(Object.keys(PRESET_LABELS) as UnitSettings["preset"][]).map((p) => (
              <button key={p} class={u.preset === p ? "active" : ""} onClick={() => setPreset(p)}>
                {PRESET_LABELS[p]}
              </button>
            ))}
          </div>
          <div class="unit-grid">
            {(Object.keys(UNIT_OPTIONS) as (keyof typeof UNIT_OPTIONS)[]).map((q) => (
              <label key={q}>
                <span>{QUANTITY_LABELS[q]}</span>
                <select
                  value={u[q]}
                  onChange={(e) => (units.value = { ...u, preset: "custom", [q]: e.currentTarget.value })}
                >
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
      )}
    </div>
  );
}
