import { describe, expect, it, vi } from "vitest";

/**
 * DST-1025. THE SWEEP'S LATE RULE ACROSS LISBON'S CLOCK CHANGE, SUNDAY 2026-10-25.
 *
 * At 01:00 UTC Lisbon goes from 02:00 WEST back to 01:00 WET, so between
 * 00:30Z and 02:30Z the wall clock reads 01:30, 01:59, 01:00, 01:30 and 02:30.
 *
 * The late rule (owner, answer 8a: an SMS at most 3 hours late, an email at
 * most 12) is ELAPSED time: `reminderIsTooLate` compares instants. On this
 * night elapsed time and Lisbon wall time disagree by an hour, so each case
 * below is built where they do: a rule that measured "late" on the Lisbon wall
 * clock would send an SMS that is more than 3 real hours late, and would treat
 * the two 01:30s as the same moment. Every instant is real, and its Lisbon
 * reading is asserted through the app's own reader (../scheduling/time.ts,
 * which reads the IANA zone Europe/Lisbon).
 *
 * Test file only: it changes no code on this branch.
 */

vi.mock("server-only", () => ({}));

const { lisbonParts } = await import("../scheduling/time");
const { REMINDER_LATE_LIMIT_MS, reminderIsTooLate, reminderRefusedByTheClock } = await import("./dispatch");
const { reminderMark } = await import("./reminder-claim");
const { sweepLookAheadLimit } = await import("./sweep");

const HOUR = 60 * 60_000;
const at = (iso: string) => new Date(iso);

/** "YYYY-MM-DD HH:MM", the Lisbon wall clock of an instant. */
function lisbon(d: Date): string {
  const p = lisbonParts(d);
  return `${p.date} ${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

describe("DST-1025: the instants of the night read as Lisbon reads them", () => {
  it.each([
    ["2026-10-25T00:30:00.000Z", "2026-10-25 01:30"],
    ["2026-10-25T00:59:00.000Z", "2026-10-25 01:59"],
    ["2026-10-25T01:00:00.000Z", "2026-10-25 01:00"],
    ["2026-10-25T01:30:00.000Z", "2026-10-25 01:30"],
    ["2026-10-25T02:30:00.000Z", "2026-10-25 02:30"],
    ["2026-10-25T03:31:00.000Z", "2026-10-25 03:31"],
    ["2026-10-25T12:31:00.000Z", "2026-10-25 12:31"],
    ["2026-10-24T14:30:00.000Z", "2026-10-24 15:30"],
  ])("%s is %s in Lisbon", (iso, reading) => {
    expect(lisbon(at(iso))).toBe(reading);
  });

  it("the limits are the owner's: 3 hours for an SMS, 12 for an email", () => {
    expect(REMINDER_LATE_LIMIT_MS).toEqual({ sms: 3 * HOUR, email: 12 * HOUR });
  });
});

describe("DST-1025: an SMS is at most 3 real hours late across the change", () => {
  // The 24-hour SMS of a visit on Monday 2026-10-26 at 00:30 WET: its mark is
  // the first 01:30 of Sunday (WEST).
  const start = at("2026-10-26T00:30:00.000Z");
  const mark = reminderMark(start, "24h")!;

  it("the mark is the start less 24 real hours, the first 01:30", () => {
    expect(mark.toISOString()).toBe("2026-10-25T00:30:00.000Z");
    expect(lisbon(mark)).toBe("2026-10-25 01:30");
    expect(lisbon(start)).toBe("2026-10-26 00:30");
  });

  it("at 02:30 Lisbon (2 real hours on) it may still go", () => {
    const now = at("2026-10-25T02:30:00.000Z");
    expect(reminderIsTooLate(mark, "sms", now)).toBe(false);
    expect(reminderRefusedByTheClock({ startsAt: start, mark, channel: "sms", now })).toBeNull();
  });

  it("at 03:30 Lisbon, exactly 3 real hours on, it may still go", () => {
    const now = at("2026-10-25T03:30:00.000Z");
    expect(lisbon(now)).toBe("2026-10-25 03:30");
    expect(reminderRefusedByTheClock({ startsAt: start, mark, channel: "sms", now })).toBeNull();
  });

  it("at 03:31 Lisbon it is too late, although the wall clock moved only 2 hours 1 minute", () => {
    const now = at("2026-10-25T03:31:00.000Z");
    expect(reminderIsTooLate(mark, "sms", now)).toBe(true);
    expect(reminderRefusedByTheClock({ startsAt: start, mark, channel: "sms", now })).toBe("mark_missed");
  });

  it("the second 01:30 is a different mark: at 03:31 Lisbon it is 2 hours 1 minute late and may still go", () => {
    const secondStart = at("2026-10-26T01:30:00.000Z");
    const second = reminderMark(secondStart, "24h")!;
    expect(second.toISOString()).toBe("2026-10-25T01:30:00.000Z");
    expect(lisbon(second)).toBe(lisbon(mark)); // the same wall reading, an hour apart
    const now = at("2026-10-25T03:31:00.000Z");
    expect(reminderRefusedByTheClock({ startsAt: secondStart, mark: second, channel: "sms", now })).toBeNull();
    expect(reminderRefusedByTheClock({ startsAt: secondStart, mark: second, channel: "sms", now: at("2026-10-25T04:31:00.000Z") })).toBe(
      "mark_missed",
    );
  });
});

describe("DST-1025: an email is at most 12 real hours late across the change", () => {
  it("a mark on Saturday 15:30 WEST may go until 02:30 WET on Sunday, 11 wall-clock hours later", () => {
    const start = at("2026-10-26T14:30:00.000Z"); // Monday 14:30 WET
    const mark = reminderMark(start, "48h")!;
    expect(mark.toISOString()).toBe("2026-10-24T14:30:00.000Z");
    expect(lisbon(mark)).toBe("2026-10-24 15:30");
    expect(lisbon(at("2026-10-25T02:30:00.000Z"))).toBe("2026-10-25 02:30");
    expect(reminderRefusedByTheClock({ startsAt: start, mark, channel: "email", now: at("2026-10-25T02:30:00.000Z") })).toBeNull();
    expect(reminderRefusedByTheClock({ startsAt: start, mark, channel: "email", now: at("2026-10-25T02:31:00.000Z") })).toBe("mark_missed");
  });

  it("a mark at the first 01:30 may go until 12:30 WET, and not at 12:31", () => {
    const start = at("2026-10-27T00:30:00.000Z");
    const mark = reminderMark(start, "48h")!;
    expect(mark.toISOString()).toBe("2026-10-25T00:30:00.000Z");
    expect(reminderIsTooLate(mark, "email", at("2026-10-25T12:30:00.000Z"))).toBe(false);
    expect(reminderIsTooLate(mark, "email", at("2026-10-25T12:31:00.000Z"))).toBe(true);
  });
});

describe("DST-1025: the floor and the sweep's night across the change", () => {
  it("a visit that began at the second 01:30 is never reminded, whatever the lateness", () => {
    const start = at("2026-10-25T01:30:00.000Z");
    expect(lisbon(start)).toBe("2026-10-25 01:30");
    expect(
      reminderRefusedByTheClock({ startsAt: start, mark: reminderMark(start, "24h"), channel: "sms", now: at("2026-10-25T01:30:00.000Z") }),
    ).toBe("start_passed");
  });

  it("no pass looks ahead at any instant of the night, 00:30Z to 02:30Z", () => {
    for (const iso of ["2026-10-25T00:30:00.000Z", "2026-10-25T01:00:00.000Z", "2026-10-25T01:30:00.000Z", "2026-10-25T02:30:00.000Z"]) {
      expect(sweepLookAheadLimit(at(iso)), iso).toBeNull();
    }
  });
});
