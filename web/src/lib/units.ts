// Jednotky. Interne je všetko v SI (K, m/s, Pa, m, mm = kg/m², %),
// konverzia prebieha iba pri zobrazení.

export type Quantity = "temperature" | "speed" | "pressure" | "height" | "precipitation" | "distance" | "percent";

export type TemperatureUnit = "C" | "F" | "K";
export type SpeedUnit = "ms" | "kmh" | "kt" | "mph" | "bft";
export type PressureUnit = "hPa" | "inHg" | "mmHg";
export type HeightUnit = "m" | "ft";
export type PrecipitationUnit = "mm" | "in";
export type DistanceUnit = "km" | "nm" | "mi";

export interface UnitSettings {
  preset: "metric" | "aviation" | "custom";
  temperature: TemperatureUnit;
  speed: SpeedUnit;
  pressure: PressureUnit;
  height: HeightUnit;
  precipitation: PrecipitationUnit;
  distance: DistanceUnit;
}

export const PRESETS = {
  metric: { preset: "metric", temperature: "C", speed: "kmh", pressure: "hPa", height: "m", precipitation: "mm", distance: "km" },
  aviation: { preset: "aviation", temperature: "C", speed: "kt", pressure: "hPa", height: "ft", precipitation: "mm", distance: "nm" },
} as const satisfies Record<string, UnitSettings>;

export const UNIT_OPTIONS = {
  temperature: ["C", "F", "K"],
  speed: ["ms", "kmh", "kt", "mph", "bft"],
  pressure: ["hPa", "inHg", "mmHg"],
  height: ["m", "ft"],
  precipitation: ["mm", "in"],
  distance: ["km", "nm", "mi"],
} as const;

const LABELS: Record<string, string> = {
  C: "°C", F: "°F", K: "K",
  ms: "m/s", kmh: "km/h", kt: "kt", mph: "mph", bft: "Bft",
  hPa: "hPa", inHg: "inHg", mmHg: "mmHg",
  m: "m", ft: "ft",
  mm: "mm", in: "in",
  km: "km", nm: "NM", mi: "mi",
  pct: "%",
};

const KT = 1852 / 3600;
const MPH = 1609.344 / 3600;
const INHG = 3386.389; // Pa
const MMHG = 133.322387415; // Pa

/** Horné hranice Beaufortových stupňov 0–11 v m/s (WMO) */
const BFT_LIMITS = [0.5, 1.5, 3.3, 5.5, 7.9, 10.7, 13.8, 17.1, 20.7, 24.4, 28.4, 32.6];

export function beaufort(ms: number): number {
  const i = BFT_LIMITS.findIndex((lim) => ms < lim);
  return i === -1 ? 12 : i;
}

/** Jednotka, ktorá platí pre danú veličinu pri aktuálnom nastavení */
export function unitFor(q: Quantity, s: UnitSettings): string {
  return q === "percent" ? "pct" : s[q];
}

export function unitLabel(q: Quantity, s: UnitSettings): string {
  return LABELS[unitFor(q, s)] ?? "";
}

/** SI → zobrazovacia jednotka. Bft je spojitá aproximácia v = 0,836·B^1,5 (pre osi a legendy). */
export function fromSI(q: Quantity, v: number, unit: string): number {
  switch (q) {
    case "temperature":
      return unit === "C" ? v - 273.15 : unit === "F" ? (v - 273.15) * 1.8 + 32 : v;
    case "speed":
      switch (unit) {
        case "kmh": return v * 3.6;
        case "kt": return v / KT;
        case "mph": return v / MPH;
        case "bft": return Math.pow(Math.max(v, 0) / 0.836, 2 / 3);
        default: return v;
      }
    case "pressure":
      return unit === "inHg" ? v / INHG : unit === "mmHg" ? v / MMHG : v / 100;
    case "height":
      return unit === "ft" ? v / 0.3048 : v;
    case "precipitation":
      return unit === "in" ? v / 25.4 : v;
    case "distance":
      return unit === "nm" ? v / 1852 : unit === "mi" ? v / 1609.344 : v / 1000;
    case "percent":
      return v;
  }
}

/** Zobrazovacia jednotka → SI (inverzia fromSI) */
export function toSI(q: Quantity, v: number, unit: string): number {
  switch (q) {
    case "temperature":
      return unit === "C" ? v + 273.15 : unit === "F" ? (v - 32) / 1.8 + 273.15 : v;
    case "speed":
      switch (unit) {
        case "kmh": return v / 3.6;
        case "kt": return v * KT;
        case "mph": return v * MPH;
        case "bft": return 0.836 * Math.pow(Math.max(v, 0), 1.5);
        default: return v;
      }
    case "pressure":
      return unit === "inHg" ? v * INHG : unit === "mmHg" ? v * MMHG : v * 100;
    case "height":
      return unit === "ft" ? v * 0.3048 : v;
    case "precipitation":
      return unit === "in" ? v * 25.4 : v;
    case "distance":
      return unit === "nm" ? v * 1852 : unit === "mi" ? v * 1609.344 : v * 1000;
    case "percent":
      return v;
  }
}

const DECIMALS: Record<string, number> = {
  C: 1, F: 0, K: 1,
  ms: 1, kmh: 0, kt: 0, mph: 0, bft: 0,
  hPa: 1, inHg: 2, mmHg: 0,
  m: 0, ft: 0,
  mm: 1, in: 2,
  km: 0, nm: 0, mi: 0,
  pct: 0,
};

/** Číslo v zobrazovacej jednotke (bez značky jednotky) */
export function formatValue(q: Quantity, si: number, s: UnitSettings, decimals?: number): string {
  if (!Number.isFinite(si)) return "–";
  const unit = unitFor(q, s);
  if (q === "speed" && unit === "bft") return String(beaufort(si));
  const v = fromSI(q, si, unit);
  const d = decimals ?? DECIMALS[unit] ?? 1;
  // −0.0 → 0.0
  const out = v.toFixed(d);
  return /^-0(\.0+)?$/.test(out) ? out.slice(1) : out;
}

/** Číslo + jednotka, napr. "12.3 °C" */
export function format(q: Quantity, si: number, s: UnitSettings, decimals?: number): string {
  return `${formatValue(q, si, s, decimals)} ${unitLabel(q, s)}`;
}

export function isUnitSettings(x: unknown): x is UnitSettings {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  return (
    (o.preset === "metric" || o.preset === "aviation" || o.preset === "custom") &&
    (Object.keys(UNIT_OPTIONS) as (keyof typeof UNIT_OPTIONS)[]).every((k) =>
      (UNIT_OPTIONS[k] as readonly string[]).includes(o[k] as string),
    )
  );
}
