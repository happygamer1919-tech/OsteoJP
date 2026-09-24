/**
 * staff-10-v2-option-a-conflict.db.test.ts - STAFF-10 v2, ruling (c), against a
 * real database and the app's REAL conflict check.
 *
 * The held data op (docs/data-op-staff-10-v2.md) resolves a future NESA twin
 * (one session held on a NESA row AND on a person row) by option a: the person
 * row keeps and takes the NESA as practitioner_2, and the NESA row is cancelled.
 * Its stages prove the machine hour stays held with the app's rule written
 * INLINE, because appointment_conflicts and is_unconfirmed_pedido read
 * jwt_tenant_id() and answer nothing in a psql session. This suite closes the
 * other half: after the same two writes, createAppointment (findConflicts, under
 * runScoped, with RLS) still refuses a second booking of that NESA hour, and of
 * the therapist's hour.
 *
 * The two writes below have the op's shape: stage 2 W6 and W7.
 *
 * runScoped is REAL. Only the request context, the client IP and the reminder
 * send are mocked, as in nesa-both-roles-conflict.db.test.ts.
 */
import { randomUUID } from "node:crypto";
import { sql as raw } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: vi.fn(), revalidateTag: vi.fn() }));

const h = vi.hoisted(() => ({
  requireRequestContext: vi.fn(),
  enqueueRemindersAfterCommit: vi.fn(async () => {}),
  enqueueStatusNotificationsAfterCommit: vi.fn(async () => {}),
}));
vi.mock("@/lib/auth/context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/context")>();
  return { ...actual, requireRequestContext: h.requireRequestContext };
});
vi.mock("./actor", () => ({ clientIp: vi.fn(async () => null) }));
vi.mock("./reminders", () => ({
  enqueueRemindersAfterCommit: h.enqueueRemindersAfterCommit,
  enqueueStatusNotificationsAfterCommit: h.enqueueStatusNotificationsAfterCommit,
}));

const live = Boolean(process.env.DATABASE_URL);
const d = live ? describe : describe.skip;

d("STAFF-10 v2 option a: after the rewrite, the app still holds the NESA hour and the therapist's hour", () => {
  let sql: Awaited<ReturnType<typeof import("@osteojp/db").getDbAdmin>>;
  let create: typeof import("./actions").createAppointment;

  let tenantId: string;
  let receptionId: string;
  let therapistOne: string;
  let therapistTwo: string;
  let nesaId: string;
  let lv: string;
  let serviceId: string;
  let patientA: string;
  let patientB: string;

  /** A Wednesday well ahead, 10:00-11:00 UTC: the twin's window. */
  const TEN = new Date("2027-03-10T10:00:00.000Z");
  const ELEVEN = new Date("2027-03-10T11:00:00.000Z");

  const as = (role: "reception" | "therapist" | "owner", userId: string) =>
    h.requireRequestContext.mockResolvedValue({ tenantId, role, userId });

  beforeAll(async () => {
    const { getDbAdmin } = await import("@osteojp/db");
    sql = getDbAdmin();
    ({ createAppointment: create } = await import("./actions"));

    tenantId = randomUUID();
    await sql.execute(raw`insert into tenants (id, name, slug)
      values (${tenantId}, 'STAFF-10 v2 Option A Co', ${"s10v2a-" + tenantId.slice(0, 8)})`);

    receptionId = randomUUID();
    therapistOne = randomUUID();
    therapistTwo = randomUUID();
    nesaId = randomUUID();
    const person = async (id: string, name: string, bookable: boolean) =>
      sql.execute(raw`insert into users (id, tenant_id, email, full_name, is_active, is_bookable)
        values (${id}, ${tenantId}, ${"u-" + id.slice(0, 8) + "@t.test"}, ${name}, true, ${bookable})`);
    await person(receptionId, "Rececao LV", false);
    await person(therapistOne, "Terapeuta Um", true);
    await person(therapistTwo, "Terapeuta Dois", true);
    await sql.execute(raw`insert into users (id, tenant_id, email, full_name, is_active, is_bookable, is_shared_resource)
      values (${nesaId}, ${tenantId}, ${"nesa-" + nesaId.slice(0, 8) + "@t.test"}, 'NESA', true, false, true)`);

    lv = randomUUID();
    await sql.execute(raw`insert into locations (id, tenant_id, name) values (${lv}, ${tenantId}, 'Linda-a-Velha (teste)')`);
    for (const u of [receptionId, therapistOne, therapistTwo, nesaId]) {
      await sql.execute(raw`insert into staff_locations (tenant_id, user_id, location_id) values (${tenantId}, ${u}, ${lv})`);
    }

    serviceId = randomUUID();
    await sql.execute(raw`insert into services (id, tenant_id, name) values (${serviceId}, ${tenantId}, 'NESA')`);
    patientA = randomUUID();
    patientB = randomUUID();
    await sql.execute(raw`insert into patients (id, tenant_id, full_name) values (${patientA}, ${tenantId}, 'Paciente A')`);
    await sql.execute(raw`insert into patients (id, tenant_id, full_name) values (${patientB}, ${tenantId}, 'Paciente B')`);
  });

  afterEach(async () => {
    await sql.execute(raw`delete from appointment_notes where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from audit_log where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from appointments where tenant_id = ${tenantId}`);
  });

  afterAll(async () => {
    if (!sql) return;
    await sql.execute(raw`delete from appointment_notes where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from audit_log where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from appointments where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from staff_locations where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from services where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from patients where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from locations where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from users where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from tenants where id = ${tenantId}`);
  });

  type Row = Record<string, unknown>;
  async function rows(q: Parameters<typeof sql.execute>[0]): Promise<Row[]> {
    const r = (await sql.execute(q)) as unknown;
    return (Array.isArray(r) ? r : ((r as { rows?: unknown[] }).rows ?? [])) as Row[];
  }

  /** Rows holding NESA's hour in EITHER role, this tenant only. */
  async function nesaHeld(): Promise<number> {
    const [r] = await rows(raw`select count(*)::int as n from appointments
      where tenant_id = ${tenantId}
        and (practitioner_id = ${nesaId} or practitioner_2_id = ${nesaId})
        and status not in ('cancelled', 'no_show')
        and starts_at < ${ELEVEN.toISOString()}::timestamptz
        and ends_at > ${TEN.toISOString()}::timestamptz`);
    return Number(r?.n);
  }

  /** The imported twin: the same NESA session on the NESA row and on the therapist. */
  async function seedTwin(): Promise<{ nesaRow: string; personRow: string }> {
    const nesaRow = randomUUID();
    const personRow = randomUUID();
    for (const [id, who] of [
      [nesaRow, nesaId],
      [personRow, therapistOne],
    ] as const) {
      await sql.execute(raw`insert into appointments
          (id, tenant_id, patient_id, practitioner_id, location_id, service_id,
           starts_at, ends_at, status, confirmation_state, created_by)
        values (${id}, ${tenantId}, ${patientA}, ${who}, ${lv}, ${serviceId},
                ${TEN.toISOString()}::timestamptz, ${ELEVEN.toISOString()}::timestamptz,
                'scheduled'::appointment_status, 'pending'::appointment_confirmation_state, ${receptionId})`);
    }
    return { nesaRow, personRow };
  }

  /** Stage 2's W6 and W7, on one pair. */
  async function optionA(pair: { nesaRow: string; personRow: string }): Promise<void> {
    await sql.execute(raw`update appointments set practitioner_2_id = ${nesaId}, updated_at = now()
      where id = ${pair.personRow} and practitioner_2_id is null and status not in ('cancelled', 'no_show')`);
    await sql.execute(raw`update appointments set status = 'cancelled', updated_at = now()
      where id = ${pair.nesaRow} and status not in ('cancelled', 'no_show')`);
  }

  function booking(args: { practitionerId: string; practitionerTwoId?: string | null; patientId: string }) {
    return create({
      patientId: args.patientId,
      practitionerId: args.practitionerId,
      practitionerTwoId: args.practitionerTwoId ?? null,
      locationId: lv,
      serviceId,
      room: null,
      startsAt: TEN.toISOString(),
      endsAt: ELEVEN.toISOString(),
      notes: null,
    });
  }

  it("CONTROL, before the rewrite: the twin's NESA row holds the NESA hour", async () => {
    await seedTwin();
    as("reception", receptionId);
    const r = await booking({ practitionerId: nesaId, patientId: patientB });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("conflict");
    expect(await nesaHeld()).toBe(1);
  });

  it("after option a, booking NESA as Terapeuta over the hour is refused: the person row holds it as Terapeuta 2", async () => {
    const pair = await seedTwin();
    await optionA(pair);
    const [n] = await rows(raw`select status::text as s from appointments where id = ${pair.nesaRow}`);
    expect(n?.s).toBe("cancelled");
    expect(await nesaHeld()).toBe(1);
    as("reception", receptionId);
    const r = await booking({ practitionerId: nesaId, patientId: patientB });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("conflict");
    expect(await nesaHeld()).toBe(1);
  });

  it("after option a, naming NESA as Terapeuta 2 on another therapist's booking over the hour is refused", async () => {
    await optionA(await seedTwin());
    as("reception", receptionId);
    const r = await booking({ practitionerId: therapistTwo, practitionerTwoId: nesaId, patientId: patientB });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("conflict");
    expect(await nesaHeld()).toBe(1);
  });

  it("after option a, the therapist's own hour is still held by the person row", async () => {
    await optionA(await seedTwin());
    as("reception", receptionId);
    const r = await booking({ practitionerId: therapistOne, patientId: patientB });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("conflict");
  });

  it("NEGATIVE CONTROL: cancelling the NESA row WITHOUT the Terapeuta 2 frees the hour, so the suite can see it freed", async () => {
    const pair = await seedTwin();
    await sql.execute(raw`update appointments set status = 'cancelled', updated_at = now() where id = ${pair.nesaRow}`);
    expect(await nesaHeld()).toBe(0);
    as("reception", receptionId);
    const r = await booking({ practitionerId: nesaId, patientId: patientB });
    expect(r.ok).toBe(true);
    expect(await nesaHeld()).toBe(1);
  });
});
