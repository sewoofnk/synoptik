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
