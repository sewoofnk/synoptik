import { describe, expect, it } from "vitest";
import { dominantCode, weatherSymbol } from "./weatherCode";

describe("weatherSymbol", () => {
  it("deň a noc pri jasnom počasí", () => {
    expect(weatherSymbol(0, true)!.icon).toBe("☀️");
    expect(weatherSymbol(0, false)!.icon).toBe("🌙");
    expect(weatherSymbol(95)!.label).toBe("Búrka");
  });

  it("chýbajúci kód → null, neznámy → bodka", () => {
    expect(weatherSymbol(null)).toBeNull();
    expect(weatherSymbol(42)!.icon).toBe("·");
  });

  it("v 3 h stĺpci vyhrá najvýraznejší jav", () => {
    expect(dominantCode([1, 61, 3])).toBe(61);
    expect(dominantCode([null, undefined])).toBeNull();
  });
});
