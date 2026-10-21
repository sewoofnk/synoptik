import { COLOR_SCALES, cssGradient } from "../config/colorscales";
import { isLayerAvailable, LAYERS, previewScale } from "../config/layers.config";
import { layerId, level, menuOpen, runInfo, selectLayer } from "../state/store";
import { Icon } from "./icons";
import { LoginButton } from "./LoginButton";

// Pravý horný stĺpec (ako Windy): prihlásenie, Menu, rýchly výber vrstiev s farebnou ikonou.
export function QuickLayers() {
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
      </nav>
    </div>
  );
}
