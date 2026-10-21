// Hranice štátov (a voliteľne krajov) vo farbe a hrúbke podľa nastavenia, aby boli viditeľné
// aj nad farebným poľom. Mení iba vrstvy podkladovej mapy OpenFreeMap (positron/dark).

import type { ExpressionSpecification, Map as MlMap } from "maplibre-gl";

/** Hodnota vlastnosti tak, ako ju vrátil getPaintProperty (vracia sa nezmenená) */
type PaintValue = unknown;

export interface BorderSettings {
  /** "default" = farba štýlu mapy */
  color: string;
  /** Násobok hrúbky: 1 tenké, 2 stredné, 3 hrubé */
  width: 1 | 2 | 3;
  /** Prefarbiť aj hranice krajov/regiónov */
  regions: boolean;
}

export const DEFAULT_BORDERS: BorderSettings = { color: "default", width: 2, regions: false };

export const BORDER_COLORS: { id: string; label: string }[] = [
  { id: "default", label: "Podľa mapy" },
  { id: "#111111", label: "Čierna" },
  { id: "#ffffff", label: "Biela" },
  { id: "#e5484d", label: "Červená" },
  { id: "#ffd60a", label: "Žltá" },
  { id: "#d63384", label: "Purpurová" },
  { id: "#00d1ff", label: "Tyrkysová" },
];

const COUNTRY = /^boundary_(2|disputed|country)/;
const REGION = /^boundary_(3|state)/;

/** Pôvodné vlastnosti vrstiev aktuálneho štýlu (na návrat k „Podľa mapy“) */
const originals = new WeakMap<MlMap, Map<string, Record<string, PaintValue>>>();

const PROPS = ["line-color", "line-width", "line-opacity", "line-blur"] as const;

/** Zapamätať pôvodné vlastnosti – volať po každom načítaní štýlu */
export function captureBorderDefaults(map: MlMap) {
  const store = new Map<string, Record<string, PaintValue>>();
  for (const l of map.getStyle().layers ?? []) {
    if (l.type !== "line" || !(COUNTRY.test(l.id) || REGION.test(l.id))) continue;
    const o: Record<string, PaintValue> = {};
    for (const p of PROPS) o[p] = map.getPaintProperty(l.id, p);
    store.set(l.id, o);
  }
  originals.set(map, store);
}

export function applyBorders(map: MlMap, s: BorderSettings) {
  const store = originals.get(map);
  if (!store) return;
  for (const [id, orig] of store) {
    const country = COUNTRY.test(id);
    const custom = s.color !== "default" && (country || s.regions);
    if (!custom) {
      for (const p of PROPS) map.setPaintProperty(id, p, orig[p] as never);
      continue;
    }
    const w = s.width;
    const width: ExpressionSpecification = country
      ? ["interpolate", ["linear"], ["zoom"], 3, 0.7 * w, 6, 1.2 * w, 10, 2 * w]
      : ["interpolate", ["linear"], ["zoom"], 5, 0.4 * w, 8, 0.8 * w, 12, 1.4 * w];
    map.setPaintProperty(id, "line-color", s.color);
    map.setPaintProperty(id, "line-width", width);
    map.setPaintProperty(id, "line-opacity", country ? 1 : 0.85);
    map.setPaintProperty(id, "line-blur", 0);
  }
}

export function isBorderSettings(x: unknown): x is BorderSettings {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.color === "string" &&
    BORDER_COLORS.some((c) => c.id === o.color) &&
    (o.width === 1 || o.width === 2 || o.width === 3) &&
    typeof o.regions === "boolean"
  );
}
