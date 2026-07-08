import { describe, expect, it } from "vitest";
import { classifyBatchSlots, resolveBatchSlots } from "./batch-core";
import type { TimeInterval } from "./intervals";
import { buildLoteSlots, generateLoteDates, type LoteRow } from "./lote";

describe("generateLoteDates (W2-10)", () => {
  it("generates `count` dates stepping every-X weeks, same weekday", () => {
    // 2026-08-06 is a Thursday.
    expect(generateLoteDates("2026-08-06", 1, 4)).toEqual([
      "2026-08-06",
      "2026-08-13",
      "2026-08-20",
      "2026-08-27",
    ]);
  });

  it("honours a multi-week interval (every 2 weeks)", () => {
    expect(generateLoteDates("2026-08-06", 2, 3)).toEqual([
      "2026-08-06",
      "2026-08-20",
      "2026-09-03",
    ]);
  });

  it("clamps count and interval to >= 1", () => {
    expect(generateLoteDates("2026-08-06", 0, 0)).toEqual(["2026-08-06"]);
  });
});

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
    const rows = generateLoteDates("2026-08-06", 1, 3).map((date) => ({ date, time: "09:00" }));
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
