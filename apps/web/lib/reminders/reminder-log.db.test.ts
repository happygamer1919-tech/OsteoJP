/**
 * reminder-log.db.test.ts - COMMS-01 (GATE BL-2), against a REAL Postgres.
 *
 * WHAT IT PROVES, and why each arm must be a database:
 *
 *   1. A reminder the provider REFUSES lands in reminder_dispatches as
 *      `provider_error` with the provider's code. The row is written by the real
 *      dispatch path (`sendRecordingProviderError` -> `recordDispatch`) through
 *      the reminder job's tenant context, so the INSERT policy, the outcome CHECK
 *      and the reason equivalence CHECK all run as on production.
 *   2. Reception reads that row back through `listReminderLog`, under its OWN
 *      claims, with the code - including under the Só falhas filter.
 *   3. A therapist, even the appointment's own Terapeuta, reads ZERO rows of the
 *      table under 0075's SELECT policy while the row demonstrably exists (the
 *      admin count is the negative control), and `listReminderLog` refuses them
 *      at the capability. That is why the therapist view needs a migration
 *      (docs/QUESTIONS.md > Q-COMMS-01-1).
 *
 * Only the data seam (`loadReminderData`) and the Twilio transport are
 * replaced: the transport throws the shape the Twilio SDK throws for 21211.
 *
 * Skipped without DATABASE_URL, and hard-required in assert-rls-executed.mjs so
 * a silent skip reddens the DB-gated job.
 */
import { randomUUID } from "node:crypto";
import { sql as raw } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({ loadReminderData: vi.fn() }));
vi.mock("./data", () => ({ loadReminderData: h.loadReminderData }));
vi.mock("./clients", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./clients")>();
  return {
    ...actual,
    sendSms: vi.fn(async () => {
      // The Twilio SDK's RestException carries a numeric `code`; 21211 is "the
      // 'To' number is not a valid phone number".
      throw Object.assign(new Error("provider refused"), { code: 21211 });
    }),
  };
});

const live = Boolean(process.env.DATABASE_URL);
const d = live ? describe : describe.skip;

d("COMMS-01: a provider refusal reaches Lembretes SMS, scoped", () => {
  let sql: Awaited<ReturnType<typeof import("@osteojp/db").getDbAdmin>>;
  let tenantId: string;
  let receptionId: string;
  let therapistId: string;
  let locationId: string;
  let patientId: string;
  let appointmentId: string;
  const startsAt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
  const endsAt = new Date(startsAt.getTime() + 45 * 60 * 1000);

  type Row = Record<string, unknown>;
  async function rows(q: Parameters<typeof sql.execute>[0]): Promise<Row[]> {
    const r = (await sql.execute(q)) as unknown;
    return (Array.isArray(r) ? r : ((r as { rows?: unknown[] }).rows ?? [])) as Row[];
  }

  beforeAll(async () => {
    const { getDbAdmin } = await import("@osteojp/db");
    sql = getDbAdmin();

    tenantId = randomUUID();
    await sql.execute(raw`insert into tenants (id, name, slug)
      values (${tenantId}, 'Reminder Log Co', ${"rlog-" + tenantId.slice(0, 8)})`);

    receptionId = randomUUID();
    therapistId = randomUUID();
    await sql.execute(raw`insert into users (id, tenant_id, email, full_name, is_active)
      values (${receptionId}, ${tenantId}, ${"r-" + receptionId.slice(0, 8) + "@t.test"}, 'Rececao', true)`);
    await sql.execute(raw`insert into users (id, tenant_id, email, full_name, is_active, is_bookable)
      values (${therapistId}, ${tenantId}, ${"t-" + therapistId.slice(0, 8) + "@t.test"}, 'Dra Log', true, true)`);

    locationId = randomUUID();
    await sql.execute(raw`insert into locations (id, tenant_id, name) values (${locationId}, ${tenantId}, 'Sede')`);

    patientId = randomUUID();
    await sql.execute(raw`insert into patients (id, tenant_id, full_name, phone)
      values (${patientId}, ${tenantId}, 'Paciente Log', '912345678')`);

    appointmentId = randomUUID();
    await sql.execute(raw`insert into appointments
      (id, tenant_id, patient_id, practitioner_id, location_id, starts_at, ends_at, status)
      values (${appointmentId}, ${tenantId}, ${patientId}, ${therapistId}, ${locationId},
              ${startsAt.toISOString()}, ${endsAt.toISOString()}, 'confirmed')`);

    h.loadReminderData.mockResolvedValue({
      appointmentId,
      startsAt,
      status: "confirmed",
      patientId,
      patientName: "Paciente Log",
      patientEmail: null,
      patientPhone: "912345678",
      patientReminderSmsEnabled: true,
      patientReminderEmailEnabled: false,
      patientDeletedAt: null,
      practitionerName: "Dra Log",
      locationName: "Sede",
      locationPhone: "+351 210 000 000",
      tenantSettings: { locale: "pt", contacts: { phone: "+351 210 000 000" } },
    });
    process.env.REMINDERS_LINK_SECRET ??= "test-only-link-secret-not-prod";
    process.env.REMINDERS_RESCHEDULE_BASE_URL ??= "https://osteojp.pt";
  });

  afterAll(async () => {
    if (!sql) return;
    await sql.execute(raw`delete from reminder_dispatches where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from appointments where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from patients where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from locations where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from users where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from tenants where id = ${tenantId}`);
  });

  it("the dispatch path writes provider_error with code 21211, and the run still fails", async () => {
    const { dispatchReminder } = await import("./dispatch");
    // IT RETHROWS: Inngest's retry is the delivery behaviour (dispatch.ts).
    await expect(dispatchReminder(tenantId, appointmentId, "24h", "sms")).rejects.toThrow();

    const written = await rows(raw`select outcome, provider_error_code, channel, template_id
      from reminder_dispatches where appointment_id = ${appointmentId}`);
    expect(written).toEqual([
      { outcome: "provider_error", provider_error_code: "21211", channel: "sms", template_id: "reminder.24h.sms" },
    ]);
  });

  it("reception sees it on Lembretes SMS with its code, and under Só falhas", async () => {
    const { listReminderLog } = await import("./reminder-log");
    const ctx = { tenantId, role: "reception" as const, userId: receptionId };

    for (const onlyFailures of [false, true]) {
      const page = await listReminderLog(ctx, { onlyFailures });
      expect(page.total, `onlyFailures=${onlyFailures}`).toBe(1);
      expect(page.rows[0]).toMatchObject({
        appointmentId,
        patientName: "Paciente Log",
        outcome: "provider_error",
        providerErrorCode: "21211",
        templateId: "reminder.24h.sms",
        therapistName: "Dra Log",
        locationName: "Sede",
      });
    }
  });

  it("a therapist - the appointment's own Terapeuta - reads ZERO rows while the row exists", async () => {
    const [{ n: adminCount }] = await rows(
      raw`select count(*)::int as n from reminder_dispatches where tenant_id = ${tenantId}`,
    );
    // NEGATIVE CONTROL: the row is there. Without this, zero below proves nothing.
    expect(adminCount).toBe(1);

    const { runScoped } = await import("@/lib/auth/context");
    const { count } = await import("drizzle-orm");
    const { reminderDispatches } = await import("@osteojp/db");
    const therapistCtx = { tenantId, role: "therapist" as const, userId: therapistId };

    const [seen] = await runScoped(therapistCtx, (tx) =>
      tx.select({ n: count() }).from(reminderDispatches),
    );
    expect(Number(seen?.n)).toBe(0);

    // And the page's own query refuses a therapist at the capability, before
    // any read: an empty log would read as "nothing failed".
    const { ForbiddenError } = await import("@osteojp/auth");
    const { listReminderLog } = await import("./reminder-log");
    await expect(listReminderLog(therapistCtx)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

/**
 * COMMS-03 (owner request, BLUE R3 B-T3): the patient name search on Lembretes SMS.
 *
 * THE TWO DEFECTS IT MUST NOT REINTRODUCE, both measured on this platform before:
 * a whole-string substring search (12,322 of 16,429 patients unfindable) and an
 * ILIKE that is not accent-insensitive (another 5,937). So every arm below is
 * built to go RED under either one, not only under "no search at all":
 *
 *   - "Rui Tavares" must find "Rui Manuel Tavares", which `%rui tavares%` cannot.
 *   - "ines conceicao" must find "Inês Conceição Brandão", which ILIKE cannot.
 *   - a name nobody has returns ZERO rows, never the unfiltered page.
 *
 * The reader is an ASSIGNED receptionist, the principal the clinic actually has,
 * reading through `listReminderLog` under RLS. Every expectation is an exact set
 * of patients, so an unfiltered answer fails it as surely as a wrong one.
 */
d("COMMS-03: Lembretes SMS finds a patient by name, with the existing filters", () => {
  let sql: Awaited<ReturnType<typeof import("@osteojp/db").getDbAdmin>>;
  const tenantId = randomUUID();
  const locationId = randomUUID();
  const receptionId = randomUUID();
  const therapistId = randomUUID();

  /** A middle name between the two tokens a person types. Its SMS failed. */
  const pRui = { id: randomUUID(), name: "Rui Manuel Tavares" };
  /** Shares both typed tokens, has no "Manuel". Its SMS was delivered. */
  const pRuiCosta = { id: randomUUID(), name: "Rui Tavares Costa" };
  /** Stored ACCENTED. Its SMS was delivered. */
  const pInes = { id: randomUUID(), name: "Inês Conceição Brandão" };
  /** Stored accented, shares the first name only. Its SMS failed. */
  const pInesRocha = { id: randomUUID(), name: "Inês Rocha" };
  const all = [pRui, pRuiCosta, pInes, pInesRocha];

  const ctx = () => ({ tenantId, role: "reception" as const, userId: receptionId });

  async function names(opts: { search?: string; onlyFailures?: boolean }) {
    const { listReminderLog } = await import("./reminder-log");
    // The option is passed through a widened type ON PURPOSE: before COMMS-03 the
    // function took no search, and the red run must reach the database rather
    // than stop at the type checker.
    const page = await listReminderLog(ctx(), opts as Parameters<typeof listReminderLog>[1]);
    return { total: page.total, names: page.rows.map((r) => r.patientName).sort() };
  }

  beforeAll(async () => {
    const { getDbAdmin } = await import("@osteojp/db");
    sql = getDbAdmin();

    await sql.execute(raw`insert into tenants (id, name, slug)
      values (${tenantId}, 'Reminder Search Co', ${"rsearch-" + tenantId.slice(0, 8)})`);
    await sql.execute(raw`insert into locations (id, tenant_id, name) values (${locationId}, ${tenantId}, 'Castelo')`);
    await sql.execute(raw`insert into users (id, tenant_id, email, full_name, is_active)
      values (${receptionId}, ${tenantId}, ${"r-" + receptionId.slice(0, 8) + "@t.test"}, 'Rececao Castelo', true)`);
    await sql.execute(raw`insert into users (id, tenant_id, email, full_name, is_active, is_bookable)
      values (${therapistId}, ${tenantId}, ${"t-" + therapistId.slice(0, 8) + "@t.test"}, 'Dra Busca', true, true)`);
    // ASSIGNED: the location arm of appointments_rls and patients_select, not the
    // tenant-wide fallback an unassigned receptionist would take.
    await sql.execute(raw`insert into staff_locations (tenant_id, user_id, location_id)
      values (${tenantId}, ${receptionId}, ${locationId})`);

    let day = 0;
    for (const p of all) {
      day += 1;
      await sql.execute(raw`insert into patients (id, tenant_id, full_name, phone, primary_location_id)
        values (${p.id}, ${tenantId}, ${p.name}, '912345678', ${locationId})`);
      const appointmentId = randomUUID();
      const startsAt = new Date(Date.now() + (10 + day) * 24 * 60 * 60 * 1000);
      const endsAt = new Date(startsAt.getTime() + 45 * 60 * 1000);
      await sql.execute(raw`insert into appointments
        (id, tenant_id, patient_id, practitioner_id, location_id, starts_at, ends_at, status)
        values (${appointmentId}, ${tenantId}, ${p.id}, ${therapistId}, ${locationId},
                ${startsAt.toISOString()}, ${endsAt.toISOString()}, 'scheduled')`);
      const failed = p === pRui || p === pInesRocha;
      if (failed) {
        await sql.execute(raw`insert into reminder_dispatches
          (tenant_id, appointment_id, channel, template_id, outcome, provider_error_code)
          values (${tenantId}, ${appointmentId}, 'sms', 'reminder.24h.sms', 'provider_error', '21211')`);
      } else {
        await sql.execute(raw`insert into reminder_dispatches
          (tenant_id, appointment_id, channel, template_id, outcome, provider_status)
          values (${tenantId}, ${appointmentId}, 'sms', 'reminder.24h.sms', 'sent', 'delivered')`);
      }
    }
  });

  afterAll(async () => {
    if (!sql) return;
    await sql.execute(raw`delete from reminder_dispatches where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from appointments where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from patients where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from staff_locations where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from locations where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from users where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from tenants where id = ${tenantId}`);
  });

  it("NEGATIVE CONTROL: with no search the receptionist reads all four rows", async () => {
    expect(await names({})).toEqual({ total: 4, names: all.map((p) => p.name).sort() });
  });

  it("CASE 1, a middle name token matches, and first + last matches across it", async () => {
    // The middle token alone.
    expect(await names({ search: "Manuel" })).toEqual({ total: 1, names: [pRui.name] });
    // First and last with the middle one skipped: `%rui tavares%` finds only Costa.
    expect(await names({ search: "Rui Tavares" })).toEqual({
      total: 2,
      names: [pRui.name, pRuiCosta.name].sort(),
    });
    // Tokens in any order, and AND rather than OR: "Tavares Manuel" is one patient.
    expect(await names({ search: "tavares manuel" })).toEqual({ total: 1, names: [pRui.name] });
  });

  it("CASE 2, an unaccented query matches an accented stored name", async () => {
    expect(await names({ search: "ines conceicao" })).toEqual({ total: 1, names: [pInes.name] });
    expect(await names({ search: "BRANDAO" })).toEqual({ total: 1, names: [pInes.name] });
    expect(await names({ search: "ines" })).toEqual({
      total: 2,
      names: [pInes.name, pInesRocha.name].sort(),
    });
  });

  it("CASE 3, a query with no match returns nothing, not the unfiltered list", async () => {
    expect(await names({ search: "Xavier" })).toEqual({ total: 0, names: [] });
    // A real first name plus a surname nobody here carries is also nothing: AND.
    expect(await names({ search: "Rui Xavier" })).toEqual({ total: 0, names: [] });
    expect(await names({ search: "Xavier", onlyFailures: true })).toEqual({ total: 0, names: [] });
  });

  it("the search narrows Só falhas and Só falhas narrows the search", async () => {
    expect(await names({ search: "Rui", onlyFailures: true })).toEqual({ total: 1, names: [pRui.name] });
    expect(await names({ search: "ines", onlyFailures: true })).toEqual({
      total: 1,
      names: [pInesRocha.name],
    });
    // A patient whose only SMS was delivered is absent under Só falhas.
    expect(await names({ search: "conceicao", onlyFailures: true })).toEqual({ total: 0, names: [] });
  });
});
