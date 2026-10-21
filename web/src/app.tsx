import { useEffect } from "preact/hooks";
import { MODELS } from "./config/models";
import { MapView } from "./map/MapView";
import { CursorTooltip } from "./panels/CursorTooltip";
import { Footer } from "./panels/Footer";
import { LayerPanel } from "./panels/LayerPanel";
import { PointPanel } from "./panels/PointPanel";
import { Legend } from "./panels/Legend";
import { Timeline } from "./panels/Timeline";
import { TopBar } from "./panels/TopBar";
import { modelId, playing, point, refreshRun, stepTime } from "./state/store";

/** Klávesové skratky: ←/→ čas, medzerník play, M model, [ ] hladina (od Fázy 3) */
function onKey(e: KeyboardEvent) {
  const t = e.target instanceof Element ? e.target : null;
  // formulárové prvky majú vlastné ovládanie klávesmi; medzerník na tlačidle ho stlačí
  if (e.ctrlKey || e.metaKey || e.altKey || t?.closest("input, select, textarea")) return;
  if (e.key === " " && t?.closest("button")) return;
  switch (e.key) {
    case "ArrowLeft":
      stepTime(-1);
      break;
    case "ArrowRight":
      stepTime(1);
      break;
    case "Escape":
      point.value = null;
      break;
    case " ":
      playing.value = !playing.value;
      break;
    case "m":
    case "M": {
      const enabled = MODELS.filter((m) => m.enabled);
      const i = enabled.findIndex((m) => m.id === modelId.value);
      modelId.value = enabled[(i + 1) % enabled.length]!.id;
      break;
    }
    default:
      return;
  }
  e.preventDefault();
}

export function App() {
  useEffect(() => {
    window.addEventListener("keydown", onKey);
    // po návrate na kartu skontrolovať, či neprišiel nový beh
    const onVisible = () => document.visibilityState === "visible" && refreshRun();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return (
    <div class="layout">
      <TopBar />
      <main class="main">
        <MapView />
        <LayerPanel />
        <Legend />
        <CursorTooltip />
        <PointPanel />
      </main>
      <Timeline />
      <Footer />
    </div>
  );
}
