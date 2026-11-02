/**
 * weekly-blocks-portal.db.test.ts - BLOQUEIOS DE REPETICAO SEMANAL: THE PATIENT
 * PORTAL NEVER OFFERS, ASSIGNS OR ACCEPTS AN HOUR A WEEKLY RULE BLOCKS, PROVEN
 * AGAINST A REAL POSTGRES.
 *
 * weekly-blocks-portal.test.ts is the source scan: every time_off check passes
 * the weekly flag. It cannot see whether the SQL is RIGHT: a Lisbon wall-clock
 * rule against timestamptz windows, across the clock change. This suite asks
 * the real store:
 *   - the slot grid (listOpenSlots) on a winter Monday, a summer Monday and the
 *     spring clock-change Sunday;
 *   - the assignment (listAvailableTherapists) and the reschedule guard
 *     (hasWindowConflict), inside and just outside the rule;
 *   - THE NEGATIVE CONTROL: the rule deleted, the same hours come back. Without
 *     it, a grid that returned nothing for an unrelated reason would satisfy
 *     every "not offered" arm.
 *
 * GATING. Needs a live DATABASE_URL AND the weekly table, which arrives with the
 * PENDING migration NEXT-AFTER-0109_weekly_blocks.sql. Skipped on a database
 * without it (CI's, until the promotion); from the promotion on it THROWS on a
 * database without the table, because a skip is no longer an answer then.
 */
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { sql as raw } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const live = Boolean(process.env.DATABASE_URL);

function promoted(): boolean {
  const dir = fileURLToPath(new URL("../../../../packages/db/migrations/", import.meta.url));
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .some((f) => readFileSync(dir + f, "utf8").includes("CREATE TABLE public.therapist_weekly_blocks"));
}

async function tablePresent(): Promise<boolean> {
  if (!live) return false;
  const { getDbAdmin } = await import("@osteojp/db");
  const rows = (await getDbAdmin().execute(
    raw`select to_regclass('public.therapist_weekly_blocks') is not null as present`,
  )) as unknown as { present: boolean }[];
  const present = rows[0]?.present === true;
  if (!present && promoted()) {
    throw new Error("THE WEEKLY TABLE IS PROMOTED BUT THIS DATABASE DOES NOT HAVE IT. Nothing here was measured.");
  }
  return present;
}

const PRESENT = await tablePresent();
const d = live && PRESENT ? describe : describe.skip;
const SIDE = PRESENT ? "TABLE PRESENT" : "TABLE ABSENT (migration pending)";

const lisbon = (iso: string): string =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Lisbon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));

d(`weekly blocks on the patient portal [${SIDE}]`, () => {
  type Store = typeof import("./store").drizzleAppointmentsStore;
  let db: ReturnType<typeof import("@osteojp/db").getDbAdmin>;
  let store: Store;
  const tenantId = randomUUID();
  const locationId = randomUUID();
  const therapistId = randomUUID();
  const patientId = randomUUID();
  const serviceId = randomUUID();
  const mondayRule = randomUUID();
  const sundayRule = randomUUID();

  const principal = () => ({ tenantId, patientId, role: "patient" }) as never;

  /** Lisbon "yyyy-mm-dd HH:MM" of every slot offered from `now` over `days`. */
  async function offered(now: string, days: number): Promise<string[]> {
    const iso = await store.listOpenSlots(principal(), {
      locationId,
      durationMin: 60,
      horizonDays: days,
      now: new Date(now),
      practitionerId: null,
      serviceId: null,
    } as never);
    return iso.map(lisbon);
  }

  beforeAll(async () => {
    const mod = await import("@osteojp/db");
    db = mod.getDbAdmin();
    store = (await import("./store")).drizzleAppointmentsStore;
    await db.execute(raw`insert into tenants (id, name, slug) values (${tenantId}, 'Weekly Portal Co', ${"wp-" + tenantId.slice(0, 8)})`);
    await db.execute(raw`insert into locations (id, tenant_id, name, opens_at, closes_at, slot_granularity_min)
      values (${locationId}, ${tenantId}, 'Clinica (teste)', '08:00', '21:00', 60)`);
    await db.execute(raw`insert into users (id, tenant_id, email, full_name, is_active, is_bookable)
      values (${therapistId}, ${tenantId}, ${"wp-" + therapistId.slice(0, 8) + "@t.test"}, 'Terapeuta Semanal', true, true)`);
    await db.execute(raw`insert into patients (id, tenant_id, full_name) values (${patientId}, ${tenantId}, 'Paciente Portal')`);
    await db.execute(raw`insert into services (id, tenant_id, name, duration_min, is_active, patient_bookable, location_id)
      values (${serviceId}, ${tenantId}, 'Servico (teste)', 60, true, true, null)`);
    await db.execute(raw`insert into therapist_services (tenant_id, therapist_user_id, service_id)
      values (${tenantId}, ${therapistId}, ${serviceId})`);
    for (let weekday = 0; weekday < 7; weekday++) {
      await db.execute(raw`insert into availability_templates (id, tenant_id, user_id, location_id, weekday, start_time, end_time, is_active)
        values (${randomUUID()}, ${tenantId}, ${therapistId}, ${locationId}, ${weekday}, '08:00', '21:00', true)`);
    }
    // Every Monday 08:00-11:00, and every Sunday 08:00-10:00, Lisbon wall clock.
    await db.execute(raw`insert into therapist_weekly_blocks (id, tenant_id, user_id, weekday, start_time, end_time)
      values (${mondayRule}, ${tenantId}, ${therapistId}, 1, '08:00', '11:00'),
             (${sundayRule}, ${tenantId}, ${therapistId}, 0, '08:00', '10:00')`);
  });

  afterAll(async () => {
    if (!db) return;
    await db.execute(raw`delete from therapist_weekly_blocks where tenant_id = ${tenantId}`);
    await db.execute(raw`delete from availability_templates where tenant_id = ${tenantId}`);
    await db.execute(raw`delete from therapist_services where tenant_id = ${tenantId}`);
    await db.execute(raw`delete from services where tenant_id = ${tenantId}`);
    await db.execute(raw`delete from patients where tenant_id = ${tenantId}`);
    await db.execute(raw`delete from users where tenant_id = ${tenantId}`);
    await db.execute(raw`delete from locations where tenant_id = ${tenantId}`);
    await db.execute(raw`delete from tenants where id = ${tenantId}`);
  });

  it("WINTER Monday (WET): 08:00, 09:00, 10:00 are not offered; 11:00 is; Tuesday 08:00 is", async () => {
    const slots = await offered("2027-03-01T00:00:00Z", 1); // Mon 1 and Tue 2 March 2027
    const monday = slots.filter((s) => s.startsWith("2027-03-01"));
    expect(monday.filter((s) => s < "2027-03-01 11:00")).toEqual([]);
    expect(monday).toContain("2027-03-01 11:00");
    expect(slots).toContain("2027-03-02 08:00");
  });

  it("SUMMER Monday (WEST): the same wall-clock hours are blocked, not the same UTC hours", async () => {
    const slots = await offered("2027-06-06T23:00:00Z", 0); // Lisbon midnight of Mon 7 June 2027
    expect(slots.filter((s) => s < "2027-06-07 11:00")).toEqual([]);
    expect(slots).toContain("2027-06-07 11:00");
  });

  it("the SPRING clock-change Sunday (2027-03-28): 08:00 and 09:00 are blocked, 10:00 is offered", async () => {
    const slots = await offered("2027-03-28T00:00:00Z", 0);
    expect(slots.filter((s) => s < "2027-03-28 10:00")).toEqual([]);
    expect(slots).toContain("2027-03-28 10:00");
  });

  it("the assignment offers nobody inside the rule, and the therapist just after it", async () => {
    const at = (iso: string) =>
      store.listAvailableTherapists(principal(), {
        locationId,
        serviceId,
        startsAt: new Date(iso),
        endsAt: new Date(new Date(iso).getTime() + 3_600_000),
      } as never);
    expect(await at("2027-03-08T09:00:00Z")).toEqual([]); // Mon 09:00 WET
    expect((await at("2027-03-08T11:00:00Z")).map((t) => t.practitionerId)).toEqual([therapistId]);
  });

  it("the reschedule guard refuses inside the rule and on its edge, and accepts after it", async () => {
    const check = (start: string, end: string) =>
      store.hasWindowConflict(principal(), {
        practitionerId: therapistId,
        locationId,
        startsAt: new Date(start),
        endsAt: new Date(end),
      } as never);
    expect((await check("2027-03-08T09:00:00Z", "2027-03-08T10:00:00Z")).conflict).toBe(true);
    expect((await check("2027-03-08T10:30:00Z", "2027-03-08T11:30:00Z")).conflict).toBe(true);
    expect((await check("2027-03-08T11:00:00Z", "2027-03-08T12:00:00Z")).conflict).toBe(false);
    expect((await check("2027-03-09T09:00:00Z", "2027-03-09T10:00:00Z")).conflict).toBe(false); // Tuesday
  });

  it("THE NEGATIVE CONTROL: with the Monday rule deleted, Monday 08:00 comes back", async () => {
    await db.execute(raw`delete from therapist_weekly_blocks where id = ${mondayRule}`);
    const slots = await offered("2027-03-01T00:00:00Z", 0);
    expect(slots).toContain("2027-03-01 08:00");
    expect(slots).toContain("2027-03-01 09:00");
  });
});
