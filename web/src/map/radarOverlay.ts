// Radar a blesky na mape (R-016): SHMÚ (obrázky, 5 min, Slovensko a okolie) a RainViewer
// (dlaždice, celá Európa, ~2 h). Vrstvy ležia pod izočiarami a časticami vetra, nad farebným poľom.

import type { ImageSource, Map as MlMap } from "maplibre-gl";
import { effect, untracked } from "@preact/signals";
import {
  fetchRainViewer,
  fetchShmuFrames,
  loadShmuImage,
  nearestFrame,
  rainViewerTiles,
  RAINVIEWER_MAX_ZOOM,
  SHMU_LIGHTNING_COORDS,
  SHMU_RADAR_COORDS,
  type RadarFrame,
} from "../data/radar";
import { overlays, radarFrames, radarIndex, radarInfo, radarLive, radarPlaying, radarProduct, radarSource } from "../state/store";

/** Priehľadný 1×1 PNG – zástupný obrázok, kým nie je načítaná snímka */
const BLANK = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const OPACITY = 0.78;
const HOURS = 3;
const FRAME_MS = 650;
const END_PAUSE_MS = 1600;

const SHMU_ID = "radar-shmu";
const LIGHTNING_ID = "radar-lightning";
const rvId = (i: number) => `radar-rv-${i}`;

export class RadarOverlay {
  private before: string | undefined;
  private rv: { host: string; frames: RadarFrame[] } | null = null;
  private rvCount = 0;
  private lightning: RadarFrame[] = [];
  private disposers: (() => void)[] = [];
  private shownKey = "";
  private shownLightning = "";

  constructor(private map: MlMap) {
    this.disposers.push(
      effect(() => void this.syncFrames()),
      effect(() => void this.syncShown()),
      effect(() => this.playLoop()),
    );
  }

  /** Zdroje a vrstvy (po každej zmene štýlu mapy) */
  addLayers(before: string | undefined) {
    this.before = before;
    const map = this.map;
    if (!map.getSource(SHMU_ID)) map.addSource(SHMU_ID, { type: "image", url: BLANK, coordinates: SHMU_RADAR_COORDS });
    if (!map.getLayer(SHMU_ID)) {
      map.addLayer(
        { id: SHMU_ID, type: "raster", source: SHMU_ID, layout: { visibility: "none" }, paint: { "raster-opacity": OPACITY, "raster-fade-duration": 0 } },
        before,
      );
    }
    if (!map.getSource(LIGHTNING_ID)) map.addSource(LIGHTNING_ID, { type: "image", url: BLANK, coordinates: SHMU_LIGHTNING_COORDS });
    if (!map.getLayer(LIGHTNING_ID)) {
      map.addLayer(
        { id: LIGHTNING_ID, type: "raster", source: LIGHTNING_ID, layout: { visibility: "none" }, paint: { "raster-opacity": 1, "raster-fade-duration": 0, "raster-resampling": "nearest" } },
        before,
      );
    }
    // štýl sa prekreslil (téma) → obnoviť dlaždice RainViewer a zobrazenú snímku
    this.shownKey = "";
    this.shownLightning = "";
    if (this.rv) this.buildRainViewer();
    this.syncShown();
  }

  private setVisible(id: string, on: boolean) {
    if (this.map.getLayer(id)) this.map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
  }

  // --- zoznamy snímok -----------------------------------------------------

  /** Načíta zoznam snímok pri zapnutí (a každé 2 / 5 min obnovuje) */
  private syncFrames() {
    const on = overlays.value.includes("radar");
    const lightningOn = overlays.value.includes("lightning");
    const source = radarSource.value;
    const product = radarProduct.value;
    if (!on && !lightningOn) {
      radarFrames.value = [];
      radarIndex.value = -1;
      radarInfo.value = null;
      this.clearRainViewer();
      return;
    }
    let stopped = false;
    const load = async () => {
      try {
        // blesky sú iba z SHMÚ
        if (lightningOn) this.lightning = await fetchShmuFrames("data.lightning", HOURS);
        if (on) {
          let frames: RadarFrame[];
          if (source === "shmu") {
            frames = await fetchShmuFrames(product, HOURS);
            this.clearRainViewer();
          } else {
            const d = await fetchRainViewer();
            frames = d.frames;
            if (!this.rv || this.rv.frames.at(-1)?.key !== d.frames.at(-1)?.key) {
              this.rv = d;
              this.buildRainViewer();
            }
          }
          if (stopped) return;
          const prev = radarFrames.peek();
          const prevT = prev[radarIndex.peek()]?.t;
          radarFrames.value = frames;
          // sleduje najnovšiu snímku, kým ju používateľ nepresunie; inak zostane na tom istom čase
          const keep = !radarLive.peek() && prevT !== undefined ? nearestFrame(frames, prevT, 6 * 60_000) : -1;
          radarIndex.value = keep >= 0 ? keep : frames.length - 1;
          if (keep < 0) radarLive.value = true;
        }
        radarInfo.value = { ...(radarInfo.peek() ?? { source, product, t: 0 }), error: undefined, updated: Date.now() };
      } catch (e) {
        if (!stopped) radarInfo.value = { ...(radarInfo.peek() ?? { source, product, t: 0 }), error: e instanceof Error ? e.message : String(e) };
      }
    };
    untracked(() => void load());
    const timer = setInterval(() => void load(), source === "shmu" ? 2 * 60_000 : 5 * 60_000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }

  // --- RainViewer: jedna vrstva na snímku, prepína sa priehľadnosť -----------

  private buildRainViewer() {
    this.clearRainViewer(false);
    if (!this.rv || radarSource.peek() !== "rainviewer") return;
    const map = this.map;
    this.rv.frames.forEach((f, i) => {
      map.addSource(rvId(i), {
        type: "raster",
        tiles: [rainViewerTiles(this.rv!.host, f.key)],
        tileSize: 256,
        maxzoom: RAINVIEWER_MAX_ZOOM,
        attribution: '<a href="https://www.rainviewer.com/" target="_blank" rel="noopener">RainViewer</a>',
      });
      map.addLayer({ id: rvId(i), type: "raster", source: rvId(i), paint: { "raster-opacity": 0, "raster-fade-duration": 0 } }, this.before);
    });
    this.rvCount = this.rv.frames.length;
    this.shownKey = "";
    this.syncShown();
  }

  private clearRainViewer(forget = true) {
    const map = this.map;
    for (let i = 0; i < this.rvCount; i++) {
      if (map.getLayer(rvId(i))) map.removeLayer(rvId(i));
      if (map.getSource(rvId(i))) map.removeSource(rvId(i));
    }
    this.rvCount = 0;
    if (forget) this.rv = null;
  }

  // --- zobrazenie aktuálnej snímky ---------------------------------------------

  private syncShown() {
    const on = overlays.value.includes("radar");
    const lightningOn = overlays.value.includes("lightning");
    const source = radarSource.value;
    const product = radarProduct.value;
    const frames = radarFrames.value;
    const i = radarIndex.value;
    const frame = on ? frames[i] : undefined;
    const map = this.map;
    if (!map.getLayer(SHMU_ID)) return;

    if (!on || !frame) {
      this.setVisible(SHMU_ID, false);
      for (let k = 0; k < this.rvCount; k++) if (map.getLayer(rvId(k))) map.setPaintProperty(rvId(k), "raster-opacity", 0);
    } else if (source === "shmu") {
      this.setVisible(SHMU_ID, true);
      const key = `${product}|${frame.key}`;
      if (key !== this.shownKey) {
        this.shownKey = key;
        loadShmuImage(product, frame.key)
          .then((url) => {
            if (this.shownKey !== key) return; // medzitým sa zmenilo
            (map.getSource(SHMU_ID) as ImageSource | undefined)?.updateImage({ url, coordinates: SHMU_RADAR_COORDS });
          })
          .catch((e: unknown) => (radarInfo.value = { ...(radarInfo.peek() ?? { source, product, t: 0 }), error: e instanceof Error ? e.message : String(e) }));
        this.preload(product, frames, i);
      }
    } else {
      this.setVisible(SHMU_ID, false);
      this.rv?.frames.forEach((f, k) => {
        if (map.getLayer(rvId(k))) map.setPaintProperty(rvId(k), "raster-opacity", f.key === frame.key ? OPACITY : 0);
      });
    }

    if (on && frame) radarInfo.value = { ...(radarInfo.peek() ?? { source, product, t: 0 }), source, product, t: frame.t };

    // blesky: snímka najbližšia k času radaru (inak najnovšia)
    if (!lightningOn || this.lightning.length === 0) {
      this.setVisible(LIGHTNING_ID, false);
    } else {
      const t = frame?.t ?? Date.now();
      const li = nearestFrame(this.lightning, t, 8 * 60_000);
      if (li < 0) {
        this.setVisible(LIGHTNING_ID, false);
      } else {
        const lf = this.lightning[li]!;
        this.setVisible(LIGHTNING_ID, true);
        if (lf.key !== this.shownLightning) {
          this.shownLightning = lf.key;
          // blesky sú farebné body na priehľadnom pozadí – pixely sa nečistia
          loadShmuImage("data.lightning", lf.key, false)
            .then((url) => {
              if (this.shownLightning === lf.key) (map.getSource(LIGHTNING_ID) as ImageSource | undefined)?.updateImage({ url, coordinates: SHMU_LIGHTNING_COORDS });
            })
            .catch(() => undefined);
        }
      }
    }
  }

  /** Prednačítať snímky okolo aktuálnej (plynulá animácia) – najviac 4 súbežne */
  private preload(product: string, frames: RadarFrame[], from: number) {
    const order = frames.map((f, k) => ({ f, d: Math.abs(k - from) })).sort((a, b) => a.d - b.d);
    let next = 0;
    const worker = async () => {
      while (next < order.length) {
        const it = order[next++]!;
        await loadShmuImage(product, it.f.key).catch(() => undefined);
      }
    };
    for (let w = 0; w < 4; w++) void worker();
  }

  // --- animácia -------------------------------------------------------------

  private playLoop() {
    if (!radarPlaying.value || !overlays.value.includes("radar")) return;
    let stopped = false;
    const run = async () => {
      while (!stopped && radarPlaying.value) {
        const frames = radarFrames.peek();
        if (frames.length < 2) return;
        const cur = radarIndex.peek();
        const last = cur >= frames.length - 1;
        const next = last ? 0 : cur + 1;
        const started = performance.now();
        // ďalšia snímka sa ukáže až keď je načítaná
        if (radarSource.peek() === "shmu") await loadShmuImage(radarProduct.peek(), frames[next]!.key).catch(() => undefined);
        const wait = (last ? END_PAUSE_MS : FRAME_MS) - (performance.now() - started);
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        if (stopped || !radarPlaying.peek()) return;
        radarLive.value = false;
        radarIndex.value = next;
      }
    };
    untracked(() => void run());
    return () => {
      stopped = true;
    };
  }

  dispose() {
    this.disposers.forEach((d) => d());
    this.clearRainViewer();
  }
}
