import { describe, expect, it } from "vitest";
import { ensembleStats, parseEnsemble, quantile } from "./ensemble";

describe("quantile", () => {
  it("lineárna interpolácia (rovnako ako numpy default)", () => {
    const s = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(quantile(s, 0.5)).toBeCloseTo(5.5, 10);
    expect(quantile(s, 0.1)).toBeCloseTo(1.9, 10);
    expect(quantile(s, 0.9)).toBeCloseTo(9.1, 10);
    expect(quantile([7], 0.9)).toBe(7);
  });
});

describe("ensembleStats", () => {
  // 4 členy, 2 časy
  const m = [
    [270, 1],
    [272, 2],
    [274, null],
    [276, 4],
  ];

  it("medián a percentily po časoch, null sa ignoruje", () => {
    const s = ensembleStats(m, 273.15, false);
    expect(s.median[0]).toBeCloseTo(273, 10);
    expect(s.median[1]).toBeCloseTo(2, 10);
    expect(s.p10[0]).toBeCloseTo(270.6, 10);
    expect(s.p90[0]).toBeCloseTo(275.4, 10);
  });

  it("pravdepodobnosť pod prahom / nad prahom v %", () => {
    expect(ensembleStats(m, 273.15, false).prob[0]).toBe(50);
    expect(ensembleStats(m, 1.5, true).prob[1]).toBeCloseTo(66.667, 2);
  });

  it("čas bez hodnôt → null", () => {
    const s = ensembleStats([[null], [null]], 0, true);
    expect(s.median[0]).toBeNull();
    expect(s.prob[0]).toBeNull();
  });
});

describe("parseEnsemble", () => {
  it("rozdelí kontrolný beh a členy, prevedie °C → K", () => {
    const d = parseEnsemble(
      { hourly: { time: [0], temperature_2m: [1], temperature_2m_member02: [3], temperature_2m_member01: [2] } } as never,
      "temperature_2m",
    );
    expect(d.control![0]).toBeCloseTo(274.15, 6);
    expect(d.members.map((x) => x[0])).toEqual([275.15, 276.15]);
  });
});
