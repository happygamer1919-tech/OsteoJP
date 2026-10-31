import { describe, expect, it } from "vitest";

import {
  BULK_MAX_ROWS,
  bulkAlreadySaved,
  bulkRowEligible,
  bulkSelfOverlap,
  bulkRowUnchanged,
  planBulkRow,
  validBulkChange,
  validBulkRequest,
  verdictOfRefusal,
  type BulkRequest,
} from "./bulk-reschedule-core";
import { MAX_EVENTS_PER_BOOKING_ACTION } from "./reminders";

/**
 * APPT-BULK-01 - the arithmetic of a bulk change, as table tests. Times are
 * pinned (never `now`), and two of them sit on either side of the 2031 change
 * to summer time so the wall clock is seen to hold.
 */

// 2031-05-12 is a Monday; Lisbon is UTC+1 in May, so 15:00 local is 14:00Z.
const row = {
  id: "a1",
  patientId: "p1",
  status: "confirmed",
  startsAt: new Date("2031-05-12T14:00:00.000Z"),
  endsAt: new Date("2031-05-12T14:45:00.000Z"),
  practitionerId: "t-old",
  locationId: "loc-1",
};

describe("planBulkRow", () => {
  it("a new therapist alone keeps the date, the hour, the length and the clinic", () => {
    expect(planBulkRow(row, { practitionerId: "t-new" })).toEqual({
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      practitionerId: "t-new",
      locationId: "loc-1",
    });
  });

  it("a new hour keeps each row's own date (Lisbon wall clock)", () => {
    const p = planBulkRow(row, { time: "10:30" });
    expect(p.startsAt.toISOString()).toBe("2031-05-12T09:30:00.000Z");
    expect(p.endsAt.toISOString()).toBe("2031-05-12T10:15:00.000Z");
  });

  it("the row's own picked hour wins over the change's hour", () => {
    expect(planBulkRow(row, { time: "10:30" }, "11:00").startsAt.toISOString()).toBe("2031-05-12T10:00:00.000Z");
  });

  it("an invalid row hour is ignored, never parsed", () => {
    expect(planBulkRow(row, { time: "10:30" }, "25:00").startsAt.toISOString()).toBe("2031-05-12T09:30:00.000Z");
  });

  it("a shift moves the date and keeps the wall clock across the change to summer time", () => {
    // 2031-03-24 15:00 WET is 15:00Z; a week on is 2031-03-31, after the
    // change (2031-03-30), where 15:00 WEST is 14:00Z.
    const winter = { ...row, startsAt: new Date("2031-03-24T15:00:00.000Z"), endsAt: new Date("2031-03-24T16:00:00.000Z") };
    const p = planBulkRow(winter, { shiftDays: 7 });
    expect(p.startsAt.toISOString()).toBe("2031-03-31T14:00:00.000Z");
    expect(p.endsAt.toISOString()).toBe("2031-03-31T15:00:00.000Z");
  });

  it("a negative shift moves earlier", () => {
    expect(planBulkRow(row, { shiftDays: -2 }).startsAt.toISOString()).toBe("2031-05-10T14:00:00.000Z");
  });

  it("a new length keeps the start", () => {
    const p = planBulkRow(row, { durationMin: 60 });
    expect(p.startsAt).toEqual(row.startsAt);
    expect(p.endsAt.toISOString()).toBe("2031-05-12T15:00:00.000Z");
  });

  it("every field at once", () => {
    expect(
      planBulkRow(row, { practitionerId: "t-new", locationId: "loc-2", time: "09:00", shiftDays: 1, durationMin: 30 }),
    ).toEqual({
      startsAt: new Date("2031-05-13T08:00:00.000Z"),
      endsAt: new Date("2031-05-13T08:30:00.000Z"),
      practitionerId: "t-new",
      locationId: "loc-2",
    });
  });
});

describe("bulkRowUnchanged", () => {
  it("is true only when start, end, therapist and clinic all match", () => {
    expect(bulkRowUnchanged(row, planBulkRow(row, { practitionerId: "t-old" }))).toBe(true);
    expect(bulkRowUnchanged(row, planBulkRow(row, { time: "15:00" }))).toBe(true);
    expect(bulkRowUnchanged(row, planBulkRow(row, { practitionerId: "t-new" }))).toBe(false);
    expect(bulkRowUnchanged(row, planBulkRow(row, { locationId: "loc-2" }))).toBe(false);
    expect(bulkRowUnchanged(row, planBulkRow(row, { durationMin: 60 }))).toBe(false);
    expect(bulkRowUnchanged(row, planBulkRow(row, { shiftDays: 1 }))).toBe(false);
  });
});

describe("bulkRowEligible", () => {
  const now = new Date("2031-05-01T00:00:00.000Z").getTime();
  it("this patient's, ahead, Agendada or Confirmada", () => {
    expect(bulkRowEligible(row, "p1", now)).toBe(true);
    expect(bulkRowEligible({ ...row, status: "scheduled" }, "p1", now)).toBe(true);
  });
  it.each(["completed", "cancelled", "no_show"])("not a %s visit", (status) => {
    expect(bulkRowEligible({ ...row, status }, "p1", now)).toBe(false);
  });
  it("not another patient's", () => {
    expect(bulkRowEligible(row, "p2", now)).toBe(false);
  });
  it("not one that has started", () => {
    expect(bulkRowEligible(row, "p1", row.startsAt.getTime())).toBe(false);
  });
});

describe("validBulkChange / validBulkRequest", () => {
  const ok: BulkRequest = { patientId: "p1", rows: [{ id: "a1" }], change: { practitionerId: "t" }, mode: "preview" };

  it("needs at least one change", () => {
    expect(validBulkChange({})).toBe(false);
    expect(validBulkChange({ practitionerId: "", time: "" })).toBe(false);
    expect(validBulkChange({ shiftDays: 0 })).toBe(true);
  });

  it("refuses an hour that is not HH:MM, a fractional or huge shift, a length out of range", () => {
    expect(validBulkChange({ time: "9:00" })).toBe(false);
    expect(validBulkChange({ time: "24:00" })).toBe(false);
    expect(validBulkChange({ shiftDays: 1.5 })).toBe(false);
    expect(validBulkChange({ shiftDays: 366 })).toBe(false);
    expect(validBulkChange({ durationMin: 4 })).toBe(false);
    expect(validBulkChange({ durationMin: 481 })).toBe(false);
    expect(validBulkChange({ durationMin: 45 })).toBe(true);
  });

  it("a well-formed request passes", () => {
    expect(validBulkRequest(ok)).toBe(true);
  });

  it("refuses no rows, a duplicate row, too many rows, an unknown mode, a bad row hour", () => {
    expect(validBulkRequest({ ...ok, rows: [] })).toBe(false);
    expect(validBulkRequest({ ...ok, rows: [{ id: "a1" }, { id: "a1" }] })).toBe(false);
    expect(
      validBulkRequest({ ...ok, rows: Array.from({ length: BULK_MAX_ROWS + 1 }, (_, i) => ({ id: `a${i}` })) }),
    ).toBe(false);
    expect(validBulkRequest({ ...ok, mode: "write" as never })).toBe(false);
    expect(validBulkRequest({ ...ok, rows: [{ id: "a1", time: "7h" }] })).toBe(false);
    expect(validBulkRequest({ ...ok, patientId: "" })).toBe(false);
  });

  it("the row cap is the reminder ceiling of one action, so one bulk save can never be refused by it", () => {
    expect(BULK_MAX_ROWS).toBe(MAX_EVENTS_PER_BOOKING_ACTION);
  });
});

describe("verdictOfRefusal", () => {
  it("an overridable conflict is a list", () => {
    const c = { kind: "therapist" as const, id: "x", patientName: null, startsAt: "s", endsAt: "e", room: null };
    expect(verdictOfRefusal({ error: "conflict", conflicts: [c] })).toEqual({ kind: "conflict", conflicts: [c] });
  });
  it("a non-overridable conflict is a refusal", () => {
    expect(verdictOfRefusal({ error: "conflict", conflictOverridable: false })).toEqual({ kind: "refused", error: "conflict" });
  });
  it("working hours keep their windows; every other code is kept as it came", () => {
    expect(
      verdictOfRefusal({ error: "outside_availability", availabilityWindows: [{ startTime: "09:00", endTime: "13:00" }] }),
    ).toEqual({ kind: "refused", error: "outside_availability", availabilityWindows: [{ startTime: "09:00", endTime: "13:00" }] });
    expect(verdictOfRefusal({ error: "double_booked" })).toEqual({ kind: "refused", error: "double_booked" });
  });
});

describe("bulkSelfOverlap (preview only)", () => {
  const p = (start: string, end: string, practitionerId = "t") => ({
    startsAt: new Date(start),
    endsAt: new Date(end),
    practitionerId,
  });
  const passed = [{ id: "a", plan: p("2031-05-12T09:00:00Z", "2031-05-12T09:45:00Z") }];

  it("finds a passed row the plan lands on, with the same therapist", () => {
    expect(bulkSelfOverlap(p("2031-05-12T09:30:00Z", "2031-05-12T10:15:00Z"), passed)).toEqual({
      id: "a",
      startsAt: "2031-05-12T09:00:00.000Z",
      endsAt: "2031-05-12T09:45:00.000Z",
    });
  });
  it("touching ends do not overlap", () => {
    expect(bulkSelfOverlap(p("2031-05-12T09:45:00Z", "2031-05-12T10:30:00Z"), passed)).toBeNull();
  });
  it("another therapist does not overlap", () => {
    expect(bulkSelfOverlap(p("2031-05-12T09:00:00Z", "2031-05-12T09:45:00Z", "u"), passed)).toBeNull();
  });
});

describe("expectedStartsAt", () => {
  const ok: BulkRequest = { patientId: "p1", rows: [{ id: "a1" }], change: { shiftDays: 7 }, mode: "apply" };
  it("an apply without it on every row is refused; a preview does not need it", () => {
    expect(validBulkRequest(ok)).toBe(false);
    expect(validBulkRequest({ ...ok, mode: "preview" })).toBe(true);
    expect(
      validBulkRequest({
        ...ok,
        rows: [{ id: "a1", expectedStartsAt: "2031-05-12T14:00:00.000Z" }, { id: "a2" }],
      }),
    ).toBe(false);
  });

  it("an ISO start passes; garbage does not", () => {
    expect(validBulkRequest({ ...ok, rows: [{ id: "a1", expectedStartsAt: "2031-05-12T14:00:00.000Z" }] })).toBe(true);
    expect(validBulkRequest({ ...ok, rows: [{ id: "a1", expectedStartsAt: "soon" }] })).toBe(false);
  });
});

describe("bulkAlreadySaved", () => {
  // The row now: Monday 12th, 15:00 Lisbon (14:00Z), 45 minutes, t-new.
  const now = { ...row, practitionerId: "t-new" };
  it("the row holds what the change makes of the start she saw: already saved", () => {
    expect(bulkAlreadySaved(now, "2031-05-05T14:00:00.000Z", { shiftDays: 7 })).toBe(true);
    expect(bulkAlreadySaved(now, "2031-05-12T08:00:00.000Z", { time: "15:00" })).toBe(true);
    expect(bulkAlreadySaved(now, "2031-05-12T14:00:00.000Z", { practitionerId: "t-new" })).toBe(false);
  });
  it("anything else: not saved by this plan", () => {
    expect(bulkAlreadySaved(now, "2031-05-06T14:00:00.000Z", { shiftDays: 7 })).toBe(false);
    expect(bulkAlreadySaved(now, "2031-05-05T14:00:00.000Z", { shiftDays: 7, practitionerId: "t-other" })).toBe(false);
    expect(bulkAlreadySaved(now, "garbage", { shiftDays: 7 })).toBe(false);
  });
});
