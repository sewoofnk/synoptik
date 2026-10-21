import { useEffect, useRef } from "preact/hooks";
import { buildLut, COLOR_SCALES, scalePosition } from "../config/colorscales";
import { formatLead, formatRun, formatValidUtc } from "../lib/time";
import { fromSI, toSI, unitFor, unitLabel } from "../lib/units";
import { layer, model, runInfo, timeIndex, units, validTime } from "../state/store";

/** "Pekné" čísla pre značky: krok 1/2/5 × 10^n, cca `count` značiek */
export function niceTicks(min: number, max: number, count = 6): number[] {
  const raw = (max - min) / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 5, 10].map((k) => k * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) out.push(Math.round(v / step) * step);
  return out;
}

/** Popisok značky: celé čísla bez desatín, malé hodnoty s jednou platnou číslicou */
function tickLabel(t: number): string {
  if (Number.isInteger(t) || Math.abs(t) >= 10) return t.toFixed(0);
  return Math.abs(t) >= 1 ? t.toFixed(1) : String(Number(t.toPrecision(1)));
}

// Legenda farebnej škály v aktuálnych jednotkách + model, beh a platnosť vrstvy.
export function Legend() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const l = layer.value;
  const scale = COLOR_SCALES[l.scale]!;
  const u = units.value;
  const run = runInfo.value;
  const vt = validTime.value;

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const lut = buildLut(scale, 256);
    const ctx = c.getContext("2d")!;
    const img = ctx.createImageData(256, 1);
    img.data.set(lut);
    ctx.putImageData(img, 0, 0);
  }, [scale]);

  // značky v zobrazovacej jednotke, pozícia cez SI → pozícia v škále
  const unit = unitFor(l.quantity, u);
  const isBft = l.quantity === "speed" && unit === "bft";
  const dMin = fromSI(l.quantity, scale.min, unit);
  const dMax = fromSI(l.quantity, scale.max, unit);
  let ticks = isBft ? [0, 2, 4, 6, 8, 10, 12] : niceTicks(Math.min(dMin, dMax), Math.max(dMin, dMax), 7);
  if (scale.transform === "sqrt") ticks = [0.1, 1, 5, 10, 20, 40].map((mm) => fromSI(l.quantity, mm, unit));
  const tickPos = ticks
    .map((t) => ({ t, pos: scalePosition(scale, toSI(l.quantity, t, unit)) }))
    .filter((x) => x.pos >= 0 && x.pos <= 1);

  // dĺžka intervalu akumulácie = rozdiel od predchádzajúceho kroku
  let accum = "";
  if (l.accumulation && run && vt) {
    const i = timeIndex.value;
    const prev = i > 0 ? run.validTimes[i - 1]! : null;
    accum = prev ? ` za ${Math.round((vt.getTime() - prev.getTime()) / 3_600_000)} h` : " (prvý krok)";
  }

  return (
    <div class="legend">
      <div class="legend-title">
        {l.label}
        {accum} [{unitLabel(l.quantity, u)}]
      </div>
      <div class="legend-bar">
        <canvas ref={canvas} width={256} height={1} />
        {tickPos.map(({ t, pos }) => (
          <span key={t} class="tick" style={{ left: `${pos * 100}%` }}>
            {tickLabel(t)}
          </span>
        ))}
      </div>
      {run && vt && (
        <div class="legend-meta">
          {model.value.label} · beh {formatRun(run.referenceTime)} · {formatValidUtc(vt)} {formatLead(vt, run.referenceTime)}
        </div>
      )}
    </div>
  );
}
