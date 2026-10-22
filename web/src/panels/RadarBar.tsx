import { SHMU_PRODUCTS, shmuLegendUrl } from "../data/radar";
import { overlays, radarFrames, radarIndex, radarInfo, radarLive, radarPlaying, radarProduct, radarSource } from "../state/store";
import { Icon } from "./icons";

const pad = (n: number) => String(n).padStart(2, "0");
const hm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const hmUtc = (d: Date) => `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}Z`;

/** Vek snímky: „pred 8 min“ */
function age(t: number): string {
  const m = Math.max(0, Math.round((Date.now() - t) / 60_000));
  return m < 60 ? `pred ${m} min` : `pred ${Math.floor(m / 60)} h ${m % 60} min`;
}

// Ovládanie radaru a blesky (R-016): vlastná časová os (posledné 3 h po 5 min), zdroj a produkt, legenda.
// Radar ukazuje skutočný stav, preto nezávisí od času modelovej časovej osi.
export function RadarBar() {
  const radarOn = overlays.value.includes("radar");
  const lightningOn = overlays.value.includes("lightning");
  if (!radarOn && !lightningOn) return null;
  const frames = radarFrames.value;
  const i = radarIndex.value;
  const info = radarInfo.value;
  const frame = frames[i];
  const source = radarSource.value;
  const product = radarProduct.value;

  return (
    <div class="radar-bar glass">
      {radarOn && (
        <>
          <div class="rb-row">
            <button
              class="round play small"
              onClick={() => (radarPlaying.value = !radarPlaying.value)}
              aria-label={radarPlaying.value ? "Pauza radaru" : "Prehrať radar"}
              disabled={frames.length < 2}
            >
              <Icon name={radarPlaying.value ? "pause" : "play"} size={16} />
            </button>
            <input
              class="rb-slider"
              type="range"
              min={0}
              max={Math.max(0, frames.length - 1)}
              value={Math.max(0, i)}
              disabled={frames.length < 2}
              aria-label="Čas snímky radaru"
              onInput={(e) => {
                radarPlaying.value = false;
                const k = Number(e.currentTarget.value);
                radarIndex.value = k;
                radarLive.value = k === frames.length - 1;
              }}
            />
            <span class="rb-time mono" title={frame ? `${hmUtc(new Date(frame.t))} · ${age(frame.t)}` : undefined}>
              {frame ? hm(new Date(frame.t)) : "–"}
            </span>
            <button
              class={`now-btn ${radarLive.value ? "" : "away"}`}
              onClick={() => {
                radarPlaying.value = false;
                radarIndex.value = frames.length - 1;
                radarLive.value = true;
              }}
              title="Najnovšia snímka"
            >
              Teraz
            </button>
          </div>
          <div class="rb-row rb-opts">
            <select value={source} onChange={(e) => (radarSource.value = e.currentTarget.value as "shmu" | "rainviewer")} aria-label="Zdroj radaru">
              <option value="shmu">SHMÚ · Slovensko, 5 min</option>
              <option value="rainviewer">RainViewer · Európa, 2 h</option>
            </select>
            {source === "shmu" && (
              <select value={product} onChange={(e) => (radarProduct.value = e.currentTarget.value)} aria-label="Produkt radaru">
                {SHMU_PRODUCTS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            )}
          </div>
          {source === "shmu" && <img class="rb-legend" src={shmuLegendUrl(product)} alt="Legenda radaru (dBZ, mm/h)" />}
          <div class="rb-note muted">
            {source === "shmu" ? "Radar © SHMÚ" : "Radar © RainViewer (zoom do 7)"}
            {frame && ` · ${hmUtc(new Date(frame.t))} (${age(frame.t)})`}
            {info?.error && <span class="error"> · {info.error}</span>}
          </div>
        </>
      )}
      {lightningOn && !radarOn && <div class="rb-note muted">Blesky © SHMÚ (Slovensko a okolie, 5 min)</div>}
    </div>
  );
}
