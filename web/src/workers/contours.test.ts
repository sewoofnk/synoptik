import { describe, expect, it } from "vitest";
import { computeContours, downsample, ringsToLines, thresholds } from "./contours";

describe("contours", () => {
  it("prahy izobár po 4 hPa", () => {
    expect(thresholds(99_810, 101_250, 400)).toEqual([100_000, 100_400, 100_800, 101_200]);
  });

  it("zriedenie priemerom 2×2 a posun stredu bunky", () => {
    const g = { nx: 4, ny: 2, lat0: 50, lon0: 10, dlat: 1, dlon: 1 };
    const r = downsample(new Float32Array([1, 3, 5, 7, 1, 3, 5, NaN]), g, 2);
    expect(Array.from(r.data)).toEqual([2, 17 / 3].map(Math.fround));
    expect(r.grid).toEqual({ nx: 2, ny: 1, lat0: 50.5, lon0: 10.5, dlat: 2, dlon: 2 });
  });

  it("okrajové body rozdelia čiaru", () => {
    const ring: [number, number][] = [[0, 1], [1, 1], [2, 1], [3, 0], [3, 2], [2, 2]];
    // [3,0] a [3,2] ležia na okraji; samostatný bod [2,2] nie je čiara
    expect(ringsToLines(ring, 3, 3)).toEqual([[[1, 1], [2, 1]]]);
  });

  it("lineárne pole v smere lon → zvislé izočiary na správnej dĺžke", () => {
    // hodnota = lon (stupne), mriežka 0–10° × 40–50°, krok 1°
    const nx = 11, ny = 11;
    const data = new Float32Array(nx * ny);
    for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) data[y * nx + x] = x;
    const f = computeContours({ data, grid: { nx, ny, lat0: 40, lon0: 0, dlat: 1, dlon: 1 }, interval: 5, factor: 1 });
    const five = f.filter((x) => x.properties.v === 5);
    expect(five.length).toBe(1);
    for (const [lon, lat] of five[0]!.geometry.coordinates) {
      expect(lon).toBeCloseTo(5, 6);
      expect(lat).toBeGreaterThanOrEqual(40);
      expect(lat).toBeLessThanOrEqual(50);
    }
  });
});
