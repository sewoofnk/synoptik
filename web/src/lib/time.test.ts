import { describe, expect, it } from "vitest";
import { ageHours, formatDayUtc, formatLead, formatRun, formatUtc, formatValidUtc } from "./time";

describe("time", () => {
  const d = new Date("2026-10-21T09:00:00Z"); // streda
  it("formatRun", () => expect(formatRun(d)).toBe("21.10. 09 UTC"));
  it("formatUtc", () => expect(formatUtc(d)).toBe("2026-10-21 09:00 UTC"));
  it("formatValidUtc", () => expect(formatValidUtc(new Date("2026-10-22T12:00:00Z"))).toBe("Št 22.10. 12:00 UTC"));
  it("formatDayUtc", () => expect(formatDayUtc(d)).toBe("St 21.10."));
  it("formatLead", () => expect(formatLead(new Date("2026-10-22T15:00:00Z"), d)).toBe("+30 h"));
  it("ageHours", () => expect(ageHours(d, new Date("2026-10-21T14:59:00Z"))).toBe(5));
});
