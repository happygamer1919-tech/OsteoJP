/**
 * marcacoes-therapist-change.db.test.ts - MARC-THERAPIST-01 against a real
 * database: the Terapeuta of a marcação changed from the ficha's "Gerir
 * marcação".
 *
 * The field sends `therapistChangeInput(row, newTherapist)` to
 * `rescheduleAppointment`, the action the agenda's edit panel calls. Every arm
 * here builds its input with that same function, from the row as the ficha's
 * list reads it, so what is driven is what the field sends.
 *
 * The acceptance checks:
 *   G2  a therapist who does not work that hour, and one with a conflict, are
 *       both refused, each with the agenda's own refusal code and payload, and
 *       the appointment is left exactly as it was.
 *   G3  on a pacote appointment the pacote link and the pacote balance read the
 *       same before and after, exactly one appointment audit row is written,
 *       the care team holds the new therapist (once), and exactly one reminder
 *       event is asked for, at the unchanged start.
 *
 * runScoped is REAL, so appointments_rls, patient_care_team's policies and the
 * audit_log policies run as on production, as reception. Only the request
 * context, the client IP and the reminder send are mocked; the send is a spy,
 * and what Inngest does with the event it would carry is modelled in
 * lib/reminders/acceptance-after-reschedule.test.ts.
 *
 * Names are invented.
 */
import { randomUUID } from "node:crypto";
import { sql as raw } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
  revalidateTag: vi.fn(),
  // ./data wraps its reference read in the framework cache at import. The read
  // this suite uses from it (the ficha's appointment list) is not cached.
  unstable_cache: (fn: unknown) => fn,
}));

const h = vi.hoisted(() => ({
  requireRequestContext: vi.fn(),
  enqueueRemindersAfterCommit: vi.fn<(...args: unknown[]) => Promise<void>>(async () => {}),
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

d("MARC-THERAPIST-01: the Terapeuta changed from the ficha's Gerir marcação", () => {
  let sql: Awaited<ReturnType<typeof import("@osteojp/db").getDbAdmin>>;
  let actions: typeof import("./actions");
  let data: typeof import("./data");
  let packs: typeof import("@/lib/packs/instances");
  let change: typeof import("./therapist-change");

  let tenantId: string;
  let loc: string;
  let serviceId: string;
  let packId: string;
  let reception: string;
  let tFirst: string;
  let tMornings: string;
  let tBusy: string;
  let tFree: string;

  /** Wednesdays well ahead, before the 2027 DST change, so UTC equals Lisbon. */
  const at = (day: number, hour: number) => new Date(Date.UTC(2027, 2, day, hour, 0, 0)); // March 2027
  const WED = 10;
  const MINUTES = 45;
  const endOf = (start: Date) => new Date(start.getTime() + MINUTES * 60_000);

  type Ctx = { tenantId: string; role: "reception"; userId: string };
  let ctx: Ctx;

  beforeAll(async () => {
    const { getDbAdmin } = await import("@osteojp/db");
    sql = getDbAdmin();
    actions = await import("./actions");
    data = await import("./data");
    packs = await import("@/lib/packs/instances");
    change = await import("./therapist-change");

    tenantId = randomUUID();
    await sql.execute(raw`insert into tenants (id, name, slug)
      values (${tenantId}, 'Marc Therapist Co', ${"marcther-" + tenantId.slice(0, 8)})`);

    reception = randomUUID();
    tFirst = randomUUID();
    tMornings = randomUUID();
    tBusy = randomUUID();
    tFree = randomUUID();
    const person = async (id: string, name: string, bookable: boolean) =>
      sql.execute(raw`insert into users (id, tenant_id, email, full_name, is_active, is_bookable)
        values (${id}, ${tenantId}, ${"u-" + id.slice(0, 8) + "@t.test"}, ${name}, true, ${bookable})`);
    await person(reception, "Rececao Teste", false);
    await person(tFirst, "Terapeuta Primeiro", true);
    await person(tMornings, "Terapeuta Manhas", true);
    await person(tBusy, "Terapeuta Ocupado", true);
    await person(tFree, "Terapeuta Livre", true);

    loc = randomUUID();
    await sql.execute(raw`insert into locations (id, tenant_id, name) values (${loc}, ${tenantId}, 'Clinica Teste')`);
    for (const u of [reception, tFirst, tMornings, tBusy, tFree]) {
      await sql.execute(raw`insert into staff_locations (tenant_id, user_id, location_id) values (${tenantId}, ${u}, ${loc})`);
    }
    // ONE therapist has declared hours: Wednesday (weekday 3) 09:00 to 13:00.
    // The others have none at all, which the working-hours check reads as
    // "not configured" and allows, so only this one can be outside their hours.
    await sql.execute(raw`insert into availability_templates (tenant_id, user_id, location_id, weekday, start_time, end_time)
      values (${tenantId}, ${tMornings}, ${loc}, 3, '09:00', '13:00')`);

    serviceId = randomUUID();
    await sql.execute(raw`insert into services (id, tenant_id, name) values (${serviceId}, ${tenantId}, 'Osteopatia')`);
    packId = randomUUID();
    await sql.execute(raw`insert into service_packs (id, tenant_id, base_service_id, name, session_count, price_cents)
      values (${packId}, ${tenantId}, ${serviceId}, 'Pacote 5', 5, 20000)`);

    ctx = { tenantId, role: "reception", userId: reception };
    h.requireRequestContext.mockResolvedValue(ctx);
  });

  const clean = async () => {
    await sql.execute(raw`delete from staff_notifications where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from audit_log where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from patient_care_team where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from appointment_notes where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from appointments where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from patient_pack_instances where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from patients where tenant_id = ${tenantId}`);
  };

  afterEach(async () => {
    h.enqueueRemindersAfterCommit.mockClear();
    await clean();
  });

  afterAll(async () => {
    if (!sql) return;
    await clean();
    await sql.execute(raw`delete from service_packs where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from availability_templates where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from staff_locations where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from services where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from locations where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from users where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from tenants where id = ${tenantId}`);
  });

  type Row = Record<string, unknown>;
  async function rows(q: Parameters<typeof sql.execute>[0]): Promise<Row[]> {
    const r = (await sql.execute(q)) as unknown;
    return (Array.isArray(r) ? r : ((r as { rows?: unknown[] }).rows ?? [])) as Row[];
  }

  async function patient(name: string): Promise<string> {
    const id = randomUUID();
    await sql.execute(raw`insert into patients (id, tenant_id, full_name, primary_location_id)
      values (${id}, ${tenantId}, ${name}, ${loc})`);
    return id;
  }

  async function book(args: { patientId: string; practitionerId: string; start: Date; packId?: string }): Promise<string> {
    const r = await actions.createAppointment({
      patientId: args.patientId,
      practitionerId: args.practitionerId,
      locationId: loc,
      serviceId,
      room: null,
      startsAt: args.start.toISOString(),
      endsAt: endOf(args.start).toISOString(),
      notes: null,
      allowConflict: false,
      recurrence: null,
      packId: args.packId ?? null,
    });
    if (!r.ok) throw new Error(`setup booking failed: ${r.error}`);
    return r.data.id;
  }

  /** Every column of the appointment a therapist change could disturb. */
  async function stored(id: string): Promise<Row> {
    const [r] = await rows(raw`select practitioner_id::text as practitioner_id,
        practitioner_2_id::text as practitioner_2_id,
        location_id::text as location_id, service_id::text as service_id,
        pack_instance_id::text as pack_instance_id, status::text as status,
        confirmation_state::text as confirmation_state,
        to_char(starts_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') as starts_at,
        to_char(ends_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') as ends_at
      from appointments where id = ${id}`);
    if (!r) throw new Error(`appointment ${id} not found`);
    return r;
  }

  /** Audit actions written for the tenant since the booking, oldest first. */
  async function auditActions(): Promise<string[]> {
    return (
      await rows(raw`select action from audit_log where tenant_id = ${tenantId} order by created_at, action`)
    ).map((r) => String(r.action));
  }

  async function appointmentAudits(id: string): Promise<Row[]> {
    return rows(raw`select action, metadata, actor_user_id::text as actor_user_id
      from audit_log
      where tenant_id = ${tenantId} and entity_type = 'appointment' and entity_id = ${id}
      order by created_at`);
  }

  async function team(patientId: string): Promise<string[]> {
    return (
      await rows(raw`select user_id::text as user_id from patient_care_team
        where tenant_id = ${tenantId} and patient_id = ${patientId} and removed_at is null`)
    ).map((r) => String(r.user_id));
  }

  /** The change the ficha's field makes: the row as the list reads it, the new Terapeuta. */
  async function changeTherapist(patientId: string, appointmentId: string, to: string) {
    const listed = (await data.listPatientAppointments(ctx, patientId)).find((a) => a.id === appointmentId);
    if (!listed) throw new Error("the ficha's list does not show the appointment");
    return actions.rescheduleAppointment(appointmentId, change.therapistChangeInput(listed, to));
  }

  /** The state a refusal must leave alone, read together. */
  async function snapshot(patientId: string, appointmentId: string) {
    return {
      row: await stored(appointmentId),
      audits: await auditActions(),
      team: (await team(patientId)).sort(),
    };
  }

  // ------------------------------------------------------------------- G2
  it("G2: a therapist who does NOT WORK that hour is refused with the agenda's code and their hours; nothing changes", async () => {
    const p = await patient("Paciente Um");
    const id = await book({ patientId: p, practitionerId: tFirst, start: at(WED, 15) });
    h.enqueueRemindersAfterCommit.mockClear();
    const before = await snapshot(p, id);
    expect(before.row.practitioner_id).toBe(tFirst);

    const r = await changeTherapist(p, id, tMornings);
    expect(r).toEqual({
      ok: false,
      error: "outside_availability",
      availabilityWindows: [{ startTime: "09:00", endTime: "13:00" }],
    });

    expect(await snapshot(p, id)).toEqual(before);
    expect(h.enqueueRemindersAfterCommit).not.toHaveBeenCalled();
  });

  it("G2 control: the SAME therapist inside their hours is accepted, so the refusal is the hour", async () => {
    const p = await patient("Paciente Um");
    const id = await book({ patientId: p, practitionerId: tFirst, start: at(WED, 10) });
    expect(await changeTherapist(p, id, tMornings)).toEqual({ ok: true, data: { id } });
    expect((await stored(id)).practitioner_id).toBe(tMornings);
  });

  it("G2: a therapist with a CONFLICT is refused with the agenda's code, listing the booking in the way; nothing changes", async () => {
    const p = await patient("Paciente Um");
    const other = await patient("Paciente Dois");
    const inTheWay = await book({ patientId: other, practitionerId: tBusy, start: at(WED, 15) });
    const id = await book({ patientId: p, practitionerId: tFirst, start: at(WED, 15) });
    h.enqueueRemindersAfterCommit.mockClear();
    const before = await snapshot(p, id);

    const r = await changeTherapist(p, id, tBusy);
    expect(r).toMatchObject({ ok: false, error: "conflict" });
    if (r.ok) return;
    expect(r.conflicts).toHaveLength(1);
    expect(r.conflicts![0]).toMatchObject({ kind: "therapist", id: inTheWay });

    expect(await snapshot(p, id)).toEqual(before);
    expect((await stored(inTheWay)).practitioner_id).toBe(tBusy);
    expect(h.enqueueRemindersAfterCommit).not.toHaveBeenCalled();
  });

  it("G2 control: the same therapist an hour later, when they are free, is accepted", async () => {
    const p = await patient("Paciente Um");
    const other = await patient("Paciente Dois");
    await book({ patientId: other, practitionerId: tBusy, start: at(WED, 15) });
    const id = await book({ patientId: p, practitionerId: tFirst, start: at(WED, 16) });
    expect(await changeTherapist(p, id, tBusy)).toEqual({ ok: true, data: { id } });
  });

  // ------------------------------------------------------------------- G3
  it("G3: on a PACOTE appointment the link and the balance are unchanged, one appointment audit row, the new therapist on the care team, one reminder event at the same start", async () => {
    const p = await patient("Paciente Pacote");
    const id = await book({ patientId: p, practitionerId: tFirst, start: at(WED, 15), packId });
    h.enqueueRemindersAfterCommit.mockClear();

    // THE COMPARANDS ARE REAL BEFORE THEY ARE COMPARED: the appointment draws a
    // session, and the pacote reads 4 of 5 because of it.
    const rowBefore = await stored(id);
    expect(rowBefore.pack_instance_id).toEqual(expect.any(String));
    const balanceBefore = await packs.listPatientPackInstances(ctx, p);
    expect(balanceBefore).toHaveLength(1);
    expect(balanceBefore[0]).toMatchObject({
      id: rowBefore.pack_instance_id,
      sessionsTotal: 5,
      sessionsAvailable: 4,
      sessionsConsumed: 1,
    });
    const auditsBefore = await auditActions();
    expect(await team(p)).toEqual([tFirst]);

    const r = await changeTherapist(p, id, tFree);
    expect(r).toEqual({ ok: true, data: { id } });

    // The appointment: the therapist moved, and nothing else did.
    expect(await stored(id)).toEqual({ ...rowBefore, practitioner_id: tFree });
    // The pacote: same link (above), same balance, field for field.
    expect(await packs.listPatientPackInstances(ctx, p)).toEqual(balanceBefore);

    // EXACTLY ONE appointment audit row for the change...
    const audits = await appointmentAudits(id);
    expect(audits.map((a) => a.action)).toEqual(["appointment.create", "appointment.reschedule"]);
    expect(audits[1]).toMatchObject({
      actor_user_id: reception,
      metadata: {
        practitionerId: tFree,
        locationId: loc,
        startsAt: at(WED, 15).toISOString(),
        endsAt: endOf(at(WED, 15)).toISOString(),
        scope: "one",
        allowConflict: false,
      },
    });
    // ...and, said plainly, one more row in the log that is NOT an appointment
    // row: the care team's own record of the therapist it gained (CARE-02c).
    expect((await auditActions()).slice(auditsBefore.length).sort()).toEqual([
      "appointment.reschedule",
      "care_team.auto_assign",
    ]);

    // The care team holds the new therapist, once, beside the first.
    expect((await team(p)).sort()).toEqual([tFirst, tFree].sort());

    // One reminder event asked for, at the start the appointment already had.
    expect(h.enqueueRemindersAfterCommit).toHaveBeenCalledTimes(1);
    expect(h.enqueueRemindersAfterCommit).toHaveBeenCalledWith(tenantId, [
      { appointmentId: id, startsAt: at(WED, 15) },
    ]);
  });

  it("G3: a SECOND appointment moved to a therapist already on the team writes one audit row and no second care-team row", async () => {
    const p = await patient("Paciente Pacote");
    const first = await book({ patientId: p, practitionerId: tFirst, start: at(WED, 15), packId });
    const second = await book({ patientId: p, practitionerId: tFirst, start: at(WED + 7, 15), packId });
    expect(await changeTherapist(p, first, tFree)).toMatchObject({ ok: true });
    const balance = await packs.listPatientPackInstances(ctx, p);
    expect(balance[0]).toMatchObject({ sessionsAvailable: 3, sessionsConsumed: 2 });
    const auditsBefore = await auditActions();
    h.enqueueRemindersAfterCommit.mockClear();

    expect(await changeTherapist(p, second, tFree)).toEqual({ ok: true, data: { id: second } });

    expect((await auditActions()).slice(auditsBefore.length)).toEqual(["appointment.reschedule"]);
    expect((await team(p)).sort()).toEqual([tFirst, tFree].sort());
    expect(await packs.listPatientPackInstances(ctx, p)).toEqual(balance);
    expect(h.enqueueRemindersAfterCommit).toHaveBeenCalledTimes(1);
  });

  it("the list the ficha reads shows the new therapist on the row afterwards", async () => {
    const p = await patient("Paciente Um");
    const id = await book({ patientId: p, practitionerId: tFirst, start: at(WED, 15) });
    expect(await changeTherapist(p, id, tFree)).toMatchObject({ ok: true });
    const listed = (await data.listPatientAppointments(ctx, p)).find((a) => a.id === id);
    expect(listed).toMatchObject({ practitionerId: tFree, practitionerName: "Terapeuta Livre" });
  });
});
