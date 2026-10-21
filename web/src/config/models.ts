// Register modelov pre mapové polia. `sources` = priečinky v s3://openmeteo/data_spatial/
// (overené 2026-10-21, pozri docs/rozhodnutia.md R-001, R-009 a R-011).

import type { LatLonTarget, LccGrid } from "../lib/lcc";

/** [latMin, lonMin, latMax, lonMax] */
export type Bbox = [number, number, number, number];

export interface ModelDef {
  id: string;
  /** Krátky názov do UI */
  label: string;
  /**
   * Priečinky v Open-Meteo data_spatial. Prvý je hlavný (zoznam behov, časy krokov);
   * ďalšie dopĺňajú premenné z toho istého behu (GFS: hladiny v 0,25°, prízemné polia v 0,13°).
   */
  sources: string[];
  /** Poskytovateľ dát pre atribúciu */
  provider: "DWD" | "ECMWF" | "NOAA" | "Météo-France" | "ČHMÚ";
  /** Natívne rozlíšenie (stupne) */
  resolutionDeg: number;
  /** Globálne modely: čítať iba výrez Európy (chunky 32×32 → prenesie sa iba potrebná časť) */
  crop?: Bbox;
  /** Projektovaná mriežka (LCC) – pole sa po načítaní prevzorkuje na lat/lon `target` */
  projection?: { grid: LccGrid; target: LatLonTarget };
  /** Krok časovej osi v histórii (natívny krok v krátkom predstihu), hodiny */
  historyStepHours: number;
  /** Podporovaný vo výbere */
  enabled: boolean;
}

/** Výrez Európy pre globálne modely (o niečo väčší než ICON-EU) */
export const EUROPE_CROP: Bbox = [25, -35, 75, 65];

export const MODELS: readonly ModelDef[] = [
  { id: "icon_eu", label: "ICON-EU", sources: ["dwd_icon_eu"], provider: "DWD", resolutionDeg: 0.0625, historyStepHours: 1, enabled: true },
  {
    id: "ecmwf_ifs025",
    label: "ECMWF IFS 0,25°",
    sources: ["ecmwf_ifs025"],
    provider: "ECMWF",
    resolutionDeg: 0.25,
    historyStepHours: 3,
    crop: EUROPE_CROP,
    enabled: true,
  },
  {
    id: "gfs025",
    label: "GFS 0,25°",
    sources: ["ncep_gfs025", "ncep_gfs013"],
    provider: "NOAA",
    resolutionDeg: 0.25,
    historyStepHours: 1,
    crop: EUROPE_CROP,
    enabled: true,
  },
  {
    // ČHMÚ ALADIN 2,3 km – celé Slovensko vrátane východu (ICON-D2 končí na 20,3° E)
    id: "aladin_ce",
    label: "ALADIN 2 km",
    sources: ["chmi_aladin_central_europe_2km"],
    provider: "ČHMÚ",
    resolutionDeg: 0.021,
    historyStepHours: 1,
    projection: {
      // mriežka podľa zdrojov Open-Meteo (ChmiDomain.swift), overená voči API v 5 bodoch
      grid: { nx: 1053, ny: 837, firstLat: 38.599, firstLon: 1.334, dx: 2325, dy: 2325, lat0: 46.244, lon0: 17, radius: 6371229 },
      // ~2,2 × 2,2 km pri 48° N; rohy mimo kužeľa ostanú prázdne
      target: { latMin: 38.6, lonMin: 1.3, latMax: 56.16, lonMax: 34.33, dlat: 0.02, dlon: 0.03 },
    },
    enabled: true,
  },
  { id: "icon_d2", label: "ICON-D2", sources: ["dwd_icon_d2"], provider: "DWD", resolutionDeg: 0.02, historyStepHours: 1, enabled: false },
];

export const DEFAULT_MODEL_ID = "icon_eu";

export function getModel(id: string): ModelDef {
  const m = MODELS.find((x) => x.id === id);
  if (!m) throw new Error(`Neznámy model: ${id}`);
  return m;
}
