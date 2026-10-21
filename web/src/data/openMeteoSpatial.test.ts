import { describe, expect, it } from "vitest";
import { parseLatest, runPath, stepUrl } from "./openMeteoSpatial";

// Výrez skutočného latest.json (dwd_icon_eu, 2026-10-21)
const sample = {
  completed: true,
  reference_time: "2026-10-21T09:00:00Z",
  last_modified_time: "2026-10-21T11:53:00Z",
  valid_times: ["2026-10-21T09:00Z", "2026-10-21T10:00Z"],
  variables: ["pressure_msl", "temperature_2m"],
};

describe("openMeteoSpatial", () => {
  it("parsuje latest.json", () => {
    const r = parseLatest("dwd_icon_eu", sample);
    expect(r.referenceTime.toISOString()).toBe("2026-10-21T09:00:00.000Z");
    expect(r.validTimes.map((d) => d.toISOString())).toEqual(["2026-10-21T09:00:00.000Z", "2026-10-21T10:00:00.000Z"]);
    expect(r.completed).toBe(true);
    expect(r.variables).toContain("temperature_2m");
  });

  it("odmietne zlý formát", () => {
    expect(() => parseLatest("x", { foo: 1 })).toThrow();
  });

  it("skladá cestu behu a URL kroku", () => {
    const ref = new Date("2026-10-21T00:00:00Z");
    expect(runPath(ref)).toBe("2026/10/21/0000Z");
    // Overená URL – súbor existoval na S3 (33,5 MB, všetky premenné)
    expect(stepUrl("dwd_icon_eu", ref, new Date("2026-10-21T12:00:00Z"))).toBe(
      "https://openmeteo.s3.amazonaws.com/data_spatial/dwd_icon_eu/2026/10/21/0000Z/2026-10-21T1200.om",
    );
  });
});
