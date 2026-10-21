import { useState } from "preact/hooks";
import { LEVEL_FL, LEVELS, levelLabel, OVERLAYS, overlayVariables } from "../config/layers.config";
import { MODELS } from "../config/models";
import { flyTo, zoomBy } from "../map/mapInstance";
import { layer, level, modelId, overlays, point, runInfo, selectLevel, selectModel, toggleOverlay } from "../state/store";
import { Footer } from "./Footer";
import { Icon } from "./icons";
import { Legend } from "./Legend";
import { Timeline } from "./Timeline";

// Spodná časť obrazovky (ako Windy): prekrytia + ovládanie mapy, modely, legenda, časová os, pätička.

function OverlayToggles() {
  const vars = runInfo.value?.variables;
  return (
    <div class="toggles">
      {OVERLAYS.map((o) => {
        const ok = !vars || overlayVariables(o.id, layer.value, level.value).every((v) => vars.includes(v));
        const on = overlays.value.includes(o.id);
        return (
          <button
            key={o.id}
            class={`toggle ${on ? "on" : ""}`}
            disabled={!ok}
            aria-pressed={on}
            onClick={() => toggleOverlay(o.id)}
            title={o.label}
          >
            <span class="toggle-dot" />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function MapButtons() {
  const [locating, setLocating] = useState(false);
  const locate = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const { latitude: lat, longitude: lon } = pos.coords;
        flyTo(lon, lat);
        point.value = { lat, lon };
      },
      () => setLocating(false),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  };
  return (
    <div class="map-buttons glass">
      <button class="desktop-only" onClick={() => zoomBy(-1)} aria-label="Oddialiť">
        <Icon name="minus" />
      </button>
      <button class="desktop-only" onClick={() => zoomBy(1)} aria-label="Priblížiť">
        <Icon name="plus" />
      </button>
      <button onClick={locate} aria-label="Moja poloha" title="Moja poloha – otvorí predpoveď pre ňu" class={locating ? "busy" : ""}>
        <Icon name="locate" />
      </button>
    </div>
  );
}

/** Výber hladiny (ako „Výška“ vo Windy); klávesy [ ] */
function LevelPills() {
  return (
    <div class="model-pills level-pills glass" role="radiogroup" aria-label="Hladina">
      {LEVELS.map((l) => (
        <button
          key={l}
          role="radio"
          aria-checked={level.value === l}
          class={level.value === l ? "active" : ""}
          onClick={() => selectLevel(l)}
          title={l === "sfc" ? "Povrch: 2 m / 10 m / MSL ( [ ] mení hladinu)" : `${l} hPa ≈ ${LEVEL_FL[l]} ( [ ] mení hladinu)`}
        >
          {l === "sfc" ? levelLabel(l) : l}
          {l !== "sfc" && <small>{LEVEL_FL[l]}</small>}
        </button>
      ))}
    </div>
  );
}

function ModelPills() {
  return (
    <div class="model-pills glass" role="radiogroup" aria-label="Model">
      {MODELS.filter((m) => m.enabled).map((m) => (
        <button
          key={m.id}
          role="radio"
          aria-checked={modelId.value === m.id}
          class={modelId.value === m.id ? "active" : ""}
          onClick={() => selectModel(m.id)}
          title={`${m.label} (M prepína)`}
        >
          {m.label.replace(/ (0,25°|\d+ km)$/, "")}
          <small>{Math.round(m.resolutionDeg * 111)} km</small>
        </button>
      ))}
    </div>
  );
}

export function BottomBar() {
  return (
    <div class="bottom">
      <div class="bottom-controls">
        <div class="ctl-row">
          <OverlayToggles />
          <MapButtons />
        </div>
        <LevelPills />
        <ModelPills />
        <Legend />
      </div>
      <Timeline />
      <Footer />
    </div>
  );
}
