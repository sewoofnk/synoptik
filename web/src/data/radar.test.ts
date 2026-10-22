import { describe, expect, it } from "vitest";
import { cleanShmuPixels, nearestFrame, rainViewerTiles, type RadarFrame } from "./radar";

const px = (...rgba: number[]) => new Uint8ClampedArray(rgba);

describe("cleanShmuPixels", () => {
  it("šedé okolie a čierny rámik → priehľadné, farby ech ostanú", () => {
    // [šedá okolie, rámik, zelené echo, už priehľadný, šedá s inou hodnotou (legitímne echo?)]
    const d = px(230, 230, 230, 255, 2, 2, 2, 255, 10, 200, 40, 255, 0, 0, 0, 0, 150, 150, 150, 255);
    const n = cleanShmuPixels(d);
    expect(n).toBe(2);
    expect(Array.from(d)).toEqual([230, 230, 230, 0, 2, 2, 2, 0, 10, 200, 40, 255, 0, 0, 0, 0, 150, 150, 150, 255]);
  });
});

describe("nearestFrame", () => {
  const frames: RadarFrame[] = [0, 5, 10, 15].map((m) => ({ t: Date.UTC(2026, 9, 22, 12, m), key: `f${m}` }));
  it("najbližšia snímka v tolerancii", () => {
    expect(nearestFrame(frames, Date.UTC(2026, 9, 22, 12, 7))).toBe(1);
    expect(nearestFrame(frames, Date.UTC(2026, 9, 22, 12, 40))).toBe(-1);
  });
});

describe("RainViewer", () => {
  it("šablóna dlaždíc", () => {
    expect(rainViewerTiles("https://tilecache.rainviewer.com", "/v2/radar/abc")).toBe("https://tilecache.rainviewer.com/v2/radar/abc/256/{z}/{x}/{y}/2/1_1.png");
  });
});
