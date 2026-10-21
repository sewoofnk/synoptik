// Farebné škály – jediné miesto na ich ladenie. Hodnoty zarážok sú v SI (K, Pa, m/s, mm, %).
// Farby #rrggbb alebo #rrggbbaa. Medzi zarážkami lineárna interpolácia v sRGB.

export type ScaleTransform = "linear" | "sqrt";

export interface ColorScale {
  id: string;
  /** Rozsah, na ktorý sa mapuje 256 farieb LUT (SI) */
  min: number;
  max: number;
  /** sqrt = viac rozlíšenia pri malých hodnotách (zrážky) */
  transform: ScaleTransform;
  stops: [number, string][];
}

const C = (c: number) => c + 273.15;
const HPA = (p: number) => p * 100;

export const COLOR_SCALES: Record<string, ColorScale> = {
  // Teplota: modré/fialové pod nulou, ostrý prechod na zelenú pri 0 °C
  temperature: {
    id: "temperature",
    min: C(-45),
    max: C(50),
    transform: "linear",
    stops: [
      [C(-45), "#f0e6ff"],
      [C(-35), "#c79bff"],
      [C(-25), "#8a4fdc"],
      [C(-15), "#3b3fc7"],
      [C(-8), "#2f74e0"],
      [C(-3), "#5fb0f2"],
      [C(-0.01), "#b4e2ff"],
      [C(0), "#bfe8a6"],
      [C(5), "#6cc66a"],
      [C(10), "#cfdb52"],
      [C(15), "#f5c844"],
      [C(20), "#f39233"],
      [C(25), "#e2522b"],
      [C(30), "#b81d2c"],
      [C(35), "#7d0b3c"],
      [C(42), "#4b0a4f"],
      [C(50), "#e9b6dc"],
    ],
  },
  // Tlak MSLP: tlaková níž modrá, výš oranžová; jemné, aby vynikli izobary
  pressure: {
    id: "pressure",
    min: HPA(950),
    max: HPA(1050),
    transform: "linear",
    stops: [
      [HPA(950), "#3b1f6e"],
      [HPA(975), "#3d5bb8"],
      [HPA(995), "#7fa8d6"],
      [HPA(1010), "#d9dfe6"],
      [HPA(1020), "#efd9a8"],
      [HPA(1035), "#e0954a"],
      [HPA(1050), "#a8432a"],
    ],
  },
  // Rýchlosť vetra (m/s)
  wind: {
    id: "wind",
    min: 0,
    max: 50,
    transform: "linear",
    stops: [
      [0, "#4b5ea8"],
      [3, "#3a8fbf"],
      [6, "#43b39a"],
      [9, "#79c35a"],
      [12, "#d4cf3b"],
      [15, "#f2a33a"],
      [20, "#e4572e"],
      [25, "#c22a62"],
      [30, "#8b2a9c"],
      [40, "#4b1f6f"],
      [50, "#f0d0ff"],
    ],
  },
  // Zrážky za interval kroku (mm); pod 0,1 mm priehľadné
  precipitation: {
    id: "precipitation",
    min: 0,
    max: 60,
    transform: "sqrt",
    stops: [
      [0, "#00000000"],
      [0.09, "#00000000"],
      [0.1, "#9fd3ffb0"],
      [0.5, "#5aa9f0d0"],
      [1, "#2f74d8e0"],
      [2, "#1f9e5af0"],
      [5, "#e9d23a"],
      [10, "#f2952c"],
      [20, "#e33b2a"],
      [35, "#b0136f"],
      [60, "#6b0f8c"],
    ],
  },
  // Oblačnosť (%): priehľadná pri jasnej oblohe, šedomodrá viditeľná na svetlom aj tmavom podklade
  cloud: {
    id: "cloud",
    min: 0,
    max: 100,
    transform: "linear",
    stops: [
      [0, "#8c9bb000"],
      [10, "#8c9bb000"],
      [30, "#8c9bb066"],
      [60, "#9eabbd99"],
      [90, "#b6c0cecc"],
      [100, "#c8d0dbdd"],
    ],
  },
  // Relatívna vlhkosť (%)
  humidity: {
    id: "humidity",
    min: 0,
    max: 100,
    transform: "linear",
    stops: [
      [0, "#a5552a"],
      [30, "#e3b26b"],
      [50, "#e9e4c4"],
      [70, "#8fcf9a"],
      [85, "#3ea3a8"],
      [100, "#1f4f99"],
    ],
  },
};

// --- Tlakové hladiny -------------------------------------------------------

/** Spojitá paleta pre geopotenciál a relatívnu topografiu: nízke hodnoty (chladný vzduch) modré, vysoké červené */
const HEIGHT_PALETTE = ["#3b2a7a", "#3d63c0", "#4fa3d6", "#7fcf9a", "#e6dc72", "#f1a149", "#d9512e", "#8e1d3a"];

function heightScale(id: string, min: number, max: number): ColorScale {
  const n = HEIGHT_PALETTE.length - 1;
  return {
    id,
    min,
    max,
    transform: "linear",
    stops: HEIGHT_PALETTE.map((c, i) => [min + ((max - min) * i) / n, c] as [number, string]),
  };
}

Object.assign(COLOR_SCALES, {
  // Teplota vo výške (500 hPa a vyššie): viac odtieňov v mraze, 0 °C ostáva ostrá hranica
  temperature_upper: {
    id: "temperature_upper",
    min: C(-70),
    max: C(20),
    transform: "linear",
    stops: [
      [C(-70), "#f3e9ff"],
      [C(-60), "#d2b0ff"],
      [C(-50), "#a46ff0"],
      [C(-40), "#6b44d4"],
      [C(-30), "#3b49c9"],
      [C(-20), "#2f7fe0"],
      [C(-10), "#5fb7f0"],
      [C(-0.01), "#b4e2ff"],
      [C(0), "#bfe8a6"],
      [C(10), "#f5c844"],
      [C(20), "#e2522b"],
    ],
  },
  // Vietor vo výške (m/s): dýzové prúdenie 30–90 m/s
  wind_upper: {
    id: "wind_upper",
    min: 0,
    max: 90,
    transform: "linear",
    stops: [
      [0, "#4b5ea8"],
      [10, "#3a8fbf"],
      [20, "#43b39a"],
      [30, "#a8c94a"],
      [40, "#f2c23a"],
      [50, "#f2853a"],
      [60, "#de3f3a"],
      [70, "#b0237a"],
      [80, "#6c2296"],
      [90, "#f0d0ff"],
    ],
  },
  // Geopotenciálna výška (gpm) – rozsah podľa hladiny
  gph_850: heightScale("gph_850", 1100, 1650),
  gph_700: heightScale("gph_700", 2600, 3250),
  gph_500: heightScale("gph_500", 4900, 5950),
  gph_300: heightScale("gph_300", 8300, 9750),
  gph_250: heightScale("gph_250", 9400, 11000),
  // Relatívna topografia 500/1000 hPa (gpm); 5280 m ≈ hranica dážď/sneh
  thickness: heightScale("thickness", 4950, 5850),
} satisfies Record<string, ColorScale>);

// --- Konvekcia ----------------------------------------------------------------

Object.assign(COLOR_SCALES, {
  // CAPE (J/kg): pod 100 priehľadné, od 1000 výrazné, 3000+ extrémne
  cape: {
    id: "cape",
    min: 0,
    max: 4000,
    transform: "linear",
    stops: [
      [0, "#00000000"],
      [50, "#00000000"],
      [100, "#a8e6a3b0"],
      [300, "#e8ee6fd0"],
      [700, "#f9c74f"],
      [1200, "#f3722c"],
      [2000, "#d62828"],
      [3000, "#9d0b6b"],
      [4000, "#5a189a"],
    ],
  },
  // CIN (J/kg, kladná veľkosť): silnejšia inhibícia tmavšia modrá
  cin: {
    id: "cin",
    min: 0,
    max: 400,
    transform: "linear",
    stops: [
      [0, "#00000000"],
      [10, "#00000000"],
      [25, "#c6dbefb0"],
      [50, "#9ecae1d0"],
      [100, "#6baed6"],
      [200, "#3182bd"],
      [400, "#08306b"],
    ],
  },
  // Lifted Index (K): záporný = labilita (teplé farby), kladný = stabilita (studené, tlmené)
  lifted_index: {
    id: "lifted_index",
    min: -10,
    max: 15,
    transform: "linear",
    stops: [
      [-10, "#4a0d67"],
      [-7, "#a4133c"],
      [-4, "#e85d04"],
      [-2, "#f48c06"],
      [0, "#ffd166"],
      [2, "#e9f5db"],
      [6, "#b7d7e8"],
      [15, "#8da9c4"],
    ],
  },
  // Strih vetra 0–6 km (m/s): 10 slabý, 20 organizované búrky, 30+ supercely
  shear: {
    id: "shear",
    min: 0,
    max: 45,
    transform: "linear",
    stops: [
      [0, "#00000000"],
      [5, "#e5f5e0a0"],
      [10, "#a1d99b"],
      [15, "#ffe08a"],
      [20, "#fdae61"],
      [25, "#f46d43"],
      [30, "#d73027"],
      [45, "#67001f"],
    ],
  },
  // Výška nulovej izotermy (m n. m.)
  freezing_level: {
    id: "freezing_level",
    min: 0,
    max: 5000,
    transform: "linear",
    stops: [
      [0, "#5e3c99"],
      [500, "#3f6fd1"],
      [1000, "#4fb3d9"],
      [1500, "#7fd3a2"],
      [2000, "#d9ef8b"],
      [2500, "#fee08b"],
      [3000, "#fdae61"],
      [4000, "#f46d43"],
      [5000, "#d73027"],
    ],
  },
} satisfies Record<string, ColorScale>);

// Hladiny 850 a 700 hPa používajú prízemné škály, vyššie hladiny „výškové“
for (const l of [850, 700]) {
  COLOR_SCALES[`temperature_${l}`] = COLOR_SCALES.temperature!;
  COLOR_SCALES[`wind_${l}`] = COLOR_SCALES.wind!;
}
for (const l of [500, 300, 250]) {
  COLOR_SCALES[`temperature_${l}`] = COLOR_SCALES.temperature_upper!;
  COLOR_SCALES[`wind_${l}`] = COLOR_SCALES.wind_upper!;
}

function parseColor(hex: string): [number, number, number, number] {
  const h = hex.replace("#", "");
  const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
  return [n(0), n(2), n(4), h.length >= 8 ? n(6) : 255];
}

/** Normalizovaná pozícia hodnoty v škále 0–1 (vrátane transformácie) */
export function scalePosition(scale: ColorScale, v: number): number {
  const t = Math.min(1, Math.max(0, (v - scale.min) / (scale.max - scale.min)));
  return scale.transform === "sqrt" ? Math.sqrt(t) : t;
}

/** Inverzia scalePosition */
export function scaleValueAt(scale: ColorScale, pos: number): number {
  const t = scale.transform === "sqrt" ? pos * pos : pos;
  return scale.min + t * (scale.max - scale.min);
}

/** Farba (RGBA 0–255) pre hodnotu v SI */
export function colorAt(scale: ColorScale, v: number): [number, number, number, number] {
  const s = scale.stops;
  if (v <= s[0]![0]) return parseColor(s[0]![1]);
  for (let i = 1; i < s.length; i++) {
    const [v1, c1] = s[i]!;
    if (v <= v1) {
      const [v0, c0] = s[i - 1]!;
      const t = (v - v0) / (v1 - v0);
      const a = parseColor(c0), b = parseColor(c1);
      return [0, 1, 2, 3].map((k) => Math.round(a[k]! + (b[k]! - a[k]!) * t)) as [number, number, number, number];
    }
  }
  return parseColor(s[s.length - 1]![1]);
}

/** LUT: `size` farieb RGBA rovnomerne v priestore pozície (po transformácii) */
export function buildLut(scale: ColorScale, size = 256): Uint8Array {
  const out = new Uint8Array(size * 4);
  for (let i = 0; i < size; i++) {
    out.set(colorAt(scale, scaleValueAt(scale, i / (size - 1))), i * 4);
  }
  return out;
}

/**
 * CSS lineárny prechod zo škály (náhľady vrstiev v menu). Priehľadnosť sa ignoruje,
 * aby boli náhľady čitateľné aj pri škálach s priehľadným začiatkom (oblačnosť, zrážky).
 */
export function cssGradient(scale: ColorScale, angle = 135, from = 0.1, to = 0.9, n = 6): string {
  const parts: string[] = [];
  for (let i = 0; i < n; i++) {
    const pos = from + ((to - from) * i) / (n - 1);
    const [r, g, b] = colorAt(scale, scaleValueAt(scale, pos));
    parts.push(`rgb(${r} ${g} ${b}) ${Math.round((i / (n - 1)) * 100)}%`);
  }
  return `linear-gradient(${angle}deg, ${parts.join(", ")})`;
}
