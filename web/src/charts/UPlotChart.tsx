import { effect } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import { timeIso, validTime } from "../state/store";

// Obal pre uPlot: šírka podľa kontajnera, zvislá čiara pre čas mapy, klik nastaví čas mapy.

/** Plugin: zvislá čiara v čase platnosti mapy (x os v sekundách) */
function mapTimeMarker(): uPlot.Plugin {
  return {
    hooks: {
      draw: (u) => {
        const vt = validTime.peek();
        if (!vt) return;
        const x = u.valToPos(vt.getTime() / 1000, "x", true);
        if (x < u.bbox.left || x > u.bbox.left + u.bbox.width) return;
        const ctx = u.ctx;
        ctx.save();
        ctx.strokeStyle = getComputedStyle(u.root).getPropertyValue("--accent") || "#1f6feb";
        ctx.lineWidth = 1.5 * uPlot.pxRatio;
        ctx.setLineDash([4 * uPlot.pxRatio, 3 * uPlot.pxRatio]);
        ctx.beginPath();
        ctx.moveTo(x, u.bbox.top);
        ctx.lineTo(x, u.bbox.top + u.bbox.height);
        ctx.stroke();
        ctx.restore();
      },
    },
  };
}

interface Props {
  options: Omit<uPlot.Options, "width">;
  data: uPlot.AlignedData;
}

export function UPlotChart({ options, data }: Props) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const chart = new uPlot(
      { ...options, width: el.clientWidth || 400, plugins: [...(options.plugins ?? []), mapTimeMarker()] },
      data,
      el,
    );
    const ro = new ResizeObserver(() => {
      if (el.clientWidth > 0 && el.clientWidth !== chart.width) chart.setSize({ width: el.clientWidth, height: chart.height });
    });
    ro.observe(el);
    // posun časovej osi mapy → prekresliť značku
    const stop = effect(() => {
      void validTime.value;
      chart.redraw(false);
    });
    // klik do grafu → čas mapy (timeIndex vyberie najbližší krok behu)
    const onClick = () => {
      const left = chart.cursor.left;
      if (left === undefined || left < 0) return;
      const t = chart.posToVal(left, "x");
      if (Number.isFinite(t)) timeIso.value = new Date(Math.round(t / 3600) * 3600 * 1000).toISOString();
    };
    chart.over.addEventListener("click", onClick);
    return () => {
      stop();
      ro.disconnect();
      chart.destroy();
    };
  }, [options, data]);

  return <div ref={host} class="uplot-host" />;
}
