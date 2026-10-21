import { describe, expect, it } from "vitest";
import {
  analyzeParcel,
  dewpointFromRH,
  freezingLevel,
  integrateBuoyancy,
  lclPressure,
  lclTemperature,
  moistAdiabat,
  potentialTemperature,
  precipitableWater,
  saturationMixingRatio,
  saturationVaporPressure,
  type Sounding,
} from "./thermo";

const K = (c: number) => c + 273.15;

describe("nasýtená para a vlhkosť", () => {
  it("e_s pri 0 a 20 °C (Bolton)", () => {
    expect(saturationVaporPressure(K(0))).toBeCloseTo(611.2, 1);
    expect(saturationVaporPressure(K(20))).toBeCloseTo(2339, -1);
  });

  it("nasýtený zmiešavací pomer pri 20 °C a 1000 hPa ≈ 14,9 g/kg", () => {
    expect(saturationMixingRatio(K(20), 100000) * 1000).toBeCloseTo(14.9, 0);
  });

  it("rosný bod z RH: 20 °C a 50 % → 9,3 °C; 100 % → T", () => {
    expect(dewpointFromRH(K(20), 50) - 273.15).toBeCloseTo(9.3, 1);
    expect(dewpointFromRH(K(15), 100)).toBeCloseTo(K(15), 6);
  });

  it("potenciálna teplota: 15 °C pri 850 hPa ≈ 301,8 K", () => {
    expect(potentialTemperature(K(15), 85000)).toBeCloseTo(301.8, 0);
  });
});

describe("LCL", () => {
  it("30 °C / rosný bod 20 °C → T_LCL ≈ 17,7 °C, p_LCL ≈ 860 hPa", () => {
    expect(lclTemperature(K(30), K(20)) - 273.15).toBeCloseTo(17.7, 0);
    expect(lclPressure(K(30), K(20), 100000) / 100).toBeCloseTo(860, -1);
  });

  it("nasýtená parcela: LCL = východisko", () => {
    expect(lclTemperature(K(10), K(10))).toBe(K(10));
  });
});

describe("vlhká adiabata", () => {
  it("20 °C / 1000 hPa → 500 hPa ≈ −11 až −8 °C (zhruba 4,4 K/km v spodnej vrstve)", () => {
    const t = moistAdiabat(K(20), 100000, 50000) - 273.15;
    expect(t).toBeGreaterThan(-13);
    expect(t).toBeLessThan(-6);
  });

  it("je teplejšia než suchá adiabata a pri -40 °C sa k nej blíži", () => {
    const dry = K(20) * Math.pow(0.5, 0.2857);
    expect(moistAdiabat(K(20), 100000, 50000)).toBeGreaterThan(dry);
    const cold = moistAdiabat(K(-40), 30000, 20000);
    const coldDry = K(-40) * Math.pow(20 / 30, 0.2857);
    expect(Math.abs(cold - coldDry)).toBeLessThan(1);
  });

  it("spätný pohyb dá východisko (reverzibilita)", () => {
    const up = moistAdiabat(K(18), 90000, 60000);
    expect(moistAdiabat(up, 60000, 90000)).toBeCloseTo(K(18), 2);
  });
});

describe("CAPE/CIN – integrál", () => {
  it("konštantný prebytok Tv 2 K medzi 800 a 300 hPa → R_d·2·ln(800/300)", () => {
    const p: number[] = [];
    for (let x = 100000; x >= 20000; x -= 250) p.push(x);
    const env = p.map(() => 250);
    const parcel = p.map((x) => (x <= 80000 && x >= 30000 ? 252 : 248));
    const r = integrateBuoyancy(p, parcel, env, 90000);
    // hrubá sieť hrán → tolerancia 3 %
    expect(r.cape).toBeGreaterThan(287.04 * 2 * Math.log(800 / 300) * 0.97);
    expect(r.cape).toBeLessThan(287.04 * 2 * Math.log(800 / 300) * 1.03);
    expect(r.lfcIdx).toBeGreaterThanOrEqual(0);
  });

  it("parcela chladnejšia než okolie → CAPE 0 a žiadny LFC", () => {
    const p = [100000, 90000, 80000, 70000];
    const r = integrateBuoyancy(p, [250, 245, 240, 235], [251, 247, 242, 238], 95000);
    expect(r.cape).toBe(0);
    expect(r.lfcIdx).toBe(-1);
  });
});

/** Sondáž s lineárnym poklesom teploty so zemepisnou výškou (hydrostatika) */
function lapseSounding(t0c: number, td0c: number, lapse: number, dewDepression: number): Sounding {
  const p: number[] = [];
  const t: number[] = [];
  const td: number[] = [];
  const z: number[] = [];
  let zc = 0;
  let pc = 100000;
  let tc = K(t0c);
  for (let i = 0; i < 40; i++) {
    p.push(pc);
    t.push(tc);
    z.push(zc);
    td.push(i === 0 ? K(td0c) : tc - dewDepression);
    const dz = 500;
    const tNext = tc - lapse * dz;
    const tMean = (tc + tNext) / 2;
    pc *= Math.exp((-9.80665 * dz) / (287.04 * tMean));
    zc += dz;
    tc = tNext;
  }
  return { p, t, td, z };
}

describe("analyzeParcel", () => {
  it("labilná vlhká sondáž dá CAPE v rozumnom rozsahu, LCL pod LFC, LFC pod EL", () => {
    const a = analyzeParcel(lapseSounding(28, 22, 0.0075, 6));
    expect(a.cape).toBeGreaterThan(500);
    expect(a.cape).toBeLessThan(6000);
    expect(a.lfc).not.toBeNull();
    expect(a.el).not.toBeNull();
    expect(a.lcl.z).toBeGreaterThan(0);
    expect(a.lfc!.z).toBeGreaterThanOrEqual(a.lcl.z);
    expect(a.el!.z).toBeGreaterThan(a.lfc!.z);
  });

  it("stabilná sondáž (inverzia) → CAPE 0 a žiadny LFC", () => {
    const a = analyzeParcel(lapseSounding(10, 5, -0.003, 8));
    expect(a.cape).toBe(0);
    expect(a.lfc).toBeNull();
    expect(a.el).toBeNull();
  });

  it("výška LCL ≈ 125 m na každý stupeň rozdielu T − Td", () => {
    const a = analyzeParcel(lapseSounding(30, 20, 0.0065, 5));
    expect(a.lcl.z).toBeGreaterThan(1100);
    expect(a.lcl.z).toBeLessThan(1500);
  });
});

describe("nulová izoterma a zrážateľná voda", () => {
  it("interpoluje výšku prechodu cez 0 °C", () => {
    const s: Sounding = {
      p: [100000, 90000, 80000],
      t: [K(10), K(2), K(-6)],
      td: [K(5), K(0), K(-8)],
      z: [100, 1000, 2000],
    };
    expect(freezingLevel(s)).toBeCloseTo(1250, 0);
  });

  it("žiadny prechod, teplá sondáž → null; zemný mráz → výška zeme", () => {
    const warm: Sounding = { p: [100000, 90000], t: [K(20), K(10)], td: [K(10), K(5)], z: [0, 1000] };
    expect(freezingLevel(warm)).toBeNull();
    const frozen: Sounding = { p: [100000, 90000], t: [K(-5), K(-10)], td: [K(-8), K(-12)], z: [50, 1000] };
    expect(freezingLevel(frozen)).toBe(50);
  });

  it("PW vlhkej tropickej sondáže je rádovo desiatky mm", () => {
    const s = lapseSounding(28, 24, 0.0065, 4);
    const pw = precipitableWater(s);
    expect(pw).toBeGreaterThan(30);
    expect(pw).toBeLessThan(80);
  });
});
