import { describe, expect, it } from "vitest";
import { buildTimeline, nearestStepIndex } from "./timeline";

const d = (s: string) => new Date(s);
const hours = (from: string, n: number, step = 1) =>
  Array.from({ length: n }, (_, i) => new Date(d(from).getTime() + i * step * 3_600_000));

describe("buildTimeline", () => {
  // ICON-EU: behy každé 3 h, krok 1 h
  const current = { referenceTime: d("2026-10-21T12:00Z"), validTimes: hours("2026-10-21T12:00Z", 6) };
  const runs = [d("2026-10-21T06:00Z"), d("2026-10-21T09:00Z"), d("2026-10-21T12:00Z"), d("2026-10-21T15:00Z")];

  it("minulé časy berie z behu tesne pred nimi s predstihom +1 až +3 h", () => {
    const s = buildTimeline(current, runs, 1, d("2026-10-21T13:00Z"), 0.25);
    // história od 07Z (13Z − 6 h) do 12Z vrátane, potom aktuálny beh od 13Z
    expect(s.map((x) => x.t.toISOString().slice(11, 13))).toEqual(["07", "08", "09", "10", "11", "12", "13", "14", "15", "16", "17"]);
    expect(s[0]!.ref.toISOString()).toBe("2026-10-21T06:00:00.000Z");
    expect(s[3]!.ref.toISOString()).toBe("2026-10-21T09:00:00.000Z"); // 10Z = beh 09Z +1 h
    expect(s[5]!).toMatchObject({ history: true }); // 12Z z behu 09Z (+3 h), nie +0 h aktuálneho
    expect(s[5]!.ref.toISOString()).toBe("2026-10-21T09:00:00.000Z");
    expect(s[6]!).toMatchObject({ history: false });
    // novší beh (15Z) než aktuálny sa do histórie nedostane
    expect(s.every((x) => x.ref.getTime() <= current.referenceTime.getTime())).toBe(true);
  });

  it("ECMWF s krokom 3 h a behmi každých 6 h", () => {
    const cur = { referenceTime: d("2026-10-21T06:00Z"), validTimes: hours("2026-10-21T06:00Z", 3, 3) };
    const s = buildTimeline(cur, [d("2026-10-21T00:00Z"), d("2026-10-20T18:00Z")], 3, d("2026-10-21T06:00Z"), 0.5);
    expect(s.map((x) => `${x.t.toISOString().slice(11, 13)}/${x.ref.toISOString().slice(11, 13)}`)).toEqual([
      "21/18",
      "00/18",
      "03/00",
      "06/00",
      "09/06",
      "12/06",
    ]);
  });

  it("chýbajúci beh pokryje predchádzajúci dlhším predstihom", () => {
    const s = buildTimeline(current, [d("2026-10-21T06:00Z")], 1, d("2026-10-21T12:00Z"), 0.25);
    expect(s.filter((x) => x.history).every((x) => x.ref.toISOString() === "2026-10-21T06:00:00.000Z")).toBe(true);
    expect(s.find((x) => x.t.toISOString() === "2026-10-21T12:00:00.000Z")!.history).toBe(true);
  });

  it("bez minulých behov = iba aktuálny beh vrátane +0 h", () => {
    const s = buildTimeline(current, [], 1, d("2026-10-21T12:00Z"));
    expect(s).toHaveLength(6);
    expect(s[0]!.t.toISOString()).toBe("2026-10-21T12:00:00.000Z");
  });

  it("nearestStepIndex", () => {
    const s = buildTimeline(current, runs, 1, d("2026-10-21T13:00Z"), 0.25);
    expect(nearestStepIndex(s, d("2026-10-21T10:20Z").getTime())).toBe(3);
  });
});
