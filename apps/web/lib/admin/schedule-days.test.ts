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
  indexScheduleTemplates,
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
