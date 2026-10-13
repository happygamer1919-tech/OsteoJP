/**
 * survey-opt-out.db.test.ts: SAT-01 (S8). THE OPT-OUT ON THE SURVEY PAGE
 * `/s/<code>`, AGAINST A REAL DATABASE, AS THE ROLE THE APPLICATION RUNS AS.
 *
 * "Não quero receber mais avaliações" is the second write on a surface built
 * to emit no signal. What only a database can show (spec 5.2, 5.3, 9.1, 9.3):
 *
 *   1. IT WRITES WHAT THE SPEC NAMES AND NOTHING ELSE. The send's patient's
 *      survey switch goes off; the send is consumed as an opt-out; one
 *      `survey.opt_out` audit row and the switch's own `survey.switch_changed`
 *      row are written. No answer exists. Both reminder switches, every other
 *      column of the patient, and every other patient are as they were.
 *   2. ONE REFUSAL FOR EVERY CODE THAT IS NOT VALID. Malformed, never issued,
 *      issued under another key, a live CONFIRM code, expired, already
 *      answered, already used to opt out and no longer eligible are each
 *      refused by the opt-out with the same redirect, land on byte-identical
 *      HTML, and move nothing. The page a bad code gets has no opt-out on it.
 *   3. NO SEND PATH OVERRIDES IT. After the opt-out the automatic door refuses
 *      that patient, and the link is spent: it cannot be answered.
 *   4. ONE BUDGET, BEFORE THE DOOR. Answers and opt-outs from one address
 *      count together; the eleventh post in a minute is refused before the
 *      database is asked, and its refusal is the page a bad code gets.
 *   5. ONE OUTCOME PER LINK. Two opt-outs at once produce one; an opt-out and
 *      an answer at once produce one or the other, never both.
 *   6. NOTHING ABOUT THE PATIENT IS LOGGED: no name, phone, email or code.
 *
 * NOTHING BETWEEN THE PAGE AND POSTGRES IS REPLACED. The action, the store,
 * the door `opt_out_survey` (migration 0102), `withReminderTenantContext`, the
 * limiter and its table are the real ones. The only stand-ins are
 * `next/headers` and `next/navigation`, which need a request, and
 * `server-only`.
 *
 * EVERY COUNT IS OF THIS SUITE'S OWN TENANT, and the limiter's rows are found
 * by the addresses this suite invented. Other suites write to the same
 * database at the same time; a count over a whole table would be theirs too.
 *
 * READ-BACKS ARE ON THE ADMIN CONNECTION, so RLS hides nothing from them.
 *
 * THE FIXTURE IS BUILT, NEVER BORROWED: a tenant of its own, removed
 * afterwards. Invented names only. It globs into
 * `.github/workflows/db-tests.yml` with every `.db.test.ts` of this workspace
 * and self-skips without DATABASE_URL.
 */
import { randomUUID } from "node:crypto";
import { sql as raw } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const request = vi.hoisted(() => ({ ip: "" }));
vi.mock("next/headers", () => ({
  headers: async () => ({
    get: (name: string) => (name === "x-forwarded-for" ? request.ip : null),
  }),
}));
// `redirect` throws in Next; the actions rely on that to stop.
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

const live = Boolean(process.env.DATABASE_URL);
const d = live ? describe : describe.skip;

const SECRET = "sat01-optout-test-secret";
const DAY = 24 * 60 * 60 * 1000;

d("SAT-01: the opt-out on the survey page against a real database", () => {
  let db: ReturnType<typeof import("@osteojp/db").getDbAdmin>;
  let store: typeof import("./survey-store");
  let codes: typeof import("./survey-code");
  let SurveyPage: typeof import("@/app/s/[code]/page").default;
  let submitSurveyAction: typeof import("@/app/s/[code]/actions").submitSurveyAction;
  let optOutSurveyAction: typeof import("@/app/s/[code]/actions").optOutSurveyAction;
  let withReminderTenantContext: typeof import("@/lib/reminders/context").withReminderTenantContext;
  let consentVersion: string;
  let pt: ReturnType<typeof import("@osteojp/i18n").getStrings>;

  const tenant = randomUUID();
  const therapist = randomUUID();
  const clinic = randomUUID();
  const run = tenant.slice(0, 8);
  /** Every address this suite posts from, so its limiter rows can be counted and removed. */
  const addresses: string[] = [];

  const THERAPIST_NAME = `Terapeuta Fixture ${run}`;
  const CLINIC_NAME = `Clinica Fixture ${run}`;
  const patientName = (n: number) => `Paciente Fixture ${run} ${n}`;
  const patientEmail = (n: number) => `paciente-${n}-${run}@sat01optout.test`;
  const patientPhone = (n: number) => `+3519200${String(n).padStart(5, "0")}`;

  const rowsOf = <T>(result: unknown): T[] =>
    (Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? [])) as T[];

  const one = async <T>(query: ReturnType<typeof raw>): Promise<T> =>
    rowsOf<T>(await db.execute(query))[0]!;

  let serial = 0;
  /** One patient with one visit. Each fixture gets its own patient: the automatic door sends once per patient in 60 days. */
  async function visit(
    status: "completed" | "scheduled" = "completed",
    forPatient?: { n: number; patientId: string },
  ): Promise<{ n: number; patientId: string; appointmentId: string; endsAt: Date }> {
    const slot = ++serial;
    const n = forPatient?.n ?? slot;
    const patientId = forPatient?.patientId ?? randomUUID();
    const appointmentId = randomUUID();
    // Concluded visits end in the past and scheduled ones start in the future,
    // each in a slot of its own.
    const startsAt = new Date(
      status === "completed" ? Date.now() - 2 * DAY - slot * 2 * 3_600_000 : Date.now() + 2 * DAY + slot * 2 * 3_600_000,
    );
    const endsAt = new Date(startsAt.getTime() + 45 * 60_000);
    if (!forPatient) {
      await db.execute(
        raw`insert into patients (id, tenant_id, full_name, email, phone)
            values (${patientId}::uuid, ${tenant}::uuid, ${patientName(n)}, ${patientEmail(n)}, ${patientPhone(n)})`,
      );
    }
    await db.execute(
      raw`insert into appointments (id, tenant_id, patient_id, practitioner_id, location_id,
                                    starts_at, ends_at, status)
          values (${appointmentId}::uuid, ${tenant}::uuid, ${patientId}::uuid, ${therapist}::uuid,
                  ${clinic}::uuid, ${startsAt.toISOString()}::timestamptz,
                  ${endsAt.toISOString()}::timestamptz, ${status}::appointment_status)`,
    );
    return { n, patientId, appointmentId, endsAt };
  }

  /** Ask 0102's automatic door for a send, on the server's own session. Returns what the door answered. */
  async function issue(appointmentId: string, codeHash: string): Promise<string | undefined> {
    const result = await withReminderTenantContext(tenant, async (tx) =>
      tx.execute(
        raw`select public.issue_survey_automatic(${codeHash}, ${tenant}::uuid, ${appointmentId}::uuid, 'email') as result`,
      ),
    );
    return rowsOf<{ result: string }>(result)[0]?.result;
  }

  /** A concluded visit with a live survey code, issued through 0102's own door. */
  async function liveSurvey(env: NodeJS.ProcessEnv = process.env) {
    const v = await visit("completed");
    const code = codes.generateSurveyCode();
    const codeHash = codes.hashSurveyCode(code, env);
    const issued = await issue(v.appointmentId, codeHash);
    if (issued !== "issued") throw new Error(`fixture: the automatic door answered ${issued}`);
    return { ...v, code, codeHash };
  }

  const sendOf = (appointmentId: string) =>
    one<{ consumed: boolean; outcome: string | null }>(
      raw`select consumed_at is not null as consumed, outcome from appointment_survey_sends
           where appointment_id = ${appointmentId}::uuid`,
    );

  const answerCount = async (appointmentId: string) =>
    Number(
      (
        await one<{ n: number }>(
          raw`select count(*)::int as n from appointment_survey_responses
               where tenant_id = ${tenant}::uuid and appointment_id = ${appointmentId}::uuid`,
        )
      ).n,
    );

  /** The three switches of one patient. */
  const switchesOf = (patientId: string) =>
    one<{ survey: boolean; sms: boolean; email: boolean }>(
      raw`select survey_enabled as survey, reminder_sms_enabled as sms, reminder_email_enabled as email
            from patients where id = ${patientId}::uuid`,
    );

  /** A patient's whole row but for the survey switch, as one digest. */
  const restOfPatient = async (patientId: string) =>
    (
      await one<{ digest: string }>(
        raw`select md5((to_jsonb(p) - 'survey_enabled')::text) as digest
              from patients p where p.id = ${patientId}::uuid`,
      )
    ).digest;

  /** The audit rows about one appointment or one patient, oldest first. */
  const auditOf = async (entityId: string) =>
    rowsOf<{
      action: string;
      entity_type: string;
      actor_user_id: string | null;
      metadata: Record<string, unknown>;
    }>(
      await db.execute(
        raw`select action, entity_type, actor_user_id::text as actor_user_id, metadata
              from audit_log
             where tenant_id = ${tenant}::uuid and entity_id = ${entityId}::uuid
             order by created_at, id`,
      ),
    );

  /**
   * Everything a render or a refused post could have touched, as one row of
   * digests. Whole rows, so a changed timestamp counts as a change. EVERY LINE
   * IS THIS SUITE'S OWN TENANT; the limiter's is this suite's own addresses.
   */
  const snapshot = () =>
    one<Record<string, string | number>>(raw`
      select
        (select coalesce(md5(string_agg(s::text, '|' order by s.id)), 'none')
           from appointment_survey_sends s where s.tenant_id = ${tenant}::uuid) as sends,
        (select coalesce(md5(string_agg(c::text, '|' order by c.code_hash)), 'none')
           from appointment_survey_codes c where c.tenant_id = ${tenant}::uuid) as survey_codes,
        (select coalesce(md5(string_agg(r::text, '|' order by r.id)), 'none')
           from appointment_survey_responses r where r.tenant_id = ${tenant}::uuid) as answers,
        (select coalesce(md5(string_agg(k::text, '|' order by k.code_hash)), 'none')
           from appointment_confirm_codes k where k.tenant_id = ${tenant}::uuid) as confirm_codes,
        (select coalesce(md5(string_agg(a::text, '|' order by a.id)), 'none')
           from appointments a where a.tenant_id = ${tenant}::uuid) as appointments,
        (select coalesce(md5(string_agg(p::text, '|' order by p.id)), 'none')
           from patients p where p.tenant_id = ${tenant}::uuid) as patients,
        (select count(*)::int from audit_log where tenant_id = ${tenant}::uuid) as audit_rows
    `);

  /** How many posts the limiter counted from this suite's own addresses. */
  const limiterHits = async () =>
    Number(
      (
        await one<{ n: number }>(
          raw`select coalesce(sum(count), 0)::int as n from rate_limit_counters
               where key like ${`s-code:ip:%-${run}`}`,
        )
      ).n,
    );

  async function render(code: string, query: { r?: string; l?: string } = {}): Promise<string> {
    return renderToStaticMarkup(
      await SurveyPage({ params: Promise.resolve({ code }), searchParams: Promise.resolve(query) }),
    );
  }

  const ANSWER = { nps: 9, rating: 4, comment: "Comentario de teste, sem dados de ninguem.", contactConsent: true };
  const answer = () => ({ ...ANSWER, consentVersion });

  function answerForm(code: string): FormData {
    const f = new FormData();
    for (const [k, v] of Object.entries({
      code,
      locale: "pt",
      consentVersion,
      nps: String(ANSWER.nps),
      rating: String(ANSWER.rating),
      comment: ANSWER.comment,
      contactConsent: "on",
    })) {
      f.set(k, v);
    }
    return f;
  }

  /** What the opt-out form posts: the code and the language. */
  function optOutForm(code: string): FormData {
    const f = new FormData();
    f.set("code", code);
    f.set("locale", "pt");
    return f;
  }

  type Action = (state: { errors: object }, f: FormData) => Promise<unknown>;
  /** Post through a real action from one address. Returns where it redirected, or the state it returned. */
  async function post(action: Action, ip: string, f: FormData): Promise<string | object> {
    request.ip = ip;
    try {
      return (await action({ errors: {} }, f)) as object;
    } catch (e) {
      if (!(e instanceof Error) || !e.message.startsWith("NEXT_REDIRECT:")) throw e;
      return e.message.slice("NEXT_REDIRECT:".length);
    }
  }
  const optOut = (ip: string, code: string) => post(optOutSurveyAction as Action, ip, optOutForm(code));
  const submit = (ip: string, code: string) => post(submitSurveyAction as Action, ip, answerForm(code));

  /** A fresh documentation address (TEST-NET-3), so no arm inherits another's count. */
  function address(): string {
    const ip = `203.0.113.${addresses.length + 1}-${run}`;
    addresses.push(ip);
    return ip;
  }

  let logged: string[];
  let spies: Array<{ mockRestore(): void }>;

  beforeAll(async () => {
    process.env.REMINDERS_CONFIRM_CODE_SECRET ??= SECRET;
    const schema = await import("@osteojp/db");
    db = schema.getDbAdmin();
    store = await import("./survey-store");
    codes = await import("./survey-code");
    ({ withReminderTenantContext } = await import("@/lib/reminders/context"));
    SurveyPage = (await import("@/app/s/[code]/page")).default;
    ({ submitSurveyAction, optOutSurveyAction } = await import("@/app/s/[code]/actions"));
    const i18n = await import("@osteojp/i18n");
    consentVersion = i18n.CURRENT_SURVEY_CONSENT_VERSION;
    pt = i18n.getStrings("pt");

    await db.execute(
      raw`insert into tenants (id, name, slug)
          values (${tenant}::uuid, 'sat01 optout', ${"sat01optout-" + run})`,
    );
    await db.execute(
      raw`insert into locations (id, tenant_id, name) values (${clinic}::uuid, ${tenant}::uuid, ${CLINIC_NAME})`,
    );
    await db.execute(
      raw`insert into users (id, tenant_id, email, full_name)
          values (${therapist}::uuid, ${tenant}::uuid, ${`terapeuta-${run}@sat01optout.test`}, ${THERAPIST_NAME})`,
    );
  });

  afterAll(async () => {
    if (!db) return;
    const statements = [
      raw`delete from appointment_survey_responses where tenant_id = ${tenant}::uuid`,
      raw`delete from appointment_survey_sends where tenant_id = ${tenant}::uuid`,
      raw`delete from appointments where tenant_id = ${tenant}::uuid`,
      raw`delete from audit_log where tenant_id = ${tenant}::uuid`,
      raw`delete from patients where tenant_id = ${tenant}::uuid`,
      raw`delete from users where tenant_id = ${tenant}::uuid`,
      raw`delete from locations where tenant_id = ${tenant}::uuid`,
      raw`delete from tenants where id = ${tenant}::uuid`,
      ...addresses.map((ip) => raw`delete from rate_limit_counters where key = ${`s-code:ip:${ip}`}`),
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
    logged = [];
    spies = (["log", "info", "warn", "error", "debug"] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        logged.push(args.map((a) => (a instanceof Error ? `${a.name}: ${a.message}` : String(a))).join(" "));
      }),
    );
  });

  afterEach(() => {
    for (const spy of spies) spy.mockRestore();
  });

  /* ================================================================== */
  /* THE PREMISES                                                        */
  /* ================================================================== */

  it("PREMISE: a live code's page offers the opt-out with its note, and a patient starts with all three switches on", async () => {
    const s = await liveSurvey();
    const html = await render(s.code);
    expect(html).toContain(pt["survey.page.optOut"]);
    expect(html).toContain(pt["survey.page.optOutNote"]);
    expect(await switchesOf(s.patientId)).toEqual({ survey: true, sms: true, email: true });
    // Showing the button spent nothing.
    expect(await sendOf(s.appointmentId)).toEqual({ consumed: false, outcome: null });
  });

  /* ================================================================== */
  /* 1. IT WRITES WHAT THE SPEC NAMES AND NOTHING ELSE                   */
  /* ================================================================== */

  it("the opt-out turns off that patient's survey switch, consumes the send, writes its two audit rows, and nothing else", async () => {
    const s = await liveSurvey();
    const bystander = await liveSurvey();
    const restBefore = await restOfPatient(s.patientId);
    const bystanderBefore = await one<{ digest: string }>(
      raw`select md5(p::text) as digest from patients p where p.id = ${bystander.patientId}::uuid`,
    );
    const before = await snapshot();
    const auditBefore = Number(before.audit_rows);

    expect(await optOut(address(), s.code)).toBe(`/s/${s.code}?r=optedout&l=pt`);

    // THE SWITCH, and only the survey's.
    expect(await switchesOf(s.patientId)).toEqual({ survey: false, sms: true, email: true });
    // Every other column of that patient is as it was.
    expect(await restOfPatient(s.patientId)).toBe(restBefore);
    // THE SEND is spent as an opt-out, and there is no answer.
    expect(await sendOf(s.appointmentId)).toEqual({ consumed: true, outcome: "opted_out" });
    expect(await answerCount(s.appointmentId)).toBe(0);

    // THE TWO AUDIT ROWS, and no third. Neither has an actor: the page has no
    // session. Neither carries anything typed by anyone.
    expect(await auditOf(s.appointmentId)).toEqual([
      { action: "survey.opt_out", entity_type: "appointment", actor_user_id: null, metadata: { channel: "email" } },
    ]);
    expect(await auditOf(s.patientId)).toEqual([
      {
        action: "survey.switch_changed",
        entity_type: "patient",
        actor_user_id: null,
        metadata: { survey_enabled: false, actor_patient_id: null },
      },
    ]);
    const after = await snapshot();
    expect(Number(after.audit_rows)).toBe(auditBefore + 2);

    // NOTHING ELSE MOVED: no answer, no appointment, no code row, no confirm
    // code, and the other patient with a live link is untouched, switch and all.
    expect(after.answers).toBe(before.answers);
    expect(after.appointments).toBe(before.appointments);
    expect(after.survey_codes).toBe(before.survey_codes);
    expect(after.confirm_codes).toBe(before.confirm_codes);
    expect(
      await one<{ digest: string }>(
        raw`select md5(p::text) as digest from patients p where p.id = ${bystander.patientId}::uuid`,
      ),
    ).toEqual(bystanderBefore);
    expect(await switchesOf(bystander.patientId)).toEqual({ survey: true, sms: true, email: true });
    expect(await sendOf(bystander.appointmentId)).toEqual({ consumed: false, outcome: null });
    // CONTROL: the two things that should move did, so the digests can move.
    expect(after.sends).not.toBe(before.sends);
    expect(after.patients).not.toBe(before.patients);
  });

  it("the page after the opt-out is texts 28 and 29, and it reads no row", async () => {
    const s = await liveSurvey();
    const where = await optOut(address(), s.code);
    expect(where).toBe(`/s/${s.code}?r=optedout&l=pt`);
    const before = await snapshot();
    const html = await render(s.code, { r: "optedout", l: "pt" });
    expect(html).toContain("Pedido registado");
    expect(html).toContain(
      "Não voltará a receber avaliações de satisfação da OsteoJP. Os lembretes de consulta não são afetados.",
    );
    expect(html).not.toContain("<form");
    expect(await snapshot()).toEqual(before);
  });

  /* ================================================================== */
  /* 3. NO SEND PATH OVERRIDES IT, AND THE LINK IS SPENT                 */
  /* ================================================================== */

  it("after the opt-out the link is one more bad link: it shows no form, cannot be answered and cannot opt out twice", async () => {
    const s = await liveSurvey();
    const ip = address();
    expect(await optOut(ip, s.code)).toBe(`/s/${s.code}?r=optedout&l=pt`);

    const unknown = codes.generateSurveyCode();
    const page = await render(s.code);
    expect(page).toBe(await render(unknown));
    expect(page).not.toContain(pt["survey.page.optOut"]);
    expect(await store.resolveSurveyCode({ code: s.code })).toBeNull();

    const before = await snapshot();
    expect(await submit(ip, s.code)).toBe(`/s/${s.code}?r=generic`);
    expect(await optOut(ip, s.code)).toBe(`/s/${s.code}?r=generic`);
    expect(await store.optOutSurvey({ code: s.code })).toBe("refused");
    expect(await snapshot()).toEqual(before);
    expect(await answerCount(s.appointmentId)).toBe(0);
    expect(await switchesOf(s.patientId)).toEqual({ survey: false, sms: true, email: true });
  });

  it("after the opt-out the automatic door refuses that patient, and still issues for another", async () => {
    const s = await liveSurvey();
    expect(await optOut(address(), s.code)).toBe(`/s/${s.code}?r=optedout&l=pt`);

    // A NEW concluded visit of the SAME patient. Its earlier send is aged past
    // the 60-day rule, so the only thing left to refuse it is the switch.
    await db.execute(
      raw`update appointment_survey_sends set sent_at = now() - interval '61 days'
           where appointment_id = ${s.appointmentId}::uuid`,
    );
    const next = await visit("completed", { n: s.n, patientId: s.patientId });
    const before = await snapshot();
    expect(await issue(next.appointmentId, codes.hashSurveyCode(codes.generateSurveyCode()))).toBe("not_eligible");
    expect(await snapshot()).toEqual(before);

    // CONTROL: it was the switch. Turned back on (as staff would), the same
    // visit is sent to.
    await db.execute(raw`update patients set survey_enabled = true where id = ${s.patientId}::uuid`);
    expect(await issue(next.appointmentId, codes.hashSurveyCode(codes.generateSurveyCode()))).toBe("issued");
  });

  /* ================================================================== */
  /* 2. ONE REFUSAL FOR EVERY CODE THAT IS NOT VALID                     */
  /* ================================================================== */

  /** One code of every kind that is not valid, each really in the state its name says. */
  async function badCodes(): Promise<Record<string, { code: string; patientId?: string }>> {
    // ISSUED UNDER ANOTHER KEY: the row exists, and this server cannot find it.
    const otherKey = await liveSurvey({ ...process.env, REMINDERS_CONFIRM_CODE_SECRET: "another-key-entirely" });

    // A LIVE CONFIRM CODE, for a visit still to come.
    const { issueConfirmCode } = await import("@/lib/reminders/confirm-code-store");
    const upcoming = await visit("scheduled");
    const confirm = await issueConfirmCode({ tenantId: tenant, appointmentId: upcoming.appointmentId });
    if (!confirm) throw new Error("fixture: no confirm code was issued");

    // EXPIRED: sent 14 days and a minute ago. The row is aged; a fake clock
    // would not move the database's now().
    const expired = await liveSurvey();
    await db.execute(
      raw`update appointment_survey_sends set sent_at = now() - interval '14 days 1 minute'
           where appointment_id = ${expired.appointmentId}::uuid`,
    );

    // ALREADY ANSWERED, through the page's own door.
    const answered = await liveSurvey();
    if ((await store.submitSurveyResponse({ code: answered.code, answer: answer() })) !== "recorded") {
      throw new Error("fixture: the answer was not recorded");
    }

    // ALREADY USED TO OPT OUT, through the page's own door.
    const optedOut = await liveSurvey();
    if ((await store.optOutSurvey({ code: optedOut.code })) !== "recorded") {
      throw new Error("fixture: the opt-out was not recorded");
    }

    // NO LONGER ELIGIBLE: the visit was moved back out of concluded.
    const reopened = await liveSurvey();
    await db.execute(
      raw`update appointments set status = 'scheduled'::appointment_status
           where id = ${reopened.appointmentId}::uuid`,
    );

    return {
      malformed: { code: "nao-e-um-codigo" },
      empty: { code: "" },
      unknown: { code: codes.generateSurveyCode() },
      "wrong key": { code: otherKey.code, patientId: otherKey.patientId },
      "a confirm code": { code: confirm.code, patientId: upcoming.patientId },
      expired: { code: expired.code, patientId: expired.patientId },
      "already answered": { code: answered.code, patientId: answered.patientId },
      "already opted out": { code: optedOut.code, patientId: optedOut.patientId },
      "no longer eligible": { code: reopened.code, patientId: reopened.patientId },
    };
  }

  it("every bad code is refused by the opt-out with one redirect, lands on one page, and moves nothing", async () => {
    const bad = await badCodes();
    expect(Object.keys(bad)).toHaveLength(9);
    const before = await snapshot();
    const switchesBefore: Record<string, unknown> = {};
    for (const [name, { patientId }] of Object.entries(bad)) {
      if (patientId) switchesBefore[name] = await switchesOf(patientId);
    }

    const reference = await render(bad.unknown!.code);
    expect(reference).toContain(pt["survey.page.invalidTitle"]);
    expect(reference).not.toContain(pt["survey.page.optOut"]);
    expect(reference).not.toContain("<button");

    for (const [name, { code, patientId }] of Object.entries(bad)) {
      // Each from an address of its own, so the limiter refuses none of them.
      const where = await optOut(address(), code);
      expect(where, name).toBe(`/s/${encodeURIComponent(code)}?r=generic`);
      // THE PAGE IT LANDS ON, and the page the link itself opens: one page.
      expect(await render(code, { r: "generic" }), name).toBe(reference);
      expect(await render(code), name).toBe(reference);
      if (codes.isWellFormedSurveyCode(code)) {
        expect(await store.optOutSurvey({ code }), name).toBe("refused");
      }
      if (patientId) expect(await switchesOf(patientId), name).toEqual(switchesBefore[name]);
    }
    expect(await snapshot()).toEqual(before);

    // The patients behind the bad links that never opted out still receive
    // surveys: a refused opt-out is not an opt-out.
    for (const name of ["wrong key", "a confirm code", "expired", "already answered", "no longer eligible"]) {
      expect(await switchesOf(bad[name]!.patientId!), name).toMatchObject({ survey: true });
    }
    // CONTROL: the one fixture that did opt out reads off, so the reading can
    // tell the two apart.
    expect(await switchesOf(bad["already opted out"]!.patientId!)).toMatchObject({ survey: false });

    // NEGATIVE ARM: a live code's page differs, and a live code's opt-out is
    // taken. The comparison above can see a difference.
    const s = await liveSurvey();
    expect(await render(s.code)).not.toBe(reference);
    expect(await optOut(address(), s.code)).toBe(`/s/${s.code}?r=optedout&l=pt`);
  }, 90_000);

  it("a malformed code is refused before the limiter and before the database", async () => {
    const hitsBefore = await limiterHits();
    const before = await snapshot();
    const ip = address();
    for (const code of ["", "short", "ABCDEFGHI", "survey:ABCDEFGH", "../../login"]) {
      expect(await optOut(ip, code), code).toBe(`/s/${encodeURIComponent(code)}?r=generic`);
    }
    expect(await limiterHits()).toBe(hitsBefore);
    expect(await snapshot()).toEqual(before);
    // CONTROL: a well-formed one from the same address is counted.
    await optOut(ip, codes.generateSurveyCode());
    expect(await limiterHits()).toBe(hitsBefore + 1);
  });

  /* ================================================================== */
  /* 4. ONE BUDGET, BEFORE THE DOOR                                      */
  /* ================================================================== */

  it("answers and opt-outs share one budget: the eleventh post in a minute is refused before the database, as a bad code is", async () => {
    const ip = address();
    const unknown = codes.generateSurveyCode();
    // Ten posts on a code nobody issued: five answers and five opt-outs.
    for (let i = 0; i < 5; i++) {
      expect(await submit(ip, unknown)).toBe(`/s/${unknown}?r=generic`);
      expect(await optOut(ip, unknown)).toBe(`/s/${unknown}?r=generic`);
    }

    // The eleventh is an opt-out on a LIVE code. Only the limiter can refuse
    // it, and it must write nothing.
    const s = await liveSurvey();
    const before = await snapshot();
    const eleventh = await optOut(ip, s.code);
    expect(eleventh).toBe(`/s/${s.code}?r=generic`);
    expect(await snapshot()).toEqual(before);
    expect(await switchesOf(s.patientId)).toEqual({ survey: true, sms: true, email: true });
    expect(await sendOf(s.appointmentId)).toEqual({ consumed: false, outcome: null });

    // IT LOOKS LIKE A BAD CODE: the same redirect shape, and the same page,
    // byte for byte, although this code is still live.
    expect(String(eleventh).replace(s.code, unknown)).toBe(`/s/${unknown}?r=generic`);
    expect(await render(s.code, { r: "generic" })).toBe(await render(unknown));

    // CONTROL: it was the limiter and not the code. The same code from
    // another address opts out.
    expect(await optOut(address(), s.code)).toBe(`/s/${s.code}?r=optedout&l=pt`);
    expect(await switchesOf(s.patientId)).toMatchObject({ survey: false });
  }, 60_000);

  /* ================================================================== */
  /* 5. ONE OUTCOME PER LINK                                             */
  /* ================================================================== */

  it("two opt-outs at once produce one: one is taken, one is refused, and the rows are written once", async () => {
    const s = await liveSurvey();
    const outcomes = await Promise.all([optOut(address(), s.code), optOut(address(), s.code)]);
    expect([...outcomes].sort()).toEqual([`/s/${s.code}?r=generic`, `/s/${s.code}?r=optedout&l=pt`]);
    expect(await auditOf(s.appointmentId)).toHaveLength(1);
    expect(await auditOf(s.patientId)).toHaveLength(1);
    expect(await sendOf(s.appointmentId)).toEqual({ consumed: true, outcome: "opted_out" });
  });

  it("an opt-out and an answer at once produce one or the other, never both", async () => {
    // Several rounds: either may win a given round, and both ends must hold.
    const seen = new Set<string>();
    for (let round = 0; round < 6; round++) {
      const s = await liveSurvey();
      const [a, o] = await Promise.all([submit(address(), s.code), optOut(address(), s.code)]);
      const send = await sendOf(s.appointmentId);
      const answers = await answerCount(s.appointmentId);
      const switches = await switchesOf(s.patientId);
      expect(send.consumed).toBe(true);
      seen.add(String(send.outcome));
      if (send.outcome === "answered") {
        expect([a, o]).toEqual([`/s/${s.code}?r=answered&l=pt`, `/s/${s.code}?r=generic`]);
        expect(answers).toBe(1);
        // The refused opt-out left the switch on.
        expect(switches).toEqual({ survey: true, sms: true, email: true });
        expect(await auditOf(s.patientId)).toEqual([]);
      } else {
        expect(send.outcome).toBe("opted_out");
        expect([a, o]).toEqual([`/s/${s.code}?r=generic`, `/s/${s.code}?r=optedout&l=pt`]);
        // The refused answer was not stored.
        expect(answers).toBe(0);
        expect(switches).toEqual({ survey: false, sms: true, email: true });
      }
      expect(await auditOf(s.appointmentId)).toHaveLength(1);
    }
    // At least one outcome was seen; which one wins a round is the database's.
    expect(seen.size).toBeGreaterThan(0);
    for (const outcome of seen) expect(["answered", "opted_out"]).toContain(outcome);
  }, 60_000);

  /* ================================================================== */
  /* 6. NOTHING ABOUT THE PATIENT IS LOGGED                              */
  /* ================================================================== */

  it("a whole opt-out round logs nothing: no name, phone, email, code or hash", async () => {
    const s = await liveSurvey();
    const ip = address();
    await render(s.code);
    await optOut(ip, s.code);
    await optOut(ip, s.code);
    await submit(ip, s.code);
    await render(s.code);
    await render(s.code, { r: "optedout", l: "pt" });

    // CONTROL: the capture is live and the check below can fail. This path
    // logs nothing of its own, so without a line the loop would run zero
    // times and pass on nothing.
    expect(logged, "the application logged on a path that must be silent").toEqual([]);
    console.error("[surveys] control line");
    expect(logged).toEqual(["[surveys] control line"]);
    const personal = [patientName(s.n), patientEmail(s.n), patientPhone(s.n), s.patientId, s.code, s.codeHash, run];
    expect(() => {
      for (const line of [...logged, `leak ${s.code}`]) expect(line).not.toContain(s.code);
    }).toThrow();
    for (const line of logged) {
      for (const text of personal) expect(line, "a log line carried something it must not").not.toContain(text);
    }

    // And the opt-out page itself shows none of it.
    const html = await render(s.code, { r: "optedout", l: "pt" });
    for (const text of [...personal, THERAPIST_NAME, CLINIC_NAME]) expect(html, text).not.toContain(text);
  });
});
