// Katalóg vrstiev. Z neho sa generuje menu, rýchly výber a zoznam premenných na načítanie;
// premenné sú názvy z Open-Meteo data_spatial. Dostupnosť v konkrétnom behu sa kontroluje
// podľa RunInfo.variables (každý model má iné premenné a hladiny – R-009).

import type { Quantity } from "../lib/units";
import type { IconName } from "../panels/icons";

export type LayerCategory = "surface" | "clouds_precip" | "pressure_levels" | "convection" | "other";

export const CATEGORY_LABELS: Record<LayerCategory, string> = {
  surface: "Prízemné a hladiny",
  clouds_precip: "Oblačnosť a zrážky",
  pressure_levels: "Tlakové hladiny",
  convection: "Konvekcia",
  other: "Ostatné",
};

/** Hladina: povrch (2 m / 10 m / MSL) alebo tlaková hladina v hPa */
export type Level = "sfc" | 850 | 700 | 500 | 300 | 250;
export const LEVELS: readonly Level[] = ["sfc", 850, 700, 500, 300, 250];

/** Približná letová hladina v štandardnej atmosfére (orientačne pre pilotov) */
export const LEVEL_FL: Record<Exclude<Level, "sfc">, string> = { 850: "FL050", 700: "FL100", 500: "FL180", 300: "FL300", 250: "FL340" };

export function levelLabel(l: Level): string {
  return l === "sfc" ? "Povrch" : `${l} hPa`;
}

export type FieldSource =
  | { kind: "scalar"; variable: string }
  /** Rýchlosť z u/v */
  | { kind: "speed"; u: string; v: string }
  /** Rosný bod z teploty a relatívnej vlhkosti */
  | { kind: "dewpoint"; t: string; rh: string }
  /** Rozdiel a − b (relatívna topografia) */
  | { kind: "diff"; a: string; b: string };

interface Variant {
  source: FieldSource;
  scale: string;
  /** Názov pri tejto hladine (inak názov vrstvy + hladina) */
  label?: string;
}

/** Izočiary vlastného poľa vrstvy (napr. relatívna topografia) – kreslí ich prekrytie „Izočiary“ */
export interface ContourDef {
  /** Interval v SI */
  interval: number;
  /** Zvýraznené hodnoty v SI */
  major?: number[];
}

export interface LayerDef {
  id: string;
  /** Všeobecný názov (bez hladiny), napr. „Teplota“ */
  label: string;
  category: LayerCategory;
  quantity: Quantity;
  /** Pri povrchu; chýba = vrstva existuje iba v tlakových hladinách */
  surface?: Variant;
  /** V tlakovej hladine; {L} sa nahradí číslom hladiny */
  upper?: Variant & { levels: readonly Exclude<Level, "sfc">[] };
  /** Hodnota nezávisí od zvolenej hladiny (napr. relatívna topografia 500/1000) */
  levelIndependent?: boolean;
  contours?: ContourDef;
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

const UPPER: readonly Exclude<Level, "sfc">[] = [850, 700, 500, 300, 250];
const sc = (variable: string): FieldSource => ({ kind: "scalar", variable });

export const LAYERS: readonly LayerDef[] = [
  {
    id: "temperature",
    label: "Teplota",
    category: "surface",
    quantity: "temperature",
    surface: { source: sc("temperature_2m"), scale: "temperature", label: "Teplota 2 m" },
    upper: { source: sc("temperature_{L}hPa"), scale: "temperature_{L}", levels: UPPER },
    icon: "thermometer",
    quick: true,
  },
  {
    id: "dew_point",
    label: "Rosný bod",
    category: "surface",
    quantity: "temperature",
    surface: { source: { kind: "dewpoint", t: "temperature_2m", rh: "relative_humidity_2m" }, scale: "temperature", label: "Rosný bod 2 m" },
    upper: { source: { kind: "dewpoint", t: "temperature_{L}hPa", rh: "relative_humidity_{L}hPa" }, scale: "temperature_{L}", levels: UPPER },
    icon: "droplet",
    badge: "Td",
  },
  {
    id: "pressure_msl",
    label: "Tlak MSLP",
    category: "surface",
    quantity: "pressure",
    surface: { source: sc("pressure_msl"), scale: "pressure" },
    icon: "gauge",
    quick: true,
    short: "Tlak",
    overlays: { isobars: true },
  },
  {
    id: "wind",
    label: "Vietor",
    category: "surface",
    quantity: "speed",
    surface: { source: { kind: "speed", u: "wind_u_component_10m", v: "wind_v_component_10m" }, scale: "wind", label: "Vietor 10 m" },
    upper: { source: { kind: "speed", u: "wind_u_component_{L}hPa", v: "wind_v_component_{L}hPa" }, scale: "wind_{L}", levels: UPPER },
    icon: "wind",
    quick: true,
    overlays: { particles: true },
  },
  {
    id: "wind_gusts_10m",
    label: "Nárazy vetra",
    category: "surface",
    quantity: "speed",
    surface: { source: sc("wind_gusts_10m"), scale: "wind" },
    icon: "gust",
    quick: true,
    short: "Nárazy",
  },
  {
    id: "relative_humidity",
    label: "Relatívna vlhkosť",
    category: "surface",
    quantity: "percent",
    surface: { source: sc("relative_humidity_2m"), scale: "humidity", label: "Relatívna vlhkosť 2 m" },
    upper: { source: sc("relative_humidity_{L}hPa"), scale: "humidity", levels: UPPER },
    icon: "humidity",
    short: "Vlhkosť",
  },
  {
    id: "precipitation",
    label: "Zrážky",
    category: "clouds_precip",
    quantity: "precipitation",
    surface: { source: sc("precipitation"), scale: "precipitation" },
    accumulation: true,
    icon: "droplet",
    quick: true,
  },
  {
    id: "cloud_cover",
    label: "Oblačnosť celková",
    category: "clouds_precip",
    quantity: "percent",
    surface: { source: sc("cloud_cover"), scale: "cloud" },
    icon: "cloud",
    quick: true,
    short: "Oblačnosť",
  },
  {
    id: "cloud_cover_low",
    label: "Oblačnosť nízka",
    category: "clouds_precip",
    quantity: "percent",
    surface: { source: sc("cloud_cover_low"), scale: "cloud" },
    icon: "cloud",
    badge: "N",
    short: "Nízka obl.",
  },
  {
    id: "cloud_cover_mid",
    label: "Oblačnosť stredná",
    category: "clouds_precip",
    quantity: "percent",
    surface: { source: sc("cloud_cover_mid"), scale: "cloud" },
    icon: "cloud",
    badge: "S",
    short: "Stredná obl.",
  },
  {
    id: "cloud_cover_high",
    label: "Oblačnosť vysoká",
    category: "clouds_precip",
    quantity: "percent",
    surface: { source: sc("cloud_cover_high"), scale: "cloud" },
    icon: "cloud",
    badge: "V",
    short: "Vysoká obl.",
  },
  {
    id: "geopotential",
    label: "Geopotenciál",
    category: "pressure_levels",
    quantity: "height",
    upper: { source: sc("geopotential_height_{L}hPa"), scale: "gph_{L}", levels: UPPER },
    icon: "isolines",
    short: "Geopot.",
    overlays: { isobars: true },
  },
  {
    id: "thickness_500_1000",
    label: "Relatívna topografia 500/1000",
    category: "pressure_levels",
    quantity: "height",
    surface: {
      source: { kind: "diff", a: "geopotential_height_500hPa", b: "geopotential_height_1000hPa" },
      scale: "thickness",
    },
    levelIndependent: true,
    // 4 dam; 528 dam ≈ hranica dážď/sneh, 552 dam zvýraznená pre orientáciu
    contours: { interval: 40, major: [5280, 5520] },
    icon: "ruler",
    short: "RT 500/1000",
    overlays: { isobars: true },
  },
];

/** Prekrytia kombinovateľné s ľubovoľnou farebnou vrstvou */
export type OverlayId = "isobars" | "isotherms" | "particles";

export interface OverlayDef {
  id: OverlayId;
  label: string;
  icon: IconName;
}

export const OVERLAYS: readonly OverlayDef[] = [
  // pri povrchu izobary MSLP, v hladine izohypsy, pri vrstve s vlastnými izočiarami tie
  { id: "isobars", label: "Izočiary", icon: "isolines" },
  { id: "isotherms", label: "Izotermy", icon: "thermometer" },
  { id: "particles", label: "Animácia vetra", icon: "particles" },
];

/** Izobary: každé 4 hPa, zvýraznené 1000 a 1020 hPa (SI) */
export const ISOBARS = { intervalPa: 400, majorPa: [100000, 102000] } as const;

export const DEFAULT_LAYER_ID = "temperature";

/** Staré ID vrstiev (URL a localStorage z Fázy 1–2) → nové */
const LEGACY_IDS: Record<string, string> = {
  temperature_2m: "temperature",
  wind_10m: "wind",
  relative_humidity_2m: "relative_humidity",
};

export function getLayer(id: string): LayerDef | undefined {
  const real = LEGACY_IDS[id] ?? id;
  return LAYERS.find((l) => l.id === real);
}

export function sourceVariables(src: FieldSource): string[] {
  switch (src.kind) {
    case "scalar":
      return [src.variable];
    case "speed":
      return [src.u, src.v];
    case "dewpoint":
      return [src.t, src.rh];
    case "diff":
      return [src.a, src.b];
  }
}

function withLevel(src: FieldSource, l: number): FieldSource {
  const r = (s: string) => s.replace("{L}", String(l));
  switch (src.kind) {
    case "scalar":
      return { kind: "scalar", variable: r(src.variable) };
    case "speed":
      return { kind: "speed", u: r(src.u), v: r(src.v) };
    case "dewpoint":
      return { kind: "dewpoint", t: r(src.t), rh: r(src.rh) };
    case "diff":
      return { kind: "diff", a: r(src.a), b: r(src.b) };
  }
}

/** Vrstva pri konkrétnej hladine – to, čo sa naozaj kreslí */
export interface ResolvedLayer {
  def: LayerDef;
  id: string;
  /** Hladina, ku ktorej hodnoty patria (pri povrchovej vrstve „sfc“, aj keď je zvolená iná) */
  level: Level;
  label: string;
  quantity: Quantity;
  source: FieldSource;
  scale: string;
  accumulation: boolean;
  contours?: ContourDef;
}

/**
 * Vyrieši vrstvu pre zvolenú hladinu. Vrstva bez variantu pre hladinu sa kreslí pri povrchu
 * (napr. zrážky pri 500 hPa); vrstva iba v hladinách pri povrchu použije 500 hPa.
 */
export function resolveLayer(def: LayerDef, level: Level): ResolvedLayer {
  const base = { def, id: def.id, quantity: def.quantity, accumulation: !!def.accumulation, contours: def.contours };
  const up = def.upper;
  if (up && (level !== "sfc" || !def.surface)) {
    const l = level !== "sfc" && up.levels.includes(level) ? level : up.levels.includes(500) ? 500 : up.levels[0]!;
    return {
      ...base,
      level: l,
      label: `${def.label} ${l} hPa`,
      source: withLevel(up.source, l),
      scale: up.scale.replace("{L}", String(l)),
    };
  }
  const s = def.surface!;
  const label = s.label ?? def.label;
  return {
    ...base,
    level: "sfc",
    label: level !== "sfc" && !def.levelIndependent ? `${label} (povrch)` : label,
    source: s.source,
    scale: s.scale,
  };
}

/** Škála pre náhľad v menu (povrchová, inak 500 hPa) */
export function previewScale(def: LayerDef): string {
  return def.surface?.scale ?? def.upper!.scale.replace("{L}", "500");
}

/** Má beh všetky premenné vrstvy pri danej hladine? (bez behu = áno) */
export function isLayerAvailable(def: LayerDef, level: Level, variables: string[] | undefined): boolean {
  if (!variables) return true;
  return sourceVariables(resolveLayer(def, level).source).every((v) => variables.includes(v));
}

/** Premenné prekrytia pri aktuálnej vrstve a hladine */
export function overlayVariables(id: OverlayId, layer: ResolvedLayer, level: Level): string[] {
  const s = overlaySources(layer, level);
  if (id === "particles") return [s.wind.u, s.wind.v];
  return sourceVariables(id === "isobars" ? s.isolines : s.isotherms);
}

/** Premenné prekrytí pri danej hladine */
export function overlaySources(layer: ResolvedLayer, level: Level) {
  const L = level === "sfc" ? null : level;
  return {
    isolines: layer.contours
      ? layer.source
      : L
        ? sc(`geopotential_height_${L}hPa`)
        : sc("pressure_msl"),
    isotherms: L ? sc(`temperature_${L}hPa`) : sc("temperature_2m"),
    wind: L
      ? { u: `wind_u_component_${L}hPa`, v: `wind_v_component_${L}hPa` }
      : { u: "wind_u_component_10m", v: "wind_v_component_10m" },
  };
}
