import { useEffect } from "preact/hooks";
import { MODELS } from "./config/models";
import { MapView } from "./map/MapView";
import { BottomBar } from "./panels/BottomBar";
import { CursorTooltip } from "./panels/CursorTooltip";
import { InfoChip } from "./panels/InfoChip";
import { MainMenu } from "./panels/MainMenu";
import { PointPanel } from "./panels/PointPanel";
import { QuickLayers } from "./panels/QuickLayers";
import { menuOpen, modelId, playing, point, refreshRun, stepTime } from "./state/store";

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
      if (menuOpen.value) menuOpen.value = false;
      else point.value = null;
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

  // výška spodnej časti → CSS premenná (umiestnenie bodového panelu a ovládacích prvkov mapy)
  useEffect(() => {
    const bottom = document.querySelector<HTMLElement>(".bottom");
    const app = document.querySelector<HTMLElement>(".app");
    if (!bottom || !app) return;
    const controls = bottom.querySelector<HTMLElement>(".bottom-controls");
    const ro = new ResizeObserver(() => {
      app.style.setProperty("--bottom-h", `${bottom.offsetHeight}px`);
      // výška časovej osi + pätičky (bez ovládacích prvkov vpravo) – pre bodový panel na desktope
      app.style.setProperty("--tl-h", `${bottom.offsetHeight - (controls?.offsetHeight ?? 0)}px`);
    });
    ro.observe(bottom);
    return () => ro.disconnect();
  }, []);

  return (
    <div class="app">
      <MapView />
      <CursorTooltip />
      <InfoChip />
      <QuickLayers />
      <BottomBar />
      <PointPanel />
      <MainMenu />
    </div>
  );
}
