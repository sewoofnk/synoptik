// Centrálny stav aplikácie (Preact signals). Pohľad sa zrkadlí do URL hash a localStorage,
// jednotky iba do localStorage.

import { batch, computed, effect, signal, untracked } from "@preact/signals";
import { DEFAULT_LAYER_ID, getLayer, LEVELS, resolveLayer, type Level, type OverlayId } from "../config/layers.config";
import { DEFAULT_MODEL_ID, getModel, MODELS, type ModelDef } from "../config/models";
import { pointModelForMap } from "../config/pointModels";
import { combineRuns, fetchLatestRun, fetchRunMeta, listRuns, type RunInfo } from "../data/openMeteoSpatial";
import { buildTimeline, nearestStepIndex, type Step } from "../data/timeline";
import { isUnitSettings, PRESETS, type UnitSettings } from "../lib/units";
import { DEFAULT_BORDERS, isBorderSettings, type BorderSettings } from "../map/borders";
import { decodeHash, encodeHash, type ViewState } from "./viewState";

const LS_VIEW = "synoptik.view";
const LS_UNITS = "synoptik.units";
const LS_BORDERS = "synoptik.borders";
const LS_PARTICLES = "synoptik.particles";

const DEFAULT_VIEW: ViewState = {
  model: DEFAULT_MODEL_ID,
  run: null,
  layer: DEFAULT_LAYER_ID,
  level: "sfc",
  overlays: ["isobars"],
  time: null,
  // predvolene Slovensko (záujmová oblasť vlastníka), Európa ostáva v dohľade
  center: [19.6, 48.7],
  zoom: 5.4,
};

function readLocal<T>(key: string): T | null {
  try {
    const s = localStorage.getItem(key);
    return s ? (JSON.parse(s) as T) : null;
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // súkromné okno / plné úložisko – stav sa iba neuloží
  }
}

// Poradie priority: URL hash > localStorage > predvolené
function initialView(): ViewState {
  const stored = readLocal<string>(LS_VIEW);
  const fromStorage = stored ? decodeHash(stored, DEFAULT_VIEW) : DEFAULT_VIEW;
  const v = location.hash.length > 1 ? decodeHash(location.hash, fromStorage) : fromStorage;
  // neznámy/nepodporovaný model alebo vrstva → predvolené
  if (!MODELS.some((m) => m.id === v.model && m.enabled)) v.model = DEFAULT_MODEL_ID;
  v.layer = getLayer(v.layer)?.id ?? DEFAULT_LAYER_ID;
  return v;
}

const init = initialView();
const storedUnits = readLocal<unknown>(LS_UNITS);

export const modelId = signal(init.model);
/** Vybraný beh (ISO) alebo null = najnovší */
export const runChoice = signal<string | null>(init.run);
export const layerId = signal(init.layer);
/** Zvolená hladina; vrstvy bez variantu pre hladinu sa kreslia pri povrchu */
export const level = signal<Level>(init.level);
export const overlays = signal<OverlayId[]>(init.overlays);
/** Vybraný čas platnosti (ISO); null = najbližšie k teraz */
export const timeIso = signal<string | null>(init.time);
export const mapView = signal({ center: init.center, zoom: init.zoom });
export const units = signal<UnitSettings>(isUnitSettings(storedUnits) ? storedUnits : { ...PRESETS.metric });
const storedBorders = readLocal<unknown>(LS_BORDERS);
/** Farba a hrúbka hraníc štátov (nastavenie v menu) */
export const borders = signal<BorderSettings>(isBorderSettings(storedBorders) ? storedBorders : { ...DEFAULT_BORDERS });
export type ParticleDensity = "low" | "medium" | "high";
const storedDensity = readLocal<string>(LS_PARTICLES);
/** Hustota animácie vetra (nastavenie v menu) */
export const particleDensity = signal<ParticleDensity>(
  storedDensity === "low" || storedDensity === "high" ? storedDensity : "medium",
);

export const playing = signal(false);
/** Krokov za sekundu */
export const playSpeed = signal(2);

export const runs = signal<Date[]>([]);
export const runInfo = signal<RunInfo | null>(null);
export const runError = signal<string | null>(null);
/** Stav načítania poľa (nastavuje mapa); note = neutrálna informácia, napr. pole v kroku chýba */
export const fieldStatus = signal<{ loading: boolean; error: string | null; note?: string }>({ loading: false, error: null });
/** Hodnota pod kurzorom (nastavuje mapa) */
export const cursor = signal<{ lat: number; lon: number; value: number; x: number; y: number } | null>(null);

/** Hlavné menu (vrstvy, nastavenia) */
export const menuOpen = signal(false);

/** Bod vybraný klikom na mapu (pravý panel) */
export const point = signal<{ lat: number; lon: number } | null>(null);
export type PointTab = "basic" | "meteogram" | "wind" | "airgram" | "air" | "skewt" | "compare" | "ensemble";
export const pointTab = signal<PointTab>("basic");
/** Model pre meteogram a Skew-T; predvolene podľa mapového modelu */
export const pointModelId = signal(pointModelForMap(init.model));

export const model = computed(() => getModel(modelId.value));
/** Vrstva vyriešená pre zvolenú hladinu (zdroj, škála, názov s hladinou) */
export const layer = computed(() => resolveLayer(getLayer(layerId.value)!, level.value));

/** Teraz – obnovuje sa každých 10 min (posúva začiatok histórie) */
const nowTick = signal(Date.now());
setInterval(() => (nowTick.value = Date.now()), 600_000);

/** Kroky časovej osi: história (7 dní z minulých behov) + aktuálny beh – R-010 */
export const steps = computed<Step[]>(() => {
  const r = runInfo.value;
  if (!r) return [];
  return buildTimeline(r, runs.value, model.value.historyStepHours, new Date(nowTick.value));
});

/** Index aktuálneho kroku (najbližší k timeIso, bez neho k teraz) */
export const timeIndex = computed(() => {
  const s = steps.value;
  if (s.length === 0) return -1;
  const t = timeIso.value ? Date.parse(timeIso.value) : NaN;
  return nearestStepIndex(s, Number.isNaN(t) ? nowTick.value : t);
});

export const currentStep = computed<Step | null>(() => {
  const i = timeIndex.value;
  return i >= 0 ? steps.value[i]! : null;
});

export const validTime = computed(() => currentStep.value?.t ?? null);

export function setTimeIndex(i: number) {
  const s = steps.value;
  if (s.length === 0) return;
  timeIso.value = s[Math.max(0, Math.min(s.length - 1, i))]!.t.toISOString();
}

/** Skok na krok najbližší k teraz */
export function goToNow() {
  timeIso.value = null;
}

export function stepTime(delta: number) {
  setTimeIndex(timeIndex.value + delta);
}

export function toggleOverlay(id: OverlayId, on?: boolean) {
  const cur = overlays.value;
  const next = on ?? !cur.includes(id);
  overlays.value = next ? [...new Set([...cur, id])] : cur.filter((x) => x !== id);
}

export function selectLayer(id: string) {
  const l = getLayer(id);
  if (!l) return;
  batch(() => {
    layerId.value = l.id;
    // vrstva iba v hladinách (geopotenciál) pri povrchu → 500 hPa
    if (!l.surface && level.value === "sfc") level.value = 500;
    for (const [o, on] of Object.entries(l.overlays ?? {})) toggleOverlay(o as OverlayId, on);
  });
}

/** Zmena modelu: zvolený beh patril inému modelu → späť na najnovší */
export function selectModel(id: string) {
  if (id === modelId.value) return;
  batch(() => {
    modelId.value = id;
    runChoice.value = null;
  });
}

export function selectLevel(lv: Level) {
  batch(() => {
    level.value = lv;
    // geopotenciál pri povrchu nemá zmysel → tlak MSLP (izobary sú jeho prízemnou obdobou)
    const l = getLayer(layerId.value);
    if (lv === "sfc" && l && !l.surface) layerId.value = "pressure_msl";
  });
}

/** Posun hladiny klávesmi [ ] (−1 = nižšie, k povrchu) */
export function stepLevel(delta: number) {
  const i = LEVELS.indexOf(level.value);
  const next = LEVELS[Math.max(0, Math.min(LEVELS.length - 1, i + delta))]!;
  if (next !== level.value) selectLevel(next);
}

// --- Perzistencia pohľadu -------------------------------------------------

const currentView = computed<ViewState>(() => ({
  model: modelId.value,
  run: runChoice.value,
  layer: layerId.value,
  level: level.value,
  overlays: overlays.value,
  time: timeIso.value,
  center: mapView.value.center,
  zoom: mapView.value.zoom,
}));

let persistTimer: number | undefined;
effect(() => {
  const hash = encodeHash(currentView.value);
  clearTimeout(persistTimer);
  // pri prehrávaní/posune mapy nezapisovať pri každej zmene
  persistTimer = window.setTimeout(() => {
    history.replaceState(null, "", hash);
    writeLocal(LS_VIEW, hash);
  }, 300);
});

effect(() => writeLocal(LS_UNITS, units.value));
effect(() => writeLocal(LS_BORDERS, borders.value));
effect(() => writeLocal(LS_PARTICLES, particleDensity.value));

// Späť/vpred v prehliadači alebo ručne zmenený hash
window.addEventListener("hashchange", () => {
  const v = decodeHash(location.hash, currentView.value);
  batch(() => {
    if (MODELS.some((m) => m.id === v.model && m.enabled)) modelId.value = v.model;
    runChoice.value = v.run;
    const l = getLayer(v.layer);
    if (l) layerId.value = l.id;
    level.value = v.level;
    overlays.value = v.overlays;
    timeIso.value = v.time;
    mapView.value = { center: v.center, zoom: v.zoom };
  });
});

// --- Načítanie behov ------------------------------------------------------

/** Zvýšenie vynúti nové načítanie metadát behu */
const runReload = signal(0);

let runAbort: AbortController | null = null;
/** Hlavný beh + doplnkové priečinky toho istého behu (GFS); `ref` null = najnovší */
async function loadModelRun(m: ModelDef, ref: string | null, signal?: AbortSignal): Promise<RunInfo> {
  const [primaryId, ...extraIds] = m.sources as [string, ...string[]];
  const primary = ref ? await fetchRunMeta(primaryId, new Date(ref), signal) : await fetchLatestRun(primaryId, signal);
  // doplnok nemusí mať beh ešte hotový – vtedy jeho premenné chýbajú (vrstvy sa zablokujú)
  const extras = await Promise.all(extraIds.map((id) => fetchRunMeta(id, primary.referenceTime, signal).catch(() => null)));
  return combineRuns(primary, extras.filter((e): e is RunInfo => e !== null), m.crop ?? null, m.projection ?? null);
}

const pastRuns = new Map<string, Promise<RunInfo>>();

/** Beh pre krok časovej osi: aktuálny, alebo minulý (metadáta sa načítajú raz a cachujú) */
export function resolveRun(ref: Date): Promise<RunInfo> {
  const r = runInfo.peek();
  if (r && r.referenceTime.getTime() === ref.getTime()) return Promise.resolve(r);
  const m = model.peek();
  const key = `${m.id}|${ref.toISOString()}`;
  let p = pastRuns.get(key);
  if (!p) {
    p = loadModelRun(m, ref.toISOString());
    pastRuns.set(key, p);
    p.catch(() => pastRuns.get(key) === p && pastRuns.delete(key));
  }
  return p;
}

/** Beh aktuálneho kroku (štítok, legenda) – pri histórii minulý beh */
export const stepRun = signal<RunInfo | null>(null);
effect(() => {
  const s = currentStep.value;
  if (!s) {
    stepRun.value = null;
    return;
  }
  const ref = s.ref.getTime();
  resolveRun(s.ref)
    .then((r) => {
      if (currentStep.peek()?.ref.getTime() === ref) stepRun.value = r;
    })
    .catch(() => undefined);
});

effect(() => {
  void model.value;
  const choice = runChoice.value;
  void runReload.value;
  runAbort?.abort();
  const ctrl = (runAbort = new AbortController());
  runError.value = null;
  const p = untracked(() => loadModelRun(model.peek(), choice, ctrl.signal));
  p.then((r) => {
    if (ctrl.signal.aborted) return;
    batch(() => {
      runInfo.value = r;
      // čas za koncom behu alebo starší než história → teraz; inak ponechať (vyberie sa najbližší krok)
      const t = timeIso.value ? Date.parse(timeIso.value) : NaN;
      const last = r.validTimes.at(-1)!.getTime();
      if (!Number.isNaN(t) && (t > last || t < Date.now() - 7 * 86_400_000)) timeIso.value = null;
    });
  }).catch((e: unknown) => {
    if (ctrl.signal.aborted) return;
    runError.value = e instanceof Error ? e.message : String(e);
  });
});

effect(() => {
  const spatialId = model.value.sources[0]!;
  void runReload.value;
  // 8 dní: S3 uchováva behy 7 dní, história siaha 7 dní dozadu
  listRuns(spatialId, 8)
    .then((list) => {
      if (model.peek().sources[0] === spatialId) runs.value = list;
    })
    .catch(() => (runs.value = []));
});

/** Obnoviť metadáta behu (napr. po návrate na kartu – mohol prísť nový beh) */
export function refreshRun() {
  runReload.value++;
}
