/**
 * transition-recipients-by-clinic.db.test.ts - WHO A CANCELLATION REACHES,
 * against a real Postgres.
 *
 * THE DEFECT, reported by the clinic on 2026-10-16: a receptionist assigned to
 * one clinic was told of another clinic's cancellations. Her own reads cannot
 * show that patient or that visit (0073's location rule), so the notification
 * centre printed "Paciente não identificado" and the agenda showed nothing.
 * The fan-out sent every staff transition to EVERY active reception user in the
 * tenant.
 *
 * THE RULE ASSERTED: a reception user receives the notice when they have no
 * staff_locations row (they see every clinic) or a row for the appointment's
 * clinic. The practitioners still receive it, and the actor never does.
 *
 * WHY A DB TEST. The rule is two sub-queries in the recipient SELECT; a mocked
 * builder answers from a fixture and cannot see a wrong predicate. Only
 * `getDbAdmin` is real here, as in production: the fan-out runs as the admin
 * client after the commit.
 *
 * THE UNASSIGNED RECEPTIONIST IS THE POSITIVE CONTROL. A rule that refused
 * everybody would pass the "Castelo Branco reception gets nothing" assertion
 * for the wrong reason.
 *
 * SKIP CONTRACT: gates on DATABASE_URL like every *.db.test.ts, so ci.yml (no
 * database) skips cleanly and the DB-gated required job runs it.
 */
import { randomUUID } from "node:crypto";
import { sql as raw } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const url = process.env.DATABASE_URL;
const live = Boolean(url);
const d = live ? describe : describe.skip;

d("staff transition notices reach only reception who can see the clinic", () => {
  let sql: ReturnType<typeof import("@osteojp/db").getDbAdmin>;
  let centre: typeof import("./centre");

  const tenantId = randomUUID();
  const roleReception = randomUUID();
  const roleTherapist = randomUUID();
  const locLV = randomUUID();
  const locCB = randomUUID();
  const actor = randomUUID(); // reception at LV, who cancels
  const recLV = randomUUID();
  const recCB = randomUUID();
  const recBoth = randomUUID();
  const recNone = randomUUID();
  const recInactive = randomUUID(); // unassigned but inactive: never
  const therapist = randomUUID();
  const patientId = randomUUID();
  const serviceId = randomUUID();
  const apptLV = randomUUID();
  const apptCB = randomUUID();
  const START = new Date("2027-01-13T11:00:00.000Z");
  const END = new Date("2027-01-13T12:00:00.000Z");

  async function recipientsOf(appointmentId: string): Promise<Set<string>> {
    const r = await sql.execute(
      raw`select recipient_user_id::text as id from staff_notifications
          where tenant_id = ${tenantId} and appointment_id = ${appointmentId}`,
    );
    const rows = (Array.isArray(r) ? r : (r as { rows: unknown[] }).rows) as { id: string }[];
    return new Set(rows.map((x) => x.id));
  }

  beforeAll(async () => {
    const db = await import("@osteojp/db");
    sql = db.getDbAdmin();
    centre = await import("./centre");

    await sql.execute(raw`insert into tenants (id, name, slug)
      values (${tenantId}, 'Fanout Co', ${"fanout-" + tenantId.slice(0, 8)})`);
    await sql.execute(raw`insert into roles (id, tenant_id, slug, name) values
      (${roleReception}, ${tenantId}, 'reception', 'Rececao'),
      (${roleTherapist}, ${tenantId}, 'therapist', 'Terapeuta')`);
    await sql.execute(raw`insert into locations (id, tenant_id, name) values
      (${locLV}, ${tenantId}, 'Linda-a-Velha'), (${locCB}, ${tenantId}, 'Castelo Branco')`);
    for (const [id, role, active] of [
      [actor, roleReception, true],
      [recLV, roleReception, true],
      [recCB, roleReception, true],
      [recBoth, roleReception, true],
      [recNone, roleReception, true],
      [recInactive, roleReception, false],
      [therapist, roleTherapist, true],
    ] as const) {
      await sql.execute(raw`insert into users (id, tenant_id, role_id, email, full_name, is_active)
        values (${id}, ${tenantId}, ${role}, ${id.slice(0, 8) + "@fanout.invalid"}, 'Staff', ${active})`);
    }
    for (const [u, l] of [
      [actor, locLV],
      [recLV, locLV],
      [recCB, locCB],
      [recBoth, locLV],
      [recBoth, locCB],
    ] as const) {
      await sql.execute(raw`insert into staff_locations (tenant_id, user_id, location_id)
        values (${tenantId}, ${u}, ${l})`);
    }
    await sql.execute(raw`insert into services (id, tenant_id, name) values (${serviceId}, ${tenantId}, 'Osteopatia')`);
    await sql.execute(raw`insert into patients (id, tenant_id, full_name) values (${patientId}, ${tenantId}, 'Paciente')`);
    for (const [id, loc] of [
      [apptLV, locLV],
      [apptCB, locCB],
    ] as const) {
      await sql.execute(raw`insert into appointments
          (id, tenant_id, patient_id, practitioner_id, location_id, service_id, starts_at, ends_at, status, created_by)
        values (${id}, ${tenantId}, ${patientId}, ${therapist}, ${loc}, ${serviceId},
                ${START.toISOString()}::timestamptz, ${END.toISOString()}::timestamptz, 'cancelled', ${actor})`);
    }
  });

  afterAll(async () => {
    // Fresh tenant per run; only the rows this suite's emits wrote are removed.
    if (!live) return;
    await sql.execute(raw`delete from staff_notifications where tenant_id = ${tenantId}`);
  });

  const emit = (appointmentId: string) =>
    centre.emitCancelledNotification({
      tenantId,
      actorUserId: actor,
      appointmentId,
      patientId,
      practitionerIds: [therapist],
      startsAt: START,
      occurredAt: new Date(),
    });

  it("a Linda-a-Velha cancellation reaches LV, both-clinic and unassigned reception, and the therapist", async () => {
    expect(await emit(apptLV)).toEqual({ delivered: true });
    expect(await recipientsOf(apptLV)).toEqual(new Set([recLV, recBoth, recNone, therapist]));
  });

  it("a Castelo Branco cancellation never reaches Linda-a-Velha-only reception", async () => {
    expect(await emit(apptCB)).toEqual({ delivered: true });
    const got = await recipientsOf(apptCB);
    expect(got).toEqual(new Set([recCB, recBoth, recNone, therapist]));
    expect(got.has(recLV)).toBe(false);
    // The actor is LV reception and is excluded anyway; the inactive user never.
    expect(got.has(actor)).toBe(false);
    expect(got.has(recInactive)).toBe(false);
  });
});
