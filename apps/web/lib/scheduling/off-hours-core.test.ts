import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { checkAvailability } from "./availability-enforcement";
import type { AvailabilityTemplate } from "./availability";
import {
  isSlotInSpans,
  isSlotOffHours,
  offHoursByDate,
  schedulesByClinic,
  spansOfSlots,
  type ClinicSchedule,
} from "./off-hours-core";
import { SLOT_MINUTES, daySlots, lisbonDateTimeToUtc, slotLabel } from "./time";

/**
 * AGENDA-OFF-HOURS - the band's rule, pinned as VALUES.
 *
 * Two kinds of test. The first states what is shaded for each schedule shape
 * the model can hold, in wall-clock terms a reader can check against a
 * calendar. The second, at the bottom, is the one the card turns on: for a
 * table of schedules, "this slot is shaded" equals "`checkAvailability` refuses
 * a booking of this slot", asked of the enforcement itself and not of a copy.
 *
 * No database: `checkAvailability` is given the query stub
 * availability-enforcement.test.ts uses, because what is on trial is the
 * verdict.
 */

const LV = "loc-lv";
const CB = "loc-cb";

/** The week of Monday 19 October 2026, the last full week before the clock goes back. */
const MON = "2026-10-19";
const TUE = "2026-10-20";
const WED = "2026-10-21";
const THU = "2026-10-22";
const FRI = "2026-10-23";
const SAT = "2026-10-24";
const WEEK = [MON, TUE, WED, THU, FRI, SAT];

/** The grid's slots for a clinic open 08:00 to 21:00. */
const SLOTS = daySlots(8 * 60, 21 * 60);

function row(over: Partial<AvailabilityTemplate> = {}): AvailabilityTemplate {
  return {
    weekday: 1,
    startTime: "09:00:00",
    endTime: "19:00:00",
    validFrom: null,
    validUntil: null,
    isActive: true,
    locationId: LV,
    ...over,
  };
}

/** Monday to Friday, the same hours each day, at one clinic. */
function weekdays(over: Partial<AvailabilityTemplate> = {}): AvailabilityTemplate[] {
  return [1, 2, 3, 4, 5].map((weekday) => row({ weekday, ...over }));
}

const at = (clinic: string, templates: AvailabilityTemplate[]): ClinicSchedule => ({
  locationId: clinic,
  templates,
});

/** The shaded runs of one day, as "HH:MM-HH:MM" strings. */
function runs(date: string, clinics: ClinicSchedule[], slots: readonly number[] = SLOTS): string[] {
  const spans = offHoursByDate({ dates: [date], slots, clinics })[date] ?? [];
  return spans.map((sp) => `${slotLabel(sp.startMin)}-${slotLabel(sp.endMin)}`);
}

describe("what is shaded, by schedule shape", () => {
  it("a normal weekday: the hours before the therapist starts and after they stop", () => {
    // The reported case: works until 19:00, the clinic is open until 21:00.
    expect(runs(MON, [at(LV, weekdays())])).toEqual(["08:00-09:00", "19:00-21:00"]);
  });

  it("a split shift: the gap between the two periods is shaded too", () => {
    const split = [
      row({ startTime: "09:00:00", endTime: "13:00:00" }),
      row({ startTime: "14:30:00", endTime: "19:00:00" }),
    ];
    expect(runs(MON, [at(LV, split)])).toEqual(["08:00-09:00", "13:00-14:30", "19:00-21:00"]);
  });

  it("two periods that touch are one working day, with no band at the join", () => {
    const touching = [
      row({ startTime: "09:00:00", endTime: "13:00:00" }),
      row({ startTime: "13:00:00", endTime: "19:00:00" }),
    ];
    expect(runs(MON, [at(LV, touching)])).toEqual(["08:00-09:00", "19:00-21:00"]);
  });

  it("a slot the hours only partly cover is shaded: a booking there is refused", () => {
    // 09:15 start: the 09:00 slot runs 09:00-09:30 and is not inside the hours.
    expect(runs(MON, [at(LV, [row({ startTime: "09:15:00", endTime: "19:00:00" })])])).toEqual([
      "08:00-09:30",
      "19:00-21:00",
    ]);
  });

  it("a day the therapist does not work is shaded from open to close", () => {
    // Hours on Monday to Friday only; Saturday has none.
    expect(runs(SAT, [at(LV, weekdays())])).toEqual(["08:00-21:00"]);
  });

  it("a schedule that STARTS mid-week shades the whole of the days before it", () => {
    const fromWed = weekdays({ validFrom: WED });
    expect(runs(TUE, [at(LV, fromWed)])).toEqual(["08:00-21:00"]);
    expect(runs(WED, [at(LV, fromWed)])).toEqual(["08:00-09:00", "19:00-21:00"]);
  });

  it("a schedule that ENDS mid-week shades the whole of the days after it", () => {
    const untilWed = weekdays({ validUntil: WED });
    expect(runs(WED, [at(LV, untilWed)])).toEqual(["08:00-09:00", "19:00-21:00"]);
    expect(runs(THU, [at(LV, untilWed)])).toEqual(["08:00-21:00"]);
  });

  it("a carved week: the weekly row stops, a dated row serves one day, the weekly row resumes", () => {
    // What schedule-window.ts writes for a dated day: the base row bounded to end
    // the day before, a single-day row, and an identical base row from the day after.
    const carved = [
      ...weekdays({ validUntil: TUE }),
      row({ weekday: 3, startTime: "14:00:00", endTime: "18:00:00", validFrom: WED, validUntil: WED }),
      ...weekdays({ validFrom: THU }),
    ];
    expect(runs(TUE, [at(LV, carved)])).toEqual(["08:00-09:00", "19:00-21:00"]);
    expect(runs(WED, [at(LV, carved)])).toEqual(["08:00-14:00", "18:00-21:00"]);
    expect(runs(THU, [at(LV, carved)])).toEqual(["08:00-09:00", "19:00-21:00"]);
  });

  it("alternating weeks: one dated row per day worked, at the clinic of that week", () => {
    // alternating-weeks.ts writes ONE ROW PER (WEEKDAY, DATE), validFrom ===
    // validUntil. Week A at LV (19 to 23 October), week B at CB (26 to 30).
    const weekA = WEEK.slice(0, 5).map((d, i) => row({ weekday: i + 1, validFrom: d, validUntil: d }));
    const weekB = ["2026-10-26", "2026-10-27"].map((d, i) =>
      row({ weekday: i + 1, validFrom: d, validUntil: d, locationId: CB }),
    );
    const lv = at(LV, weekA);
    const cb = at(CB, weekB);
    // LV selected: worked in week A, and not at all on the Monday of week B.
    expect(runs(MON, [lv])).toEqual(["08:00-09:00", "19:00-21:00"]);
    expect(runs("2026-10-26", [lv])).toEqual(["08:00-21:00"]);
    // CB selected: the mirror image.
    expect(runs(MON, [cb])).toEqual(["08:00-21:00"]);
    expect(runs("2026-10-26", [cb])).toEqual(["08:00-09:00", "19:00-21:00"]);
    // Both in view: each Monday is worked at one of them.
    expect(runs(MON, [lv, cb])).toEqual(["08:00-09:00", "19:00-21:00"]);
    expect(runs("2026-10-26", [lv, cb])).toEqual(["08:00-09:00", "19:00-21:00"]);
  });

  it("an inactive row is no hours at all", () => {
    const rows = [...weekdays(), row({ startTime: "19:00:00", endTime: "21:00:00", isActive: false })];
    expect(runs(MON, [at(LV, rows)])).toEqual(["08:00-09:00", "19:00-21:00"]);
  });
});

describe("no hours configured means no band (the enforcement refuses nothing)", () => {
  it("no rows at all: nothing is shaded on any day", () => {
    expect(offHoursByDate({ dates: WEEK, slots: SLOTS, clinics: [at(LV, [])] })).toEqual({});
  });

  it("only inactive rows: still nothing", () => {
    const clinics = [at(LV, weekdays({ isActive: false }))];
    expect(offHoursByDate({ dates: WEEK, slots: SLOTS, clinics })).toEqual({});
  });

  it("no clinic in view: nothing", () => {
    expect(offHoursByDate({ dates: WEEK, slots: SLOTS, clinics: [] })).toEqual({});
    expect(isSlotOffHours(MON, 20 * 60, [])).toBe(false);
  });

  it("CONTROL: the same call with hours configured does shade", () => {
    const out = offHoursByDate({ dates: WEEK, slots: SLOTS, clinics: [at(LV, weekdays())] });
    expect(Object.keys(out)).toEqual(WEEK);
  });
});

describe("one clinic selected against every clinic in view", () => {
  // Mornings at LV, afternoons at CB, Monday to Friday.
  const lvRows = weekdays({ startTime: "09:00:00", endTime: "13:00:00" });
  const cbRows = weekdays({ startTime: "14:00:00", endTime: "19:00:00", locationId: CB });
  const all = [...lvRows, ...cbRows];

  it("schedulesByClinic keeps the clinics asked for and drops every other row", () => {
    expect(schedulesByClinic(all, [LV])).toEqual([at(LV, lvRows)]);
    expect(schedulesByClinic(all, [LV, CB])).toEqual([at(LV, lvRows), at(CB, cbRows)]);
    // A clinic asked about with no rows still gets its (empty) entry.
    expect(schedulesByClinic(lvRows, [LV, CB])).toEqual([at(LV, lvRows), at(CB, [])]);
    // A row with no clinic on it belongs to none.
    expect(schedulesByClinic([row({ locationId: null })], [LV])).toEqual([at(LV, [])]);
  });

  it("LV selected: the afternoon worked at CB is off hours here", () => {
    expect(runs(MON, schedulesByClinic(all, [LV]))).toEqual(["08:00-09:00", "13:00-21:00"]);
  });

  it("CB selected: the morning worked at LV is off hours here", () => {
    expect(runs(MON, schedulesByClinic(all, [CB]))).toEqual(["08:00-14:00", "19:00-21:00"]);
  });

  it("every clinic: shaded only where the therapist works at NEITHER", () => {
    expect(runs(MON, schedulesByClinic(all, [LV, CB]))).toEqual([
      "08:00-09:00",
      "13:00-14:00",
      "19:00-21:00",
    ]);
  });

  it("every clinic: windows that only touch across two clinics cover no booking", () => {
    // 09:00-09:15 at LV and 09:15-09:30 at CB. A 09:00 booking is refused at
    // both, so the slot is shaded; merged rows would have read it as worked.
    const touching = [
      row({ startTime: "09:00:00", endTime: "09:15:00" }),
      row({ startTime: "09:15:00", endTime: "09:30:00", locationId: CB }),
    ];
    expect(isSlotOffHours(MON, 9 * 60, schedulesByClinic(touching, [LV, CB]))).toBe(true);
  });

  it("every clinic: a clinic where the therapist has no hours adds no window and no veto", () => {
    // Hours at LV only. CB is in view and has none for this therapist: it is
    // not somewhere they work, so the band is LV's.
    expect(runs(MON, schedulesByClinic(lvRows, [LV, CB]))).toEqual(["08:00-09:00", "13:00-21:00"]);
  });

  it("the selected clinic has no hours for the therapist: nothing is shaded there", () => {
    // Hours at LV only, CB selected. The enforcement refuses nothing at CB.
    expect(runs(MON, schedulesByClinic(lvRows, [CB]))).toEqual([]);
  });
});

describe("the two clock-change Sundays (Europe/Lisbon)", () => {
  // Sunday hours 09:00 to 13:00. The band is about the WALL CLOCK, so it must
  // sit on the same slots as on any other Sunday.
  const sunday = [row({ weekday: 0, startTime: "09:00:00", endTime: "13:00:00" })];
  const ORDINARY = "2026-10-18";
  const CLOCKS_BACK = "2026-10-25";
  const CLOCKS_FORWARD = "2027-03-28";

  it("CONTROL: the instants really are an hour apart on those days", () => {
    expect(lisbonDateTimeToUtc(ORDINARY, "09:00").toISOString()).toBe("2026-10-18T08:00:00.000Z");
    expect(lisbonDateTimeToUtc(CLOCKS_BACK, "09:00").toISOString()).toBe("2026-10-25T09:00:00.000Z");
    expect(lisbonDateTimeToUtc("2027-03-27", "09:00").toISOString()).toBe("2027-03-27T09:00:00.000Z");
    expect(lisbonDateTimeToUtc(CLOCKS_FORWARD, "09:00").toISOString()).toBe("2027-03-28T08:00:00.000Z");
  });

  for (const date of [ORDINARY, CLOCKS_BACK, CLOCKS_FORWARD]) {
    it(`${date}: shaded before 09:00 and from 13:00, and nowhere else`, () => {
      expect(runs(date, [at(LV, sunday)])).toEqual(["08:00-09:00", "13:00-21:00"]);
    });
  }

  it("the Saturday before and the Monday after each change keep their own hours", () => {
    const rows = [...sunday, ...weekdays(), row({ weekday: 6, startTime: "09:00:00", endTime: "13:00:00" })];
    expect(runs("2026-10-24", [at(LV, rows)])).toEqual(["08:00-09:00", "13:00-21:00"]);
    expect(runs("2026-10-26", [at(LV, rows)])).toEqual(["08:00-09:00", "19:00-21:00"]);
    expect(runs("2027-03-27", [at(LV, rows)])).toEqual(["08:00-09:00", "13:00-21:00"]);
    expect(runs("2027-03-29", [at(LV, rows)])).toEqual(["08:00-09:00", "19:00-21:00"]);
  });
});

describe("runs and slots", () => {
  it("spansOfSlots joins consecutive slots and never bridges a rejected one", () => {
    const off = new Set([480, 510, 600, 1230]);
    expect(spansOfSlots(SLOTS, (m) => off.has(m))).toEqual([
      { startMin: 480, endMin: 540 },
      { startMin: 600, endMin: 630 },
      { startMin: 1230, endMin: 1260 },
    ]);
    expect(spansOfSlots(SLOTS, () => false)).toEqual([]);
  });

  it("isSlotInSpans gives back exactly the slots a run was built from", () => {
    const off = new Set([480, 510, 600]);
    const spans = spansOfSlots(SLOTS, (m) => off.has(m));
    for (const m of SLOTS) expect(isSlotInSpans(m, spans), slotLabel(m)).toBe(off.has(m));
  });

  it("a day with nothing shaded has no key", () => {
    // Hours covering the whole drawn day.
    const full = [row({ startTime: "08:00:00", endTime: "21:00:00" })];
    expect(offHoursByDate({ dates: [MON], slots: SLOTS, clinics: [at(LV, full)] })).toEqual({});
  });
});

/* ==================================================================== */
/* THE AGREEMENT: SHADED EQUALS REFUSED, ASKED OF THE ENFORCEMENT.       */
/* ==================================================================== */

/** The tx stand-in of availability-enforcement.test.ts: one select, these rows. */
function txWith(rows: unknown[]) {
  const chain = {
    from: () => chain,
    where: () => Promise.resolve(rows),
  };
  return { select: () => chain } as never;
}

/** Would the write path refuse a one-slot booking here for being outside the hours? */
async function refused(date: string, slotMin: number, rows: AvailabilityTemplate[]): Promise<boolean> {
  const startsAt = lisbonDateTimeToUtc(date, slotLabel(slotMin));
  const endsAt = new Date(startsAt.getTime() + SLOT_MINUTES * 60_000);
  const verdict = await checkAvailability(txWith(rows), {
    practitionerId: "p-1",
    locationId: LV,
    startsAt,
    endsAt,
  });
  return !verdict.ok;
}

describe("AGREEMENT: a slot is shaded exactly when checkAvailability refuses a booking of it", () => {
  /** Every half hour of the day, so the edges of every window are crossed. */
  const ALL_DAY = daySlots(0, 24 * 60);

  const cases: { name: string; date: string; rows: AvailabilityTemplate[]; expectBoth: boolean }[] = [
    { name: "a normal weekday", date: MON, rows: weekdays(), expectBoth: true },
    {
      name: "a split shift",
      date: MON,
      rows: [row({ endTime: "13:00:00" }), row({ startTime: "14:30:00" })],
      expectBoth: true,
    },
    { name: "hours off the half hour", date: MON, rows: [row({ startTime: "09:15:00", endTime: "18:45:00" })], expectBoth: true },
    { name: "a day not worked", date: SAT, rows: weekdays(), expectBoth: false },
    { name: "before a schedule starts", date: TUE, rows: weekdays({ validFrom: WED }), expectBoth: false },
    { name: "the day a schedule starts", date: WED, rows: weekdays({ validFrom: WED }), expectBoth: true },
    { name: "the day a schedule ends", date: WED, rows: weekdays({ validUntil: WED }), expectBoth: true },
    { name: "after a schedule ends", date: THU, rows: weekdays({ validUntil: WED }), expectBoth: false },
    {
      name: "a dated row over a carved week",
      date: WED,
      rows: [
        ...weekdays({ validUntil: TUE }),
        row({ weekday: 3, startTime: "14:00:00", endTime: "18:00:00", validFrom: WED, validUntil: WED }),
        ...weekdays({ validFrom: THU }),
      ],
      expectBoth: true,
    },
    {
      name: "an inactive row beside active ones",
      date: FRI,
      rows: [...weekdays(), row({ weekday: 5, startTime: "19:00:00", endTime: "21:00:00", isActive: false })],
      expectBoth: true,
    },
    { name: "no rows at all", date: MON, rows: [], expectBoth: false },
    { name: "only inactive rows", date: MON, rows: weekdays({ isActive: false }), expectBoth: false },
    {
      name: "the Sunday the clocks go back",
      date: "2026-10-25",
      rows: [row({ weekday: 0, startTime: "00:00:00", endTime: "13:00:00" })],
      expectBoth: true,
    },
    {
      name: "the Sunday the clocks go forward",
      date: "2027-03-28",
      rows: [row({ weekday: 0, startTime: "00:00:00", endTime: "13:00:00" })],
      expectBoth: true,
    },
  ];

  for (const c of cases) {
    it(c.name, async () => {
      const clinics = [at(LV, c.rows)];
      let shaded = 0;
      let clear = 0;
      for (const m of ALL_DAY) {
        const isShaded = isSlotOffHours(c.date, m, clinics);
        expect(isShaded, `${c.date} ${slotLabel(m)}`).toBe(await refused(c.date, m, c.rows));
        if (isShaded) shaded++;
        else clear++;
      }
      // Not vacuous: a case that claims to cross a window's edge really has
      // slots on both sides of it.
      expect(shaded + clear).toBe(48);
      if (c.expectBoth) {
        expect(shaded, "some slot must be refused").toBeGreaterThan(0);
        expect(clear, "some slot must be accepted").toBeGreaterThan(0);
      }
    });
  }

  it("the runs handed to the grid carry the same answer, slot for slot", async () => {
    const rows = [row({ endTime: "13:00:00" }), row({ startTime: "14:30:00" })];
    const spans = offHoursByDate({ dates: [MON], slots: SLOTS, clinics: [at(LV, rows)] })[MON] ?? [];
    for (const m of SLOTS) {
      expect(isSlotInSpans(m, spans), slotLabel(m)).toBe(await refused(MON, m, rows));
    }
  });

  it("every clinic in view: shaded exactly when every clinic with hours refuses, and one does", async () => {
    const lvRows = weekdays({ startTime: "09:00:00", endTime: "13:00:00" });
    const cbRows = weekdays({ startTime: "14:00:00", endTime: "19:00:00", locationId: CB });
    const views: { name: string; clinics: ClinicSchedule[] }[] = [
      { name: "hours at both", clinics: [at(LV, lvRows), at(CB, cbRows)] },
      { name: "hours at one, none at the other", clinics: [at(LV, lvRows), at(CB, [])] },
      { name: "hours at neither", clinics: [at(LV, []), at(CB, [])] },
    ];
    for (const v of views) {
      for (const m of ALL_DAY) {
        const perClinic = await Promise.all(
          v.clinics.map(async (c) => ({
            hasHours: c.templates.some((t) => t.isActive),
            refuses: await refused(MON, m, c.templates),
          })),
        );
        const withHours = perClinic.filter((c) => c.hasHours);
        const want = withHours.length > 0 && withHours.every((c) => c.refuses);
        expect(isSlotOffHours(MON, m, v.clinics), `${v.name} ${slotLabel(m)}`).toBe(want);
      }
    }
  });
});
