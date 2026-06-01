import { describe, expect, it } from "vitest";
import {
  computeDueReminders,
  REMINDER_OFFSETS,
  reminderIdempotencyKey,
} from "./offsets";

const H = 60 * 60 * 1000;

describe("computeDueReminders", () => {
  it("schedules both offsets when the appointment is far enough out", () => {
    const now = new Date("2026-05-20T09:00:00Z");
    const startsAt = new Date("2026-05-25T09:00:00Z"); // 5 days out
    const due = computeDueReminders(startsAt, now);
    expect(due.map((d) => d.offsetId)).toEqual(["48h", "24h"]);
    // send times are start − offset
    expect(due[0].sendAt.toISOString()).toBe("2026-05-23T09:00:00.000Z");
    expect(due[1].sendAt.toISOString()).toBe("2026-05-24T09:00:00.000Z");
  });

  it("drops the 48h reminder when only ~30h remain, keeps 24h", () => {
    const startsAt = new Date("2026-05-25T09:00:00Z");
    const now = new Date(startsAt.getTime() - 30 * H);
    const due = computeDueReminders(startsAt, now);
    expect(due.map((d) => d.offsetId)).toEqual(["24h"]);
  });

  it("drops every reminder when the appointment is under 24h away", () => {
    const startsAt = new Date("2026-05-25T09:00:00Z");
    const now = new Date(startsAt.getTime() - 10 * H);
    expect(computeDueReminders(startsAt, now)).toEqual([]);
  });

  it("treats a send time exactly at now as past (strictly future only)", () => {
    const startsAt = new Date("2026-05-25T09:00:00Z");
    // now is exactly the 48h send instant → 48h excluded, 24h still future
    const now = new Date(startsAt.getTime() - 48 * H);
    expect(computeDueReminders(startsAt, now).map((d) => d.offsetId)).toEqual([
      "24h",
    ]);
  });

  it("never schedules into the past for an already-started appointment", () => {
    const startsAt = new Date("2026-05-25T09:00:00Z");
    const now = new Date(startsAt.getTime() + H);
    expect(computeDueReminders(startsAt, now)).toEqual([]);
  });
});

describe("offset config", () => {
  it("is ordered earliest-firing first", () => {
    const mins = REMINDER_OFFSETS.map((o) => o.minutesBefore);
    expect(mins).toEqual([...mins].sort((a, b) => b - a));
  });
});

describe("reminderIdempotencyKey", () => {
  it("combines appointment id and offset into a stable key", () => {
    expect(reminderIdempotencyKey("appt-1", "48h")).toBe("appt-1:48h");
    expect(reminderIdempotencyKey("appt-1", "24h")).toBe("appt-1:24h");
  });
});
