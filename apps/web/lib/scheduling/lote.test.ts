import { describe, expect, it } from "vitest";
import { classifyBatchSlots, resolveBatchSlots } from "./batch-core";
import type { TimeInterval } from "./intervals";
import {
  MAX_LOTE_DATES,
  buildLoteSlots,
  generateLoteSchedule,
  type LoteRow,
} from "./lote";

describe("buildLoteSlots (W2-10)", () => {
  it("builds one explicit slot per row, honouring each row's OWN time and the duration", () => {
    const slots = buildLoteSlots(
      [
        { date: "2026-08-06", time: "09:00" },
        { date: "2026-08-13", time: "14:30" },
      ],
      60,
    );
    expect(slots).toHaveLength(2);
    // 60-minute windows; per-date times preserved (Lisbon in, UTC stored).
    expect(slots.map((s) => (new Date(s.endsAt).getTime() - new Date(s.startsAt).getTime()) / 60_000)).toEqual([
      60, 60,
    ]);
    // Distinct start instants (the whole point: per-date times).
    expect(new Set(slots.map((s) => s.startsAt)).size).toBe(2);
  });
});

/**
 * W5-05: per-row DATE editing in Agendar lote. The weekly generator seeds the
 * rows; a per-row date edit is an override on top. These tests exercise exactly
 * the composition path the drawer uses at submit (edited LoteRow[] ->
 * buildLoteSlots -> explicit BatchExplicitSlot[] -> classifyBatchSlots), so the
 * booked/busy behaviour of an edited set is proven without the server chain.
 */
describe("per-row date edit (W5-05)", () => {
  /** Weekly Thursday seed (2026-08-06/13/20 at 09:00) with row 1 moved to Friday 14. */
  function editedRows(): LoteRow[] {
    const rows = generateLoteSchedule({
      from: "2026-08-06",
      weekdays: [4], // Thursday
      everyWeeks: 1,
      end: { kind: "count", count: 3 },
    }).map((date) => ({ date, time: "09:00" }));
    return rows.map((r, i) => (i === 1 ? { ...r, date: "2026-08-14" } : r));
  }

  const free = (startIso: string, endIso: string): TimeInterval => ({
    start: new Date(startIso),
    end: new Date(endIso),
  });

  it("recomposes ONLY the edited row's startsAt; siblings keep the weekly recurrence dates", () => {
    const slots = buildLoteSlots(editedRows(), 60);
    // August: Lisbon is UTC+1, so 09:00 wall-clock -> 08:00Z (no off-by-one).
    expect(slots.map((s) => s.startsAt)).toEqual([
      "2026-08-06T08:00:00.000Z",
      "2026-08-14T08:00:00.000Z", // edited: Thursday 13 -> Friday 14
      "2026-08-20T08:00:00.000Z",
    ]);
  });

  it("preserves the Lisbon wall-clock across the October DST boundary when a date is edited", () => {
    // Lisbon leaves DST on 2026-10-25: the 24th is UTC+1, the 26th is UTC+0.
    const slots = buildLoteSlots(
      [
        { date: "2026-10-24", time: "09:00" },
        { date: "2026-10-26", time: "09:00" }, // edited across the boundary
      ],
      60,
    );
    expect(slots.map((s) => s.startsAt)).toEqual([
      "2026-10-24T08:00:00.000Z", // WEST (UTC+1)
      "2026-10-26T09:00:00.000Z", // WET (UTC+0), same 09:00 wall-clock
    ]);
  });

  it("books the edited row on its NEW date when that day is free", () => {
    const slots = resolveBatchSlots({ slots: buildLoteSlots(editedRows(), 60) });
    const freeByDate = new Map<string, TimeInterval[]>([
      ["2026-08-06", [free("2026-08-06T08:00:00.000Z", "2026-08-06T12:00:00.000Z")]],
      ["2026-08-14", [free("2026-08-14T08:00:00.000Z", "2026-08-14T12:00:00.000Z")]],
      ["2026-08-20", [free("2026-08-20T08:00:00.000Z", "2026-08-20T12:00:00.000Z")]],
    ]);
    const { toBook, failures } = classifyBatchSlots(slots, freeByDate);
    expect(failures).toEqual([]);
    // The edited row lands on 14 (not the recurrence 13); siblings unchanged.
    expect(toBook.map((s) => s.date)).toEqual(["2026-08-06", "2026-08-14", "2026-08-20"]);
  });

  it("an edited date that collides yields the busy BatchFailure with a nearest alternative", () => {
    const slots = resolveBatchSlots({ slots: buildLoteSlots(editedRows(), 60) });
    const freeByDate = new Map<string, TimeInterval[]>([
      ["2026-08-06", [free("2026-08-06T08:00:00.000Z", "2026-08-06T12:00:00.000Z")]],
      // Edited day: only 10:00-11:00 Lisbon (09:00Z-10:00Z) is free -> the
      // 09:00 wall-clock slot is busy.
      ["2026-08-14", [free("2026-08-14T09:00:00.000Z", "2026-08-14T10:00:00.000Z")]],
      ["2026-08-20", [free("2026-08-20T08:00:00.000Z", "2026-08-20T12:00:00.000Z")]],
    ]);
    const { toBook, failures } = classifyBatchSlots(slots, freeByDate);
    expect(toBook.map((s) => s.date)).toEqual(["2026-08-06", "2026-08-20"]);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({
      startsAt: "2026-08-14T08:00:00.000Z",
      date: "2026-08-14",
      hhmm: "09:00",
      reason: "busy",
    });
    // Nearest free alternative fitting 60 min: the edited day's 10:00 Lisbon window.
    expect(failures[0]?.nearestAlternative).toMatchObject({ date: "2026-08-14", hhmm: "10:00" });
  });
});

describe("generateLoteSchedule — PL-21 flexible recurrence", () => {
  // 2026-08-03 is a Monday. Weekdays: 0=Sun .. 6=Sat.
  const MONDAY = "2026-08-03";

  it("books the SAME weekday when only one is chosen (the old behaviour)", () => {
    expect(
      generateLoteSchedule({
        from: MONDAY,
        weekdays: [1],
        everyWeeks: 1,
        end: { kind: "count", count: 4 },
      }),
    ).toEqual(["2026-08-03", "2026-08-10", "2026-08-17", "2026-08-24"]);
  });

  // Rodica's actual complaint: "segundas e quintas" was unreachable.
  it("books several weekdays in one week", () => {
    expect(
      generateLoteSchedule({
        from: MONDAY,
        weekdays: [1, 4],
        everyWeeks: 1,
        end: { kind: "count", count: 4 },
      }),
    ).toEqual(["2026-08-03", "2026-08-06", "2026-08-10", "2026-08-13"]);
  });

  it("keeps a multi-day pattern together when repeating fortnightly", () => {
    // Both days stay in the SAME fortnight rather than drifting apart, which is
    // why the anchor is the Monday of the week and not the start date itself.
    expect(
      generateLoteSchedule({
        from: MONDAY,
        weekdays: [1, 4],
        everyWeeks: 2,
        end: { kind: "count", count: 4 },
      }),
    ).toEqual(["2026-08-03", "2026-08-06", "2026-08-17", "2026-08-20"]);
  });

  it("never books before the start date, even when the weekday is earlier in that week", () => {
    // Starting Wednesday and picking Monday means NEXT Monday, not two days ago.
    const WEDNESDAY = "2026-08-05";
    expect(
      generateLoteSchedule({
        from: WEDNESDAY,
        weekdays: [1, 3],
        everyWeeks: 1,
        end: { kind: "count", count: 3 },
      }),
    ).toEqual(["2026-08-05", "2026-08-10", "2026-08-12"]);
  });

  it("orders weekdays Monday-first within a week, whatever order they were ticked", () => {
    expect(
      generateLoteSchedule({
        from: MONDAY,
        weekdays: [5, 1, 3],
        everyWeeks: 1,
        end: { kind: "count", count: 3 },
      }),
    ).toEqual(["2026-08-03", "2026-08-05", "2026-08-07"]);
  });

  it("puts Sunday LAST in the clinical week, not first", () => {
    expect(
      generateLoteSchedule({
        from: MONDAY,
        weekdays: [0, 6],
        everyWeeks: 1,
        end: { kind: "count", count: 2 },
      }),
    ).toEqual(["2026-08-08", "2026-08-09"]); // Saturday then Sunday
  });

  it("stops on an end DATE, inclusive", () => {
    expect(
      generateLoteSchedule({
        from: MONDAY,
        weekdays: [1],
        everyWeeks: 1,
        end: { kind: "until", date: "2026-08-17" },
      }),
    ).toEqual(["2026-08-03", "2026-08-10", "2026-08-17"]);
  });

  it("returns nothing when the end date precedes the start", () => {
    expect(
      generateLoteSchedule({
        from: MONDAY,
        weekdays: [1],
        everyWeeks: 1,
        end: { kind: "until", date: "2026-07-01" },
      }),
    ).toEqual([]);
  });

  it("falls back to the start date's own weekday when none is ticked", () => {
    expect(
      generateLoteSchedule({
        from: MONDAY,
        weekdays: [],
        everyWeeks: 1,
        end: { kind: "count", count: 2 },
      }),
    ).toEqual(["2026-08-03", "2026-08-10"]);
  });

  it("caps both end modes at MAX_LOTE_DATES so one press cannot run away", () => {
    const byCount = generateLoteSchedule({
      from: MONDAY,
      weekdays: [1],
      everyWeeks: 1,
      end: { kind: "count", count: 9999 },
    });
    expect(byCount).toHaveLength(MAX_LOTE_DATES);

    const byDate = generateLoteSchedule({
      from: MONDAY,
      weekdays: [1, 2, 3, 4, 5],
      everyWeeks: 1,
      end: { kind: "until", date: "2030-01-01" },
    });
    expect(byDate).toHaveLength(MAX_LOTE_DATES);
  });

  it("crosses a month and a year boundary without drifting", () => {
    expect(
      generateLoteSchedule({
        from: "2026-12-28", // Monday
        weekdays: [1],
        everyWeeks: 1,
        end: { kind: "count", count: 3 },
      }),
    ).toEqual(["2026-12-28", "2027-01-04", "2027-01-11"]);
  });

  it("rejects a malformed or impossible start date instead of inventing one", () => {
    expect(generateLoteSchedule({ from: "", weekdays: [1], everyWeeks: 1, end: { kind: "count", count: 2 } })).toEqual([]);
    expect(generateLoteSchedule({ from: "2026-02-31", weekdays: [1], everyWeeks: 1, end: { kind: "count", count: 2 } })).toEqual([]);
  });

  it("treats a zero or negative interval as weekly rather than looping", () => {
    expect(
      generateLoteSchedule({
        from: MONDAY,
        weekdays: [1],
        everyWeeks: 0,
        end: { kind: "count", count: 3 },
      }),
    ).toEqual(["2026-08-03", "2026-08-10", "2026-08-17"]);
  });

  it("produces dates in ascending order in every case", () => {
    const dates = generateLoteSchedule({
      from: "2026-08-05",
      weekdays: [0, 2, 4, 6],
      everyWeeks: 3,
      end: { kind: "count", count: 12 },
    });
    expect([...dates].sort()).toEqual(dates);
  });
});
