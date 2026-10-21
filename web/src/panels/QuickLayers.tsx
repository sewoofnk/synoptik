import { COLOR_SCALES, cssGradient } from "../config/colorscales";
import { useState } from "preact/hooks";
import { isLayerAvailable, LAYER_LEVEL_ORDER, LAYERS, LEVEL_FL, levelLabel, previewScale } from "../config/layers.config";
import { layer, layerId, level, menuOpen, runInfo, selectLayer, selectLevel } from "../state/store";
import { Icon } from "./icons";
import { LoginButton } from "./LoginButton";

/** Výber výšky (ako „Výška“ vo Windy): zoznam hladín zhora nadol namiesto vrstiev; klávesy [ ] */
function LevelList({ onBack }: { onBack: () => void }) {
  return (
    <nav class="quick-list" aria-label="Výška">
      <button class="quick more" onClick={onBack}>
        <span class="pill-label">◂ Vrstvy</span>
      </button>
      {LAYER_LEVEL_ORDER.map((l) => {
        const active = level.value === l;
        return (
          <button key={l} class={`quick level ${active ? "active" : ""}`} onClick={() => selectLevel(l)} aria-pressed={active}>
            <span class="pill-label">{levelLabel(l)}</span>
            <span class="round level-dot">{l === "sfc" ? "SFC" : LEVEL_FL[l].replace("FL", "")}</span>
          </button>
        );
      })}
      {layer.value.level === "sfc" && level.value !== "sfc" && <span class="pill-label note-pill">{layer.value.def.label}: iba pri povrchu</span>}
    </nav>
  );
}

// Pravý horný stĺpec (ako Windy): prihlásenie, Menu, rýchly výber vrstiev s farebnou ikonou, Výška.
export function QuickLayers() {
  const [levels, setLevels] = useState(false);
  const vars = runInfo.value?.variables;
  const quick = LAYERS.filter((l) => l.quick);

  return (
    <div class="right-stack">
      <LoginButton />
      <button class="menu-btn" onClick={() => (menuOpen.value = true)} aria-label="Menu – všetky vrstvy a nastavenia">
        <span class="pill-label">Menu</span>
        <span class="round accent">
          <Icon name="menu" size={22} />
        </span>
      </button>
      {levels ? (
        <LevelList onBack={() => setLevels(false)} />
      ) : (
      <nav class="quick-list" aria-label="Rýchly výber vrstvy">
        {quick.map((l) => {
          const ok = isLayerAvailable(l, level.value, vars);
          const active = layerId.value === l.id;
          return (
            <button
              key={l.id}
              class={`quick ${active ? "active" : ""}`}
              disabled={!ok}
              onClick={() => selectLayer(l.id)}
              aria-pressed={active}
              title={ok ? l.label : `${l.label} – model túto premennú nemá`}
            >
              <span class="pill-label">{l.short ?? l.label}</span>
              <span class="round" style={{ background: cssGradient(COLOR_SCALES[previewScale(l)]!) }}>
                <Icon name={l.icon} size={20} badge={l.badge} />
              </span>
            </button>
          );
        })}
        <button class="quick more" onClick={() => (menuOpen.value = true)}>
          <span class="pill-label">Viac vrstiev…</span>
        </button>
        <button class="quick" onClick={() => setLevels(true)} title="Výška – tlakové hladiny ( [ ] )">
          <span class="pill-label">
            Výška{level.value !== "sfc" && <b class="pill-sub"> {level.value} hPa</b>}
          </span>
          <span class="round accent-alt">
            <Icon name="plane" size={20} />
          </span>
        </button>
      </nav>
      )}
    </div>
  );
}
