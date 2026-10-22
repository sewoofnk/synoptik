import { describe, expect, it } from "vitest";
import { latestSynopTerm, ogimetTime, parseMetarCsv, parseOgimet, splitCsv } from "../../../shared/obs";

// Hlavička a riadky zo skutočného metars.cache.csv (2026-10-22)
const HEADER =
  "raw_text,station_id,observation_time,latitude,longitude,temp_c,dewpoint_c,wind_dir_degrees,wind_speed_kt,wind_gust_kt,visibility_statute_mi,altim_in_hg,sea_level_pressure_mb,corrected,auto,auto_station,maintenance_indicator_on,no_signal,lightning_sensor_off,freezing_rain_sensor_off,present_weather_sensor_off,wx_string,sky_cover,cloud_base_ft_agl,sky_cover,cloud_base_ft_agl,sky_cover,cloud_base_ft_agl,sky_cover,cloud_base_ft_agl,flight_category,three_hr_pressure_tendency_mb,maxT_c,minT_c,maxT24hr_c,minT24hr_c,precip_in,pcp3hr_in,pcp6hr_in,pcp24hr_in,snow_in,vert_vis_ft,metar_type,elevation_m";
const LZKZ =
  '"METAR LZKZ 221430Z 03006KT CAVOK 11/08 Q1013 NOSIG",LZKZ,2026-10-22T14:30:00.000Z,48.6610,21.2400,11,8,30,6,,6+,29.91,,,,,,TRUE,,,,,,,,,,,,,VFR,,,,,,,,,,,,METAR,227';
const LRSV_OLD =
  '"METAR LRSV 221400Z 12009KT 4000 BR BKN001 12/12 Q1021",LRSV,2026-10-22T14:00:00.000Z,47.686,26.354,12,12,120,9,,2.49,30.15,,,,,,,,,,BR,BKN,100,BKN,1100,,,,,LIFR,,,,,,,,,,,,METAR,406';
const LRSV_NEW = LRSV_OLD.replace("221400Z", "221430Z").replace("T14:00", "T14:30");
const CYSY =
  '"SPECI CYSY 221432Z 31021KT 15SM DRSN SCT010 M07/M08 A2966",CYSY,2026-10-22T14:32:00.000Z,71.9930,-125.2410,-7,-8,310,21,,15,29.66,1005.6,,,,,,,,,DRSN,SCT,1000,,,,,,,VFR,,,,,,,,,,,,SPECI,83';

describe("METAR CSV", () => {
  it("úvodzovky a čiarky", () => {
    expect(splitCsv('"a,b",c,,d')).toEqual(["a,b", "c", "", "d"]);
  });

  it("výrez Európy, najnovší METAR stanice, prevody jednotiek", () => {
    const r = parseMetarCsv([HEADER, LZKZ, LRSV_OLD, LRSV_NEW, CYSY].join("\n"));
    expect(r.map((x) => x.id).sort()).toEqual(["LRSV", "LZKZ"]);
    const kz = r.find((x) => x.id === "LZKZ")!;
    expect(kz).toMatchObject({ t: 11, td: 8, wd: 30, ws: 6, vis: 9999, cat: "VFR", elev: 227 });
    expect(kz.qnh).toBe(1013); // zo skupiny Q1013, nie z 29,91 inHg
    const sv = r.find((x) => x.id === "LRSV")!;
    expect(sv.raw).toContain("221430Z");
    expect(sv.vis).toBe(4007);
    expect(sv.clouds).toEqual([
      ["BKN", 100],
      ["BKN", 1100],
    ]);
  });
});

describe("OGIMET", () => {
  const text = [
    "11816,2026,10,22,12,00,AAXX 22121 11816 01682 63007 10137 20046 30023 40182 53011 69901 70162 83872 333 60005==",
    "11816,2026,10,22,12,00,AAXX 22121 11816 01682 63008 10137 20046 30023 40182 53011 69901 70162 83872 333 60005==",
    "00000,2026,10,22,12,00,AAXX 2212/ 00000 NIL==",
    "72503,2026,10,22,12,00,AAXX 22121 72503 32970 32505 10200==",
    "12345,2026,10,22,12,00,AAXX 2212/ 12345 NIL==",
  ].join("\n");

  it("iba Európa, bez NIL, posledná verzia stanice", () => {
    const r = parseOgimet(text);
    expect(r).toHaveLength(1);
    expect(r[0]!.wmo).toBe("11816");
    expect(r[0]!.msg).toContain("63008");
    expect(r[0]!.msg.endsWith("=")).toBe(false);
    expect(new Date(r[0]!.time).toISOString()).toBe("2026-10-22T12:00:00.000Z");
  });

  it("posledný termín s oneskorením a formát času", () => {
    expect(latestSynopTerm(new Date("2026-10-22T14:20Z")).toISOString()).toBe("2026-10-22T12:00:00.000Z");
    expect(latestSynopTerm(new Date("2026-10-22T13:00Z")).toISOString()).toBe("2026-10-22T09:00:00.000Z");
    expect(ogimetTime(new Date("2026-10-22T09:00Z"))).toBe("202610220900");
  });
});
