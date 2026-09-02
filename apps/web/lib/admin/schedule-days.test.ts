/**
 * W13-A — the split-shift loader. The half that decides whether a saved second
 * period survives a reload.
 *
 * The failure this file exists to prevent is specific: a build that taught the
 * editor to SAVE a second period but not to LOAD one would archive that row on
 * the very next save, and would look like it worked once. So the loader is
 * tested before the editor.
 */
import { describe, it, expect } from "vitest";

import {
  buildScheduleDays,
  defaultSecondPeriod,
  secondPeriodPatch,
  indexScheduleTemplates,
  scheduleDayError,
  type ScheduleTemplate,
} from "./schedule-days";

const U = "user-1";
const LOC_A = "loc-a";
const LOC_B = "loc-b";
const ORDER = [1, 2, 3, 4, 5, 6, 0];
const label = (wd: number) => `dia-${wd}`;

const tpl = (over: Partial<ScheduleTemplate> = {}): ScheduleTemplate => ({
  id: "t1",
  userId: U,
  locationId: LOC_A,
  weekday: 1,
  startTime: "09:00",
  endTime: "17:00",
  ...over,
});

const dayOf = (rows: ReturnType<typeof buildScheduleDays>, weekday: number) =>
  rows.find((r) => r.weekday === weekday)!;

describe("a day with one period behaves exactly as before", () => {
  it("keeps the single template as period 1 and offers no period 2", () => {
    const rows = buildScheduleDays(indexScheduleTemplates([tpl()]), U, ORDER, label);
    const mon = dayOf(rows, 1);
    expect(mon).toMatchObject({
      on: true, id: "t1", start: "09:00", end: "17:00", locationId: LOC_A, p2On: false, p2Id: "",
    });
  });

  it("leaves an unworked day off, with the untouched defaults", () => {
    const rows = buildScheduleDays(indexScheduleTemplates([]), U, ORDER, label);
    expect(dayOf(rows, 3)).toMatchObject({
      on: false, id: "", start: "09:00", end: "17:00", p2On: false, p2Id: "",
    });
  });

  it("returns the seven weekdays in the order it was given", () => {
    const rows = buildScheduleDays(indexScheduleTemplates([]), U, ORDER, label);
    expect(rows.map((r) => r.weekday)).toEqual(ORDER);
    expect(rows.map((r) => r.label)).toEqual(ORDER.map(label));
  });
});

describe("a split shift", () => {
  const morning = tpl({ id: "am", startTime: "08:00", endTime: "13:00" });
  const afternoon = tpl({ id: "pm", startTime: "14:00", endTime: "19:00" });

  it("loads BOTH periods, morning first", () => {
    const rows = buildScheduleDays(indexScheduleTemplates([morning, afternoon]), U, ORDER, label);
    expect(dayOf(rows, 1)).toMatchObject({
      on: true, id: "am", start: "08:00", end: "13:00",
      p2On: true, p2Id: "pm", p2Start: "14:00", p2End: "19:00",
    });
  });

  it("orders by start time even if the rows arrive the wrong way round", () => {
    // The callers order by start_time in SQL, so this sort is a no-op there. It
    // is here because a loader that trusted arrival order would silently label
    // the afternoon as the morning the day that query changed.
    const rows = buildScheduleDays(indexScheduleTemplates([afternoon, morning]), U, ORDER, label);
    expect(dayOf(rows, 1)).toMatchObject({ id: "am", p2Id: "pm" });
  });

  it("keeps periods on the right weekday", () => {
    const rows = buildScheduleDays(
      indexScheduleTemplates([morning, afternoon, tpl({ id: "tue", weekday: 2 })]),
      U, ORDER, label,
    );
    expect(dayOf(rows, 1)).toMatchObject({ id: "am", p2Id: "pm" });
    expect(dayOf(rows, 2)).toMatchObject({ id: "tue", p2On: false });
  });

  it("keeps periods on the right member", () => {
    const other = tpl({ id: "other", userId: "user-2", startTime: "14:00", endTime: "19:00" });
    const rows = buildScheduleDays(indexScheduleTemplates([morning, other]), U, ORDER, label);
    expect(dayOf(rows, 1)).toMatchObject({ id: "am", p2On: false });
  });
});

describe("THE W4-14 MULTI-SHIFT SAFETY PROPERTY, which this must not break", () => {
  it("does NOT surface a second template at a DIFFERENT location", () => {
    // saveTherapistScheduleAction's own header promises that a second active
    // template on the same weekday at another location "is never surfaced and
    // never touched". Surfacing it as period 2 would rewrite its location on the
    // next save, because period 2 posts period 1's location by design.
    const here = tpl({ id: "here", startTime: "08:00", endTime: "13:00" });
    const elsewhere = tpl({ id: "elsewhere", locationId: LOC_B, startTime: "14:00", endTime: "19:00" });

    const rows = buildScheduleDays(indexScheduleTemplates([here, elsewhere]), U, ORDER, label);
    expect(dayOf(rows, 1)).toMatchObject({ id: "here", p2On: false, p2Id: "" });
  });

  it("admits the same-location sibling even when a different-location row sorts between them", () => {
    const am = tpl({ id: "am", startTime: "08:00", endTime: "13:00" });
    const other = tpl({ id: "other-loc", locationId: LOC_B, startTime: "09:00", endTime: "12:00" });
    const pm = tpl({ id: "pm", startTime: "14:00", endTime: "19:00" });

    const rows = buildScheduleDays(indexScheduleTemplates([am, other, pm]), U, ORDER, label);
    expect(dayOf(rows, 1)).toMatchObject({ id: "am", p2Id: "pm" });
  });

  it("never surfaces a THIRD period, so a reconcile cannot archive what it cannot see", () => {
    const rows = buildScheduleDays(
      indexScheduleTemplates([
        tpl({ id: "a", startTime: "08:00", endTime: "10:00" }),
        tpl({ id: "b", startTime: "11:00", endTime: "13:00" }),
        tpl({ id: "c", startTime: "14:00", endTime: "19:00" }),
      ]),
      U, ORDER, label,
    );
    const mon = dayOf(rows, 1);
    expect(mon.id).toBe("a");
    expect(mon.p2Id).toBe("b");
    // The third row is held by nothing the editor posts, so the reconcile has no
    // id for it and cannot archive it.
    expect([mon.id, mon.p2Id]).not.toContain("c");
  });
});

/**
 * SCHED-08 — the second period a day OPENS WITH must be one the day can accept.
 *
 * THE DEFECT, as reception met it: press "Adicionar 2.º período" and Guardar
 * goes dead on the first click, with the reason in a small line that can be
 * scrolled off screen.
 *
 * THE MECHANISM, reproduced against the committed code before it was changed.
 * The default was a fixed 14:00-19:00 and `scheduleDayError` refuses a second
 * period starting before the first one ENDS. So the default was refused for
 * every day ending after 14:00 — which is nearly every real clinic day, AND the
 * editor's own default for a brand-new day. The first test below is that
 * reproduction, now asserting the opposite.
 */
describe("SCHED-08 — the offered second period is always a legal one", () => {
  // The exact pairs that were refused, and the two that were not. Any first
  // period the editor can produce, plus the boundary at 14:00 itself.
  const FIRST_PERIODS = [
    ["09:00", "17:00"], // the editor's own default for a NEW day
    ["09:00", "20:00"], // the owner's day, from the dispatch
    ["08:00", "13:00"], // a short morning — used to work, must still work
    ["08:00", "14:00"], // ends exactly where the old default started
    ["09:00", "13:30"],
    ["07:00", "19:00"], // ends exactly at the old default's END
    ["07:00", "22:00"], // runs past it
  ] as const;

  it("EVERY first period the editor can offer accepts its own suggested second period", () => {
    for (const [start, end] of FIRST_PERIODS) {
      const p2 = defaultSecondPeriod(end);
      expect(scheduleDayError(start, end, p2.p2Start, p2.p2End)).toBeNull();
    }
  });

  it("the second period starts exactly where the first ends", () => {
    for (const [, end] of FIRST_PERIODS) expect(defaultSecondPeriod(end).p2Start).toBe(end);
  });

  it("keeps 19:00 as the end while 19:00 is still after the start", () => {
    // A clinic whose morning ends at 13:00 gets the same afternoon it always
    // got. The fix must not move a default that was already right.
    expect(defaultSecondPeriod("13:00")).toEqual({ p2Start: "13:00", p2End: "19:00" });
    expect(defaultSecondPeriod("18:59")).toEqual({ p2Start: "18:59", p2End: "19:00" });
  });

  it("moves the end on by an hour only when the first period already runs past 19:00", () => {
    expect(defaultSecondPeriod("19:00")).toEqual({ p2Start: "19:00", p2End: "20:00" });
    expect(defaultSecondPeriod("20:00")).toEqual({ p2Start: "20:00", p2End: "21:00" });
  });

  it("clamps at 23:59 instead of wrapping into the next day", () => {
    expect(defaultSecondPeriod("23:00")).toEqual({ p2Start: "23:00", p2End: "23:59" });
    expect(defaultSecondPeriod("23:30")).toEqual({ p2Start: "23:30", p2End: "23:59" });
  });

  it("a day with NO ROOM LEFT gets a pair the validator refuses, and that is deliberate", () => {
    // There is no second period to have after 23:59. Inventing a window that
    // fits would be a fallback on a path that decides whether something is
    // true; the screen says so beside a disabled Guardar instead.
    const p2 = defaultSecondPeriod("23:59");
    expect(p2).toEqual({ p2Start: "23:59", p2End: "23:59" });
    expect(scheduleDayError("09:00", "23:59", p2.p2Start, p2.p2End)).toBe("p2_end_before_start");
  });

  it("THE OLD FIXED DEFAULT IS WHAT THIS REPLACES — it fails on the same days", () => {
    // The negative control, pinned in the suite rather than run by hand: 14:00
    // to 19:00, the value that shipped, refused for FOUR of the seven first
    // periods above — including 09:00-17:00, the editor's own default for a
    // brand-new day, which is why this was not an edge case.
    const refused = FIRST_PERIODS.filter(
      ([start, end]) => scheduleDayError(start, end, "14:00", "19:00") !== null,
    );
    expect(refused.map(([, end]) => end)).toEqual(["17:00", "20:00", "19:00", "22:00"]);
    // And the three it accepted are exactly the days that end at or before
    // 14:00 — the only days the old default ever worked for.
    const accepted = FIRST_PERIODS.filter(
      ([start, end]) => scheduleDayError(start, end, "14:00", "19:00") === null,
    );
    expect(accepted.map(([, end]) => end)).toEqual(["13:00", "14:00", "13:30"]);
  });
});

describe("SCHED-08 — the loader seeds the same pair the button would produce", () => {
  it("an unworked day carries a second period derived from its own first period", () => {
    // Not the old fixed 14:00, which the day's own 09:00-17:00 default refuses.
    const rows = buildScheduleDays(indexScheduleTemplates([]), U, ORDER, label);
    expect(dayOf(rows, 3)).toMatchObject({ start: "09:00", end: "17:00", p2Start: "17:00", p2End: "19:00" });
  });

  it("a worked day with one period derives from THAT period, not from the default", () => {
    const rows = buildScheduleDays(
      indexScheduleTemplates([tpl({ startTime: "08:00", endTime: "20:00" })]),
      U, ORDER, label,
    );
    expect(dayOf(rows, 1)).toMatchObject({ p2On: false, p2Start: "20:00", p2End: "21:00" });
  });

  it("a day that already HAS a second period keeps its saved times untouched", () => {
    const rows = buildScheduleDays(
      indexScheduleTemplates([tpl({ id: "am", startTime: "08:00", endTime: "13:00" }),
                              tpl({ id: "pm", startTime: "15:00", endTime: "18:00" })]),
      U, ORDER, label,
    );
    expect(dayOf(rows, 1)).toMatchObject({ p2On: true, p2Id: "pm", p2Start: "15:00", p2End: "18:00" });
  });
});

/**
 * SCHED-11 — the button's patch must not name PERIOD ONE's fields.
 *
 * ==========================================================================
 * THIS IS THE TEST THE ORIGINAL SHIP DID NOT HAVE, AND ITS ABSENCE IS THE
 * WHOLE STORY.
 * ==========================================================================
 * `defaultSecondPeriod` first returned `{ start, end }` and the button spread
 * it straight into the day's state. `start` and `end` are period ONE's fields,
 * so pressing "+ 2.º período" REWROTE THE MORNING with the afternoon's
 * suggestion: 08:00-13:00 became 13:00-19:00. It type-checked, because
 * `{ start, end }` is a perfectly good `Partial<DayState>` - the shape was
 * right and the meaning was wrong.
 *
 * Everything that existed passed through it. The suggestion was tested pure,
 * the loader was tested pure, and the only thing that touched the BUTTON was a
 * static render, which never clicks. What caught it was the e2e round trip -
 * and what made the e2e failure legible in one read was the blocking reason
 * beside Guardar, shipped in the same PR.
 *
 * So the assertion below is negative on purpose: it is not enough that the
 * patch carries the right p2 values, it must carry NOTHING ELSE.
 */
describe("SCHED-11 — the '+ 2.º período' patch touches period TWO only", () => {
  it("carries exactly p2On, p2Start and p2End", () => {
    expect(Object.keys(secondPeriodPatch("13:00")).sort()).toEqual(["p2End", "p2On", "p2Start"]);
  });

  it("NEVER names `start` or `end` - the exact defect that shipped", () => {
    for (const p1End of ["08:00", "13:00", "17:00", "20:00", "23:59"]) {
      const patch = secondPeriodPatch(p1End) as Record<string, unknown>;
      expect(patch).not.toHaveProperty("start");
      expect(patch).not.toHaveProperty("end");
    }
  });

  it("turns the period on and puts it after the first one", () => {
    expect(secondPeriodPatch("13:00")).toEqual({ p2On: true, p2Start: "13:00", p2End: "19:00" });
    expect(secondPeriodPatch("20:00")).toEqual({ p2On: true, p2Start: "20:00", p2End: "21:00" });
  });

  it("APPLIED TO A DAY, leaves the first period exactly as it was", () => {
    // The regression, spelled as the screen experiences it: a day set to
    // 08:00-13:00 must still read 08:00-13:00 after the button is pressed.
    const day = { on: true, start: "08:00", end: "13:00", p2On: false, p2Start: "", p2End: "" };
    const after = { ...day, ...secondPeriodPatch(day.end) };
    expect(after.start).toBe("08:00");
    expect(after.end).toBe("13:00");
    expect(after.p2Start).toBe("13:00");
    expect(after.p2End).toBe("19:00");
    // And the day the e2e sets up is therefore SAVEABLE, which it was not.
    expect(scheduleDayError(after.start, after.end, "14:00", "19:00")).toBeNull();
  });
});
