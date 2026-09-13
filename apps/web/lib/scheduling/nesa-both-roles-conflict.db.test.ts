/**
 * nesa-both-roles-conflict.db.test.ts - SCHED-29.2, against a real database.
 *
 * Owner ruling SCHED-29.2 (2026-09-13), fix and not accept: NESA cannot be
 * double-booked across roles. An appointment where NESA is the SECOND
 * participant occupies NESA's hour exactly as one where NESA is the Terapeuta.
 *
 * The flags are GREEN's v3 contract for the machine at Castelo Branco:
 * is_shared_resource true, is_bookable false, one staff_locations row at CB.
 *
 * runScoped is REAL, so RLS, appointment_conflicts, the SCHED-17 location rule
 * and the SCHED-29 second-participant rule run as on production. Only the
 * request context, the client IP and the reminder send are mocked.
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

d("SCHED-29.2: NESA's hour is held in both roles", () => {
  let sql: Awaited<ReturnType<typeof import("@osteojp/db").getDbAdmin>>;
  let create: typeof import("./actions").createAppointment;

  let tenantId: string;
  let receptionId: string;
  let therapistOne: string;
  let therapistTwo: string;
  let therapistThree: string;
  let nesaId: string;
  let cb: string;
  let serviceId: string;
  let patientA: string;
  let patientB: string;

  /** A Wednesday well ahead, 10:00-10:45 and 11:00-11:45 UTC. */
  const TEN = new Date("2027-02-10T10:00:00.000Z");
  const TEN_END = new Date("2027-02-10T10:45:00.000Z");
  const ELEVEN = new Date("2027-02-10T11:00:00.000Z");
  const ELEVEN_END = new Date("2027-02-10T11:45:00.000Z");

  const as = (role: "reception" | "therapist" | "owner", userId: string) =>
    h.requireRequestContext.mockResolvedValue({ tenantId, role, userId });

  beforeAll(async () => {
    const { getDbAdmin } = await import("@osteojp/db");
    sql = getDbAdmin();
    ({ createAppointment: create } = await import("./actions"));

    tenantId = randomUUID();
    await sql.execute(raw`insert into tenants (id, name, slug)
      values (${tenantId}, 'NESA Both Roles Co', ${"sched292-" + tenantId.slice(0, 8)})`);

    receptionId = randomUUID();
    therapistOne = randomUUID();
    therapistTwo = randomUUID();
    therapistThree = randomUUID();
    nesaId = randomUUID();
    const person = async (id: string, name: string, bookable: boolean) =>
      sql.execute(raw`insert into users (id, tenant_id, email, full_name, is_active, is_bookable)
        values (${id}, ${tenantId}, ${"u-" + id.slice(0, 8) + "@t.test"}, ${name}, true, ${bookable})`);
    await person(receptionId, "Rececao CB", false);
    await person(therapistOne, "Terapeuta Um", true);
    await person(therapistTwo, "Terapeuta Dois", true);
    await person(therapistThree, "Terapeuta Tres", true);
    // GREEN's v3 values on the machine.
    await sql.execute(raw`insert into users (id, tenant_id, email, full_name, is_active, is_bookable, is_shared_resource)
      values (${nesaId}, ${tenantId}, ${"nesa-" + nesaId.slice(0, 8) + "@t.test"}, 'NESA', true, false, true)`);

    cb = randomUUID();
    await sql.execute(raw`insert into locations (id, tenant_id, name) values (${cb}, ${tenantId}, 'Castelo Branco (teste)')`);
    for (const u of [receptionId, therapistOne, therapistTwo, therapistThree, nesaId]) {
      await sql.execute(raw`insert into staff_locations (tenant_id, user_id, location_id) values (${tenantId}, ${u}, ${cb})`);
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

  /** Rows holding NESA's 10:00 hour, in EITHER role. Two is a double booking. */
  async function nesaTenOClock(): Promise<number> {
    const [r] = await rows(raw`select count(*)::int as n from appointments
      where tenant_id = ${tenantId}
        and (practitioner_id = ${nesaId} or practitioner_2_id = ${nesaId})
        and status not in ('cancelled', 'no_show')
        and starts_at < ${TEN_END.toISOString()}::timestamptz
        and ends_at > ${TEN.toISOString()}::timestamptz`);
    return Number(r?.n);
  }

  function booking(args: {
    practitionerId: string;
    practitionerTwoId?: string | null;
    patientId: string;
    startsAt?: Date;
    endsAt?: Date;
    allowConflict?: boolean;
  }) {
    return create({
      patientId: args.patientId,
      practitionerId: args.practitionerId,
      practitionerTwoId: args.practitionerTwoId ?? null,
      locationId: cb,
      serviceId,
      room: null,
      startsAt: (args.startsAt ?? TEN).toISOString(),
      endsAt: (args.endsAt ?? TEN_END).toISOString(),
      notes: null,
      allowConflict: args.allowConflict,
    });
  }

  it("CONTROL: NESA as Terapeuta already blocks NESA as Terapeuta (the harness can see a conflict)", async () => {
    as("reception", receptionId);
    expect((await booking({ practitionerId: nesaId, patientId: patientA })).ok).toBe(true);
    const r = await booking({ practitionerId: nesaId, patientId: patientB });
    expect(await nesaTenOClock()).toBe(1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("conflict");
  });

  it("NESA as second participant (therapist's booking) blocks reception booking NESA as Terapeuta", async () => {
    as("therapist", therapistOne);
    expect((await booking({ practitionerId: therapistOne, practitionerTwoId: nesaId, patientId: patientA })).ok).toBe(true);
    as("reception", receptionId);
    const r = await booking({ practitionerId: nesaId, patientId: patientB });
    expect(await nesaTenOClock()).toBe(1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("conflict");
  });

  it("NESA as Terapeuta blocks a therapist naming NESA as their Terapeuta 2", async () => {
    as("reception", receptionId);
    expect((await booking({ practitionerId: nesaId, patientId: patientA })).ok).toBe(true);
    as("therapist", therapistOne);
    const r = await booking({ practitionerId: therapistOne, practitionerTwoId: nesaId, patientId: patientB });
    expect(await nesaTenOClock()).toBe(1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("conflict");
  });

  /**
   * THE ONE CELL THAT DEPENDS ON 0088, AND BOTH ARMS ARE ASSERTED.
   *
   * The second-participant read runs under the caller's RLS. Before 0088 a
   * therapist cannot read a colleague's row with NESA as Terapeuta 2, so this
   * door is not refused: the residual SCHED-29.3 exists to close, pinned here so
   * it cannot pass silently. Where 0088's SELECT policy exists the same booking
   * is refused. The arm is chosen from the database, never skipped.
   */
  it("NESA as second participant blocks a SECOND therapist naming NESA as Terapeuta 2 (refused once 0088 is applied)", async () => {
    const [p] = await rows(raw`select count(*)::int as n from pg_policies
      where schemaname = 'public' and tablename = 'appointments'
        and policyname = 'appointments_shared_resource_second_participant_select'`);
    const has0088 = Number(p?.n) === 1;
    as("therapist", therapistOne);
    expect((await booking({ practitionerId: therapistOne, practitionerTwoId: nesaId, patientId: patientA })).ok).toBe(true);
    as("therapist", therapistTwo);
    const r = await booking({ practitionerId: therapistTwo, practitionerTwoId: nesaId, patientId: patientB });
    if (has0088) {
      expect(await nesaTenOClock()).toBe(1);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBe("conflict");
    } else {
      expect(r.ok).toBe(true);
      expect(await nesaTenOClock()).toBe(2);
    }
  });

  it("NESA as second participant blocks reception naming NESA as Terapeuta 2 on another therapist", async () => {
    as("therapist", therapistOne);
    expect((await booking({ practitionerId: therapistOne, practitionerTwoId: nesaId, patientId: patientA })).ok).toBe(true);
    as("reception", receptionId);
    const r = await booking({ practitionerId: therapistThree, practitionerTwoId: nesaId, patientId: patientB });
    expect(await nesaTenOClock()).toBe(1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("conflict");
  });

  it("CONTROL: back-to-back NESA hours in both roles do not conflict", async () => {
    as("therapist", therapistOne);
    expect((await booking({ practitionerId: therapistOne, practitionerTwoId: nesaId, patientId: patientA })).ok).toBe(true);
    as("therapist", therapistTwo);
    const r = await booking({
      practitionerId: therapistTwo,
      practitionerTwoId: nesaId,
      patientId: patientB,
      startsAt: ELEVEN,
      endsAt: ELEVEN_END,
    });
    expect(r.ok).toBe(true);
  });

  it("CONTROL: a PERSON as second participant still does not hold that person's hour (W4-19 unchanged)", async () => {
    as("reception", receptionId);
    expect((await booking({ practitionerId: therapistOne, practitionerTwoId: therapistThree, patientId: patientA })).ok).toBe(true);
    const r = await booking({ practitionerId: therapistThree, patientId: patientB });
    expect(r.ok).toBe(true);
  });

  it("Guardar mesmo assim still books over NESA's second-participant hour", async () => {
    as("therapist", therapistOne);
    expect((await booking({ practitionerId: therapistOne, practitionerTwoId: nesaId, patientId: patientA })).ok).toBe(true);
    as("reception", receptionId);
    const r = await booking({ practitionerId: nesaId, patientId: patientB, allowConflict: true });
    expect(r.ok).toBe(true);
    expect(await nesaTenOClock()).toBe(2);
  });

  // ========================================================================
  // EVERY OTHER DOOR THAT PUTS A ROW INTO NESA'S HOUR. A rule at one caller
  // guards one caller: create is not the only writer.
  // ========================================================================

  async function seedRow(args: {
    practitionerId: string;
    practitionerTwoId?: string | null;
    patientId: string;
    status?: string;
    startsAt?: Date;
    endsAt?: Date;
  }): Promise<string> {
    const id = randomUUID();
    await sql.execute(raw`insert into appointments
        (id, tenant_id, patient_id, practitioner_id, practitioner_2_id, location_id, service_id,
         starts_at, ends_at, status, confirmation_state, created_by)
      values (${id}, ${tenantId}, ${args.patientId}, ${args.practitionerId}, ${args.practitionerTwoId ?? null},
              ${cb}, ${serviceId},
              ${(args.startsAt ?? TEN).toISOString()}::timestamptz, ${(args.endsAt ?? TEN_END).toISOString()}::timestamptz,
              ${args.status ?? "scheduled"}::appointment_status, 'pending'::appointment_confirmation_state, ${receptionId})`);
    return id;
  }

  it("CLONE (Marcar novamente): a therapist's copy with NESA as Terapeuta 2 is refused over NESA's hour", async () => {
    const { cloneAppointment } = await import("./actions");
    const source = await seedRow({
      practitionerId: therapistOne,
      practitionerTwoId: nesaId,
      patientId: patientA,
      startsAt: new Date("2027-02-03T10:00:00.000Z"),
      endsAt: new Date("2027-02-03T10:45:00.000Z"),
    });
    await seedRow({ practitionerId: nesaId, patientId: patientB });
    as("therapist", therapistOne);
    const r = await cloneAppointment(source, TEN.toISOString());
    expect(await nesaTenOClock()).toBe(1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("conflict");
  });

  it("RESCHEDULE: moving a booking with NESA as Terapeuta 2 onto NESA's hour is refused", async () => {
    const { rescheduleAppointment } = await import("./actions");
    const moving = await seedRow({
      practitionerId: therapistOne,
      practitionerTwoId: nesaId,
      patientId: patientA,
      startsAt: ELEVEN,
      endsAt: ELEVEN_END,
    });
    await seedRow({ practitionerId: nesaId, patientId: patientB });
    as("reception", receptionId);
    const r = await rescheduleAppointment(moving, {
      startsAt: TEN.toISOString(),
      endsAt: TEN_END.toISOString(),
      practitionerId: therapistOne,
      locationId: cb,
    });
    expect(await nesaTenOClock()).toBe(1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("conflict");
  });

  it("UN-CANCEL (SCHED-27): a Cancelada with NESA as Terapeuta 2 cannot come back over NESA's hour", async () => {
    const { updateAppointment } = await import("./actions");
    const cancelled = await seedRow({
      practitionerId: therapistOne,
      practitionerTwoId: nesaId,
      patientId: patientA,
      status: "cancelled",
    });
    await seedRow({ practitionerId: nesaId, patientId: patientB });
    as("reception", receptionId);
    const r = await updateAppointment(cancelled, { status: "scheduled" });
    expect(await nesaTenOClock()).toBe(1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("conflict");
  });

  it("CORRIGIR ESTADO (SCHED-28): Cancelada to Concluida with NESA as Terapeuta 2 is refused over NESA's hour", async () => {
    const { correctAppointmentEstadoAction } = await import("./actions");
    const cancelled = await seedRow({
      practitionerId: therapistOne,
      practitionerTwoId: nesaId,
      patientId: patientA,
      status: "cancelled",
    });
    await seedRow({ practitionerId: nesaId, patientId: patientB });
    as("reception", receptionId);
    const r = await correctAppointmentEstadoAction(cancelled, "completed");
    expect(await nesaTenOClock()).toBe(1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("conflict");
  });

  it("CORRIGIR ESTADO the other way: NESA as Terapeuta coming back is refused over NESA as Terapeuta 2", async () => {
    const { correctAppointmentEstadoAction } = await import("./actions");
    await seedRow({ practitionerId: therapistOne, practitionerTwoId: nesaId, patientId: patientA });
    const cancelled = await seedRow({ practitionerId: nesaId, patientId: patientB, status: "cancelled" });
    as("reception", receptionId);
    const r = await correctAppointmentEstadoAction(cancelled, "completed");
    expect(await nesaTenOClock()).toBe(1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("conflict");
  });

  it("AVAILABILITY (batch engine and the drawer panel): NESA's day counts its Terapeuta 2 rows as booked", async () => {
    const { getTherapistAvailability } = await import("./day-availability");
    const held = await seedRow({ practitionerId: therapistOne, practitionerTwoId: nesaId, patientId: patientA });
    const ctx = { tenantId, role: "reception" as const, userId: receptionId };
    const [nesaDay] = await getTherapistAvailability(ctx, {
      therapistId: nesaId,
      from: "2027-02-10",
      to: "2027-02-10",
      locationId: cb,
    });
    expect(nesaDay?.booked.map((b) => b.appointmentId)).toContain(held);
    // A PERSON's second-slot rows stay out of that person's day (W4-19).
    const personRow = await seedRow({
      practitionerId: therapistOne,
      practitionerTwoId: therapistThree,
      patientId: patientB,
      startsAt: ELEVEN,
      endsAt: ELEVEN_END,
    });
    const [personDay] = await getTherapistAvailability(ctx, {
      therapistId: therapistThree,
      from: "2027-02-10",
      to: "2027-02-10",
      locationId: cb,
    });
    expect(personDay?.booked.map((b) => b.appointmentId)).not.toContain(personRow);
  });
});
