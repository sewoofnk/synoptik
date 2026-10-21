// Prekrytie izočiar (izobary, izohypsy, izotermy, relatívna topografia): výpočet vo Web Workeri,
// vykreslenie ako GeoJSON čiary s popiskami pozdĺž čiary.

import type { ExpressionSpecification, GeoJSONSource, Map as MlMap } from "maplibre-gl";
import type { Field } from "../data/fieldLoader";
import type { UnitSettings } from "../lib/units";
import type { ContourFeature } from "../workers/contours";
import ContourWorker from "../workers/contour.worker?worker";

export interface ContourSpec {
  field: Field;
  /** Interval v SI */
  interval: number;
  /** Zvýraznené hodnoty v SI */
  major?: number[];
  /** Popisok čiary v aktuálnych jednotkách */
  label: (v: number, u: UnitSettings) => string;
}

export interface ContourStyle {
  /** Farba čiary; výraz MapLibre môže použiť vlastnosť `v` (hodnota v SI) */
  color: (dark: boolean) => string | ExpressionSpecification;
  dashed?: boolean;
  width?: number;
}

export class ContourOverlay {
  private worker = new ContourWorker();
  private seq = 0;
  private features: ContourFeature[] = [];
  private spec: ContourSpec | null = null;
  private units: UnitSettings | null = null;

  constructor(
    private map: MlMap,
    private id: string,
    private style: ContourStyle,
  ) {
    this.worker.onmessage = (e: MessageEvent<{ id: number; features?: ContourFeature[]; error?: string }>) => {
      if (e.data.id !== this.seq) return; // zastaraný výsledok
      if (e.data.error) console.error(`Izočiary ${this.id}:`, e.data.error);
      this.features = e.data.features ?? [];
      this.render();
    };
  }

  /** Pridá zdroj a vrstvy (po každej zmene štýlu mapy) */
  addLayers(beforeLine: string | undefined, dark: boolean) {
    const map = this.map;
    const src = `${this.id}-src`;
    if (!map.getSource(src)) map.addSource(src, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    const color = this.style.color(dark);
    const halo = dark ? "rgba(14,17,22,0.9)" : "rgba(255,255,255,0.9)";
    const w = this.style.width ?? 1;
    if (!map.getLayer(`${this.id}-line`)) {
      map.addLayer(
        {
          id: `${this.id}-line`,
          type: "line",
          source: src,
          paint: {
            "line-color": color,
            "line-width": ["case", ["get", "major"], w * 2.2, w],
            ...(this.style.dashed ? { "line-dasharray": [3, 2] } : {}),
          },
          layout: { "line-join": "round", "line-cap": "round" },
        },
        beforeLine,
      );
    }
    if (!map.getLayer(`${this.id}-label`)) {
      map.addLayer({
        id: `${this.id}-label`,
        type: "symbol",
        source: src,
        layout: {
          "symbol-placement": "line",
          "symbol-spacing": 350,
          "text-field": ["get", "label"],
          "text-font": ["Noto Sans Regular"],
          "text-size": 11,
          "text-max-angle": 30,
          "text-keep-upright": true,
        },
        paint: { "text-color": color, "text-halo-color": halo, "text-halo-width": 1.5 },
      });
    }
    this.render();
  }

  /** Nové pole (null = skryť). Faktor zriedenia podľa rozlíšenia: cieľ ~0,125° */
  update(spec: ContourSpec | null, units: UnitSettings) {
    const id = ++this.seq;
    this.spec = spec;
    this.units = units;
    if (!spec) {
      this.features = [];
      this.render();
      return;
    }
    const factor = Math.max(1, Math.round(0.125 / spec.field.grid.dlat));
    // kópia – originál ostáva v cache polí
    const data = spec.field.data.slice();
    this.worker.postMessage({ id, data, grid: spec.field.grid, interval: spec.interval, factor }, [data.buffer]);
  }

  /** Zmena jednotiek → iba nové popisky */
  relabel(units: UnitSettings) {
    this.units = units;
    this.render();
  }

  private render() {
    const src = this.map.getSource(`${this.id}-src`) as GeoJSONSource | undefined;
    if (!src) return;
    const spec = this.spec;
    const u = this.units;
    src.setData({
      type: "FeatureCollection",
      features:
        spec && u
          ? this.features.map((f) => ({
              ...f,
              properties: {
                ...f.properties,
                major: spec.major?.some((m) => Math.abs(m - f.properties.v) < 1e-6) ?? false,
                label: spec.label(f.properties.v, u),
              },
            }))
          : [],
    });
  }

  dispose() {
    this.worker.terminate();
  }
}
