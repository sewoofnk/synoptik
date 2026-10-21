// Geometria diagramu Skew-T log-P a vietorové vlajky. Čisté funkcie (testované), kreslí SkewT.tsx.

import { dryAdiabat, EPS, moistAdiabat } from "../lib/thermo";

export const P_BOTTOM = 105000; // Pa
export const P_TOP = 10000;
/** Teplotný rozsah na spodnom okraji [°C] */
export const T_LEFT = -40;
export const T_RIGHT = 50;

export interface Frame {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** y [px] pre tlak p [Pa]; logaritmická os, 100 hPa hore */
export function yOfP(f: Frame, p: number): number {
  return f.top + (f.height * Math.log(p / P_TOP)) / Math.log(P_BOTTOM / P_TOP);
}

/** x [px] pre teplotu t [°C] pri tlaku p; izotermy sklonené o 45° */
export function xOfT(f: Frame, t: number, p: number): number {
  const base = f.left + ((t - T_LEFT) / (T_RIGHT - T_LEFT)) * f.width;
  return base + (f.top + f.height - yOfP(f, p));
}

export function pathFrom(points: [number, number][]): string {
  return points.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
}

/** Body krivky t(p) [K] v rozsahu tlakov */
export function curve(f: Frame, tOfP: (p: number) => number, pFrom: number, pTo: number, step = 2500): [number, number][] {
  const pts: [number, number][] = [];
  for (let p = pFrom; p >= pTo - 1; p -= step) pts.push([xOfT(f, tOfP(p) - 273.15, p), yOfP(f, p)]);
  return pts;
}

/** Suchá adiabata s potenciálnou teplotou theta [K] */
export function dryAdiabatCurve(f: Frame, theta: number): [number, number][] {
  return curve(f, (p) => dryAdiabat(theta, 100000, p), P_BOTTOM, P_TOP);
}

/** Vlhká adiabata prechádzajúca bodom (t1000 [K], 1000 hPa) */
export function moistAdiabatCurve(f: Frame, t1000: number): [number, number][] {
  const pts: [number, number][] = [];
  let t = moistAdiabat(t1000, 100000, P_BOTTOM);
  let p = P_BOTTOM;
  pts.push([xOfT(f, t - 273.15, p), yOfP(f, p)]);
  while (p > 20000) {
    const next = p - 2500;
    t = moistAdiabat(t, p, next);
    p = next;
    pts.push([xOfT(f, t - 273.15, p), yOfP(f, p)]);
  }
  return pts;
}

/** Teplota [K], pri ktorej má nasýtený vzduch pri tlaku p zmiešavací pomer w [kg/kg] (inverzia Boltona) */
export function tempForMixingRatio(w: number, p: number): number {
  const e = (w * p) / (EPS + w);
  const l = Math.log(e / 611.2);
  return 273.15 + (243.5 * l) / (17.67 - l);
}

/**
 * Vietorová vlajka ako SVG path. Žrď smeruje k smeru, odkiaľ vietor fúka.
 * Polovičné pierko 5 kt, celé 10 kt, trojuholník 50 kt (zaokrúhlené na 5 kt).
 */
export function barbPath(x: number, y: number, speedKt: number, dirDeg: number, len = 26): { stroke: string; fill: string } {
  const a = (dirDeg * Math.PI) / 180;
  // jednotkový vektor od stredu k smeru, odkiaľ fúka (y v SVG rastie nadol)
  const ux = Math.sin(a);
  const uy = -Math.cos(a);
  // kolmica pre pierka (v severnej pologuli vpravo od žrde pri pohľade od stredu → doľava z konca)
  const px = -uy;
  const py = ux;
  const tipX = x + ux * len;
  const tipY = y + uy * len;
  let stroke = `M${x.toFixed(1)},${y.toFixed(1)}L${tipX.toFixed(1)},${tipY.toFixed(1)}`;
  let fill = "";
  let v = Math.round(speedKt / 5) * 5;
  if (v < 5) {
    // bezvetrie: krúžok
    return { stroke: `M${(x + 3).toFixed(1)},${y.toFixed(1)}a3,3 0 1,0 -6,0a3,3 0 1,0 6,0`, fill: "" };
  }
  const gap = 4;
  const feather = 10;
  let pos = 0; // vzdialenosť od špičky žrde
  const at = (d: number) => [tipX - ux * d, tipY - uy * d] as const;
  while (v >= 50) {
    const [bx, by] = at(pos);
    const [cx, cy] = at(pos + gap * 1.5);
    fill += `M${bx.toFixed(1)},${by.toFixed(1)}L${(bx + px * feather).toFixed(1)},${(by + py * feather).toFixed(1)}L${cx.toFixed(1)},${cy.toFixed(1)}Z`;
    pos += gap * 2;
    v -= 50;
  }
  while (v >= 10) {
    const [bx, by] = at(pos);
    stroke += `M${bx.toFixed(1)},${by.toFixed(1)}l${(px * feather + ux * 3).toFixed(1)},${(py * feather + uy * 3).toFixed(1)}`;
    pos += gap;
    v -= 10;
  }
  if (v >= 5) {
    // samostatné polovičné pierko sa odsadí od konca, aby sa nezamenilo s celým
    if (pos === 0) pos = gap;
    const [bx, by] = at(pos);
    stroke += `M${bx.toFixed(1)},${by.toFixed(1)}l${((px * feather + ux * 3) / 2).toFixed(1)},${((py * feather + uy * 3) / 2).toFixed(1)}`;
  }
  return { stroke, fill };
}
