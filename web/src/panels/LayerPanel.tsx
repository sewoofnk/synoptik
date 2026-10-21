import { useState } from "preact/hooks";
import { CATEGORY_LABELS, LAYERS, OVERLAYS, sourceVariables, type LayerCategory } from "../config/layers.config";
import { layerId, overlays, runInfo, selectLayer, toggleOverlay } from "../state/store";

// Ľavý panel: farebná vrstva (jedna) + kombinovateľné prekrytia.
export function LayerPanel() {
  const [collapsed, setCollapsed] = useState(window.innerWidth < 700);
  const vars = runInfo.value?.variables;
  const available = (v: string[]) => !vars || v.every((x) => vars.includes(x));
  const categories = [...new Set(LAYERS.map((l) => l.category))] as LayerCategory[];

  return (
    <aside class={`layer-panel ${collapsed ? "collapsed" : ""}`}>
      <button class="panel-toggle btn" onClick={() => setCollapsed(!collapsed)} aria-expanded={!collapsed}>
        {collapsed ? "Vrstvy ▸" : "◂"}
      </button>
      {!collapsed && (
        <div class="panel-body">
          {categories.map((c) => (
            <section key={c}>
              <h3>{CATEGORY_LABELS[c]}</h3>
              {LAYERS.filter((l) => l.category === c).map((l) => {
                const ok = available(sourceVariables(l.source));
                return (
                  <label key={l.id} class={`opt ${ok ? "" : "disabled"}`} title={ok ? undefined : "Model túto premennú nemá"}>
                    <input
                      type="radio"
                      name="layer"
                      checked={layerId.value === l.id}
                      disabled={!ok}
                      onChange={() => selectLayer(l.id)}
                    />
                    {l.label}
                  </label>
                );
              })}
            </section>
          ))}
          <section>
            <h3>Prekrytia</h3>
            {OVERLAYS.map((o) => (
              <label key={o.id} class={`opt ${available(o.variables) ? "" : "disabled"}`}>
                <input
                  type="checkbox"
                  checked={overlays.value.includes(o.id)}
                  disabled={!available(o.variables)}
                  onChange={(e) => toggleOverlay(o.id, e.currentTarget.checked)}
                />
                {o.label}
              </label>
            ))}
          </section>
        </div>
      )}
    </aside>
  );
}
