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
 * Only the data seam (`loadReminderData`) and the two transports are
 * replaced: the SMS transport throws the shape the Twilio SDK throws for
 * 21211, and the email transport answers "held back" without calling
 * anything, so no arm here can reach a provider whatever the environment says.
 *
 * SWEEP-01 adds two suites below, in this file because it is the one the skip
 * guard already requires: the reminder claim the dispatcher leaves (written as
 * the job role, read back as rows), and the two counts on Lembretes SMS (read
 * as the viewer, on seeded rows, both channels, two tenants).
 *
 * Skipped without DATABASE_URL, and hard-required in assert-rls-executed.mjs so
 * a silent skip reddens the DB-gated job.
 */
import { randomUUID } from "node:crypto";
import { sql as raw } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { addDays, lisbonDateTimeToUtc, todayInLisbon } from "../scheduling/time";

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
    // The shape the real gate answers when it holds a message back. It calls
    // nothing: this file must not be able to send an email.
    sendEmail: vi.fn(async () => ({ channel: "email" as const, sandbox: true, id: "held-by-the-test" })),
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
  /**
   * TEN DAYS OUT AT A PINNED HOUR, not `Date.now() + 10d`, which inherits the
   * time of day the suite ran at. Ten days is far outside both reminder offsets
   * (24h and 48h), so pinning the hour cannot move this fixture across either
   * threshold - which is exactly why this seed is safe to pin and the 20-to-30
   * hour seeds in this directory are NOT. See
   * seeds-are-clock-independent.test.ts for that boundary.
   */
  const startsAt = lisbonDateTimeToUtc(addDays(todayInLisbon(), 10), "11:00");
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
      // One patient per day, each pinned to 11:00 Lisbon rather than inheriting
      // the hour the suite ran at. `day` still walks the appointments apart, so
      // the ordering these arms read stays exactly as it was.
      const startsAt = lisbonDateTimeToUtc(addDays(todayInLisbon(), 10 + day), "11:00");
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

/**
 * SWEEP-01: THE REMINDER CLAIM, against a real Postgres, written as the job.
 *
 * WHY A DATABASE. The claim is an INSERT into `reminder_claims` made under the
 * reminder job's own role and tenant claim, behind a transaction-scoped
 * advisory lock. A mock has no policy to refuse the row, no check to hold its
 * columns to its kind, no lock to wait on and no second tenant to hide it from. The dispatcher's side of it (one claim per
 * call, and that it reads nothing back) is in reminder-claim-dispatch.test.ts.
 *
 * EVERY ARM ASSERTS OVER ROWS THIS SUITE OWNS: its two tenants are fresh
 * uuids, and the claims are read by appointment id.
 *
 * SINCE SWEEP-02 A CLAIM CAN HOLD A REPEAT (reminder-claim.db.test.ts): the
 * second sender of a reminder already SENT. The transports of this file never
 * answer "sent" (one refuses, one holds back), so no arm here can be held,
 * every call below does what it did before claims existed, and the ledger
 * this suite reads is the proof of that.
 */
d("SWEEP-01: the dispatcher leaves a reminder claim, and a first claim changes nothing", () => {
  let sql: Awaited<ReturnType<typeof import("@osteojp/db").getDbAdmin>>;
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const adminB = randomUUID();
  const ids = {
    A: { therapist: randomUUID(), location: randomUUID(), patient: randomUUID(), appointment: randomUUID() },
    B: { therapist: randomUUID(), location: randomUUID(), patient: randomUUID(), appointment: randomUUID() },
  };
  /** Ten days out, pinned: far outside both offsets, so a claim taken today is early. */
  const farStart = lisbonDateTimeToUtc(addDays(todayInLisbon(), 10), "11:00");
  /** Yesterday, pinned: both marks are long past, so a claim taken today is not early. */
  const pastStart = lisbonDateTimeToUtc(addDays(todayInLisbon(), -1), "11:00");
  let savedLiveSend: string | undefined;

  type Row = Record<string, unknown>;
  async function rows(q: Parameters<typeof sql.execute>[0]): Promise<Row[]> {
    const r = (await sql.execute(q)) as unknown;
    return (Array.isArray(r) ? r : ((r as { rows?: unknown[] }).rows ?? [])) as Row[];
  }

  /** The claims of one appointment, oldest first, as the columns that matter. */
  async function claimsOf(appointmentId: string): Promise<Row[]> {
    return rows(raw`select tenant_id::text as tenant_id, kind, offset_id, channel,
        to_char(starts_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as starts_at,
        to_char(due_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as due_at,
        taker, early, claim_id, minutes_after_mark, saved_after_mark, pass_id
      from reminder_claims
      where appointment_id = ${appointmentId} and kind = 'claim'
      order by created_at, id`);
  }

  function loaded(appointmentId: string, patientId: string, over: Record<string, unknown> = {}) {
    return {
      appointmentId,
      startsAt: farStart,
      status: "confirmed",
      origin: "staff",
      patientId,
      patientName: "Paciente Claim",
      patientEmail: "paciente.claim@example.pt",
      patientPhone: "912345678",
      patientReminderSmsEnabled: true,
      patientReminderEmailEnabled: true,
      patientDeletedAt: null,
      practitionerName: "Dra Claim",
      locationName: "Sede",
      locationPhone: "+351 210 000 000",
      tenantSettings: { locale: "pt", contacts: { phone: "+351 210 000 000" } },
      ...over,
    };
  }

  beforeAll(async () => {
    const { getDbAdmin } = await import("@osteojp/db");
    sql = getDbAdmin();
    for (const [tenantId, t, label] of [
      [tenantA, ids.A, "a"],
      [tenantB, ids.B, "b"],
    ] as const) {
      await sql.execute(raw`insert into tenants (id, name, slug)
        values (${tenantId}, 'Reminder Claim Co', ${"rclaim-" + label + "-" + tenantId.slice(0, 8)})`);
      await sql.execute(raw`insert into users (id, tenant_id, email, full_name, is_active, is_bookable)
        values (${t.therapist}, ${tenantId}, ${"t-" + t.therapist.slice(0, 8) + "@t.test"}, 'Dra Claim', true, true)`);
      await sql.execute(raw`insert into locations (id, tenant_id, name) values (${t.location}, ${tenantId}, 'Sede')`);
      await sql.execute(raw`insert into patients (id, tenant_id, full_name, phone)
        values (${t.patient}, ${tenantId}, 'Paciente Claim', '912345678')`);
      await sql.execute(raw`insert into appointments
        (id, tenant_id, patient_id, practitioner_id, location_id, starts_at, ends_at, status)
        values (${t.appointment}, ${tenantId}, ${t.patient}, ${t.therapist}, ${t.location},
                ${farStart.toISOString()}, ${new Date(farStart.getTime() + 45 * 60_000).toISOString()}, 'confirmed')`);
    }
    await sql.execute(raw`insert into users (id, tenant_id, email, full_name, is_active)
      values (${adminB}, ${tenantB}, ${"a-" + adminB.slice(0, 8) + "@t.test"}, 'Admin B', true)`);
    process.env.REMINDERS_LINK_SECRET ??= "test-only-link-secret-not-prod";
    process.env.REMINDERS_RESCHEDULE_BASE_URL ??= "https://app.invalid";
    // Belt and braces beside the replaced transports: live send is off here.
    savedLiveSend = process.env.REMINDERS_LIVE_SEND;
    delete process.env.REMINDERS_LIVE_SEND;
  });

  afterAll(async () => {
    if (savedLiveSend !== undefined) process.env.REMINDERS_LIVE_SEND = savedLiveSend;
    if (!sql) return;
    for (const tenantId of [tenantA, tenantB]) {
      await sql.execute(raw`delete from audit_log where tenant_id = ${tenantId}`);
      // By tenant, not left to the appointment's cascade: a seeded row of one
      // tenant may name the other tenant's appointment.
      await sql.execute(raw`delete from reminder_claims where tenant_id = ${tenantId}`);
      await sql.execute(raw`delete from reminder_dispatches where tenant_id = ${tenantId}`);
      await sql.execute(raw`delete from appointments where tenant_id = ${tenantId}`);
      await sql.execute(raw`delete from patients where tenant_id = ${tenantId}`);
      await sql.execute(raw`delete from locations where tenant_id = ${tenantId}`);
      await sql.execute(raw`delete from users where tenant_id = ${tenantId}`);
      await sql.execute(raw`delete from tenants where id = ${tenantId}`);
    }
  });

  it("not found: no claim. There is no row to read a start from", async () => {
    h.loadReminderData.mockResolvedValue(null);
    const { dispatchReminder } = await import("./dispatch");
    expect(await dispatchReminder(tenantA, ids.A.appointment, "24h", "sms")).toEqual({
      dispatched: false,
      reason: "not_found",
    });
    expect(await claimsOf(ids.A.appointment)).toEqual([]);
  });

  it("every other ending leaves exactly one claim, written as the job, with its start and its mark", async () => {
    const { dispatchReminder } = await import("./dispatch");
    const a = ids.A;
    const claim = (offsetId: "24h" | "48h", channel: string, startsAt: Date, early: boolean) => ({
      tenant_id: tenantA,
      kind: "claim",
      offset_id: offsetId,
      channel,
      starts_at: startsAt.toISOString(),
      due_at: new Date(startsAt.getTime() - (offsetId === "24h" ? 24 : 48) * 60 * 60_000).toISOString(),
      taker: "run",
      early,
      // What only a release or a shadow row carries.
      claim_id: null,
      minutes_after_mark: null,
      saved_after_mark: null,
      pass_id: null,
    });
    const expected: Row[] = [];

    // 1. A gate that refuses: the visit was cancelled.
    h.loadReminderData.mockResolvedValue(loaded(a.appointment, a.patient, { status: "cancelled" }));
    expect(await dispatchReminder(tenantA, a.appointment, "24h", "sms")).toEqual({ dispatched: false, reason: "status" });
    expected.push(claim("24h", "sms", farStart, true));
    expect(await claimsOf(a.appointment)).toEqual(expected);

    // 2. The deleted-patient gate, which answers before the row is handed on.
    h.loadReminderData.mockResolvedValue(
      loaded(a.appointment, a.patient, { patientDeletedAt: new Date("2031-01-01T00:00:00.000Z") }),
    );
    expect(await dispatchReminder(tenantA, a.appointment, "24h", "sms")).toEqual({
      dispatched: false,
      reason: "patient_deleted",
    });
    expected.push(claim("24h", "sms", farStart, true));
    expect(await claimsOf(a.appointment)).toEqual(expected);

    // 3. The 48 h email, handed to the (replaced) transport. A start in the
    //    past: the mark is long gone, so this claim is NOT early.
    h.loadReminderData.mockResolvedValue(loaded(a.appointment, a.patient, { startsAt: pastStart }));
    expect(await dispatchReminder(tenantA, a.appointment, "48h", "email")).toMatchObject({ dispatched: true });
    expected.push(claim("48h", "email", pastStart, false));
    expect(await claimsOf(a.appointment)).toEqual(expected);

    // 4. The 24 h SMS, which the provider REFUSES. The run fails, as before,
    //    and its claim is there: it was taken before the provider was called.
    h.loadReminderData.mockResolvedValue(loaded(a.appointment, a.patient));
    await expect(dispatchReminder(tenantA, a.appointment, "24h", "sms")).rejects.toThrow("provider refused");
    expected.push(claim("24h", "sms", farStart, true));
    expect(await claimsOf(a.appointment)).toEqual(expected);

    // THE LEDGER IS WHAT IT WOULD HAVE BEEN WITHOUT A SINGLE CLAIM: one row per
    // call above, in order, with the outcome each call always wrote.
    const ledger = await rows(raw`select channel, template_id, outcome, suppression_reason, provider_error_code
      from reminder_dispatches where appointment_id = ${a.appointment} order by created_at, id`);
    expect(ledger).toEqual([
      // The not-found call of the test above.
      { channel: "sms", template_id: "reminder.24h.sms", outcome: "suppressed", suppression_reason: "not_found", provider_error_code: null },
      { channel: "sms", template_id: "reminder.24h.sms", outcome: "suppressed", suppression_reason: "status", provider_error_code: null },
      { channel: "sms", template_id: "reminder.24h.sms", outcome: "suppressed", suppression_reason: "patient_deleted", provider_error_code: null },
      { channel: "email", template_id: "reminder.48h.email", outcome: "suppressed", suppression_reason: "sandbox", provider_error_code: null },
      { channel: "sms", template_id: "reminder.24h.sms", outcome: "provider_error", suppression_reason: null, provider_error_code: "21211" },
    ]);
  });

  it("early at the ten minute edge, as the row Postgres holds", async () => {
    const { takeReminderClaim, EARLY_CLAIM_MS } = await import("./reminder-claim");
    const b = ids.B;
    const mark = new Date(farStart.getTime() - 24 * 60 * 60_000);
    const take = (now: Date, taker: "run" | "sweep") =>
      takeReminderClaim({ tenantId: tenantB, appointmentId: b.appointment, offsetId: "24h", channel: "sms", startsAt: farStart, taker, now });

    await take(new Date(mark.getTime() - EARLY_CLAIM_MS), "run"); // exactly ten minutes before: not early
    await take(new Date(mark.getTime() - EARLY_CLAIM_MS - 1), "run"); // one millisecond more: early
    await take(new Date(mark.getTime() + 20 * 60_000), "sweep"); // after the mark: not early

    const got = await claimsOf(b.appointment);
    expect(got.map((r) => [r.taker, r.early, r.tenant_id])).toEqual([
      ["run", false, tenantB],
      ["run", true, tenantB],
      ["sweep", false, tenantB],
    ]);
  });

  it("two takers of one reminder at the same moment both write: the lock orders them and refuses neither", async () => {
    const { takeReminderClaim } = await import("./reminder-claim");
    const b = ids.B;
    const before = (await claimsOf(b.appointment)).length;
    const take = () =>
      takeReminderClaim({ tenantId: tenantB, appointmentId: b.appointment, offsetId: "48h", channel: "email", startsAt: farStart, taker: "run" });
    // Not held, each with the id of its own row: three takers, three rows.
    const answers = await Promise.all([take(), take(), take()]);
    expect(answers.map((a) => a.held)).toEqual([false, false, false]);
    const written = answers.map((a) => (a.held ? null : a.claimId));
    expect(new Set(written).size).toBe(3);
    expect(written.every((id) => typeof id === "string")).toBe(true);
    expect((await claimsOf(b.appointment)).length).toBe(before + 3);
  });

  it("a claim is its tenant's: another tenant reads none of them", async () => {
    // NEGATIVE CONTROL: tenant A's claims are there. Without this, zero proves nothing.
    expect((await claimsOf(ids.A.appointment)).length).toBeGreaterThan(0);

    const { runScoped } = await import("@/lib/auth/context");
    const { and, count, eq } = await import("drizzle-orm");
    const { reminderClaims } = await import("@osteojp/db");
    const seen = await runScoped({ tenantId: tenantB, role: "admin" as const, userId: adminB }, (tx) =>
      tx
        .select({ n: count() })
        .from(reminderClaims)
        .where(and(eq(reminderClaims.kind, "claim"), eq(reminderClaims.appointmentId, ids.A.appointment))),
    );
    expect(Number(seen[0]?.n)).toBe(0);
  });

  it("a claim that cannot be written does not stop the dispatcher: an unknown tenant, and the outcome is the same", async () => {
    // A tenant id that is not a tenant: the claim's INSERT is refused by the
    // database (the foreign key), and the dispatcher carries on to its own answer.
    const ghostTenant = randomUUID();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    h.loadReminderData.mockResolvedValue(loaded(ids.A.appointment, ids.A.patient, { status: "cancelled" }));
    const { dispatchReminder } = await import("./dispatch");
    const before = (await claimsOf(ids.A.appointment)).length;
    expect(await dispatchReminder(ghostTenant, ids.A.appointment, "24h", "sms")).toEqual({
      dispatched: false,
      reason: "status",
    });
    expect((await claimsOf(ids.A.appointment)).length).toBe(before);
    expect(spy.mock.calls.flat().join(" ")).toContain("reminder claim write FAILED");
    spy.mockRestore();
  });

  /**
   * A CLAIM THAT HAS TO WAIT. The arm above is a claim that ERRORS at once.
   * This one cannot error on its own: another session sits on this very
   * reminder's advisory lock and does not let go. Without a bound the claim
   * would queue behind it, and the dispatcher, which awaits the claim before
   * it sends, would hold the reminder for as long as the holder sat there.
   *
   * The holder is a second connection in an open transaction, which is what a
   * stuck sender looks like to Postgres. It is released in `finally`, so a
   * failed expectation cannot leave the lock behind.
   */
  it(
    "a claim that must WAIT does not hold the reminder: with this reminder's lock held elsewhere, the dispatcher still answers, about two seconds late and without its claim",
    async () => {
      const { dispatchReminder } = await import("./dispatch");
      const { reminderClaimLockPayload, CLAIM_LOCK_TIMEOUT } = await import("./reminder-claim");
      expect(CLAIM_LOCK_TIMEOUT).toBe("2s");
      const a = ids.A;
      const payload = reminderClaimLockPayload(tenantA, a.appointment, "48h", "email");
      const ledgerOf = () =>
        rows(raw`select channel, template_id, outcome, suppression_reason
          from reminder_dispatches where appointment_id = ${a.appointment} order by created_at, id`);

      let letGo!: () => void;
      const untilLetGo = new Promise<void>((resolve) => (letGo = resolve));
      let lockIsHeld!: () => void;
      const untilHeld = new Promise<void>((resolve) => (lockIsHeld = resolve));
      const holder = sql.transaction(async (tx) => {
        await tx.execute(raw`select pg_advisory_xact_lock(hashtextextended(${payload}, 0))`);
        lockIsHeld();
        await untilLetGo;
      });
      await untilHeld;

      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      h.loadReminderData.mockResolvedValue(loaded(a.appointment, a.patient));
      try {
        const claimsBefore = (await claimsOf(a.appointment)).length;
        const ledgerBefore = await ledgerOf();

        const started = performance.now();
        const outcome = await dispatchReminder(tenantA, a.appointment, "48h", "email");
        const waitedMs = performance.now() - started;

        // It answered, and the answer is the one it always gave: the email
        // was handed to the (replaced) transport and the ledger row followed.
        expect(outcome).toMatchObject({ dispatched: true });
        expect(await ledgerOf()).toEqual([
          ...ledgerBefore,
          { channel: "email", template_id: "reminder.48h.email", outcome: "suppressed", suppression_reason: "sandbox" },
        ]);
        // It really did wait for the lock: not an error at once. And Postgres
        // ended the wait, not the holder: the holder is still holding on at
        // this line, and lets go only in `finally` below. No upper bound is
        // asserted on the clock, because a loaded machine would fail it for
        // no reason; having an answer at all, here, is the bound.
        expect(waitedMs).toBeGreaterThan(1_900);
        // No claim: the wait ran out before the row could be written, and the
        // failure is logged like any other.
        expect((await claimsOf(a.appointment)).length).toBe(claimsBefore);
        expect(spy.mock.calls.flat().join(" ")).toContain("reminder claim write FAILED");
      } finally {
        letGo();
        await holder;
        spy.mockRestore();
      }

      // NEGATIVE CONTROL: with the lock free, the same call leaves its claim.
      // So it was the held lock, and nothing else, that kept the claim out.
      const claimsBefore = (await claimsOf(a.appointment)).length;
      expect(await dispatchReminder(tenantA, a.appointment, "48h", "email")).toMatchObject({ dispatched: true });
      expect((await claimsOf(a.appointment)).length).toBe(claimsBefore + 1);
    },
    30_000,
  );
});

/**
 * SWEEP-01: THE TWO COUNTS ON LEMBRETES SMS, on seeded rows, as the viewer.
 *
 * EVERY INSTANT IS SEEDED AGAINST ONE PINNED `NOW`, which is also the `now`
 * handed to the read. Nothing here reads the wall clock, so the answer is the
 * same at any hour; `created_at` is written explicitly for the same reason.
 *
 * EACH SEED IS ONE REASON A ROW IS OR IS NOT COUNTED, with its neighbour on the
 * other side of the edge. A count that ignored any one rule lands on a
 * different number, which is why every expectation is an exact total.
 *
 * FOUR TENANTS. A holds the rules of both counts. B is the other tenant, and
 * counts only its own. C has claims that began two hours ago: the floor of the
 * first count. D has none in seven days: the first count is not a number.
 */
d("SWEEP-01: the two counts on Lembretes SMS, both channels, as the viewer", () => {
  let sql: Awaited<ReturnType<typeof import("@osteojp/db").getDbAdmin>>;
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const tenantC = randomUUID();
  const tenantD = randomUUID();
  const A = {
    reception: randomUUID(),
    assignedReception: randomUUID(),
    therapist: randomUUID(),
    patient: randomUUID(),
    l1: randomUUID(),
    l2: randomUUID(),
  };
  const B = { reception: randomUUID(), therapist: randomUUID(), patient: randomUUID(), l1: randomUUID() };
  const C = { reception: randomUUID(), therapist: randomUUID(), patient: randomUUID(), l1: randomUUID() };
  const D = { reception: randomUUID(), therapist: randomUUID(), patient: randomUUID(), l1: randomUUID() };
  const people = { [tenantA]: A, [tenantB]: B, [tenantC]: C, [tenantD]: D };
  /** Tenant B's one visit still ahead: the last arm hands it to the real claim writer. */
  let bVisit: { id: string; start: Date };

  const NOW = lisbonDateTimeToUtc(addDays(todayInLisbon(), 10), "12:00");
  const MIN = 60_000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;
  const at = (ms: number) => new Date(NOW.getTime() + ms);

  type Row = Record<string, unknown>;
  async function rows(q: Parameters<typeof sql.execute>[0]): Promise<Row[]> {
    const r = (await sql.execute(q)) as unknown;
    return (Array.isArray(r) ? r : ((r as { rows?: unknown[] }).rows ?? [])) as Row[];
  }

  /**
   * An audit row that is NOT a claim: the trail a save of the clinic leaves on
   * a visit, or any other row a seed needs beside it.
   */
  async function trail(t: {
    tenant?: string;
    action: string;
    entityType?: string;
    entityId: string;
    /** The keys the writer of this action puts in its metadata. */
    metadata?: Record<string, unknown>;
    created?: Date;
  }): Promise<void> {
    // `::text::jsonb`, as in `claim` below.
    await sql.execute(raw`insert into audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, metadata, created_at)
      values (${t.tenant ?? tenantA}, null, ${t.action}, ${t.entityType ?? "appointment"}, ${t.entityId},
              ${JSON.stringify(t.metadata ?? {})}::text::jsonb, ${(t.created ?? at(-5 * DAY)).toISOString()})`);
  }

  async function visit(v: {
    tenant?: string;
    location?: string;
    start: Date;
    created?: Date;
    status?: string;
    /**
     * `false` is a visit with NO booking row on its audit trail: an imported
     * one, or an online request. The seed adds whatever rows it needs itself.
     * The default writes the row a booking at the clinic writes.
     */
    booked?: boolean;
    /**
     * Microseconds added to the STORED start, which a `Date` cannot carry. The
     * start handed back is the one a sender's clock would read: without them.
     */
    micros?: number;
  }): Promise<{ id: string; start: Date }> {
    const tenantId = v.tenant ?? tenantA;
    const mine = people[tenantId]!;
    const id = randomUUID();
    const created = v.created ?? at(-5 * DAY);
    await sql.execute(raw`insert into appointments
      (id, tenant_id, patient_id, practitioner_id, location_id, starts_at, ends_at, status, created_at)
      values (${id}, ${tenantId}, ${mine.patient}, ${mine.therapist}, ${v.location ?? mine.l1},
              ${v.start.toISOString()}::timestamptz + make_interval(secs => ${(v.micros ?? 0) / 1_000_000}::double precision),
              ${new Date(v.start.getTime() + 45 * MIN).toISOString()},
              ${v.status ?? "scheduled"}, ${created.toISOString()})`);
    if (v.booked !== false) await trail({ tenant: tenantId, action: "appointment.create", entityId: id, created });
    return { id, start: v.start };
  }

  /** A claim row, shaped as takeReminderClaim writes it, at a chosen instant. */
  async function claim(c: {
    tenant?: string;
    appointment: string;
    offset: "24h" | "48h";
    start: Date;
    early?: boolean;
    created: Date;
    /**
     * `shadow`: the sweep's own row for the same reminder and start. It is a
     * row of the same table and it is NOT a claim.
     */
    kind?: "claim" | "shadow";
    /** The channel, when it is NOT the one this offset goes out on. */
    channel?: "sms" | "email";
  }): Promise<void> {
    const due = new Date(c.start.getTime() - (c.offset === "24h" ? 24 : 48) * HOUR);
    const channel = c.channel ?? (c.offset === "24h" ? "sms" : "email");
    if (c.kind === "shadow") {
      await sql.execute(raw`insert into reminder_claims
        (tenant_id, appointment_id, kind, offset_id, channel, starts_at, due_at, minutes_after_mark, saved_after_mark, created_at)
        values (${c.tenant ?? tenantA}, ${c.appointment}, 'shadow', ${c.offset}, ${channel}, ${c.start.toISOString()},
                ${due.toISOString()}, 0, false, ${c.created.toISOString()})`);
      return;
    }
    await sql.execute(raw`insert into reminder_claims
      (tenant_id, appointment_id, kind, offset_id, channel, starts_at, due_at, taker, early, created_at)
      values (${c.tenant ?? tenantA}, ${c.appointment}, 'claim', ${c.offset}, ${channel}, ${c.start.toISOString()},
              ${due.toISOString()}, 'run', ${c.early ?? false}, ${c.created.toISOString()})`);
  }

  async function ledger(l: {
    appointment: string;
    channel: "sms" | "email";
    template: string;
    outcome: "sent" | "suppressed" | "provider_error";
    created: Date;
  }): Promise<void> {
    await sql.execute(raw`insert into reminder_dispatches
      (tenant_id, appointment_id, channel, template_id, outcome, suppression_reason, created_at)
      values (${tenantA}, ${l.appointment}, ${l.channel}, ${l.template}, ${l.outcome},
              ${l.outcome === "suppressed" ? "sandbox" : null}, ${l.created.toISOString()})`);
  }

  /** A claim taken ten minutes ago: it answers number one and is too new for number two. */
  const FRESH = at(-10 * MIN);
  /** When tenant C's first claim was written, as text for a seed check. */
  const TWO_HOURS_AGO_ISO = at(-2 * HOUR).toISOString();

  beforeAll(async () => {
    const { getDbAdmin } = await import("@osteojp/db");
    sql = getDbAdmin();

    for (const [tenantId, label] of [
      [tenantA, "a"],
      [tenantB, "b"],
      [tenantC, "c"],
      [tenantD, "d"],
    ] as const) {
      await sql.execute(raw`insert into tenants (id, name, slug)
        values (${tenantId}, 'Reminder Numbers Co', ${"rnum-" + label + "-" + tenantId.slice(0, 8)})`);
    }
    await sql.execute(raw`insert into locations (id, tenant_id, name) values (${A.l1}, ${tenantA}, 'Clinica Um')`);
    await sql.execute(raw`insert into locations (id, tenant_id, name) values (${A.l2}, ${tenantA}, 'Clinica Dois')`);
    await sql.execute(raw`insert into locations (id, tenant_id, name) values (${B.l1}, ${tenantB}, 'Clinica B')`);
    await sql.execute(raw`insert into locations (id, tenant_id, name) values (${C.l1}, ${tenantC}, 'Clinica C')`);
    await sql.execute(raw`insert into locations (id, tenant_id, name) values (${D.l1}, ${tenantD}, 'Clinica D')`);
    for (const [id, tenantId, name, bookable] of [
      [A.reception, tenantA, "Rececao Geral", false],
      [A.assignedReception, tenantA, "Rececao Clinica Um", false],
      [A.therapist, tenantA, "Dra Numeros", true],
      [B.reception, tenantB, "Rececao B", false],
      [B.therapist, tenantB, "Dra B", true],
      [C.reception, tenantC, "Rececao C", false],
      [C.therapist, tenantC, "Dra C", true],
      [D.reception, tenantD, "Rececao D", false],
      [D.therapist, tenantD, "Dra D", true],
    ] as const) {
      await sql.execute(raw`insert into users (id, tenant_id, email, full_name, is_active, is_bookable)
        values (${id}, ${tenantId}, ${"u-" + id.slice(0, 8) + "@t.test"}, ${name}, true, ${bookable})`);
    }
    // ASSIGNED to Clinica Um: the location arm of appointments_rls, not the
    // tenant-wide fallback an unassigned receptionist takes.
    await sql.execute(raw`insert into staff_locations (tenant_id, user_id, location_id)
      values (${tenantA}, ${A.assignedReception}, ${A.l1})`);
    await sql.execute(raw`insert into patients (id, tenant_id, full_name, phone)
      values (${A.patient}, ${tenantA}, 'Paciente Numeros', '912345678')`);
    await sql.execute(raw`insert into patients (id, tenant_id, full_name, phone)
      values (${B.patient}, ${tenantB}, 'Paciente B', '912345678')`);
    await sql.execute(raw`insert into patients (id, tenant_id, full_name, phone)
      values (${C.patient}, ${tenantC}, 'Paciente C', '912345678')`);
    await sql.execute(raw`insert into patients (id, tenant_id, full_name, phone)
      values (${D.patient}, ${tenantD}, 'Paciente D', '912345678')`);

    /* ---------------- NUMBER ONE: a mark with no claim ---------------- */

    // v1. Both marks passed, neither reminder claimed. Its one claim is for
    //     the OTHER offset on the SMS channel, which is no reminder of today:
    //     a claim is its offset AND its channel.                    sms +1, email +1
    const v1 = await visit({ start: at(23 * HOUR) });
    await claim({ appointment: v1.id, offset: "48h", channel: "sms", start: v1.start, created: FRESH });
    // v2. Both reminders claimed for the start it has.              neither
    const v2 = await visit({ start: at(22 * HOUR) });
    await claim({ appointment: v2.id, offset: "24h", start: v2.start, created: FRESH });
    await claim({ appointment: v2.id, offset: "48h", start: v2.start, created: FRESH });
    // v3. The SMS claim is for a start the visit no longer has.     sms +1
    const v3 = await visit({ start: at(21 * HOUR) });
    await claim({ appointment: v3.id, offset: "24h", start: at(40 * HOUR), created: FRESH });
    await claim({ appointment: v3.id, offset: "48h", start: v3.start, created: FRESH });
    // v4. The SMS claim is `early`: taken before this mark.         sms +1
    const v4 = await visit({ start: at(20 * HOUR) });
    await claim({ appointment: v4.id, offset: "24h", start: v4.start, early: true, created: FRESH });
    await claim({ appointment: v4.id, offset: "48h", start: v4.start, created: FRESH });
    // v5. The SMS mark passed EXACTLY 30 minutes ago: not over.     neither
    const v5 = await visit({ start: at(24 * HOUR - 30 * MIN) });
    await claim({ appointment: v5.id, offset: "48h", start: v5.start, created: FRESH });
    // v5b. One second more than 30 minutes.                         sms +1
    const v5b = await visit({ start: at(24 * HOUR - 30 * MIN - 1000) });
    await claim({ appointment: v5b.id, offset: "48h", start: v5b.start, created: FRESH });
    // v6. Booked after both marks: it never had these reminders.    neither
    await visit({ start: at(19 * HOUR), created: at(-4 * HOUR) });
    // v6b. Booked AT its 24 h mark, to the instant: not before it.  neither
    await visit({ start: at(18.5 * HOUR), created: at(18.5 * HOUR - 24 * HOUR) });
    // v6c. Booked one second before its 24 h mark.                  sms +1
    await visit({ start: at(18 * HOUR), created: at(18 * HOUR - 24 * HOUR - 1000) });
    // v7. Cancelled.                                                neither
    await visit({ start: at(17.5 * HOUR), status: "cancelled" });
    // v8. Already started: the visit is not ahead.                  neither
    await visit({ start: at(-1 * HOUR) });
    // v9. At the OTHER clinic of tenant A.                          sms +1, email +1 (not for the assigned viewer)
    await visit({ start: at(17 * HOUR), location: A.l2 });
    // v10. Only the 48 h mark has passed.                           email +1
    await visit({ start: at(30 * HOUR) });
    // v11. The 48 h mark passed EXACTLY 30 minutes ago.             neither
    await visit({ start: at(48 * HOUR - 30 * MIN) });
    // v12. One second more.                                         email +1
    await visit({ start: at(48 * HOUR - 30 * MIN - 1000) });
    // v13. Confirmed counts like scheduled. Nothing claimed. (A claim whose
    //      start is not an instant, which this visit carried while claims
    //      were audit rows, cannot exist: the column is an instant.)
    //                                                               sms +1, email +1
    await visit({ start: at(16 * HOUR), status: "confirmed" });
    // v15. Its SMS "claim" is a row of ANOTHER KIND for the same reminder and
    //      the same start: the sweep's shadow row. Only a claim is a claim.
    //                                                               sms +1
    const v15 = await visit({ start: at(15 * HOUR) });
    await claim({ appointment: v15.id, offset: "24h", start: v15.start, created: FRESH, kind: "shadow" });
    await claim({ appointment: v15.id, offset: "48h", start: v15.start, created: FRESH });
    // v14. Claims in ANOTHER tenant that name v1. They hide nothing here.
    await claim({ tenant: tenantB, appointment: v1.id, offset: "24h", start: v1.start, created: FRESH });
    await claim({ tenant: tenantB, appointment: v1.id, offset: "48h", start: v1.start, created: FRESH });
    // Tenant B's own visit, nothing claimed.                        B: sms +1, email +1
    bVisit = await visit({ tenant: tenantB, start: at(23 * HOUR) });

    /* --- NUMBER ONE: only a visit handed to the reminder job (the switch is off) --- */
    // Every visit above carries the audit row of its booking, which `visit`
    // writes. The ones below do NOT. Each has both marks past; a claim on one
    // channel leaves the other to say whether the visit is in the count.
    // All are `scheduled`: the status takes no part here (v13 is the confirmed
    // one), and two confirmed visits of one therapist may not overlap.
    // "ALL" is what the same visit adds when the switch says every visit counts.

    // v16. Nothing on its trail: an imported visit, or an online request
    //      nobody has touched.                                      neither (ALL: sms +1, email +1)
    await visit({ start: at(14 * HOUR), booked: false });
    // v17. Moved by the clinic.                                     sms +1
    const v17 = await visit({ start: at(13 * HOUR), booked: false });
    await trail({ action: "appointment.reschedule", entityId: v17.id });
    await claim({ appointment: v17.id, offset: "48h", start: v17.start, created: FRESH });
    // v18. Accepted with the Estado control: a status set to confirmed.
    //                                                               email +1
    const v18 = await visit({ start: at(12.5 * HOUR), booked: false });
    await trail({ action: "appointment.update", entityId: v18.id, metadata: { changed: ["status"], fromStatus: "scheduled", toStatus: "confirmed" } });
    await claim({ appointment: v18.id, offset: "24h", start: v18.start, created: FRESH });
    // v19. Its trail is full, and NOT ONE row is a scheduling event: a
    //      cancellation; a change that is not a status; a status set to
    //      something other than scheduled or confirmed; a review that
    //      confirmed and moved nothing; a review that cancelled; a patient's
    //      reply that went to review; and a booking row whose entity is not
    //      an appointment.                                          neither (ALL: sms +1, email +1)
    const v19 = await visit({ start: at(12 * HOUR), booked: false });
    await trail({ action: "appointment.cancel", entityId: v19.id });
    await trail({ action: "appointment.update", entityId: v19.id, metadata: { changed: ["notes"], scope: "one" } });
    await trail({ action: "appointment.update", entityId: v19.id, metadata: { changed: ["status"], fromStatus: "confirmed", toStatus: "completed" } });
    await trail({ action: "appointment.sms_reply_reviewed", entityId: v19.id, metadata: { resolution: "confirmed", applied: false } });
    await trail({ action: "appointment.sms_reply_reviewed", entityId: v19.id, metadata: { resolution: "cancelled", applied: true } });
    await trail({ action: "appointment.patient_sms_reply", entityId: v19.id, metadata: { intent: "confirm", outcome: "review" } });
    await trail({ action: "appointment.create", entityType: "patient", entityId: v19.id });
    // v20. The only booking row that names it is in ANOTHER tenant.
    //                                                               neither (ALL: sms +1, email +1)
    const v20 = await visit({ start: at(11.5 * HOUR), booked: false });
    await trail({ tenant: tenantB, action: "appointment.create", entityId: v20.id });
    // v21. An online request accepted from the queue (Aceitar pedido).
    //                                                               sms +1
    const v21 = await visit({ start: at(11 * HOUR), booked: false });
    await trail({ action: "appointment.update", entityId: v21.id, metadata: { changed: ["status"], from_status: "scheduled", to_status: "confirmed", via: "portal_request_confirm" } });
    await claim({ appointment: v21.id, offset: "48h", start: v21.start, created: FRESH });
    // v22. Accepted by reception from the SMS review queue.         email +1
    const v22 = await visit({ start: at(10.5 * HOUR), booked: false });
    await trail({ action: "appointment.sms_reply_reviewed", entityId: v22.id, metadata: { resolution: "confirmed", applied: true } });
    await claim({ appointment: v22.id, offset: "24h", start: v22.start, created: FRESH });
    // v23. Accepted by the patient's own SMS reply.                 sms +1
    const v23 = await visit({ start: at(10 * HOUR), booked: false });
    await trail({ action: "appointment.patient_sms_reply", entityId: v23.id, metadata: { intent: "confirm", outcome: "confirmed" } });
    await claim({ appointment: v23.id, offset: "48h", start: v23.start, created: FRESH });
    // v24. Brought back from cancelled: a status set to scheduled.  email +1
    const v24 = await visit({ start: at(9.5 * HOUR), booked: false });
    await trail({ action: "appointment.update", entityId: v24.id, metadata: { changed: ["status"], fromStatus: "cancelled", toStatus: "scheduled" } });
    await claim({ appointment: v24.id, offset: "24h", start: v24.start, created: FRESH });
    // v25. Its stored start carries MICROSECONDS, which no sender's clock
    //      does. Both reminders are claimed for the start a sender read, to
    //      the millisecond, and those claims are this visit's.      neither
    const v25 = await visit({ start: at(9 * HOUR), micros: 123 });
    await claim({ appointment: v25.id, offset: "24h", start: v25.start, created: FRESH });
    await claim({ appointment: v25.id, offset: "48h", start: v25.start, created: FRESH });

    /* -------------- NUMBER TWO: a claim with no outcome --------------- */
    // Visits already completed, days ago: they take no part in number one.
    let n = 0;
    const done = async (location?: string, tenant?: string) =>
      visit({ tenant, location, start: at(-3 * DAY + n++ * HOUR), created: at(-10 * DAY), status: "completed" });
    const TWO_HOURS_AGO = at(-2 * HOUR);

    // w1. No ledger row at all.                                     sms +1
    const w1 = await done();
    await claim({ appointment: w1.id, offset: "24h", start: w1.start, created: TWO_HOURS_AGO });
    // w2. A sent row five seconds after the claim.                  no
    const w2 = await done();
    await claim({ appointment: w2.id, offset: "24h", start: w2.start, created: TWO_HOURS_AGO });
    await ledger({ appointment: w2.id, channel: "sms", template: "reminder.24h.sms", outcome: "sent", created: at(-2 * HOUR + 5000) });
    // w3. The fee-notice body is the 24 h reminder too, and a
    //     suppression is an outcome.                                no
    const w3 = await done();
    await claim({ appointment: w3.id, offset: "24h", start: w3.start, created: TWO_HOURS_AGO });
    await ledger({ appointment: w3.id, channel: "sms", template: "reminder.24h.sms.fee_notice", outcome: "suppressed", created: at(-2 * HOUR + 1000) });
    // w4. The only row is the OTHER reminder's.                     sms +1
    const w4 = await done();
    await claim({ appointment: w4.id, offset: "24h", start: w4.start, created: TWO_HOURS_AGO });
    await ledger({ appointment: w4.id, channel: "email", template: "reminder.48h.email", outcome: "sent", created: at(-2 * HOUR + 5000) });
    // w5. The row was written BEFORE the claim.                     sms +1
    const w5 = await done();
    await claim({ appointment: w5.id, offset: "24h", start: w5.start, created: TWO_HOURS_AGO });
    await ledger({ appointment: w5.id, channel: "sms", template: "reminder.24h.sms", outcome: "sent", created: at(-3 * HOUR) });
    // w6. Two claims, one row after the second: the first has none. sms +1
    const w6 = await done();
    await claim({ appointment: w6.id, offset: "24h", start: w6.start, created: at(-3 * HOUR) });
    await claim({ appointment: w6.id, offset: "24h", start: w6.start, created: TWO_HOURS_AGO });
    await ledger({ appointment: w6.id, channel: "sms", template: "reminder.24h.sms", outcome: "sent", created: at(-2 * HOUR + 5000) });
    // w7. Taken EXACTLY 30 minutes ago: not over.                   no
    const w7 = await done();
    await claim({ appointment: w7.id, offset: "24h", start: w7.start, created: at(-30 * MIN) });
    // w7b. One second more.                                         sms +1
    const w7b = await done();
    await claim({ appointment: w7b.id, offset: "24h", start: w7b.start, created: at(-30 * MIN - 1000) });
    // w8. One second outside the seven days.                        no
    const w8 = await done();
    await claim({ appointment: w8.id, offset: "24h", start: w8.start, created: at(-7 * DAY - 1000) });
    // w8b. Exactly seven days old: inside.                          sms +1
    const w8b = await done();
    await claim({ appointment: w8b.id, offset: "24h", start: w8b.start, created: at(-7 * DAY) });
    // w9. The email reminder, no row.                               email +1
    const w9 = await done();
    await claim({ appointment: w9.id, offset: "48h", start: w9.start, created: TWO_HOURS_AGO });
    // w10. The email reminder, refused by the provider: an outcome. no
    const w10 = await done();
    await claim({ appointment: w10.id, offset: "48h", start: w10.start, created: TWO_HOURS_AGO });
    await ledger({ appointment: w10.id, channel: "email", template: "reminder.48h.email", outcome: "provider_error", created: at(-2 * HOUR + 2000) });
    // w11. At the OTHER clinic.                                     sms +1 (not for the assigned viewer)
    const w11 = await done(A.l2);
    await claim({ appointment: w11.id, offset: "24h", start: w11.start, created: TWO_HOURS_AGO });
    // w12. The only row is a booking confirmation, not a reminder.  sms +1
    const w12 = await done();
    await claim({ appointment: w12.id, offset: "24h", start: w12.start, created: TWO_HOURS_AGO });
    await ledger({ appointment: w12.id, channel: "sms", template: "confirmation.sms", outcome: "sent", created: at(-2 * HOUR + 5000) });
    // w13. An early claim is still a claim someone took.            sms +1
    const w13 = await done();
    await claim({ appointment: w13.id, offset: "24h", start: w13.start, early: true, created: TWO_HOURS_AGO });
    // w14. A row at the very instant of the claim follows it.       no
    const w14 = await done();
    await claim({ appointment: w14.id, offset: "24h", start: w14.start, created: TWO_HOURS_AGO });
    await ledger({ appointment: w14.id, channel: "sms", template: "reminder.24h.sms", outcome: "sent", created: TWO_HOURS_AGO });
    // w15. Two claims, and a row at the very instant of the SECOND:
    //      it is the second claim's row, so the first has none.     sms +1
    const w15 = await done();
    await claim({ appointment: w15.id, offset: "24h", start: w15.start, created: at(-3 * HOUR) });
    await claim({ appointment: w15.id, offset: "24h", start: w15.start, created: TWO_HOURS_AGO });
    await ledger({ appointment: w15.id, channel: "sms", template: "reminder.24h.sms", outcome: "sent", created: TWO_HOURS_AGO });
    // w16. A row of ANOTHER KIND, the sweep's shadow row, with no ledger
    //      row: it is not a claim, so it is not counted.            no
    const w16 = await done();
    await claim({ appointment: w16.id, offset: "24h", start: w16.start, created: TWO_HOURS_AGO, kind: "shadow" });
    // w17. The only row is a 24 h reminder on the OTHER channel.    sms +1
    const w17 = await done();
    await claim({ appointment: w17.id, offset: "24h", start: w17.start, created: TWO_HOURS_AGO });
    await ledger({ appointment: w17.id, channel: "email", template: "reminder.24h.email", outcome: "sent", created: at(-2 * HOUR + 5000) });
    // w18. ANOTHER visit's claim, taken between w2's claim and w2's row.
    //      It is not w2's next claim, so w2 keeps its outcome.      no (and w2 stays no)
    const w18 = await done();
    await claim({ appointment: w18.id, offset: "24h", start: w18.start, created: at(-2 * HOUR + 2000) });
    await ledger({ appointment: w18.id, channel: "sms", template: "reminder.24h.sms", outcome: "sent", created: at(-2 * HOUR + 3000) });
    // w19. Claim, row, then a second claim and its row: a later claim does
    //      not take away the outcome the first already had.         no
    const w19 = await done();
    await claim({ appointment: w19.id, offset: "24h", start: w19.start, created: at(-3 * HOUR) });
    await ledger({ appointment: w19.id, channel: "sms", template: "reminder.24h.sms", outcome: "sent", created: at(-3 * HOUR + 5000) });
    await claim({ appointment: w19.id, offset: "24h", start: w19.start, created: TWO_HOURS_AGO });
    await ledger({ appointment: w19.id, channel: "sms", template: "reminder.24h.sms", outcome: "sent", created: at(-2 * HOUR + 5000) });
    // Tenant B's own claim with no row, three days old: B's claims began
    // long before any mark the first count looks at.                B: sms +1
    const wB = await done(undefined, tenantB);
    await claim({ tenant: tenantB, appointment: wB.id, offset: "24h", start: wB.start, created: at(-3 * DAY) });

    /* ------- NUMBER ONE'S FLOOR: claims began two hours ago (tenant C) ------- */
    // C's first claim, and its only one. Everything C's dispatcher handled
    // before this instant has no claim and never will.               C two: sms +1
    const wC = await done(undefined, tenantC);
    await claim({ tenant: tenantC, appointment: wC.id, offset: "24h", start: wC.start, created: TWO_HOURS_AGO });
    // An hour BEFORE it, the sweep's shadow row. It is not a claim, so it is
    // not where the claims start: the floor stays two hours ago.
    await claim({ tenant: tenantC, appointment: wC.id, offset: "24h", start: wC.start, created: at(-3 * HOUR), kind: "shadow" });
    // c1. Its SMS mark fell due an hour ago, after claims began: a real miss.
    //     Its email mark fell due 25 hours ago, before any claim was written:
    //     that email went out, or did not, before there was a way to tell.
    //                                                               C: sms +1, email no
    await visit({ tenant: tenantC, start: at(23 * HOUR) });
    // c2. Its SMS mark fell due at the very instant of the first claim.
    //                                                               C: sms +1
    await visit({ tenant: tenantC, start: at(22 * HOUR) });
    // c3. One second earlier than that.                             C: no
    await visit({ tenant: tenantC, start: at(22 * HOUR - 1000) });

    /* ------- NO CLAIM IN SEVEN DAYS (tenant D): not a number at all ------- */
    // d1. Both marks passed, nothing claimed. In tenant A this is v1.
    await visit({ tenant: tenantD, start: at(23 * HOUR) });
    // D's only claim is one second outside the seven days.
    const wD = await done(undefined, tenantD);
    await claim({ tenant: tenantD, appointment: wD.id, offset: "24h", start: wD.start, created: at(-7 * DAY - 1000) });
    // And a shadow row of the sweep, an hour old. A pass that only watches is
    // not a sender taking reminders: D still has no claim in seven days.
    await claim({ tenant: tenantD, appointment: wD.id, offset: "24h", start: wD.start, created: at(-1 * HOUR), kind: "shadow" });
  });

  afterAll(async () => {
    if (!sql) return;
    for (const tenantId of [tenantA, tenantB, tenantC, tenantD]) {
      await sql.execute(raw`delete from audit_log where tenant_id = ${tenantId}`);
      // By tenant, not left to the appointment's cascade: a seeded row of one
      // tenant may name the other tenant's appointment.
      await sql.execute(raw`delete from reminder_claims where tenant_id = ${tenantId}`);
      await sql.execute(raw`delete from reminder_dispatches where tenant_id = ${tenantId}`);
      await sql.execute(raw`delete from appointments where tenant_id = ${tenantId}`);
      await sql.execute(raw`delete from patients where tenant_id = ${tenantId}`);
      await sql.execute(raw`delete from staff_locations where tenant_id = ${tenantId}`);
      await sql.execute(raw`delete from locations where tenant_id = ${tenantId}`);
      await sql.execute(raw`delete from users where tenant_id = ${tenantId}`);
      await sql.execute(raw`delete from tenants where id = ${tenantId}`);
    }
  });

  it("NEGATIVE CONTROL: the seeds are there, and a seeded claim reads as a claim", async () => {
    // The claims, and the two rows of another kind beside them (v15, w16).
    // v14's two rows name a visit of tenant A and belong to tenant B.
    const [seeded] = await rows(raw`select
        count(*) filter (where kind = 'claim')::int as claims,
        count(*) filter (where kind = 'shadow')::int as shadows,
        count(*)::int as all_rows
      from reminder_claims where tenant_id = ${tenantA}`);
    expect(seeded).toEqual({ claims: 41, shadows: 2, all_rows: 43 });
    // One visit is stored with microseconds on its start, and its claims without.
    const [fine] = await rows(raw`select count(*)::int as n from appointments
      where tenant_id = ${tenantA} and starts_at <> date_trunc('milliseconds', starts_at)`);
    expect(fine).toEqual({ n: 1 });
    // NOT ONE OF THEM IS IN THE AUDIT TRAIL: a claim is no longer an audit row.
    const [inAudit] = await rows(raw`select count(*)::int as n from audit_log
      where tenant_id = ${tenantA} and (action like '%reminder_claim%' or action like '%reminder_sweep%')`);
    expect(inAudit).toEqual({ n: 0 });
    const [visits] = await rows(raw`select count(*)::int as n from appointments where tenant_id = ${tenantA}`);
    expect(visits).toEqual({ n: 48 });
    // The booking rows: every visit of tenant A carries one except v16 to
    // v24, which are seeded without (39 of 48). Without these rows every
    // first count below would be zero.
    const [booked] = await rows(raw`select count(distinct entity_id)::int as visits from audit_log
      where tenant_id = ${tenantA} and entity_type = 'appointment' and action = 'appointment.create'`);
    expect(booked).toEqual({ visits: 39 });
    // And a seeded metadata key reads as a key, for the rows that have one.
    const [keyed] = await rows(raw`select count(*)::int as n from audit_log
      where tenant_id = ${tenantA} and action = 'appointment.update' and metadata->>'toStatus' is not null`);
    expect(keyed).toEqual({ n: 3 });
    const [ledgerRows] = await rows(raw`select count(*)::int as n from reminder_dispatches where tenant_id = ${tenantA}`);
    expect(ledgerRows).toEqual({ n: 13 });
  });

  it("an unassigned receptionist of the tenant: each count, each channel, to the row", async () => {
    const { readReminderNumbers } = await import("./reminder-numbers");
    const numbers = await readReminderNumbers({ tenantId: tenantA, role: "reception" as const, userId: A.reception }, { now: NOW });
    expect(numbers).toEqual({
      // v1, v3, v4, v5b, v6c, v9, v13, v15, v17, v21, v23   |   w1, w4, w5, w6, w7b, w8b, w11, w12, w13, w15, w17
      sms: { marksWithoutClaim: 11, claimsWithoutOutcome: 11 },
      // v1, v9, v10, v12, v13, v18, v22, v24           |   w9
      email: { marksWithoutClaim: 8, claimsWithoutOutcome: 1 },
    });
  });

  /**
   * THE SWITCH, BOTH WAYS. The arm above is the switch as it ships: off. This
   * one turns it on through the option only a test passes, and the three
   * visits with no scheduling event on their trail (v16, v19, v20) appear on
   * both channels. So the difference between the two answers is exactly those
   * visits, and the default really is the one that leaves them out.
   */
  it("the switch: off leaves out the visits that never had a reminder, on counts them, and nothing else moves", async () => {
    const { readReminderNumbers } = await import("./reminder-numbers");
    const { REMIND_VISITS_THAT_NEVER_HAD_A_REMINDER } = await import("./reminder-population");
    const viewer = { tenantId: tenantA, role: "reception" as const, userId: A.reception };
    expect(REMIND_VISITS_THAT_NEVER_HAD_A_REMINDER).toBe(false);

    const asShipped = await readReminderNumbers(viewer, { now: NOW });
    const off = await readReminderNumbers(viewer, { now: NOW, includeNeverReminded: false });
    const on = await readReminderNumbers(viewer, { now: NOW, includeNeverReminded: true });

    expect(off).toEqual(asShipped);
    expect(on).toEqual({
      // The eleven above, and v16, v19, v20.
      sms: { marksWithoutClaim: 14, claimsWithoutOutcome: 11 },
      // The eight above, and v16, v19, v20.
      email: { marksWithoutClaim: 11, claimsWithoutOutcome: 1 },
    });
  });

  it("a receptionist assigned to one clinic counts that clinic only", async () => {
    const { readReminderNumbers } = await import("./reminder-numbers");
    const numbers = await readReminderNumbers(
      { tenantId: tenantA, role: "reception" as const, userId: A.assignedReception },
      { now: NOW },
    );
    // Without v9 and w11, which are at Clinica Dois.
    expect(numbers).toEqual({
      sms: { marksWithoutClaim: 10, claimsWithoutOutcome: 10 },
      email: { marksWithoutClaim: 7, claimsWithoutOutcome: 1 },
    });
  });

  /**
   * THE FLOOR. Tenant C's dispatcher wrote its first claim two hours ago. A
   * reminder that fell due before that has no claim whatever became of it, and
   * the list under the counts may well show it as sent: counting it as "no
   * send attempt on record" would send reception to the telephone for a
   * patient who was reminded.
   */
  it("the first count starts where the claims start: a mark that fell due before the first claim is not counted, one at that instant is", async () => {
    const { readReminderNumbers } = await import("./reminder-numbers");
    const viewer = { tenantId: tenantC, role: "reception" as const, userId: C.reception };
    // NEGATIVE CONTROL: three visits still ahead, each booked by the clinic,
    // each with both marks over 30 minutes past and no claim at all. With no
    // floor this tenant would read sms 3, email 3.
    const [ahead] = await rows(raw`select count(*)::int as n from appointments
      where tenant_id = ${tenantC} and status = 'scheduled' and starts_at > ${NOW.toISOString()}`);
    expect(ahead).toEqual({ n: 3 });
    const [claims] = await rows(raw`select count(*)::int as n from reminder_claims
      where tenant_id = ${tenantC} and kind = 'claim'`);
    expect(claims).toEqual({ n: 1 });
    // And one row older than that claim, which is not a claim: with it as the
    // floor, c3 would be counted too.
    const [older] = await rows(raw`select count(*)::int as n from reminder_claims
      where tenant_id = ${tenantC} and kind = 'shadow' and created_at < ${TWO_HOURS_AGO_ISO}`);
    expect(older).toEqual({ n: 1 });

    expect(await readReminderNumbers(viewer, { now: NOW })).toEqual({
      // c1 and c2. Not c3: its mark is one second before the first claim.
      sms: { marksWithoutClaim: 2, claimsWithoutOutcome: 1 },
      // None: every 48 hour mark here fell due a day before the first claim.
      email: { marksWithoutClaim: 0, claimsWithoutOutcome: 0 },
    });
    // The floor does not depend on the switch.
    expect((await readReminderNumbers(viewer, { now: NOW, includeNeverReminded: true })).sms.marksWithoutClaim).toBe(2);
  });

  it("no claim in the last seven days: the first count is not a number, and it becomes one with the first claim", async () => {
    const { readReminderNumbers } = await import("./reminder-numbers");
    const viewer = { tenantId: tenantD, role: "reception" as const, userId: D.reception };
    // NEGATIVE CONTROL: the visit is there with both marks past, and so is a
    // claim, one second too old to be a floor.
    const [seeded] = await rows(raw`select
        (select count(*)::int from appointments where tenant_id = ${tenantD} and status = 'scheduled') as visits,
        (select count(*)::int from reminder_claims where tenant_id = ${tenantD} and kind = 'claim') as claims`);
    expect(seeded).toEqual({ visits: 1, claims: 1 });
    // And a row inside the seven days that is not a claim: the sweep's shadow row.
    const [watched] = await rows(raw`select count(*)::int as n from reminder_claims
      where tenant_id = ${tenantD} and kind = 'shadow' and created_at >= ${at(-7 * DAY).toISOString()}`);
    expect(watched).toEqual({ n: 1 });

    // Null, never 0: nobody counted, and a zero would say nothing was missed.
    expect(await readReminderNumbers(viewer, { now: NOW })).toEqual({
      sms: { marksWithoutClaim: null, claimsWithoutOutcome: 0 },
      email: { marksWithoutClaim: null, claimsWithoutOutcome: 0 },
    });

    // The first claim lands, ninety minutes ago, for some other visit. From
    // that instant the count is a number: d1's SMS mark fell due an hour ago,
    // after it, and d1's email mark fell due long before it.
    const [other] = await rows(raw`select id::text as id from appointments
      where tenant_id = ${tenantD} and status = 'completed'`);
    await claim({ tenant: tenantD, appointment: String(other!.id), offset: "48h", start: at(-3 * DAY), created: at(-90 * MIN) });
    expect(await readReminderNumbers(viewer, { now: NOW })).toEqual({
      sms: { marksWithoutClaim: 1, claimsWithoutOutcome: 0 },
      email: { marksWithoutClaim: 0, claimsWithoutOutcome: 1 },
    });
  });

  it("the other tenant counts its own rows and none of these", async () => {
    const { readReminderNumbers } = await import("./reminder-numbers");
    const numbers = await readReminderNumbers({ tenantId: tenantB, role: "reception" as const, userId: B.reception }, { now: NOW });
    expect(numbers).toEqual({
      sms: { marksWithoutClaim: 1, claimsWithoutOutcome: 1 },
      email: { marksWithoutClaim: 1, claimsWithoutOutcome: 0 },
    });
  });

  it("an admin reads the same counts as reception, and a therapist is refused", async () => {
    const { readReminderNumbers } = await import("./reminder-numbers");
    const admin = await readReminderNumbers({ tenantId: tenantA, role: "admin" as const, userId: A.reception }, { now: NOW });
    expect(admin.sms).toEqual({ marksWithoutClaim: 11, claimsWithoutOutcome: 11 });
    expect(admin.email).toEqual({ marksWithoutClaim: 8, claimsWithoutOutcome: 1 });

    const { ForbiddenError } = await import("@osteojp/auth");
    await expect(
      readReminderNumbers({ tenantId: tenantA, role: "therapist" as const, userId: A.therapist }, { now: NOW }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("a claim the dispatcher writes is the claim number one looks for: the same start, to the millisecond", async () => {
    // The seeds above are written by this file. This arm closes the loop with
    // the real writer: takeReminderClaim stores the start as an instant, the
    // count compares the visit's own start with it, and one must find the other.
    const { takeReminderClaim } = await import("./reminder-claim");
    const { readReminderNumbers } = await import("./reminder-numbers");
    const viewer = { tenantId: tenantB, role: "reception" as const, userId: B.reception };
    // Tenant B's one visit still ahead, seeded above at NOW plus 23 hours.
    const start = bVisit.start;
    expect((await readReminderNumbers(viewer, { now: NOW })).sms.marksWithoutClaim, "before the claim").toBe(1);

    // Taken at its mark, so it is not early.
    await takeReminderClaim({
      tenantId: tenantB,
      appointmentId: bVisit.id,
      offsetId: "24h",
      channel: "sms",
      startsAt: start,
      taker: "run",
      now: new Date(start.getTime() - 24 * HOUR),
    });
    const after = await readReminderNumbers(viewer, { now: NOW });
    // The SMS mark now has its claim; the email mark still has none.
    expect(after.sms.marksWithoutClaim).toBe(0);
    expect(after.email.marksWithoutClaim).toBe(1);
  });
});
