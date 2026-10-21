// Register modelov. `spatialId` = názov priečinka v s3://openmeteo/data_spatial/
// (overené 2026-10-21, pozri docs/rozhodnutia.md).

export interface ModelDef {
  id: string;
  /** Krátky názov do UI */
  label: string;
  /** Priečinok v Open-Meteo data_spatial */
  spatialId: string;
  /** Poskytovateľ dát pre atribúciu */
  provider: "DWD" | "ECMWF" | "NOAA" | "Météo-France";
  /** Natívne rozlíšenie (stupne) */
  resolutionDeg: number;
  /** Zatiaľ podporovaný vo výbere (ostatné prídu vo Fáze 3) */
  enabled: boolean;
}

export const MODELS: readonly ModelDef[] = [
  { id: "icon_eu", label: "ICON-EU", spatialId: "dwd_icon_eu", provider: "DWD", resolutionDeg: 0.0625, enabled: true },
  { id: "icon_d2", label: "ICON-D2", spatialId: "dwd_icon_d2", provider: "DWD", resolutionDeg: 0.02, enabled: false },
  { id: "ecmwf_ifs025", label: "ECMWF IFS 0,25°", spatialId: "ecmwf_ifs025", provider: "ECMWF", resolutionDeg: 0.25, enabled: false },
  { id: "gfs025", label: "GFS 0,25°", spatialId: "ncep_gfs025", provider: "NOAA", resolutionDeg: 0.25, enabled: false },
];

export const DEFAULT_MODEL_ID = "icon_eu";

export function getModel(id: string): ModelDef {
  const m = MODELS.find((x) => x.id === id);
  if (!m) throw new Error(`Neznámy model: ${id}`);
  return m;
}
