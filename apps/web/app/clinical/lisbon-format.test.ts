import { describe, expect, it } from "vitest";
import { formatLisbonDate, formatLisbonDateTime } from "./lisbon-format";

// The process zone is whatever the machine says (UTC on CI and Vercel), so
// these pin the Lisbon reading, never the process's.
describe("clinical pages print Lisbon wall time", () => {
  it("summer (WEST, UTC+1): 09:30Z is 10:30 in Lisbon", () => {
    expect(formatLisbonDateTime("2026-07-15T09:30:00Z")).toBe("15/07/2026, 10:30:00");
  });

  it("winter (WET, UTC+0): 09:30Z is 09:30 in Lisbon", () => {
    expect(formatLisbonDateTime("2026-01-15T09:30:00Z")).toBe("15/01/2026, 09:30:00");
  });

  it("the date follows Lisbon across midnight in summer", () => {
    // 23:30Z on 15 July is 00:30 on 16 July in Lisbon.
    expect(formatLisbonDate("2026-07-15T23:30:00Z")).toBe("16/07/2026");
  });

  it("accepts a Date as well as a string", () => {
    expect(formatLisbonDateTime(new Date("2026-07-15T09:30:00Z"))).toBe("15/07/2026, 10:30:00");
  });
});
