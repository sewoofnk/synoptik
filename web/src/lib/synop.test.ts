import { describe, expect, it } from "vitest";
import { decodeSynop, decodeVis } from "./synop";

// Skutočné správy z OGIMET 22.10.2026 12 UTC
const KOSICE = "AAXX 22121 11968 01460 83604 10122 20116 39841 40115 53003 60141 76062 8472/ 333 60035 84712 88517";
const BRATISLAVA = "AAXX 22121 11816 01682 63007 10137 20046 30023 40182 53011 69901 70162 83872 333 60005 82836 83643 85359 91014";
const CHOPOK = "AAXX 22121 11812 05/70 /3014 10087 20033 39481 42779 50006 69951 333 60005";

describe("decodeSynop", () => {
  it("Košice: oblačnosť, vietor, T/Td, tlak, tendencia, zrážky, počasie", () => {
    const s = decodeSynop(KOSICE)!;
    expect(s.n).toBe(8);
    expect(s.dir).toBe(360);
    expect(s.ff).toBe(4); // iw = 1 → m/s
    expect(s.t! - 273.15).toBeCloseTo(12.2, 6);
    expect(s.td! - 273.15).toBeCloseTo(11.6, 6);
    expect(s.p! / 100).toBeCloseTo(984.1, 6);
    expect(s.pmsl! / 100).toBeCloseTo(1011.5, 6);
    expect(s.tendency).toEqual({ a: 3, dp: 30 });
    expect(s.precip).toEqual({ mm: 14, hours: 6 });
    expect(s.ww).toBe(60); // slabý dážď s prestávkami
    expect(s.vis).toBe(10000); // VV 60
    expect(s.h).toBe(4);
  });

  it("Bratislava: tlak MSL nad 1000 hPa a náraz z oddielu 3", () => {
    const s = decodeSynop(BRATISLAVA)!;
    expect(s.dir).toBe(300);
    expect(s.ff).toBe(7);
    expect(s.p! / 100).toBeCloseTo(1002.3, 6);
    expect(s.pmsl! / 100).toBeCloseTo(1018.2, 6);
    expect(s.gust).toBe(14);
    expect(s.tendency).toEqual({ a: 3, dp: 110 });
  });

  it("Chopok: chýbajúca oblačnosť, geopotenciál namiesto MSL, záporná teplota nie", () => {
    const s = decodeSynop(CHOPOK)!;
    expect(s.n).toBeNull();
    expect(s.dir).toBe(300);
    expect(s.ff).toBe(14);
    expect(s.pmsl).toBeNull(); // 42779 = 925 hPa, 779 gpm
    expect(s.p! / 100).toBeCloseTo(948.1, 6);
  });

  it("uzly, záporná teplota, relatívna vlhkosť, bezvetrie", () => {
    const s = decodeSynop("AAXX 22124 12345 41/// 50000 11052 29085 40123")!;
    expect(s.ff).toBe(0);
    expect(s.dir).toBe(0);
    expect(s.t! - 273.15).toBeCloseTo(-5.2, 6);
    expect(s.rh).toBe(85);
    expect(s.td).toBeNull();
    const k = decodeSynop("AAXX 22124 12345 41/// 52710 10010")!;
    expect(k.ff).toBeCloseTo(10 * 0.514444, 6);
  });

  it("nie SYNOP → null", () => {
    expect(decodeSynop("METAR LZKZ 221430Z")).toBeNull();
  });
});

describe("decodeVis", () => {
  it("tabuľka WMO 4377", () => {
    expect(decodeVis(20)).toBe(2000);
    expect(decodeVis(60)).toBe(10000);
    expect(decodeVis(82)).toBe(40000);
    expect(decodeVis(97)).toBe(10000);
  });
});
