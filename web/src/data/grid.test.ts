import { describe, expect, it } from "vitest";
import { gridFromBbox, gridLatMax, gridLonMax, parseWktBbox, sampleBilinear, sampleNearest } from "./grid";

// Skutočný crs_wkt z dwd_icon_eu/latest.json
const WKT = `GEOGCRS["WGS 84",\n    USAGE[\n        SCOPE["grid"],\n        BBOX[29.5,-23.5,70.5,62.5]]]`;

describe("grid", () => {
  it("ICON-EU: bbox + rozmery → krok 0,0625°", () => {
    const g = gridFromBbox(parseWktBbox(WKT), 657, 1377);
    expect(g.dlat).toBeCloseTo(0.0625, 12);
    expect(g.dlon).toBeCloseTo(0.0625, 12);
    expect(gridLatMax(g)).toBeCloseTo(70.5, 10);
    expect(gridLonMax(g)).toBeCloseTo(62.5, 10);
  });

  it("globálna mriežka GFS", () => {
    const g = gridFromBbox(parseWktBbox("BBOX[-90.0,-180.0,90.0,179.75]"), 721, 1440);
    expect(g.dlat).toBeCloseTo(0.25, 12);
    expect(g.dlon).toBeCloseTo(0.25, 12);
  });

  // Mriežka 3×2: hodnota = 10·riadok + stĺpec
  const g = { nx: 3, ny: 2, lat0: 50, lon0: 10, dlat: 1, dlon: 1 };
  const data = [0, 1, 2, 10, 11, 12];

  it("bilineárna interpolácia", () => {
    expect(sampleBilinear(g, data, 50, 10)).toBe(0);
    expect(sampleBilinear(g, data, 51, 12)).toBe(12); // pravý horný roh
    expect(sampleBilinear(g, data, 50.5, 10.5)).toBeCloseTo(5.5, 12);
    expect(sampleBilinear(g, data, 50.25, 11)).toBeCloseTo(3.5, 12);
    expect(sampleBilinear(g, data, 49.9, 10)).toBeNaN();
  });

  it("najbližšia bunka", () => {
    expect(sampleNearest(g, data, 50.6, 11.4)).toBe(11);
    expect(sampleNearest(g, data, 52, 11)).toBeNaN();
  });
});
