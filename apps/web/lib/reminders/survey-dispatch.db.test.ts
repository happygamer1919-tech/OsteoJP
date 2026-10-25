/**
 * survey-dispatch.db.test.ts - SAT-01, the automatic send against a REAL Postgres.
 *
 * WHAT IT PROVES, and why each arm needs a database:
 *
 *   1. The send is ISSUED by migration 0102's own door, under the reminder
 *      job's tenant context: one row in `appointment_survey_sends`, the code's
 *      HMAC beside it, and the link in the message is a link the page's own
 *      door resolves. A mocked issue proves none of that.
 *   2. What the DATABASE decides (spec 9.2): a patient who opted out, a send in
 *      the last 60 days whether automatic or manual, two runs waking together
 *      for one patient, and the second patient of a shared visit.
 *   3. Every outcome lands in `reminder_dispatches` through the real INSERT
 *      policy and past 0075's CHECKs, with the survey's new reasons. A reason
 *      the table refused would lose the row silently (`recordDispatch` never
 *      throws), so the rows are read back.
 *   4. NO STORED ROW CARRIES A LINK OR A CODE (spec 3.6, A7): every table the
 *      send writes is read back whole, as text, and searched for every code
 *      this suite sent.
 *   5. With the switch off, NOTHING in the database changes.
 *
 * The two SEND functions are the only seam replaced: they capture the whole
 * message. One arm hands the sends back to the real notify gate with live send
 * off. NO PROVIDER IS REACHABLE FROM HERE: the live-send flags and the
 * provider's key are removed from the environment before every test.
 *
 * Its own tenant, built here and removed afterwards. Every name, address and
 * phone number is invented. READ-BACKS ARE ON THE ADMIN CONNECTION.
 *
 * Skipped without DATABASE_URL.
 */
import { randomUUID } from "node:crypto";
import { sql as raw } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { formatDateLong } from "./locale";

vi.mock("server-only", () => ({}));

type Sent = { templateId: string; to: string; subject?: string; body: string };
const h = vi.hoisted(() => ({
  email: [] as Sent[],
  sms: [] as Sent[],
  realGate: false,
}));

vi.mock("./clients", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./clients")>();
  return {
    ...actual,
    sendEmail: vi.fn(async (m: Parameters<typeof actual.sendEmail>[0]) => {
      if (h.realGate) return actual.sendEmail(m);
      h.email.push({ templateId: m.templateId, to: m.to, subject: m.subject, body: m.body });
      return { channel: "email" as const, sandbox: false, id: `db-test-email-${randomUUID()}` };
    }),
    sendSms: vi.fn(async (m: Parameters<typeof actual.sendSms>[0]) => {
      if (h.realGate) return actual.sendSms(m);
      h.sms.push({ templateId: m.templateId, to: m.to, body: m.body });
      return { channel: "sms" as const, sandbox: false, id: `db-test-sms-${randomUUID()}` };
    }),
  };
});

const live = Boolean(process.env.DATABASE_URL);
const d = live ? describe : describe.skip;

const SECRET = "sat01-send-test-secret";
const ORIGIN = "https://app.jp.invalid";
const DAY = 24 * 60 * 60 * 1000;

const NORTH = { name: "Clinica Norte", phone: "+351 210 222 222" };
const SOUTH = { name: "Clinica Sul", phone: "+351 272 111 111" };
const TENANT_PHONE = "+351 210 999 999";

d("SAT-01: the automatic survey send against a real database", () => {
  let db: ReturnType<typeof import("@osteojp/db").getDbAdmin>;
  let dispatchSurvey: typeof import("./dispatch").dispatchSurvey;
  let store: typeof import("@/lib/surveys/survey-store");
  let codes: typeof import("@/lib/surveys/survey-code");

  const tenant = randomUUID();
  const otherTenant = randomUUID();
  const therapist = randomUUID();
  const loc = { north: randomUUID(), south: randomUUID(), bare: randomUUID() };
  const run = tenant.slice(0, 8);
  /** Every code this suite put in a message, for the last arm. */
  const sentCodes: string[] = [];

  const rowsOf = <T>(result: unknown): T[] =>
    (Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? [])) as T[];
  const all = async <T>(query: ReturnType<typeof raw>): Promise<T[]> => rowsOf<T>(await db.execute(query));

  let serial = 0;
  async function patient(over: { email?: string | null; phone?: string | null } = {}): Promise<string> {
    const n = ++serial;
    const id = randomUUID();
    const email = over.email === undefined ? `paciente-${n}-${run}@sat01send.test` : over.email;
    const phone = over.phone === undefined ? `9120${String(n).padStart(5, "0")}` : over.phone;
    await db.execute(
      raw`insert into patients (id, tenant_id, full_name, email, phone)
          values (${id}::uuid, ${tenant}::uuid, ${`Paciente Fixture ${run} ${n}`}, ${email}, ${phone})`,
    );
    return id;
  }

  /** One visit, each in a slot of its own. Concluded visits ended yesterday. */
  async function visit(args: {
    patientId: string;
    locationId?: string;
    status?: string;
    secondPatientId?: string;
  }): Promise<string> {
    const n = ++serial;
    const id = randomUUID();
    const startsAt = new Date(Date.now() - 2 * DAY - n * 2 * 3_600_000);
    const endsAt = new Date(startsAt.getTime() + 45 * 60_000);
    await db.execute(
      raw`insert into appointments (id, tenant_id, patient_id, patient_2_id, practitioner_id, location_id,
                                    starts_at, ends_at, status)
          values (${id}::uuid, ${tenant}::uuid, ${args.patientId}::uuid, ${args.secondPatientId ?? null}::uuid,
                  ${therapist}::uuid, ${args.locationId ?? loc.north}::uuid,
                  ${startsAt.toISOString()}::timestamptz, ${endsAt.toISOString()}::timestamptz,
                  ${args.status ?? "completed"}::appointment_status)`,
    );
    return id;
  }

  /** A patient with one concluded visit: the ordinary case. */
  async function concluded(over: Parameters<typeof patient>[0] = {}, locationId?: string) {
    const patientId = await patient(over);
    return { patientId, appointmentId: await visit({ patientId, locationId }) };
  }

  /** A send that already exists for a patient, `daysAgo` old, seeded in the database. */
  async function earlierSend(patientId: string, origin: "automatic" | "manual", daysAgo: number) {
    const appointmentId = await visit({ patientId });
    await db.execute(
      raw`insert into appointment_survey_sends
            (tenant_id, appointment_id, patient_id, location_id, channel, origin, sent_by, sent_at)
          values (${tenant}::uuid, ${appointmentId}::uuid, ${patientId}::uuid, ${loc.north}::uuid, 'email',
                  ${origin}, ${origin === "manual" ? therapist : null}::uuid,
                  now() - make_interval(days => ${daysAgo}::int))`,
    );
  }

  const ledger = (appointmentId: string) =>
    all<{ channel: string; template_id: string; outcome: string; suppression_reason: string | null }>(
      raw`select channel, template_id, outcome, suppression_reason
            from reminder_dispatches where appointment_id = ${appointmentId}::uuid order by created_at, id`,
    );

  const sendsOf = (patientId: string) =>
    all<{ appointment_id: string; channel: string; origin: string; sent_by: string | null; location_id: string; hash: string | null }>(
      raw`select s.appointment_id::text as appointment_id, s.channel, s.origin, s.sent_by::text as sent_by,
                 s.location_id::text as location_id, c.code_hash as hash
            from appointment_survey_sends s
            left join appointment_survey_codes c on c.send_id = s.id
           where s.patient_id = ${patientId}::uuid and s.sent_at > now() - interval '1 day'
           order by s.sent_at, s.id`,
    );

  /**
   * Everything the send could write, as digests of whole rows. THIS TENANT'S
   * ROWS ONLY: the DB-gated files of this workspace run side by side on one
   * database, so a count over a whole table moves under another suite's writes.
   */
  const snapshot = async () =>
    (
      await all<Record<string, string | number>>(raw`
        select
          (select coalesce(md5(string_agg(s::text, '|' order by s.id)), 'none')
             from appointment_survey_sends s where s.tenant_id = ${tenant}::uuid) as sends,
          (select coalesce(md5(string_agg(c::text, '|' order by c.code_hash)), 'none')
             from appointment_survey_codes c where c.tenant_id = ${tenant}::uuid) as codes,
          (select coalesce(md5(string_agg(r::text, '|' order by r.id)), 'none')
             from appointment_survey_responses r where r.tenant_id = ${tenant}::uuid) as answers,
          (select coalesce(md5(string_agg(l::text, '|' order by l.id)), 'none')
             from reminder_dispatches l where l.tenant_id = ${tenant}::uuid) as ledger,
          (select coalesce(md5(string_agg(a::text, '|' order by a.id)), 'none')
             from audit_log a where a.tenant_id = ${tenant}::uuid) as audit,
          (select coalesce(md5(string_agg(p::text, '|' order by p.id)), 'none')
             from patients p where p.tenant_id = ${tenant}::uuid) as patients
      `)
    )[0]!;

  /** The code a captured message carries, read from its link. */
  function codeIn(message: Sent): string {
    const found = message.body.match(/\/s\/([A-Za-z0-9_-]{8})(?:\s|$)/);
    expect(found, "the message carries no survey link").not.toBeNull();
    sentCodes.push(found![1]!);
    return found![1]!;
  }

  const ENV_KEYS = [
    "SURVEY_SEND_MODE",
    "SURVEY_CANARY_PATIENT_IDS",
    "REMINDERS_LIVE_SEND",
    "INVITES_LIVE_SEND",
    "RESEND_API_KEY",
    "TWILIO_ACCOUNT_SID",
    "TWILIO_AUTH_TOKEN",
    "REMINDERS_CONFIRM_CODE_SECRET",
    "REMINDERS_RESCHEDULE_BASE_URL",
  ] as const;
  const saved: Record<string, string | undefined> = {};
  /** Every line logged by any arm, kept for the last one. */
  const logged: string[] = [];

  beforeAll(async () => {
    const schema = await import("@osteojp/db");
    db = schema.getDbAdmin();
    ({ dispatchSurvey } = await import("./dispatch"));
    store = await import("@/lib/surveys/survey-store");
    codes = await import("@/lib/surveys/survey-code");

    // A tenant-level phone that DIFFERS from every location's, so any use shows.
    await db.execute(
      raw`insert into tenants (id, name, slug, settings)
          values (${tenant}::uuid, 'sat01 send', ${"sat01send-" + run},
                  ${JSON.stringify({ locale: "pt", contacts: { phone: TENANT_PHONE } })}::jsonb)`,
    );
    await db.execute(
      raw`insert into tenants (id, name, slug) values (${otherTenant}::uuid, 'sat01 outra', ${"sat01outra-" + run})`,
    );
    await db.execute(
      raw`insert into users (id, tenant_id, email, full_name)
          values (${therapist}::uuid, ${tenant}::uuid, ${`terapeuta-${run}@sat01send.test`}, 'Dra Inventada')`,
    );
    await db.execute(
      raw`insert into locations (id, tenant_id, name, phone)
          values (${loc.north}::uuid, ${tenant}::uuid, ${NORTH.name}, ${NORTH.phone})`,
    );
    await db.execute(
      raw`insert into locations (id, tenant_id, name, phone)
          values (${loc.south}::uuid, ${tenant}::uuid, ${SOUTH.name}, ${SOUTH.phone})`,
    );
    // A location with NO phone.
    await db.execute(
      raw`insert into locations (id, tenant_id, name) values (${loc.bare}::uuid, ${tenant}::uuid, 'Clinica Sem Telefone')`,
    );
  });

  afterAll(async () => {
    if (!db) return;
    const statements = [
      raw`delete from reminder_dispatches where tenant_id in (${tenant}::uuid, ${otherTenant}::uuid)`,
      raw`delete from appointment_survey_responses where tenant_id = ${tenant}::uuid`,
      raw`delete from appointment_survey_sends where tenant_id = ${tenant}::uuid`,
      raw`delete from appointments where tenant_id = ${tenant}::uuid`,
      raw`delete from audit_log where tenant_id in (${tenant}::uuid, ${otherTenant}::uuid)`,
      raw`delete from patients where tenant_id = ${tenant}::uuid`,
      raw`delete from users where tenant_id = ${tenant}::uuid`,
      raw`delete from locations where tenant_id = ${tenant}::uuid`,
      raw`delete from tenants where id in (${tenant}::uuid, ${otherTenant}::uuid)`,
    ];
    let first: unknown = null;
    for (const statement of statements) {
      try {
        await db.execute(statement);
      } catch (err) {
        first ??= err;
      }
    }
    if (first) throw first;
  });

  beforeEach(() => {
    for (const k of ENV_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    process.env.SURVEY_SEND_MODE = "on";
    process.env.REMINDERS_CONFIRM_CODE_SECRET = SECRET;
    process.env.REMINDERS_RESCHEDULE_BASE_URL = ORIGIN;
    h.email.length = 0;
    h.sms.length = 0;
    h.realGate = false;
    for (const level of ["log", "info", "warn", "error"] as const) {
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        logged.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
      });
    }
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    vi.restoreAllMocks();
  });

  /* ------------------------------------------------------------------ */
  /* The send                                                            */
  /* ------------------------------------------------------------------ */

  it("EMAIL: one send row, the code's hash, a link the page resolves, and that location's phone", async () => {
    const north = await concluded({}, loc.north);
    const south = await concluded({}, loc.south);

    expect(await dispatchSurvey(tenant, north.appointmentId)).toMatchObject({ dispatched: true });
    expect(await dispatchSurvey(tenant, south.appointmentId)).toMatchObject({ dispatched: true });

    expect(h.sms).toEqual([]);
    expect(h.email).toHaveLength(2);
    const [first, second] = h.email as [Sent, Sent];
    for (const m of [first, second]) {
      expect(m.templateId).toBe("survey.email");
      expect(m.body).not.toMatch(/[{}]/);
      expect(m.body).toContain("Olá Paciente,");
      expect(m.body).not.toContain(TENANT_PHONE);
    }
    // Each from its own location's row, read by the real joined read.
    expect(first.body).toContain(`contacte a clínica: ${NORTH.phone}`);
    expect(first.body).not.toContain(SOUTH.phone);
    expect(second.body).toContain(`contacte a clínica: ${SOUTH.phone}`);
    expect(second.body).not.toContain(NORTH.phone);

    const code = codeIn(first);
    codeIn(second);
    expect(first.body).toContain(`Responder: ${ORIGIN}/s/${code}\n`);
    expect(await sendsOf(north.patientId)).toEqual([
      {
        appointment_id: north.appointmentId,
        channel: "email",
        origin: "automatic",
        sent_by: null,
        location_id: loc.north,
        hash: codes.hashSurveyCode(code),
      },
    ]);
    // The link works: the page's own door resolves it to this appointment.
    expect(await store.resolveSurveyCode({ code })).toMatchObject({
      tenantId: tenant,
      appointmentId: north.appointmentId,
    });
    expect(await ledger(north.appointmentId)).toEqual([
      { channel: "email", template_id: "survey.email", outcome: "sent", suppression_reason: null },
    ]);
    // An automatic send writes no audit row (spec 6.7): the ledger is its record.
    expect(
      await all(raw`select 1 from audit_log where tenant_id = ${tenant}::uuid and entity_id = ${north.appointmentId}::uuid`),
    ).toEqual([]);
  });

  it("the date the email prints is the day before the Lisbon day the DATABASE lets the link die on", async () => {
    const v = await concluded({}, loc.north);
    expect(await dispatchSurvey(tenant, v.appointmentId)).toMatchObject({ dispatched: true });

    // Postgres does the arithmetic here, on the row's own `sent_at` and with
    // the door's own `interval '14 days'`: the Lisbon date of that instant,
    // less one day (owner ruling, 2026-10-13). The application counted from its
    // own clock, a moment before the row was written, so a run that straddles
    // Lisbon midnight to the millisecond can read a day apart.
    const [row] = await all<{ dies_on: string; day_before: string }>(
      raw`select to_char((s.sent_at + interval '14 days') at time zone 'Europe/Lisbon', 'YYYY-MM-DD') as dies_on,
                 to_char(((s.sent_at + interval '14 days') at time zone 'Europe/Lisbon')::date - 1, 'YYYY-MM-DD') as day_before
            from appointment_survey_sends s
           where s.appointment_id = ${v.appointmentId}::uuid`,
    );
    if (!row) throw new Error("no send row");
    const long = (day: string) => formatDateLong(new Date(`${day}T12:00:00Z`), "pt");

    const mail = h.email.at(-1);
    if (!mail) throw new Error("no email");
    // Every code this suite sends is counted by the last arm.
    codeIn(mail);
    expect(mail.body).toContain(`é válida até ${long(row.day_before)}.`);
    expect(mail.body).not.toContain(long(row.dies_on));
  });

  it("SMS when there is no email: the three lines, and a send row on the sms channel", async () => {
    const v = await concluded({ email: null });

    expect(await dispatchSurvey(tenant, v.appointmentId)).toMatchObject({ dispatched: true });

    expect(h.email).toEqual([]);
    const sms = h.sms[0]!;
    expect(h.sms).toHaveLength(1);
    const code = codeIn(sms);
    expect(sms.templateId).toBe("survey.sms");
    expect(sms.body).toMatch(
      /^OsteoJP: avaliacao da consulta de \d\d\/\d\d\nResponder: app\.jp\.invalid\/s\/[A-Za-z0-9_-]{8}\nPara nao receber mais avaliacoes, use a mesma ligacao\.$/,
    );
    expect(await sendsOf(v.patientId)).toMatchObject([
      { appointment_id: v.appointmentId, channel: "sms", origin: "automatic", hash: codes.hashSurveyCode(code) },
    ]);
    expect(await ledger(v.appointmentId)).toEqual([
      { channel: "sms", template_id: "survey.sms", outcome: "sent", suppression_reason: null },
    ]);
  });

  it("the second patient of a shared visit is never asked", async () => {
    const first = await patient();
    const second = await patient();
    const appointmentId = await visit({ patientId: first, secondPatientId: second });

    expect(await dispatchSurvey(tenant, appointmentId)).toMatchObject({ dispatched: true });

    expect(h.sms).toEqual([]);
    expect(h.email).toHaveLength(1);
    codeIn(h.email[0]!);
    const [{ email: firstEmail }] = await all<{ email: string }>(
      raw`select email from patients where id = ${first}::uuid`,
    );
    expect(h.email[0]!.to).toBe(firstEmail);
    expect(await sendsOf(first)).toHaveLength(1);
    expect(await sendsOf(second)).toEqual([]);
  });

  /* ------------------------------------------------------------------ */
  /* What the database refuses                                           */
  /* ------------------------------------------------------------------ */

  it("a patient who opted out: no send, no message, a suppressed row", async () => {
    const v = await concluded();
    await db.execute(raw`update patients set survey_enabled = false where id = ${v.patientId}::uuid`);

    expect(await dispatchSurvey(tenant, v.appointmentId)).toEqual({
      dispatched: false,
      reason: "survey_not_eligible",
    });

    expect(h.email).toEqual([]);
    expect(h.sms).toEqual([]);
    expect(await sendsOf(v.patientId)).toEqual([]);
    expect(await ledger(v.appointmentId)).toEqual([
      { channel: "email", template_id: "survey.email", outcome: "suppressed", suppression_reason: "survey_not_eligible" },
    ]);
  });

  it.each([
    ["automatic", 59, false],
    ["manual", 59, false],
    ["automatic", 61, true],
    ["manual", 61, true],
  ] as const)("a %s send %i days ago: issued is %s", async (origin, daysAgo, issued) => {
    const patientId = await patient();
    await earlierSend(patientId, origin, daysAgo);
    const appointmentId = await visit({ patientId });

    const outcome = await dispatchSurvey(tenant, appointmentId);

    if (issued) {
      expect(outcome).toMatchObject({ dispatched: true });
      expect(h.email).toHaveLength(1);
      codeIn(h.email[0]!);
      expect(await ledger(appointmentId)).toEqual([
        { channel: "email", template_id: "survey.email", outcome: "sent", suppression_reason: null },
      ]);
    } else {
      expect(outcome).toEqual({ dispatched: false, reason: "survey_cooldown" });
      expect(h.email).toEqual([]);
      expect(await sendsOf(patientId)).toEqual([]);
      expect(await ledger(appointmentId)).toEqual([
        { channel: "email", template_id: "survey.email", outcome: "suppressed", suppression_reason: "survey_cooldown" },
      ]);
    }
  });

  /**
   * Q-O. A "Corrigir estado" into Concluida asks for the survey ALONE
   * (`surveyOnly`). The 60-day rule is the database's, so it is proven here:
   * the same door answers the correction's run as it answers an ordinary one.
   */
  it.each([
    ["automatic", 59, false],
    ["manual", 59, false],
    ["automatic", 61, true],
  ] as const)(
    "Q-O, a correction's survey-only run, a %s send %i days ago: issued is %s, and never a follow-up",
    async (origin, daysAgo, issued) => {
      const patientId = await patient();
      await earlierSend(patientId, origin, daysAgo);
      const appointmentId = await visit({ patientId });

      const outcome = await dispatchSurvey(tenant, appointmentId, { surveyOnly: true });

      expect([...h.email, ...h.sms].filter((m) => m.templateId.startsWith("follow_up."))).toEqual([]);
      if (issued) {
        expect(outcome).toMatchObject({ dispatched: true });
        expect(h.email.map((m) => m.templateId)).toEqual(["survey.email"]);
        codeIn(h.email[0]!);
        expect(await sendsOf(patientId)).toHaveLength(1);
      } else {
        expect(outcome).toEqual({ dispatched: false, reason: "survey_cooldown" });
        expect(h.email).toEqual([]);
        expect(await sendsOf(patientId)).toEqual([]);
        expect(await ledger(appointmentId)).toEqual([
          { channel: "email", template_id: "survey.email", outcome: "suppressed", suppression_reason: "survey_cooldown" },
        ]);
      }
    },
  );

  it("Q-O, switch off, a correction's survey-only run: nothing is sent and NOTHING in the database changes", async () => {
    const v = await concluded();
    process.env.SURVEY_SEND_MODE = "off";
    const before = await snapshot();

    expect(await dispatchSurvey(tenant, v.appointmentId, { surveyOnly: true })).toEqual({
      dispatched: false,
      reason: "survey_only",
    });

    expect(h.email).toEqual([]);
    expect(h.sms).toEqual([]);
    expect(await snapshot()).toEqual(before);
  });

  it("two runs waking together for one patient (a series concluded in one save): ONE send, ONE message", async () => {
    const patientId = await patient();
    const a = await visit({ patientId });
    const b = await visit({ patientId });

    const outcomes = await Promise.all([dispatchSurvey(tenant, a), dispatchSurvey(tenant, b)]);

    expect(outcomes.filter((o) => o.dispatched)).toHaveLength(1);
    expect(outcomes.filter((o) => !o.dispatched)).toEqual([{ dispatched: false, reason: "survey_cooldown" }]);
    expect(h.email).toHaveLength(1);
    codeIn(h.email[0]!);
    expect(await sendsOf(patientId)).toHaveLength(1);
    const rows = [...(await ledger(a)), ...(await ledger(b))].map((r) => `${r.outcome}:${r.suppression_reason}`);
    expect(rows.sort()).toEqual(["sent:null", "suppressed:survey_cooldown"]);
  });

  it.each([
    ["no longer concluded", async () => {
      const patientId = await patient();
      return { patientId, appointmentId: await visit({ patientId, status: "scheduled" }) };
    }, "email", "status"],
    ["no contact", () => concluded({ email: null, phone: null }), "email", "no_contact"],
    ["a landline and no email", () => concluded({ email: null, phone: "214000000" }), "sms", "landline"],
    ["a location with no phone", () => concluded({}, loc.bare), "email", "location_contact_missing"],
  ] as const)("%s: nothing issued, and the row with its reason is stored", async (_label, make, channel, reason) => {
    const v = await make();

    expect(await dispatchSurvey(tenant, v.appointmentId)).toEqual({ dispatched: false, reason });

    expect(h.email).toEqual([]);
    expect(h.sms).toEqual([]);
    expect(await sendsOf(v.patientId)).toEqual([]);
    expect(await ledger(v.appointmentId)).toEqual([
      { channel, template_id: `survey.${channel}`, outcome: "suppressed", suppression_reason: reason },
    ]);
  });

  it("a body that cannot be built (no origin for the link) leaves NO send and NO code row", async () => {
    delete process.env.REMINDERS_RESCHEDULE_BASE_URL;
    const byEmail = await concluded();
    const bySms = await concluded({ email: null });
    const before = await snapshot();

    expect(await dispatchSurvey(tenant, byEmail.appointmentId)).toMatchObject({ reason: "body_refused" });
    expect(await dispatchSurvey(tenant, bySms.appointmentId)).toMatchObject({ reason: "body_refused" });

    const after = await snapshot();
    expect({ ...after, ledger: null }).toEqual({ ...before, ledger: null });
    expect(h.email).toEqual([]);
    expect(h.sms).toEqual([]);
    expect(await ledger(byEmail.appointmentId)).toEqual([
      { channel: "email", template_id: "survey.email", outcome: "suppressed", suppression_reason: "body_refused" },
    ]);
    expect(await ledger(bySms.appointmentId)).toEqual([
      { channel: "sms", template_id: "survey.sms", outcome: "suppressed", suppression_reason: "body_refused" },
    ]);
  });

  it("the code key is not set: the issue throws, a row is left, and no send exists", async () => {
    delete process.env.REMINDERS_CONFIRM_CODE_SECRET;
    const v = await concluded();

    await expect(dispatchSurvey(tenant, v.appointmentId)).rejects.toThrow("REMINDERS_CONFIRM_CODE_SECRET is not set");

    expect(h.email).toEqual([]);
    expect(await sendsOf(v.patientId)).toEqual([]);
    expect(await ledger(v.appointmentId)).toEqual([
      { channel: "email", template_id: "survey.email", outcome: "suppressed", suppression_reason: "survey_issue_error" },
    ]);
  });

  it("a job of another tenant cannot issue for this tenant's appointment", async () => {
    const v = await concluded();

    expect(await dispatchSurvey(otherTenant, v.appointmentId)).toEqual({ dispatched: false, reason: "not_found" });

    expect(h.email).toEqual([]);
    expect(await sendsOf(v.patientId)).toEqual([]);
    // The `not_found` row is filed in the CALLING tenant's ledger, as the
    // reminder's own `not_found` row is (0075's insert policy checks the
    // tenant of the row, and the appointment exists). This tenant's ledger
    // gets nothing.
    expect(
      await all(
        raw`select tenant_id::text as tenant_id, suppression_reason from reminder_dispatches
             where appointment_id = ${v.appointmentId}::uuid`,
      ),
    ).toEqual([{ tenant_id: otherTenant, suppression_reason: "not_found" }]);
  });

  /* ------------------------------------------------------------------ */
  /* The switch                                                          */
  /* ------------------------------------------------------------------ */

  it.each([[undefined], ["off"], ["ON"], [" on"]])(
    "switch reads off (%j): no code, no survey row, no ledger row, nothing in the database changes",
    async (value) => {
      const v = await concluded();
      if (value === undefined) delete process.env.SURVEY_SEND_MODE;
      else process.env.SURVEY_SEND_MODE = value;
      // The real gate: with live send off it reaches no provider, and the two
      // follow-up bodies are unapproved besides.
      h.realGate = true;
      const before = await snapshot();

      const outcome = await dispatchSurvey(tenant, v.appointmentId);

      // What main returns for a concluded visit today: a "dispatch" of two
      // messages the gate held back.
      expect(outcome).toEqual({
        dispatched: true,
        channels: [
          { channel: "email", sandbox: true, id: expect.any(String) },
          { channel: "sms", sandbox: true, id: expect.any(String) },
        ],
      });
      expect(await snapshot()).toEqual(before);
      expect(await ledger(v.appointmentId)).toEqual([]);
      expect(await sendsOf(v.patientId)).toEqual([]);
    },
  );

  it("canary: the listed patient is sent to; the unlisted one is not, and the ledger says why", async () => {
    const listed = await concluded();
    const unlisted = await concluded();
    process.env.SURVEY_SEND_MODE = "canary";
    process.env.SURVEY_CANARY_PATIENT_IDS = `${randomUUID()}, ${listed.patientId}`;

    expect(await dispatchSurvey(tenant, listed.appointmentId)).toMatchObject({ dispatched: true });
    const surveyMail = h.email.filter((m) => m.templateId === "survey.email");
    expect(surveyMail).toHaveLength(1);
    codeIn(surveyMail[0]!);
    h.email.length = 0;
    h.sms.length = 0;

    await dispatchSurvey(tenant, unlisted.appointmentId);

    // As off: the follow-up's two bodies and no survey.
    expect([...h.email, ...h.sms].map((m) => m.templateId).sort()).toEqual(["follow_up.email", "follow_up.sms"]);
    expect(await sendsOf(listed.patientId)).toHaveLength(1);
    expect(await sendsOf(unlisted.patientId)).toEqual([]);
    expect(await ledger(listed.appointmentId)).toEqual([
      { channel: "email", template_id: "survey.email", outcome: "sent", suppression_reason: null },
    ]);
    expect(await ledger(unlisted.appointmentId)).toEqual([
      {
        channel: "email",
        template_id: "survey.email",
        outcome: "suppressed",
        suppression_reason: "survey_canary_not_listed",
      },
    ]);
  });

  it("live send off, through the real gate: the send is issued and the row says the gate held the message", async () => {
    const v = await concluded();
    h.realGate = true;

    expect(await dispatchSurvey(tenant, v.appointmentId)).toEqual({
      dispatched: true,
      channels: [{ channel: "email", sandbox: true, id: expect.any(String) }],
    });

    expect(await ledger(v.appointmentId)).toEqual([
      { channel: "email", template_id: "survey.email", outcome: "suppressed", suppression_reason: "live_send_disabled" },
    ]);
    // THE COST, PINNED AS IT IS: the send row exists although no message left.
    expect(await sendsOf(v.patientId)).toHaveLength(1);
  });

  /* ------------------------------------------------------------------ */
  /* A7, last: over everything the arms above wrote                      */
  /* ------------------------------------------------------------------ */

  it("NO stored row carries a link or a code, in any table the send writes", async () => {
    // Positive controls: there is something to search, and something to find.
    expect(sentCodes.length).toBeGreaterThanOrEqual(8);
    expect(new Set(sentCodes).size).toBe(sentCodes.length);

    const tables = {
      appointment_survey_sends: await all<{ t: string }>(
        raw`select s::text as t from appointment_survey_sends s where s.tenant_id = ${tenant}::uuid`,
      ),
      appointment_survey_codes: await all<{ t: string }>(
        raw`select c::text as t from appointment_survey_codes c where c.tenant_id = ${tenant}::uuid`,
      ),
      reminder_dispatches: await all<{ t: string }>(
        raw`select l::text as t from reminder_dispatches l where l.tenant_id in (${tenant}::uuid, ${otherTenant}::uuid)`,
      ),
      audit_log: await all<{ t: string }>(
        raw`select a::text as t from audit_log a where a.tenant_id in (${tenant}::uuid, ${otherTenant}::uuid)`,
      ),
    };
    expect(tables.appointment_survey_sends.length).toBeGreaterThanOrEqual(sentCodes.length);
    expect(tables.appointment_survey_codes.length).toBe(sentCodes.length + 1);
    expect(tables.reminder_dispatches.length).toBeGreaterThanOrEqual(sentCodes.length);

    for (const [table, rows] of Object.entries(tables)) {
      const text = rows.map((r) => r.t).join("\n");
      for (const code of sentCodes) {
        expect(text.includes(code), `${table} holds a survey code`).toBe(false);
      }
      expect(text, `${table} holds a survey link`).not.toMatch(/\/s\/[A-Za-z0-9_-]{8}/);
      expect(text, `${table} names the link's host`).not.toContain("app.jp.invalid");
    }

    // What the codes table DOES hold: each sent code's HMAC, and nothing shorter.
    const hashes = await all<{ code_hash: string }>(
      raw`select code_hash from appointment_survey_codes where tenant_id = ${tenant}::uuid`,
    );
    for (const { code_hash } of hashes) expect(code_hash).toMatch(/^[0-9a-f]{64}$/);
    for (const code of sentCodes) {
      expect(hashes.map((r) => r.code_hash)).toContain(codes.hashSurveyCode(code));
    }
    // And nothing any arm logged carries one either. The control: the arms did log.
    expect(logged.length).toBeGreaterThan(0);
    for (const code of sentCodes) expect(logged.join("\n").includes(code), "a log line holds a survey code").toBe(false);
    expect(logged.join("\n")).not.toMatch(/\/s\/[A-Za-z0-9_-]{8}/);
  });
});
