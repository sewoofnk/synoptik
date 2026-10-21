import { describe, expect, it } from "vitest";
import { parseMeta, parseRunPrefixes, runPath, stepUrl } from "./openMeteoSpatial";

// Výrez skutočného latest.json (dwd_icon_eu, 2026-10-21)
const sample = {
  completed: true,
  reference_time: "2026-10-21T09:00:00Z",
  last_modified_time: "2026-10-21T11:53:00Z",
  valid_times: ["2026-10-21T10:00Z", "2026-10-21T09:00Z"],
  variables: ["pressure_msl", "temperature_2m"],
  crs_wkt: 'GEOGCRS["WGS 84",\n USAGE[\n SCOPE["grid"],\n BBOX[29.5,-23.5,70.5,62.5]]]',
};

describe("openMeteoSpatial", () => {
  it("parsuje meta/latest.json a triedi kroky", () => {
    const r = parseMeta("dwd_icon_eu", sample);
    expect(r.referenceTime.toISOString()).toBe("2026-10-21T09:00:00.000Z");
    expect(r.validTimes.map((d) => d.toISOString())).toEqual(["2026-10-21T09:00:00.000Z", "2026-10-21T10:00:00.000Z"]);
    expect(r.completed).toBe(true);
    expect(r.bbox).toEqual([29.5, -23.5, 70.5, 62.5]);
  });

  it("odmietne zlý formát", () => {
    expect(() => parseMeta("x", { foo: 1 })).toThrow();
  });

  it("skladá cestu behu a URL kroku", () => {
    const ref = new Date("2026-10-21T00:00:00Z");
    expect(runPath(ref)).toBe("2026/10/21/0000Z");
    // Overená URL – súbor existoval na S3 (33,5 MB, všetky premenné)
    expect(stepUrl("dwd_icon_eu", ref, new Date("2026-10-21T12:00:00Z"))).toBe(
      "https://openmeteo.s3.amazonaws.com/data_spatial/dwd_icon_eu/2026/10/21/0000Z/2026-10-21T1200.om",
    );
  });

  it("parsuje výpis behov z S3", () => {
    // Skrátený skutočný ListObjectsV2 výstup
    const xml = `<ListBucketResult><Prefix>data_spatial/dwd_icon_eu/2026/10/20/</Prefix>
      <CommonPrefixes><Prefix>data_spatial/dwd_icon_eu/2026/10/20/0000Z/</Prefix></CommonPrefixes>
      <CommonPrefixes><Prefix>data_spatial/dwd_icon_eu/2026/10/20/2100Z/</Prefix></CommonPrefixes></ListBucketResult>`;
    expect(parseRunPrefixes(xml).map((d) => d.toISOString())).toEqual([
      "2026-10-20T00:00:00.000Z",
      "2026-10-20T21:00:00.000Z",
    ]);
  });
});

describe("combineRuns / partFor (GFS z dvoch priečinkov)", () => {
  const gfs025 = { ...sample, variables: ["pressure_msl", "temperature_500hPa"], reference_time: "2026-10-21T06:00:00Z" };
  const gfs013 = { ...sample, variables: ["temperature_2m"], reference_time: "2026-10-21T06:00:00Z" };
  const older = { ...sample, variables: ["temperature_2m"], reference_time: "2026-10-21T00:00:00Z" };

  it("zjednotí premenné a vyberie priečinok podľa premennej", async () => {
    const { combineRuns, partFor } = await import("./openMeteoSpatial");
    const r = combineRuns(parseMeta("ncep_gfs025", gfs025), [parseMeta("ncep_gfs013", gfs013)], [25, -35, 75, 65]);
    expect(r.variables.sort()).toEqual(["pressure_msl", "temperature_2m", "temperature_500hPa"]);
    const t = new Date("2026-10-21T10:00Z");
    expect(partFor(r, "temperature_2m", t)!.spatialId).toBe("ncep_gfs013");
    expect(partFor(r, "temperature_500hPa", t)!.spatialId).toBe("ncep_gfs025");
    expect(partFor(r, "temperature_2m", new Date("2026-10-21T11:00Z"))).toBeNull();
    expect(r.crop).toEqual([25, -35, 75, 65]);
  });

  it("doplnok z iného behu sa nepoužije", async () => {
    const { combineRuns } = await import("./openMeteoSpatial");
    const r = combineRuns(parseMeta("ncep_gfs025", gfs025), [parseMeta("ncep_gfs013", older)], null);
    expect(r.variables).not.toContain("temperature_2m");
    expect(r.parts).toHaveLength(1);
  });
});
