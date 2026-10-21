// Termodynamika atmosféry pre Skew-T. Všetko v SI: teplota K, tlak Pa, výška m.
// Vzorce: Bolton (1980) pre nasýtený tlak pary a LCL; vlhká adiabata integrovaná RK4.

export const RD = 287.04; // plynová konštanta suchého vzduchu, J/(kg·K)
export const CP = 1005.7; // merná tepelná kapacita pri konštantnom tlaku, J/(kg·K)
export const LV = 2.501e6; // výparné teplo, J/kg
export const EPS = 0.622;
export const G = 9.80665;
export const KAPPA = RD / CP;
const T0 = 273.15;

/** Nasýtený tlak vodnej pary nad vodou [Pa], T v K (Bolton 1980) */
export function saturationVaporPressure(t: number): number {
  const c = t - T0;
  return 611.2 * Math.exp((17.67 * c) / (c + 243.5));
}

/** Zmiešavací pomer nasýtenia [kg/kg] pri teplote t [K] a tlaku p [Pa] */
export function saturationMixingRatio(t: number, p: number): number {
  const es = saturationVaporPressure(t);
  return (EPS * es) / (p - es);
}

/** Zmiešavací pomer [kg/kg] z rosného bodu [K] a tlaku [Pa] */
export function mixingRatioFromDewpoint(td: number, p: number): number {
  return saturationMixingRatio(td, p);
}

/** Rosný bod [K] z teploty [K] a relatívnej vlhkosti [%] */
export function dewpointFromRH(t: number, rh: number): number {
  const e = (Math.max(rh, 0.01) / 100) * saturationVaporPressure(t);
  const l = Math.log(e / 611.2);
  return T0 + (243.5 * l) / (17.67 - l);
}

/** Potenciálna teplota [K] vzhľadom na 1000 hPa */
export function potentialTemperature(t: number, p: number): number {
  return t * Math.pow(100000 / p, KAPPA);
}

/** Teplota po suchoadiabatickom pohybe z (t0, p0) na tlak p */
export function dryAdiabat(t0: number, p0: number, p: number): number {
  return t0 * Math.pow(p / p0, KAPPA);
}

/** Virtuálna teplota [K] zo zmiešavacieho pomeru [kg/kg] */
export function virtualTemperature(t: number, r: number): number {
  return (t * (1 + r / EPS)) / (1 + r);
}

/** Teplota LCL [K] podľa Boltona (1980, rov. 15) */
export function lclTemperature(t: number, td: number): number {
  if (td >= t) return t;
  return 1 / (1 / (td - 56) + Math.log(t / td) / 800) + 56;
}

/** Tlak LCL [Pa] zo zdvihu parcely z (t, p) s rosným bodom td */
export function lclPressure(t: number, td: number, p: number): number {
  return p * Math.pow(lclTemperature(t, td) / t, 1 / KAPPA);
}

/** dT/dp [K/Pa] pri vlhkoadiabatickom pohybe nasýtenej parcely */
function moistLapse(t: number, p: number): number {
  const rs = saturationMixingRatio(t, p);
  return (1 / p) * ((RD * t + LV * rs) / (CP + (LV * LV * rs * EPS) / (RD * t * t)));
}

/** Teplota nasýtenej parcely po vlhkej adiabate z (t0, p0) na tlak p (RK4 s krokom ≤ 500 Pa) */
export function moistAdiabat(t0: number, p0: number, p: number): number {
  const n = Math.max(1, Math.ceil(Math.abs(p - p0) / 500));
  const h = (p - p0) / n;
  let t = t0;
  let pc = p0;
  for (let i = 0; i < n; i++) {
    const k1 = moistLapse(t, pc);
    const k2 = moistLapse(t + (h / 2) * k1, pc + h / 2);
    const k3 = moistLapse(t + (h / 2) * k2, pc + h / 2);
    const k4 = moistLapse(t + h * k3, pc + h);
    t += (h / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
    pc += h;
  }
  return t;
}

/** Sondáž: hladiny zoradené od zeme nahor (tlak klesá) */
export interface Sounding {
  /** tlak [Pa] */
  p: number[];
  /** teplota [K] */
  t: number[];
  /** rosný bod [K] */
  td: number[];
  /** výška [m] */
  z: number[];
}

export interface ParcelAnalysis {
  /** tlak a výška LCL */
  lcl: { p: number; z: number };
  /** null, ak parcela nikdy nedosiahne kladný vztlak */
  lfc: { p: number; z: number } | null;
  el: { p: number; z: number } | null;
  /** J/kg */
  cape: number;
  /** J/kg, kladná veľkosť */
  cin: number;
  /** Teplota parcely na hladinách siete (pre kreslenie) */
  parcel: { p: number[]; t: number[] };
}

/**
 * CAPE a CIN z profilu virtuálnych teplôt parcely a okolia na hustej sieti ln p.
 * `p` klesá. Integrál R_d · ∫ (Tv_parcela − Tv_okolie) d ln p, CAPE = kladné časti
 * nad LFC až po EL, CIN = záporné časti pod LFC.
 */
export function integrateBuoyancy(p: number[], tvParcel: number[], tvEnv: number[], lcl: number) {
  let cape = 0;
  let cin = 0;
  let lfcIdx = -1;
  let elIdx = -1;
  for (let i = 0; i < p.length; i++) {
    if (p[i]! > lcl) continue; // parcela pod LCL sa pre LFC neuvažuje
    if (tvParcel[i]! > tvEnv[i]!) {
      if (lfcIdx < 0) lfcIdx = i;
      elIdx = i;
    }
  }
  for (let i = 1; i < p.length; i++) {
    const b0 = tvParcel[i - 1]! - tvEnv[i - 1]!;
    const b1 = tvParcel[i]! - tvEnv[i]!;
    const dlnp = Math.log(p[i - 1]! / p[i]!);
    const area = RD * ((b0 + b1) / 2) * dlnp;
    if (lfcIdx >= 0 && i - 1 >= lfcIdx && i <= elIdx) {
      if (area > 0) cape += area;
    } else if (lfcIdx < 0 || i <= lfcIdx) {
      if (area < 0) cin += -area;
    }
  }
  return { cape, cin, lfcIdx, elIdx };
}

/** Lineárna interpolácia v ln p (p klesá) */
function interpLogP(ps: number[], vs: number[], p: number): number {
  if (p >= ps[0]!) return vs[0]!;
  for (let i = 1; i < ps.length; i++) {
    if (p >= ps[i]!) {
      const w = Math.log(ps[i - 1]! / p) / Math.log(ps[i - 1]! / ps[i]!);
      return vs[i - 1]! + w * (vs[i]! - vs[i - 1]!);
    }
  }
  return vs.at(-1)!;
}

/** Zdvih parcely zo spodnej hladiny sondáže (povrchová parcela) */
export function analyzeParcel(s: Sounding, topPressure = 10000): ParcelAnalysis {
  const p0 = s.p[0]!;
  const t0 = s.t[0]!;
  const td0 = s.td[0]!;
  const r0 = mixingRatioFromDewpoint(td0, p0);
  const tl = lclTemperature(t0, td0);
  const pl = lclPressure(t0, td0, p0);

  const grid: number[] = [];
  for (let p = p0; p >= topPressure; p -= 250) grid.push(p);
  const tParcel: number[] = [];
  const tvParcel: number[] = [];
  const tvEnv: number[] = [];
  // okolie nad najvyššou hladinou sondáže sa nepoužije
  const pTop = Math.max(s.p.at(-1)!, topPressure);
  const used = grid.filter((p) => p >= pTop);
  let tm = tl;
  let pm = pl;
  for (const p of used) {
    let tp: number;
    let rp: number;
    if (p >= pl) {
      tp = dryAdiabat(t0, p0, p);
      rp = r0;
    } else {
      tm = moistAdiabat(tm, pm, p);
      pm = p;
      tp = tm;
      rp = saturationMixingRatio(tp, p);
    }
    tParcel.push(tp);
    tvParcel.push(virtualTemperature(tp, rp));
    const te = interpLogP(s.p, s.t, p);
    const tde = interpLogP(s.p, s.td, p);
    tvEnv.push(virtualTemperature(te, mixingRatioFromDewpoint(Math.min(tde, te), p)));
  }

  const { cape, cin, lfcIdx, elIdx } = integrateBuoyancy(used, tvParcel, tvEnv, pl);
  const at = (p: number) => ({ p, z: heightAt(s, p) });
  return {
    lcl: at(pl),
    lfc: lfcIdx >= 0 ? at(used[lfcIdx]!) : null,
    el: lfcIdx >= 0 && elIdx >= 0 ? at(used[elIdx]!) : null,
    cape,
    cin: lfcIdx >= 0 ? cin : 0,
    parcel: { p: used, t: tParcel },
  };
}

/** Výška [m] pri tlaku p (interpolácia z geopotenciálu v ln p) */
export function heightAt(s: Sounding, p: number): number {
  if (p >= s.p[0]!) return s.z[0]!;
  const last = s.p.length - 1;
  if (p < s.p[last]!) {
    // extrapolácia hydrostaticky z poslednej vrstvy
    const tAvg = s.t[last]!;
    return s.z[last]! + ((RD * tAvg) / G) * Math.log(s.p[last]! / p);
  }
  return interpLogP(s.p, s.z, p);
}

/** Výška nulovej izotermy [m] – najnižší prechod cez 0 °C smerom nahor; null ak nie je */
export function freezingLevel(s: Sounding): number | null {
  for (let i = 1; i < s.t.length; i++) {
    const a = s.t[i - 1]!;
    const b = s.t[i]!;
    if ((a - T0) * (b - T0) <= 0 && a !== b) {
      const w = (a - T0) / (a - b);
      return s.z[i - 1]! + w * (s.z[i]! - s.z[i - 1]!);
    }
  }
  return s.t[0]! < T0 ? s.z[0]! : null;
}

/** Zrážateľná voda [mm = kg/m²] integrovaná po najvyššiu hladinu sondáže */
export function precipitableWater(s: Sounding): number {
  let pw = 0;
  for (let i = 1; i < s.p.length; i++) {
    const q = (p: number, td: number) => {
      const r = mixingRatioFromDewpoint(td, p);
      return r / (1 + r);
    };
    const qa = q(s.p[i - 1]!, s.td[i - 1]!);
    const qb = q(s.p[i]!, s.td[i]!);
    pw += (((qa + qb) / 2) * (s.p[i - 1]! - s.p[i]!)) / G;
  }
  return pw;
}
