import { describe, expect, it } from "vitest";
import { buildSounding, parsePointResponse, pointUrl, type PointSeries } from "./pointForecast";

const series = (over: Record<string, number | null> = {}): PointSeries => {
  const base: Record<string, number | null> = {
    surface_pressure: 99000,
    temperature_2m: 290,
    dew_point_2m: 285,
    wind_speed_10m: 3,
    wind_direction_10m: 180,
    temperature_1000hPa: 291, // pod terénom, preskočí sa
    dew_point_1000hPa: 286,
    geopotential_height_1000hPa: 100,
    temperature_850hPa: 280,
    dew_point_850hPa: 270,
    geopotential_height_850hPa: 1500,
    wind_speed_850hPa: 10,
    wind_direction_850hPa: 270,
    temperature_700hPa: 270,
    dew_point_700hPa: 260,
    geopotential_height_700hPa: 3000,
    temperature_500hPa: 250,
    dew_point_500hPa: 240,
    geopotential_height_500hPa: 5500,
    ...over,
  };
  const vars: Record<string, (number | null)[]> = {};
  for (const [k, v] of Object.entries(base)) vars[k] = [v];
  return { times: [0], vars, elevation: 150 };
};

describe("buildSounding", () => {
  it("začína povrchom a preskočí hladiny pod terénom", () => {
    const s = buildSounding(series(), 0)!;
    expect(s.sounding.z[0]).toBe(150);
    expect(s.sounding.p).toEqual([99000, 85000, 70000, 50000]);
    expect(s.wind.map((w) => w.p)).toEqual([99000, 85000]);
  });

  it("hladina s chýbajúcou hodnotou sa vynechá", () => {
    const s = buildSounding(series({ dew_point_700hPa: null }), 0);
    // zostanú iba 3 hladiny → príliš málo na sondáž
    expect(s).toBeNull();
  });

  it("rosný bod nikdy nepresiahne teplotu", () => {
    const s = buildSounding(series({ dew_point_850hPa: 285 }), 0)!;
    expect(s.sounding.td[1]).toBe(280);
  });

  it("bez povrchových údajov → null", () => {
    expect(buildSounding(series({ surface_pressure: null }), 0)).toBeNull();
  });
});

describe("parsePointResponse", () => {
  it("prevedie °C → K, hPa → Pa a rozlíši prípony modelov", () => {
    const json = {
      elevation: 159,
      hourly: {
        time: [1792540800],
        temperature_2m_icon_eu: [10],
        temperature_2m_gfs025: [11],
        pressure_msl_icon_eu: [1012.5],
        pressure_msl_gfs025: [null],
      },
    };
    const d = parsePointResponse(json as never, ["icon_eu", "gfs025"], ["temperature_2m", "pressure_msl"]);
    expect(d.icon_eu!.vars.temperature_2m![0]).toBeCloseTo(283.15, 6);
    expect(d.icon_eu!.vars.pressure_msl![0]).toBeCloseTo(101250, 6);
    expect(d.gfs025!.vars.pressure_msl![0]).toBeNull();
    expect(d.icon_eu!.times[0]).toBe(1792540800000);
  });

  it("jeden model → premenné bez prípony", () => {
    const json = { elevation: 0, hourly: { time: [0], wind_speed_10m: [5] } };
    const d = parsePointResponse(json as never, ["icon_eu"], ["wind_speed_10m"]);
    expect(d.icon_eu!.vars.wind_speed_10m).toEqual([5]);
  });
});

describe("pointUrl", () => {
  it("žiada m/s, UNIX čas a GMT", () => {
    const u = pointUrl(48.15, 17.11, ["icon_eu", "gfs025"], ["temperature_2m"], 5);
    expect(u).toContain("models=icon_eu%2Cgfs025");
    expect(u).toContain("wind_speed_unit=ms");
    expect(u).toContain("timeformat=unixtime");
  });
});
