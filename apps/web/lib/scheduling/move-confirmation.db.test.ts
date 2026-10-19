/**
 * move-confirmation.db.test.ts - Q-K against a real database: what each staff
 * save of a CONFIRMED PORTAL appointment asks the confirmation to do.
 *
 * The decision is made inside `rescheduleAppointment`, from the row as it was
 * BEFORE the write (`moveConfirmation`, ./move-confirmation.ts). A fake
 * transaction can serve any "before" it likes; this suite proves the real
 * action reads the real row, under the real policies, as reception, and hands
 * the enqueue the right field for each kind of save:
 *
 *   a new start                          no field: today's confirmation (rule 1)
 *   a new Terapeuta at the same start    "therapist_only" (rule 2)
 *   Cancelada back to Confirmada         no field: today's send (rule 3)
 *   the same start and the same Terapeuta "none": an identical re-save
 *   a new start after a new Terapeuta    no field: it still notifies
 *
 * runScoped is REAL. Only the request context, the client IP and the reminder
 * send are mocked; the send is a spy. What the event then does (the key, the
 * channels) is driven end to end in
 * lib/reminders/confirmation-resend-rule.test.ts.
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

d("Q-K: what a staff save of a confirmed portal appointment asks of its confirmation", () => {
  let sql: Awaited<ReturnType<typeof import("@osteojp/db").getDbAdmin>>;
  let actions: typeof import("./actions");

  let tenantId: string;
  let loc: string;
  let locTwo: string;
  let serviceId: string;
  let reception: string;
  let tAna: string;
  let tRui: string;
  let patientId: string;

  /** Wednesdays well ahead, before the 2027 DST change, so UTC equals Lisbon. */
  const at = (day: number, hour: number) => new Date(Date.UTC(2027, 2, day, hour, 0, 0)); // March 2027
  const WED = 10;
  const MINUTES = 60;
  const endOf = (start: Date, minutes = MINUTES) => new Date(start.getTime() + minutes * 60_000);

  beforeAll(async () => {
    const { getDbAdmin } = await import("@osteojp/db");
    sql = getDbAdmin();
    actions = await import("./actions");

    tenantId = randomUUID();
    await sql.execute(raw`insert into tenants (id, name, slug)
      values (${tenantId}, 'QK Confirmation Co', ${"qk-" + tenantId.slice(0, 8)})`);

    reception = randomUUID();
    tAna = randomUUID();
    tRui = randomUUID();
    const person = async (id: string, name: string, bookable: boolean) =>
      sql.execute(raw`insert into users (id, tenant_id, email, full_name, is_active, is_bookable)
        values (${id}, ${tenantId}, ${"u-" + id.slice(0, 8) + "@t.test"}, ${name}, true, ${bookable})`);
    await person(reception, "Rececao Teste", false);
    await person(tAna, "Terapeuta Um", true);
    await person(tRui, "Terapeuta Dois", true);

    loc = randomUUID();
    locTwo = randomUUID();
    await sql.execute(raw`insert into locations (id, tenant_id, name) values (${loc}, ${tenantId}, 'Clinica Teste')`);
    await sql.execute(raw`insert into locations (id, tenant_id, name) values (${locTwo}, ${tenantId}, 'Clinica Dois')`);
    for (const u of [reception, tAna, tRui]) {
      for (const l of [loc, locTwo]) {
        await sql.execute(raw`insert into staff_locations (tenant_id, user_id, location_id) values (${tenantId}, ${u}, ${l})`);
      }
    }
    serviceId = randomUUID();
    await sql.execute(raw`insert into services (id, tenant_id, name) values (${serviceId}, ${tenantId}, 'Osteopatia')`);

    patientId = randomUUID();
    await sql.execute(raw`insert into patients (id, tenant_id, full_name, primary_location_id)
      values (${patientId}, ${tenantId}, 'Paciente Teste', ${loc})`);

    h.requireRequestContext.mockResolvedValue({ tenantId, role: "reception", userId: reception });
  });

  const clean = async () => {
    await sql.execute(raw`delete from staff_notifications where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from audit_log where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from patient_care_team where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from appointments where tenant_id = ${tenantId}`);
  };

  afterEach(async () => {
    h.enqueueRemindersAfterCommit.mockClear();
    await clean();
  });

  afterAll(async () => {
    if (!sql) return;
    await clean();
    await sql.execute(raw`delete from patients where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from staff_locations where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from services where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from locations where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from users where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from tenants where id = ${tenantId}`);
  });

  /** A portal booking, already accepted: the row of the finding. */
  async function portalRow(args: { status?: string; start?: Date } = {}): Promise<string> {
    const id = randomUUID();
    const start = args.start ?? at(WED, 15);
    await sql.execute(raw`insert into appointments
        (id, tenant_id, patient_id, practitioner_id, location_id, service_id, starts_at, ends_at,
         status, origin, created_by)
      values (${id}, ${tenantId}, ${patientId}, ${tAna}, ${loc}, ${serviceId},
              ${start.toISOString()}::timestamptz, ${endOf(start).toISOString()}::timestamptz,
              ${args.status ?? "confirmed"}::appointment_status, 'patient_portal', ${reception})`);
    return id;
  }

  /** The agenda's edit panel: the row's own values unless the save changes them. */
  async function save(
    id: string,
    change: { start?: Date; practitionerId?: string; minutes?: number; locationId?: string } = {},
  ) {
    const [row] = (await sql.execute(raw`select starts_at, practitioner_id::text as practitioner_id,
        location_id::text as location_id from appointments where id = ${id}`)) as unknown as {
      starts_at: string | Date;
      practitioner_id: string;
      location_id: string;
    }[];
    const start = change.start ?? new Date(row!.starts_at);
    const r = await actions.rescheduleAppointment(id, {
      startsAt: start.toISOString(),
      endsAt: endOf(start, change.minutes ?? MINUTES).toISOString(),
      practitionerId: change.practitionerId ?? row!.practitioner_id,
      locationId: change.locationId ?? row!.location_id,
    });
    expect(r).toEqual({ ok: true, data: { id } });
  }

  /** The targets the LAST enqueue call was handed. */
  const lastTargets = () => {
    const calls = h.enqueueRemindersAfterCommit.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    return calls[calls.length - 1]![1];
  };

  it("rule 1: a new START carries no field, so today's confirmation goes", async () => {
    const id = await portalRow();
    await save(id, { start: at(WED, 16) });
    expect(lastTargets()).toEqual([{ appointmentId: id, startsAt: at(WED, 16), practitionerId: tAna }]);
  });

  it("rule 1: a new start AND a new therapist in one save is a start change", async () => {
    const id = await portalRow();
    await save(id, { start: at(WED, 16), practitionerId: tRui });
    expect(lastTargets()).toEqual([{ appointmentId: id, startsAt: at(WED, 16), practitionerId: tRui }]);
  });

  it("rule 2: a new TERAPEUTA at the same start is therapist_only, with the new therapist", async () => {
    const id = await portalRow();
    await save(id, { practitionerId: tRui });
    expect(lastTargets()).toEqual([
      { appointmentId: id, startsAt: at(WED, 15), practitionerId: tRui, confirmation: "therapist_only" },
    ]);
  });

  it("rule 3: Cancelada back to Confirmada carries no field, so today's send goes", async () => {
    const id = await portalRow({ status: "cancelled" });
    expect((await actions.updateAppointment(id, { status: "confirmed" })).ok).toBe(true);
    expect(lastTargets()).toEqual([{ appointmentId: id, startsAt: at(WED, 15), practitionerId: tAna }]);
  });

  it("an IDENTICAL re-save is none: the event still goes for the reminders, the confirmation does not", async () => {
    const id = await portalRow();
    await save(id);
    expect(lastTargets()).toEqual([
      { appointmentId: id, startsAt: at(WED, 15), practitionerId: tAna, confirmation: "none" },
    ]);
  });

  it("a save that changes only the DURATION or only the CLINIC is none too", async () => {
    const id = await portalRow();
    await save(id, { minutes: 45 });
    expect(lastTargets()).toEqual([
      { appointmentId: id, startsAt: at(WED, 15), practitionerId: tAna, confirmation: "none" },
    ]);
    await save(id, { locationId: locTwo });
    expect(lastTargets()).toEqual([
      { appointmentId: id, startsAt: at(WED, 15), practitionerId: tAna, confirmation: "none" },
    ]);
  });

  it("a new START after a new Terapeuta still notifies: the second save reads the row the first one wrote", async () => {
    const id = await portalRow();
    await save(id, { practitionerId: tRui });
    expect(lastTargets()).toEqual([
      { appointmentId: id, startsAt: at(WED, 15), practitionerId: tRui, confirmation: "therapist_only" },
    ]);
    await save(id, { start: at(WED, 17) });
    expect(lastTargets()).toEqual([{ appointmentId: id, startsAt: at(WED, 17), practitionerId: tRui }]);
    // And saving that state again owes nothing.
    await save(id);
    expect(lastTargets()).toEqual([
      { appointmentId: id, startsAt: at(WED, 17), practitionerId: tRui, confirmation: "none" },
    ]);
  });
});
