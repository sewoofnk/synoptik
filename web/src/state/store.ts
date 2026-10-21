// Centrálny stav aplikácie (Preact signals). Pohľad sa zrkadlí do URL hash a localStorage,
// jednotky iba do localStorage.

import { batch, computed, effect, signal, untracked } from "@preact/signals";
import { DEFAULT_LAYER_ID, getLayer, LEVELS, resolveLayer, type Level, type OverlayId } from "../config/layers.config";
import { DEFAULT_MODEL_ID, getModel, MODELS } from "../config/models";
import { pointModelForMap } from "../config/pointModels";
import { combineRuns, fetchLatestRun, fetchRunMeta, listRuns, type RunInfo } from "../data/openMeteoSpatial";
import { isUnitSettings, PRESETS, type UnitSettings } from "../lib/units";
import { decodeHash, encodeHash, type ViewState } from "./viewState";

const LS_VIEW = "synoptik.view";
const LS_UNITS = "synoptik.units";

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
/** Vybraný čas platnosti (ISO); null = prvý krok */
export const timeIso = signal<string | null>(init.time);
export const mapView = signal({ center: init.center, zoom: init.zoom });
export const units = signal<UnitSettings>(isUnitSettings(storedUnits) ? storedUnits : { ...PRESETS.metric });

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
export type PointTab = "meteogram" | "skewt" | "compare";
export const pointTab = signal<PointTab>("meteogram");
/** Model pre meteogram a Skew-T; predvolene podľa mapového modelu */
export const pointModelId = signal(pointModelForMap(init.model));

export const model = computed(() => getModel(modelId.value));
/** Vrstva vyriešená pre zvolenú hladinu (zdroj, škála, názov s hladinou) */
export const layer = computed(() => resolveLayer(getLayer(layerId.value)!, level.value));

/** Index aktuálneho kroku v runInfo.validTimes (najbližší k timeIso) */
export const timeIndex = computed(() => {
  const r = runInfo.value;
  if (!r || r.validTimes.length === 0) return -1;
  const t = timeIso.value ? Date.parse(timeIso.value) : NaN;
  if (Number.isNaN(t)) return 0;
  let best = 0;
  for (let i = 1; i < r.validTimes.length; i++) {
    if (Math.abs(r.validTimes[i]!.getTime() - t) < Math.abs(r.validTimes[best]!.getTime() - t)) best = i;
  }
  return best;
});

export const validTime = computed(() => {
  const i = timeIndex.value;
  return i >= 0 ? runInfo.value!.validTimes[i]! : null;
});

export function setTimeIndex(i: number) {
  const r = runInfo.value;
  if (!r || r.validTimes.length === 0) return;
  const clamped = Math.max(0, Math.min(r.validTimes.length - 1, i));
  timeIso.value = r.validTimes[clamped]!.toISOString();
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
/** Hlavný beh + doplnkové priečinky toho istého behu (GFS) */
async function loadRun(choice: string | null, signal: AbortSignal): Promise<RunInfo> {
  const m = model.peek();
  const [primaryId, ...extraIds] = m.sources as [string, ...string[]];
  const primary = choice ? await fetchRunMeta(primaryId, new Date(choice), signal) : await fetchLatestRun(primaryId, signal);
  // doplnok nemusí mať beh ešte hotový – vtedy jeho premenné chýbajú (vrstvy sa zablokujú)
  const extras = await Promise.all(
    extraIds.map((id) => fetchRunMeta(id, primary.referenceTime, signal).catch(() => null)),
  );
  return combineRuns(primary, extras.filter((e): e is RunInfo => e !== null), m.crop ?? null);
}

effect(() => {
  void model.value;
  const choice = runChoice.value;
  void runReload.value;
  runAbort?.abort();
  const ctrl = (runAbort = new AbortController());
  runError.value = null;
  const p = untracked(() => loadRun(choice, ctrl.signal));
  p.then((r) => {
    if (ctrl.signal.aborted) return;
    batch(() => {
      runInfo.value = r;
      // čas mimo behu → prvý krok; inak ponechať (timeIndex vyberie najbližší)
      const t = timeIso.value ? Date.parse(timeIso.value) : NaN;
      const first = r.validTimes[0]!.getTime(), last = r.validTimes.at(-1)!.getTime();
      if (Number.isNaN(t) || t < first || t > last) timeIso.value = r.validTimes[0]!.toISOString();
    });
  }).catch((e: unknown) => {
    if (ctrl.signal.aborted) return;
    runError.value = e instanceof Error ? e.message : String(e);
  });
});

effect(() => {
  const spatialId = model.value.sources[0]!;
  listRuns(spatialId)
    .then((list) => {
      if (model.peek().sources[0] === spatialId) runs.value = list;
    })
    .catch(() => (runs.value = []));
});

/** Obnoviť metadáta behu (napr. po návrate na kartu – mohol prísť nový beh) */
export function refreshRun() {
  runReload.value++;
}
