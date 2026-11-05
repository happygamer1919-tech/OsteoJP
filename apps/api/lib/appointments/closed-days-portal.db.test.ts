/**
 * closed-days-portal.db.test.ts - TIER C 0114: THE PATIENT PORTAL NEVER
 * OFFERS, ASSIGNS OR ACCEPTS AN HOUR A DATED CLINIC CLOSURE COVERS, PROVEN
 * AGAINST A REAL POSTGRES, AND IT AGREES WITH THE STAFF ARITHMETIC CASE BY
 * CASE.
 *
 * closed-days-portal.test.ts is the source scan: every closure call passes the
 * closure-table flag. It cannot see whether the SQL is RIGHT: Lisbon dates and
 * wall clock against timestamptz windows, across both clock changes. This suite
 * asks the real store:
 *   - THE PARITY TABLE (closed-day-parity-cases.json, the same table
 *     closed-days-core.test.ts runs through the staff `closedDayOverlap`):
 *     `hasWindowConflict(...).clinicClosed` must equal each case's `closed`.
 *     Whole day, partial day, both range edges, a visit ending exactly at
 *     closed_from, a visit running past midnight into a closed day, both DST
 *     Sundays, a Saturday;
 *   - the slot grid (listOpenSlots) offers no slot on a closed day and only
 *     the open hours of a partly closed one; the assignment
 *     (listAvailableTherapists) offers nobody; the booking guard (createBooking)
 *     refuses with clinic_closed;
 *   - THE NEGATIVE CONTROL: the closures deleted, the same hours come back.
 *     Without it, a grid that returned nothing for an unrelated reason would
 *     satisfy every "not offered" arm.
 *
 * GATING. Needs a live DATABASE_URL AND the closure table, which arrives with
 * the PENDING migration NEXT-AFTER-0113_location_closed_days.sql. Skipped on a
 * database without it (CI's, until the promotion); from the promotion on it
 * THROWS on a database without the table, because a skip is no longer an
 * answer then.
 */
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { sql as raw } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const live = Boolean(process.env.DATABASE_URL);

function promoted(): boolean {
  const dir = fileURLToPath(new URL("../../../../packages/db/migrations/", import.meta.url));
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .some((f) => readFileSync(dir + f, "utf8").includes("CREATE TABLE public.location_closed_days"));
}

async function tablePresent(): Promise<boolean> {
  if (!live) return false;
  const { getDbAdmin } = await import("@osteojp/db");
  const rows = (await getDbAdmin().execute(
    raw`select to_regclass('public.location_closed_days') is not null as present`,
  )) as unknown as { present: boolean }[];
  const present = rows[0]?.present === true;
  if (!present && promoted()) {
    throw new Error("THE CLOSURE TABLE IS PROMOTED BUT THIS DATABASE DOES NOT HAVE IT. Nothing here was measured.");
  }
  return present;
}

const PRESENT = await tablePresent();
const d = live && PRESENT ? describe : describe.skip;
const SIDE = PRESENT ? "TABLE PRESENT" : "TABLE ABSENT (migration pending)";

type Parity = {
  closures: { key: string; startsOn: string; endsOn: string; closedFrom: string | null; closedTo: string | null }[];
  cases: { name: string; startsAt: string; endsAt: string; closed: boolean }[];
};
const PARITY: Parity = JSON.parse(readFileSync(join(__dirname, "closed-day-parity-cases.json"), "utf8"));

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

d(`dated clinic closures on the patient portal [${SIDE}]`, () => {
  type Store = typeof import("./store").drizzleAppointmentsStore;
  let db: ReturnType<typeof import("@osteojp/db").getDbAdmin>;
  let store: Store;
  const tenantId = randomUUID();
  const locationId = randomUUID();
  const therapistId = randomUUID();
  const patientId = randomUUID();
  const serviceId = randomUUID();

  const principal = () => ({ tenantId, patientId, role: "patient" }) as never;

  async function insertClosures(): Promise<void> {
    for (const c of PARITY.closures) {
      await db.execute(raw`insert into location_closed_days (tenant_id, location_id, starts_on, ends_on, closed_from, closed_to, kind)
        values (${tenantId}, ${locationId}, ${c.startsOn}, ${c.endsOn}, ${c.closedFrom}, ${c.closedTo}, 'outro')`);
    }
  }

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
    await db.execute(raw`insert into tenants (id, name, slug) values (${tenantId}, 'Closures Portal Co', ${"cp-" + tenantId.slice(0, 8)})`);
    await db.execute(raw`insert into locations (id, tenant_id, name, opens_at, closes_at, slot_granularity_min)
      values (${locationId}, ${tenantId}, 'Clinica (teste)', '08:00', '21:00', 60)`);
    await db.execute(raw`insert into users (id, tenant_id, email, full_name, is_active, is_bookable)
      values (${therapistId}, ${tenantId}, ${"cp-" + therapistId.slice(0, 8) + "@t.test"}, 'Terapeuta Teste', true, true)`);
    await db.execute(raw`insert into patients (id, tenant_id, full_name) values (${patientId}, ${tenantId}, 'Paciente Teste')`);
    await db.execute(raw`insert into services (id, tenant_id, name, duration_min, is_active, patient_bookable, location_id)
      values (${serviceId}, ${tenantId}, 'Servico (teste)', 60, true, true, null)`);
    await db.execute(raw`insert into therapist_services (tenant_id, therapist_user_id, service_id)
      values (${tenantId}, ${therapistId}, ${serviceId})`);
    for (let weekday = 0; weekday < 7; weekday++) {
      await db.execute(raw`insert into availability_templates (id, tenant_id, user_id, location_id, weekday, start_time, end_time, is_active)
        values (${randomUUID()}, ${tenantId}, ${therapistId}, ${locationId}, ${weekday}, '08:00', '21:00', true)`);
    }
    await insertClosures();
  });

  afterAll(async () => {
    if (!db) return;
    await db.execute(raw`delete from appointments where tenant_id = ${tenantId}`);
    await db.execute(raw`delete from location_closed_days where tenant_id = ${tenantId}`);
    await db.execute(raw`delete from availability_templates where tenant_id = ${tenantId}`);
    await db.execute(raw`delete from therapist_services where tenant_id = ${tenantId}`);
    await db.execute(raw`delete from services where tenant_id = ${tenantId}`);
    await db.execute(raw`delete from patients where tenant_id = ${tenantId}`);
    await db.execute(raw`delete from users where tenant_id = ${tenantId}`);
    await db.execute(raw`delete from locations where tenant_id = ${tenantId}`);
    await db.execute(raw`delete from tenants where id = ${tenantId}`);
  });

  describe("the parity table, portal side (the staff side is closed-days-core.test.ts)", () => {
    for (const c of PARITY.cases) {
      it(c.name, async () => {
        const v = await store.hasWindowConflict(principal(), {
          practitionerId: therapistId,
          locationId,
          startsAt: new Date(c.startsAt),
          endsAt: new Date(c.endsAt),
          excludeIds: [],
        } as never);
        expect(v.clinicClosed).toBe(c.closed);
        // A closed window is always a conflict too (booking.ts: clinicClosed implies conflict).
        if (c.closed) expect(v.conflict).toBe(true);
      });
    }
  });

  it("the slot grid offers nothing on the closed day, only the open hours of the partly closed one, and the day after in full", async () => {
    const slots = await offered("2026-12-24T00:00:00Z", 3);
    const eve = slots.filter((x) => x.startsWith("2026-12-24"));
    const christmas = slots.filter((x) => x.startsWith("2026-12-25"));
    const after = slots.filter((x) => x.startsWith("2026-12-26"));
    expect(christmas).toEqual([]);
    // 24 Dec closed 13:00 to 20:00: a 60-minute visit fits 08:00 to 12:00, and 20:00.
    expect(eve).toEqual([
      "2026-12-24 08:00",
      "2026-12-24 09:00",
      "2026-12-24 10:00",
      "2026-12-24 11:00",
      "2026-12-24 12:00",
      "2026-12-24 20:00",
    ]);
    expect(after.length).toBeGreaterThan(0);
  });

  it("the assignment offers nobody inside a closure, and the therapist outside it", async () => {
    const inside = await store.listAvailableTherapists(principal(), {
      locationId,
      startsAt: new Date("2026-12-25T10:00:00Z"),
      endsAt: new Date("2026-12-25T11:00:00Z"),
      serviceId,
    } as never);
    expect(inside).toEqual([]);
    const outside = await store.listAvailableTherapists(principal(), {
      locationId,
      startsAt: new Date("2026-12-26T10:00:00Z"),
      endsAt: new Date("2026-12-26T11:00:00Z"),
      serviceId,
    } as never);
    expect(outside.map((t) => t.practitionerId)).toEqual([therapistId]);
  });

  it("the booking guard refuses a crafted request inside a closure with clinic_closed", async () => {
    await expect(
      store.createBooking(principal(), {
        practitionerId: therapistId,
        locationId,
        serviceId,
        startsAt: new Date("2026-12-25T10:00:00Z"),
        endsAt: new Date("2026-12-25T11:00:00Z"),
      } as never),
    ).rejects.toMatchObject({ code: "clinic_closed" });
  });

  it("NEGATIVE CONTROL: with the closures deleted, the same hours come back", async () => {
    await db.execute(raw`delete from location_closed_days where tenant_id = ${tenantId}`);
    try {
      const slots = await offered("2026-12-24T00:00:00Z", 3);
      expect(slots.filter((x) => x.startsWith("2026-12-25")).length).toBeGreaterThan(0);
      expect(slots).toContain("2026-12-24 15:00");
      const v = await store.hasWindowConflict(principal(), {
        practitionerId: therapistId,
        locationId,
        startsAt: new Date("2026-12-25T10:00:00Z"),
        endsAt: new Date("2026-12-25T11:00:00Z"),
        excludeIds: [],
      } as never);
      expect(v.clinicClosed).toBe(false);
    } finally {
      await insertClosures();
    }
  });
});
