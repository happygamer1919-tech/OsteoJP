/**
 * messaging-check-target.db.test.ts - the delivery test's one appointment read,
 * against a REAL database and TWO tenants.
 *
 * ==========================================================================
 * WHY THIS CANNOT BE A UNIT TEST
 * ==========================================================================
 * `loadMessagingCheckTarget` is handed an id an owner typed. Whether an id
 * that belongs to ANOTHER clinic answers with that clinic's row is decided by
 * row level security on `appointments`, under the tenant claim the reminder
 * context sets. A mock of that context proves which tenant was passed
 * (`messaging-check-target.test.ts` does); only a database can prove what the
 * claim then lets through.
 *
 * THE CONTROL IS THE ADMIN HANDLE. Each "sees nothing" below is paired with a
 * read of the same id through the handle that bypasses RLS, which sees the
 * row. Without it, "null" would also be the answer of a fixture that was never
 * inserted.
 *
 * Self-skips without DATABASE_URL, like every DB-gated suite here; CI's
 * db-tests workflow runs `vitest run .db.test.ts` in apps/web with it set.
 */
import { randomUUID } from "node:crypto";
import { sql as raw } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const live = Boolean(process.env.DATABASE_URL);
const d = live ? describe : describe.skip;

const H = 60 * 60 * 1000;

d("loadMessagingCheckTarget against a real database", () => {
  let sql: Awaited<ReturnType<typeof import("@osteojp/db").getDbAdmin>>;
  const tenants: { id: string; appointmentId: string }[] = [];

  /** One tenant with everything an appointment needs, and one appointment. */
  async function seedTenant(label: string, status: string, origin: string) {
    const id = randomUUID();
    const short = id.slice(0, 8);
    await sql.execute(raw`insert into tenants (id, name, slug)
      values (${id}, ${"Target " + label}, ${"mc-target-" + short})`);
    const practitionerId = randomUUID();
    await sql.execute(raw`insert into users (id, tenant_id, email, full_name, is_active)
      values (${practitionerId}, ${id}, ${"p-" + short + "@t.test"}, 'Terapeuta Teste', true)`);
    const locationId = randomUUID();
    await sql.execute(raw`insert into locations (id, tenant_id, name)
      values (${locationId}, ${id}, 'Sede')`);
    const patientId = randomUUID();
    await sql.execute(raw`insert into patients (id, tenant_id, full_name)
      values (${patientId}, ${id}, 'Paciente Teste')`);
    const appointmentId = randomUUID();
    const startsAt = new Date(Date.now() + 48 * H);
    await sql.execute(raw`
      insert into appointments (id, tenant_id, patient_id, practitioner_id, location_id,
                                starts_at, ends_at, status, origin)
      values (${appointmentId}, ${id}, ${patientId}, ${practitionerId}, ${locationId},
              ${startsAt.toISOString()}, ${new Date(startsAt.getTime() + H).toISOString()},
              ${status}, ${origin})`);
    tenants.push({ id, appointmentId });
    return { id, appointmentId };
  }

  /** The same id through the handle that bypasses RLS: is the row really there? */
  async function existsForAdmin(appointmentId: string): Promise<boolean> {
    const rows = (await sql.execute(
      raw`select 1 as present from appointments where id = ${appointmentId}`,
    )) as unknown;
    const list = Array.isArray(rows) ? rows : ((rows as { rows?: unknown[] }).rows ?? []);
    return list.length === 1;
  }

  let a: { id: string; appointmentId: string };
  let b: { id: string; appointmentId: string };

  beforeAll(async () => {
    const { getDbAdmin } = await import("@osteojp/db");
    sql = getDbAdmin();
    // Two clinics. A holds an online request nobody has accepted, which is the
    // row the delivery test refuses; B holds an ordinary staff booking.
    a = await seedTenant("A", "scheduled", "patient_portal");
    b = await seedTenant("B", "confirmed", "staff");
  });

  afterAll(async () => {
    // Own rows only, keyed by this run's tenants.
    for (const t of tenants) {
      await sql.execute(raw`delete from appointments where tenant_id = ${t.id}`);
      await sql.execute(raw`delete from patients where tenant_id = ${t.id}`);
      await sql.execute(raw`delete from locations where tenant_id = ${t.id}`);
      await sql.execute(raw`delete from users where tenant_id = ${t.id}`);
      await sql.execute(raw`delete from tenants where id = ${t.id}`);
    }
  });

  it("a tenant reads its OWN appointment: status and origin, as stored", async () => {
    const { loadMessagingCheckTarget } = await import("./messaging-check-target");
    expect(await loadMessagingCheckTarget(a.id, a.appointmentId)).toEqual({
      status: "scheduled",
      origin: "patient_portal",
    });
    expect(await loadMessagingCheckTarget(b.id, b.appointmentId)).toEqual({
      status: "confirmed",
      origin: "staff",
    });
  });

  it("ANOTHER tenant's appointment id reads as absent, in both directions", async () => {
    const { loadMessagingCheckTarget } = await import("./messaging-check-target");
    // The rows exist: the control. So the nulls below are the tenant claim.
    expect(await existsForAdmin(a.appointmentId)).toBe(true);
    expect(await existsForAdmin(b.appointmentId)).toBe(true);

    expect(await loadMessagingCheckTarget(b.id, a.appointmentId)).toBeNull();
    expect(await loadMessagingCheckTarget(a.id, b.appointmentId)).toBeNull();
  });

  it("an id that names no appointment reads as absent, not as an error", async () => {
    const { loadMessagingCheckTarget } = await import("./messaging-check-target");
    const nowhere = randomUUID();
    expect(await existsForAdmin(nowhere)).toBe(false);
    expect(await loadMessagingCheckTarget(a.id, nowhere)).toBeNull();
  });

  it("the row the delivery test refuses is the one tenant A holds, and only A can see it", async () => {
    const { loadMessagingCheckTarget } = await import("./messaging-check-target");
    const { isUnacceptedOnlineRequest } = await import("./messaging-check-reasons");
    const own = await loadMessagingCheckTarget(a.id, a.appointmentId);
    expect(own && isUnacceptedOnlineRequest(own)).toBe(true);
    // From B, the same id is nothing: B's owner cannot learn that A's
    // appointment exists, let alone that it is a pending request.
    expect(await loadMessagingCheckTarget(b.id, a.appointmentId)).toBeNull();
  });
});
