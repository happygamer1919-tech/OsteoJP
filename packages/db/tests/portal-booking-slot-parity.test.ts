/**
 * portal-booking-slot-parity.test.ts
 *
 * DB-gated proof of the P1 invariant behind the portal booking flow: EVERY slot
 * the step-3 availability list offers must be accepted by the step-4 booking
 * validator (an eligible therapist exists), and every slot the validator would
 * reject must NOT be offered. When the two disagree, production shows the
 * patient a slot and then rejects it at confirm with "Este horário já não está
 * disponível" — the 2026-07-08 LV/Osteopatia incident.
 *
 * The fixture mirrors the production data shape that exposed the bug: one
 * ACTIVE therapist whose availability template covers ONLY Monday 09:00–19:00
 * at the LV location (plus inactive fixture practitioners with full coverage,
 * who must be ignored). A Wednesday 15:00 slot therefore has NO eligible
 * therapist and must never be offered.
 *
 * DUPLICATION NOTE (guardrail, same policy as booking-conflict-cutoff.test.ts):
 * apps/api is not a shared package this wave, so the availability-list query
 * and the validator predicates below are duplicated MINIMALLY from
 * apps/api/lib/appointments/store.ts (listOpenSlots / listAvailableTherapists).
 * They go red here if the SQL shape diverges from what Postgres actually
 * accepts; the single-source guarantee inside the app is that both paths are
 * built from the same fragment builders in store.ts.
 *   TODO(@osteojp/scheduling): when store.ts moves into a shared package,
 *   import the real builders here and delete these re-statements.
 *
 * GATING: requires a live DATABASE_URL (local Supabase / CI db-tests gate);
 * skips otherwise, identical to the sibling packages/db suites.
 */
import { randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, live } from "./rls-harness";
// The portal's step-3 slot source. On main this is the hardcoded client-side
// generator that caused the P1; the repro test below runs it against the real
// validator predicates and MUST fail until the portal consumes the API's
// availability endpoint.
import { generateSlots } from "../../../apps/portal/app/portal/booking/slots";

/* ------------------------------- fixture -------------------------------- */

const F = {
  tenant: randomUUID(),
  role: randomUUID(),
  therapist: randomUUID(), // ACTIVE, Monday-only template at LV (prod shape)
  inactiveTherapist: randomUUID(), // full-week template but is_active=false
  locationLV: randomUUID(),
  locationCB: randomUUID(),
  service: randomUUID(), // Osteopatia, 60 min
  patient: randomUUID(),
  authUser: randomUUID(),
  bookedMonday: randomUUID(),
};

// Frozen clock: Monday 2026-07-06 12:00 UTC (13:00 Lisbon, WEST). The incident
// slots were Wednesday 2026-07-08 15:00/16:00 at LV.
const NOW = "2026-07-06T12:00:00Z";
const DURATION_MIN = 60;
const HORIZON_DAYS = 14;

// An existing Monday booking for the active therapist: 2026-07-13 10:00–11:00
// Lisbon = 09:00–10:00 UTC. Its covered starts must drop out of the open list.
const BOOKED_START = "2026-07-13T09:00:00Z";
const BOOKED_END = "2026-07-13T10:00:00Z";

/* --------------------------- real query shapes --------------------------- */

/**
 * Step-3 list — mirrors drizzleAppointmentsStore.listOpenSlots: expand active
 * availability templates (active therapists, this location) into concrete
 * 30-min-grid starts over the horizon, entirely in Europe/Lisbon wall-clock
 * inside Postgres, then keep only starts where an eligible therapist passes the
 * SAME three validator predicates (availability covers / no appointment
 * overlap / no time_off).
 */
async function listOpenSlots(
  sql: Sql,
  tenant: string,
  locationId: string,
  now: string,
): Promise<string[]> {
  const rows = await sql<{ startsAt: Date }[]>`
    with slot as (
      select distinct
        (t.local_start at time zone 'Europe/Lisbon') as starts_at
      from availability_templates av
      join users u on u.id = av.user_id and u.tenant_id = av.tenant_id
      cross join lateral generate_series(
        (${now}::timestamptz at time zone 'Europe/Lisbon')::date,
        (${now}::timestamptz at time zone 'Europe/Lisbon')::date + ${HORIZON_DAYS}::int,
        interval '1 day'
      ) as d(day)
      cross join lateral generate_series(
        d.day::date + av.start_time,
        d.day::date + av.end_time - make_interval(mins => ${DURATION_MIN}),
        interval '30 minutes'
      ) as t(local_start)
      where av.tenant_id = ${tenant}
        and av.location_id = ${locationId}
        and av.is_active = true
        and u.is_active = true
        and av.weekday = extract(dow from d.day)::int
        and (av.valid_from  is null or av.valid_from  <= d.day::date)
        and (av.valid_until is null or av.valid_until >= d.day::date)
    )
    select s.starts_at as "startsAt"
    from slot s
    where s.starts_at > ${now}::timestamptz
      and exists (
        select 1 from users u
        where u.tenant_id = ${tenant}
          and u.is_active = true
          and ${availabilityCovers(sql, tenant, locationId)}
          and not ${apptOverlap(sql, tenant)}
          and not ${timeOffOverlap(sql, tenant)}
      )
    order by s.starts_at
  `;
  return rows.map((r) => r.startsAt.toISOString());
}

// Correlated predicate fragments over (u.id, s.starts_at) — the same shapes
// store.ts builds for the createBooking guard, with ends_at derived from the
// fixed service duration.
function availabilityCovers(sql: Sql, tenant: string, locationId: string) {
  return sql`exists (
    select 1 from availability_templates av2
    where av2.tenant_id = ${tenant}
      and av2.user_id = u.id
      and av2.location_id = ${locationId}
      and av2.is_active = true
      and av2.weekday = extract(dow from (s.starts_at at time zone 'Europe/Lisbon'))::int
      and av2.start_time <= (s.starts_at at time zone 'Europe/Lisbon')::time
      and av2.end_time   >= ((s.starts_at + make_interval(mins => ${DURATION_MIN})) at time zone 'Europe/Lisbon')::time
      and (av2.valid_from  is null or av2.valid_from  <= (s.starts_at at time zone 'Europe/Lisbon')::date)
      and (av2.valid_until is null or av2.valid_until >= (s.starts_at at time zone 'Europe/Lisbon')::date)
  )`;
}

function apptOverlap(sql: Sql, tenant: string) {
  return sql`exists (
    select 1 from appointments a
    where a.tenant_id = ${tenant}
      and a.practitioner_id = u.id
      and a.status <> 'cancelled'
      and a.starts_at < s.starts_at + make_interval(mins => ${DURATION_MIN})
      and a.ends_at   > s.starts_at
  )`;
}

function timeOffOverlap(sql: Sql, tenant: string) {
  return sql`exists (
    select 1 from time_off t
    where t.tenant_id = ${tenant}
      and t.user_id = u.id
      and t.starts_at < s.starts_at + make_interval(mins => ${DURATION_MIN})
      and t.ends_at   > s.starts_at
  )`;
}

/**
 * Step-4 validator — mirrors drizzleAppointmentsStore.listAvailableTherapists:
 * the therapists who could take [startsAt, startsAt+60min) at the location.
 * Empty result = the booking is rejected (no_therapist / "slot unavailable").
 */
async function eligibleTherapists(
  sql: Sql,
  tenant: string,
  locationId: string,
  startsAt: string,
): Promise<string[]> {
  const rows = await sql<{ id: string }[]>`
    select u.id
    from users u
    cross join lateral (select ${startsAt}::timestamptz as starts_at) s
    where u.tenant_id = ${tenant}
      and u.is_active = true
      and ${availabilityCovers(sql, tenant, locationId)}
      and not ${apptOverlap(sql, tenant)}
      and not ${timeOffOverlap(sql, tenant)}
  `;
  return rows.map((r) => r.id);
}

/* ----------------------------- seed / teardown --------------------------- */

async function seed(sql: Sql): Promise<void> {
  await sql`insert into tenants (id, name, slug)
            values (${F.tenant}, 'Slot Parity Gate', ${`slot-parity-${F.tenant}`})`;
  await sql`insert into roles (id, tenant_id, slug, name)
            values (${F.role}, ${F.tenant}, 'therapist', 'Therapist')`;
  await sql`insert into users (id, tenant_id, role_id, email, full_name, is_active)
            values (${F.therapist}, ${F.tenant}, ${F.role}, ${`t-${F.therapist}@example.pt`}, 'Active Monday Therapist', true)`;
  await sql`insert into users (id, tenant_id, role_id, email, full_name, is_active)
            values (${F.inactiveTherapist}, ${F.tenant}, ${F.role}, ${`t-${F.inactiveTherapist}@example.pt`}, 'Inactive Fixture Therapist', false)`;
  await sql`insert into locations (id, tenant_id, name)
            values (${F.locationLV}, ${F.tenant}, 'OsteoJP (LV)')`;
  await sql`insert into locations (id, tenant_id, name)
            values (${F.locationCB}, ${F.tenant}, 'OsteoJP (CB)')`;
  await sql`insert into services (id, tenant_id, name, duration_min)
            values (${F.service}, ${F.tenant}, 'Osteopatia', ${DURATION_MIN})`;
  await sql`insert into patients (id, tenant_id, full_name, auth_user_id, activated_at)
            values (${F.patient}, ${F.tenant}, 'Parity Patient', ${F.authUser}, now())`;

  // PROD SHAPE: the only ACTIVE coverage is Monday (dow 1) 09:00–19:00 at LV.
  await sql`insert into availability_templates (tenant_id, user_id, location_id, weekday, start_time, end_time)
            values (${F.tenant}, ${F.therapist}, ${F.locationLV}, 1, '09:00', '19:00')`;
  // Full-week coverage that must be IGNORED: the therapist is inactive.
  for (const wd of [1, 2, 3, 4, 5, 6]) {
    await sql`insert into availability_templates (tenant_id, user_id, location_id, weekday, start_time, end_time)
              values (${F.tenant}, ${F.inactiveTherapist}, ${F.locationLV}, ${wd}, '08:00', '20:00')`;
  }

  // Existing Monday booking 10:00–11:00 Lisbon for the active therapist.
  await sql`insert into appointments
              (id, tenant_id, patient_id, practitioner_id, location_id, service_id, starts_at, ends_at, status)
            values (${F.bookedMonday}, ${F.tenant}, ${F.patient}, ${F.therapist}, ${F.locationLV}, ${F.service},
                    ${BOOKED_START}, ${BOOKED_END}, 'scheduled')`;
}

/* ------------------------------------------------------------------------ */

describe.skipIf(!live)("portal booking — slot list / validator parity (P1)", () => {
  let sql: Sql;

  beforeAll(async () => {
    sql = connect();
    await seed(sql);
  });

  afterAll(async () => {
    await sql`delete from tenants where id = ${F.tenant}`;
    await sql.end();
  });

  it("MAIN REPRO (P1): every slot the portal step-3 generator offers for Wed 2026-07-08 is bookable at LV", async () => {
    // The portal generator, frozen at the incident clock. It fabricates
    // Mon–Fri 09:00–19:00 slots with no knowledge of availability templates,
    // so it offers Wednesday slots the validator then rejects — the exact
    // production failure (LV, Osteopatia, 2026-07-08 15:00/16:00).
    const offered = generateSlots(DURATION_MIN, Date.parse(NOW));
    const lisbonDay = (iso: string) =>
      new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon" }).format(new Date(iso));
    const wednesdaySlots = offered.filter((iso) => lisbonDay(iso) === "2026-07-08");
    expect(wednesdaySlots.length).toBeGreaterThan(0); // step 3 DOES offer them

    for (const iso of wednesdaySlots) {
      const eligible = await eligibleTherapists(sql, F.tenant, F.locationLV, iso);
      // offered ⇒ bookable. On main this fails: eligible is [] for every one.
      expect({ slot: iso, eligible: eligible.length > 0 }).toEqual({ slot: iso, eligible: true });
    }
  });

  it("NEGATIVE CONTROL: Wednesday 2026-07-08 15:00 Lisbon at LV has NO eligible therapist (the incident rejection)", async () => {
    // 15:00 Lisbon (WEST, UTC+1) = 14:00 UTC.
    const eligible = await eligibleTherapists(sql, F.tenant, F.locationLV, "2026-07-08T14:00:00Z");
    expect(eligible).toEqual([]);
  });

  it("the incident slot (Wed 2026-07-08 15:00 LV) is NOT offered by the availability list", async () => {
    const slots = await listOpenSlots(sql, F.tenant, F.locationLV, NOW);
    expect(slots).not.toContain("2026-07-08T14:00:00.000Z");
    // No Wednesday start at all may be offered.
    const wednesdays = slots.filter((iso) => new Date(iso).getUTCDay() === 3);
    expect(wednesdays).toEqual([]);
  });

  it("PARITY: every offered slot has at least one eligible therapist (offered ⇒ bookable)", async () => {
    const slots = await listOpenSlots(sql, F.tenant, F.locationLV, NOW);
    expect(slots.length).toBeGreaterThan(0); // Mondays exist in the horizon
    for (const iso of slots) {
      const eligible = await eligibleTherapists(sql, F.tenant, F.locationLV, iso);
      expect({ slot: iso, eligible: eligible.length > 0 }).toEqual({ slot: iso, eligible: true });
    }
  });

  it("offers Monday within the template window, in Lisbon wall-clock (first Monday slot = 09:00 Lisbon = 08:00Z)", async () => {
    const slots = await listOpenSlots(sql, F.tenant, F.locationLV, NOW);
    const monday = slots.filter((iso) => iso.startsWith("2026-07-13"));
    expect(monday[0]).toBe("2026-07-13T08:00:00.000Z"); // 09:00 Lisbon
    // Last 60-min slot must START no later than 18:00 Lisbon (17:00Z).
    expect(monday[monday.length - 1]).toBe("2026-07-13T17:00:00.000Z");
  });

  it("a booked window drops out of the offered list (Mon 10:00–11:00 Lisbon booked ⇒ 09:30/10:00/10:30 starts gone)", async () => {
    const slots = await listOpenSlots(sql, F.tenant, F.locationLV, NOW);
    // 60-min slots overlapping [09:00Z,10:00Z): starts 08:30Z, 09:00Z, 09:30Z.
    expect(slots).not.toContain("2026-07-13T08:30:00.000Z");
    expect(slots).not.toContain("2026-07-13T09:00:00.000Z");
    expect(slots).not.toContain("2026-07-13T09:30:00.000Z");
    // The abutting starts on both sides survive (half-open overlap).
    expect(slots).toContain("2026-07-13T08:00:00.000Z");
    expect(slots).toContain("2026-07-13T10:00:00.000Z");
  });

  it("no slots are offered at a location with no active coverage (CB)", async () => {
    const slots = await listOpenSlots(sql, F.tenant, F.locationCB, NOW);
    expect(slots).toEqual([]);
  });
});
