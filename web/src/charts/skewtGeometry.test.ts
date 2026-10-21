import { describe, expect, it } from "vitest";
import { saturationMixingRatio } from "../lib/thermo";
import { barbPath, P_BOTTOM, P_TOP, tempForMixingRatio, xOfT, yOfP, type Frame } from "./skewtGeometry";

const f: Frame = { left: 0, top: 0, width: 300, height: 400 };

describe("osi Skew-T", () => {
  it("spodný a horný okraj zodpovedá P_BOTTOM a P_TOP", () => {
    expect(yOfP(f, P_BOTTOM)).toBeCloseTo(400, 6);
    expect(yOfP(f, P_TOP)).toBeCloseTo(0, 6);
  });

  it("izoterma je sklonená o 45° (posun x = posun y)", () => {
    const dy = yOfP(f, 100000) - yOfP(f, 50000);
    const dx = xOfT(f, 0, 50000) - xOfT(f, 0, 100000);
    expect(dx).toBeCloseTo(dy, 6);
  });
});

describe("izohygry", () => {
  it("inverzia zmiešavacieho pomeru sedí s thermo.saturationMixingRatio", () => {
    for (const [w, p] of [[0.004, 85000], [0.01, 100000], [0.001, 60000]] as const) {
      expect(saturationMixingRatio(tempForMixingRatio(w, p), p)).toBeCloseTo(w, 6);
    }
  });
});

describe("vietorová vlajka", () => {
  const count = (s: string, c: string) => s.split(c).length - 1;

  it("65 kt = 1 trojuholník + 1 celé pierko + 1 polovičné", () => {
    const b = barbPath(0, 0, 65, 270);
    expect(count(b.fill, "Z")).toBe(1);
    // žrď + celé + polovičné = 3 úsečky
    expect(count(b.stroke, "M")).toBe(3);
  });

  it("pod 2,5 kt je krúžok bezvetria", () => {
    expect(barbPath(0, 0, 2, 90).stroke).toContain("a3,3");
  });

  it("žrď smeruje tam, odkiaľ vietor fúka (severný vietor → hore)", () => {
    const b = barbPath(100, 100, 20, 0);
    const m = /L([\d.-]+),([\d.-]+)/.exec(b.stroke)!;
    expect(Number(m[1])).toBeCloseTo(100, 1);
    expect(Number(m[2])).toBeLessThan(100);
  });
});
