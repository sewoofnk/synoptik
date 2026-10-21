import { describe, expect, it } from "vitest";
import { buildLut, colorAt, COLOR_SCALES, scalePosition, scaleValueAt } from "./colorscales";

describe("colorscales", () => {
  it("zarážky sú vzostupne a v rozsahu škály", () => {
    for (const s of Object.values(COLOR_SCALES)) {
      for (let i = 1; i < s.stops.length; i++) expect(s.stops[i]![0]).toBeGreaterThan(s.stops[i - 1]![0]);
      expect(s.stops[0]![0]).toBeGreaterThanOrEqual(s.min);
      expect(s.stops.at(-1)![0]).toBeLessThanOrEqual(s.max);
    }
  });

  it("teplota: ostrý prechod pri 0 °C", () => {
    const t = COLOR_SCALES.temperature!;
    expect(colorAt(t, 273.14)).toEqual([180, 226, 255, 255]); // tesne pod nulou modrá
    expect(colorAt(t, 273.15)).toEqual([191, 232, 166, 255]); // nula zelená
  });

  it("zrážky pod 0,1 mm priehľadné", () => {
    const p = COLOR_SCALES.precipitation!;
    expect(colorAt(p, 0.05)[3]).toBe(0);
    expect(colorAt(p, 0.1)[3]).toBeGreaterThan(0);
  });

  it("sqrt transformácia a inverzia", () => {
    const p = COLOR_SCALES.precipitation!;
    expect(scalePosition(p, 15)).toBeCloseTo(0.5, 12);
    expect(scaleValueAt(p, scalePosition(p, 7))).toBeCloseTo(7, 10);
  });

  it("LUT má 256 farieb", () => {
    expect(buildLut(COLOR_SCALES.wind!).length).toBe(1024);
  });
});

describe("cssGradient", () => {
  it("vytvorí platný CSS prechod s požadovaným počtom zarážok", async () => {
    const { cssGradient, COLOR_SCALES } = await import("./colorscales");
    const g = cssGradient(COLOR_SCALES.temperature!, 90, 0, 1, 4);
    expect(g.startsWith("linear-gradient(90deg, rgb(")).toBe(true);
    expect(g.match(/rgb\(/g)!.length).toBe(4);
    expect(g.endsWith("100%)")).toBe(true);
  });
});

describe("škály tlakových hladín", () => {
  it("každá hladina má teplotu, vietor a geopotenciál", async () => {
    const { COLOR_SCALES } = await import("./colorscales");
    for (const l of [850, 700, 500, 300, 250]) {
      expect(COLOR_SCALES[`temperature_${l}`]).toBeDefined();
      expect(COLOR_SCALES[`wind_${l}`]).toBeDefined();
      expect(COLOR_SCALES[`gph_${l}`]).toBeDefined();
    }
    // 0 °C ostáva ostrá hranica aj vo výškovej škále
    const t = COLOR_SCALES.temperature_upper!;
    expect(colorAt(t, 273.14)[2]).toBeGreaterThan(colorAt(t, 273.15)[2]);
  });
});
