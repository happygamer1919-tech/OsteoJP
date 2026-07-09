import { describe, expect, it } from "vitest";
import { buildDay } from "./day-availability-core";
import type { AvailabilityTemplate } from "./availability";
import { lisbonDateTimeToUtc } from "./time";

/**
 * W5-12 — `buildDay` deducts time_off blocks from `free` exactly like bookings,
 * so a blocked slot disappears from the availability panel and from Agendar lote
 * (both consume `free`). These are pure-function tests: no DB.
 *
 * Fixture: 2026-07-13 (a Monday), one working window 09:00-17:00 Lisbon.
 */
const DATE = "2026-07-13";

function tpl(start: string, end: string): AvailabilityTemplate {
  return {
    weekday: 1, // Monday
    startTime: start,
    endTime: end,
    validFrom: null,
    validUntil: null,
    isActive: true,
  };
}

function block(startHhmm: string, endHhmm: string, reason = "other") {
  return {
    id: `blk-${startHhmm}-${endHhmm}`,
    startsAt: lisbonDateTimeToUtc(DATE, startHhmm),
    endsAt: lisbonDateTimeToUtc(DATE, endHhmm),
    reason,
  };
}

/** Free intervals as Lisbon "HH:mm-HH:mm" pairs, for readable assertions. */
function freeHours(day: ReturnType<typeof buildDay>): string[] {
  const hhmm = (iso: string) => {
    const d = new Date(iso);
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Lisbon",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(d);
  };
  return day.free.map((iv) => `${hhmm(iv.start)}-${hhmm(iv.end)}`);
}

describe("buildDay time_off deduction (W5-12)", () => {
  const working = [tpl("09:00", "17:00")];

  it("no blocks: free equals the whole working window", () => {
    const day = buildDay(DATE, working, [], []);
    expect(freeHours(day)).toEqual(["09:00-17:00"]);
    expect(day.blocks).toEqual([]);
  });

  it("a pontual block (Bloqueio pontual) is cut out of free", () => {
    const day = buildDay(DATE, working, [], [block("11:00", "12:00")]);
    // 09:00-17:00 minus 11:00-12:00 -> two gaps.
    expect(freeHours(day)).toEqual(["09:00-11:00", "12:00-17:00"]);
    // The block is reported so a consumer can render it.
    expect(day.blocks).toHaveLength(1);
    expect(day.blocks[0].reason).toBe("other");
  });

  it("a whole-day block (Ausência prolongada spanning this day) removes all free", () => {
    // A prolongada block covers midnight..midnight; here it covers the whole day.
    const day = buildDay(
      DATE,
      working,
      [],
      [block("00:00", "24:00", "vacation")],
    );
    expect(freeHours(day)).toEqual([]);
    expect(day.blocks).toHaveLength(1);
    expect(day.blocks[0].reason).toBe("vacation");
  });

  it("block and booking are both cut out of free", () => {
    const booked = [
      {
        id: "appt-1",
        startsAt: lisbonDateTimeToUtc(DATE, "09:00"),
        endsAt: lisbonDateTimeToUtc(DATE, "10:00"),
        status: "scheduled" as const,
      },
    ];
    const day = buildDay(DATE, working, booked, [block("11:00", "12:00")]);
    // minus 09:00-10:00 (booked) and 11:00-12:00 (block).
    expect(freeHours(day)).toEqual(["10:00-11:00", "12:00-17:00"]);
    expect(day.booked).toHaveLength(1);
    expect(day.blocks).toHaveLength(1);
  });

  it("a block outside working hours does not change free", () => {
    const day = buildDay(DATE, working, [], [block("18:00", "19:00")]);
    expect(freeHours(day)).toEqual(["09:00-17:00"]);
    expect(day.blocks).toHaveLength(1); // still reported (overlaps the day)
  });
});
