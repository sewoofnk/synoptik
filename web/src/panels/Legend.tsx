import { useEffect, useRef } from "preact/hooks";
import { buildLut, COLOR_SCALES, scalePosition } from "../config/colorscales";
import { fromSI, toSI, UNIT_OPTIONS, unitFor, unitLabel, type UnitSettings } from "../lib/units";
import { layer, stepRun, units, validTime } from "../state/store";

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

/** Ďalšia jednotka pre veličinu (klik na štítok jednotky v legende, ako vo Windy) */
function cycleUnit(q: keyof typeof UNIT_OPTIONS, u: UnitSettings): UnitSettings {
  const opts = UNIT_OPTIONS[q] as readonly string[];
  const next = opts[(opts.indexOf(u[q]) + 1) % opts.length]!;
  return { ...u, preset: "custom", [q]: next };
}

// Legenda farebnej škály v aktuálnych jednotkách. Klik na jednotku ju prepne.
export function Legend() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const l = layer.value;
  const scale = COLOR_SCALES[l.scale]!;
  const u = units.value;
  const run = stepRun.value;
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
    .filter((x) => x.pos >= 0.02 && x.pos <= 0.98);

  // dĺžka intervalu akumulácie = rozdiel od predchádzajúceho kroku
  let accum = "";
  if (l.accumulation && run && vt) {
    // predchádzajúci krok toho istého behu (zrážky sú súčet od neho)
    const prev = run.validTimes.filter((t) => t.getTime() < vt.getTime()).at(-1) ?? null;
    accum = prev ? `/${Math.round((vt.getTime() - prev.getTime()) / 3_600_000)} h` : "";
  }
  const q = l.quantity === "percent" ? null : l.quantity;

  return (
    <div class="legend glass" title={`${l.label} [${unitLabel(l.quantity, u)}]`}>
      <button
        class="unit-chip"
        disabled={!q}
        onClick={() => q && (units.value = cycleUnit(q, u))}
        title={q ? "Prepnúť jednotku" : undefined}
        aria-label={`Jednotka ${unitLabel(l.quantity, u)}${q ? ", klik prepne" : ""}`}
      >
        {unitLabel(l.quantity, u)}
        {accum}
      </button>
      <div class="legend-bar">
        <canvas ref={canvas} width={256} height={1} />
        {tickPos.map(({ t, pos }) => (
          <span key={t} class="tick" style={{ left: `${pos * 100}%` }}>
            {tickLabel(t)}
          </span>
        ))}
      </div>
    </div>
  );
}
