// Prístup k inštancii mapy pre vlastné ovládacie prvky (zoom, moja poloha).

import type { Map as MlMap } from "maplibre-gl";

let current: MlMap | null = null;

export function setMapInstance(map: MlMap | null) {
  current = map;
}

export function zoomBy(delta: number) {
  current?.easeTo({ zoom: current.getZoom() + delta, duration: 250 });
}

export function flyTo(lon: number, lat: number, minZoom = 6) {
  if (!current) return;
  current.flyTo({ center: [lon, lat], zoom: Math.max(current.getZoom(), minZoom), duration: 800 });
}
