/**
 * care-team-booking.db.test.ts - CARE-02c against a real database.
 *
 * The owner's check: a booking puts its therapist on the patient's care team at
 * every staff insert site and on a reschedule to a new Terapeuta; first time
 * only (no second row, no second notification); the notification goes through
 * staff_notifications (0055); the panel tells automatic from manual and offers
 * Remover on manual entries only.
 *
 * runScoped is REAL, so `patient_care_team`'s RLS (0091), appointments_rls and
 * the audit_log policies run as on production, and the INSERT's ON CONFLICT
 * target is resolved against 0091's actual partial index. Only the request
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

d("CARE-02c: booking a therapist puts them on the care team, once, with a notice", () => {
  let sql: Awaited<ReturnType<typeof import("@osteojp/db").getDbAdmin>>;
  let actions: typeof import("./actions");
  let careTeam: typeof import("@/lib/admin/care-team");

  let tenantId: string;
  let loc: string;
  let serviceId: string;
  let reception: string;
  let owner: string;
  let t1: string;
  let t2: string;
  let t3: string;
  let tBatch: string;
  let nesa: string;

  /** Wednesdays well ahead, before the 2027 DST change, so UTC equals Lisbon. */
  const at = (day: number, hour: number) =>
    new Date(Date.UTC(2027, 2, day, hour, 0, 0)); // March 2027
  const WED = 10;

  type Ctx = { tenantId: string; role: "reception" | "therapist" | "owner"; userId: string };
  const as = (role: Ctx["role"], userId: string): Ctx => {
    const ctx = { tenantId, role, userId };
    h.requireRequestContext.mockResolvedValue(ctx);
    return ctx;
  };

  beforeAll(async () => {
    const { getDbAdmin } = await import("@osteojp/db");
    sql = getDbAdmin();
    actions = await import("./actions");
    careTeam = await import("@/lib/admin/care-team");

    tenantId = randomUUID();
    await sql.execute(raw`insert into tenants (id, name, slug)
      values (${tenantId}, 'Care Team Booking Co', ${"care02c-" + tenantId.slice(0, 8)})`);

    reception = randomUUID();
    owner = randomUUID();
    t1 = randomUUID();
    t2 = randomUUID();
    t3 = randomUUID();
    tBatch = randomUUID();
    nesa = randomUUID();
    const person = async (id: string, name: string, bookable: boolean) =>
      sql.execute(raw`insert into users (id, tenant_id, email, full_name, is_active, is_bookable)
        values (${id}, ${tenantId}, ${"u-" + id.slice(0, 8) + "@t.test"}, ${name}, true, ${bookable})`);
    await person(reception, "Rececao Teste", false);
    await person(owner, "Dono Teste", true);
    await person(t1, "Terapeuta Um", true);
    await person(t2, "Terapeuta Dois", true);
    await person(t3, "Terapeuta Tres", true);
    await person(tBatch, "Terapeuta Lote", true);
    await sql.execute(raw`insert into users (id, tenant_id, email, full_name, is_active, is_bookable, is_shared_resource)
      values (${nesa}, ${tenantId}, ${"nesa-" + nesa.slice(0, 8) + "@t.test"}, 'NESA', true, false, true)`);

    loc = randomUUID();
    await sql.execute(raw`insert into locations (id, tenant_id, name) values (${loc}, ${tenantId}, 'Clinica Teste')`);
    for (const u of [reception, owner, t1, t2, t3, tBatch, nesa]) {
      await sql.execute(raw`insert into staff_locations (tenant_id, user_id, location_id) values (${tenantId}, ${u}, ${loc})`);
    }
    // Agendar lote books only inside the therapist's declared hours, so the
    // batch therapist has a Wednesday (weekday 3) window. Nobody else does,
    // which leaves every other booking "unconfigured" and therefore allowed.
    await sql.execute(raw`insert into availability_templates (tenant_id, user_id, location_id, weekday, start_time, end_time)
      values (${tenantId}, ${tBatch}, ${loc}, 3, '08:00', '20:00')`);

    serviceId = randomUUID();
    await sql.execute(raw`insert into services (id, tenant_id, name) values (${serviceId}, ${tenantId}, 'Osteopatia')`);
  });

  const clean = async () => {
    await sql.execute(raw`delete from staff_notifications where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from audit_log where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from patient_care_team where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from appointment_notes where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from appointments where tenant_id = ${tenantId}`);
  };

  afterEach(async () => {
    h.enqueueRemindersAfterCommit.mockClear();
    await clean();
    await sql.execute(raw`delete from patients where tenant_id = ${tenantId}`);
  });

  afterAll(async () => {
    if (!sql) return;
    await clean();
    await sql.execute(raw`delete from patients where tenant_id = ${tenantId}`);
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

  /**
   * A patient whose primary clinic is the test clinic, so reception's
   * location-scoped patient read (viewer_visible_patient_ids) sees them before
   * they have any appointment. The second-participant check reads it.
   */
  async function patient(name: string): Promise<string> {
    const id = randomUUID();
    await sql.execute(raw`insert into patients (id, tenant_id, full_name, primary_location_id)
      values (${id}, ${tenantId}, ${name}, ${loc})`);
    return id;
  }

  /** Live care-team rows for one patient, with the fields the checks read. */
  async function team(patientId: string) {
    return rows(raw`select id::text as id, user_id::text as user_id, assigned_by::text as assigned_by
      from patient_care_team
      where tenant_id = ${tenantId} and patient_id = ${patientId} and removed_at is null
      order by assigned_at, user_id`);
  }

  async function autoAudits(): Promise<Row[]> {
    return rows(raw`select entity_id::text as entity_id, metadata
      from audit_log
      where tenant_id = ${tenantId} and action = 'care_team.auto_assign'`);
  }

  async function notices(recipient: string): Promise<Row[]> {
    return rows(raw`select kind, appointment_id::text as appointment_id, patient_id::text as patient_id,
        actor_user_id::text as actor_user_id
      from staff_notifications
      where tenant_id = ${tenantId} and recipient_user_id = ${recipient}`);
  }

  function book(args: {
    patientId: string;
    practitionerId: string;
    start: Date;
    practitionerTwoId?: string | null;
    patientTwoId?: string | null;
    recurrence?: { freq: "weekly"; count: number } | null;
  }) {
    return actions.createAppointment({
      patientId: args.patientId,
      practitionerId: args.practitionerId,
      practitionerTwoId: args.practitionerTwoId ?? null,
      patientTwoId: args.patientTwoId ?? null,
      locationId: loc,
      serviceId,
      room: null,
      startsAt: args.start.toISOString(),
      endsAt: new Date(args.start.getTime() + 45 * 60_000).toISOString(),
      notes: null,
      allowConflict: true,
      recurrence: args.recurrence ?? null,
    });
  }

  // ------------------------------------------------------------- the check
  it("RECEPTION BOOKS: one live row, stamped with who booked, audited as automatic, one notice to the therapist", async () => {
    const pA = await patient("Paciente A");
    as("reception", reception);
    const r = await book({ patientId: pA, practitionerId: t1, start: at(WED, 10) });
    expect(r).toMatchObject({ ok: true });
    if (!r.ok) return;

    const rowsA = await team(pA);
    expect(rowsA).toEqual([{ id: expect.any(String), user_id: t1, assigned_by: reception }]);

    const audits = await autoAudits();
    expect(audits).toHaveLength(1);
    expect(audits[0]!.entity_id).toBe(rowsA[0]!.id);
    expect(audits[0]!.metadata).toEqual({ patientId: pA, therapistId: t1, appointmentId: r.data.id });

    expect(await notices(t1)).toEqual([
      { kind: "booked", appointment_id: r.data.id, patient_id: pA, actor_user_id: reception },
    ]);
  });

  it("A SECOND BOOKING of the same pair writes NO second row, NO second audit and NO second notice", async () => {
    const pA = await patient("Paciente A");
    as("reception", reception);
    expect(await book({ patientId: pA, practitionerId: t1, start: at(WED, 10) })).toMatchObject({ ok: true });
    expect(await book({ patientId: pA, practitionerId: t1, start: at(WED + 7, 10) })).toMatchObject({ ok: true });

    expect(await team(pA)).toHaveLength(1);
    expect(await autoAudits()).toHaveLength(1);
    expect(await notices(t1)).toHaveLength(1);
  });

  it("A RESCHEDULE TO A NEW TERAPEUTA adds that therapist once and tells them; the first stays", async () => {
    const pA = await patient("Paciente A");
    as("reception", reception);
    const first = await book({ patientId: pA, practitionerId: t1, start: at(WED, 10) });
    expect(first).toMatchObject({ ok: true });
    if (!first.ok) return;

    const moved = await actions.rescheduleAppointment(first.data.id, {
      startsAt: at(WED, 14).toISOString(),
      endsAt: new Date(at(WED, 14).getTime() + 45 * 60_000).toISOString(),
      practitionerId: t2,
      locationId: loc,
      allowConflict: true,
      scope: "one",
    });
    expect(moved).toMatchObject({ ok: true });

    expect((await team(pA)).map((m) => m.user_id).sort()).toEqual([t1, t2].sort());
    const toT2 = await notices(t2);
    expect(toT2).toEqual([
      { kind: "booked", appointment_id: first.data.id, patient_id: pA, actor_user_id: reception },
    ]);
  });

  it("a reschedule that only moves the TIME adds nobody and notifies nobody new", async () => {
    const pA = await patient("Paciente A");
    as("reception", reception);
    const first = await book({ patientId: pA, practitionerId: t1, start: at(WED, 10) });
    if (!first.ok) throw new Error("setup booking failed");
    // A row that predates CARE-02c: the therapist is NOT on the team.
    await sql.execute(raw`delete from patient_care_team where tenant_id = ${tenantId}`);

    const moved = await actions.rescheduleAppointment(first.data.id, {
      startsAt: at(WED, 15).toISOString(),
      endsAt: new Date(at(WED, 15).getTime() + 45 * 60_000).toISOString(),
      practitionerId: t1,
      locationId: loc,
      allowConflict: true,
      scope: "one",
    });
    expect(moved).toMatchObject({ ok: true });
    expect(await team(pA)).toEqual([]);
  });

  it("A THERAPIST'S OWN BOOKING still books, and writes no care-team row (0091's insert policy refuses them)", async () => {
    const pB = await patient("Paciente B");
    as("therapist", t3);
    const r = await book({ patientId: pB, practitionerId: t3, start: at(WED, 11) });
    expect(r).toMatchObject({ ok: true });
    expect(await team(pB)).toEqual([]);
    expect(await autoAudits()).toEqual([]);
    expect(await notices(t3)).toEqual([]);
    const [a] = await rows(raw`select count(*)::int as n from appointments where tenant_id = ${tenantId} and patient_id = ${pB}`);
    expect(a!.n).toBe(1);
  });

  it("A RECURRING SERIES is one row and one notice, naming the FIRST occurrence", async () => {
    const pC = await patient("Paciente C");
    as("reception", reception);
    const r = await book({
      patientId: pC,
      practitionerId: t1,
      start: at(WED, 9),
      recurrence: { freq: "weekly", count: 3 },
    });
    expect(r).toMatchObject({ ok: true });
    if (!r.ok) return;
    expect(await team(pC)).toHaveLength(1);
    const n = await notices(t1);
    expect(n).toHaveLength(1);
    expect(n[0]!.appointment_id).toBe(r.data.id); // the parent is the first occurrence
  });

  it("BOTH SLOTS: Terapeuta 2 joins too, a second patient gets the therapist too, NESA never joins", async () => {
    const pA = await patient("Paciente A");
    const pB = await patient("Paciente B");
    as("reception", reception);
    const withT2 = await book({ patientId: pA, practitionerId: t1, practitionerTwoId: t2, start: at(WED, 12) });
    expect(withT2).toMatchObject({ ok: true });
    expect((await team(pA)).map((m) => m.user_id).sort()).toEqual([t1, t2].sort());

    const withNesa = await book({ patientId: pB, practitionerId: t1, practitionerTwoId: nesa, start: at(WED, 13) });
    expect(withNesa).toMatchObject({ ok: true });
    expect((await team(pB)).map((m) => m.user_id)).toEqual([t1]);
  });

  it("A SHARED APPOINTMENT with two patients: the therapist joins both teams, and gets ONE notice", async () => {
    const pA = await patient("Paciente A");
    const pB = await patient("Paciente B");
    as("reception", reception);
    const r = await book({ patientId: pA, patientTwoId: pB, practitionerId: t2, start: at(WED, 16) });
    expect(r).toMatchObject({ ok: true });
    expect((await team(pA)).map((m) => m.user_id)).toEqual([t2]);
    expect((await team(pB)).map((m) => m.user_id)).toEqual([t2]);
    expect(await notices(t2)).toHaveLength(1);
  });

  it("THE OWNER BOOKING THEMSELVES joins the team and is not notified of their own click", async () => {
    const pA = await patient("Paciente A");
    as("owner", owner);
    expect(await book({ patientId: pA, practitionerId: owner, start: at(WED, 17) })).toMatchObject({ ok: true });
    expect((await team(pA)).map((m) => m.user_id)).toEqual([owner]);
    expect(await notices(owner)).toEqual([]);
  });

  it("MARCAR NOVAMENTE (clone): a therapist-booked source had no row; reception's clone adds it", async () => {
    const pD = await patient("Paciente D");
    as("therapist", t3);
    const src = await book({ patientId: pD, practitionerId: t3, start: at(WED, 8) });
    if (!src.ok) throw new Error("setup booking failed");
    expect(await team(pD)).toEqual([]);

    as("reception", reception);
    const c = await actions.cloneAppointment(src.data.id, at(WED + 7, 8).toISOString(), true);
    expect(c).toMatchObject({ ok: true });
    expect((await team(pD)).map((m) => m.user_id)).toEqual([t3]);
    expect(await notices(t3)).toHaveLength(1);
  });

  it("AGENDAR LOTE (batch): the batch's therapist joins once for the whole batch", async () => {
    const pE = await patient("Paciente E");
    as("reception", reception);
    const r = await actions.batchScheduleAppointments({
      patientId: pE,
      practitionerId: tBatch,
      locationId: loc,
      serviceId,
      slots: [
        { startsAt: at(WED, 10).toISOString(), endsAt: new Date(at(WED, 10).getTime() + 45 * 60_000).toISOString() },
        { startsAt: at(WED + 7, 10).toISOString(), endsAt: new Date(at(WED + 7, 10).getTime() + 45 * 60_000).toISOString() },
      ],
    });
    expect(r).toMatchObject({ ok: true });
    if (!r.ok) return;
    expect(r.data.booked).toHaveLength(2);
    expect((await team(pE)).map((m) => m.user_id)).toEqual([tBatch]);
    expect(await notices(tBatch)).toHaveLength(1);
  });

  // ------------------------------------------------------------- the panel
  it("THE PANEL lists manual and automatic entries with their source; Remover is refused on automatic", async () => {
    const pF = await patient("Paciente F");
    const rec = as("reception", reception);
    await careTeam.assignTherapist(rec, pF, t2); // manual
    expect(await book({ patientId: pF, practitionerId: t1, start: at(WED + 14, 16) })).toMatchObject({ ok: true }); // automatic

    const list = await careTeam.listCareTeam(rec, pF);
    const bySource = Object.fromEntries(list.map((m) => [m.userId, m.source]));
    expect(bySource).toEqual({ [t2]: "manual", [t1]: "automatic" });

    await expect(careTeam.removeTherapist(rec, pF, t1)).rejects.toMatchObject({ code: "forbidden" });
    expect((await team(pF)).map((m) => m.user_id).sort()).toEqual([t1, t2].sort());

    await careTeam.removeTherapist(rec, pF, t2);
    expect((await team(pF)).map((m) => m.user_id)).toEqual([t1]);
  });

  it("A MANUAL ENTRY ALREADY LIVE is not duplicated by a booking, stays manual, and no notice is sent", async () => {
    const pG = await patient("Paciente G");
    const rec = as("reception", reception);
    await careTeam.assignTherapist(rec, pG, t1);
    expect(await book({ patientId: pG, practitionerId: t1, start: at(WED + 14, 17) })).toMatchObject({ ok: true });
    expect(await team(pG)).toHaveLength(1);
    expect((await careTeam.listCareTeam(rec, pG)).map((m) => m.source)).toEqual(["manual"]);
    expect(await notices(t1)).toEqual([]);
  });

  /**
   * CARE-02b, MEASURED RATHER THAN ASSUMED: why the therapist's read-only card
   * is not rendered. `patient_care_team_select` (0091) admits owner and
   * reception only, so a therapist who IS on the team, reading their own
   * patient's team under their own JWT, gets zero rows. When a read path for
   * therapists lands (a policy or a SECURITY DEFINER reader, Tier C), this arm
   * is the one expected to change, and the card can then be wired.
   */
  it("CARE-02b GAP: a therapist on the team reads ZERO care-team rows under the current policy", async () => {
    const pA = await patient("Paciente A");
    as("reception", reception);
    expect(await book({ patientId: pA, practitionerId: t1, start: at(WED, 10) })).toMatchObject({ ok: true });
    expect(await team(pA)).toHaveLength(1);

    const { runScoped } = await import("@/lib/auth/context");
    const { patientCareTeam } = await import("@osteojp/db");
    const { eq } = await import("drizzle-orm");
    const seen = await runScoped({ tenantId, role: "therapist", userId: t1 }, (tx) =>
      tx.select({ id: patientCareTeam.id }).from(patientCareTeam).where(eq(patientCareTeam.patientId, pA)),
    );
    expect(seen).toEqual([]);
  });

  it("CURRENT DEFAULT: a therapist REMOVED by hand is added again, as automatic, by their next booking", async () => {
    const pH = await patient("Paciente H");
    const rec = as("reception", reception);
    await careTeam.assignTherapist(rec, pH, t1);
    await careTeam.removeTherapist(rec, pH, t1);
    expect(await team(pH)).toEqual([]);

    expect(await book({ patientId: pH, practitionerId: t1, start: at(WED + 14, 18) })).toMatchObject({ ok: true });
    expect((await careTeam.listCareTeam(rec, pH)).map((m) => [m.userId, m.source])).toEqual([
      [t1, "automatic"],
    ]);
    expect(await notices(t1)).toHaveLength(1);
  });
});
