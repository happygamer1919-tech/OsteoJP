import { getTableName, type SQL, type Table } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * HOR-01 - EVERY STAFF READER, SWITCHED. One arm per reader, each proving the
 * same two facts about a therapist with NO Horarios rows who is an active,
 * bookable member of a clinic: bookable inside the clinic's hours, refused (or
 * not offered) outside them.
 *
 *   checkAvailability          create, clone and reschedule refuse with it
 *   findScheduleConflicts      the advisory conflict panel
 *   getTherapistAvailability   Nova marcacao's day panel
 *   batchSchedule's read       Agendar lote (getTherapistAvailability + classifyBatchSlots)
 *   listTherapistBlocksAndHours + agendaOffHours   the agenda's off-hours band
 *   getTherapistLocationIds    the Localizacao auto-fill
 *   inspectSchedule            the Horarios inspector
 *
 * THE DATABASE IS A TABLE-KEYED FAKE. Each `.from(table)` answers with the rows
 * given for that table, whatever the WHERE says, so every fixture below holds
 * exactly the rows the real query would return for this one therapist. What is
 * on trial is what each reader DOES with those rows; the SQL itself is proven
 * against Postgres in effective-availability.db.test.ts.
 *
 * Dates are November 2026, Lisbon on WET (UTC+0), so a "Z" instant is the
 * Lisbon wall clock. 2026-11-02 is a Monday, 2026-11-07 a Saturday,
 * 2026-11-08 a Sunday.
 */

const MON = "2026-11-02";
const SAT = "2026-11-07";
const SUN = "2026-11-08";
const at = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00.000Z`);

const T = "therapist-1";
const LV = "00000000-0000-4000-8000-0000000000a1";

type Rows = Record<string, unknown[]>;

type SaturdayRow = { opensAt: string | null; closesAt: string | null };
let current: { tables: Rows; saturdayColumns: string[]; saturday: Record<string, SaturdayRow> };

const dialect = new PgDialect();

function fakeTx() {
  const chain = (rows: () => unknown[]) => {
    const c: Record<string, unknown> = {};
    for (const m of ["where", "innerJoin", "leftJoin", "orderBy", "limit", "groupBy"]) c[m] = () => c;
    c.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve(rows()).then(res, rej);
    return c;
  };
  const select = () => ({
    from: (table: Table) => {
      const name = getTableName(table);
      return chain(() => current.tables[name] ?? []);
    },
  });
  return {
    select,
    selectDistinct: select,
    execute: async (q: SQL) => {
      const text = dialect.sqlToQuery(q).sql;
      if (text.includes("information_schema.columns")) {
        // The catalogue names the Saturday columns that exist, as Postgres would.
        return current.saturdayColumns.map((column_name) => ({ column_name }));
      }
      if (text.includes("saturday_closes_at")) {
        return Object.entries(current.saturday).map(([id, v]) => ({
          id,
          saturday_opens_at: v.opensAt,
          saturday_closes_at: v.closesAt,
        }));
      }
      return [];
    },
  } as never;
}

vi.mock("@/lib/auth/context", () => ({
  runScoped: async (_ctx: unknown, fn: (tx: unknown) => unknown) => fn(fakeTx()),
}));

import { resetLocationSaturdayHoursCache } from "@osteojp/db";
import { checkAvailability } from "./availability-enforcement";
import { findScheduleConflicts } from "./conflict";
import { getTherapistAvailability, listTherapistBlocksAndHours } from "./day-availability";
import { classifyBatchSlots, resolveBatchSlots } from "./batch-core";
import { agendaOffHours } from "./off-hours-core";
import { getTherapistLocationIds } from "./therapist-locations";
import { inspectSchedule } from "./schedule-inspection";
import { noFreeReason } from "./day-availability-core";

const CTX = { tenantId: "t", userId: "u", role: "reception" } as never;

/** A therapist with no rows, active, bookable, a member of LV (08:00 to 21:00). */
function noRowsMember(over: { users?: unknown[]; staff?: unknown[]; time_off?: unknown[] } = {}) {
  current = {
    saturdayColumns: [],
    saturday: {},
    tables: {
      availability_templates: [],
      users: over.users ?? [{ isActive: true, isBookable: true, isSharedResource: false }],
      staff_locations: over.staff ?? [{ locationId: LV }],
      locations: [
        {
          id: LV,
          opensAt: "08:00:00",
          closesAt: "21:00:00",
          middayClosedFrom: null,
          middayClosedTo: null,
          isActive: true,
        },
      ],
      appointments: [],
      time_off: over.time_off ?? [],
    },
  };
}

beforeEach(() => {
  resetLocationSaturdayHoursCache();
  noRowsMember();
});

describe("checkAvailability (create, clone, reschedule)", () => {
  const check = (date: string, from: string, to: string) =>
    checkAvailability(fakeTx(), { practitionerId: T, locationId: LV, startsAt: at(date, from), endsAt: at(date, to) });

  it("BOOKABLE inside clinic hours on a weekday", async () => {
    expect(await check(MON, "10:00", "11:00")).toEqual({ ok: true, reason: "covered" });
  });

  it("REFUSED outside them, naming the clinic's hours", async () => {
    expect(await check(MON, "21:00", "22:00")).toEqual({
      ok: false,
      windows: [{ startTime: "08:00", endTime: "21:00" }],
    });
  });

  it("REFUSED on Sunday, as a day not worked", async () => {
    expect(await check(SUN, "10:00", "11:00")).toEqual({ ok: false, windows: [] });
  });

  it("Saturday: refused while the clinic has no Saturday hours", async () => {
    expect(await check(SAT, "10:00", "11:00")).toEqual({ ok: false, windows: [] });
  });

  it("Saturday: refused when only the closing column exists, even with a value in it", async () => {
    current.saturdayColumns = ["saturday_closes_at"];
    current.saturday = { [LV]: { opensAt: null, closesAt: "13:00:00" } };
    expect(await check(SAT, "10:00", "11:00")).toEqual({ ok: false, windows: [] });
  });

  it("Saturday: refused when both columns exist but the opening time is NULL", async () => {
    current.saturdayColumns = ["saturday_opens_at", "saturday_closes_at"];
    current.saturday = { [LV]: { opensAt: null, closesAt: "13:00:00" } };
    expect(await check(SAT, "10:00", "11:00")).toEqual({ ok: false, windows: [] });
  });

  it("Saturday: bookable from the Saturday opening to the Saturday closing once both hold a value", async () => {
    current.saturdayColumns = ["saturday_opens_at", "saturday_closes_at"];
    current.saturday = { [LV]: { opensAt: "09:00:00", closesAt: "13:00:00" } };
    expect(await check(SAT, "10:00", "11:00")).toEqual({ ok: true, reason: "covered" });
    // 08:00 is the WEEKDAY opening; on Saturday the clinic is still shut.
    expect(await check(SAT, "08:00", "09:00")).toEqual({
      ok: false,
      windows: [{ startTime: "09:00", endTime: "13:00" }],
    });
    expect(await check(SAT, "13:00", "14:00")).toEqual({
      ok: false,
      windows: [{ startTime: "09:00", endTime: "13:00" }],
    });
    // Sunday stays shut whatever Saturday holds.
    expect(await check(SUN, "10:00", "11:00")).toEqual({ ok: false, windows: [] });
  });

  it("a therapist the default does not apply to stays UNCONFIGURED, exactly as before", async () => {
    noRowsMember({ users: [{ isActive: true, isBookable: false, isSharedResource: false }] });
    expect(await check(SUN, "03:00", "04:00")).toEqual({ ok: true, reason: "unconfigured" });
    noRowsMember({ staff: [] });
    expect(await check(SUN, "03:00", "04:00")).toEqual({ ok: true, reason: "unconfigured" });
    noRowsMember({ users: [{ isActive: true, isBookable: true, isSharedResource: true }] });
    expect(await check(SUN, "03:00", "04:00")).toEqual({ ok: true, reason: "unconfigured" });
  });

  it("own rows override: 15:00 refused against a 09:00-13:00 Monday", async () => {
    current.tables.availability_templates = [
      {
        id: "r1",
        weekday: 1,
        startTime: "09:00:00",
        endTime: "13:00:00",
        validFrom: null,
        validUntil: null,
        isActive: true,
        locationId: LV,
      },
    ];
    expect(await check(MON, "15:00", "16:00")).toEqual({
      ok: false,
      windows: [{ startTime: "09:00", endTime: "13:00" }],
    });
  });
});

describe("findScheduleConflicts (the advisory panel)", () => {
  const find = (date: string, from: string, to: string) =>
    findScheduleConflicts(fakeTx(), {
      practitionerId: T,
      locationId: LV,
      startsAt: at(date, from),
      endsAt: at(date, to),
    });

  it("no availability conflict inside clinic hours", async () => {
    expect((await find(MON, "10:00", "11:00")).map((c) => c.kind)).toEqual([]);
  });

  it("an availability conflict outside them", async () => {
    expect((await find(MON, "21:00", "22:00")).map((c) => c.kind)).toEqual(["availability"]);
  });

  it("a block inside clinic hours is still a time_off conflict", async () => {
    noRowsMember({
      time_off: [{ id: "b1", startsAt: at(MON, "10:00"), endsAt: at(MON, "12:00"), reason: "other" }],
    });
    expect((await find(MON, "10:00", "11:00")).map((c) => c.kind)).toEqual(["time_off"]);
  });
});

describe("getTherapistAvailability (Nova marcacao's day panel)", () => {
  it("offers the clinic's hours minus blocks on a weekday", async () => {
    noRowsMember({
      time_off: [
        { id: "b1", startsAt: at(MON, "10:00"), endsAt: at(MON, "12:00"), reason: "other", note: null },
      ],
    });
    const [day] = await getTherapistAvailability(CTX, { therapistId: T, from: MON, to: MON, locationId: LV });
    expect(day!.working).toEqual([{ start: at(MON, "08:00").toISOString(), end: at(MON, "21:00").toISOString() }]);
    expect(day!.free).toEqual([
      { start: at(MON, "08:00").toISOString(), end: at(MON, "10:00").toISOString() },
      { start: at(MON, "12:00").toISOString(), end: at(MON, "21:00").toISOString() },
    ]);
  });

  it("offers nothing on Sunday, and says why", async () => {
    const [day] = await getTherapistAvailability(CTX, { therapistId: T, from: SUN, to: SUN, locationId: LV });
    expect(day!.free).toEqual([]);
    expect(noFreeReason(day!)).toBe("no_working_hours");
  });
});

describe("Agendar lote (the batch engine's availability read)", () => {
  it("books inside clinic hours and fails outside them", async () => {
    const slot = (date: string, hhmm: string) => ({
      startsAt: at(date, hhmm).toISOString(),
      endsAt: new Date(at(date, hhmm).getTime() + 60 * 60_000).toISOString(),
    });
    const slots = resolveBatchSlots({
      slots: [slot(MON, "10:00"), slot(MON, "20:30"), slot(SUN, "10:00")],
    } as never);
    const days = await getTherapistAvailability(CTX, { therapistId: T, from: MON, to: SUN, locationId: LV });
    const freeByDate = new Map(
      days.map((d) => [d.date, d.free.map((iv) => ({ start: new Date(iv.start), end: new Date(iv.end) }))]),
    );
    const { toBook, failures } = classifyBatchSlots(slots, freeByDate);
    expect(toBook.map((s) => `${s.date} ${s.hhmm}`)).toEqual([`${MON} 10:00`]);
    expect(failures.map((f) => `${f.date} ${f.hhmm}`)).toEqual([`${MON} 20:30`, `${SUN} 10:00`]);
  });
});

describe("the agenda's off-hours band", () => {
  it("leaves clinic hours unmarked and marks the rest", async () => {
    const { templates } = await listTherapistBlocksAndHours(CTX, {
      therapistId: T,
      rangeStart: at(MON, "00:00"),
      rangeEnd: at(SUN, "00:00"),
    });
    const bands = agendaOffHours({
      templates,
      therapistViewer: false,
      selectedLocationId: LV,
      locations: [{ id: LV }],
      bookableLocations: [{ id: LV }],
      view: "week",
      anchor: MON,
      dayWindow: { startMin: 8 * 60, endMin: 22 * 60 },
    });
    // Monday: only 21:00 to 22:00 is outside the clinic's day.
    expect(bands[MON]).toEqual([{ startMin: 21 * 60, endMin: 22 * 60 }]);
    // Saturday with no Saturday hours: the whole visible day.
    expect(bands[SAT]).toEqual([{ startMin: 8 * 60, endMin: 22 * 60 }]);
  });
});

describe("getTherapistLocationIds (the Localizacao auto-fill)", () => {
  it("a no-rows member of one clinic auto-fills to it", async () => {
    expect(await getTherapistLocationIds(CTX, T)).toEqual([LV]);
  });

  it("nobody the default does not apply to is auto-filled anywhere", async () => {
    noRowsMember({ users: [{ isActive: false, isBookable: true, isSharedResource: false }] });
    expect(await getTherapistLocationIds(CTX, T)).toEqual([]);
  });
});

describe("inspectSchedule (the Horarios inspector)", () => {
  it("shows the clinic's hours on weekdays, labelled as the clinic's, and nothing on Sunday", async () => {
    const days = await inspectSchedule(CTX, {
      therapistId: T,
      from: MON,
      to: SUN,
      locationNames: new Map([[LV, "Linda-a-Velha"]]),
    });
    const mon = days.find((d) => d.date === MON)!;
    expect(mon.windows).toEqual([
      { start: "08:00", end: "21:00", locationId: LV, locationName: "Linda-a-Velha", rule: "clinica", templateId: null },
    ]);
    expect(days.find((d) => d.date === SUN)!.windows).toEqual([]);
  });
});
