import { describe, expect, it } from "vitest";
import { beaufort, format, formatValue, fromSI, isUnitSettings, PRESETS, toSI, type Quantity } from "./units";

const metric = { ...PRESETS.metric };
const aviation = { ...PRESETS.aviation };

describe("units – referenčné hodnoty", () => {
  it("teplota", () => {
    expect(fromSI("temperature", 273.15, "C")).toBeCloseTo(0, 10);
    expect(fromSI("temperature", 273.15, "F")).toBeCloseTo(32, 10);
    expect(fromSI("temperature", 373.15, "F")).toBeCloseTo(212, 10);
    expect(fromSI("temperature", 233.15, "F")).toBeCloseTo(-40, 10); // −40 °C = −40 °F
  });

  it("rýchlosť", () => {
    expect(fromSI("speed", 10, "kmh")).toBeCloseTo(36, 10);
    expect(fromSI("speed", 10, "kt")).toBeCloseTo(19.4384, 4);
    expect(fromSI("speed", 10, "mph")).toBeCloseTo(22.3694, 4);
  });

  it("tlak – štandardná atmosféra", () => {
    expect(fromSI("pressure", 101325, "hPa")).toBeCloseTo(1013.25, 10);
    expect(fromSI("pressure", 101325, "inHg")).toBeCloseTo(29.921, 3);
    expect(fromSI("pressure", 101325, "mmHg")).toBeCloseTo(760, 3);
  });

  it("výška, zrážky, vzdialenosť", () => {
    expect(fromSI("height", 0.3048, "ft")).toBeCloseTo(1, 10);
    expect(fromSI("height", 3048, "ft")).toBeCloseTo(10000, 6);
    expect(fromSI("precipitation", 25.4, "in")).toBeCloseTo(1, 10);
    expect(fromSI("distance", 1852, "nm")).toBeCloseTo(1, 10);
    expect(fromSI("distance", 1609.344, "mi")).toBeCloseTo(1, 10);
    expect(fromSI("distance", 1000, "km")).toBeCloseTo(1, 10);
  });

  it("Beaufort podľa hraníc WMO", () => {
    expect(beaufort(0.2)).toBe(0);
    expect(beaufort(5)).toBe(3);
    expect(beaufort(10)).toBe(5);
    expect(beaufort(20)).toBe(8);
    expect(beaufort(32.7)).toBe(12);
  });

  it("toSI je inverzia fromSI", () => {
    const cases: [Quantity, number, string][] = [
      ["temperature", 290, "F"], ["temperature", 250, "C"], ["speed", 7, "kt"], ["speed", 7, "mph"],
      ["speed", 7, "bft"], ["pressure", 99000, "inHg"], ["pressure", 99000, "mmHg"], ["height", 1234, "ft"],
      ["precipitation", 3, "in"], ["distance", 5000, "nm"],
    ];
    for (const [q, v, u] of cases) expect(toSI(q, fromSI(q, v, u), u)).toBeCloseTo(v, 8);
  });
});

describe("units – formátovanie", () => {
  it("predvoľby", () => {
    expect(format("temperature", 293.15, metric)).toBe("20.0 °C");
    expect(format("speed", 10, metric)).toBe("36 km/h");
    expect(format("speed", 10, aviation)).toBe("19 kt");
    expect(format("height", 3048, aviation)).toBe("10000 ft");
    expect(format("pressure", 101325, metric)).toBe("1013.3 hPa");
  });

  it("bez zápornej nuly a s NaN", () => {
    expect(formatValue("temperature", 273.13, metric)).toBe("0.0");
    expect(formatValue("temperature", NaN, metric)).toBe("–");
  });

  it("Bft sa formátuje podľa hraníc", () => {
    expect(format("speed", 10, { ...metric, preset: "custom", speed: "bft" })).toBe("5 Bft");
  });

  it("validácia uložených nastavení", () => {
    expect(isUnitSettings(metric)).toBe(true);
    expect(isUnitSettings({ ...metric, speed: "furlong" })).toBe(false);
    expect(isUnitSettings(null)).toBe(false);
  });
});
