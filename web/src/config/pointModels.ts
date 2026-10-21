// Modely dostupné pre bodové nástroje (Open-Meteo Forecast API, parameter `models=`).
// Názvy a dostupnosť overené 2026-10-21 (pozri docs/rozhodnutia.md, R-006).

export interface PointModel {
  /** hodnota parametra `models=` */
  id: string;
  label: string;
  /** priečinok v api.open-meteo.com/data/<metaId>/static/meta.json (beh modelu) */
  metaId: string;
  /** model má vrstvy oblačnosti a zrážky */
  hasCloudsAndPrecip: boolean;
  /** farba čiary v porovnaní modelov */
  color: string;
}

export const POINT_MODELS: readonly PointModel[] = [
  { id: "icon_eu", label: "ICON-EU", metaId: "dwd_icon_eu", hasCloudsAndPrecip: true, color: "#1f77b4" },
  { id: "chmi_aladin_central_europe_2km", label: "ALADIN 2 km", metaId: "chmi_aladin_central_europe_2km", hasCloudsAndPrecip: true, color: "#e377c2" },
  { id: "icon_d2", label: "ICON-D2", metaId: "dwd_icon_d2", hasCloudsAndPrecip: true, color: "#17becf" },
  { id: "icon_global", label: "ICON global", metaId: "dwd_icon", hasCloudsAndPrecip: true, color: "#9467bd" },
  { id: "ecmwf_ifs025", label: "ECMWF IFS 0,25°", metaId: "ecmwf_ifs025", hasCloudsAndPrecip: true, color: "#d62728" },
  { id: "gfs025", label: "GFS 0,25°", metaId: "ncep_gfs025", hasCloudsAndPrecip: false, color: "#ff7f0e" },
  { id: "meteofrance_arpege_europe", label: "ARPEGE Europe", metaId: "meteofrance_arpege_europe", hasCloudsAndPrecip: true, color: "#2ca02c" },
  { id: "ukmo_global_deterministic_10km", label: "UKMO 10 km", metaId: "ukmo_global_deterministic_10km", hasCloudsAndPrecip: true, color: "#8c564b" },
];

export function getPointModel(id: string): PointModel {
  return POINT_MODELS.find((m) => m.id === id) ?? POINT_MODELS[0]!;
}

/** Mapový model → predvolený model pre bodové nástroje */
export function pointModelForMap(mapModelId: string): string {
  if (mapModelId === "aladin_ce") return "chmi_aladin_central_europe_2km";
  return POINT_MODELS.some((m) => m.id === mapModelId) ? mapModelId : "icon_eu";
}
