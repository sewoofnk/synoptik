// Prepojenie stavu aplikácie s mapou: načítanie polí, WebGL vrstvy, izočiary, popisok pod kurzorom,
// prednačítanie susedných krokov a prehrávanie.

import { effect, untracked } from "@preact/signals";
import type { Map as MlMap } from "maplibre-gl";
import { COLOR_SCALES } from "../config/colorscales";
import { ISOBARS, overlaySources, sourceVariables, type FieldSource, type Level, type ResolvedLayer } from "../config/layers.config";
import { loadField, loadSource, MissingVariableError, type Field } from "../data/fieldLoader";
import { sampleBilinear } from "../data/grid";
import type { RunInfo } from "../data/openMeteoSpatial";
import type { Step } from "../data/timeline";
import { formatValue, type UnitSettings } from "../lib/units";
import {
  currentStep,
  cursor,
  fieldStatus,
  layer,
  obsStatus,
  level,
  overlays,
  particleDensity,
  playing,
  playSpeed,
  point,
  resolveRun,
  setTimeIndex,
  steps,
  timeIndex,
  units,
} from "../state/store";
import { fetchMetar, fetchSynop } from "../data/obs";
import { ContourOverlay, type ContourSpec } from "./contourOverlay";
import { isObsHit, ObsOverlay } from "./obsOverlay";
import { RadarOverlay } from "./radarOverlay";
import { FieldLayer } from "./fieldLayer";
import { WindParticlesLayer } from "./windParticles";

const FIELD_ID = "wx-field";
const PARTICLES_ID = "wx-particles";
/** Koľko krokov dopredu prednačítať (pri prehrávaní viac) */
const PREFETCH_AHEAD = 3;
const PREFETCH_AHEAD_PLAYING = 6;

/** Výška pre popisok izohypsy: v metrických jednotkách dekametre (zvyk synoptických máp), inak stopy */
function heightLabel(v: number, u: UnitSettings): string {
  return u.height === "m" ? (v / 10).toFixed(0) : formatValue("height", v, u);
}

/** Interval izohyps: 4 dam do 500 hPa, 8 dam vyššie */
function isohypseInterval(l: Level): number {
  return l !== "sfc" && l < 500 ? 80 : 40;
}

/** Všetko, čo treba pre jeden krok časovej osi (krok môže byť z minulého behu) */
async function loadStep(step: Step, l: ResolvedLayer, lv: Level, ov: string[]): Promise<unknown> {
  const run = await resolveRun(step.ref);
  const t = step.t;
  const src = overlaySources(l, lv);
  const jobs: Promise<unknown>[] = [loadSource(run, t, l.source)];
  if (ov.includes("isobars")) jobs.push(loadOptional(run, t, src.isolines));
  if (ov.includes("isotherms")) jobs.push(loadOptional(run, t, src.isotherms));
  if (ov.includes("particles")) jobs.push(loadField(run, t, src.wind.u), loadField(run, t, src.wind.v));
  return Promise.all(jobs);
}

/** Načíta pole, ak ho beh má; inak null (prekrytie sa skryje) */
async function loadOptional(run: RunInfo, t: Date, src: FieldSource): Promise<Field | null> {
  if (!sourceVariables(src).every((v) => run.variables.includes(v))) return null;
  try {
    return await loadSource(run, t, src);
  } catch (e) {
    if (e instanceof MissingVariableError) return null;
    throw e;
  }
}

export class MapController {
  private field = new FieldLayer(FIELD_ID);
  private particles = new WindParticlesLayer(PARTICLES_ID);
  private obs: ObsOverlay;
  private radar: RadarOverlay;
  private isolines: ContourOverlay;
  private isotherms: ContourOverlay;
  private currentField: Field | null = null;
  private disposers: (() => void)[] = [];
  private lastMouse: { lng: number; lat: number; x: number; y: number } | null = null;

  constructor(private map: MlMap) {
    this.obs = new ObsOverlay(map);
    this.radar = new RadarOverlay(map);
    this.isolines = new ContourOverlay(map, "wx-isolines", {
      color: (dark) => (dark ? "rgba(235,238,242,0.85)" : "rgba(25,30,40,0.8)"),
    });
    // izotermy: pod nulou modré, nad nulou červené, 0 °C hrubá
    this.isotherms = new ContourOverlay(map, "wx-isotherms", {
      color: (dark) => ["case", ["<", ["get", "v"], 273.14], dark ? "#7fb2ff" : "#1f5fd1", dark ? "#ff8a7a" : "#c8281e"],
      dashed: true,
      width: 1.1,
    });

    map.on("style.load", () => this.addLayers());
    if (map.isStyleLoaded()) this.addLayers();

    map.on("mousemove", (e) => {
      this.lastMouse = { lng: e.lngLat.lng, lat: e.lngLat.lat, x: e.point.x, y: e.point.y };
      this.updateCursor();
    });
    // klik → bodové nástroje v pravom paneli
    map.on("click", (e) => {
      // klik na stanicu otvorí jej správu, nie bodovú predpoveď
      if (isObsHit(map, e.point)) return;
      point.value = { lat: e.lngLat.lat, lon: e.lngLat.lng };
    });
    map.on("mouseout", () => {
      this.lastMouse = null;
      cursor.value = null;
    });

    this.disposers.push(
      effect(() => void this.syncField()),
      effect(() => void this.syncParticles()),
      // plocha na časticu: nízka / stredná / vysoká hustota
      effect(() => this.particles.setDensity({ low: 140, medium: 75, high: 35 }[particleDensity.value])),
      effect(() => void this.syncIsolines()),
      effect(() => void this.syncIsotherms()),
      // zmena jednotiek → iba popisky izočiar
      effect(() => {
        const u = units.value;
        this.isolines.relabel(u);
        this.isotherms.relabel(u);
        this.obs.setUnits(u);
      }),
      effect(() => this.prefetch()),
      effect(() => this.playLoop()),
      effect(() => this.syncObs("metar")),
      effect(() => this.syncObs("synop")),
    );
  }

  dispose() {
    this.disposers.forEach((d) => d());
    this.isolines.dispose();
    this.isotherms.dispose();
    this.obs.dispose();
    this.radar.dispose();
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
    // radar pod izočiarami a časticami, nad farebným poľom
    this.radar.addLayers(firstSymbol);
    this.isotherms.addLayers(firstSymbol, dark);
    this.isolines.addLayers(firstSymbol, dark);
    if (!map.getLayer(PARTICLES_ID)) map.addLayer(this.particles, firstSymbol);
    // pozorovania navrchu (nad popiskami podkladu)
    this.obs.addLayers(undefined, dark);
  }

  private async syncField() {
    const step = currentStep.value;
    const l = layer.value;
    if (!step) return;
    const stale = () => step !== currentStep.value || l !== layer.value;
    fieldStatus.value = { loading: true, error: null };
    try {
      const run = await resolveRun(step.ref);
      if (stale()) return;
      const missing = sourceVariables(l.source).filter((v) => !run.variables.includes(v));
      if (missing.length) {
        this.clearField(l);
        fieldStatus.value = { loading: false, error: `Model nemá premennú ${missing.join(", ")}` };
        return;
      }
      const f = await loadSource(run, step.t, l.source);
      // medzitým sa výber zmenil → ignorovať
      if (stale()) return;
      this.currentField = f;
      this.field.setField(f, COLOR_SCALES[l.scale]!);
      fieldStatus.value = { loading: false, error: null };
      this.updateCursor();
    } catch (e) {
      if (stale()) return;
      // nikdy nenechať na mape staré pole pod novým časom
      this.clearField(l);
      fieldStatus.value =
        e instanceof MissingVariableError
          ? { loading: false, error: null, note: `${l.label}: v tomto kroku nie je` }
          : { loading: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  private clearField(l: ResolvedLayer) {
    this.currentField = null;
    this.field.setField(null, COLOR_SCALES[l.scale]!);
    cursor.value = null;
  }

  private async syncParticles() {
    const step = currentStep.value;
    const lv = level.value;
    const on = overlays.value.includes("particles");
    if (!on || !step) {
      this.particles.setWind(null, null);
      return;
    }
    const { u: uVar, v: vVar } = overlaySources(layer.value, lv).wind;
    // vo výške je vietor 3–5× silnejší → pomalšie častice, aby boli čitateľné
    this.particles.speedFactor = lv === "sfc" || lv >= 700 ? 0.12 : 0.05;
    try {
      const run = await resolveRun(step.ref);
      const [u, v] = await Promise.all([loadField(run, step.t, uVar), loadField(run, step.t, vVar)]);
      if (step !== currentStep.value || lv !== level.value || !overlays.value.includes("particles")) return;
      this.particles.setWind(u, v);
    } catch (e) {
      if (step !== currentStep.value) return;
      this.particles.setWind(null, null);
      if (!(e instanceof MissingVariableError)) console.error("Častice:", e);
    }
  }

  /**
   * Pozorovania: načítať pri zapnutí a obnovovať (METAR 10 min, SYNOP 30 min – zdroje sa
   * aj tak cachujú v Pages Function). Nezávisia od modelu ani času mapy.
   */
  private syncObs(kind: "metar" | "synop") {
    const on = overlays.value.includes(kind);
    if (!on) {
      if (kind === "metar") this.obs.setMetar(null);
      else this.obs.setSynop(null);
      const { [kind]: _, ...rest } = obsStatus.peek();
      obsStatus.value = rest;
      return;
    }
    let stopped = false;
    const load = () => {
      const p =
        kind === "metar"
          ? fetchMetar().then((d) => {
              if (stopped) return;
              this.obs.setMetar(d.obs);
              const time = d.obs.reduce((m, o) => Math.max(m, o.time), 0);
              obsStatus.value = { ...obsStatus.peek(), metar: { time, count: d.obs.length }, error: undefined };
            })
          : fetchSynop().then((d) => {
              if (stopped) return;
              this.obs.setSynop(d.stations);
              obsStatus.value = { ...obsStatus.peek(), synop: { term: d.term, count: d.stations.length }, error: undefined };
            });
      p.catch((e: unknown) => {
        if (stopped) return;
        obsStatus.value = { ...obsStatus.peek(), error: `${kind.toUpperCase()}: ${e instanceof Error ? e.message : String(e)}` };
      });
    };
    untracked(load);
    const timer = setInterval(load, kind === "metar" ? 10 * 60_000 : 30 * 60_000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }

  /** Izobary (povrch), izohypsy (hladina) alebo vlastné izočiary vrstvy (relatívna topografia) */
  private async syncIsolines() {
    const step = currentStep.value;
    const l = layer.value;
    const lv = level.value;
    const u = units.peek();
    if (!overlays.value.includes("isobars") || !step) return this.isolines.update(null, u);
    try {
      const run = await resolveRun(step.ref);
      const field = await loadOptional(run, step.t, overlaySources(l, lv).isolines);
      if (step !== currentStep.value || l !== layer.value || lv !== level.value) return;
      if (!field) return this.isolines.update(null, u);
      let spec: ContourSpec;
      if (l.contours) {
        spec = { field, interval: l.contours.interval, major: l.contours.major, label: heightLabel };
      } else if (lv === "sfc") {
        spec = {
          field,
          interval: ISOBARS.intervalPa,
          major: [...ISOBARS.majorPa],
          label: (v, us) => formatValue("pressure", v, us, us.pressure === "inHg" ? 2 : 0),
        };
      } else {
        spec = { field, interval: isohypseInterval(lv), label: heightLabel };
      }
      this.isolines.update(spec, units.peek());
    } catch (e) {
      if (step !== currentStep.value) return;
      this.isolines.update(null, u);
      console.error("Izočiary:", e);
    }
  }

  private async syncIsotherms() {
    const step = currentStep.value;
    const lv = level.value;
    const l = layer.value;
    const u = units.peek();
    if (!overlays.value.includes("isotherms") || !step) return this.isotherms.update(null, u);
    try {
      const run = await resolveRun(step.ref);
      const field = await loadOptional(run, step.t, overlaySources(l, lv).isotherms);
      if (step !== currentStep.value || lv !== level.value) return;
      if (!field) return this.isotherms.update(null, u);
      this.isotherms.update(
        { field, interval: 5, major: [273.15], label: (v, us) => formatValue("temperature", v, us, 0) },
        units.peek(),
      );
    } catch (e) {
      if (step !== currentStep.value) return;
      this.isotherms.update(null, u);
      console.error("Izotermy:", e);
    }
  }

  private updateCursor() {
    const f = this.currentField;
    const m = this.lastMouse;
    if (!f || !m) return;
    cursor.value = { lat: m.lat, lon: m.lng, x: m.x, y: m.y, value: sampleBilinear(f.grid, f.data, m.lat, m.lng) };
  }

  /** Prednačítať nasledujúce kroky (a predošlý) súbežne, až keď je aktuálny hotový */
  private prefetch() {
    const all = steps.value;
    const i = timeIndex.value;
    const l = layer.value;
    const lv = level.value;
    const ov = overlays.value;
    const ahead = playing.value ? PREFETCH_AHEAD_PLAYING : PREFETCH_AHEAD;
    if (i < 0) return;
    const n = all.length;
    // pri prehrávaní sa za koncom pokračuje od začiatku
    const idx = Array.from({ length: ahead }, (_, k) => (playing.value ? (i + 1 + k) % n : i + 1 + k));
    if (!playing.value) idx.push(i - 1);
    const next = [...new Set(idx)].filter((k) => k >= 0 && k < n && k !== i);
    void loadStep(all[i]!, l, lv, ov)
      .then(() => {
        if (all !== steps.value) return;
        return Promise.all(next.map((k) => loadStep(all[k]!, l, lv, ov).catch(() => undefined)));
      })
      .catch(() => undefined);
  }

  /** Prehrávanie: ďalší krok až keď sú jeho dáta načítané a uplynul interval */
  private playLoop() {
    if (!playing.value) return;
    let stopped = false;
    const run = async () => {
      while (!stopped && playing.value) {
        const all = steps.value;
        if (all.length === 0) return;
        const next = timeIndex.value + 1 >= all.length ? 0 : timeIndex.value + 1;
        const started = performance.now();
        await loadStep(all[next]!, layer.value, level.value, overlays.value).catch(() => undefined);
        const wait = 1000 / playSpeed.value - (performance.now() - started);
        if (wait > 0) await new Promise((res) => setTimeout(res, wait));
        if (stopped || !playing.value || all !== steps.value) return;
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
