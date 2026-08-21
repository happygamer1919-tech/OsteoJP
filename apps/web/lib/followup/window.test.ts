import { describe, expect, it } from "vitest";

import { followupWindow, FOLLOWUP_QUIET_DAYS } from "./window";

/**
 * RB-01 — the selection window is the one clause a reader cannot check by eye,
 * so it is the one clause pinned exactly.
 *
 * EVERY CASE HERE IS A CASE THE FUNCTION COULD PLAUSIBLY GET WRONG. A test that
 * only asserted "July gives 1 June" would pass against an implementation that
 * breaks in January, breaks across DST, and breaks on the last day of a month —
 * which are precisely the three ways date arithmetic fails in production and
 * never in a demo.
 */

const iso = (d: Date) => d.toISOString();

describe("followupWindow", () => {
  it("opens on the first of the PREVIOUS month, in Lisbon", () => {
    // 2026-08-20 12:00 UTC. Lisbon is UTC+1 in August, so the previous month is
    // July and 1 July 00:00 Lisbon is 30 June 23:00 UTC.
    const { from } = followupWindow(new Date("2026-08-20T12:00:00Z"));
    expect(iso(from)).toBe("2026-06-30T23:00:00.000Z");
  });

  it("rolls the YEAR back in January, with no special case in the code", () => {
    // The bug this catches: month index -1. Date.UTC handles it; a hand-rolled
    // `month - 1` with a manual wrap does not, and January is the only month
    // that would ever notice.
    const { from } = followupWindow(new Date("2027-01-15T12:00:00Z"));
    // Lisbon is UTC+0 in December, so midnight Lisbon IS midnight UTC.
    expect(iso(from)).toBe("2026-12-01T00:00:00.000Z");
  });

  it("closes exactly 7 days before now", () => {
    const now = new Date("2026-08-20T12:00:00Z");
    const { to } = followupWindow(now);
    expect(iso(to)).toBe("2026-08-13T12:00:00.000Z");
    expect(now.getTime() - to.getTime()).toBe(FOLLOWUP_QUIET_DAYS * 86400000);
  });

  it("uses the offset AT THE WINDOW START, not the offset at `now`", () => {
    /**
     * THE DST CASE, and it is the reason `lisbonOffsetMinutes` is called twice.
     * On 2026-04-10 Lisbon is UTC+1 (summer). The previous month is March, and
     * 1 March is UTC+0 (winter) — the clocks go forward on the last Sunday of
     * March. Reusing `now`'s +1 offset would put the boundary at
     * 2026-02-28T23:00Z, an hour early, silently including a patient seen in
     * the last hour of February.
     */
    const { from } = followupWindow(new Date("2026-04-10T12:00:00Z"));
    expect(iso(from)).toBe("2026-03-01T00:00:00.000Z");
  });

  it("is stable on the last day of a month", () => {
    // 31 July 13:00 Lisbon: the previous month is June, which has 30 days. An
    // implementation subtracting 30 days rather than moving the month index
    // would land in June or July depending on the month's length.
    const { from } = followupWindow(new Date("2026-07-31T12:00:00Z"));
    expect(iso(from)).toBe("2026-05-31T23:00:00.000Z"); // 1 June 00:00 Lisbon
  });

  it("keys off the LISBON wall date, not the UTC date", () => {
    /**
     * 2026-07-31T23:00Z is ALREADY 1 August in Lisbon (UTC+1 in summer), so the
     * previous month is JULY and not June. This case was written expecting June
     * and the implementation was right — kept, because it is the only test here
     * that distinguishes "uses the Lisbon calendar" from "uses the UTC calendar",
     * and those two agree for 23 hours out of every 24.
     */
    const { from } = followupWindow(new Date("2026-07-31T23:00:00Z"));
    expect(iso(from)).toBe("2026-06-30T23:00:00.000Z"); // 1 July 00:00 Lisbon
  });

  it("always returns from < to, which is what makes BETWEEN non-empty", () => {
    for (const when of [
      "2026-01-05T00:30:00Z",
      "2026-03-29T02:30:00Z",
      "2026-08-20T12:00:00Z",
      "2026-10-25T02:30:00Z",
      "2027-01-01T00:00:00Z",
    ]) {
      const { from, to } = followupWindow(new Date(when));
      expect(from.getTime()).toBeLessThan(to.getTime());
    }
  });
});
