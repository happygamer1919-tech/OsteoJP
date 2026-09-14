/**
 * therapist-cancel.db.test.ts - SCHED-30, against a real database.
 *
 * Owner dispatch 2026-09-14 (BL-3): a therapist may set Cancelada, and may move
 * an appointment out of Cancelada, only where they are Terapeuta or Terapeuta 2
 * and only at their assigned clinics. Owner, admin and reception unchanged.
 * "Un-cancelling must run the full conflict check including the both-roles NESA
 * check. An appointment restored into a slot someone else has since taken is a
 * double booking created by an undo."
 *
 * runScoped is REAL, so appointments_rls (including 0086's shared-resource arm),
 * appointment_conflicts and the permission matrix run as on production. Only the
 * request context, the client IP and the reminder send are mocked.
 *
 * THE NEGATIVE CONTROL, run on main 59074ded on the BLUE lane: 8 failed, 6
 * passed. Failing there: the three BL-3a arms, the slot-taken arm, both NESA
 * refusal arms and the clinic arm, because both doors answered `forbidden` to any
 * therapist; and the RLS-hidden arm, on its CODE only (main refuses at the
 * capability with `forbidden` before RLS is reached; the row is untouched either
 * way). Passing on main as well, and they must: the four reception controls and
 * the two arms refusing a NESA row the therapist is not on. SCHED-30 may not
 * loosen those.
 *
 * THE NESA ARM IS A REFUSAL, NOT A CONFLICT CHECK, AND THAT IS DELIBERATE. The
 * both-roles check reads rows where NESA is Terapeuta 2 under the caller's RLS.
 * A therapist cannot see a colleague's such row until 0088 is applied, so for a
 * therapist the check cannot prove NESA's hour is free. Reception can, and the
 * reception arms below show the check running in full for them.
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

d("SCHED-30: a therapist cancels, and brings back, their own appointment", () => {
  let sql: Awaited<ReturnType<typeof import("@osteojp/db").getDbAdmin>>;
  let update: typeof import("./actions").updateAppointment;
  let cancel: typeof import("./actions").cancelAppointment;

  let tenantId: string;
  let receptionId: string;
  let me: string;
  let colleague: string;
  let nesaId: string;
  let cb: string;
  let lv: string;
  let serviceId: string;
  let patientA: string;
  let patientB: string;

  /** Future, so reminders are due; a Wednesday, 10:00-10:45 UTC. */
  const TEN = new Date("2027-03-10T10:00:00.000Z");
  const TEN_END = new Date("2027-03-10T10:45:00.000Z");

  const as = (role: "reception" | "therapist", userId: string) =>
    h.requireRequestContext.mockResolvedValue({ tenantId, role, userId });

  beforeAll(async () => {
    const { getDbAdmin } = await import("@osteojp/db");
    sql = getDbAdmin();
    ({ updateAppointment: update, cancelAppointment: cancel } = await import("./actions"));

    tenantId = randomUUID();
    await sql.execute(raw`insert into tenants (id, name, slug)
      values (${tenantId}, 'Therapist Cancel Co', ${"sched30-" + tenantId.slice(0, 8)})`);

    receptionId = randomUUID();
    me = randomUUID();
    colleague = randomUUID();
    nesaId = randomUUID();
    const person = async (id: string, name: string, bookable: boolean) =>
      sql.execute(raw`insert into users (id, tenant_id, email, full_name, is_active, is_bookable)
        values (${id}, ${tenantId}, ${"u-" + id.slice(0, 8) + "@t.test"}, ${name}, true, ${bookable})`);
    await person(receptionId, "Rececao CB", false);
    await person(me, "Terapeuta Eu", true);
    await person(colleague, "Terapeuta Colega", true);
    // GREEN's v3 flags on the machine.
    await sql.execute(raw`insert into users (id, tenant_id, email, full_name, is_active, is_bookable, is_shared_resource)
      values (${nesaId}, ${tenantId}, ${"nesa-" + nesaId.slice(0, 8) + "@t.test"}, 'NESA', true, false, true)`);

    cb = randomUUID();
    lv = randomUUID();
    await sql.execute(raw`insert into locations (id, tenant_id, name) values (${cb}, ${tenantId}, 'Castelo Branco (teste)')`);
    await sql.execute(raw`insert into locations (id, tenant_id, name) values (${lv}, ${tenantId}, 'Linda-a-Velha (teste)')`);
    // `me` works at CB only. LV is somewhere they are NOT assigned.
    for (const u of [receptionId, me, colleague, nesaId]) {
      await sql.execute(raw`insert into staff_locations (tenant_id, user_id, location_id) values (${tenantId}, ${u}, ${cb})`);
    }

    serviceId = randomUUID();
    await sql.execute(raw`insert into services (id, tenant_id, name) values (${serviceId}, ${tenantId}, 'Osteopatia')`);
    patientA = randomUUID();
    patientB = randomUUID();
    await sql.execute(raw`insert into patients (id, tenant_id, full_name) values (${patientA}, ${tenantId}, 'Paciente A')`);
    await sql.execute(raw`insert into patients (id, tenant_id, full_name) values (${patientB}, ${tenantId}, 'Paciente B')`);
  });

  const cleanRows = async () => {
    await sql.execute(raw`delete from staff_notifications where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from appointment_notes where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from audit_log where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from appointments where tenant_id = ${tenantId}`);
  };

  afterEach(async () => {
    h.enqueueRemindersAfterCommit.mockClear();
    await cleanRows();
  });

  afterAll(async () => {
    if (!sql) return;
    await cleanRows();
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

  async function seed(args: {
    practitionerId: string;
    practitionerTwoId?: string | null;
    status: "scheduled" | "confirmed" | "cancelled";
    patientId?: string;
    location?: string;
    createdBy?: string;
  }): Promise<string> {
    const id = randomUUID();
    await sql.execute(raw`insert into appointments
        (id, tenant_id, patient_id, practitioner_id, practitioner_2_id, location_id, service_id,
         starts_at, ends_at, status, created_by)
      values (${id}, ${tenantId}, ${args.patientId ?? patientA}, ${args.practitionerId},
              ${args.practitionerTwoId ?? null}, ${args.location ?? cb}, ${serviceId},
              ${TEN.toISOString()}::timestamptz, ${TEN_END.toISOString()}::timestamptz,
              ${args.status}::appointment_status, ${args.createdBy ?? receptionId})`);
    return id;
  }

  async function statusOf(id: string): Promise<string> {
    const [r] = await rows(raw`select status::text as status from appointments where id = ${id}`);
    return String(r?.status);
  }

  /** Rows holding `who`'s 10:00 hour in either role. Two is a double booking. */
  async function heldAtTen(who: string): Promise<number> {
    const [r] = await rows(raw`select count(*)::int as n from appointments
      where tenant_id = ${tenantId}
        and (practitioner_id = ${who} or practitioner_2_id = ${who})
        and status not in ('cancelled', 'no_show')
        and starts_at < ${TEN_END.toISOString()}::timestamptz
        and ends_at > ${TEN.toISOString()}::timestamptz`);
    return Number(r?.n);
  }

  // ------------------------------------------------------------------ BL-3a
  it("BL-3a: a therapist cancels an appointment where they are the Terapeuta", async () => {
    as("therapist", me);
    const a = await seed({ practitionerId: me, status: "scheduled" });
    const r = await cancel(a);
    expect(r).toEqual({ ok: true, data: { id: a } });
    expect(await statusOf(a)).toBe("cancelled");
  });

  it("BL-3a: a therapist cancels an appointment where they are the Terapeuta 2", async () => {
    as("therapist", me);
    const a = await seed({ practitionerId: colleague, practitionerTwoId: me, status: "scheduled" });
    const r = await cancel(a);
    expect(r).toEqual({ ok: true, data: { id: a } });
    expect(await statusOf(a)).toBe("cancelled");
  });

  it("BL-3a: a therapist brings their own Cancelada back on a free slot, and its reminders exist again", async () => {
    as("therapist", me);
    const a = await seed({ practitionerId: me, status: "cancelled" });
    const r = await update(a, { status: "scheduled" });
    expect(r.ok).toBe(true);
    expect(await statusOf(a)).toBe("scheduled");
    expect(h.enqueueRemindersAfterCommit).toHaveBeenCalledTimes(1);
  });

  // ------------------------------------------------------------------ BL-3b
  it("BL-3b: REFUSES a therapist bringing one back into a slot taken since, even with Guardar mesmo assim", async () => {
    as("therapist", me);
    const a = await seed({ practitionerId: me, status: "cancelled" });
    const since = await seed({ practitionerId: me, status: "scheduled", patientId: patientB });
    const r = await update(a, { status: "scheduled" }, { allowConflict: true });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe("conflict");
    expect(r.conflictOverridable).toBe(false);
    expect((r.conflicts ?? []).map((c) => c.id)).toContain(since);
    expect(await statusOf(a)).toBe("cancelled");
    expect(await heldAtTen(me)).toBe(1);
  });

  it("BL-3b control: reception keeps Guardar mesmo assim on the same fixture (owner: unchanged)", async () => {
    as("reception", receptionId);
    const a = await seed({ practitionerId: me, status: "cancelled" });
    await seed({ practitionerId: me, status: "scheduled", patientId: patientB });
    const refused = await update(a, { status: "scheduled" });
    expect(refused).toMatchObject({ ok: false, error: "conflict" });
    expect(refused.ok ? undefined : refused.conflictOverridable).toBeUndefined();
    const r = await update(a, { status: "scheduled" }, { allowConflict: true });
    expect(r.ok).toBe(true);
  });

  it("BL-3b NESA: a therapist is REFUSED bringing back a Cancelada holding NESA as Terapeuta 2", async () => {
    as("therapist", me);
    const a = await seed({ practitionerId: me, practitionerTwoId: nesaId, status: "cancelled" });
    const r = await update(a, { status: "scheduled" }, { allowConflict: true });
    expect(r).toEqual({ ok: false, error: "uncancel_shared_resource" });
    expect(await statusOf(a)).toBe("cancelled");
  });

  it("BL-3b NESA: and one holding NESA as Terapeuta, where they are Terapeuta 2", async () => {
    as("therapist", me);
    const a = await seed({ practitionerId: nesaId, practitionerTwoId: me, status: "cancelled" });
    const r = await update(a, { status: "scheduled" });
    expect(r).toEqual({ ok: false, error: "uncancel_shared_resource" });
    expect(await statusOf(a)).toBe("cancelled");
  });

  it("BL-3b NESA: the hole the refusal closes, measured: a therapist cannot see a colleague holding NESA as Terapeuta 2", async () => {
    // The row the both-roles check would have to find. Pre-0088 the therapist's
    // RLS does not return it; if 0088 is applied here, it does, and the refusal
    // above can be lifted. The assertion names which database this ran on.
    await seed({ practitionerId: colleague, practitionerTwoId: nesaId, status: "scheduled", patientId: patientB, createdBy: colleague });
    const [policy] = await rows(raw`select count(*)::int as n from pg_policies
      where tablename = 'appointments' and policyname = 'appointments_shared_resource_second_participant_select'`);
    const { runScoped } = await import("@/lib/auth/context");
    const visible = await runScoped({ tenantId, role: "therapist", userId: me }, async (tx) => {
      const r = (await tx.execute(raw`select count(*)::int as n from appointments
        where practitioner_2_id = ${nesaId} and status not in ('cancelled', 'no_show')`)) as unknown;
      const list = (Array.isArray(r) ? r : ((r as { rows?: unknown[] }).rows ?? [])) as Row[];
      return Number(list[0]?.n);
    });
    expect(visible).toBe(Number(policy?.n) > 0 ? 1 : 0);
  });

  it("BL-3b NESA control: reception runs the full both-roles check and is refused when a colleague holds NESA as Terapeuta 2 since", async () => {
    as("reception", receptionId);
    const a = await seed({ practitionerId: me, practitionerTwoId: nesaId, status: "cancelled" });
    const since = await seed({ practitionerId: colleague, practitionerTwoId: nesaId, status: "scheduled", patientId: patientB });
    const r = await update(a, { status: "scheduled" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe("conflict");
    expect((r.conflicts ?? []).map((c) => c.id)).toContain(since);
    expect(await heldAtTen(nesaId)).toBe(1);
  });

  it("BL-3b NESA control: reception brings the same row back when NESA's hour is free", async () => {
    as("reception", receptionId);
    const a = await seed({ practitionerId: me, practitionerTwoId: nesaId, status: "cancelled" });
    const r = await update(a, { status: "scheduled" });
    expect(r.ok).toBe(true);
    expect(await heldAtTen(nesaId)).toBe(1);
  });

  // ------------------------------------------------------------------ BL-3c
  it("BL-3c: a therapist cannot cancel a colleague's appointment their RLS hides", async () => {
    as("therapist", me);
    const a = await seed({ practitionerId: colleague, status: "scheduled" });
    const r = await cancel(a);
    expect(r).toEqual({ ok: false, error: "not_found" });
    expect(await statusOf(a)).toBe("scheduled");
  });

  it("BL-3c: a therapist cannot cancel NESA's appointment they can SEE (0086) but are not on", async () => {
    as("therapist", me);
    const a = await seed({ practitionerId: nesaId, status: "scheduled", createdBy: colleague });
    const r = await cancel(a);
    // `forbidden`, not `not_found`: RLS returned the row, and the app refused it.
    expect(r).toEqual({ ok: false, error: "forbidden" });
    expect(await statusOf(a)).toBe("scheduled");
  });

  it("BL-3c: nor bring that NESA appointment back out of Cancelada", async () => {
    as("therapist", me);
    const a = await seed({ practitionerId: nesaId, status: "cancelled", createdBy: colleague });
    const r = await update(a, { status: "scheduled" });
    expect(r).toEqual({ ok: false, error: "forbidden" });
    expect(await statusOf(a)).toBe("cancelled");
  });

  it("BL-3c: their own appointment at a clinic they are not assigned to is refused both ways", async () => {
    as("therapist", me);
    const live = await seed({ practitionerId: me, status: "scheduled", location: lv });
    expect(await cancel(live)).toEqual({ ok: false, error: "location_not_assigned" });
    expect(await statusOf(live)).toBe("scheduled");

    const gone = await seed({ practitionerId: me, status: "cancelled", location: lv, patientId: patientB });
    expect(await update(gone, { status: "scheduled" })).toEqual({ ok: false, error: "location_not_assigned" });
    expect(await statusOf(gone)).toBe("cancelled");
  });
});
