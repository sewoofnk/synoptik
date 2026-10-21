// Katalóg vrstiev. Z neho sa generuje ľavý panel; premenné sú názvy z Open-Meteo data_spatial.
// Dostupnosť premennej v konkrétnom behu sa kontroluje podľa RunInfo.variables.

import type { Quantity } from "../lib/units";
import type { IconName } from "../panels/icons";

export type LayerCategory = "surface" | "clouds_precip" | "pressure_levels" | "convection" | "other";

export const CATEGORY_LABELS: Record<LayerCategory, string> = {
  surface: "Prízemné",
  clouds_precip: "Oblačnosť a zrážky",
  pressure_levels: "Tlakové hladiny",
  convection: "Konvekcia",
  other: "Ostatné",
};

export type FieldSource =
  | { kind: "scalar"; variable: string }
  /** Farba = rýchlosť z u/v */
  | { kind: "speed"; u: string; v: string };

export interface LayerDef {
  id: string;
  label: string;
  category: LayerCategory;
  quantity: Quantity;
  scale: string;
  source: FieldSource;
  /** Hodnota je súčet za interval od predchádzajúceho kroku (zrážky) */
  accumulation?: boolean;
  /** Ikona v menu a v rýchlom výbere */
  icon: IconName;
  /** Písmeno na ikone (napr. N/S/V pri oblačnosti) */
  badge?: string;
  /** Zobraziť v rýchlom výbere vpravo (poradie podľa katalógu) */
  quick?: boolean;
  /** Krátky názov pre rýchly výber a dlaždice */
  short?: string;
  /** Pri zapnutí vrstvy zapnúť aj tieto prekrytia */
  overlays?: Partial<Record<OverlayId, boolean>>;
}

export const LAYERS: readonly LayerDef[] = [
  {
    id: "temperature_2m",
    icon: "thermometer",
    quick: true,
    short: "Teplota",
    label: "Teplota 2 m",
    category: "surface",
    quantity: "temperature",
    scale: "temperature",
    source: { kind: "scalar", variable: "temperature_2m" },
  },
  {
    id: "pressure_msl",
    icon: "gauge",
    quick: true,
    short: "Tlak",
    label: "Tlak MSLP",
    category: "surface",
    quantity: "pressure",
    scale: "pressure",
    source: { kind: "scalar", variable: "pressure_msl" },
    overlays: { isobars: true },
  },
  {
    id: "wind_10m",
    icon: "wind",
    quick: true,
    short: "Vietor",
    label: "Vietor 10 m",
    category: "surface",
    quantity: "speed",
    scale: "wind",
    source: { kind: "speed", u: "wind_u_component_10m", v: "wind_v_component_10m" },
    overlays: { particles: true },
  },
  {
    id: "wind_gusts_10m",
    icon: "gust",
    quick: true,
    short: "Nárazy",
    label: "Nárazy vetra",
    category: "surface",
    quantity: "speed",
    scale: "wind",
    source: { kind: "scalar", variable: "wind_gusts_10m" },
  },
  {
    id: "relative_humidity_2m",
    icon: "humidity",
    short: "Vlhkosť",
    label: "Relatívna vlhkosť 2 m",
    category: "surface",
    quantity: "percent",
    scale: "humidity",
    source: { kind: "scalar", variable: "relative_humidity_2m" },
  },
  {
    id: "precipitation",
    icon: "droplet",
    quick: true,
    short: "Zrážky",
    label: "Zrážky",
    category: "clouds_precip",
    quantity: "precipitation",
    scale: "precipitation",
    source: { kind: "scalar", variable: "precipitation" },
    accumulation: true,
  },
  {
    id: "cloud_cover",
    icon: "cloud",
    quick: true,
    short: "Oblačnosť",
    label: "Oblačnosť celková",
    category: "clouds_precip",
    quantity: "percent",
    scale: "cloud",
    source: { kind: "scalar", variable: "cloud_cover" },
  },
  {
    id: "cloud_cover_low",
    icon: "cloud",
    badge: "N",
    short: "Nízka obl.",
    label: "Oblačnosť nízka",
    category: "clouds_precip",
    quantity: "percent",
    scale: "cloud",
    source: { kind: "scalar", variable: "cloud_cover_low" },
  },
  {
    id: "cloud_cover_mid",
    icon: "cloud",
    badge: "S",
    short: "Stredná obl.",
    label: "Oblačnosť stredná",
    category: "clouds_precip",
    quantity: "percent",
    scale: "cloud",
    source: { kind: "scalar", variable: "cloud_cover_mid" },
  },
  {
    id: "cloud_cover_high",
    icon: "cloud",
    badge: "V",
    short: "Vysoká obl.",
    label: "Oblačnosť vysoká",
    category: "clouds_precip",
    quantity: "percent",
    scale: "cloud",
    source: { kind: "scalar", variable: "cloud_cover_high" },
  },
];

/** Prekrytia kombinovateľné s ľubovoľnou farebnou vrstvou */
export type OverlayId = "isobars" | "particles";

export interface OverlayDef {
  id: OverlayId;
  label: string;
  icon: IconName;
  /** Premenné, ktoré prekrytie potrebuje */
  variables: string[];
}

export const OVERLAYS: readonly OverlayDef[] = [
  { id: "isobars", label: "Izobary", icon: "isolines", variables: ["pressure_msl"] },
  { id: "particles", label: "Animácia vetra", icon: "particles", variables: ["wind_u_component_10m", "wind_v_component_10m"] },
];

/** Izobary: každé 4 hPa, zvýraznené 1000 a 1020 hPa (SI) */
export const ISOBARS = { intervalPa: 400, majorPa: [100000, 102000] } as const;

export const DEFAULT_LAYER_ID = "temperature_2m";

export function getLayer(id: string): LayerDef | undefined {
  return LAYERS.find((l) => l.id === id);
}

export function sourceVariables(src: FieldSource): string[] {
  return src.kind === "scalar" ? [src.variable] : [src.u, src.v];
}
