/**
 * portal-default-hours-off.db.test.ts - HOR-01: THE PATIENT PORTAL IS NOT
 * CHANGED, AND THIS PINS IT.
 *
 * On the STAFF side, a therapist with no Horarios rows now works the clinic's
 * opening hours (apps/web/lib/scheduling/effective-availability.ts). Online, it
 * is deliberately the other way round until the owner rules otherwise: the
 * portal keeps reading availability_templates directly, so such a therapist is
 * INVISIBLE to patients exactly as before, and a clinic where only such
 * therapists work is not offered online at all.
 *
 * If somebody switches the portal onto the clinic's default hours, every arm
 * below marked PINNED goes red, which is the point: that is a patient-facing
 * change and needs its own ruling, not a side effect of a staff-side PR.
 *
 * The fixture: therapist N has NO rows but is everything else the staff-side
 * default asks for (active, bookable, a member of both clinics, mapped to the
 * service). Therapist C has rows at Linda (Monday to Saturday 09:00 to 12:00)
 * and is the positive control, without which every "N is absent" assertion
 * would pass on an empty answer. Clinic "So N" has N as its only member.
 *
 * GATING: needs a live DATABASE_URL with migrations applied (db-tests.yml runs
 * `vitest run .db.test.ts` in this app). Skipped without one.
 */
import { randomUUID } from "node:crypto";

import { sql as raw } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/notifications/patient-change", () => ({
  emitPatientChange: vi.fn(async () => ({ delivered: true })),
}));

import type { AppointmentsStore } from "./booking";

const live = Boolean(process.env.DATABASE_URL);
const d = live ? describe : describe.skip;

/** A fixed instant for the slot horizon (a Sunday; the next day is a Monday). */
const NOW = new Date("2027-03-07T00:00:00.000Z");

const lisbonHHMM = (iso: string): string =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Lisbon",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));

/**
 * 10:00 Lisbon on a MONDAY at least a week ahead of the real clock. A Monday,
 * so the clinic's default hours WOULD cover it if the portal used them: on a
 * Sunday the pin would pass for the wrong reason.
 */
function mondayTenLisbonAhead(): Date {
  const base = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  for (let i = 0; i < 7; i++) {
    const day = new Date(base.getTime() + i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const [y, m, dd] = day.split("-").map(Number);
    if (new Date(Date.UTC(y!, m! - 1, dd!)).getUTCDay() !== 1) continue;
    for (const utcHour of ["10", "09"]) {
      const candidate = new Date(`${day}T${utcHour}:00:00.000Z`);
      if (lisbonHHMM(candidate.toISOString()) === "10:00") return candidate;
    }
  }
  throw new Error("could not place Monday 10:00 Lisbon");
}

d("HOR-01: the portal does NOT give a therapist without rows the clinic's hours", () => {
  let db: Awaited<ReturnType<typeof import("@osteojp/db").getDbAdmin>>;
  let booking: typeof import("./booking");
  let realStore: AppointmentsStore;
  let AppointmentError: typeof import("./errors").AppointmentError;

  const tenantId = randomUUID();
  const linda = randomUUID();
  const onlyN = randomUUID();
  const patientId = randomUUID();
  const osteo = randomUUID();
  const N = randomUUID(); // no rows, otherwise eligible
  const C = randomUUID(); // rows: the positive control

  const principal = () => ({ tenantId, patientId, role: "patient" }) as never;

  const roster = async (locationId: string): Promise<string[]> =>
    (await booking.listBookableTherapists(principal(), { serviceId: osteo, locationId }, realStore)).map(
      (t) => t.id,
    );

  const offeredTimes = async (practitionerId: string | null): Promise<string[]> => {
    const iso = await booking.listOpenSlots(
      principal(),
      { serviceId: osteo, locationId: linda, practitionerId },
      realStore,
      NOW,
    );
    return [...new Set(iso.map(lisbonHHMM))].sort();
  };

  beforeAll(async () => {
    const { getDbAdmin } = await import("@osteojp/db");
    db = getDbAdmin();
    booking = await import("./booking");
    ({ drizzleAppointmentsStore: realStore } = await import("./store"));
    ({ AppointmentError } = await import("./errors"));

    await db.execute(raw`insert into tenants (id, name, slug)
      values (${tenantId}, 'HOR-01 Portal Co', ${"hor-" + tenantId.slice(0, 8)})`);
    await db.execute(raw`insert into locations
        (id, tenant_id, name, opens_at, closes_at, slot_granularity_min)
      values (${linda}, ${tenantId}, 'Linda (teste)', '08:00', '21:00', 60),
             (${onlyN}, ${tenantId}, 'So N (teste)', '08:00', '21:00', 60)`);
    await db.execute(raw`insert into services
        (id, tenant_id, name, duration_min, is_active, patient_bookable)
      values (${osteo}, ${tenantId}, 'Osteopatia (teste)', 60, true, true)`);
    for (const loc of [linda, onlyN]) {
      await db.execute(raw`insert into service_location_prices
          (id, tenant_id, service_id, location_id, price_cents)
        values (${randomUUID()}, ${tenantId}, ${osteo}, ${loc}, 5000)`);
    }
    await db.execute(raw`insert into patients (id, tenant_id, full_name)
      values (${patientId}, ${tenantId}, 'Paciente HOR-01')`);

    for (const [id, name] of [
      [N, "Terapeuta N Sem Linhas"],
      [C, "Terapeuta C Com Linhas"],
    ] as const) {
      await db.execute(raw`insert into users
          (id, tenant_id, email, full_name, is_active, is_bookable, is_shared_resource)
        values (${id}, ${tenantId}, ${"hor-" + id.slice(0, 8) + "@t.test"}, ${name}, true, true, false)`);
      await db.execute(raw`insert into therapist_services (tenant_id, therapist_user_id, service_id)
        values (${tenantId}, ${id}, ${osteo})`);
    }
    for (const loc of [linda, onlyN]) {
      await db.execute(raw`insert into staff_locations (tenant_id, user_id, location_id)
        values (${tenantId}, ${N}, ${loc})`);
    }
    await db.execute(raw`insert into staff_locations (tenant_id, user_id, location_id)
      values (${tenantId}, ${C}, ${linda})`);
    for (let weekday = 1; weekday <= 6; weekday++) {
      await db.execute(raw`insert into availability_templates
          (id, tenant_id, user_id, location_id, weekday, start_time, end_time, is_active)
        values (${randomUUID()}, ${tenantId}, ${C}, ${linda}, ${weekday}, '09:00', '12:00', true)`);
    }
  });

  afterAll(async () => {
    if (!db) return;
    await db.execute(raw`delete from appointments where tenant_id = ${tenantId}`);
    await db.execute(raw`delete from therapist_services where tenant_id = ${tenantId}`);
    await db.execute(raw`delete from availability_templates where tenant_id = ${tenantId}`);
    await db.execute(raw`delete from staff_locations where tenant_id = ${tenantId}`);
    await db.execute(raw`delete from service_location_prices where tenant_id = ${tenantId}`);
    await db.execute(raw`delete from patients where tenant_id = ${tenantId}`);
    await db.execute(raw`delete from users where tenant_id = ${tenantId}`);
    await db.execute(raw`delete from services where tenant_id = ${tenantId}`);
    await db.execute(raw`delete from locations where tenant_id = ${tenantId}`);
    await db.execute(raw`delete from tenants where id = ${tenantId}`);
  });

  it("PREMISE: N has no availability row and C has six", async () => {
    const rows = (await db.execute(raw`
      select user_id::text as id, count(*)::int as n from availability_templates
       where tenant_id = ${tenantId} group by user_id
    `)) as unknown as { id: string; n: number }[];
    expect(rows).toEqual([{ id: C, n: 6 }]);
  });

  it("PINNED: the therapist step lists C and not N", async () => {
    expect(await roster(linda)).toEqual([C]);
  });

  it("PINNED: N, chosen, gets no slots; control: C gets their hours", async () => {
    expect(await offeredTimes(N)).toEqual([]);
    expect(await offeredTimes(C)).toEqual(["09:00", "10:00", "11:00"]);
  });

  it("PINNED: 'Escolham por mim' offers only C's hours, never the clinic's", async () => {
    // With the clinic default online, 12:00 to 20:00 would appear here.
    expect(await offeredTimes(null)).toEqual(["09:00", "10:00", "11:00"]);
  });

  it("PINNED: a direct write for N on a Monday at 10:00 is refused in the transaction", async () => {
    const startsAt = mondayTenLisbonAhead();
    const attempt = realStore.createBooking(principal(), {
      serviceId: osteo,
      locationId: linda,
      practitionerId: N,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 60 * 60_000),
    });
    await expect(attempt).rejects.toBeInstanceOf(AppointmentError);
    // `no_slot` is the guard's answer for "no availability row covers it"; a
    // refusal for any other reason (the clinic window, a closure) would carry
    // another code and fail here.
    await expect(attempt).rejects.toMatchObject({ code: "no_slot" });
    const count = async () =>
      (
        (await db.execute(raw`
          select count(*)::int as n from appointments where tenant_id = ${tenantId}
        `)) as unknown as [{ n: number }]
      )[0].n;
    expect(await count()).toBe(0);

    // CONTROL: the same write, same clinic, same instant, for C (rows 09:00 to
    // 12:00 on Monday) goes through. Without it the refusal above could be a
    // refusal of the instant rather than of N.
    await realStore.createBooking(principal(), {
      serviceId: osteo,
      locationId: linda,
      practitionerId: C,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 60 * 60_000),
    });
    expect(await count()).toBe(1);
  });

  it("PINNED: a clinic whose only member has no rows is not offered online", async () => {
    const catalog = await realStore.getCatalog(principal());
    const ids = catalog.locations.map((l) => l.id);
    expect(ids).toContain(linda);
    expect(ids).not.toContain(onlyN);
    expect(await realStore.isBookableLocation(principal(), onlyN)).toBe(false);
  });
});
