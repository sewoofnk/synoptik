import { COLOR_SCALES, cssGradient } from "../config/colorscales";
import { CATEGORY_LABELS, isLayerAvailable, LAYERS, OVERLAYS, overlayVariables, previewScale, type LayerCategory } from "../config/layers.config";
import { MODELS } from "../config/models";
import { formatRun } from "../lib/time";
import {
  layer,
  layerId,
  level,
  menuOpen,
  modelId,
  overlays,
  playSpeed,
  runChoice,
  runInfo,
  runs,
  selectLayer,
  selectModel,
  toggleOverlay,
} from "../state/store";
import { Icon } from "./icons";
import { UnitsSettings } from "./UnitsSettings";

const SPEEDS = [1, 2, 4, 8];

// Hlavné menu (desktop vysúvací panel vpravo, mobil celá obrazovka): model a beh, vrstvy v dlaždiciach,
// prekrytia, jednotky, prehrávanie, informácie a atribúcia.
export function MainMenu() {
  if (!menuOpen.value) return null;
  const close = () => (menuOpen.value = false);
  const run = runInfo.value;
  const vars = run?.variables;
  const available = (v: string[]) => !vars || v.every((x) => vars.includes(x));
  const categories = [...new Set(LAYERS.map((l) => l.category))] as LayerCategory[];
  const choice = runChoice.value;

  return (
    <div class="drawer-backdrop" onClick={(e) => e.target === e.currentTarget && close()}>
      <aside class="drawer" role="dialog" aria-label="Menu">
        <header class="drawer-head">
          <b class="brand">Synoptik</b>
          <button class="icon-btn" onClick={close} aria-label="Zavrieť menu (Esc)">
            <Icon name="close" />
          </button>
        </header>
        <div class="drawer-body">
          <section>
            <h3>Model a beh</h3>
            <div class="chips">
              {MODELS.map((m) => (
                <button
                  key={m.id}
                  class={`chip ${modelId.value === m.id ? "active" : ""}`}
                  disabled={!m.enabled}
                  onClick={() => selectModel(m.id)}
                  title={m.enabled ? m.label : `${m.label} – pribudne neskôr`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <label class="row-field">
              <span>Beh (init time)</span>
              <select value={choice ?? ""} onChange={(e) => (runChoice.value = e.currentTarget.value || null)}>
                <option value="">Najnovší{run && !choice ? ` (${formatRun(run.referenceTime)})` : ""}</option>
                {runs.value.map((r) => (
                  <option key={r.toISOString()} value={r.toISOString()}>
                    {formatRun(r)}
                  </option>
                ))}
              </select>
            </label>
          </section>

          {categories.map((c) => (
            <section key={c}>
              <h3>{CATEGORY_LABELS[c]}</h3>
              <div class="tiles">
                {LAYERS.filter((l) => l.category === c).map((l) => {
                  const ok = isLayerAvailable(l, level.value, vars);
                  const active = layerId.value === l.id;
                  return (
                    <button
                      key={l.id}
                      class={`tile ${active ? "active" : ""}`}
                      disabled={!ok}
                      onClick={() => {
                        selectLayer(l.id);
                        close();
                      }}
                      title={ok ? l.label : `${l.label} – model túto premennú nemá`}
                    >
                      <span class="tile-img" style={{ background: cssGradient(COLOR_SCALES[previewScale(l)]!) }}>
                        <Icon name={l.icon} size={26} badge={l.badge} />
                      </span>
                      <span class="tile-label">{l.label}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}

          <section>
            <h3>Zobraziť na mape</h3>
            {OVERLAYS.map((o) => (
              <label key={o.id} class={`switch-row ${available(overlayVariables(o.id, layer.value, level.value)) ? "" : "disabled"}`}>
                <Icon name={o.icon} />
                <span>{o.label}</span>
                <input
                  type="checkbox"
                  role="switch"
                  class="switch"
                  checked={overlays.value.includes(o.id)}
                  disabled={!available(overlayVariables(o.id, layer.value, level.value))}
                  onChange={(e) => toggleOverlay(o.id, e.currentTarget.checked)}
                />
              </label>
            ))}
          </section>

          <section>
            <h3>Jednotky</h3>
            <UnitsSettings />
          </section>

          <section>
            <h3>Prehrávanie</h3>
            <div class="segmented">
              {SPEEDS.map((s) => (
                <button key={s} class={playSpeed.value === s ? "active" : ""} onClick={() => (playSpeed.value = s)}>
                  {s} krok/s
                </button>
              ))}
            </div>
          </section>

          <section class="about">
            <h3>O aplikácii</h3>
            <p>
              <b>Nie je certifikovaný zdroj leteckých informácií.</b> Na let používajte oficiálny brífing.
            </p>
            <p class="muted">
              Klávesy: ← → čas · [ ] hladina · medzerník prehrať · M model · Esc zavrieť. Klik na mapu otvorí meteogram, Skew-T a porovnanie modelov.
            </p>
            <p class="muted">
              Dáta: <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a> (CC BY 4.0), modely DWD (ICON),
              ECMWF, NOAA (GFS), Météo-France, UK Met Office. Mapa ©{" "}
              <a href="https://openfreemap.org/" target="_blank" rel="noopener">OpenFreeMap</a>,{" "}
              <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">
                OpenStreetMap
              </a>
              .
            </p>
          </section>
        </div>
      </aside>
    </div>
  );
}
