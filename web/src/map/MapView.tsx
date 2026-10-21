import { effect } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import { Map as MlMap, Marker, NavigationControl, ScaleControl, setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
// MapLibre v6 načítava worker ako samostatný ES modul – Vite ho musí vydať ako asset
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { mapView, point } from "../state/store";
import { MapController } from "./mapController";

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
    const v = mapView.peek();
    const map = new MlMap({
      container: container.current,
      style: darkQuery.matches ? STYLE_DARK : STYLE_LIGHT,
      center: v.center,
      zoom: v.zoom,
      minZoom: 2,
      maxZoom: 12,
      // WebGL vrstvy počítajú výrez bez rotácie a náklonu (sever hore, ako synoptické mapy)
      maxPitch: 0,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      attributionControl: { compact: true },
      // Bez prelínania popiskov – okamžitá odozva pri prepínaní
      fadeDuration: 0,
    });
    map.touchZoomRotate.disableRotation();
    map.keyboard.disable(); // šípky patria časovej osi
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new ScaleControl({ unit: "metric" }), "bottom-left");
    // Chyby štýlu/dlaždíc MapLibre inak tichá
    map.on("error", (e) => console.error("MapLibre:", e.error?.message ?? e));

    const controller = new MapController(map);

    // mapa → stav (iba po dokončení pohybu)
    map.on("moveend", () => {
      const c = map.getCenter();
      mapView.value = { center: [c.lng, c.lat], zoom: map.getZoom() };
    });
    // stav → mapa (napr. zmena URL hash)
    const stopSync = effect(() => {
      const { center, zoom } = mapView.value;
      const c = map.getCenter();
      if (Math.abs(c.lng - center[0]) > 0.01 || Math.abs(c.lat - center[1]) > 0.01 || Math.abs(map.getZoom() - zoom) > 0.01) {
        map.jumpTo({ center, zoom });
      }
    });

    // Značka vybraného bodu (bodové nástroje)
    const marker = new Marker({ color: "#e5484d", scale: 0.8 });
    const stopMarker = effect(() => {
      const p = point.value;
      if (p) marker.setLngLat([p.lon, p.lat]).addTo(map);
      else marker.remove();
    });

    // Prepnutie témy podkladu podľa systému
    const onTheme = (e: MediaQueryListEvent) => map.setStyle(e.matches ? STYLE_DARK : STYLE_LIGHT);
    darkQuery.addEventListener("change", onTheme);

    return () => {
      darkQuery.removeEventListener("change", onTheme);
      stopSync();
      stopMarker();
      marker.remove();
      controller.dispose();
      map.remove();
    };
  }, []);

  return <div ref={container} class="map" />;
}
