/**
 * W13-A — the split-shift reconcile. The half that decides what is written.
 *
 * Every assertion here is about WHICH write path runs with WHICH id, because
 * that is where this feature can quietly destroy data: an archive of an id the
 * form never surfaced, or a create where an update was meant, both look like
 * nothing at all until a therapist's schedule is wrong on a Monday morning.
 */
import { describe, it, expect } from "vitest";

import { reconcileDay, reconcileWeek, type ScheduleWrites } from "./schedule-reconcile";
import type { AvailabilityTemplateInput } from "./availability";

const USER = "user-1";
const LOC = "loc-a";

type Call =
  | { op: "create"; input: AvailabilityTemplateInput }
  | { op: "update"; id: string; input: AvailabilityTemplateInput }
  | { op: "archive"; id: string };

function recorder() {
  const calls: Call[] = [];
  const writes: ScheduleWrites = {
    async create(input) { calls.push({ op: "create", input }); },
    async update(id, input) { calls.push({ op: "update", id, input }); },
    async archive(id) { calls.push({ op: "archive", id }); },
  };
  return { calls, writes };
}

/** A form for ONE weekday. Absent keys mean an unchecked checkbox. */
function form(fields: Record<string, string | true>) {
  return {
    get(name: string): unknown {
      const v = fields[name];
      return v === undefined ? null : v === true ? "on" : v;
    },
  };
}

const P1 = { d1_on: true, d1_location: LOC, d1_start: "09:00", d1_end: "17:00" } as const;

describe("a one-period day, which must behave exactly as it did before W13-A", () => {
  it("creates when the day is on and has no id", async () => {
    const { calls, writes } = recorder();
    await reconcileDay(form({ ...P1, d1_id: "" }), 1, USER, writes);
    expect(calls).toEqual([
      { op: "create", input: { userId: USER, locationId: LOC, weekday: 1, startTime: "09:00", endTime: "17:00" } },
    ]);
  });

  it("updates when the day is on and carries an id", async () => {
    const { calls, writes } = recorder();
    await reconcileDay(form({ ...P1, d1_id: "t1" }), 1, USER, writes);
    expect(calls).toEqual([
      { op: "update", id: "t1", input: { userId: USER, locationId: LOC, weekday: 1, startTime: "09:00", endTime: "17:00" } },
    ]);
  });

  it("archives when the day is switched off", async () => {
    const { calls, writes } = recorder();
    await reconcileDay(form({ d1_id: "t1", d1_location: LOC }), 1, USER, writes);
    expect(calls).toEqual([{ op: "archive", id: "t1" }]);
  });

  it("writes NOTHING for a day that is off and never existed", async () => {
    const { calls, writes } = recorder();
    await reconcileDay(form({ d1_id: "" }), 1, USER, writes);
    expect(calls).toEqual([]);
  });
});

describe("a split shift", () => {
  it("creates both periods, morning first, sharing period 1's location", async () => {
    const { calls, writes } = recorder();
    await reconcileDay(
      form({ d1_on: true, d1_id: "", d1_location: LOC, d1_start: "08:00", d1_end: "13:00",
             d1p2_on: true, d1p2_id: "", d1p2_start: "14:00", d1p2_end: "19:00" }),
      1, USER, writes,
    );
    expect(calls).toEqual([
      { op: "create", input: { userId: USER, locationId: LOC, weekday: 1, startTime: "08:00", endTime: "13:00" } },
      { op: "create", input: { userId: USER, locationId: LOC, weekday: 1, startTime: "14:00", endTime: "19:00" } },
    ]);
  });

  it("updates both periods when both already exist", async () => {
    const { calls, writes } = recorder();
    await reconcileDay(
      form({ d1_on: true, d1_id: "am", d1_location: LOC, d1_start: "08:00", d1_end: "13:00",
             d1p2_on: true, d1p2_id: "pm", d1p2_start: "14:00", d1p2_end: "19:00" }),
      1, USER, writes,
    );
    expect(calls.map((c) => [c.op, "id" in c ? c.id : ""])).toEqual([["update", "am"], ["update", "pm"]]);
  });

  it("adds period 2 to an existing single-period day without touching period 1's id", async () => {
    const { calls, writes } = recorder();
    await reconcileDay(
      form({ d1_on: true, d1_id: "am", d1_location: LOC, d1_start: "08:00", d1_end: "13:00",
             d1p2_on: true, d1p2_id: "", d1p2_start: "14:00", d1p2_end: "19:00" }),
      1, USER, writes,
    );
    expect(calls[0]).toMatchObject({ op: "update", id: "am" });
    expect(calls[1]).toMatchObject({ op: "create" });
  });

  it("PERIOD 2 NEVER POSTS ITS OWN LOCATION - it inherits period 1's", async () => {
    // A period-2 location field would let one save move the afternoon to another
    // clinic while the morning stayed, which is a different feature.
    const { calls, writes } = recorder();
    await reconcileDay(
      form({ d1_on: true, d1_id: "", d1_location: LOC, d1_start: "08:00", d1_end: "13:00",
             d1p2_on: true, d1p2_id: "", d1p2_start: "14:00", d1p2_end: "19:00",
             d1p2_location: "loc-elsewhere" }),
      1, USER, writes,
    );
    for (const c of calls) {
      if (c.op !== "archive") expect(c.input.locationId).toBe(LOC);
    }
  });
});

describe("removing things, which is where data is lost", () => {
  it("ARCHIVES BEFORE IT WRITES, so widening period 1 over a removed period 2 works", async () => {
    // The obvious edit: delete the afternoon, stretch the morning across the day.
    // Updating first would make period 1 overlap a still-active period 2 and the
    // write path would refuse a schedule that is perfectly legal.
    const { calls, writes } = recorder();
    await reconcileDay(
      form({ d1_on: true, d1_id: "am", d1_location: LOC, d1_start: "08:00", d1_end: "19:00",
             d1p2_id: "pm" }),
      1, USER, writes,
    );
    expect(calls).toEqual([
      { op: "archive", id: "pm" },
      { op: "update", id: "am", input: { userId: USER, locationId: LOC, weekday: 1, startTime: "08:00", endTime: "19:00" } },
    ]);
  });

  it("switching the DAY off archives BOTH periods", async () => {
    // Leaving period 2 active would keep the therapist bookable on a day the
    // admin just marked as not worked - the worst outcome available here.
    const { calls, writes } = recorder();
    await reconcileDay(form({ d1_id: "am", d1p2_id: "pm", d1_location: LOC }), 1, USER, writes);
    expect(calls).toEqual([{ op: "archive", id: "pm" }, { op: "archive", id: "am" }]);
  });

  it("switching the day off with period 2 still ticked STILL archives both", async () => {
    // The p2 checkbox is meaningless when the day is off, and a form can post it
    // (a hidden row, a stale DOM, a crafted POST). It must not resurrect the day.
    const { calls, writes } = recorder();
    await reconcileDay(
      form({ d1_id: "am", d1p2_on: true, d1p2_id: "pm", d1_location: LOC, d1p2_start: "14:00", d1p2_end: "19:00" }),
      1, USER, writes,
    );
    expect(calls).toEqual([{ op: "archive", id: "pm" }, { op: "archive", id: "am" }]);
    expect(calls.some((c) => c.op === "create" || c.op === "update")).toBe(false);
  });

  it("never archives an id the form did not carry", async () => {
    const { calls, writes } = recorder();
    await reconcileDay(form({ d1_id: "", d1p2_id: "" }), 1, USER, writes);
    expect(calls).toEqual([]);
  });
});

describe("the whole week", () => {
  it("visits all seven weekdays and writes only the ones that are on", async () => {
    const { calls, writes } = recorder();
    await reconcileWeek(
      form({
        d1_on: true, d1_id: "mon", d1_location: LOC, d1_start: "08:00", d1_end: "13:00",
        d1p2_on: true, d1p2_id: "", d1p2_start: "14:00", d1p2_end: "19:00",
        d5_on: true, d5_id: "", d5_location: LOC, d5_start: "09:00", d5_end: "17:00",
        d3_id: "wed-gone",
      }),
      USER, writes,
    );
    expect(calls).toEqual([
      { op: "update", id: "mon", input: { userId: USER, locationId: LOC, weekday: 1, startTime: "08:00", endTime: "13:00" } },
      { op: "create", input: { userId: USER, locationId: LOC, weekday: 1, startTime: "14:00", endTime: "19:00" } },
      { op: "archive", id: "wed-gone" },
      { op: "create", input: { userId: USER, locationId: LOC, weekday: 5, startTime: "09:00", endTime: "17:00" } },
    ]);
  });
});
