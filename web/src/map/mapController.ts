// Prepojenie stavu aplikácie s mapou: načítanie polí, WebGL vrstvy, izobary, popisok pod kurzorom,
// prednačítanie susedných krokov a prehrávanie.

import { effect, untracked } from "@preact/signals";
import type { GeoJSONSource, Map as MlMap } from "maplibre-gl";
import { COLOR_SCALES } from "../config/colorscales";
import { ISOBARS, sourceVariables, type LayerDef } from "../config/layers.config";
import { loadField, loadSpeed, MissingVariableError, type Field } from "../data/fieldLoader";
import { sampleBilinear } from "../data/grid";
import type { RunInfo } from "../data/openMeteoSpatial";
import { formatValue } from "../lib/units";
import {
  cursor,
  fieldStatus,
  layer,
  overlays,
  playing,
  playSpeed,
  runInfo,
  setTimeIndex,
  timeIndex,
  units,
} from "../state/store";
import type { ContourFeature } from "../workers/contours";
import ContourWorker from "../workers/contour.worker?worker";
import { FieldLayer } from "./fieldLayer";
import { WindParticlesLayer } from "./windParticles";

const FIELD_ID = "wx-field";
const PARTICLES_ID = "wx-particles";
const ISOBAR_SRC = "wx-isobars";
/** Koľko krokov dopredu prednačítať (pri prehrávaní viac) */
const PREFETCH_AHEAD = 3;
const PREFETCH_AHEAD_PLAYING = 6;

function loadLayerField(l: LayerDef, run: RunInfo, t: Date): Promise<Field> {
  return l.source.kind === "scalar" ? loadField(run, t, l.source.variable) : loadSpeed(run, t, l.source.u, l.source.v);
}

/** Všetko, čo treba pre jeden časový krok pri aktuálnom výbere vrstiev */
function loadStep(run: RunInfo, t: Date, l: LayerDef, ov: string[]): Promise<unknown> {
  const jobs: Promise<unknown>[] = [loadLayerField(l, run, t)];
  if (ov.includes("isobars")) jobs.push(loadField(run, t, "pressure_msl"));
  if (ov.includes("particles")) {
    jobs.push(loadField(run, t, "wind_u_component_10m"), loadField(run, t, "wind_v_component_10m"));
  }
  return Promise.all(jobs);
}

export class MapController {
  private field = new FieldLayer(FIELD_ID);
  private particles = new WindParticlesLayer(PARTICLES_ID);
  private worker = new ContourWorker();
  private contourSeq = 0;
  private isobarFeatures: ContourFeature[] = [];
  private currentField: Field | null = null;
  private disposers: (() => void)[] = [];
  private lastMouse: { lng: number; lat: number; x: number; y: number } | null = null;

  constructor(private map: MlMap) {
    this.worker.onmessage = (e: MessageEvent<{ id: number; features?: ContourFeature[]; error?: string }>) => {
      if (e.data.id !== this.contourSeq) return; // zastaraný výsledok
      if (e.data.error) console.error("Izobary:", e.data.error);
      this.isobarFeatures = e.data.features ?? [];
      this.updateIsobarSource();
    };

    map.on("style.load", () => this.addLayers());
    if (map.isStyleLoaded()) this.addLayers();

    map.on("mousemove", (e) => {
      this.lastMouse = { lng: e.lngLat.lng, lat: e.lngLat.lat, x: e.point.x, y: e.point.y };
      this.updateCursor();
    });
    map.on("mouseout", () => {
      this.lastMouse = null;
      cursor.value = null;
    });

    this.disposers.push(
      effect(() => void this.syncField()),
      effect(() => void this.syncParticles()),
      effect(() => void this.syncIsobars()),
      // zmena jednotiek → popisky izobár
      effect(() => {
        void units.value;
        this.updateIsobarSource();
      }),
      effect(() => this.prefetch()),
      effect(() => this.playLoop()),
    );
  }

  dispose() {
    this.disposers.forEach((d) => d());
    this.worker.terminate();
  }

  /**
   * Poradie (po každej zmene štýlu): pole pod hranicami štátov; izobary a častice pod popiskami
   * podkladu; popisky izobár navrchu.
   */
  private addLayers() {
    const map = this.map;
    const layers = map.getStyle().layers ?? [];
    const firstSymbol = layers.find((l) => l.type === "symbol")?.id;
    const beforeField = layers.find((l) => l.type === "symbol" || l.id.startsWith("boundary"))?.id;
    if (!map.getLayer(FIELD_ID)) map.addLayer(this.field, beforeField);
    if (!map.getSource(ISOBAR_SRC)) {
      map.addSource(ISOBAR_SRC, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    }
    const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    // popisky tmavého štýlu OpenFreeMap (tmavosivé) sú na farebnom poli nečitateľné
    if (dark) {
      for (const l of layers) {
        if (l.type !== "symbol" || !l.layout?.["text-field"]) continue;
        map.setPaintProperty(l.id, "text-color", "#e3e8ee");
        map.setPaintProperty(l.id, "text-halo-color", "rgba(8,10,14,0.85)");
        map.setPaintProperty(l.id, "text-halo-width", 1.3);
      }
    }
    const lineColor = dark ? "rgba(235,238,242,0.85)" : "rgba(25,30,40,0.8)";
    const haloColor = dark ? "rgba(14,17,22,0.9)" : "rgba(255,255,255,0.9)";
    if (!map.getLayer("wx-isobars-line")) {
      map.addLayer({
        id: "wx-isobars-line",
        type: "line",
        source: ISOBAR_SRC,
        paint: {
          "line-color": lineColor,
          "line-width": ["case", ["get", "major"], 2.2, 1],
        },
        layout: { "line-join": "round", "line-cap": "round" },
      }, firstSymbol);
    }
    if (!map.getLayer(PARTICLES_ID)) map.addLayer(this.particles, firstSymbol);
    if (!map.getLayer("wx-isobars-label")) {
      map.addLayer({
        id: "wx-isobars-label",
        type: "symbol",
        source: ISOBAR_SRC,
        layout: {
          "symbol-placement": "line",
          "symbol-spacing": 350,
          "text-field": ["get", "label"],
          "text-font": ["Noto Sans Regular"],
          "text-size": 11,
          "text-max-angle": 30,
          "text-keep-upright": true,
        },
        paint: { "text-color": lineColor, "text-halo-color": haloColor, "text-halo-width": 1.5 },
      });
    }
    this.updateIsobarSource();
  }

  private async syncField() {
    const run = runInfo.value;
    const i = timeIndex.value;
    const l = layer.value;
    if (!run || i < 0) return;
    const t = run.validTimes[i]!;
    const missing = sourceVariables(l.source).filter((v) => !run.variables.includes(v));
    if (missing.length) {
      this.currentField = null;
      this.field.setField(null, COLOR_SCALES[l.scale]!);
      fieldStatus.value = { loading: false, error: `Model nemá premennú ${missing.join(", ")}` };
      return;
    }
    fieldStatus.value = { loading: true, error: null };
    try {
      const f = await loadLayerField(l, run, t);
      // medzitým sa výber zmenil → ignorovať
      if (run !== runInfo.value || i !== timeIndex.value || l !== layer.value) return;
      this.currentField = f;
      this.field.setField(f, COLOR_SCALES[l.scale]!);
      fieldStatus.value = { loading: false, error: null };
      this.updateCursor();
    } catch (e) {
      if (run !== runInfo.value || i !== timeIndex.value || l !== layer.value) return;
      // nikdy nenechať na mape staré pole pod novým časom
      this.currentField = null;
      this.field.setField(null, COLOR_SCALES[l.scale]!);
      cursor.value = null;
      fieldStatus.value =
        e instanceof MissingVariableError
          ? { loading: false, error: null, note: `${l.label}: v tomto kroku nie je` }
          : { loading: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  private async syncParticles() {
    const run = runInfo.value;
    const i = timeIndex.value;
    const on = overlays.value.includes("particles");
    if (!on || !run || i < 0) {
      this.particles.setWind(null, null);
      return;
    }
    const t = run.validTimes[i]!;
    try {
      const [u, v] = await Promise.all([
        loadField(run, t, "wind_u_component_10m"),
        loadField(run, t, "wind_v_component_10m"),
      ]);
      if (run !== runInfo.value || i !== timeIndex.value || !overlays.value.includes("particles")) return;
      this.particles.setWind(u, v);
    } catch (e) {
      if (run !== runInfo.value || i !== timeIndex.value) return;
      this.particles.setWind(null, null);
      if (!(e instanceof MissingVariableError)) console.error("Častice:", e);
    }
  }

  private async syncIsobars() {
    const run = runInfo.value;
    const i = timeIndex.value;
    const on = overlays.value.includes("isobars");
    const id = ++this.contourSeq;
    if (!on || !run || i < 0) {
      this.isobarFeatures = [];
      this.updateIsobarSource();
      return;
    }
    try {
      const p = await loadField(run, run.validTimes[i]!, "pressure_msl");
      if (id !== this.contourSeq) return;
      // kópia – originál ostáva v cache
      const data = p.data.slice();
      this.worker.postMessage({ id, data, grid: p.grid, interval: ISOBARS.intervalPa, factor: 2 }, [data.buffer]);
    } catch (e) {
      if (id !== this.contourSeq) return;
      this.isobarFeatures = [];
      this.updateIsobarSource();
      if (!(e instanceof MissingVariableError)) console.error("Izobary:", e);
    }
  }

  private updateIsobarSource() {
    const src = this.map.getSource(ISOBAR_SRC) as GeoJSONSource | undefined;
    if (!src) return;
    const u = units.value;
    src.setData({
      type: "FeatureCollection",
      features: this.isobarFeatures.map((f) => ({
        ...f,
        properties: {
          ...f.properties,
          major: (ISOBARS.majorPa as readonly number[]).includes(f.properties.v),
          label: formatValue("pressure", f.properties.v, u, u.pressure === "inHg" ? 2 : 0),
        },
      })),
    });
  }

  private updateCursor() {
    const f = this.currentField;
    const m = this.lastMouse;
    if (!f || !m) return;
    cursor.value = { lat: m.lat, lon: m.lng, x: m.x, y: m.y, value: sampleBilinear(f.grid, f.data, m.lat, m.lng) };
  }

  /** Prednačítať nasledujúce kroky (a predošlý) súbežne, až keď je aktuálny hotový */
  private prefetch() {
    const run = runInfo.value;
    const i = timeIndex.value;
    const l = layer.value;
    const ov = overlays.value;
    const ahead = playing.value ? PREFETCH_AHEAD_PLAYING : PREFETCH_AHEAD;
    if (!run || i < 0) return;
    const n = run.validTimes.length;
    // pri prehrávaní sa za koncom pokračuje od začiatku
    const idx = Array.from({ length: ahead }, (_, k) => (playing.value ? (i + 1 + k) % n : i + 1 + k));
    if (!playing.value) idx.push(i - 1);
    const steps = [...new Set(idx)].filter((k) => k >= 0 && k < n && k !== i);
    void loadStep(run, run.validTimes[i]!, l, ov)
      .then(() => {
        if (run !== runInfo.value) return;
        return Promise.all(steps.map((k) => loadStep(run, run.validTimes[k]!, l, ov).catch(() => undefined)));
      })
      .catch(() => undefined);
  }

  /** Prehrávanie: ďalší krok až keď sú jeho dáta načítané a uplynul interval */
  private playLoop() {
    if (!playing.value) return;
    let stopped = false;
    const run = async () => {
      while (!stopped && playing.value) {
        const r = runInfo.value;
        if (!r) return;
        const next = timeIndex.value + 1 >= r.validTimes.length ? 0 : timeIndex.value + 1;
        const started = performance.now();
        await loadStep(r, r.validTimes[next]!, layer.value, overlays.value).catch(() => undefined);
        const wait = 1000 / playSpeed.value - (performance.now() - started);
        if (wait > 0) await new Promise((res) => setTimeout(res, wait));
        if (stopped || !playing.value || r !== runInfo.value) return;
        setTimeIndex(next);
      }
    };
    // slučka číta signály – nesmie ich sledovať efekt (reštartoval by sa pri každom kroku)
    untracked(() => void run());
    return () => {
      stopped = true;
    };
  }
}
