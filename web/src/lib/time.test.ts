import { describe, expect, it } from "vitest";
import { ageHours, formatRun, formatUtc } from "./time";

describe("time", () => {
  const d = new Date("2026-10-21T09:00:00Z");
  it("formatRun", () => expect(formatRun(d)).toBe("21.10. 09 UTC"));
  it("formatUtc", () => expect(formatUtc(d)).toBe("2026-10-21 09:00 UTC"));
  it("ageHours", () => expect(ageHours(d, new Date("2026-10-21T14:59:00Z"))).toBe(5));
});
