/**
 * third-location-data.db.test.ts - S-1012-A1 ruling 6, against a real database.
 *
 * WHY: ./third-location-messages.test.ts proves that every message prints the
 * location name and phone of the row the dispatch is handed, and that row is a
 * fixture there. It cannot fail if the READ handed over another location's
 * name. This suite runs the real read (`loadReminderData`, under the reminder
 * job's tenant context and RLS) for a tenant with THREE locations and one
 * appointment at each: every appointment's row carries its own location's
 * name, phone and address, the third's included.
 *
 * Its own tenant, built here and removed afterwards. Every name, address and
 * phone number of a person is invented.
 *
 * Skipped without DATABASE_URL.
 */
import { randomUUID } from "node:crypto";
import { sql as raw } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { addDays, lisbonDateTimeToUtc, todayInLisbon } from "../scheduling/time";

vi.mock("server-only", () => ({}));

const live = Boolean(process.env.DATABASE_URL);
const d = live ? describe : describe.skip;

const FIRST = { name: "Clinica Norte", address: "Avenida Inventada 10, 2795-000 Linda-a-Velha", phone: "210 222 222" };
const SECOND = { name: "Clinica Sul", address: "Rua de Exemplo 1, 6000-000 Castelo Branco", phone: "272 111 111" };
/** The third location, as ruling 5 says its row is created. */
const THIRD = {
  name: "OsteoJP (Montemor-o-Novo)",
  address: "Rua Horta das Almas 4, 7050-356 Montemor-o-Novo",
  phone: "926 714 926",
};
const TENANT_PHONE = "210 999 999";

d("S-1012-A1 ruling 6: the reminder's row is the appointment's OWN location, at a third location too", () => {
  let sql: Awaited<ReturnType<typeof import("@osteojp/db").getDbAdmin>>;
  let loadReminderData: typeof import("./data").loadReminderData;
  const tenantId = randomUUID();
  const therapistId = randomUUID();
  const patientId = randomUUID();
  const places = [FIRST, SECOND, THIRD].map((p) => ({ ...p, locationId: randomUUID(), appointmentId: randomUUID() }));

  beforeAll(async () => {
    const { getDbAdmin } = await import("@osteojp/db");
    sql = getDbAdmin();
    ({ loadReminderData } = await import("./data"));

    await sql.execute(raw`insert into tenants (id, name, slug, settings)
      values (${tenantId}, 'Third Location Co', ${"mn01d-" + tenantId.slice(0, 8)},
              ${JSON.stringify({ locale: "pt", contacts: { phone: TENANT_PHONE } })}::jsonb)`);
    await sql.execute(raw`insert into users (id, tenant_id, email, full_name, is_active, is_bookable)
      values (${therapistId}, ${tenantId}, ${"t-" + therapistId.slice(0, 8) + "@mn01.test"}, 'Dra Inventada', true, true)`);
    await sql.execute(raw`insert into patients (id, tenant_id, full_name, phone)
      values (${patientId}, ${tenantId}, 'Madalena Inventada', '912000001')`);

    // Ten days out, one hour each: no two rows overlap (0061).
    const day = addDays(todayInLisbon(), 10);
    for (const [i, p] of places.entries()) {
      await sql.execute(raw`insert into locations (id, tenant_id, name, address, phone)
        values (${p.locationId}, ${tenantId}, ${p.name}, ${p.address}, ${p.phone})`);
      const startsAt = lisbonDateTimeToUtc(day, `${String(9 + i).padStart(2, "0")}:00`);
      const endsAt = new Date(startsAt.getTime() + 45 * 60_000);
      await sql.execute(raw`insert into appointments
        (id, tenant_id, patient_id, practitioner_id, location_id, starts_at, ends_at, status, origin)
        values (${p.appointmentId}, ${tenantId}, ${patientId}, ${therapistId}, ${p.locationId},
                ${startsAt.toISOString()}, ${endsAt.toISOString()}, 'confirmed', 'staff')`);
    }
  });

  afterAll(async () => {
    if (!sql) return;
    await sql.execute(raw`delete from appointments where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from patients where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from locations where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from users where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from tenants where id = ${tenantId}`);
  });

  it("the appointment at the THIRD location reads the third location's name, phone and address", async () => {
    const third = places[2]!;

    const data = await loadReminderData(tenantId, third.appointmentId);

    expect(data).toMatchObject({
      appointmentId: third.appointmentId,
      locationName: THIRD.name,
      locationPhone: THIRD.phone,
      locationAddress: THIRD.address,
    });
  });

  it("each of the three appointments reads its OWN location, and none reads another's", async () => {
    const read = [];
    for (const p of places) {
      const data = await loadReminderData(tenantId, p.appointmentId);
      read.push({ name: data?.locationName, phone: data?.locationPhone, address: data?.locationAddress });
    }

    expect(read).toEqual([FIRST, SECOND, THIRD]);
  });
});
