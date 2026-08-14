import { describe, expect, it } from "vitest";
import {
  GUEST_PERIOD_HOURS,
  GUEST_PREFERRED_PERIODS,
  calendarDaysBetween,
  compareCalendarDates,
  decodeGuestPreferredWindow,
  encodeGuestPreferredWindow,
  isGuestPreferredPeriod,
  lisbonToday,
  lisbonWallClock,
  parseCalendarDate,
} from "../src/guest-preferred-window";

/**
 * GUEST-04 — the (date, period) <-> timestamptz encoding that reinterprets
 * 0063's `requested_starts_at` / `requested_ends_at` pair under Option A.
 *
 * WHAT WOULD GO WRONG WITHOUT THIS SUITE, and it is why the file is here rather
 * than trusting the round trip alone: an implementation that ignored the time
 * zone entirely - `Date.UTC(y, m, d, 9)` - PASSES a round-trip test, because it
 * encodes and decodes with the same wrong offset. It would be one hour out for
 * seven months of the year, and the only surface that would show it is
 * reception's queue, saying "manhã" for a window that begins at 08:00 Lisbon.
 * §2 below pins the actual UTC instants for a winter and a summer date, which is
 * the assertion a round trip cannot make.
 */

const PERIODS = GUEST_PREFERRED_PERIODS;

describe("GUEST-04 §1 — every (date, period) round-trips", () => {
  // Winter, summer, and BOTH Lisbon DST transition days (2026: 29 March and
  // 25 October). The transition days are the corpus's whole point - Lisbon
  // switches at 01:00 UTC, so a 09:00 boundary is on the far side of it and a
  // naive implementation is wrong by exactly one hour on those two dates.
  const DATES = [
    "2026-01-15",
    "2026-03-28",
    "2026-03-29",
    "2026-03-30",
    "2026-07-15",
    "2026-10-24",
    "2026-10-25",
    "2026-10-26",
    "2026-12-31",
    "2028-02-29",
  ];

  it("the corpus covers both periods and both offsets (guards a vacuous pass)", () => {
    // Without this, a corpus that happened to be all-winter would pass §2's
    // summer arm by never reaching it.
    expect(PERIODS.length).toBe(2);
    const offsets = new Set(
      DATES.map((d) => {
        const date = parseCalendarDate(d)!;
        const { startsAt } = encodeGuestPreferredWindow(date, "manha");
        return lisbonWallClock(startsAt).hour - startsAt.getUTCHours();
      }),
    );
    expect([...offsets].sort()).toEqual([0, 1]);
  });

  for (const ymd of DATES) {
    for (const period of PERIODS) {
      it(`${ymd} ${period}`, () => {
        const date = parseCalendarDate(ymd);
        expect(date, ymd).not.toBeNull();

        const { startsAt, endsAt } = encodeGuestPreferredWindow(date!, period);

        // The window reads as the declared Lisbon hours, whatever the offset.
        expect(lisbonWallClock(startsAt)).toMatchObject({
          hour: GUEST_PERIOD_HOURS[period].startHour,
          minute: 0,
          second: 0,
        });
        expect(lisbonWallClock(endsAt)).toMatchObject({
          hour: GUEST_PERIOD_HOURS[period].endHour,
          minute: 0,
          second: 0,
        });

        // 0063 CHECK (guest_booking_requests_window_check): ends > starts. An
        // encoding that violated it would be rejected by the database at insert,
        // which is a 500 on a public form.
        expect(endsAt.getTime()).toBeGreaterThan(startsAt.getTime());

        expect(decodeGuestPreferredWindow(startsAt, endsAt)).toEqual({
          kind: "period",
          dateYmd: ymd,
          period,
        });
      });
    }
  }
});

describe("GUEST-04 §2 — the offset is REAL, not assumed", () => {
  // These are the assertions a round trip cannot make. Both fail loudly against
  // an implementation that treats Lisbon as UTC all year.
  it("a WINTER morning starts at 09:00Z (Lisbon is UTC+0)", () => {
    const { startsAt, endsAt } = encodeGuestPreferredWindow(
      parseCalendarDate("2026-01-15")!,
      "manha",
    );
    expect(startsAt.toISOString()).toBe("2026-01-15T09:00:00.000Z");
    expect(endsAt.toISOString()).toBe("2026-01-15T13:00:00.000Z");
  });

  it("a SUMMER afternoon starts at 12:00Z (Lisbon is UTC+1)", () => {
    const { startsAt, endsAt } = encodeGuestPreferredWindow(
      parseCalendarDate("2026-07-15")!,
      "tarde",
    );
    expect(startsAt.toISOString()).toBe("2026-07-15T12:00:00.000Z");
    expect(endsAt.toISOString()).toBe("2026-07-15T18:00:00.000Z");
  });

  it("the SPRING transition day is already on summer time by 09:00", () => {
    // Lisbon springs forward at 01:00 UTC on 2026-03-29.
    const { startsAt } = encodeGuestPreferredWindow(
      parseCalendarDate("2026-03-29")!,
      "manha",
    );
    expect(startsAt.toISOString()).toBe("2026-03-29T08:00:00.000Z");
  });

  it("the AUTUMN transition day is already back on winter time by 09:00", () => {
    const { startsAt } = encodeGuestPreferredWindow(
      parseCalendarDate("2026-10-25")!,
      "manha",
    );
    expect(startsAt.toISOString()).toBe("2026-10-25T09:00:00.000Z");
  });
});

describe("GUEST-04 §3 — decoding FAILS VISIBLY, it never falls back", () => {
  // PORTAL-REHYDRATE §1.3. A window that does not encode a period must not be
  // read as one: reception would be shown a preference the guest never stated,
  // on a screen that looks entirely ordinary.
  it("an EXACT slot is not read as a period", () => {
    const starts = new Date("2026-07-15T13:30:00.000Z");
    const ends = new Date("2026-07-15T14:30:00.000Z");
    expect(decodeGuestPreferredWindow(starts, ends)).toEqual({ kind: "exact" });
  });

  it("a window on the hour but of the wrong LENGTH is not read as a period", () => {
    // 09:00-19:00 Lisbon in winter: both boundaries are period boundaries, and
    // together they are neither period. A decoder that matched only the START
    // hour would call this "manhã".
    const starts = new Date("2026-01-15T09:00:00.000Z");
    const ends = new Date("2026-01-15T19:00:00.000Z");
    expect(decodeGuestPreferredWindow(starts, ends)).toEqual({ kind: "exact" });
  });

  it("a window that ENDS on another day is not read as a period", () => {
    const starts = new Date("2026-01-15T09:00:00.000Z");
    const ends = new Date("2026-01-16T13:00:00.000Z");
    expect(decodeGuestPreferredWindow(starts, ends)).toEqual({ kind: "exact" });
  });

  it("a window carrying MINUTES is not read as a period", () => {
    const starts = new Date("2026-01-15T09:00:30.000Z");
    const ends = new Date("2026-01-15T13:00:00.000Z");
    expect(decodeGuestPreferredWindow(starts, ends)).toEqual({ kind: "exact" });
  });
});

describe("GUEST-04 §4 — the input guards", () => {
  it("accepts a real calendar date", () => {
    expect(parseCalendarDate("2028-02-29")).toEqual({
      year: 2028,
      month: 2,
      day: 29,
    });
  });

  it.each([
    ["2026-02-30", "a day that does not exist rolls over in new Date()"],
    ["2026-13-01", "a month that does not exist"],
    ["2026-00-10", "month zero"],
    ["2026-01-00", "day zero"],
    ["2026-2-3", "unpadded"],
    ["20260203", "no separators"],
    ["", "empty"],
    ["not-a-date", "garbage"],
    ["2026-01-15T09:00:00Z", "a timestamp, not a date"],
  ])("refuses %s (%s)", (value) => {
    expect(parseCalendarDate(value)).toBeNull();
  });

  it("refuses a period it does not know", () => {
    expect(isGuestPreferredPeriod("manha")).toBe(true);
    expect(isGuestPreferredPeriod("tarde")).toBe(true);
    expect(isGuestPreferredPeriod("noite")).toBe(false);
    expect(isGuestPreferredPeriod("")).toBe(false);
    expect(isGuestPreferredPeriod(null)).toBe(false);
    expect(isGuestPreferredPeriod(0)).toBe(false);
  });

  it("orders calendar dates and counts the days between them", () => {
    const a = parseCalendarDate("2026-01-15")!;
    const b = parseCalendarDate("2026-02-15")!;
    expect(compareCalendarDates(a, b)).toBeLessThan(0);
    expect(compareCalendarDates(b, a)).toBeGreaterThan(0);
    expect(compareCalendarDates(a, a)).toBe(0);
    expect(calendarDaysBetween(a, b)).toBe(31);
    // Across the spring transition, where a naive hours/24 count is 30.96 days.
    expect(
      calendarDaysBetween(
        parseCalendarDate("2026-03-15")!,
        parseCalendarDate("2026-04-15")!,
      ),
    ).toBe(31);
  });

  it("reads today in LISBON, not in the runner's zone", () => {
    // 23:30Z on 31 December is already 00:30 on 1 January in Lisbon summer
    // time - but in winter Lisbon is UTC, so the honest fixture is a summer one.
    expect(lisbonToday(new Date("2026-07-15T23:30:00.000Z"))).toEqual({
      year: 2026,
      month: 7,
      day: 16,
    });
    expect(lisbonToday(new Date("2026-01-15T23:30:00.000Z"))).toEqual({
      year: 2026,
      month: 1,
      day: 15,
    });
  });
});
