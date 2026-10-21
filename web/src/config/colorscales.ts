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
