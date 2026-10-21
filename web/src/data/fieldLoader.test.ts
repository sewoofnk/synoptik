import { describe, expect, it } from "vitest";
import { convertToSI, minMax } from "./fieldLoader";

describe("fieldLoader", () => {
  it("prevod Open-Meteo → SI", () => {
    const t = new Float32Array([0, -10, 21.5]);
    convertToSI("temperature_850hPa", t);
    expect(Array.from(t)).toEqual([273.15, 263.15, 294.65].map(Math.fround));

    const p = new Float32Array([1013.25]);
    convertToSI("pressure_msl", p);
    expect(p[0]).toBeCloseTo(101325, 0);

    const w = new Float32Array([5.8]);
    convertToSI("wind_u_component_10m", w);
    expect(w[0]).toBe(Math.fround(5.8)); // m/s bez zmeny
  });

  it("minMax ignoruje NaN", () => {
    expect(minMax(new Float32Array([3, NaN, -1, 7]))).toEqual([-1, 7]);
  });
});

describe("align", () => {
  it("jemnejšiu mriežku prevzorkuje na hrubšiu (lineárne pole sa zachová)", async () => {
    const { align } = await import("./fieldLoader");
    const fine = { nx: 5, ny: 5, lat0: 0, lon0: 0, dlat: 0.5, dlon: 0.5 };
    const coarse = { nx: 3, ny: 3, lat0: 0, lon0: 0, dlat: 1, dlon: 1 };
    const fd = new Float32Array(25).map((_, i) => (i % 5) * 0.5); // = lon
    const cd = new Float32Array(9);
    const r = align([
      { variable: "a", grid: fine, data: fd, min: 0, max: 2 },
      { variable: "b", grid: coarse, data: cd, min: 0, max: 0 },
    ]);
    expect(r.grid).toBe(coarse);
    expect(Array.from(r.arrays[0]!.slice(0, 3))).toEqual([0, 1, 2]);
    expect(r.arrays[1]).toBe(cd);
  });
});
