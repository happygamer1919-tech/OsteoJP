/**
 * estado-uncancel.db.test.ts — SCHED-27, against a real database.
 *
 * Owner approval, 2026-09-13: a Cancelada appointment may go back to Agendada or
 * Confirmada through the ordinary Estado control, for the people who can cancel,
 * and a FUTURE one gets its reminders again. Each refusal below was either
 * measured as a real hole on 2026-09-12 (the double booking) or follows from a
 * rule the slot already carries (closure, pacote).
 *
 * runScoped is REAL, so RLS, appointment_conflicts and the pacote count run as on
 * production. The permission matrix is REAL too - assertCan is not mocked - so
 * "a therapist cannot" is proven by the matrix, not by a stub. Only the request
 * context, the client IP and the reminder send are mocked.
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

d("SCHED-27: bringing a Cancelada back", () => {
  let sql: Awaited<ReturnType<typeof import("@osteojp/db").getDbAdmin>>;
  let update: typeof import("./actions").updateAppointment;

  let tenantId: string;
  let receptionId: string;
  let practitionerId: string;
  let locationId: string;
  let closedLocationId: string;
  let serviceId: string;
  let patientA: string;
  let patientB: string;

  /** Future, so a reminder is due. */
  const FUTURE = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
  const FUTURE_END = new Date(FUTURE.getTime() + 45 * 60 * 1000);
  /** Past, so its reminder offsets have gone. */
  const PAST = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
  const PAST_END = new Date(PAST.getTime() + 45 * 60 * 1000);
  /** 13:00-13:45 in Lisbon in January (WET = UTC), inside a 13:00-14:00 closure. */
  const LUNCH = new Date("2027-01-13T13:00:00.000Z");
  const LUNCH_END = new Date("2027-01-13T13:45:00.000Z");

  const asReception = () => h.requireRequestContext.mockResolvedValue({ tenantId, role: "reception", userId: receptionId });

  beforeAll(async () => {
    const { getDbAdmin } = await import("@osteojp/db");
    sql = getDbAdmin();
    ({ updateAppointment: update } = await import("./actions"));

    tenantId = randomUUID();
    await sql.execute(raw`insert into tenants (id, name, slug)
      values (${tenantId}, 'Uncancel Co', ${"sched27-" + tenantId.slice(0, 8)})`);

    receptionId = randomUUID();
    practitionerId = randomUUID();
    await sql.execute(raw`insert into users (id, tenant_id, email, full_name, is_active)
      values (${receptionId}, ${tenantId}, ${"r-" + receptionId.slice(0, 8) + "@t.test"}, 'Rececao', true)`);
    await sql.execute(raw`insert into users (id, tenant_id, email, full_name, is_active, is_bookable)
      values (${practitionerId}, ${tenantId}, ${"p-" + practitionerId.slice(0, 8) + "@t.test"}, 'Dra Teste', true, true)`);

    locationId = randomUUID();
    closedLocationId = randomUUID();
    await sql.execute(raw`insert into locations (id, tenant_id, name) values (${locationId}, ${tenantId}, 'Sede')`);
    await sql.execute(raw`insert into locations (id, tenant_id, name, midday_closed_from, midday_closed_to)
      values (${closedLocationId}, ${tenantId}, 'Fecha ao almoco', '13:00', '14:00')`);

    serviceId = randomUUID();
    await sql.execute(raw`insert into services (id, tenant_id, name) values (${serviceId}, ${tenantId}, 'Osteopatia')`);

    patientA = randomUUID();
    patientB = randomUUID();
    await sql.execute(raw`insert into patients (id, tenant_id, full_name) values (${patientA}, ${tenantId}, 'Paciente A')`);
    await sql.execute(raw`insert into patients (id, tenant_id, full_name) values (${patientB}, ${tenantId}, 'Paciente B')`);
  });

  afterEach(async () => {
    h.enqueueRemindersAfterCommit.mockClear();
    await sql.execute(raw`delete from audit_log where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from appointments where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from patient_pack_instances where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from service_packs where tenant_id = ${tenantId}`);
  });

  afterAll(async () => {
    if (!sql) return;
    await sql.execute(raw`delete from audit_log where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from appointments where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from patient_pack_instances where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from service_packs where tenant_id = ${tenantId}`);
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

  async function seed(args: {
    patientId: string;
    status: string;
    startsAt?: Date;
    endsAt?: Date;
    location?: string;
    confirmation?: string;
    packInstanceId?: string | null;
  }): Promise<string> {
    const id = randomUUID();
    await sql.execute(raw`insert into appointments
        (id, tenant_id, patient_id, practitioner_id, location_id, service_id, starts_at, ends_at,
         status, confirmation_state, created_by, pack_instance_id)
      values (${id}, ${tenantId}, ${args.patientId}, ${practitionerId}, ${args.location ?? locationId}, ${serviceId},
              ${(args.startsAt ?? FUTURE).toISOString()}::timestamptz, ${(args.endsAt ?? FUTURE_END).toISOString()}::timestamptz,
              ${args.status}::appointment_status, ${args.confirmation ?? "pending"}::appointment_confirmation_state,
              ${receptionId}, ${args.packInstanceId ?? null})`);
    return id;
  }

  async function field(id: string, col: "status" | "confirmation_state"): Promise<string> {
    const [r] = await rows(raw`select status::text as status, confirmation_state::text as confirmation_state
      from appointments where id = ${id}`);
    return String(r?.[col]);
  }

  it("brings a Cancelada back to Agendada on a free slot", async () => {
    asReception();
    const a = await seed({ patientId: patientA, status: "cancelled" });
    const r = await update(a, { status: "scheduled" });
    expect(r.ok).toBe(true);
    expect(await field(a, "status")).toBe("scheduled");
  });

  it("REFUSES a slot booked since the cancel, and writes nothing (the measured double booking)", async () => {
    asReception();
    const a = await seed({ patientId: patientA, status: "cancelled" });
    const b = await seed({ patientId: patientB, status: "scheduled" });
    const r = await update(a, { status: "confirmed" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe("conflict");
    expect((r.conflicts ?? []).map((c) => c.id)).toContain(b);
    expect(await field(a, "status")).toBe("cancelled");
  });

  it("Guardar mesmo assim brings it back anyway", async () => {
    asReception();
    const a = await seed({ patientId: patientA, status: "cancelled" });
    await seed({ patientId: patientB, status: "scheduled" });
    const r = await update(a, { status: "scheduled" }, { allowConflict: true });
    expect(r.ok).toBe(true);
    expect(await field(a, "status")).toBe("scheduled");
  });

  // SCHED-30 (owner dispatch 2026-09-14) lets a therapist bring back a row they
  // are ON, so this arm used to read "a THERAPIST cannot bring one back" with the
  // row's own practitioner as the actor, and that is now allowed
  // (therapist-cancel.db.test.ts). What stays refused is a therapist who is not
  // on the row. The actor here is the row's CREATOR, so RLS's created_by arm lets
  // them see it, and the refusal is the app's own "not on this row" check.
  it("a THERAPIST who is not on the row cannot bring it back, by the real permission matrix", async () => {
    h.requireRequestContext.mockResolvedValue({ tenantId, role: "therapist", userId: receptionId });
    const a = await seed({ patientId: patientA, status: "cancelled" });
    const r = await update(a, { status: "scheduled" });
    expect(r).toEqual({ ok: false, error: "forbidden" });
    expect(await field(a, "status")).toBe("cancelled");
  });

  it("resets a declined confirmation to pending, so the row stops reading Cancelada", async () => {
    asReception();
    const a = await seed({ patientId: patientA, status: "cancelled", confirmation: "declined" });
    const r = await update(a, { status: "scheduled" });
    expect(r.ok).toBe(true);
    expect(await field(a, "confirmation_state")).toBe("pending");
  });

  it("REFUSES when the pacote has no session left for it", async () => {
    asReception();
    const packId = randomUUID();
    const instanceId = randomUUID();
    await sql.execute(raw`insert into service_packs (id, tenant_id, base_service_id, name, session_count, price_cents)
      values (${packId}, ${tenantId}, ${serviceId}, 'Pacote 1', 1, 5000)`);
    await sql.execute(raw`insert into patient_pack_instances
        (id, tenant_id, patient_id, pack_id, sessions_total, sessions_remaining, legacy_consumed)
      values (${instanceId}, ${tenantId}, ${patientA}, ${packId}, 1, 0, 1)`);
    const a = await seed({ patientId: patientA, status: "cancelled", packInstanceId: instanceId });
    const r = await update(a, { status: "scheduled" });
    expect(r).toEqual({ ok: false, error: "pack_insufficient" });
    expect(await field(a, "status")).toBe("cancelled");
  });

  it("REFUSES bringing one back into the clinic's closed hour, and Guardar mesmo assim cannot reach it", async () => {
    asReception();
    const a = await seed({
      patientId: patientA,
      status: "cancelled",
      startsAt: LUNCH,
      endsAt: LUNCH_END,
      location: closedLocationId,
    });
    const r = await update(a, { status: "scheduled" }, { allowConflict: true });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe("clinic_closed");
    expect(await field(a, "status")).toBe("cancelled");
  });

  it("re-emits reminders for a FUTURE appointment brought back, and not for a past one", async () => {
    asReception();
    const future = await seed({ patientId: patientA, status: "cancelled" });
    expect((await update(future, { status: "scheduled" })).ok).toBe(true);
    expect(h.enqueueRemindersAfterCommit).toHaveBeenCalledTimes(1);
    const [, targets] = h.enqueueRemindersAfterCommit.mock.calls[0] as unknown as [string, { appointmentId: string }[]];
    expect(targets.map((t) => t.appointmentId)).toEqual([future]);

    h.enqueueRemindersAfterCommit.mockClear();
    const past = await seed({ patientId: patientB, status: "cancelled", startsAt: PAST, endsAt: PAST_END });
    expect((await update(past, { status: "scheduled" })).ok).toBe(true);
    expect(h.enqueueRemindersAfterCommit).not.toHaveBeenCalled();
  });
});
