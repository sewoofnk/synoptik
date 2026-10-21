import { describe, expect, it } from "vitest";
import { Lcc, reprojectLcc, type LccGrid } from "./lcc";

// ALADIN CE 2 km podľa zdrojov Open-Meteo (ChmiDomain.swift), overené voči API (R-011)
const ALADIN: LccGrid = { nx: 1053, ny: 837, firstLat: 38.599, firstLon: 1.334, dx: 2325, dy: 2325, lat0: 46.244, lon0: 17, radius: 6371229 };

describe("LCC ALADIN CE 2 km", () => {
  const lcc = new Lcc(ALADIN);

  it("prvý bod mriežky má index (0, 0)", () => {
    const [i, j] = lcc.index(38.599, 1.334);
    expect(i).toBeCloseTo(0, 6);
    expect(j).toBeCloseTo(0, 6);
  });

  it("indexy bodov sedia s hodnotami overenými voči Forecast API", () => {
    // Košice, Bratislava, Berlín, Odesa, Barcelona – najbližšia bunka, kde S3 = API
    const cases: [number, number, number, number][] = [
      [48.72, 21.26, 721, 431],
      [48.15, 17.11, 590, 400],
      [52.52, 13.4, 481, 612],
      [45.0, 30.0, 1025, 285],
      [41.9, 4.0, 125, 139],
    ];
    for (const [lat, lon, ei, ej] of cases) {
      const [i, j] = lcc.index(lat, lon);
      expect(Math.round(i)).toBe(ei);
      expect(Math.round(j)).toBe(ej);
    }
  });

  it("stredný poludník je zvislý (x nezávisí od šírky pri lon0)", () => {
    expect(lcc.forward(40, 17)[0]).toBeCloseTo(0, 6);
    expect(lcc.forward(55, 17)[0]).toBeCloseTo(0, 6);
  });
});

describe("reprojectLcc", () => {
  // malá mriežka: hodnota = index stĺpca → po reprojekcii musí byť hodnota = spojitý index i
  const g: LccGrid = { nx: 40, ny: 30, firstLat: 47, firstLon: 15, dx: 10000, dy: 10000, lat0: 46.244, lon0: 17, radius: 6371229 };
  const lcc = new Lcc(g);
  const src = new Float32Array(g.nx * g.ny);
  for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) src[j * g.nx + i] = i;

  it("bilineárne prevzorkovanie zachová lineárne pole a mimo oblasti dá NaN", () => {
    const t = { latMin: 46, lonMin: 14, latMax: 50, lonMax: 21, dlat: 0.5, dlon: 0.5 };
    const r = reprojectLcc(src, lcc, t);
    expect(r.ny).toBe(9);
    expect(r.nx).toBe(15);
    // bod vo vnútri: 48 N, 17 E
    const row = Math.round((48 - 46) / 0.5), col = Math.round((17 - 14) / 0.5);
    expect(r.data[row * r.nx + col]).toBeCloseTo(lcc.index(48, 17)[0], 3);
    // 46 N je južne od prvého bodu (47 N) → mimo
    expect(Number.isNaN(r.data[0]!)).toBe(true);
  });

  it("nesedia rozmery → chyba", () => {
    expect(() => reprojectLcc(new Float32Array(10), lcc, { latMin: 0, lonMin: 0, latMax: 1, lonMax: 1, dlat: 1, dlon: 1 })).toThrow();
  });
});
