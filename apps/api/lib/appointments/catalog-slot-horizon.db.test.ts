/**
 * catalog-slot-horizon.db.test.ts - R15 (strategy, 2026-10-26): the patient
 * catalog and the therapist step read a schedule row's validity window against
 * the SAME days the slot step offers, [today, today + OPEN_SLOTS_HORIZON_DAYS]
 * in Lisbon, and no longer against today alone (Q-ROSTER). PROVEN AGAINST A
 * REAL POSTGRES, THROUGH THE REAL STORE AND THE REAL BOOKING FUNCTIONS.
 *
 * Strategy's gate: "CHECK a fixture whose templates start tomorrow, on a
 * Sunday. EXPECT the clinic and its services listed and slots offered, with
 * every other case unchanged."
 *
 * "TODAY" IS THE DATABASE'S. The catalog and the roster read `now()` in
 * Postgres, which a test cannot move, so no arm can make today a Sunday. The
 * Sunday case is covered BY ITS SHAPE instead: what a Sunday does to a clinic
 * is leave it with no schedule row covering today and rows on the following
 * days. Two clinics carry that shape on whatever day this runs:
 *   TOMORROW   weekly rows (every weekday) that start tomorrow
 *   DAYBYDAY   the day-by-day schedule's shape: one dated row per day worked
 *              (valid_from = valid_until = the date), for tomorrow and the day
 *              after, and nothing today, as on a Sunday
 * And the cases that must not move:
 *   EDGE       weekly rows starting on the horizon's LAST day: listed (the
 *              slot step's range is inclusive), slots on that day only
 *   BEYOND     weekly rows starting the day after the horizon: hidden
 *   EXPIRED    weekly rows that ended yesterday: hidden
 *   NORMAL     open-ended weekly rows: listed, as before
 *   HELD       open-ended weekly rows, held by ONLINE_BOOKING_HELD_LOCATION_IDS
 *              (R10): hidden while held
 * One therapist, ticked for one service bound to that clinic, per clinic.
 *
 * THE SLOT STEP RUNS ON THE DATABASE'S CLOCK TOO: `now` is read from Postgres,
 * so the grid's days and the catalog's days are one calendar.
 *
 * WRITES NOTHING BUT ITS OWN TENANT. GATING: needs a live DATABASE_URL with
 * migrations applied (.github/workflows/db-tests.yml runs `vitest run
 * .db.test.ts` in this app). Skipped without one. Invented names only.
 */
import { randomUUID } from "node:crypto";

import { sql as raw } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { AppointmentsStore } from "./booking";

const live = Boolean(process.env.DATABASE_URL);
const d = live ? describe : describe.skip;

const CLINICS = ["TOMORROW", "DAYBYDAY", "EDGE", "BEYOND", "EXPIRED", "NORMAL", "HELD"] as const;
type Clinic = (typeof CLINICS)[number];

/** Lisbon calendar date of an instant, yyyy-mm-dd. */
const lisbonDate = (iso: string): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon" }).format(new Date(iso));

d("R15: the catalog and the therapist step use the slot step's date horizon", () => {
  let db: Awaited<ReturnType<typeof import("@osteojp/db").getDbAdmin>>;
  let booking: typeof import("./booking");
  let realStore: AppointmentsStore;
  let H: number;

  const tenantId = randomUUID();
  const patientId = randomUUID();
  const loc = {} as Record<Clinic, string>;
  const therapist = {} as Record<Clinic, string>;
  const service = {} as Record<Clinic, string>;
  for (const c of CLINICS) {
    loc[c] = randomUUID();
    therapist[c] = randomUUID();
    service[c] = randomUUID();
  }

  const principal = () => ({ tenantId, patientId, role: "patient" }) as never;

  /** The database's now, and its Lisbon date plus `offset` days. */
  async function dbNow(): Promise<Date> {
    const [row] = (await db.execute(raw`select now() as now`)) as unknown as [{ now: Date | string }];
    return row.now instanceof Date ? row.now : new Date(row.now);
  }
  async function lisbonDay(offset: number): Promise<string> {
    const [row] = (await db.execute(raw`
      select to_char((now() at time zone 'Europe/Lisbon')::date + ${offset}::int, 'YYYY-MM-DD') as day
    `)) as unknown as [{ day: string }];
    return row.day;
  }

  const catalog = () => booking.getBookableCatalog(principal(), realStore);
  const roster = (c: Clinic) =>
    booking.listBookableTherapists(principal(), { serviceId: service[c], locationId: loc[c] }, realStore);
  const slots = async (c: Clinic) =>
    booking.listOpenSlots(principal(), { serviceId: service[c], locationId: loc[c] }, realStore, await dbNow());

  /** Weekly rows on every weekday, with the window given as day offsets from today. */
  async function weekly(c: Clinic, fromOffset: number | null, untilOffset: number | null): Promise<void> {
    for (let weekday = 0; weekday < 7; weekday++) {
      await db.execute(raw`insert into availability_templates
          (id, tenant_id, user_id, location_id, weekday, start_time, end_time, is_active,
           valid_from, valid_until)
        values (${randomUUID()}, ${tenantId}, ${therapist[c]}, ${loc[c]}, ${weekday}, '09:00', '18:00', true,
                case when ${fromOffset}::int is null then null
                     else (now() at time zone 'Europe/Lisbon')::date + ${fromOffset}::int end,
                case when ${untilOffset}::int is null then null
                     else (now() at time zone 'Europe/Lisbon')::date + ${untilOffset}::int end)`);
    }
  }

  /** One dated row, the day-by-day schedule's shape: valid_from = valid_until = that day. */
  async function dated(c: Clinic, offset: number): Promise<void> {
    await db.execute(raw`
      with day as (select (now() at time zone 'Europe/Lisbon')::date + ${offset}::int as d)
      insert into availability_templates
          (id, tenant_id, user_id, location_id, weekday, start_time, end_time, is_active,
           valid_from, valid_until)
      select ${randomUUID()}, ${tenantId}, ${therapist[c]}, ${loc[c]}, extract(dow from day.d)::int,
             '09:00', '18:00', true, day.d, day.d
        from day`);
  }

  beforeAll(async () => {
    const { getDbAdmin } = await import("@osteojp/db");
    db = getDbAdmin();
    booking = await import("./booking");
    ({ drizzleAppointmentsStore: realStore } = await import("./store"));
    H = booking.OPEN_SLOTS_HORIZON_DAYS;

    await db.execute(raw`insert into tenants (id, name, slug)
      values (${tenantId}, 'R15 Horizon Co', ${"r15-" + tenantId.slice(0, 8)})`);
    for (const c of CLINICS) {
      await db.execute(raw`insert into locations
          (id, tenant_id, name, opens_at, closes_at, slot_granularity_min)
        values (${loc[c]}, ${tenantId}, ${"Clinica " + c + " (teste)"}, '08:00', '21:00', 60)`);
      await db.execute(raw`insert into users
          (id, tenant_id, email, full_name, is_active, is_bookable)
        values (${therapist[c]}, ${tenantId}, ${"r15-" + therapist[c].slice(0, 8) + "@t.test"},
                ${"Terapeuta " + c}, true, true)`);
      await db.execute(raw`insert into services
          (id, tenant_id, name, duration_min, is_active, patient_bookable, location_id)
        values (${service[c]}, ${tenantId}, ${"Servico " + c + " (teste)"}, 60, true, true, ${loc[c]})`);
      await db.execute(raw`insert into therapist_services (tenant_id, therapist_user_id, service_id)
        values (${tenantId}, ${therapist[c]}, ${service[c]})`);
    }

    await weekly("TOMORROW", 1, null);
    await dated("DAYBYDAY", 1);
    await dated("DAYBYDAY", 2);
    await weekly("EDGE", H, null);
    await weekly("BEYOND", H + 1, null);
    await weekly("EXPIRED", -60, -1);
    await weekly("NORMAL", null, null);
    await weekly("HELD", null, null);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  afterAll(async () => {
    if (!db) return;
    await db.execute(raw`delete from therapist_services where tenant_id = ${tenantId}`);
    await db.execute(raw`delete from availability_templates where tenant_id = ${tenantId}`);
    await db.execute(raw`delete from services where tenant_id = ${tenantId}`);
    await db.execute(raw`delete from users where tenant_id = ${tenantId}`);
    await db.execute(raw`delete from locations where tenant_id = ${tenantId}`);
    await db.execute(raw`delete from tenants where id = ${tenantId}`);
  });

  it("PREMISE: the fixture seeded, and no schedule row covers today at TOMORROW or DAYBYDAY", async () => {
    expect(Number.isInteger(H) && H > 1).toBe(true);
    const [counts] = (await db.execute(raw`
      select count(*)::int as rows,
             count(*) filter (
               where location_id in (${loc.TOMORROW}::uuid, ${loc.DAYBYDAY}::uuid)
                 and (valid_from  is null or valid_from  <= (now() at time zone 'Europe/Lisbon')::date)
                 and (valid_until is null or valid_until >= (now() at time zone 'Europe/Lisbon')::date)
             )::int as covering_today
        from availability_templates where tenant_id = ${tenantId}
    `)) as unknown as [{ rows: number; covering_today: number }];
    // Six weekly clinics of seven rows, and two dated rows.
    expect(counts).toEqual({ rows: 6 * 7 + 2, covering_today: 0 });
  });

  describe("THE GATE: hours that start tomorrow, and the Sunday shape", () => {
    for (const c of ["TOMORROW", "DAYBYDAY"] as const) {
      it(`${c}: the clinic is listed and its service is offered there`, async () => {
        const cat = await catalog();
        expect(cat.locations.map((l) => l.id)).toContain(loc[c]);
        expect(cat.services.find((s) => s.id === service[c])?.locationIds).toEqual([loc[c]]);
      });

      it(`${c}: the therapist step names the therapist`, async () => {
        expect((await roster(c)).map((t) => t.id)).toEqual([therapist[c]]);
      });

      it(`${c}: slots are offered, none of them today`, async () => {
        const offered = await slots(c);
        expect(offered.length).toBeGreaterThan(0);
        const today = await lisbonDay(0);
        expect(offered.every((iso) => lisbonDate(iso) > today)).toBe(true);
      });
    }

    it("DAYBYDAY: the slots fall on the two dated days only", async () => {
      const days = new Set((await slots("DAYBYDAY")).map(lisbonDate));
      expect([...days].sort()).toEqual([await lisbonDay(1), await lisbonDay(2)]);
    });
  });

  describe("the cases that do not move", () => {
    it("EDGE: rows that start on the horizon's last day are listed, with slots on that day only", async () => {
      const cat = await catalog();
      expect(cat.services.find((s) => s.id === service.EDGE)?.locationIds).toEqual([loc.EDGE]);
      expect((await roster("EDGE")).map((t) => t.id)).toEqual([therapist.EDGE]);
      const days = new Set((await slots("EDGE")).map(lisbonDate));
      expect([...days]).toEqual([await lisbonDay(H)]);
    });

    for (const c of ["BEYOND", "EXPIRED"] as const) {
      it(`${c}: the service is hidden, the therapist step is empty and no slot is offered`, async () => {
        const cat = await catalog();
        expect(cat.services.map((s) => s.id)).not.toContain(service[c]);
        expect(await roster(c)).toEqual([]);
        expect(await slots(c)).toEqual([]);
      });

      it(`${c}: the clinic itself stays listed, as R45's dateless rule already decided`, async () => {
        // location-bookable.ts reads no date, and R15 does not change it;
        // location-bookable.db.test.ts pins both halves of that decision.
        expect((await catalog()).locations.map((l) => l.id)).toContain(loc[c]);
      });
    }

    it("NORMAL: open-ended hours are listed with their service, therapist and slots", async () => {
      const cat = await catalog();
      expect(cat.services.find((s) => s.id === service.NORMAL)?.locationIds).toEqual([loc.NORMAL]);
      expect((await roster("NORMAL")).map((t) => t.id)).toEqual([therapist.NORMAL]);
      expect((await slots("NORMAL")).length).toBeGreaterThan(0);
    });

    it("HELD: while held, the clinic and its service are hidden and the roster and slots are refused", async () => {
      vi.stubEnv("ONLINE_BOOKING_HELD_LOCATION_IDS", loc.HELD);
      const cat = await catalog();
      expect(cat.locations.map((l) => l.id)).not.toContain(loc.HELD);
      expect(cat.services.map((s) => s.id)).not.toContain(service.HELD);
      await expect(roster("HELD")).rejects.toMatchObject({ code: "location_unavailable" });
      await expect(slots("HELD")).rejects.toMatchObject({ code: "location_unavailable" });
      // The hold is the only reason: the gate's clinics are untouched by it.
      expect(cat.services.find((s) => s.id === service.TOMORROW)?.locationIds).toEqual([loc.TOMORROW]);
    });

    it("HELD, control: with no hold the same clinic is listed with its service", async () => {
      const cat = await catalog();
      expect(cat.locations.map((l) => l.id)).toContain(loc.HELD);
      expect(cat.services.find((s) => s.id === service.HELD)?.locationIds).toEqual([loc.HELD]);
    });
  });

  it("parity, with no hold: for every clinic, the service is listed exactly when the therapist step names somebody and slots are offered", async () => {
    const cat = await catalog();
    const mismatches: string[] = [];
    for (const c of CLINICS) {
      const listed = cat.services.some((s) => s.id === service[c] && s.locationIds.includes(loc[c]));
      const named = (await roster(c)).length > 0;
      const offered = (await slots(c)).length > 0;
      if (listed !== named || listed !== offered) mismatches.push(`${c}: ${listed}/${named}/${offered}`);
    }
    expect(mismatches).toEqual([]);
  });

  it("NEGATIVE CONTROL: the old rule (today alone, Q-ROSTER) names nobody at TOMORROW or DAYBYDAY", async () => {
    // The fixture discriminates R15: the predicate as it stood before, run on
    // these same rows, leaves both gate clinics empty and still names NORMAL.
    const rows = (await db.execute(raw`
      select distinct av.location_id as location_id
        from availability_templates av
       where av.tenant_id = ${tenantId}
         and av.is_active = true
         and (av.valid_from  is null or av.valid_from  <= (now() at time zone 'Europe/Lisbon')::date)
         and (av.valid_until is null or av.valid_until >= (now() at time zone 'Europe/Lisbon')::date)
    `)) as unknown as ReadonlyArray<{ location_id: string }>;
    const staffedToday = rows.map((r) => r.location_id);
    expect(staffedToday).not.toContain(loc.TOMORROW);
    expect(staffedToday).not.toContain(loc.DAYBYDAY);
    expect(staffedToday).toContain(loc.NORMAL);
  });
});
