import { describe, expect, it } from "vitest";
import { decodeHash, encodeHash, type ViewState } from "./viewState";

const base: ViewState = {
  model: "icon_eu",
  run: null,
  layer: "temperature",
  level: "sfc",
  overlays: ["isobars"],
  time: null,
  center: [15, 50],
  zoom: 3.6,
};

describe("viewState", () => {
  it("kódovanie a dekódovanie sú inverzné", () => {
    const s: ViewState = {
      ...base,
      run: "2026-10-21T06:00:00.000Z",
      level: 500,
      overlays: ["isobars", "particles"],
      time: "2026-10-22T12:00:00.000Z",
      center: [17.11, 48.15],
      zoom: 6.5,
    };
    const h = encodeHash(s);
    expect(h).toBe("#m=icon_eu&r=2026-10-21T06&l=temperature&lv=500&o=isobars,particles&t=2026-10-22T12&v=17.11,48.15,6.50");
    expect(decodeHash(h, base)).toEqual(s);
  });

  it("najnovší beh a prázdne prekrytia", () => {
    const s = decodeHash("#r=latest&o=", { ...base, run: "2026-10-21T06:00:00.000Z" });
    expect(s.run).toBeNull();
    expect(s.overlays).toEqual([]);
  });

  it("neplatné hodnoty ignoruje", () => {
    const s = decodeHash("#t=zajtra&v=1,200,3&o=isobars,nezmysel&lv=123", base);
    expect(s.level).toBe("sfc");
    expect(s.time).toBeNull();
    expect(s.center).toEqual([15, 50]);
    expect(s.overlays).toEqual(["isobars"]);
  });
});
