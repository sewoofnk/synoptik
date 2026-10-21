import { useMemo } from "preact/hooks";
import { getPointModel } from "../config/pointModels";
import { buildSounding, fetchPoint, levelVariables, type SoundingAt } from "../data/pointForecast";
import { analyzeParcel, freezingLevel, precipitableWater, type ParcelAnalysis } from "../lib/thermo";
import { formatValidUtc } from "../lib/time";
import { format, formatValue, fromSI, unitFor, unitLabel } from "../lib/units";
import { units, validTime } from "../state/store";
import { useAsync } from "./common";
import {
  barbPath,
  dryAdiabatCurve,
  moistAdiabatCurve,
  P_BOTTOM,
  P_TOP,
  pathFrom,
  tempForMixingRatio,
  T_RIGHT,
  xOfT,
  yOfP,
  type Frame,
} from "./skewtGeometry";

// Skew-T log-P: teplota, rosný bod, parcela (povrchová), suché/vlhké adiabaty, izohygry,
// vietorové vlajky (kt) vpravo, indexy LCL/LFC/EL/CAPE/CIN, nulová izoterma, zrážateľná voda.

const DAYS = 7;
const SOUNDING_VARS = [
  "temperature_2m",
  "dew_point_2m",
  "surface_pressure",
  "wind_speed_10m",
  "wind_direction_10m",
  ...levelVariables(),
];

const W = 440;
const H = 500;
const FRAME: Frame = { left: 34, top: 8, width: W - 34 - 44, height: H - 8 - 22 };
const ISOBARS = [1000, 925, 850, 700, 600, 500, 400, 300, 250, 200, 150, 100];
const MIXING = [1, 2, 4, 7, 10, 16, 24]; // g/kg
const ISOTHERM_LABELS = [-40, -30, -20, -10, 0, 10, 20, 30, 40, 50];

/** Statická mriežka diagramu (nezávisí od dát) */
function Grid() {
  const f = FRAME;
  const bottom = f.top + f.height;
  const isotherms: number[] = [];
  for (let t = -150; t <= T_RIGHT; t += 10) isotherms.push(t);
  const dry = useMemo(() => Array.from({ length: 20 }, (_, i) => pathFrom(dryAdiabatCurve(f, 243.15 + i * 10))), []);
  const moist = useMemo(() => Array.from({ length: 12 }, (_, i) => pathFrom(moistAdiabatCurve(f, 265.15 + i * 4))), []);
  const mixing = useMemo(
    () =>
      MIXING.map((w) => {
        const pts: [number, number][] = [];
        for (let p = P_BOTTOM; p >= 60000; p -= 5000) pts.push([xOfT(f, tempForMixingRatio(w / 1000, p) - 273.15, p), yOfP(f, p)]);
        return { w, d: pathFrom(pts), x: pts.at(-1)![0], y: pts.at(-1)![1] };
      }),
    [],
  );

  return (
    <g>
      {ISOBARS.map((p) => (
        <line key={p} class="sk-isobar" x1={f.left} x2={f.left + f.width} y1={yOfP(f, p * 100)} y2={yOfP(f, p * 100)} />
      ))}
      {isotherms.map((t) => (
        <line
          key={t}
          class={t === 0 ? "sk-zero" : "sk-isotherm"}
          x1={xOfT(f, t, P_BOTTOM)}
          y1={bottom}
          x2={xOfT(f, t, P_TOP)}
          y2={f.top}
        />
      ))}
      {dry.map((d, i) => (
        <path key={i} class="sk-dry" d={d} />
      ))}
      {moist.map((d, i) => (
        <path key={i} class="sk-moist" d={d} />
      ))}
      {mixing.map((m) => (
        <g key={m.w}>
          <path class="sk-mix" d={m.d} />
          <text class="sk-mix-label" x={m.x} y={m.y - 2}>
            {m.w}
          </text>
        </g>
      ))}
    </g>
  );
}

function Profile({ s, parcel }: { s: SoundingAt; parcel: ParcelAnalysis }) {
  const f = FRAME;
  const snd = s.sounding;
  const tPath = pathFrom(snd.p.map((p, i) => [xOfT(f, snd.t[i]! - 273.15, p), yOfP(f, p)]));
  const tdPath = pathFrom(snd.p.map((p, i) => [xOfT(f, snd.td[i]! - 273.15, p), yOfP(f, p)]));
  const pp = parcel.parcel;
  const parcelPts = pp.p.map((p, i) => [xOfT(f, pp.t[i]! - 273.15, p), yOfP(f, p)] as [number, number]);

  // CAPE: plocha medzi parcelou a okolím od LFC po EL
  let capeArea = "";
  if (parcel.lfc && parcel.el && parcel.cape > 0) {
    const lfc = parcel.lfc.p;
    const el = parcel.el.p;
    const idx = pp.p.map((p, i) => (p <= lfc && p >= el ? i : -1)).filter((i) => i >= 0);
    const envAt = (p: number) => {
      for (let i = 1; i < snd.p.length; i++) {
        if (p >= snd.p[i]!) {
          const w = Math.log(snd.p[i - 1]! / p) / Math.log(snd.p[i - 1]! / snd.p[i]!);
          return snd.t[i - 1]! + w * (snd.t[i]! - snd.t[i - 1]!);
        }
      }
      return snd.t.at(-1)!;
    };
    const up = idx.map((i) => parcelPts[i]!);
    const down = idx
      .slice()
      .reverse()
      .map((i) => [xOfT(f, envAt(pp.p[i]!) - 273.15, pp.p[i]!), yOfP(f, pp.p[i]!)] as [number, number]);
    if (up.length > 1) capeArea = pathFrom([...up, ...down]) + "Z";
  }

  return (
    <g>
      {capeArea && <path class="sk-cape" d={capeArea} />}
      <path class="sk-parcel" d={pathFrom(parcelPts)} />
      <path class="sk-td" d={tdPath} />
      <path class="sk-t" d={tPath} />
      {(
        [
          ["LCL", parcel.lcl.p],
          ["LFC", parcel.lfc?.p],
          ["EL", parcel.el?.p],
        ] as const
      ).map(([name, p]) =>
        p === undefined ? null : (
          <g key={name}>
            <line class="sk-level" x1={f.left + f.width - 26} x2={f.left + f.width} y1={yOfP(f, p)} y2={yOfP(f, p)} />
            <text class="sk-level-label" x={f.left + f.width - 28} y={yOfP(f, p) + 3} text-anchor="end">
              {name}
            </text>
          </g>
        ),
      )}
    </g>
  );
}

/** Index kroku najbližšieho k času mapy */
function nearestIndex(times: number[], t: number): number {
  let best = 0;
  for (let i = 1; i < times.length; i++) if (Math.abs(times[i]! - t) < Math.abs(times[best]! - t)) best = i;
  return best;
}

interface Props {
  lat: number;
  lon: number;
  modelId: string;
}

export function SkewT({ lat, lon, modelId }: Props) {
  const st = useAsync(() => fetchPoint(lat, lon, [modelId], SOUNDING_VARS, DAYS), [lat, lon, modelId]);
  const us = units.value;
  const vt = validTime.value;
  const series = st.data?.[modelId];

  const result = useMemo(() => {
    if (!series) return null;
    const t = vt ? vt.getTime() : Date.now();
    const idx = nearestIndex(series.times, t);
    const s = buildSounding(series, idx);
    if (!s) return { idx, s: null };
    return {
      idx,
      s,
      parcel: analyzeParcel(s.sounding),
      fzl: freezingLevel(s.sounding),
      pw: precipitableWater(s.sounding),
      outOfRange: Math.abs(series.times[idx]! - t) > 3 * 3600_000,
    };
  }, [series, vt?.getTime()]);

  if (st.error) return <p class="error">Nepodarilo sa načítať sondáž: {st.error}</p>;
  if (!result || !series) return <p class="muted">Načítavam sondáž…</p>;
  const time = new Date(series.times[result.idx]!);
  if (!result.s) return <p class="muted">{getPointModel(modelId).label} nemá pre {formatValidUtc(time)} dosť hladín na sondáž.</p>;

  const { s, parcel } = result;
  const h = (z: number | null | undefined) => (z === null || z === undefined ? "–" : format("height", z, us));
  const hp = (p: number | undefined) => (p === undefined ? "" : ` · ${Math.round(p / 100)} hPa`);
  const tempUnit = unitFor("temperature", us);

  return (
    <div class="skewt">
      <p class="skewt-time">
        Sondáž pre <b>{formatValidUtc(time)}</b>
        {result.outOfRange && <span class="error"> – čas mapy je mimo dosahu modelu</span>}
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} class="skewt-svg" role="img" aria-label="Skew-T log-P diagram">
        <defs>
          <clipPath id="sk-clip">
            <rect x={FRAME.left} y={FRAME.top} width={FRAME.width} height={FRAME.height} />
          </clipPath>
        </defs>
        <g clip-path="url(#sk-clip)">
          <Grid />
          <Profile s={s} parcel={parcel} />
        </g>
        {/* vlajky a popisky mimo orezania */}
        <g>
          {ISOBARS.map((p) => (
            <text key={p} class="sk-label" x={FRAME.left - 4} y={yOfP(FRAME, p * 100) + 3} text-anchor="end">
              {p}
            </text>
          ))}
          {/* popisy izoterm na spodnom okraji v aktuálnych jednotkách */}
          {ISOTHERM_LABELS.map((t) => (
            <text key={t} class="sk-label" x={xOfT(FRAME, t, P_BOTTOM)} y={FRAME.top + FRAME.height + 14} text-anchor="middle">
              {Math.round(fromSI("temperature", t + 273.15, tempUnit))}
            </text>
          ))}
          <rect class="sk-frame" x={FRAME.left} y={FRAME.top} width={FRAME.width} height={FRAME.height} />
          {s.wind.map((w) => {
            const b = barbPath(FRAME.left + FRAME.width + 22, yOfP(FRAME, w.p), w.speed / 0.514444, w.dir, 18);
            return (
              <g key={w.p}>
                <path class="sk-barb" d={b.stroke} />
                {b.fill && <path class="sk-barb-fill" d={b.fill} />}
              </g>
            );
          })}
        </g>
      </svg>
      <dl class="indices">
        <dt>CAPE</dt>
        <dd>{Math.round(parcel.cape)} J/kg</dd>
        <dt>CIN</dt>
        <dd>{parcel.cin > 0 ? `−${Math.round(parcel.cin)}` : "0"} J/kg</dd>
        <dt>LCL</dt>
        <dd>
          {h(parcel.lcl.z)}
          {hp(parcel.lcl.p)}
        </dd>
        <dt>LFC</dt>
        <dd>
          {parcel.lfc ? h(parcel.lfc.z) : "–"}
          {hp(parcel.lfc?.p)}
        </dd>
        <dt>EL</dt>
        <dd>
          {parcel.el ? h(parcel.el.z) : "–"}
          {hp(parcel.el?.p)}
        </dd>
        <dt>0 °C</dt>
        <dd>{h(result.fzl)}</dd>
        <dt>Zrážateľná voda</dt>
        <dd>{format("precipitation", result.pw ?? NaN, us)}</dd>
        <dt>Pri zemi</dt>
        <dd>
          {formatValue("temperature", s.sounding.t[0]!, us)} / {format("temperature", s.sounding.td[0]!, us)} ·{" "}
          {format("pressure", s.surfaceP, us)}
        </dd>
      </dl>
      <p class="muted note">
        Povrchová parcela, virtuálna teplota. Vlajky v uzloch (polovičné pierko 5 kt, celé 10 kt, trojuholník 50 kt).
        Izohygry v g/kg. Popisy osi teploty sú v {unitLabel("temperature", us)}. Čas sondáže sa riadi časovou osou mapy.
      </p>
    </div>
  );
}

