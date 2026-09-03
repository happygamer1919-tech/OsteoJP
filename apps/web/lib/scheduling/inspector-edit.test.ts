import { describe, expect, it } from "vitest";

import {
  dayEditBlockingReasons,
  dayEditPlan,
  draftFromDay,
  isSingleDayWindow,
  type DayEditDraft,
} from "./inspector-edit";
import { planDayByDay } from "./day-by-day";
import type { InspectedDay } from "./schedule-inspection";

const LV = "loc-lv";
const CB = "loc-cb";

const working: DayEditDraft = { locationId: LV, startTime: "09:00", endTime: "17:00" };

describe("dayEditPlan", () => {
  it("opens a window of exactly ONE day", () => {
    const plan = dayEditPlan("2026-09-10", working);
    expect(plan.startDate).toBe("2026-09-10");
    expect(plan.endDate).toBe("2026-09-10");
    expect(isSingleDayWindow(plan)).toBe(true);
  });

  it("puts the edited date on the entry, not the caller's idea of today", () => {
    expect(dayEditPlan("2026-09-10", working).entries).toEqual([
      { date: "2026-09-10", locationId: LV, startTime: "09:00", endTime: "17:00" },
    ]);
  });

  it("NEVER produces an empty entry list, because the write path refuses one", () => {
    // applyDayByDaySchedule: "AN EMPTY WINDOW IS REFUSED RATHER THAN TREATED AS
    // 'WORKS NO DAYS' ... the deliberate version has its own tool: blocked time".
    // The first draft of this editor offered a clear-the-day checkbox and was
    // refused at the server with a generic error; this is that ruling, asserted
    // where the payload is built.
    expect(dayEditPlan("2026-09-10", working).entries).toHaveLength(1);
  });
});

describe("THE INVARIANT THE CARD NAMES: a single-day edit blanks nothing else", () => {
  // day-by-day.ts: inside [startDate, endDate] the grid is the COMPLETE truth,
  // so a date with no entry means NOT WORKING. A window wider than the day being
  // edited would therefore silently clear the days around it. This drives the
  // real planner rather than re-stating the rule.
  const weekly = [
    // The therapist's ordinary week: an unbounded Thursday row at LV. It carries
    // an `id` because planWindow only carves rows that HAVE one - an id is what
    // says "this is a row already in the table" rather than one being planned.
    { id: "row-thu", locationId: LV, weekday: 4, startTime: "09:00", endTime: "13:00", validFrom: null, validUntil: null },
  ];

  it("carves ONLY the edited day out of the weekly row", () => {
    const plan = planDayByDay(dayEditPlan("2026-09-10", { ...working, locationId: CB }), weekly);
    // 2026-09-10 is a Thursday. The created row is bounded to that single day.
    expect(plan.created).toEqual([
      {
        locationId: CB,
        weekday: 4,
        startTime: "09:00",
        endTime: "17:00",
        validFrom: "2026-09-10",
        validUntil: "2026-09-10",
      },
    ]);
    // The weekly row is BOUNDED to end the day before and RESUMED, identical,
    // the day after - one carve carrying its own resume row, never a delete.
    expect(plan.carved).toEqual([
      {
        id: "row-thu",
        validUntil: "2026-09-09",
        resume: {
          locationId: LV,
          weekday: 4,
          startTime: "09:00",
          endTime: "13:00",
          validFrom: "2026-09-11",
          validUntil: null,
        },
      },
    ]);
  });

  it("THE NEGATIVE ARM: a window of a whole week would blank the days nobody edited", () => {
    // Restore the mistake the card warns about and show what it costs: the same
    // single entry inside a 7-day window carves a week out of the weekly row,
    // so the six unedited days resolve to NOT WORKING.
    const wide = { startDate: "2026-09-07", endDate: "2026-09-13", entries: dayEditPlan("2026-09-10", working).entries };
    const plan = planDayByDay(wide, weekly);
    // The SAME single entry, inside a seven-day window, carves a WEEK out of the
    // weekly row: it ends on the 6th and resumes on the 14th, so the Thursday
    // hours vanish for a week rather than for the day somebody edited.
    expect(plan.carved[0]?.validUntil).toBe("2026-09-06");
    expect(plan.carved[0]?.resume?.validFrom).toBe("2026-09-14");
    expect(isSingleDayWindow(wide)).toBe(false);
    // …and the day-bounded plan does not do that, which is the whole point.
    const narrow = dayEditPlan("2026-09-10", working);
    expect(planDayByDay(narrow, weekly).carved[0]?.validUntil).toBe("2026-09-09");
    expect(isSingleDayWindow(narrow)).toBe(true);
  });
});

describe("dayEditBlockingReasons", () => {
  it("says nothing about an edit that can be saved", () => {
    expect(dayEditBlockingReasons(working)).toEqual([]);
  });

  it("refuses a working day with no clinic", () => {
    expect(dayEditBlockingReasons({ ...working, locationId: "" })).toEqual([
      "inspector.editBlockNoClinic",
    ]);
  });

  it("refuses an end time at or before the start", () => {
    expect(dayEditBlockingReasons({ ...working, endTime: "09:00" })).toEqual([
      "inspector.editBlockEndNotAfterStart",
    ]);
    expect(dayEditBlockingReasons({ ...working, endTime: "08:00" })).toEqual([
      "inspector.editBlockEndNotAfterStart",
    ]);
  });

  it("names BOTH reasons at once rather than the first one found", () => {
    expect(dayEditBlockingReasons({ locationId: "", startTime: "17:00", endTime: "09:00" })).toEqual([
      "inspector.editBlockNoClinic",
      "inspector.editBlockEndNotAfterStart",
    ]);
  });
});

describe("draftFromDay", () => {
  const day = (windows: InspectedDay["windows"]): InspectedDay => ({
    date: "2026-09-10",
    weekday: 4,
    windows,
    exceptions: [],
  });

  it("opens on the day's FIRST window, which is what the row shows", () => {
    expect(
      draftFromDay(
        day([
          { start: "08:00", end: "13:00", locationId: CB, locationName: "CB", rule: "dia_definido" },
          { start: "14:00", end: "19:00", locationId: CB, locationName: "CB", rule: "dia_definido" },
        ]),
        LV,
      ),
    ).toEqual({ locationId: CB, startTime: "08:00", endTime: "13:00" });
  });

  it("a day with no windows opens on an ordinary shift at the fallback clinic", () => {
    expect(draftFromDay(day([]), LV)).toEqual({
      locationId: LV,
      startTime: "09:00",
      endTime: "17:00",
    });
  });

  it("falls back for a window that carries no clinic id rather than emitting an empty one", () => {
    // A window with a null locationId would otherwise produce a draft the form
    // refuses to save, with nothing on screen saying why.
    expect(
      draftFromDay(
        day([{ start: "10:00", end: "12:00", locationId: null, locationName: null, rule: "base" }]),
        LV,
      ).locationId,
    ).toBe(LV);
  });
});
