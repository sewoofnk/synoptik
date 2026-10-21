import { useEffect, useRef } from "preact/hooks";
import { Map as MlMap, NavigationControl, ScaleControl, setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
// MapLibre v6 načítava worker ako samostatný ES modul – Vite ho musí vydať ako asset
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";

setWorkerUrl(workerUrl);

// OpenFreeMap – vektorové dlaždice zadarmo, bez kľúča. Atribúciu (OSM, OpenMapTiles)
// dodáva samotný štýl.
const STYLE_LIGHT = "https://tiles.openfreemap.org/styles/positron";
const STYLE_DARK = "https://tiles.openfreemap.org/styles/dark";

const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");

export function MapView() {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!container.current) return;
    const map = new MlMap({
      container: container.current,
      style: darkQuery.matches ? STYLE_DARK : STYLE_LIGHT,
      center: [15, 50],
      zoom: 3.6,
      minZoom: 2,
      maxZoom: 12,
      attributionControl: { compact: true },
      // Bez prelínania popiskov – okamžitá odozva pri prepínaní
      fadeDuration: 0,
    });
    map.addControl(new NavigationControl({ visualizePitch: false }), "top-right");
    map.addControl(new ScaleControl({ unit: "metric" }), "bottom-left");
    // Chyby štýlu/dlaždíc MapLibre inak tichá
    map.on("error", (e) => console.error("MapLibre:", e.error?.message ?? e));

    // Prepnutie témy podkladu podľa systému
    const onTheme = (e: MediaQueryListEvent) => map.setStyle(e.matches ? STYLE_DARK : STYLE_LIGHT);
    darkQuery.addEventListener("change", onTheme);

    return () => {
      darkQuery.removeEventListener("change", onTheme);
      map.remove();
    };
  }, []);

  return <div ref={container} class="map" />;
}
