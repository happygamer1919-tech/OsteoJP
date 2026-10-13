/**
 * survey-page.db.test.ts: SAT-01. THE SURVEY PAGE `/s/<code>` AGAINST A REAL
 * DATABASE, AS THE ROLE THE APPLICATION REALLY RUNS AS.
 *
 * The page's properties are properties of behaviour, and four of them only a
 * database can show (spec 9.3):
 *
 *   1. OPENING THE PAGE WRITES NOTHING. The real page is rendered for a live
 *      code and for every kind of bad one, and the rows are compared before
 *      and after.
 *   2. EVERY BAD CODE GIVES THE SAME PAGE: malformed, never issued, issued
 *      under another key, a live CONFIRM code, expired, already answered and
 *      no longer eligible render byte-identical HTML, in about the same time.
 *   3. A SURVEY CODE IS NOT A CONFIRM CODE, IN EITHER DIRECTION: a live code of
 *      each kind is presented at the other's door, read and write, and nothing
 *      answers and nothing moves.
 *   4. ONE ANSWER PER CODE, AND THE LIMITER: a second submit is refused and
 *      changes nothing; two at once produce one answer; the eleventh submit in
 *      a minute is refused before the database is asked, and its refusal is
 *      the page a bad code gets.
 *
 * NOTHING BETWEEN THE PAGE AND POSTGRES IS REPLACED. The store, its doors
 * (migration 0102), `withReminderTenantContext`, the limiter and its table are
 * the real ones. The only stand-ins are `next/headers` and `next/navigation`,
 * which need a request, and `server-only`.
 *
 * HOW A LIVE CODE IS MADE. Through 0102's own door for the automatic send,
 * `issue_survey_automatic`, on the server's own session: the row this suite
 * acts on is one production could have written. Nothing in the application
 * calls that door yet, which is why the page is inert on its own.
 *
 * READ-BACKS ARE ON THE ADMIN CONNECTION, so RLS hides nothing from them.
 *
 * THE FIXTURE IS BUILT, NEVER BORROWED: a tenant of its own, removed
 * afterwards. Invented names only. Runs in `.github/workflows/db-tests.yml`
 * (it globs `.db.test.ts` in this workspace) and self-skips without
 * DATABASE_URL.
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
// `redirect` throws in Next; the action relies on that to stop.
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

const live = Boolean(process.env.DATABASE_URL);
const d = live ? describe : describe.skip;

const SECRET = "sat01-page-test-secret";
const DAY = 24 * 60 * 60 * 1000;

d("SAT-01: the survey page against a real database", () => {
  let db: ReturnType<typeof import("@osteojp/db").getDbAdmin>;
  let store: typeof import("./survey-store");
  let codes: typeof import("./survey-code");
  let SurveyPage: typeof import("@/app/s/[code]/page").default;
  let submitSurveyAction: typeof import("@/app/s/[code]/actions").submitSurveyAction;
  let withReminderTenantContext: typeof import("@/lib/reminders/context").withReminderTenantContext;
  let consentVersion: string;
  let invalidTitle: string;

  const tenant = randomUUID();
  const therapist = randomUUID();
  const clinic = randomUUID();
  const run = tenant.slice(0, 8);
  /** Every address this suite submits from, so its limiter rows can be removed. */
  const addresses: string[] = [];

  const THERAPIST_NAME = `Terapeuta Fixture ${run}`;
  const CLINIC_NAME = `Clinica Fixture ${run}`;
  const patientName = (n: number) => `Paciente Fixture ${run} ${n}`;
  const patientEmail = (n: number) => `paciente-${n}-${run}@sat01page.test`;
  const patientPhone = (n: number) => `+3519100${String(n).padStart(5, "0")}`;

  const rowsOf = <T>(result: unknown): T[] =>
    (Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? [])) as T[];

  const one = async <T>(query: ReturnType<typeof raw>): Promise<T> =>
    rowsOf<T>(await db.execute(query))[0]!;

  let serial = 0;
  /** One patient with one visit. Each fixture gets its own patient: the automatic door sends once per patient in 60 days. */
  async function visit(status: "completed" | "scheduled" = "completed"): Promise<{
    n: number;
    patientId: string;
    appointmentId: string;
    endsAt: Date;
  }> {
    const n = ++serial;
    const patientId = randomUUID();
    const appointmentId = randomUUID();
    // Concluded visits end in the past and scheduled ones start in the future,
    // each in a slot of its own.
    const startsAt = new Date(
      status === "completed" ? Date.now() - 2 * DAY - n * 2 * 3_600_000 : Date.now() + 2 * DAY + n * 2 * 3_600_000,
    );
    const endsAt = new Date(startsAt.getTime() + 45 * 60_000);
    await db.execute(
      raw`insert into patients (id, tenant_id, full_name, email, phone)
          values (${patientId}::uuid, ${tenant}::uuid, ${patientName(n)}, ${patientEmail(n)}, ${patientPhone(n)})`,
    );
    await db.execute(
      raw`insert into appointments (id, tenant_id, patient_id, practitioner_id, location_id,
                                    starts_at, ends_at, status)
          values (${appointmentId}::uuid, ${tenant}::uuid, ${patientId}::uuid, ${therapist}::uuid,
                  ${clinic}::uuid, ${startsAt.toISOString()}::timestamptz,
                  ${endsAt.toISOString()}::timestamptz, ${status}::appointment_status)`,
    );
    return { n, patientId, appointmentId, endsAt };
  }

  /** A concluded visit with a live survey code, issued through 0102's own door. */
  async function liveSurvey(env: NodeJS.ProcessEnv = process.env) {
    const v = await visit("completed");
    const code = codes.generateSurveyCode();
    const codeHash = codes.hashSurveyCode(code, env);
    const result = await withReminderTenantContext(tenant, async (tx) =>
      tx.execute(
        raw`select public.issue_survey_automatic(${codeHash}, ${tenant}::uuid, ${v.appointmentId}::uuid, 'email') as result`,
      ),
    );
    const issued = rowsOf<{ result: string }>(result)[0]?.result;
    if (issued !== "issued") throw new Error(`fixture: the automatic door answered ${issued}`);
    return { ...v, code, codeHash };
  }

  const sendOf = (appointmentId: string) =>
    one<{ consumed_at: string | null; outcome: string | null }>(
      raw`select consumed_at::text as consumed_at, outcome from appointment_survey_sends
           where appointment_id = ${appointmentId}::uuid`,
    );

  const answersOf = async (appointmentId: string) =>
    rowsOf<{
      nps: number;
      rating: number;
      comment: string | null;
      contact_consent: boolean;
      consent_version: string;
      channel: string;
      patient_id: string;
    }>(
      await db.execute(
        raw`select nps::int as nps, rating::int as rating, comment, contact_consent, consent_version,
                   channel, patient_id::text as patient_id
              from appointment_survey_responses where appointment_id = ${appointmentId}::uuid`,
      ),
    );

  /**
   * Everything a render or a refused submit could have touched, as one row of
   * digests. Whole rows, so a changed timestamp counts as a change.
   *
   * `all_sends` and `all_answers` count every tenant BUT the fixture tenants
   * of the two other DB-gated files of this workspace that write these tables
   * while this one runs beside them on the same database:
   * lib/patients/hard-delete-survey.db.test.ts (slug `sat01del-`) and
   * lib/reminders/survey-dispatch.db.test.ts (slug `sat01send-`). Counted
   * whole, the two moved under those files' own inserts and deletes.
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
        (select count(*)::int from audit_log where tenant_id = ${tenant}::uuid) as audit_rows,
        (select count(*)::int from appointment_survey_sends s
          where s.tenant_id not in
                (select t.id from tenants t where t.slug like 'sat01del-%' or t.slug like 'sat01send-%')) as all_sends,
        (select count(*)::int from appointment_survey_responses r
          where r.tenant_id not in
                (select t.id from tenants t where t.slug like 'sat01del-%' or t.slug like 'sat01send-%')) as all_answers,
        (select coalesce(sum(count), 0)::int from rate_limit_counters where key like 's-code:%') as limiter_hits
    `);

  async function render(code: string, query: { r?: string; l?: string } = {}): Promise<string> {
    return renderToStaticMarkup(
      await SurveyPage({ params: Promise.resolve({ code }), searchParams: Promise.resolve(query) }),
    );
  }

  const ANSWER = {
    nps: 9,
    rating: 4,
    comment: "Comentario de teste, sem dados de ninguem.",
    contactConsent: true,
  };
  const answer = () => ({ ...ANSWER, consentVersion });

  function form(code: string, over: Record<string, string | null> = {}): FormData {
    const base: Record<string, string | null> = {
      code,
      locale: "pt",
      consentVersion,
      nps: String(ANSWER.nps),
      rating: String(ANSWER.rating),
      comment: ANSWER.comment,
      contactConsent: "on",
      ...over,
    };
    const f = new FormData();
    for (const [k, v] of Object.entries(base)) if (v !== null) f.set(k, v);
    return f;
  }

  /** Submit through the real action from one address. Returns where it redirected, or the state it returned. */
  async function post(ip: string, f: FormData): Promise<string | object> {
    request.ip = ip;
    try {
      return await submitSurveyAction({ errors: {} }, f);
    } catch (e) {
      if (!(e instanceof Error) || !e.message.startsWith("NEXT_REDIRECT:")) throw e;
      return e.message.slice("NEXT_REDIRECT:".length);
    }
  }

  /** A fresh documentation address (TEST-NET-2), so no arm inherits another's count. */
  function address(): string {
    const ip = `198.51.100.${addresses.length + 1}-${run}`;
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
    ({ submitSurveyAction } = await import("@/app/s/[code]/actions"));
    const i18n = await import("@osteojp/i18n");
    consentVersion = i18n.CURRENT_SURVEY_CONSENT_VERSION;
    invalidTitle = i18n.getStrings("pt")["survey.page.invalidTitle"];

    await db.execute(
      raw`insert into tenants (id, name, slug)
          values (${tenant}::uuid, 'sat01 page', ${"sat01page-" + run})`,
    );
    await db.execute(
      raw`insert into locations (id, tenant_id, name) values (${clinic}::uuid, ${tenant}::uuid, ${CLINIC_NAME})`,
    );
    await db.execute(
      raw`insert into users (id, tenant_id, email, full_name)
          values (${therapist}::uuid, ${tenant}::uuid, ${`terapeuta-${run}@sat01page.test`}, ${THERAPIST_NAME})`,
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

  it("PREMISE: the store's session is the role `authenticated` with a tenant and no user and no patient", async () => {
    // The patient claim is read from the claims themselves. `jwt_patient_id()`
    // is not granted to `authenticated`, and on the local Postgres image a call
    // to a function the role may not execute ends the server process.
    const who = await withReminderTenantContext(tenant, async (tx) =>
      rowsOf<{ role: string; uid: string | null; tenant: string | null; claims: Record<string, unknown> }>(
        await tx.execute(
          raw`select current_user::text as role, auth.uid()::text as uid,
                     public.jwt_tenant_id()::text as tenant,
                     current_setting('request.jwt.claims', true)::jsonb as claims`,
        ),
      ),
    );
    expect(who).toHaveLength(1);
    expect(who[0]).toMatchObject({ role: "authenticated", uid: null, tenant });
    expect(Object.keys(who[0]!.claims).sort()).toEqual(["tenant_id", "user_role"]);
  });

  it("PREMISE: a live code resolves to its tenant, its appointment and the visit's end, and renders the form", async () => {
    const s = await liveSurvey();
    const resolved = await store.resolveSurveyCode({ code: s.code });
    expect(resolved).toEqual({ tenantId: tenant, appointmentId: s.appointmentId, visitEndsAt: s.endsAt });

    const html = await render(s.code);
    expect(html).toContain("<form");
    expect(html).not.toContain(invalidTitle);
  });

  /* ================================================================== */
  /* 1. OPENING THE PAGE WRITES NOTHING                                  */
  /* ================================================================== */

  it("opening the page writes nothing: a live code, opened many times, and every kind of bad one", async () => {
    const s = await liveSurvey();
    const spent = await liveSurvey();
    expect(await store.submitSurveyResponse({ code: spent.code, answer: answer() })).toBe("recorded");

    const before = await snapshot();
    // CONTROL: the snapshot sees this suite's rows, so "unchanged" is a fact.
    expect(before.sends).not.toBe("none");
    expect(before.survey_codes).not.toBe("none");
    expect(before.answers).not.toBe("none");
    expect(Number(before.audit_rows)).toBeGreaterThan(0);

    for (let i = 0; i < 5; i++) expect(await render(s.code)).toContain("<form");
    for (const bad of [spent.code, codes.generateSurveyCode(), "abc", "", "survey:ABCDEFGH"]) {
      expect(await render(bad)).toContain(invalidTitle);
    }
    await render(s.code, { r: "generic" });
    await render(s.code, { r: "answered", l: "pt" });

    expect(await snapshot()).toEqual(before);
    // The live code is still live: opening spent nothing.
    expect(await sendOf(s.appointmentId)).toEqual({ consumed_at: null, outcome: null });
    expect(await store.resolveSurveyCode({ code: s.code })).not.toBeNull();
  });

  it("CONTROL: the snapshot does change when something is written", async () => {
    const s = await liveSurvey();
    const before = await snapshot();
    expect(await store.submitSurveyResponse({ code: s.code, answer: answer() })).toBe("recorded");
    const after = await snapshot();
    expect(after.sends).not.toBe(before.sends);
    expect(after.answers).not.toBe(before.answers);
    expect(Number(after.audit_rows)).toBe(Number(before.audit_rows) + 1);
    // The answer consumes the send and leaves its code row as it was.
    expect(after.survey_codes).toBe(before.survey_codes);
  });

  /* ================================================================== */
  /* 2. EVERY BAD CODE GIVES THE SAME PAGE                               */
  /* ================================================================== */

  /** One code of every kind that is not valid, each really in the state its name says. */
  async function badCodes(): Promise<Record<string, string>> {
    // ISSUED UNDER ANOTHER KEY: the row exists, and this server cannot find it.
    const otherKey = await liveSurvey({ ...process.env, REMINDERS_CONFIRM_CODE_SECRET: "another-key-entirely" });

    // A LIVE CONFIRM CODE, for a visit still to come.
    const { issueConfirmCode } = await import("@/lib/reminders/confirm-code-store");
    const upcoming = await visit("scheduled");
    const confirm = await issueConfirmCode({ tenantId: tenant, appointmentId: upcoming.appointmentId });
    if (!confirm) throw new Error("fixture: no confirm code was issued");

    // EXPIRED: sent 14 days and a minute ago. A fake clock would not move
    // the database's now(), so the row is aged instead.
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

    // NO LONGER ELIGIBLE: the visit was moved back out of concluded.
    const reopened = await liveSurvey();
    await db.execute(
      raw`update appointments set status = 'scheduled'::appointment_status
           where id = ${reopened.appointmentId}::uuid`,
    );

    return {
      malformed: "nao-e-um-codigo",
      empty: "",
      unknown: codes.generateSurveyCode(),
      "wrong key": otherKey.code,
      "a confirm code": confirm.code,
      expired: expired.code,
      "already answered": answered.code,
      "no longer eligible": reopened.code,
    };
  }

  it("every bad code renders byte-identical HTML, and a live code's page differs", async () => {
    const bad = await badCodes();
    const pages: Record<string, string> = {};
    for (const [name, code] of Object.entries(bad)) pages[name] = await render(code);

    const reference = pages.unknown!;
    expect(reference).toContain(invalidTitle);
    for (const [name, html] of Object.entries(pages)) expect(html, name).toBe(reference);

    // NEGATIVE ARM: the comparison can see a difference, and the fixtures that
    // are "expired" or "answered" are not simply codes nothing ever issued.
    const s = await liveSurvey();
    expect(await render(s.code)).not.toBe(reference);
    expect(Object.keys(pages)).toHaveLength(8);
  }, 60_000);

  it("every bad code is refused by the answer too, with the same answer, and nothing is written", async () => {
    const bad = await badCodes();
    const before = await snapshot();
    for (const [name, code] of Object.entries(bad)) {
      if (!codes.isWellFormedSurveyCode(code)) continue; // the action refuses these before the store
      expect(await store.submitSurveyResponse({ code, answer: answer() }), name).toBe("refused");
    }
    expect(await snapshot()).toEqual(before);
  }, 60_000);

  it("the bad codes take the SAME TIME, within an order of magnitude", async () => {
    const bad = await badCodes();
    const median = async (code: string): Promise<number> => {
      const samples: number[] = [];
      for (let i = 0; i < 15; i++) {
        const t0 = performance.now();
        await render(code);
        samples.push(performance.now() - t0);
      }
      samples.sort((a, b) => a - b);
      return samples[Math.floor(samples.length / 2)]!;
    };

    // Warm the pool so the first sample does not pay for a connection.
    await render(bad.unknown!);

    const timings: Record<string, number> = {};
    for (const [name, code] of Object.entries(bad)) timings[name] = await median(code);
    const values = Object.values(timings);

    // WHAT THIS CATCHES: a path that skips the lookup, which is about ten
    // times faster. The malformed and the empty code are the ones that could,
    // because their shape can be judged without a query. The bound is 4x so
    // ordinary variance on a loaded runner cannot redden it.
    expect(Math.max(...values) / Math.min(...values), `medians: ${JSON.stringify(timings)}`).toBeLessThan(4);
  }, 60_000);

  /* ================================================================== */
  /* 3. A SURVEY CODE IS NOT A CONFIRM CODE, IN EITHER DIRECTION          */
  /* ================================================================== */

  it("a live SURVEY code is not accepted as a confirm code: not read, not redeemed, nothing moves", async () => {
    const { resolveConfirmCode } = await import("@/lib/reminders/confirm-code-store");
    const { redeemConfirmCode } = await import("@/lib/reminders/confirm-redeem");
    const s = await liveSurvey();
    const before = await snapshot();

    expect(await resolveConfirmCode({ code: s.code })).toBeNull();
    // The one string whose confirm hash IS this survey code's hash: refused on
    // its shape, and no confirm row could hold that hash in any case.
    expect(await resolveConfirmCode({ code: `survey:${s.code}` })).toBeNull();
    for (const action of ["confirm", "pedido"] as const) {
      const outcome = await redeemConfirmCode({ code: s.code, action, now: new Date(), ip: null });
      expect(outcome, action).toEqual({ outcome: "generic" });
    }

    expect(await snapshot()).toEqual(before);
    // CONTROL: the code was live the whole time, as a survey code.
    expect(await store.resolveSurveyCode({ code: s.code })).not.toBeNull();
  });

  it("a live CONFIRM code is not accepted as a survey code: not read, not answered, nothing moves", async () => {
    const { issueConfirmCode, resolveConfirmCode } = await import("@/lib/reminders/confirm-code-store");
    const upcoming = await visit("scheduled");
    const confirm = await issueConfirmCode({ tenantId: tenant, appointmentId: upcoming.appointmentId });
    expect(confirm).not.toBeNull();
    const before = await snapshot();

    expect(await store.resolveSurveyCode({ code: confirm!.code })).toBeNull();
    expect(await store.submitSurveyResponse({ code: confirm!.code, answer: answer() })).toBe("refused");
    expect(await render(confirm!.code)).toContain(invalidTitle);

    expect(await snapshot()).toEqual(before);
    expect(await answersOf(upcoming.appointmentId)).toEqual([]);
    // CONTROL: the code was live the whole time, as a confirm code.
    expect(await resolveConfirmCode({ code: confirm!.code })).toMatchObject({
      tenantId: tenant,
      appointmentId: upcoming.appointmentId,
      consumedAt: null,
    });
  });

  /* ================================================================== */
  /* 4. ONE ANSWER PER CODE                                              */
  /* ================================================================== */

  it("an answer is recorded once, as given, and the audit row carries the channel only", async () => {
    const s = await liveSurvey();
    const auditBefore = Number((await snapshot()).audit_rows);

    expect(await store.submitSurveyResponse({ code: s.code, answer: answer() })).toBe("recorded");

    expect(await answersOf(s.appointmentId)).toEqual([
      {
        nps: 9,
        rating: 4,
        comment: ANSWER.comment,
        contact_consent: true,
        consent_version: consentVersion,
        channel: "email",
        patient_id: s.patientId,
      },
    ]);
    const send = await sendOf(s.appointmentId);
    expect(send.outcome).toBe("answered");
    expect(send.consumed_at).not.toBeNull();

    const audits = rowsOf<{ action: string; actor_user_id: string | null; metadata: unknown }>(
      await db.execute(
        raw`select action, actor_user_id::text as actor_user_id, metadata from audit_log
             where tenant_id = ${tenant}::uuid and entity_id = ${s.appointmentId}::uuid`,
      ),
    );
    expect(audits).toEqual([{ action: "survey.submitted", actor_user_id: null, metadata: { channel: "email" } }]);
    expect(Number((await snapshot()).audit_rows)).toBe(auditBefore + 1);
  });

  it("a second submit of the same code is refused and changes nothing, and the page is the generic one", async () => {
    const s = await liveSurvey();
    expect(await store.submitSurveyResponse({ code: s.code, answer: answer() })).toBe("recorded");
    const before = await snapshot();

    const again = { ...answer(), nps: 0, rating: 1, comment: "Outra resposta.", contactConsent: false };
    expect(await store.submitSurveyResponse({ code: s.code, answer: again })).toBe("refused");

    expect(await snapshot()).toEqual(before);
    expect(await answersOf(s.appointmentId)).toHaveLength(1);
    expect((await answersOf(s.appointmentId))[0]!.nps).toBe(9);
    expect(await render(s.code)).toBe(await render(codes.generateSurveyCode()));
  });

  it("two submits of one code at once produce exactly one answer: the door decides, under its lock", async () => {
    const s = await liveSurvey();

    // BOTH SUBMITS ARE HELD AT THE DOOR BEFORE EITHER MAY WRITE, so the race is
    // made rather than hoped for. This transaction locks the send row; each
    // submit reads the code as live (the read takes no lock) and then waits
    // for the row inside `submit_survey_response`. Only when both are seen
    // waiting is the row released.
    let outcomes: Array<"recorded" | "refused"> = [];
    await db.transaction(async (tx) => {
      await tx.execute(
        raw`select id from appointment_survey_sends
             where appointment_id = ${s.appointmentId}::uuid for update`,
      );
      const both = Promise.all([
        store.submitSurveyResponse({ code: s.code, answer: answer() }),
        store.submitSurveyResponse({ code: s.code, answer: { ...answer(), nps: 3 } }),
      ]);
      let waiting = 0;
      for (let i = 0; i < 200 && waiting < 2; i++) {
        await new Promise((resolve) => setTimeout(resolve, 25));
        waiting = Number(
          rowsOf<{ n: number }>(
            await tx.execute(
              // WHO WAITS ON THIS TRANSACTION, asked of the lock manager. The
              // first submit waits on this session; the second queues behind
              // the first. `pg_blocking_pids` answers for every role, where
              // the activity view hides another role's query and wait event
              // from a session without the statistics privilege (CI's).
              raw`with first as (
                    select pid from pg_stat_activity
                     where pg_backend_pid() = any(pg_blocking_pids(pid))
                  ), behind as (
                    select a.pid from pg_stat_activity a, first f
                     where f.pid = any(pg_blocking_pids(a.pid))
                  )
                  select count(distinct pid)::int as n
                    from (select pid from first union select pid from behind) w`,
            ),
          )[0]!.n,
        );
      }
      // PREMISE: both really are inside the door, past their read of the code.
      expect(waiting).toBe(2);
      // The transaction ends when this callback returns; the submits finish after it.
      void both.then((result) => {
        outcomes = result;
      });
    });
    for (let i = 0; i < 200 && outcomes.length === 0; i++) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    expect([...outcomes].sort()).toEqual(["recorded", "refused"]);
    expect(await answersOf(s.appointmentId)).toHaveLength(1);
    expect((await sendOf(s.appointmentId)).outcome).toBe("answered");
  }, 30_000);

  it("a blank comment is stored as no comment, and an unticked box as no permission", async () => {
    const s = await liveSurvey();
    expect(
      await store.submitSurveyResponse({
        code: s.code,
        answer: { ...answer(), comment: null, contactConsent: false },
      }),
    ).toBe("recorded");
    expect((await answersOf(s.appointmentId))[0]).toMatchObject({ comment: null, contact_consent: false });
  });

  /* ================================================================== */
  /* THE ACTION, THE LIMITER AND THE DATABASE TOGETHER                   */
  /* ================================================================== */

  it("the action records an answer and lands on the thank-you page; a second press gets the generic page", async () => {
    const s = await liveSurvey();
    const ip = address();
    expect(await post(ip, form(s.code))).toBe(`/s/${s.code}?r=answered&l=pt`);
    expect(await answersOf(s.appointmentId)).toHaveLength(1);

    const before = await snapshot();
    expect(await post(ip, form(s.code))).toBe(`/s/${s.code}?r=generic`);
    // The refused press is counted by the limiter and writes nothing else.
    const after = await snapshot();
    expect({ ...after, limiter_hits: 0 }).toEqual({ ...before, limiter_hits: 0 });
    expect(Number(after.limiter_hits)).toBe(Number(before.limiter_hits) + 1);
  });

  it("an incomplete answer is not saved, and the code stays live for the corrected one", async () => {
    const s = await liveSurvey();
    const ip = address();
    const state = await post(ip, form(s.code, { rating: null }));
    expect(state).toEqual({ errors: { rating: true } });
    expect(await answersOf(s.appointmentId)).toEqual([]);
    expect(await sendOf(s.appointmentId)).toEqual({ consumed_at: null, outcome: null });

    expect(await post(ip, form(s.code))).toBe(`/s/${s.code}?r=answered&l=pt`);
  });

  it("an incomplete answer is not counted, and over the limit it is still given its marked fields", async () => {
    const s = await liveSurvey();
    const ip = address();

    // Not counted: no row of any kind, the limiter's included.
    const before = await snapshot();
    expect(await post(ip, form(s.code, { nps: null }))).toEqual({ errors: { nps: true } });
    expect(await snapshot()).toEqual(before);

    // Use the address up with ten complete answers to a code nobody issued.
    const unknown = codes.generateSurveyCode();
    for (let i = 1; i <= 10; i++) {
      expect(await post(ip, form(unknown)), `submit ${i}`).toBe(`/s/${unknown}?r=generic`);
    }
    // CONTROL: the address is over its limit. A complete answer to the live
    // code is turned away and nothing is saved.
    expect(await post(ip, form(s.code))).toBe(`/s/${s.code}?r=generic`);
    expect(await answersOf(s.appointmentId)).toEqual([]);

    // Over the limit, the incomplete answer reads exactly as it did under it,
    // for the live code and for the unknown one.
    expect(await post(ip, form(s.code, { nps: null }))).toEqual({ errors: { nps: true } });
    expect(await post(ip, form(unknown, { nps: null }))).toEqual({ errors: { nps: true } });
  }, 60_000);

  it("THE LIMITER: the eleventh submit in a minute is refused before the database is asked, and looks like a bad code", async () => {
    const ip = address();
    const unknown = codes.generateSurveyCode();

    // Ten submits of a code nobody issued: each is refused by the door.
    for (let i = 1; i <= 10; i++) {
      expect(await post(ip, form(unknown)), `submit ${i}`).toBe(`/s/${unknown}?r=generic`);
    }

    // The eleventh carries a LIVE code and a complete answer. Only the limiter
    // can refuse it, and it must write nothing.
    const s = await liveSurvey();
    const before = await snapshot();
    const eleventh = await post(ip, form(s.code));
    expect(eleventh).toBe(`/s/${s.code}?r=generic`);
    const after = await snapshot();
    expect({ ...after, limiter_hits: 0 }).toEqual({ ...before, limiter_hits: 0 });
    expect(await answersOf(s.appointmentId)).toEqual([]);
    expect(await sendOf(s.appointmentId)).toEqual({ consumed_at: null, outcome: null });

    // IT LOOKS LIKE A BAD CODE: the same redirect shape as the ten refusals
    // above, and the page it lands on is the page a bad code gets, byte for
    // byte, although this code is still live.
    expect(String(eleventh).replace(s.code, unknown)).toBe(`/s/${unknown}?r=generic`);
    expect(await render(s.code, { r: "generic" })).toBe(await render(unknown));

    // CONTROL: it was the limiter and not the code. The same code and the same
    // answer from another address are recorded.
    expect(await post(address(), form(s.code))).toBe(`/s/${s.code}?r=answered&l=pt`);
    expect(await answersOf(s.appointmentId)).toHaveLength(1);
  }, 60_000);

  /* ================================================================== */
  /* NOTHING ABOUT THE PATIENT IS RENDERED OR LOGGED                     */
  /* ================================================================== */

  it("the page shows the visit date and no name, phone, email, therapist or clinic; nothing logs a code or a contact", async () => {
    const s = await liveSurvey();
    const html = await render(s.code);
    const { formatDateLong } = await import("@/lib/reminders/locale");

    // CONTROL: the same reading of the same page finds what must be there.
    expect(html).toContain(`Consulta de ${formatDateLong(s.endsAt, "pt")}`);

    const personal = [patientName(s.n), patientEmail(s.n), patientPhone(s.n), THERAPIST_NAME, CLINIC_NAME, run];
    for (const text of personal) expect(html, text).not.toContain(text);
    expect(html).not.toMatch(/@sat01page\.test/);
    expect(html).not.toContain(s.patientId);
    expect(html).not.toContain(s.appointmentId);

    // A full round: open, a refused submit, a recorded one, a second press.
    const ip = address();
    await post(ip, form(s.code, { nps: null }));
    await post(ip, form(s.code));
    await post(ip, form(s.code));
    await render(s.code);

    // CONTROL: the capture is live and the check below can fail. This path
    // logs nothing of its own, so without a line the loop would run zero
    // times and pass on nothing.
    expect(logged, "the application logged on a path that must be silent").toEqual([]);
    console.error("[surveys] control line");
    expect(logged).toEqual(["[surveys] control line"]);
    expect(() => {
      for (const line of [...logged, `leak ${s.code}`]) expect(line).not.toContain(s.code);
    }).toThrow();

    for (const line of logged) {
      for (const text of [s.code, s.codeHash, ANSWER.comment, ...personal]) {
        expect(line, "a log line carried something it must not").not.toContain(text);
      }
    }
  });
});
