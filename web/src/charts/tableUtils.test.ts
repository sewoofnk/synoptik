import { describe, expect, it } from "vitest";
import { columnIndices, dayGroups, nearestColumn, windowMax, windowSum } from "./tableUtils";

const H = 3_600_000;
const t0 = Date.UTC(2026, 9, 21, 0);
const times = Array.from({ length: 30 }, (_, i) => t0 + i * H);

describe("columnIndices", () => {
  it("každá 3. hodina UTC", () => {
    expect(columnIndices(times).slice(0, 4)).toEqual([0, 3, 6, 9]);
    expect(columnIndices([t0 + H, t0 + 2 * H, t0 + 3 * H])).toEqual([2]);
  });
});

describe("dayGroups", () => {
  it("súčet rozpätí = počet stĺpcov, deň v lokálnom čase", () => {
    const cols = columnIndices(times);
    const g = dayGroups(times, cols);
    expect(g.reduce((s, x) => s + x.span, 0)).toBe(cols.length);
    expect(g[0]!.label).toMatch(/^(Streda|Utorok) \d+$/);
  });
});

describe("agregácia hodín", () => {
  const a = [1, null, 2, 3, null];
  it("súčet za okno (i − n, i]", () => {
    expect(windowSum(a, 3, 3)).toBe(5);
    expect(windowSum([null, null], 1, 3)).toBeNull();
    expect(windowSum(a, 0, 3)).toBe(1); // okraj
  });
  it("maximum za okno", () => {
    expect(windowMax(a, 4, 3)).toBe(3);
    expect(windowMax([null], 0, 3)).toBeNull();
  });
});

describe("nearestColumn", () => {
  it("najbližší stĺpec, mimo rozsahu −1", () => {
    const cols = columnIndices(times);
    expect(nearestColumn(times, cols, t0 + 4 * H)).toBe(1);
    expect(nearestColumn(times, cols, t0 + 100 * H)).toBe(-1);
  });
});
