import { describe, expect, it } from "vitest";
import { getLayer, isLayerAvailable, overlaySources, overlayVariables, resolveLayer, sourceVariables } from "./layers.config";

const L = (id: string) => getLayer(id)!;

describe("resolveLayer", () => {
  it("teplota pri povrchu a v 500 hPa", () => {
    const sfc = resolveLayer(L("temperature"), "sfc");
    expect(sfc.label).toBe("Teplota 2 m");
    expect(sourceVariables(sfc.source)).toEqual(["temperature_2m"]);
    const up = resolveLayer(L("temperature"), 500);
    expect(up.label).toBe("Teplota 500 hPa");
    expect(sourceVariables(up.source)).toEqual(["temperature_500hPa"]);
    expect(up.scale).toBe("temperature_500");
  });

  it("vietor v hladine je rýchlosť z u/v tej hladiny", () => {
    const r = resolveLayer(L("wind"), 300);
    expect(r.source).toEqual({ kind: "speed", u: "wind_u_component_300hPa", v: "wind_v_component_300hPa" });
  });

  it("povrchová vrstva pri hladine ostáva pri povrchu a hovorí to v názve", () => {
    const r = resolveLayer(L("precipitation"), 850);
    expect(r.level).toBe("sfc");
    expect(r.label).toBe("Zrážky (povrch)");
  });

  it("geopotenciál pri povrchu → 500 hPa", () => {
    const r = resolveLayer(L("geopotential"), "sfc");
    expect(r.level).toBe(500);
    expect(sourceVariables(r.source)).toEqual(["geopotential_height_500hPa"]);
  });

  it("relatívna topografia nezávisí od hladiny a má vlastné izočiary", () => {
    const r = resolveLayer(L("thickness_500_1000"), 300);
    expect(r.label).toBe("Relatívna topografia 500/1000");
    expect(sourceVariables(r.source)).toEqual(["geopotential_height_500hPa", "geopotential_height_1000hPa"]);
    expect(overlaySources(r, 300).isolines).toEqual(r.source);
  });

  it("staré ID vrstiev z URL sa preložia", () => {
    expect(getLayer("temperature_2m")!.id).toBe("temperature");
    expect(getLayer("wind_10m")!.id).toBe("wind");
  });
});

describe("prekrytia a dostupnosť", () => {
  it("izočiary: povrch = MSLP, hladina = izohypsy", () => {
    const t = resolveLayer(L("temperature"), "sfc");
    expect(overlayVariables("isobars", t, "sfc")).toEqual(["pressure_msl"]);
    expect(overlayVariables("isobars", resolveLayer(L("temperature"), 700), 700)).toEqual(["geopotential_height_700hPa"]);
    expect(overlayVariables("particles", t, 250)).toEqual(["wind_u_component_250hPa", "wind_v_component_250hPa"]);
  });

  it("vrstva je nedostupná, ak model nemá premennú (ECMWF bez nárazov)", () => {
    const ecmwf = ["temperature_2m", "pressure_msl"];
    expect(isLayerAvailable(L("wind_gusts_10m"), "sfc", ecmwf)).toBe(false);
    expect(isLayerAvailable(L("temperature"), "sfc", ecmwf)).toBe(true);
    expect(isLayerAvailable(L("temperature"), "sfc", undefined)).toBe(true);
  });
});

describe("konvekcia", () => {
  it("strih vetra potrebuje vietor 500 hPa a 10 m, nezávisí od hladiny", () => {
    const r = resolveLayer(L("shear_0_6km"), 850);
    expect(sourceVariables(r.source)).toEqual(["wind_u_component_500hPa", "wind_v_component_500hPa", "wind_u_component_10m", "wind_v_component_10m"]);
    expect(r.label).toBe("Strih vetra 0–6 km (500 hPa − 10 m)");
  });

  it("Lifted Index iba pri modeli, ktorý ho má (GFS)", () => {
    expect(isLayerAvailable(L("lifted_index"), "sfc", ["cape", "lifted_index"])).toBe(true);
    expect(isLayerAvailable(L("lifted_index"), "sfc", ["cape"])).toBe(false);
  });
});
