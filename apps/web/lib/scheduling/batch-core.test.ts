import { describe, expect, it } from "vitest";
import { classifyBatchSlots, isExplicitSlots, nearestFreeAlternative, resolveBatchSlots, type BatchSlot } from "./batch-core";
import type { TimeInterval } from "./intervals";

// Pure engine core: no DB, no availability recompute — feeds it a `free` set and
// candidate slots and asserts the booked/busy partition + nearest alternative.

const iv = (a: string, b: string): TimeInterval => ({ start: new Date(a), end: new Date(b) });
const slot = (date: string, startISO: string, durMin: number): BatchSlot => {
  const startsAt = new Date(startISO);
  return {
    startsAt,
    endsAt: new Date(startsAt.getTime() + durMin * 60_000),
    date,
    hhmm: startISO.slice(11, 16),
  };
};

const THREE_DATES = ["2026-08-06", "2026-08-13", "2026-08-20"] as const;
const slotsAt9 = (): BatchSlot[] => THREE_DATES.map((d) => slot(d, `${d}T09:00:00Z`, 60));

describe("classifyBatchSlots", () => {
  it("all-free: every slot fits its day's free window → all booked, no failures", () => {
    const free = new Map(THREE_DATES.map((d) => [d, [iv(`${d}T08:00:00Z`, `${d}T12:00:00Z`)]]));
    const r = classifyBatchSlots(slotsAt9(), free);
    expect(r.toBook).toHaveLength(3);
    expect(r.failures).toHaveLength(0);
    expect(r.toBook.map((s) => s.date)).toEqual([...THREE_DATES]);
  });

  it("all-busy: no day's free window covers the slot → all failures with an alternative", () => {
    // Free only in the afternoon (14:00–16:00Z); the 09:00Z slots don't fit.
    const free = new Map(THREE_DATES.map((d) => [d, [iv(`${d}T14:00:00Z`, `${d}T16:00:00Z`)]]));
    const r = classifyBatchSlots(slotsAt9(), free);
    expect(r.toBook).toHaveLength(0);
    expect(r.failures).toHaveLength(3);
    // Nearest alternative for the first busy slot is that same day's 14:00Z window.
    expect(r.failures[0].reason).toBe("busy");
    expect(r.failures[0].nearestAlternative?.startsAt).toBe("2026-08-06T14:00:00.000Z");
    expect(r.failures.every((f) => f.nearestAlternative !== null)).toBe(true);
  });

  it("mixed: books the free slots, fails the busy ones with correct alternatives", () => {
    const free = new Map<string, TimeInterval[]>([
      ["2026-08-06", [iv("2026-08-06T08:00:00Z", "2026-08-06T12:00:00Z")]], // covers 09:00
      ["2026-08-13", [iv("2026-08-13T14:00:00Z", "2026-08-13T16:00:00Z")]], // afternoon only
      ["2026-08-20", []], // fully busy
    ]);
    const r = classifyBatchSlots(slotsAt9(), free);
    expect(r.toBook.map((s) => s.date)).toEqual(["2026-08-06"]);
    expect(r.failures.map((f) => f.date)).toEqual(["2026-08-13", "2026-08-20"]);
    // 08-13's 09:00 slot: wanted time is BEFORE its afternoon window → clamps up
    // to the window start, 14:00Z.
    expect(r.failures[0].nearestAlternative?.startsAt).toBe("2026-08-13T14:00:00.000Z");
    // 08-20 has no free window that day; the nearest across the result is the
    // 08-13 window, and since 08-20 is AFTER that whole window the candidate
    // clamps to its latest bookable start (16:00 − 60m = 15:00Z).
    expect(r.failures[1].nearestAlternative?.startsAt).toBe("2026-08-13T15:00:00.000Z");
  });

  it("fails a slot that only partially overlaps a free window (end spills past it)", () => {
    // Free 09:00–09:30Z; a 60-min slot at 09:00 ends 10:00, past the window.
    const free = new Map([["2026-08-06", [iv("2026-08-06T09:00:00Z", "2026-08-06T09:30:00Z")]]]);
    const r = classifyBatchSlots([slot("2026-08-06", "2026-08-06T09:00:00Z", 60)], free);
    expect(r.toBook).toHaveLength(0);
    expect(r.failures).toHaveLength(1);
    // No window fits 60 min anywhere, so no alternative.
    expect(r.failures[0].nearestAlternative).toBeNull();
  });

  it("books a slot that exactly fills its free window (inclusive boundaries)", () => {
    const free = new Map([["2026-08-06", [iv("2026-08-06T09:00:00Z", "2026-08-06T10:00:00Z")]]]);
    const r = classifyBatchSlots([slot("2026-08-06", "2026-08-06T09:00:00Z", 60)], free);
    expect(r.toBook).toHaveLength(1);
    expect(r.failures).toHaveLength(0);
  });
});

describe("nearestFreeAlternative", () => {
  it("picks the closest fitting window, skipping windows too short for the duration", () => {
    const free = [
      iv("2026-08-06T10:00:00Z", "2026-08-06T11:00:00Z"), // 1h away, fits
      iv("2026-08-06T07:00:00Z", "2026-08-06T07:30:00Z"), // too short for 60m
      iv("2026-08-06T12:00:00Z", "2026-08-06T14:00:00Z"), // 3h away
    ];
    const alt = nearestFreeAlternative(free, new Date("2026-08-06T09:00:00Z"), 60);
    expect(alt?.startsAt).toBe("2026-08-06T10:00:00.000Z");
  });

  it("returns the wanted time itself when it already fits inside a window", () => {
    const free = [iv("2026-08-06T12:00:00Z", "2026-08-06T14:00:00Z")];
    const alt = nearestFreeAlternative(free, new Date("2026-08-06T12:30:00Z"), 60);
    expect(alt?.startsAt).toBe("2026-08-06T12:30:00.000Z");
  });

  it("clamps to the latest start when the wanted time is past the window's fit range", () => {
    // Window 12:00–14:00, 60-min duration → latest start 13:00. Want 15:00 → 13:00.
    const free = [iv("2026-08-06T12:00:00Z", "2026-08-06T14:00:00Z")];
    const alt = nearestFreeAlternative(free, new Date("2026-08-06T15:00:00Z"), 60);
    expect(alt?.startsAt).toBe("2026-08-06T13:00:00.000Z");
  });

  it("returns null when no window fits the duration", () => {
    const free = [iv("2026-08-06T08:00:00Z", "2026-08-06T08:30:00Z")];
    expect(nearestFreeAlternative(free, new Date("2026-08-06T09:00:00Z"), 60)).toBeNull();
  });
});

// W2-09: explicit per-slot input mode + its convergence with recurrence mode.
describe("resolveBatchSlots (W2-09)", () => {
  it("recurrence mode expands to N same-time slots", () => {
    const slots = resolveBatchSlots({
      firstDate: "2026-08-06",
      hhmm: "09:00",
      durationMin: 60,
      recurrence: { freq: "weekly", count: 3 },
    });
    expect(slots).toHaveLength(3);
    expect(slots.map((s) => s.hhmm)).toEqual(["09:00", "09:00", "09:00"]);
    // Weekly step: 06 → 13 → 20 Aug.
    expect(slots.map((s) => s.date)).toEqual(["2026-08-06", "2026-08-13", "2026-08-20"]);
  });

  it("explicit mode keeps each slot's own date/time and duration (the Rodica case)", () => {
    const slots = resolveBatchSlots({
      slots: [
        { startsAt: "2026-08-06T09:00:00Z", endsAt: "2026-08-06T10:00:00Z" },
        { startsAt: "2026-08-13T14:30:00Z", endsAt: "2026-08-13T15:00:00Z" },
      ],
    });
    expect(slots).toHaveLength(2);
    // Displayed in Lisbon time (August = UTC+1), so the UTC instants shift +1h.
    expect(slots.map((s) => `${s.date} ${s.hhmm}`)).toEqual([
      "2026-08-06 10:00",
      "2026-08-13 15:30",
    ]);
    // Per-slot durations differ: 60 vs 30 minutes.
    expect(slots.map((s) => (s.endsAt.getTime() - s.startsAt.getTime()) / 60_000)).toEqual([60, 30]);
  });

  it("isExplicitSlots discriminates the two modes", () => {
    expect(isExplicitSlots({ slots: [] })).toBe(true);
    expect(
      isExplicitSlots({ firstDate: "2026-08-06", hhmm: "09:00", durationMin: 60, recurrence: { freq: "weekly", count: 1 } }),
    ).toBe(false);
  });
});

describe("classifyBatchSlots — explicit-list slots (W2-09)", () => {
  it("mixed explicit list: books free slots, reports busy ones with reason + nearest alternative", () => {
    const slots = resolveBatchSlots({
      slots: [
        { startsAt: "2026-08-06T09:00:00Z", endsAt: "2026-08-06T10:00:00Z" }, // free
        { startsAt: "2026-08-13T09:00:00Z", endsAt: "2026-08-13T10:00:00Z" }, // busy (no free window)
      ],
    });
    const free = new Map([
      ["2026-08-06", [iv("2026-08-06T08:00:00Z", "2026-08-06T12:00:00Z")]],
      ["2026-08-13", [iv("2026-08-13T14:00:00Z", "2026-08-13T16:00:00Z")]],
    ]);
    const r = classifyBatchSlots(slots, free);
    expect(r.toBook.map((s) => s.date)).toEqual(["2026-08-06"]);
    expect(r.failures).toHaveLength(1);
    expect(r.failures[0]!.reason).toBe("busy");
    expect(r.failures[0]!.date).toBe("2026-08-13");
    // Nearest free alternative on the busy day's free window (14:00Z → 15:00 Lisbon).
    expect(r.failures[0]!.nearestAlternative?.hhmm).toBe("15:00");
  });
});
