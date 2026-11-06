/**
 * dispatch-run-refusal-leaves-claim-and-ledger.db.test.ts, against a REAL
 * Postgres, as the reminder job.
 *
 * WHAT IT PROVES. On the sleeping job's path (taker `run`, the sweep's send
 * switch off), a 48h email that the plan refuses still leaves TWO rows behind:
 *
 *   - one claim in `reminder_claims`, kind `claim`, taker `run`, for the
 *     visit's start, and no release;
 *   - one row in `reminder_dispatches`, outcome `suppressed`, template
 *     `reminder.48h.email`, with the refusal's own reason.
 *
 * Two refusals, each read from the patient row by the REAL load
 * (`loadReminderData`, under the job's tenant context and RLS), not from a
 * fixture handed to the dispatcher:
 *
 *   no_contact     the patient has neither an email nor a phone.
 *   channels_off   the patient has an email and email reminders switched off.
 *
 * THE CONTROL: a third patient with an email and email reminders on. The same
 * call reaches the (replaced) transport, and leaves one claim and one `sent`
 * row. So the refusals above are the plan's, and the readers below can see a
 * row when there is one.
 *
 * WHY IT MATTERS. A reminder that has NEITHER a claim NOR a ledger row did not
 * end at any of these gates: on this path every gate after the load writes
 * both. This file pins that half of the reasoning.
 *
 * Only the two transports are replaced; nothing here can reach a provider
 * whatever the environment says. Live send and the sweep's switch are unset
 * for every arm.
 *
 * Its own tenant, built here and removed afterwards. Every name is invented.
 *
 * Skipped without DATABASE_URL.
 */
import { randomUUID } from "node:crypto";
import { sql as raw } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { addDays, lisbonDateTimeToUtc, todayInLisbon } from "../scheduling/time";

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  /** Every hand-over to a (replaced) transport, in order. */
  sends: [] as string[],
  sendCount: 0,
}));

vi.mock("./clients", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./clients")>();
  const transport = (channel: "sms" | "email") =>
    vi.fn(async () => {
      h.sends.push(channel);
      h.sendCount += 1;
      // The ledger holds provider ids under a unique index: one per send.
      return { channel, sandbox: false, id: `test-${process.pid}-${Date.now()}-${h.sendCount}` };
    });
  return { ...actual, sendSms: transport("sms"), sendEmail: transport("email") };
});

const live = Boolean(process.env.DATABASE_URL);
const d = live ? describe : describe.skip;

d("a refusal on the sleeping path leaves a claim of taker run AND a suppressed ledger row", () => {
  let sql: Awaited<ReturnType<typeof import("@osteojp/db").getDbAdmin>>;
  const tenantId = randomUUID();
  const therapistId = randomUUID();
  const locationId = randomUUID();
  /**
   * Yesterday at pinned hours, one per arm: the marks are long past, so a claim
   * taken now is NOT early, and no two visits of the therapist overlap. With
   * the send switch off the dispatcher reads no clock to refuse.
   */
  const day = addDays(todayInLisbon(), -1);
  const arms = {
    noContact: { patient: randomUUID(), appointment: randomUUID(), start: lisbonDateTimeToUtc(day, "09:00") },
    emailOff: { patient: randomUUID(), appointment: randomUUID(), start: lisbonDateTimeToUtc(day, "11:00") },
    control: { patient: randomUUID(), appointment: randomUUID(), start: lisbonDateTimeToUtc(day, "13:00") },
  };

  const ENV_KEYS = [
    "REMINDERS_LIVE_SEND",
    "REMINDERS_SWEEP_MODE",
    "REMINDERS_LINK_SECRET",
    "REMINDERS_RESCHEDULE_BASE_URL",
    "REMINDERS_CONFIRM_LINK_ENABLED",
  ];
  const savedEnv: Record<string, string | undefined> = {};

  type Row = Record<string, unknown>;
  async function rows(q: Parameters<typeof sql.execute>[0]): Promise<Row[]> {
    const r = (await sql.execute(q)) as unknown;
    return (Array.isArray(r) ? r : ((r as { rows?: unknown[] }).rows ?? [])) as Row[];
  }

  async function claimsOf(appointmentId: string): Promise<Row[]> {
    return rows(raw`select kind, offset_id, channel, taker, early,
        to_char(starts_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as starts_at
      from reminder_claims
      where appointment_id = ${appointmentId}
      order by created_at, id`);
  }

  async function ledgerOf(appointmentId: string): Promise<Row[]> {
    return rows(raw`select channel, template_id, outcome, suppression_reason
      from reminder_dispatches where appointment_id = ${appointmentId} order by created_at, id`);
  }

  const claimOfRun = (start: Date) => ({
    kind: "claim",
    offset_id: "48h",
    channel: "email",
    taker: "run",
    early: false,
    starts_at: start.toISOString(),
  });

  beforeAll(async () => {
    const { getDbAdmin } = await import("@osteojp/db");
    sql = getDbAdmin();
    await sql.execute(raw`insert into tenants (id, name, slug, settings)
      values (${tenantId}, 'Refusal Rows Co', ${"rrows-" + tenantId.slice(0, 8)},
              ${JSON.stringify({ locale: "pt", contacts: { phone: "+351 210 000 000" } })}::jsonb)`);
    await sql.execute(raw`insert into users (id, tenant_id, email, full_name, is_active, is_bookable)
      values (${therapistId}, ${tenantId}, ${"t-" + therapistId.slice(0, 8) + "@t.test"}, 'Dra Inventada', true, true)`);
    await sql.execute(raw`insert into locations (id, tenant_id, name, phone)
      values (${locationId}, ${tenantId}, 'Sede', '+351 210 000 000')`);

    // Neither an email nor a phone.
    await sql.execute(raw`insert into patients (id, tenant_id, full_name, email, phone, reminder_email_enabled)
      values (${arms.noContact.patient}, ${tenantId}, 'Paciente Sem Contacto', null, null, true)`);
    // An email, and email reminders switched off.
    await sql.execute(raw`insert into patients (id, tenant_id, full_name, email, phone, reminder_email_enabled)
      values (${arms.emailOff.patient}, ${tenantId}, 'Paciente Email Off', 'email.off@example.invalid', '912345678', false)`);
    // The control: an email, and email reminders on.
    await sql.execute(raw`insert into patients (id, tenant_id, full_name, email, phone, reminder_email_enabled)
      values (${arms.control.patient}, ${tenantId}, 'Paciente Controlo', 'controlo@example.invalid', '912345679', true)`);

    for (const a of Object.values(arms)) {
      await sql.execute(raw`insert into appointments
        (id, tenant_id, patient_id, practitioner_id, location_id, starts_at, ends_at, status, origin)
        values (${a.appointment}, ${tenantId}, ${a.patient}, ${therapistId}, ${locationId},
                ${a.start.toISOString()}, ${new Date(a.start.getTime() + 45 * 60_000).toISOString()}, 'confirmed', 'staff')`);
    }
  });

  afterAll(async () => {
    if (!sql) return;
    await sql.execute(raw`delete from audit_log where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from reminder_claims where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from reminder_dispatches where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from appointments where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from patients where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from locations where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from users where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from tenants where id = ${tenantId}`);
  });

  beforeEach(() => {
    for (const k of ENV_KEYS) {
      savedEnv[k] = process.env[k];
      delete process.env[k];
    }
    process.env.REMINDERS_LINK_SECRET = "test-only-link-secret-not-prod";
    process.env.REMINDERS_RESCHEDULE_BASE_URL = "https://app.invalid";
    h.sends.length = 0;
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
    vi.restoreAllMocks();
  });

  it("precondition: the sweep is not the sender, and the real load reads each patient as seeded", async () => {
    const { sweepSends } = await import("./sweep-mode");
    expect(sweepSends()).toBe(false);
    const { loadReminderData } = await import("./data");
    expect(await loadReminderData(tenantId, arms.noContact.appointment)).toMatchObject({
      patientEmail: null,
      patientPhone: null,
    });
    expect(await loadReminderData(tenantId, arms.emailOff.appointment)).toMatchObject({
      patientEmail: "email.off@example.invalid",
      patientReminderEmailEnabled: false,
    });
    expect(await loadReminderData(tenantId, arms.control.appointment)).toMatchObject({
      patientEmail: "controlo@example.invalid",
      patientReminderEmailEnabled: true,
    });
  });

  it("no_contact: a claim of taker run, no release, and one suppressed row with reason no_contact", async () => {
    const { dispatchReminder } = await import("./dispatch");
    const a = arms.noContact;
    expect(await dispatchReminder(tenantId, a.appointment, "48h", "email")).toEqual({
      dispatched: false,
      reason: "no_contact",
    });
    expect(await claimsOf(a.appointment)).toEqual([claimOfRun(a.start)]);
    expect(await ledgerOf(a.appointment)).toEqual([
      { channel: "email", template_id: "reminder.48h.email", outcome: "suppressed", suppression_reason: "no_contact" },
    ]);
    expect(h.sends).toEqual([]);
  });

  it("channels_off: a claim of taker run, no release, and one suppressed row with reason channels_off", async () => {
    const { dispatchReminder } = await import("./dispatch");
    const a = arms.emailOff;
    expect(await dispatchReminder(tenantId, a.appointment, "48h", "email")).toEqual({
      dispatched: false,
      reason: "channels_off",
    });
    expect(await claimsOf(a.appointment)).toEqual([claimOfRun(a.start)]);
    expect(await ledgerOf(a.appointment)).toEqual([
      { channel: "email", template_id: "reminder.48h.email", outcome: "suppressed", suppression_reason: "channels_off" },
    ]);
    expect(h.sends).toEqual([]);
  });

  it("CONTROL: email reminders on, the same call reaches the transport and leaves a claim of taker run and a sent row", async () => {
    const { dispatchReminder } = await import("./dispatch");
    const a = arms.control;
    expect(await dispatchReminder(tenantId, a.appointment, "48h", "email")).toMatchObject({ dispatched: true });
    expect(h.sends).toEqual(["email"]);
    expect(await claimsOf(a.appointment)).toEqual([claimOfRun(a.start)]);
    expect(await ledgerOf(a.appointment)).toEqual([
      { channel: "email", template_id: "reminder.48h.email", outcome: "sent", suppression_reason: null },
    ]);
  });
});
