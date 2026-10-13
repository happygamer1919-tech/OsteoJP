/**
 * sat01-survey-rls.db.test.ts: 0102 (held), SAT-01's tables, doors and policies.
 * The BEHAVIOUR CHECK PER ROLE of strategy's build order (S-1002-D), the door
 * arms of the spec's section 9.1, and the survey switch of ruling R34.
 *
 * The migration is packages/db/migrations-pending/NEXT-AFTER-0101_sat01_satisfaction_
 * survey.sql until it is promoted. So this file ASKS THE SCHEMA WHICH SIDE IT IS ON:
 *   1. NEVER HALF. 0102 is one transaction: three tables, one column, nine functions,
 *      one trigger and two policies, sixteen parts. All sixteen, or none; anything
 *      else THROWS, and nothing here is measured.
 *   2. THE PROMOTION FLIPS IT. Once a .sql file in packages/db/migrations creates
 *      appointment_survey_responses, a database WITHOUT 0102 THROWS: from the
 *      promotion commit on, these arms cannot be skipped.
 *   3. ONLY THE ARM THAT APPLIES IS REGISTERED, NEVER SKIPPED. Before the
 *      promotion, CI's db-tests applies supabase/migrations, which does not hold a
 *      pending file, so the database is on the pre-0102 side and the one arm
 *      registered there says so in its title and asserts that side whole: "not
 *      measured", never "fine". `.github/scripts/assert-rls-executed.mjs` reddens
 *      the required DB-gated check for any suite with a test that did not run, so a
 *      `describe.skip` for the other arm would need an entry in that gate's list of
 *      permitted skips, and this file asks for none (the shape of
 *      packages/db/tests/guest-request-email.db.test.ts, 0101's suite). The build
 *      lane runs the applied arm on a lane stack with 0101 and 0102 applied
 *      (docs/migration-apply-0102.md, "Rehearsal"), and CI runs it from the
 *      promotion on, with no edit to this file.
 *
 * WITHOUT DATABASE_URL (the unit job) the one registered arm is `describe.skip`,
 * as every DB-gated suite in this repository is.
 *
 * HOW EACH ROLE IS MEASURED: as an assigned principal. `set local role
 * authenticated` (or patient, or anon) and the real JWT claims the app's
 * contexts set (tenant_id, user_role, sub), in a transaction that always rolls
 * back (rls-harness.ts), so the policies decide. The owner connection seeds and
 * cleans only, because it bypasses RLS.
 *
 * NEVER A PASS ON AN EMPTY SET. The matrix first asserts the PREMISE (the owner
 * reads exactly the three answers of the tenant, and the other tenant's answer
 * exists), and every role's expectation is an exact set, so a role that should
 * read nothing reads nothing BESIDE a role that reads something. Two controls
 * prove the matrix can go red: the S7 policy dropped (nobody reads anything) and
 * the S7 policy widened to the tenant (a colleague who did not attend reads all).
 *
 * THE FIXTURE (no real names; every id random per run; committed, removed in
 * afterAll):
 *   clinics A and B of tenant T; tenant X with clinic XA;
 *   owner; admin A, admin B; reception A, reception B; admin and reception with NO
 *   clinic; therapist t1 (A), t2 (A), t3 (B only), t4 (A), t5 (B); owner of X, a
 *   therapist of X;
 *   answer 1: P1's visit at A, attended by t1 with t4 as the second practitioner
 *             (a shared NESA visit);
 *   answer 2: P2's visit at B, attended by t5;
 *   answer 3: P3's visit at A, attended by t3, who is assigned to B only (the
 *             attending therapist who lost the clinic assignment);
 *   send 4:   P4's visit at A, attended by t2, sent and never answered;
 *   answer X: tenant X's.
 * Every send above is written by issue_survey_automatic in the 24-hour job's
 * context, and every answer by submit_survey_response in the guest page's
 * context, through their codes: the fixture itself goes through the doors.
 *
 * THE SURVEY PAGE'S DOORS (the review of 2026-10-05): the read, the answer and the
 * opt-out answer ONLY the server's own session (a tenant, no user, no patient
 * claim). Every session that carries a user is tried against a live code and gets
 * what an unknown code gets, beside the server's session reading the same code.
 *
 * THE SURVEY SWITCH (R34), "settable by the patient and by the same staff roles
 * that edit reminder preferences, same clinic scope, with an audit row per change,
 * in RLS". Measured AS A DIFFERENCE, not against a list written here alone: every
 * principal tries the survey switch AND both reminder switches on the same patient,
 * and the three answers must be the same, beside the answer this file expects. Each
 * change must leave exactly one audit_log row, and each refusal none.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Sql, TransactionSql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type AppRole, Rollback, claimsFor, connect, live, patientClaims } from "./rls-harness";

const TABLES = ["appointment_survey_sends", "appointment_survey_codes", "appointment_survey_responses"] as const;
const FUNCTIONS = [
  "public.survey_manual_verdict(uuid,uuid,text)",
  "public.issue_survey_automatic(text,uuid,uuid,text)",
  "public.issue_survey_manual(text,uuid,uuid,text)",
  "public.survey_send_state(uuid,uuid)",
  "public.resolve_survey_code(text)",
  "public.submit_survey_response(text,uuid,integer,integer,text,boolean,text)",
  "public.opt_out_survey(text,uuid)",
  "public.purge_expired_survey_comments(uuid)",
  "public.patients_survey_switch_audit()",
];
const DOORS = FUNCTIONS.filter((f) => !/survey_manual_verdict|purge_expired_survey_comments|patients_survey_switch_audit/.test(f));
const SWITCH_TRIGGER = "patients_survey_switch_audit";
const SWITCH_ACTION = "survey.switch_changed";

/** The promoted migration files that create 0102's answer table, if any. */
function promotedFiles(): string[] {
  const dir = join(__dirname, "..", "migrations");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .filter((f) => /CREATE TABLE public\.appointment_survey_responses/.test(readFileSync(join(dir, f), "utf8")));
}

/** Which side of 0102 this database is on. Throws on anything but a whole side. */
async function applied0102(): Promise<boolean> {
  if (!live) return false;
  const probe = connect();
  try {
    const [r] = await probe<{ n: number }[]>`
      select (
        (select count(*) from unnest(${TABLES.map((t) => `public.${t}`)}::text[]) t where to_regclass(t) is not null)
        + (select count(*) from pg_attribute where attrelid = 'public.patients'::regclass and attname = 'survey_enabled' and not attisdropped)
        + (select count(*) from unnest(${FUNCTIONS}::text[]) f where to_regprocedure(f) is not null)
        + (select count(*) from pg_policy where polname in ('appointment_survey_sends_select', 'appointment_survey_responses_select'))
        + (select count(*) from pg_trigger where tgname = ${SWITCH_TRIGGER} and tgrelid = 'public.patients'::regclass and not tgisinternal)
      )::int as n`;
    const n = r?.n ?? -1;
    let applied: boolean;
    if (n === 16) applied = true;
    else if (n === 0) applied = false;
    else {
      throw new Error(
        `0102 IS HALF APPLIED: ${n} of 16 parts present (3 tables, 1 column, 9 functions, 2 policies, 1 trigger). 0102 applies as ` +
          "one transaction, so this database was built some other way. Nothing here was measured.",
      );
    }
    const promoted = promotedFiles();
    if (promoted.length > 0 && !applied) {
      throw new Error(
        `0102 IS PROMOTED (${promoted.join(", ")} creates appointment_survey_responses) BUT THIS DATABASE DOES NOT HAVE IT. ` +
          "From the promotion on, the pre-0102 answer is no longer acceptable. Nothing here was measured.",
      );
    }
    return applied;
  } finally {
    await probe.end({ timeout: 5 });
  }
}

const w102 = await applied0102();
const SIDE = w102 ? "0102 APPLIED" : "0102 NOT APPLIED on this database (the arms run once 0102 is applied)";
const dLive = live ? describe : describe.skip;

const hex = (): string => randomBytes(32).toString("hex");

const W = {
  tenant: randomUUID(),
  other: randomUUID(),
  locA: randomUUID(),
  locB: randomUUID(),
  locX: randomUUID(),
  owner: randomUUID(),
  adminA: randomUUID(),
  adminB: randomUUID(),
  recA: randomUUID(),
  recB: randomUUID(),
  admin0: randomUUID(),
  rec0: randomUUID(),
  t1: randomUUID(),
  t2: randomUUID(),
  t3: randomUUID(),
  t4: randomUUID(),
  t5: randomUUID(),
  ownerX: randomUUID(),
  tX: randomUUID(),
  p1: randomUUID(),
  p2: randomUUID(),
  p3: randomUUID(),
  p4: randomUUID(),
  pX: randomUUID(),
  a1: randomUUID(),
  a2: randomUUID(),
  a3: randomUUID(),
  a4: randomUUID(),
  aX: randomUUID(),
};

/** The 24-hour job's context: a tenant, the job's role, and NO user (withReminderTenantContext). */
const jobClaims = (tenant: string): string => JSON.stringify({ tenant_id: tenant, user_role: "admin" });
/** The guest page's context after resolve: the same shape, the tenant resolve returned. */
const guestClaims = jobClaims;

let sql: Sql;

/**
 * Run `fn` in a transaction that ALWAYS rolls back: `setup` first as the owner, then
 * `set local role <role>` with `claims` as request.jwt.claims. `fn` may call `owner(tx)`
 * to read as the owner again, and `as(tx, claims)` to switch principal.
 */
async function scenario<T>(
  setup: ((tx: TransactionSql) => Promise<void>) | null,
  claims: string | null,
  fn: (tx: TransactionSql) => Promise<T>,
  role: "authenticated" | "patient" | "anon" = "authenticated",
): Promise<T> {
  try {
    await sql.begin(async (tx) => {
      if (setup) await setup(tx);
      await tx.unsafe(`set local role ${role}`);
      await tx`select set_config('request.jwt.claims', ${claims ?? ""}, true)`;
      const value = await fn(tx);
      throw new Rollback(value);
    });
    throw new Error("unreachable: the scenario committed");
  } catch (err) {
    if (err instanceof Rollback) return err.value as T;
    throw err;
  }
}

/** Switch the principal inside a scenario (role stays authenticated). */
const as = async (tx: TransactionSql, claims: string | null): Promise<void> => {
  await tx`select set_config('request.jwt.claims', ${claims ?? ""}, true)`;
};
/** Read as the owner inside a scenario, then come back to `authenticated`. */
async function owner<T>(tx: TransactionSql, fn: () => Promise<T>): Promise<T> {
  await tx.unsafe("reset role");
  try {
    return await fn();
  } finally {
    await tx.unsafe("set local role authenticated");
  }
}

/** A committed call as `authenticated` with `claims` (the fixture and the races only). */
async function committed<T>(conn: Sql, claims: string, fn: (tx: TransactionSql) => Promise<T>): Promise<T> {
  return (await conn.begin(async (tx) => {
    await tx.unsafe("set local role authenticated");
    await tx`select set_config('request.jwt.claims', ${claims}, true)`;
    return fn(tx);
  })) as T;
}

const issueAuto = async (tx: TransactionSql, code: string, tenant: string, appt: string, channel = "email"): Promise<string> =>
  ((await tx`select public.issue_survey_automatic(${code}, ${tenant}::uuid, ${appt}::uuid, ${channel}) as r`)[0] as { r: string }).r;
const issueManual = async (
  tx: TransactionSql,
  code: string,
  tenant: string,
  patient: string,
  channel = "email",
): Promise<{ result: string; appointment_id: string | null }> =>
  (await tx`select * from public.issue_survey_manual(${code}, ${tenant}::uuid, ${patient}::uuid, ${channel})`)[0] as {
    result: string;
    appointment_id: string | null;
  };
const sendState = async (
  tx: TransactionSql,
  tenant: string,
  patient: string,
): Promise<{ state: string; reason: string | null; appointment_id: string | null }> =>
  (await tx`select * from public.survey_send_state(${tenant}::uuid, ${patient}::uuid)`)[0] as {
    state: string;
    reason: string | null;
    appointment_id: string | null;
  };
const resolve = async (tx: TransactionSql, code: string) =>
  (await tx`select tenant_id::text, appointment_id::text, visit_ends_at::text from public.resolve_survey_code(${code})`) as {
    tenant_id: string;
    appointment_id: string;
    visit_ends_at: string;
  }[];
const submit = async (
  tx: TransactionSql,
  code: string,
  tenant: string,
  a: { nps?: number; rating?: number; comment?: string | null; consent?: boolean; label?: string } = {},
): Promise<boolean> =>
  (
    (await tx`select public.submit_survey_response(${code}, ${tenant}::uuid, ${a.nps ?? 9}::int, ${a.rating ?? 5}::int,
                ${a.comment === undefined ? "muito bom" : a.comment}::text, ${a.consent ?? false}::boolean,
                ${a.label ?? "sat01-pt-v1"}::text) as ok`)[0] as { ok: boolean }
  ).ok;
const optOut = async (tx: TransactionSql, code: string, tenant: string): Promise<boolean> =>
  ((await tx`select public.opt_out_survey(${code}, ${tenant}::uuid) as ok`)[0] as { ok: boolean }).ok;

/** A patient of tenant T created inside a scenario's setup. */
async function mkPatient(
  tx: TransactionSql,
  o: {
    email?: string | null; phone?: string | null; emailOn?: boolean; smsOn?: boolean; survey?: boolean; deleted?: boolean;
    createdBy?: string | null; primaryLocation?: string | null;
  } = {},
): Promise<string> {
  const id = randomUUID();
  await tx`insert into patients (id, tenant_id, full_name, email, phone, reminder_email_enabled, reminder_sms_enabled, created_by, primary_location_id)
           values (${id}, ${W.tenant}, 'Utente cenario', ${o.email === undefined ? `u-${id}@fixture.invalid` : o.email},
                   ${o.phone === undefined ? "+351900000000" : o.phone}, ${o.emailOn ?? true}, ${o.smsOn ?? true},
                   ${o.createdBy ?? null}, ${o.primaryLocation ?? null})`;
  if (o.survey === false) await tx`update patients set survey_enabled = false where id = ${id}`;
  if (o.deleted) await tx`update patients set deleted_at = now() where id = ${id}`;
  return id;
}
/** An appointment of tenant T created inside a scenario's setup, ending `daysAgo` days ago. */
async function mkAppt(
  tx: TransactionSql,
  patient: string,
  o: { by?: string; second?: string | null; loc?: string; status?: string; daysAgo?: number } = {},
): Promise<string> {
  const id = randomUUID();
  const days = o.daysAgo ?? 2;
  await tx`insert into appointments (id, tenant_id, patient_id, practitioner_id, practitioner_2_id, location_id, starts_at, ends_at, status)
           values (${id}, ${W.tenant}, ${patient}, ${o.by ?? W.t1}, ${o.second ?? null}, ${o.loc ?? W.locA},
                   now() - make_interval(days => ${days}) - interval '45 minutes', now() - make_interval(days => ${days}),
                   ${o.status ?? "completed"}::appointment_status)`;
  return id;
}
/** Age a send (and so its link) by `days`, as the owner. */
const ageSends = async (tx: TransactionSql, patient: string, days: number): Promise<void> => {
  await tx`update appointment_survey_sends set sent_at = now() - make_interval(days => ${days}) where patient_id = ${patient}`;
};

const staff = (role: AppRole, user: string, tenant = W.tenant): string => claimsFor(tenant, role, user);

/** The appointment ids of the answers a principal reads. */
const answersSeen = (tx: TransactionSql) =>
  tx<{ id: string }[]>`select appointment_id::text as id from appointment_survey_responses order by 1`;
const sendsSeen = (tx: TransactionSql) => tx<{ id: string }[]>`select appointment_id::text as id from appointment_survey_sends order by 1`;
const ids = (rows: { id: string }[]): string[] => rows.map((r) => r.id).sort();
const sorted = (...xs: string[]): string[] => [...xs].sort();

/** Did a statement run as `role` fail for the PRIVILEGE (42501)? Matched on the code, not the text. */
async function refused(role: "authenticated" | "patient" | "anon", claims: string | null, statement: string): Promise<boolean> {
  return (await refusal(role, claims, statement)) !== null;
}
/**
 * The 42501 a statement raised, or null. An RLS refusal ("new row violates row-level security
 * policy") is ALSO 42501, so a test about the TABLE GRANT reads the message as well: "permission
 * denied for table" is the grant, nothing else is (the mutation sweep found a granted INSERT that
 * RLS alone still refused with 42501).
 */
async function refusal(role: "authenticated" | "patient" | "anon", claims: string | null, statement: string): Promise<string | null> {
  try {
    await scenario(null, claims, (tx) => tx.unsafe(statement), role);
    return null;
  } catch (err) {
    const e = err as { code?: string; message?: string };
    return e?.code === "42501" ? (e.message ?? "") : null;
  }
}
const byGrant = (m: string | null): boolean => m !== null && /^permission denied for table /.test(m);

if (!w102) dLive(`SAT-01 0102 is not applied on this database, so its arms were NOT measured [${SIDE}]`, () => {
  it("none of the sixteen parts exists: the pre-0102 side, whole", async () => {
    const probe = connect();
    try {
      const [r] = await probe<{ tables: number; col: number; fns: number; pols: number; trg: number }[]>`
        select (select count(*)::int from unnest(${TABLES.map((x) => `public.${x}`)}::text[]) x where to_regclass(x) is not null) as tables,
               (select count(*)::int from pg_attribute where attrelid = 'public.patients'::regclass and attname = 'survey_enabled' and not attisdropped) as col,
               (select count(*)::int from unnest(${FUNCTIONS}::text[]) f where to_regprocedure(f) is not null) as fns,
               (select count(*)::int from pg_policy where polname in ('appointment_survey_sends_select', 'appointment_survey_responses_select')) as pols,
               (select count(*)::int from pg_trigger where tgname = ${SWITCH_TRIGGER} and not tgisinternal) as trg`;
      expect(r).toEqual({ tables: 0, col: 0, fns: 0, pols: 0, trg: 0 });
      // THE CONTROL: the same probes find what is there today, so a zero above is not a probe that finds nothing.
      const [c] = await probe<{ t: boolean; f: boolean; col: number }[]>`
        select to_regclass('public.appointment_confirm_codes') is not null as t,
               to_regprocedure('public.resolve_confirm_code(text)') is not null as f,
               (select count(*)::int from pg_attribute where attrelid = 'public.patients'::regclass and attname = 'reminder_sms_enabled' and not attisdropped) as col`;
      expect(c).toEqual({ t: true, f: true, col: 1 });
    } finally {
      await probe.end({ timeout: 5 });
    }
  });
});

if (w102) dLive(`SAT-01 0102: the behaviour check per role, the guest token, the doors and the switch [${SIDE}]`, () => {
  beforeAll(async () => {
    sql = connect();
    await sql`insert into tenants (id, name, slug) values
      (${W.tenant}, 'S101', ${`s101-${W.tenant}`}), (${W.other}, 'S101 X', ${`s101x-${W.other}`})`;
    await sql`insert into locations (id, tenant_id, name) values
      (${W.locA}, ${W.tenant}, 'Clinica A'), (${W.locB}, ${W.tenant}, 'Clinica B'), (${W.locX}, ${W.other}, 'Clinica XA')`;
    const users: [string, string][] = [
      [W.owner, W.tenant], [W.adminA, W.tenant], [W.adminB, W.tenant], [W.recA, W.tenant], [W.recB, W.tenant],
      [W.admin0, W.tenant], [W.rec0, W.tenant], [W.t1, W.tenant], [W.t2, W.tenant], [W.t3, W.tenant], [W.t4, W.tenant],
      [W.t5, W.tenant], [W.ownerX, W.other], [W.tX, W.other],
    ];
    for (const [id, tenant] of users) {
      await sql`insert into users (id, tenant_id, email, full_name) values (${id}, ${tenant}, ${`s-${id}@fixture.invalid`}, 'Staff fixture')`;
    }
    const assigned: [string, string, string][] = [
      [W.adminA, W.locA, W.tenant], [W.adminB, W.locB, W.tenant], [W.recA, W.locA, W.tenant], [W.recB, W.locB, W.tenant],
      [W.t1, W.locA, W.tenant], [W.t2, W.locA, W.tenant], [W.t3, W.locB, W.tenant], [W.t4, W.locA, W.tenant],
      [W.t5, W.locB, W.tenant], [W.tX, W.locX, W.other],
    ];
    for (const [user, loc, tenant] of assigned) {
      await sql`insert into staff_locations (tenant_id, user_id, location_id) values (${tenant}, ${user}, ${loc})`;
    }
    for (const [id, tenant] of [[W.p1, W.tenant], [W.p2, W.tenant], [W.p3, W.tenant], [W.p4, W.tenant], [W.pX, W.other]] as const) {
      await sql`insert into patients (id, tenant_id, full_name, email, phone)
                values (${id}, ${tenant}, 'Utente fixture', ${`u-${id}@fixture.invalid`}, '+351900000001')`;
    }
    const appts: [string, string, string, string, string | null, string][] = [
      [W.a1, W.tenant, W.p1, W.t1, W.t4, W.locA],
      [W.a2, W.tenant, W.p2, W.t5, null, W.locB],
      [W.a3, W.tenant, W.p3, W.t3, null, W.locA],
      [W.a4, W.tenant, W.p4, W.t2, null, W.locA],
      [W.aX, W.other, W.pX, W.tX, null, W.locX],
    ];
    for (const [id, tenant, patient, by, second, loc] of appts) {
      await sql`insert into appointments (id, tenant_id, patient_id, practitioner_id, practitioner_2_id, location_id, starts_at, ends_at, status)
                values (${id}, ${tenant}, ${patient}, ${by}, ${second}, ${loc}, now() - interval '2 days 45 minutes', now() - interval '2 days', 'completed')`;
    }
    // Through the doors: the job issues every send; the guest page answers four of them.
    for (const [tenant, appt, answer] of [
      [W.tenant, W.a1, true], [W.tenant, W.a2, true], [W.tenant, W.a3, true], [W.tenant, W.a4, false], [W.other, W.aX, true],
    ] as const) {
      const code = hex();
      const issued = await committed(sql, jobClaims(tenant), (tx) => issueAuto(tx, code, tenant, appt));
      if (issued !== "issued") throw new Error(`fixture: the job could not issue the send of ${appt}: ${issued}`);
      if (answer) {
        const ok = await committed(sql, guestClaims(tenant), (tx) => submit(tx, code, tenant));
        if (!ok) throw new Error(`fixture: the guest page could not answer the send of ${appt}`);
      }
    }
  });

  afterAll(async () => {
    if (!sql) return;
    // Answers refer to their send and appointment WITHOUT a cascade (O6 (a)), so they go first.
    // Codes and sends refer to the tenant with no cascade either, and the tenant's own RI check
    // can fire before the appointments cascade reaches them (measured: the tenant delete is
    // refused with them in place), so they go next. The tenant delete then cascades the rest.
    await sql`delete from appointment_survey_responses where tenant_id in (${W.tenant}, ${W.other})`;
    await sql`delete from appointment_survey_codes where tenant_id in (${W.tenant}, ${W.other})`;
    await sql`delete from appointment_survey_sends where tenant_id in (${W.tenant}, ${W.other})`;
    await sql`delete from tenants where id in (${W.tenant}, ${W.other})`;
    await sql.end();
  });

  /* ---------------------------------------------------------------------- */
  /* THE BEHAVIOUR CHECK PER ROLE: answers (S7)                             */
  /* ---------------------------------------------------------------------- */
  it("PREMISE: the owner reads exactly the tenant's three answers, and tenant X's answer exists", async () => {
    expect(ids(await scenario(null, staff("owner", W.owner), answersSeen))).toEqual(sorted(W.a1, W.a2, W.a3));
    const [x] = await sql<{ n: number }[]>`select count(*)::int as n from appointment_survey_responses where tenant_id = ${W.other}`;
    expect(x?.n).toBe(1);
  });

  const ANSWERS: [string, () => string, () => string[]][] = [
    ["owner: every clinic of the tenant", () => staff("owner", W.owner), () => [W.a1, W.a2, W.a3]],
    ["admin of clinic A: clinic A only", () => staff("admin", W.adminA), () => [W.a1, W.a3]],
    ["admin of clinic B: clinic B only", () => staff("admin", W.adminB), () => [W.a2]],
    ["reception of clinic A (own clinic): clinic A", () => staff("reception", W.recA), () => [W.a1, W.a3]],
    ["reception of clinic B (the other clinic): nothing at A", () => staff("reception", W.recB), () => [W.a2]],
    ["therapist OWN: t1 attended P1's visit at A, an own clinic", () => staff("therapist", W.t1), () => [W.a1]],
    ["therapist, the NESA second practitioner of P1's visit, at A", () => staff("therapist", W.t4), () => [W.a1]],
    ["therapist OTHER: t2, same clinic A, attended none of them", () => staff("therapist", W.t2), () => []],
    ["therapist who attended P3's visit at A but is assigned to B only", () => staff("therapist", W.t3), () => []],
    ["therapist t5, attended P2's visit at B, own clinic", () => staff("therapist", W.t5), () => [W.a2]],
    ["admin with no clinic assignment", () => staff("admin", W.admin0), () => []],
    ["reception with no clinic assignment", () => staff("reception", W.rec0), () => []],
    ["owner of tenant X: X's answer only", () => staff("owner", W.ownerX, W.other), () => [W.aX]],
    ["the 24-hour job and the guest page (tenant, no user)", () => jobClaims(W.tenant), () => []],
    ["a session with a role the policy does not name", () => claimsFor(W.tenant, "superadmin" as AppRole, W.owner), () => []],
  ];
  for (const [name, claims, want] of ANSWERS) {
    it(`ANSWERS, ${name}`, async () => {
      expect(ids(await scenario(null, claims(), answersSeen))).toEqual(sorted(...want()));
    });
  }

  it("ANSWERS, anon: permission denied on all three tables (42501)", async () => {
    for (const t of TABLES) expect(await refused("anon", null, `select 1 from public.${t} limit 1`), t).toBe(true);
  });

  it("ANSWERS, patient (P1's own token): permission denied on all three tables (42501)", async () => {
    for (const t of TABLES) expect(await refused("patient", patientClaims(W.tenant, W.p1), `select 1 from public.${t} limit 1`), t).toBe(true);
  });

  it("IT BITES (1): with the S7 policy dropped, even the owner reads nothing, so the policy is what grants each read", async () => {
    const n = await scenario(
      (tx) => tx`drop policy appointment_survey_responses_select on public.appointment_survey_responses`.then(() => undefined),
      staff("owner", W.owner),
      answersSeen,
    );
    expect(n).toEqual([]);
  });

  it("IT BITES (2): with the S7 policy widened to the tenant, the colleague who did not attend reads all three", async () => {
    const seen = await scenario(
      async (tx) => {
        await tx`drop policy appointment_survey_responses_select on public.appointment_survey_responses`;
        await tx`create policy appointment_survey_responses_select on public.appointment_survey_responses
                 for select to authenticated using (tenant_id = (select public.jwt_tenant_id()))`;
      },
      staff("therapist", W.t2),
      answersSeen,
    );
    expect(ids(seen)).toEqual(sorted(W.a1, W.a2, W.a3));
  });

  /* ---------------------------------------------------------------------- */
  /* THE SAME MATRIX ON SENDS (S4's roles, spec 6.5)                        */
  /* ---------------------------------------------------------------------- */
  const SENDS: [string, () => string, () => string[]][] = [
    ["owner: every send of the tenant", () => staff("owner", W.owner), () => [W.a1, W.a2, W.a3, W.a4]],
    ["admin of clinic A", () => staff("admin", W.adminA), () => [W.a1, W.a3, W.a4]],
    ["admin of clinic B", () => staff("admin", W.adminB), () => [W.a2]],
    ["reception of clinic A", () => staff("reception", W.recA), () => [W.a1, W.a3, W.a4]],
    ["reception of clinic B", () => staff("reception", W.recB), () => [W.a2]],
    ["therapist t1, who treats P1", () => staff("therapist", W.t1), () => [W.a1]],
    ["therapist t4, the second practitioner of P1's visit", () => staff("therapist", W.t4), () => [W.a1]],
    ["therapist t2, who treats P4 only (the unanswered send)", () => staff("therapist", W.t2), () => [W.a4]],
    ["therapist t3, who treats P3 (a send is not clinic-bound for a therapist)", () => staff("therapist", W.t3), () => [W.a3]],
    ["admin with no clinic assignment", () => staff("admin", W.admin0), () => []],
    ["reception with no clinic assignment", () => staff("reception", W.rec0), () => []],
    ["owner of tenant X", () => staff("owner", W.ownerX, W.other), () => [W.aX]],
    ["the 24-hour job (tenant, no user)", () => jobClaims(W.tenant), () => []],
  ];
  for (const [name, claims, want] of SENDS) {
    it(`SENDS, ${name}`, async () => {
      expect(ids(await scenario(null, claims(), sendsSeen))).toEqual(sorted(...want()));
    });
  }

  it("a therapist sees that P4's send exists, and not an answer: the send carries no score", async () => {
    const cols = await sql<{ c: string }[]>`
      select string_agg(attname, ',' order by attnum) as c from pg_attribute
       where attrelid = 'public.appointment_survey_sends'::regclass and attnum > 0 and not attisdropped`;
    expect(cols[0]?.c).not.toMatch(/nps|rating|comment|consent/);
  });

  /* ---------------------------------------------------------------------- */
  /* DIRECT WRITES ARE REFUSED; CODES ARE UNREADABLE                        */
  /* ---------------------------------------------------------------------- */
  it("authenticated, patient and anon: INSERT, UPDATE and DELETE on all three tables are refused (42501)", async () => {
    const statements = (t: string) => [
      `insert into public.${t} default values`,
      `update public.${t} set tenant_id = tenant_id`,
      `delete from public.${t}`,
    ];
    for (const t of TABLES) {
      for (const s of statements(t)) {
        expect(byGrant(await refusal("authenticated", staff("owner", W.owner), s)), `authenticated: ${s}`).toBe(true);
        expect(byGrant(await refusal("patient", patientClaims(W.tenant, W.p1), s)), `patient: ${s}`).toBe(true);
        expect(byGrant(await refusal("anon", null, s)), `anon: ${s}`).toBe(true);
      }
    }
    // And in the catalogue, by has_table_privilege: every privilege but SELECT is absent for all
    // three roles, and SELECT is held by authenticated on sends and answers only (the positive
    // control: without it every refusal above could be "this role has nothing at all").
    const rows = await sql<{ t: string; role: string; priv: string; can: boolean }[]>`
      select t, r.rolname as role, v.priv, has_table_privilege(r.oid, ('public.' || t)::regclass, v.priv) as can
        from unnest(${[...TABLES]}::text[]) t
        cross join (select oid, rolname from pg_roles where rolname in ('authenticated', 'patient', 'anon')) r
        cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER'), ('MAINTAIN')) v(priv)`;
    expect(rows.length).toBe(72);
    for (const r of rows) {
      const want = r.role === "authenticated" && r.priv === "SELECT" && r.t !== "appointment_survey_codes";
      expect(r.can, `${r.role} ${r.priv} ${r.t}`).toBe(want);
    }
  });

  it("the codes table: SELECT refused for authenticated, even as the owner of the tenant", async () => {
    expect(await refused("authenticated", staff("owner", W.owner), "select 1 from public.appointment_survey_codes")).toBe(true);
    // CONTROL: the same session reads the sends table without an error.
    expect(await refused("authenticated", staff("owner", W.owner), "select 1 from public.appointment_survey_sends")).toBe(false);
  });

  it("EXECUTE by name: six doors to authenticated only; the helper, the purge and the switch's trigger function to no application role", async () => {
    const rows = await sql<{ f: string; role: string; can: boolean }[]>`
      select f, r.rolname as role, has_function_privilege(r.oid, to_regprocedure(f), 'EXECUTE') as can
        from unnest(${FUNCTIONS}::text[]) f
        cross join (select oid, rolname from pg_roles where rolname in ('authenticated', 'anon', 'patient', 'service_role')) r`;
    for (const r of rows) {
      const want = r.role === "authenticated" && DOORS.includes(r.f);
      expect(r.can, `${r.role} ${r.f}`).toBe(want);
    }
    expect(rows.length).toBe(36);
  });

  /* ---------------------------------------------------------------------- */
  /* THE GUEST TOKEN PATH                                                   */
  /* ---------------------------------------------------------------------- */
  it("GUEST: a live code resolves to one row and opening it writes nothing", async () => {
    const code = hex();
    const out = await scenario(null, jobClaims(W.tenant), async (tx) => {
      const p = await owner(tx, () => mkPatient(tx));
      const a = await owner(tx, () => mkAppt(tx, p));
      expect(await issueAuto(tx, code, W.tenant, a)).toBe("issued");
      await as(tx, null);
      const before = await owner(tx, () => tx`select count(*)::int as n, count(consumed_at)::int as c from appointment_survey_sends where patient_id = ${p}`);
      const rows = await resolve(tx, code);
      const after = await owner(tx, () => tx`select count(*)::int as n, count(consumed_at)::int as c from appointment_survey_sends where patient_id = ${p}`);
      const [visit] = await owner(tx, () => tx<{ ends: string; starts: string }[]>`select ends_at::text as ends, starts_at::text as starts from appointments where id = ${a}`);
      return { rows, before: before[0], after: after[0], a, visit };
    });
    expect(out.rows.length).toBe(1);
    expect(out.rows[0]?.appointment_id).toBe(out.a);
    expect(out.rows[0]?.tenant_id).toBe(W.tenant);
    // The third column is the visit's END (the page says when the visit was), never its start.
    expect(out.rows[0]?.visit_ends_at).toBe(out.visit?.ends);
    expect(out.visit?.starts).not.toBe(out.visit?.ends);
    expect(out.after).toEqual(out.before);
  });

  it("GUEST: the token writes ONE answer, consumes its send, and writes one audit row holding the channel only", async () => {
    const code = hex();
    const out = await scenario(null, jobClaims(W.tenant), async (tx) => {
      const p = await owner(tx, () => mkPatient(tx));
      const a = await owner(tx, () => mkAppt(tx, p, { by: W.t2, second: W.t4, loc: W.locB }));
      expect(await issueAuto(tx, code, W.tenant, a, "sms")).toBe("issued");
      await as(tx, guestClaims(W.tenant));
      const ok = await submit(tx, code, W.tenant, { nps: 3, rating: 2, comment: "  ", consent: true, label: "sat01-pt-v1" });
      return owner(tx, async () => ({
        ok,
        answers: await tx`select send_id::text, patient_id::text, channel, location_id::text, practitioner_id::text,
                                 practitioner_2_id::text, nps, rating, comment, contact_consent, consent_version,
                                 (sent_at = (select sent_at from appointment_survey_sends s where s.appointment_id = ${a})) as sent_at_copied
                            from appointment_survey_responses where appointment_id = ${a}`,
        send: await tx`select id::text, consumed_at is not null as consumed, outcome from appointment_survey_sends where appointment_id = ${a}`,
        audit: await tx`select actor_user_id, action, entity_type, entity_id::text, metadata from audit_log
                         where tenant_id = ${W.tenant} and entity_id = ${a} and action like 'survey.%'`,
        p,
        a,
      }));
    });
    expect(out.ok).toBe(true);
    expect(out.answers.length).toBe(1);
    expect(out.answers[0]).toMatchObject({
      send_id: out.send[0]?.id,
      patient_id: out.p,
      channel: "sms",
      location_id: W.locB,
      practitioner_id: W.t2,
      practitioner_2_id: W.t4,
      nps: 3,
      rating: 2,
      comment: null,
      contact_consent: true,
      consent_version: "sat01-pt-v1",
      sent_at_copied: true,
    });
    expect(out.send[0]).toMatchObject({ consumed: true, outcome: "answered" });
    expect(out.audit).toEqual([{ actor_user_id: null, action: "survey.submitted", entity_type: "appointment", entity_id: out.a, metadata: { channel: "sms" } }]);
  });

  it("GUEST: a REUSED, an OPTED-OUT, an EXPIRED and an UNKNOWN token get the same refusal, and write nothing", async () => {
    const out = await scenario(null, jobClaims(W.tenant), async (tx) => {
      const used = hex();
      const expired = hex();
      const p1 = await owner(tx, () => mkPatient(tx));
      const a1 = await owner(tx, () => mkAppt(tx, p1));
      const p2 = await owner(tx, () => mkPatient(tx));
      const a2 = await owner(tx, () => mkAppt(tx, p2));
      expect(await issueAuto(tx, used, W.tenant, a1)).toBe("issued");
      expect(await issueAuto(tx, expired, W.tenant, a2)).toBe("issued");
      await owner(tx, () => ageSends(tx, p2, 15));
      await as(tx, guestClaims(W.tenant));
      expect(await submit(tx, used, W.tenant)).toBe(true);
      // A fourth: a code spent by the page's OPT-OUT, which leaves no answer behind.
      const optedCode = hex();
      const p3 = await owner(tx, () => mkPatient(tx));
      const a3 = await owner(tx, () => mkAppt(tx, p3));
      await as(tx, jobClaims(W.tenant));
      expect(await issueAuto(tx, optedCode, W.tenant, a3)).toBe("issued");
      await as(tx, guestClaims(W.tenant));
      expect(await optOut(tx, optedCode, W.tenant)).toBe(true);
      const count = () => owner(tx, () => tx`select (select count(*) from appointment_survey_responses where tenant_id = ${W.tenant})::int as r,
                                                     (select count(*) from audit_log where tenant_id = ${W.tenant} and action like 'survey.%')::int as a`);
      const before = (await count())[0];
      const verdicts: Record<string, unknown> = {};
      for (const [name, code] of [["reused", used], ["spent by an opt-out", optedCode], ["expired", expired], ["unknown", hex()]] as const) {
        verdicts[name] = {
          resolve: (await resolve(tx, code)).length,
          submit: await submit(tx, code, W.tenant),
          optOut: await optOut(tx, code, W.tenant),
        };
      }
      return { verdicts, before, after: (await count())[0] };
    });
    const same = { resolve: 0, submit: false, optOut: false };
    expect(out.verdicts).toEqual({ reused: same, "spent by an opt-out": same, expired: same, unknown: same });
    expect(out.after).toEqual(out.before);
  });

  it("GUEST: a code is refused for a tenant that is not the session's, and for a tenant it does not belong to", async () => {
    const out = await scenario(null, jobClaims(W.tenant), async (tx) => {
      const code = hex();
      const p = await owner(tx, () => mkPatient(tx));
      const a = await owner(tx, () => mkAppt(tx, p));
      expect(await issueAuto(tx, code, W.tenant, a)).toBe("issued");
      await as(tx, guestClaims(W.other));
      const wrongSession = await submit(tx, code, W.tenant);
      const wrongTenant = await submit(tx, code, W.other);
      await as(tx, guestClaims(W.tenant));
      const right = await submit(tx, code, W.tenant);
      return { wrongSession, wrongTenant, right };
    });
    expect(out).toEqual({ wrongSession: false, wrongTenant: false, right: true });
  });

  it("GUEST: a code whose visit is no longer concluded, whose patient is soft-deleted, or whose visit is answered, resolves to nothing", async () => {
    const out = await scenario(null, jobClaims(W.tenant), async (tx) => {
      const changed = hex();
      const p = await owner(tx, () => mkPatient(tx));
      const a = await owner(tx, () => mkAppt(tx, p));
      expect(await issueAuto(tx, changed, W.tenant, a)).toBe("issued");
      await owner(tx, () => tx`update appointments set status = 'cancelled' where id = ${a}`);
      const statusChanged = (await resolve(tx, changed)).length;
      await owner(tx, () => tx`update appointments set status = 'completed' where id = ${a}`);
      const restored = (await resolve(tx, changed)).length;
      await owner(tx, () => tx`update patients set deleted_at = now() where id = ${p}`);
      const softDeleted = (await resolve(tx, changed)).length;
      await owner(tx, () => tx`update patients set deleted_at = null where id = ${p}`);
      // Another send of the same visit, answered: the first code is no longer eligible (O9 (a)).
      const second = hex();
      await owner(tx, () => tx`update appointment_survey_sends set sent_at = now() - interval '61 days' where patient_id = ${p}`);
      const reissued = await issueAuto(tx, second, W.tenant, a);
      await owner(tx, () => tx`update appointment_survey_sends set sent_at = now() - interval '1 day' where patient_id = ${p}`);
      const answeredSecond = await submit(tx, second, W.tenant);
      const answeredElsewhere = (await resolve(tx, changed)).length;
      return { statusChanged, restored, softDeleted, reissued, answeredSecond, answeredElsewhere };
    });
    expect(out).toEqual({ statusChanged: 0, restored: 1, softDeleted: 0, reissued: "issued", answeredSecond: true, answeredElsewhere: 0 });
  });

  it("GUEST: a link lives FOURTEEN days from its send, to the minute: 13 days 23 hours resolves and is answered, 14 days and a minute does neither", async () => {
    const out = await scenario(null, jobClaims(W.tenant), async (tx) => {
      const code = hex();
      const p = await owner(tx, () => mkPatient(tx));
      const a = await owner(tx, () => mkAppt(tx, p, { daysAgo: 20 }));
      expect(await issueAuto(tx, code, W.tenant, a)).toBe("issued");
      const at = async (age: string) => {
        await owner(tx, () => tx`update appointment_survey_sends set sent_at = now() - ${age}::interval where patient_id = ${p}`);
        return (await resolve(tx, code)).length;
      };
      const justOver = await at("14 days 1 minute");
      const overSubmit = await submit(tx, code, W.tenant);
      const overOptOut = await optOut(tx, code, W.tenant);
      const justUnder = await at("13 days 23 hours");
      const underSubmit = await submit(tx, code, W.tenant);
      return { justOver, overSubmit, overOptOut, justUnder, underSubmit };
    });
    expect(out).toEqual({ justOver: 0, overSubmit: false, overOptOut: false, justUnder: 1, underSubmit: true });
  });

  it("GUEST: the read ties the code, the appointment and the patient to the SEND's tenant: a row the owning role moved to another tenant resolves to nothing, each alone", async () => {
    // No door can write such a row: each copies the tenant from the appointment it read. These are planted by the owning
    // role, which RLS does not bind, to show that the read does not trust the rows to agree; the control restores each.
    const out = await scenario(null, jobClaims(W.tenant), async (tx) => {
      const code = hex();
      const p = await owner(tx, () => mkPatient(tx));
      const a = await owner(tx, () => mkAppt(tx, p));
      expect(await issueAuto(tx, code, W.tenant, a)).toBe("issued");
      const live = (await resolve(tx, code)).length;
      const moved = async (table: "appointment_survey_codes" | "appointments" | "patients", key: string, id: string) => {
        await owner(tx, () => tx.unsafe(`update public.${table} set tenant_id = $1 where ${key} = $2`, [W.other, id]));
        const seen = (await resolve(tx, code)).length;
        const answered = await submit(tx, code, W.tenant);
        await owner(tx, () => tx.unsafe(`update public.${table} set tenant_id = $1 where ${key} = $2`, [W.tenant, id]));
        return { seen, answered, restored: (await resolve(tx, code)).length };
      };
      const codeMoved = await moved("appointment_survey_codes", "code_hash", code);
      const appointmentMoved = await moved("appointments", "id", a);
      const patientMoved = await moved("patients", "id", p);
      return { live, codeMoved, appointmentMoved, patientMoved };
    });
    const refused = { seen: 0, answered: false, restored: 1 };
    expect(out).toEqual({ live: 1, codeMoved: refused, appointmentMoved: refused, patientMoved: refused });
  });

  it("GUEST: two presses of one code produce one answer: the second waits for the first, then gets false", async () => {
    const code = hex();
    const p = randomUUID();
    const a = randomUUID();
    await sql`insert into patients (id, tenant_id, full_name, email) values (${p}, ${W.tenant}, 'Utente corrida', ${`r-${p}@fixture.invalid`})`;
    await sql`insert into appointments (id, tenant_id, patient_id, practitioner_id, location_id, starts_at, ends_at, status)
              values (${a}, ${W.tenant}, ${p}, ${W.t1}, ${W.locA}, now() - interval '2 days 45 minutes', now() - interval '2 days', 'completed')`;
    expect(await committed(sql, jobClaims(W.tenant), (tx) => issueAuto(tx, code, W.tenant, a))).toBe("issued");
    const results = await race(
      (tx) => submit(tx, code, W.tenant, { nps: 10 }),
      (tx) => submit(tx, code, W.tenant, { nps: 0 }),
      guestClaims(W.tenant),
      guestClaims(W.tenant),
      "transactionid",
    );
    expect(results.sort()).toEqual([false, true]);
    const [n] = await sql<{ n: number }[]>`select count(*)::int as n from appointment_survey_responses where appointment_id = ${a}`;
    expect(n?.n).toBe(1);
  });

  /* ---------------------------------------------------------------------- */
  /* THE AUTOMATIC DOOR (S3)                                                */
  /* ---------------------------------------------------------------------- */
  it("AUTOMATIC: each refusal fires on its own fixture, and writes nothing", async () => {
    const out = await scenario(null, jobClaims(W.tenant), async (tx) => {
      const ok = await owner(tx, () => mkPatient(tx));
      const okA = await owner(tx, () => mkAppt(tx, ok));
      const scheduled = await owner(tx, () => mkAppt(tx, ok, { status: "scheduled", daysAgo: -3 }));
      const opted = await owner(tx, () => mkPatient(tx, { survey: false }));
      const optedA = await owner(tx, () => mkAppt(tx, opted));
      const deleted = await owner(tx, () => mkPatient(tx, { deleted: true }));
      const deletedA = await owner(tx, () => mkAppt(tx, deleted));
      const noPhone = await owner(tx, () => mkPatient(tx, { phone: null }));
      const noPhoneA = await owner(tx, () => mkAppt(tx, noPhone));
      const emailOff = await owner(tx, () => mkPatient(tx, { emailOn: false }));
      const emailOffA = await owner(tx, () => mkAppt(tx, emailOff));
      const r: Record<string, string> = {};
      r.notCompleted = await issueAuto(tx, hex(), W.tenant, scheduled);
      r.optedOut = await issueAuto(tx, hex(), W.tenant, optedA);
      r.softDeleted = await issueAuto(tx, hex(), W.tenant, deletedA);
      r.smsWithoutPhone = await issueAuto(tx, hex(), W.tenant, noPhoneA, "sms");
      r.emailSwitchOff = await issueAuto(tx, hex(), W.tenant, emailOffA, "email");
      r.unknownChannel = await issueAuto(tx, hex(), W.tenant, okA, "fax");
      r.unknownAppointment = await issueAuto(tx, hex(), W.tenant, randomUUID());
      r.appointmentOfAnotherTenant = await issueAuto(tx, hex(), W.tenant, W.aX);
      r.tenantNotTheSession = await issueAuto(tx, hex(), W.other, W.aX);
      await as(tx, staff("owner", W.owner));
      r.aStaffSession = await issueAuto(tx, hex(), W.tenant, okA);
      const written = await owner(tx, () => tx`select count(*)::int as n from appointment_survey_sends
                                                 where patient_id in (${ok}, ${opted}, ${deleted}, ${noPhone}, ${emailOff})`);
      await as(tx, jobClaims(W.tenant));
      r.control = await issueAuto(tx, hex(), W.tenant, okA);
      return { r, written: written[0]?.n };
    });
    expect(out.r).toEqual({
      notCompleted: "not_eligible",
      optedOut: "not_eligible",
      softDeleted: "not_eligible",
      smsWithoutPhone: "not_eligible",
      emailSwitchOff: "not_eligible",
      unknownChannel: "not_eligible",
      unknownAppointment: "not_eligible",
      appointmentOfAnotherTenant: "not_eligible",
      tenantNotTheSession: "not_allowed",
      aStaffSession: "not_allowed",
      control: "issued",
    });
    expect(out.written).toBe(0);
  });

  it("AUTOMATIC: any send inside 60 days refuses it, automatic or manual; at 61 days it is issued (S3)", async () => {
    const out = await scenario(null, jobClaims(W.tenant), async (tx) => {
      const p = await owner(tx, () => mkPatient(tx));
      const older = await owner(tx, () => mkAppt(tx, p, { daysAgo: 70 }));
      const newer = await owner(tx, () => mkAppt(tx, p, { daysAgo: 2 }));
      const q = await owner(tx, () => mkPatient(tx));
      const qNewer = await owner(tx, () => mkAppt(tx, q, { daysAgo: 1 }));
      const r: Record<string, string | { result: string }> = {};
      expect(await issueAuto(tx, hex(), W.tenant, older)).toBe("issued");
      await owner(tx, () => ageSends(tx, p, 59));
      r.after59daysAutomatic = await issueAuto(tx, hex(), W.tenant, newer);
      await owner(tx, () => ageSends(tx, p, 61));
      r.after61days = await issueAuto(tx, hex(), W.tenant, newer);
      // A MANUAL send 30 days ago counts too.
      await as(tx, staff("owner", W.owner));
      const manual = await issueManual(tx, hex(), W.tenant, q);
      await owner(tx, () => ageSends(tx, q, 30));
      await as(tx, jobClaims(W.tenant));
      r.manualThen = { result: manual.result };
      r.after30daysManual = await issueAuto(tx, hex(), W.tenant, qNewer);
      return r;
    });
    expect(out).toEqual({ after59daysAutomatic: "cooldown", after61days: "issued", manualThen: { result: "issued" }, after30daysManual: "cooldown" });
  });

  it("AUTOMATIC: a second automatic send for an ANSWERED appointment is not_eligible (O9 (a))", async () => {
    const out = await scenario(null, jobClaims(W.tenant), async (tx) => {
      const code = hex();
      const p = await owner(tx, () => mkPatient(tx));
      const a = await owner(tx, () => mkAppt(tx, p));
      expect(await issueAuto(tx, code, W.tenant, a)).toBe("issued");
      expect(await submit(tx, code, W.tenant)).toBe(true);
      await owner(tx, () => ageSends(tx, p, 90));
      return issueAuto(tx, hex(), W.tenant, a);
    });
    expect(out).toBe("not_eligible");
  });

  it("AUTOMATIC: two runs waking together for one patient produce exactly one send", async () => {
    const p = randomUUID();
    const a1 = randomUUID();
    const a2 = randomUUID();
    await sql`insert into patients (id, tenant_id, full_name, email) values (${p}, ${W.tenant}, 'Utente corrida', ${`r-${p}@fixture.invalid`})`;
    for (const a of [a1, a2]) {
      await sql`insert into appointments (id, tenant_id, patient_id, practitioner_id, location_id, starts_at, ends_at, status)
                values (${a}, ${W.tenant}, ${p}, ${W.t1}, ${W.locA}, now() - interval '2 days 45 minutes', now() - interval '2 days', 'completed')`;
    }
    const results = await race(
      (tx) => issueAuto(tx, hex(), W.tenant, a1),
      (tx) => issueAuto(tx, hex(), W.tenant, a2),
      jobClaims(W.tenant),
      jobClaims(W.tenant),
      "advisory",
    );
    expect(results.sort()).toEqual(["cooldown", "issued"]);
    const [n] = await sql<{ n: number }[]>`select count(*)::int as n from appointment_survey_sends where patient_id = ${p}`;
    expect(n?.n).toBe(1);
  });

  it("AUTOMATIC AND MANUAL racing for one patient produce exactly one send", async () => {
    const p = randomUUID();
    const a = randomUUID();
    await sql`insert into patients (id, tenant_id, full_name, email) values (${p}, ${W.tenant}, 'Utente corrida', ${`r-${p}@fixture.invalid`})`;
    await sql`insert into appointments (id, tenant_id, patient_id, practitioner_id, location_id, starts_at, ends_at, status)
              values (${a}, ${W.tenant}, ${p}, ${W.t1}, ${W.locA}, now() - interval '2 days 45 minutes', now() - interval '2 days', 'completed')`;
    const results = await race(
      (tx) => issueAuto(tx, hex(), W.tenant, a),
      async (tx) => (await issueManual(tx, hex(), W.tenant, p)).result,
      jobClaims(W.tenant),
      staff("owner", W.owner),
      "advisory",
    );
    expect(results).toEqual(["issued", "open_link"]);
    const [n] = await sql<{ n: number }[]>`select count(*)::int as n from appointment_survey_sends where patient_id = ${p}`;
    expect(n?.n).toBe(1);
  });

  /* ---------------------------------------------------------------------- */
  /* THE MANUAL DOOR (S4, S5) AND THE BUTTON'S STATE                        */
  /* ---------------------------------------------------------------------- */
  it("MANUAL: each of the FIVE reasons (R32 adds answered) fires on its own fixture, the state agrees on every one, and neither writes on a refusal", async () => {
    const out = await scenario(null, staff("owner", W.owner), async (tx) => {
      const fx: Record<string, string> = {};
      fx.noAppointment = await owner(tx, () => mkPatient(tx));
      await owner(tx, () => mkAppt(tx, fx.noAppointment as string, { status: "scheduled", daysAgo: -2 }));
      fx.optedOut = await owner(tx, () => mkPatient(tx, { survey: false }));
      await owner(tx, () => mkAppt(tx, fx.optedOut as string));
      fx.noChannel = await owner(tx, () => mkPatient(tx, { email: null, phone: null }));
      await owner(tx, () => mkAppt(tx, fx.noChannel as string));
      fx.openLink = await owner(tx, () => mkPatient(tx));
      const openA = await owner(tx, () => mkAppt(tx, fx.openLink as string));
      fx.answered = await owner(tx, () => mkPatient(tx));
      const answeredA = await owner(tx, () => mkAppt(tx, fx.answered as string));
      fx.deleted = await owner(tx, () => mkPatient(tx, { deleted: true }));
      await owner(tx, () => mkAppt(tx, fx.deleted as string));
      fx.ready = await owner(tx, () => mkPatient(tx));
      await owner(tx, () => mkAppt(tx, fx.ready as string));
      // The open link: an automatic send 13 days ago, unanswered. The answered: answered 20 days ago.
      await as(tx, jobClaims(W.tenant));
      expect(await issueAuto(tx, hex(), W.tenant, openA)).toBe("issued");
      const answeredCode = hex();
      expect(await issueAuto(tx, answeredCode, W.tenant, answeredA)).toBe("issued");
      expect(await submit(tx, answeredCode, W.tenant)).toBe(true);
      await owner(tx, async () => {
        await ageSends(tx, fx.openLink as string, 13);
        await ageSends(tx, fx.answered as string, 20);
      });
      await as(tx, staff("owner", W.owner));
      const sendsBefore = await owner(tx, () => tx`select count(*)::int as n from appointment_survey_sends where tenant_id = ${W.tenant}`);
      const r: Record<string, [string, string]> = {};
      for (const [name, patient] of Object.entries(fx)) {
        const st = await sendState(tx, W.tenant, patient);
        const state = st.state === "disabled" ? `disabled:${st.reason}` : st.state;
        const m = name === "ready" ? { result: "skipped" } : await issueManual(tx, hex(), W.tenant, patient);
        r[name] = [state, m.result];
      }
      const sendsAfter = await owner(tx, () => tx`select count(*)::int as n from appointment_survey_sends where tenant_id = ${W.tenant}`);
      // 15 days: the open link has expired and no longer blocks.
      await owner(tx, () => ageSends(tx, fx.openLink as string, 15));
      r.openLinkAt15Days = [(await sendState(tx, W.tenant, fx.openLink as string)).state, (await issueManual(tx, hex(), W.tenant, fx.openLink as string)).result];
      return { r, sendsBefore: sendsBefore[0]?.n, sendsAfter: sendsAfter[0]?.n };
    });
    expect(out.r).toEqual({
      noAppointment: ["disabled:no_appointment", "no_appointment"],
      optedOut: ["disabled:opted_out", "opted_out"],
      noChannel: ["disabled:no_channel", "no_channel"],
      openLink: ["disabled:open_link", "open_link"],
      answered: ["disabled:answered", "answered"],
      deleted: ["not_allowed", "not_allowed"],
      ready: ["ready", "skipped"],
      openLinkAt15Days: ["ready", "issued"],
    });
    expect(out.sendsAfter).toBe(out.sendsBefore);
  });

  it("MANUAL, R32: the fifth reason reads the LAST concluded visit only, and names it", async () => {
    const out = await scenario(null, staff("owner", W.owner), async (tx) => {
      // older: the older visit answered, a newer one concluded and unanswered. newest: the only visit, answered.
      const older = await owner(tx, () => mkPatient(tx));
      const olderA = await owner(tx, () => mkAppt(tx, older, { daysAgo: 30 }));
      const olderNewer = await owner(tx, () => mkAppt(tx, older, { daysAgo: 3 }));
      const newest = await owner(tx, () => mkPatient(tx));
      const newestA = await owner(tx, () => mkAppt(tx, newest, { daysAgo: 3 }));
      // CONTROL: the same visit, never answered.
      const control = await owner(tx, () => mkPatient(tx));
      await owner(tx, () => mkAppt(tx, control, { daysAgo: 3 }));
      await as(tx, jobClaims(W.tenant));
      for (const a of [olderA, newestA]) {
        const code = hex();
        expect(await issueAuto(tx, code, W.tenant, a)).toBe("issued");
        expect(await submit(tx, code, W.tenant)).toBe(true);
      }
      await as(tx, staff("owner", W.owner));
      const st = async (p: string) => { const s = await sendState(tx, W.tenant, p); return [s.state, s.reason, s.appointment_id]; };
      const states = { older: await st(older), newest: await st(newest), control: await st(control) };
      const door = await issueManual(tx, hex(), W.tenant, newest);
      const sends = await owner(tx, () => tx`select count(*)::int as n from appointment_survey_sends where patient_id = ${newest}`);
      return { states, door, sends: sends[0]?.n, olderNewer, newestA };
    });
    expect(out.states.older).toEqual(["ready", null, out.olderNewer]);
    expect(out.states.newest).toEqual(["disabled", "answered", out.newestA]);
    expect(out.states.control[0]).toBe("ready");
    // The door says the same, names the visit, and writes no second send.
    expect(out.door).toEqual({ result: "answered", appointment_id: out.newestA });
    expect(out.sends).toBe(1);
  });

  it("MANUAL: no_channel is per channel: SMS refused without a phone while email is ready", async () => {
    const out = await scenario(null, staff("owner", W.owner), async (tx) => {
      const p = await owner(tx, () => mkPatient(tx, { phone: null }));
      await owner(tx, () => mkAppt(tx, p));
      const sms = await issueManual(tx, hex(), W.tenant, p, "sms");
      const fax = await issueManual(tx, hex(), W.tenant, p, "fax");
      const email = await issueManual(tx, hex(), W.tenant, p, "email");
      return [sms.result, fax.result, email.result];
    });
    expect(out).toEqual(["no_channel", "no_channel", "issued"]);
  });

  it("MANUAL: who may press it (S4), each refusal on its own principal; the state says the same", async () => {
    const out = await scenario(null, staff("owner", W.owner), async (tx) => {
      const p = await owner(tx, () => mkPatient(tx));
      await owner(tx, () => mkAppt(tx, p, { by: W.t1, loc: W.locA }));
      const who: [string, string | null][] = [
        ["owner", staff("owner", W.owner)],
        ["admin of the visit's clinic", staff("admin", W.adminA)],
        ["admin of the other clinic", staff("admin", W.adminB)],
        ["reception of the visit's clinic", staff("reception", W.recA)],
        ["reception of the other clinic", staff("reception", W.recB)],
        ["admin with no clinic", staff("admin", W.admin0)],
        ["therapist who treats the patient", staff("therapist", W.t1)],
        ["therapist who does not", staff("therapist", W.t2)],
        ["the job (no user)", jobClaims(W.tenant)],
        ["an owner token with no user", JSON.stringify({ tenant_id: W.tenant, user_role: "owner" })],
        ["a role the door does not name, with a user", claimsFor(W.tenant, "superadmin" as AppRole, W.owner)],
        ["owner of another tenant", staff("owner", W.ownerX, W.other)],
        ["no claims at all", null],
      ];
      const r: Record<string, string> = {};
      for (const [name, claims] of who) {
        await as(tx, claims);
        r[name] = (await sendState(tx, W.tenant, p)).state;
      }
      return r;
    });
    expect(out).toEqual({
      owner: "ready",
      "admin of the visit's clinic": "ready",
      "admin of the other clinic": "not_allowed",
      "reception of the visit's clinic": "ready",
      "reception of the other clinic": "not_allowed",
      "admin with no clinic": "not_allowed",
      "therapist who treats the patient": "ready",
      "therapist who does not": "not_allowed",
      "the job (no user)": "not_allowed",
      "an owner token with no user": "not_allowed",
      "a role the door does not name, with a user": "not_allowed",
      "owner of another tenant": "not_allowed",
      "no claims at all": "not_allowed",
    });
  });

  it("MANUAL: it attaches to the MOST RECENT concluded visit, records sent_by from the session, and writes one audit row", async () => {
    const out = await scenario(null, staff("reception", W.recA), async (tx) => {
      const p = await owner(tx, () => mkPatient(tx));
      await owner(tx, () => mkAppt(tx, p, { daysAgo: 30 }));
      const latest = await owner(tx, () => mkAppt(tx, p, { daysAgo: 3 }));
      await owner(tx, () => mkAppt(tx, p, { daysAgo: 1, status: "cancelled" }));
      await owner(tx, () => mkAppt(tx, p, { daysAgo: -4, status: "scheduled" }));
      const m = await issueManual(tx, hex(), W.tenant, p, "email");
      return owner(tx, async () => ({
        m,
        latest,
        send: await tx`select appointment_id::text, origin, sent_by::text, channel, location_id::text from appointment_survey_sends where patient_id = ${p}`,
        audit: await tx`select actor_user_id::text, action, entity_type, entity_id::text, metadata from audit_log
                         where tenant_id = ${W.tenant} and entity_id = ${latest} and action like 'survey.%'`,
      }));
    });
    expect(out.m).toEqual({ result: "issued", appointment_id: out.latest });
    expect(out.send).toEqual([{ appointment_id: out.latest, origin: "manual", sent_by: W.recA, channel: "email", location_id: W.locA }]);
    expect(out.audit).toEqual([
      { actor_user_id: W.recA, action: "survey.sent", entity_type: "appointment", entity_id: out.latest, metadata: { channel: "email", origin: "manual" } },
    ]);
  });

  it("MANUAL: not blocked by the 60-day rule: 5 days after an answered automatic send, a newer visit is issued", async () => {
    const out = await scenario(null, jobClaims(W.tenant), async (tx) => {
      const code = hex();
      const p = await owner(tx, () => mkPatient(tx));
      const older = await owner(tx, () => mkAppt(tx, p, { daysAgo: 7 }));
      await owner(tx, () => mkAppt(tx, p, { daysAgo: 1 }));
      expect(await issueAuto(tx, code, W.tenant, older)).toBe("issued");
      expect(await submit(tx, code, W.tenant)).toBe(true);
      await owner(tx, () => ageSends(tx, p, 5));
      const auto = await issueAuto(tx, hex(), W.tenant, older);
      await as(tx, staff("owner", W.owner));
      const manual = await issueManual(tx, hex(), W.tenant, p);
      return { auto, manual: manual.result };
    });
    expect(out).toEqual({ auto: "not_eligible", manual: "issued" });
  });

  /* ---------------------------------------------------------------------- */
  /* THE OPT-OUT (S8)                                                       */
  /* ---------------------------------------------------------------------- */
  it("OPT-OUT: flips only that patient, consumes the send, leaves both reminder switches, writes one audit row; then both doors refuse", async () => {
    const out = await scenario(null, jobClaims(W.tenant), async (tx) => {
      const code = hex();
      const p = await owner(tx, () => mkPatient(tx));
      const bystander = await owner(tx, () => mkPatient(tx));
      const a = await owner(tx, () => mkAppt(tx, p, { daysAgo: 70 }));
      const later = await owner(tx, () => mkAppt(tx, p, { daysAgo: 1 }));
      expect(await issueAuto(tx, code, W.tenant, a)).toBe("issued");
      await as(tx, guestClaims(W.tenant));
      const ok = await optOut(tx, code, W.tenant);
      await owner(tx, () => ageSends(tx, p, 61));
      await as(tx, jobClaims(W.tenant));
      const auto = await issueAuto(tx, hex(), W.tenant, later);
      await as(tx, staff("owner", W.owner));
      const manual = await issueManual(tx, hex(), W.tenant, p);
      return owner(tx, async () => ({
        ok,
        auto,
        manual: manual.result,
        patients: await tx`select id::text, survey_enabled, reminder_email_enabled, reminder_sms_enabled from patients
                            where id in (${p}, ${bystander}) order by (id = ${p}) desc`,
        send: await tx`select consumed_at is not null as consumed, outcome from appointment_survey_sends where appointment_id = ${a}`,
        audit: await tx`select action, metadata from audit_log where tenant_id = ${W.tenant} and entity_id = ${a} and action like 'survey.%'`,
        switchRows: await tx`select actor_user_id, entity_type, entity_id::text, metadata from audit_log
                              where tenant_id = ${W.tenant} and action = ${SWITCH_ACTION} and entity_id in (${p}, ${bystander})`,
        p,
        bystander,
      }));
    });
    expect(out.ok).toBe(true);
    expect(out.patients).toEqual([
      { id: out.p, survey_enabled: false, reminder_email_enabled: true, reminder_sms_enabled: true },
      { id: out.bystander, survey_enabled: true, reminder_email_enabled: true, reminder_sms_enabled: true },
    ]);
    expect(out.send).toEqual([{ consumed: true, outcome: "opted_out" }]);
    expect(out.audit).toEqual([{ action: "survey.opt_out", metadata: { channel: "email" } }]);
    // R34: the switch moved, so the switch has its own row, exactly one, for that patient: no staff user and no patient session behind it.
    expect(out.switchRows).toEqual([
      { actor_user_id: null, entity_type: "patient", entity_id: out.p, metadata: { survey_enabled: false, actor_patient_id: null } },
    ]);
    expect({ auto: out.auto, manual: out.manual }).toEqual({ auto: "not_eligible", manual: "opted_out" });
  });

  /* ---------------------------------------------------------------------- */
  /* THE SURVEY SWITCH (R34)                                                */
  /* ---------------------------------------------------------------------- */
  /* "Settable by the patient and by the same staff roles that edit         */
  /* reminder preferences, same clinic scope, with an audit row per change, */
  /* in RLS." Every principal below tries THREE columns of the same row:    */
  /* survey_enabled, reminder_sms_enabled and reminder_email_enabled. The   */
  /* three answers must agree, and must be the answer written here. So the  */
  /* list in this file and the policies of 0019 and 0047 check each other.  */
  type SwitchRow = { actor_user_id: string | null; entity_type: string; entity_id: string; metadata: unknown };
  type SwitchTry = { survey: number; sms: number; email: number; rows: SwitchRow[]; value: boolean | null };

  /** The switch's audit rows for one patient, read as the owner. */
  const switchRows = (tx: TransactionSql, patient: string) =>
    tx<SwitchRow[]>`select actor_user_id::text, entity_type, entity_id::text, metadata from audit_log
                     where tenant_id = ${W.tenant} and action = ${SWITCH_ACTION} and entity_id = ${patient}`;

  /** As one principal: set the three switches off on one patient, then read what the trigger wrote. Always rolled back. */
  async function trySwitches(
    role: "authenticated" | "patient",
    claims: string | null,
    patient: () => string,
    setup: ((tx: TransactionSql) => Promise<void>) | null = null,
  ): Promise<SwitchTry> {
    return scenario(setup, claims, async (tx) => {
      const survey = (await tx`update patients set survey_enabled = false where id = ${patient()}`).count;
      const sms = (await tx`update patients set reminder_sms_enabled = false where id = ${patient()}`).count;
      const email = (await tx`update patients set reminder_email_enabled = false where id = ${patient()}`).count;
      await tx.unsafe("reset role");
      const rows = await switchRows(tx, patient());
      const [v] = await tx<{ survey_enabled: boolean }[]>`select survey_enabled from patients where id = ${patient()}`;
      return { survey, sms, email, rows: [...rows], value: v?.survey_enabled ?? null };
    }, role);
  }

  /** What one allowed change must leave: one row, the patient, the new value, and who. */
  const oneRow = (patient: string, user: string | null, actingPatient: string | null): SwitchRow[] => [
    { actor_user_id: user, entity_type: "patient", entity_id: patient, metadata: { survey_enabled: false, actor_patient_id: actingPatient } },
  ];

  it("THE SWITCH, PREMISE: P1's three switches are on, and no switch row exists for P1 yet", async () => {
    const [p] = await sql<{ s: boolean; sms: boolean; email: boolean }[]>`
      select survey_enabled as s, reminder_sms_enabled as sms, reminder_email_enabled as email from patients where id = ${W.p1}`;
    expect(p).toEqual({ s: true, sms: true, email: true });
    const [n] = await sql<{ n: number }[]>`select count(*)::int as n from audit_log where action = ${SWITCH_ACTION} and entity_id = ${W.p1}`;
    expect(n?.n).toBe(0);
  });

  // P1: one visit, at clinic A, attended by t1 with t4 as the second practitioner. No creator, no primary clinic.
  const MAY_SET: [string, "authenticated" | "patient", () => string, () => [string | null, string | null]][] = [
    ["the patient, for themself (the portal)", "patient", () => patientClaims(W.tenant, W.p1), () => [null, W.p1]],
    ["the owner", "authenticated", () => staff("owner", W.owner), () => [W.owner, null]],
    ["admin of clinic A, where P1 was seen", "authenticated", () => staff("admin", W.adminA), () => [W.adminA, null]],
    ["reception of clinic A, where P1 was seen", "authenticated", () => staff("reception", W.recA), () => [W.recA, null]],
    ["admin with no clinic assignment (0047: no assignment means every clinic)", "authenticated", () => staff("admin", W.admin0), () => [W.admin0, null]],
    ["reception with no clinic assignment (the same branch)", "authenticated", () => staff("reception", W.rec0), () => [W.rec0, null]],
    ["therapist t1, who treats P1", "authenticated", () => staff("therapist", W.t1), () => [W.t1, null]],
    ["therapist t4, the second practitioner of P1's visit", "authenticated", () => staff("therapist", W.t4), () => [W.t4, null]],
    // A server-side session with a tenant and no user (withReminderTenantContext): the SMS STOP reply sets
    // reminder_sms_enabled in exactly this context today, and 0047 admits it as an admin with no assignment.
    ["a server-side job's context (tenant, no user), as the SMS STOP reply's", "authenticated", () => jobClaims(W.tenant), () => [null, null]],
  ];
  for (const [name, role, claims, actor] of MAY_SET) {
    it(`THE SWITCH, MAY SET: ${name}: all three switches, and exactly one audit row`, async () => {
      const r = await trySwitches(role, claims(), () => W.p1);
      expect({ survey: r.survey, sms: r.sms, email: r.email }).toEqual({ survey: 1, sms: 1, email: 1 });
      expect(r.value).toBe(false);
      const [user, actingPatient] = actor();
      expect(r.rows).toEqual(oneRow(W.p1, user, actingPatient));
    });
  }

  const MAY_NOT: [string, "authenticated" | "patient", () => string | null][] = [
    ["admin of clinic B: another clinic's staff", "authenticated", () => staff("admin", W.adminB)],
    ["reception of clinic B: another clinic's staff", "authenticated", () => staff("reception", W.recB)],
    ["therapist t2: same clinic A, does not treat P1", "authenticated", () => staff("therapist", W.t2)],
    ["therapist t3: clinic B, treats P3", "authenticated", () => staff("therapist", W.t3)],
    ["therapist t5: clinic B", "authenticated", () => staff("therapist", W.t5)],
    ["the owner of ANOTHER TENANT", "authenticated", () => staff("owner", W.ownerX, W.other)],
    ["a therapist of ANOTHER TENANT", "authenticated", () => staff("therapist", W.tX, W.other)],
    ["a staff session of another tenant naming this tenant's user", "authenticated", () => staff("owner", W.owner, W.other)],
    ["ANOTHER PATIENT of the same tenant (P2's own token)", "patient", () => patientClaims(W.tenant, W.p2)],
    ["a patient of ANOTHER TENANT", "patient", () => patientClaims(W.other, W.pX)],
    ["a patient token of another tenant naming P1", "patient", () => patientClaims(W.other, W.p1)],
    ["a session with a role the policy does not name", "authenticated", () => claimsFor(W.tenant, "superadmin" as AppRole, W.owner)],
    ["a session with no claims at all", "authenticated", () => null],
  ];
  for (const [name, role, claims] of MAY_NOT) {
    it(`THE SWITCH, MAY NOT: ${name}: none of the three switches, and no audit row`, async () => {
      const r = await trySwitches(role, claims(), () => W.p1);
      expect({ survey: r.survey, sms: r.sms, email: r.email }).toEqual({ survey: 0, sms: 0, email: 0 });
      expect(r.value).toBe(true);
      expect(r.rows).toEqual([]);
    });
  }

  it("THE SWITCH, MAY NOT: anon is refused at the table for all three switches (42501, by the grant)", async () => {
    for (const col of ["survey_enabled", "reminder_sms_enabled", "reminder_email_enabled"]) {
      expect(byGrant(await refusal("anon", null, `update public.patients set ${col} = false where id = '${W.p1}'`)), col).toBe(true);
    }
  });

  it("THE SWITCH, CLINIC SCOPE: the two other arms of 0047, the row's creator and the primary clinic, read the same for all three switches", async () => {
    // created: made by reception of B, seen at A only. primaryB: registered at clinic B, never seen.
    let created = "";
    let primaryB = "";
    const setup = async (tx: TransactionSql): Promise<void> => {
      created = await mkPatient(tx, { createdBy: W.recB });
      await mkAppt(tx, created, { by: W.t1, loc: W.locA });
      primaryB = await mkPatient(tx, { primaryLocation: W.locB });
    };
    const cases: [string, () => string, () => string, number][] = [
      ["reception of B on the patient it created", () => staff("reception", W.recB), () => created, 1],
      ["admin of B on a patient reception of B created, seen at A only", () => staff("admin", W.adminB), () => created, 0],
      ["admin of A on that patient (seen at A)", () => staff("admin", W.adminA), () => created, 1],
      ["admin of B on a patient whose primary clinic is B", () => staff("admin", W.adminB), () => primaryB, 1],
      ["reception of B on that patient", () => staff("reception", W.recB), () => primaryB, 1],
      ["admin of A on that patient", () => staff("admin", W.adminA), () => primaryB, 0],
      ["reception of A on that patient", () => staff("reception", W.recA), () => primaryB, 0],
      ["therapist t5 of clinic B on that patient (never treated them)", () => staff("therapist", W.t5), () => primaryB, 0],
    ];
    const seen: Record<string, [number, number, number, number]> = {};
    const want: Record<string, [number, number, number, number]> = {};
    for (const [name, claims, patient, n] of cases) {
      const r = await trySwitches("authenticated", claims(), patient, setup);
      seen[name] = [r.survey, r.sms, r.email, r.rows.length];
      want[name] = [n, n, n, n];
    }
    expect(seen).toEqual(want);
  });

  it("THE SWITCH, ONE ROW PER CHANGE: none for the same value or another column, one for each real change, one per patient in one statement", async () => {
    const out = await scenario(null, staff("owner", W.owner), async (tx) => {
      const same = (await tx`update patients set survey_enabled = true where id = ${W.p1}`).count;
      const other = (await tx`update patients set city = 'Lisboa' where id = ${W.p1}`).count;
      const reminder = (await tx`update patients set reminder_sms_enabled = false where id = ${W.p1}`).count;
      const afterNone = await owner(tx, () => switchRows(tx, W.p1));
      await tx`update patients set survey_enabled = false where id = ${W.p1}`;
      await tx`update patients set survey_enabled = true where id = ${W.p1}`;
      await tx`update patients set survey_enabled = true, city = 'Porto' where id = ${W.p1}`;
      const afterTwo = await owner(tx, () => switchRows(tx, W.p1));
      const both = (await tx`update patients set survey_enabled = false where id in (${W.p2}, ${W.p3})`).count;
      const perPatient = await owner(tx, () => tx<{ id: string; n: number }[]>`
        select entity_id::text as id, count(*)::int as n from audit_log
         where tenant_id = ${W.tenant} and action = ${SWITCH_ACTION} and entity_id in (${W.p2}, ${W.p3}) group by 1 order by 1`);
      const all = await owner(tx, () => tx<{ n: number }[]>`select count(*)::int as n from audit_log where tenant_id = ${W.tenant} and action = ${SWITCH_ACTION}`);
      return { same, other, reminder, afterNone: afterNone.length, afterTwo: [...afterTwo], both, perPatient: [...perPatient], all: all[0]?.n };
    });
    expect({ same: out.same, other: out.other, reminder: out.reminder }).toEqual({ same: 1, other: 1, reminder: 1 });
    expect(out.afterNone).toBe(0);
    // Two real changes, two rows: one says off, one says on, both by the owner. The third UPDATE changed nothing of the switch.
    const values = out.afterTwo.map((r) => (r.metadata as { survey_enabled: boolean }).survey_enabled).sort();
    expect(values).toEqual([false, true]);
    expect(out.afterTwo.every((r) => r.actor_user_id === W.owner && r.entity_id === W.p1)).toBe(true);
    expect(out.both).toBe(2);
    expect(out.perPatient).toEqual([{ id: W.p2, n: 1 }, { id: W.p3, n: 1 }].sort((a, b) => a.id.localeCompare(b.id)));
    expect(out.all).toBe(4);
  });

  it("THE SWITCH, THE ROW HOLDS IDS AND THE NEW VALUE ONLY: no name, no contact, no free text, and the keys are exactly two", async () => {
    const rows = await scenario(null, staff("reception", W.recA), async (tx) => {
      await tx`update patients set survey_enabled = false where id = ${W.p1}`;
      return owner(tx, () => tx<{ row: Record<string, unknown> }[]>`
        select to_jsonb(a) - 'id' - 'created_at' as row from audit_log a
         where a.tenant_id = ${W.tenant} and a.action = ${SWITCH_ACTION} and a.entity_id = ${W.p1}`);
    });
    expect(rows.map((r) => r.row)).toEqual([
      {
        tenant_id: W.tenant, actor_user_id: W.recA, action: SWITCH_ACTION, entity_type: "patient", entity_id: W.p1,
        metadata: { survey_enabled: false, actor_patient_id: null }, ip: null,
      },
    ]);
  });

  it("THE SWITCH, ANY PATH THAT CHANGES IT: a change made by another trigger, in an UPDATE that never names the column, still leaves its row", async () => {
    // Why the trigger is AFTER UPDATE of any column with a WHEN, and not `UPDATE OF survey_enabled`: the
    // column-specific form fires only when the column is in the statement's SET list.
    const out = await scenario(
      async (tx) => {
        await tx.unsafe(`create function public.zz_sat01_flip() returns trigger language plpgsql as $x$
                         begin if new.city = 'zz-flip' then new.survey_enabled := false; end if; return new; end $x$`);
        await tx.unsafe("create trigger zz_sat01_flip before update on public.patients for each row execute function public.zz_sat01_flip()");
      },
      staff("owner", W.owner),
      async (tx) => {
        const n = (await tx`update patients set city = 'zz-flip' where id = ${W.p1}`).count;
        const control = (await tx`update patients set city = 'zz-other' where id = ${W.p2}`).count;
        return owner(tx, async () => ({
          n, control, p1: [...(await switchRows(tx, W.p1))], p2: (await switchRows(tx, W.p2)).length,
          value: (await tx<{ s: boolean }[]>`select survey_enabled as s from patients where id = ${W.p1}`)[0]?.s,
        }));
      },
    );
    expect({ n: out.n, control: out.control, value: out.value, p2: out.p2 }).toEqual({ n: 1, control: 1, value: false, p2: 0 });
    expect(out.p1).toEqual(oneRow(W.p1, W.owner, null));
  });

  it("THE SWITCH, THE ACTOR IS A STAFF MEMBER OF THE PATIENT'S TENANT OR NOBODY: a session naming a user of another tenant leaves no actor", async () => {
    // A session whose tenant and role claims are this tenant's owner and whose user is a member of ANOTHER
    // tenant. 0047 admits the owner role, so the change is made; the row must not name that user.
    const r = await trySwitches("authenticated", staff("owner", W.ownerX, W.tenant), () => W.p1);
    expect({ survey: r.survey, sms: r.sms, email: r.email }).toEqual({ survey: 1, sms: 1, email: 1 });
    expect(r.rows).toEqual(oneRow(W.p1, null, null));
    // CONTROL: the same claims with this tenant's own owner name them.
    expect((await trySwitches("authenticated", staff("owner", W.owner, W.tenant), () => W.p1)).rows).toEqual(oneRow(W.p1, W.owner, null));
  });

  it("THE SWITCH, THE ROW IS FILED UNDER THE PATIENT'S TENANT, whatever the session says: a data op with no claims, and one with another tenant's", async () => {
    // The owning role bypasses RLS: a data op or a migration that sets the switch. The row's tenant is the
    // PATIENT'S, read from the row, never the session's claim (absent in the first arm, another tenant's in the second).
    const run = async (claims: string | null) => {
      try {
        await sql.begin(async (tx) => {
          await tx`select set_config('request.jwt.claims', ${claims ?? ""}, true)`;
          const n = (await tx`update patients set survey_enabled = false where id = ${W.p1}`).count;
          const rows = await tx<{ tenant_id: string; actor_user_id: string | null; metadata: unknown }[]>`
            select tenant_id::text, actor_user_id::text, metadata from audit_log where action = ${SWITCH_ACTION} and entity_id = ${W.p1}`;
          throw new Rollback({ n, rows: [...rows] });
        });
        throw new Error("unreachable: the transaction committed");
      } catch (err) {
        if (err instanceof Rollback) return err.value as { n: number; rows: { tenant_id: string; actor_user_id: string | null; metadata: unknown }[] };
        throw err;
      }
    };
    const want = { n: 1, rows: [{ tenant_id: W.tenant, actor_user_id: null, metadata: { survey_enabled: false, actor_patient_id: null } }] };
    expect(await run(null)).toEqual(want);
    expect(await run(JSON.stringify({ tenant_id: W.other, user_role: "owner" }))).toEqual(want);
  });

  it("THE SWITCH, TOGETHER OR NOT AT ALL: when the audit row cannot be written, the change is refused and the switch stays as it was", async () => {
    const out = await scenario(
      // The audit row made impossible, as the owner, inside this rolled-back transaction only.
      (tx) => tx.unsafe(`alter table public.audit_log add constraint zz_sat01_no_switch_row check (action <> '${SWITCH_ACTION}') not valid`).then(() => undefined),
      staff("owner", W.owner),
      async (tx) => {
        let code: string | null = null;
        try {
          await tx.savepoint((sp) => sp`update patients set survey_enabled = false where id = ${W.p1}`);
        } catch (err) {
          code = (err as { code?: string }).code ?? "unknown";
        }
        // CONTROL: a reminder switch, which writes no audit row, still changes under the same constraint.
        const sms = (await tx`update patients set reminder_sms_enabled = false where id = ${W.p1}`).count;
        const [v] = await tx<{ s: boolean; sms: boolean }[]>`select survey_enabled as s, reminder_sms_enabled as sms from patients where id = ${W.p1}`;
        return { code, sms, v };
      },
    );
    expect(out.code).toBe("23514");
    expect(out.sms).toBe(1);
    expect(out.v).toEqual({ s: true, sms: false });
  });

  it("THE SWITCH, IT BITES: without the trigger a change leaves no row; without the column grant the patient is refused the survey switch alone", async () => {
    const noTrigger = await trySwitches("authenticated", staff("owner", W.owner), () => W.p1, (tx) =>
      tx.unsafe(`drop trigger ${SWITCH_TRIGGER} on public.patients`).then(() => undefined));
    expect({ survey: noTrigger.survey, rows: noTrigger.rows.length, value: noTrigger.value }).toEqual({ survey: 1, rows: 0, value: false });
    // The grant is what admits the patient: with it revoked (rolled back), the survey switch is refused by the
    // GRANT and a reminder switch still passes, so the difference test above can go red.
    const out = await scenario(
      (tx) => tx.unsafe("revoke update (survey_enabled) on public.patients from patient").then(() => undefined),
      patientClaims(W.tenant, W.p1),
      async (tx) => {
        let message: string | null = null;
        try {
          await tx.savepoint((sp) => sp`update patients set survey_enabled = false where id = ${W.p1}`);
        } catch (err) {
          message = (err as { code?: string; message?: string }).code === "42501" ? ((err as { message?: string }).message ?? "") : "another error";
        }
        const sms = (await tx`update patients set reminder_sms_enabled = false where id = ${W.p1}`).count;
        return { message, sms };
      },
      "patient",
    );
    expect(byGrant(out.message)).toBe(true);
    expect(out.sms).toBe(1);
  });

  it("THE SWITCH: the patient sets no other column through it, and no application role holds EXECUTE on the trigger function", async () => {
    expect(byGrant(await refusal("patient", patientClaims(W.tenant, W.p1), `update public.patients set full_name = 'x' where id = '${W.p1}'`))).toBe(true);
    // ASSERTED BY PRIVILEGE, NEVER BY A CALL. On the local Supabase image a call to a function the role holds
    // no EXECUTE on crashes the backend instead of being refused (measured again while this file was written:
    // `authenticated` calling survey_manual_verdict took the lane's database into recovery), so no arm in this
    // file calls a function to prove a refusal. CONTROL: the owner of the function holds EXECUTE.
    const rows = await sql<{ role: string; can: boolean }[]>`
      select r.rolname as role, has_function_privilege(r.oid, 'public.patients_survey_switch_audit()', 'EXECUTE') as can
        from pg_roles r where r.rolname in ('authenticated', 'anon', 'patient', 'service_role', 'postgres') order by 1`;
    expect(rows.map((r) => `${r.role}:${r.can}`)).toEqual(["anon:false", "authenticated:false", "patient:false", "postgres:true", "service_role:false"]);
  });

  /* ---------------------------------------------------------------------- */
  /* THE SURVEY PAGE'S THREE DOORS ANSWER ONLY THE SERVER'S OWN SESSION     */
  /* ---------------------------------------------------------------------- */
  /* The review's finding: a staff member called the manual door with a hash */
  /* of their own choosing, then the answer door with the same hash, and an */
  /* answer with consent sat on their own visit as the patient's. The read, */
  /* the answer and the opt-out now refuse every session that carries a     */
  /* user or a patient claim. The session the public page uses is the one   */
  /* the confirm page uses today: withReminderTenantContext, a tenant, the  */
  /* job's role, NO user (guestClaims here).                                */
  const redeem = async (tx: TransactionSql, code: string, tenant: string) => ({
    resolve: (await resolve(tx, code)).length,
    submit: await submit(tx, code, tenant, { nps: 10, rating: 5, comment: "Excelente", consent: true }),
    optOut: await optOut(tx, code, tenant),
  });
  const REFUSED = { resolve: 0, submit: false, optOut: false };

  it("THE FORGERY, as the review ran it: a therapist issues a manual send with a hash of their own, and their own session cannot redeem it", async () => {
    const out = await scenario(null, staff("therapist", W.t1), async (tx) => {
      const chosen = "ab".repeat(32);
      const p = await owner(tx, () => mkPatient(tx));
      const a = await owner(tx, () => mkAppt(tx, p, { by: W.t1, loc: W.locA }));
      const issued = await issueManual(tx, chosen, W.tenant, p);
      const asTherapist = await redeem(tx, chosen, W.tenant);
      const after = await owner(tx, async () => ({
        answers: (await tx`select 1 from appointment_survey_responses where appointment_id = ${a}`).length,
        send: await tx`select consumed_at is null as open, outcome, sent_by::text from appointment_survey_sends where appointment_id = ${a}`,
        patient: (await tx<{ s: boolean }[]>`select survey_enabled as s from patients where id = ${p}`)[0]?.s,
        audit: (await tx<{ action: string }[]>`select action from audit_log where tenant_id = ${W.tenant} and entity_id in (${a}, ${p}) order by action`).map((r) => r.action),
      }));
      // THE CONTROL: the same code, handed over by the server's own session, IS redeemable. So the refusal
      // above is the session's, not a broken code. (No staff member can make this session, and the page
      // reaches the doors with HMAC(secret, the link's code), never with a hash somebody chose.)
      await as(tx, guestClaims(W.tenant));
      const asServer = { resolve: (await resolve(tx, chosen)).length, submit: await submit(tx, chosen, W.tenant) };
      return { issued: issued.result, asTherapist, after, asServer, a };
    });
    expect(out.issued).toBe("issued");
    expect(out.asTherapist).toEqual(REFUSED);
    expect(out.after).toEqual({ answers: 0, send: [{ open: true, outcome: null, sent_by: W.t1 }], patient: true, audit: ["survey.sent"] });
    expect(out.asServer).toEqual({ resolve: 1, submit: true });
  });

  const WITH_A_USER: [string, () => string][] = [
    ["the owner", () => staff("owner", W.owner)],
    ["admin of clinic A", () => staff("admin", W.adminA)],
    ["reception of clinic A", () => staff("reception", W.recA)],
    ["the therapist who attended the visit", () => staff("therapist", W.t1)],
    ["the owner of another tenant", () => staff("owner", W.ownerX, W.other)],
    ["a session with the job's own role and a user", () => JSON.stringify({ tenant_id: W.tenant, user_role: "admin", sub: W.adminA })],
    ["a session with a user that is nobody's (a well-formed sub)", () => claimsFor(W.tenant, "admin")],
    ["a session with a PATIENT claim: the patient the code is for", () => "@patient"],
    ["a session with another patient's claim", () => patientClaims(W.tenant, W.p2)],
  ];
  for (const [name, claims] of WITH_A_USER) {
    it(`THE GUEST DOORS, REFUSED: ${name}: no row, false, false, and nothing written`, async () => {
      const out = await scenario(null, jobClaims(W.tenant), async (tx) => {
        const code = hex();
        const p = await owner(tx, () => mkPatient(tx));
        const a = await owner(tx, () => mkAppt(tx, p, { by: W.t1, loc: W.locA }));
        expect(await issueAuto(tx, code, W.tenant, a)).toBe("issued");
        const c = claims();
        await as(tx, c === "@patient" ? patientClaims(W.tenant, p) : c);
        // The tenant handed in is the session's own, so the tenant test is not what refuses.
        const tenant = c.includes(W.other) ? W.other : W.tenant;
        const got = await redeem(tx, code, tenant);
        const gotT = await redeem(tx, code, W.tenant);
        const after = await owner(tx, async () => ({
          answers: (await tx`select 1 from appointment_survey_responses where appointment_id = ${a}`).length,
          open: (await tx<{ open: boolean }[]>`select consumed_at is null as open from appointment_survey_sends where appointment_id = ${a}`)[0]?.open,
          on: (await tx<{ s: boolean }[]>`select survey_enabled as s from patients where id = ${p}`)[0]?.s,
          audit: (await tx`select 1 from audit_log where tenant_id = ${W.tenant} and entity_id in (${a}, ${p})`).length,
        }));
        // THE CONTROL, same code, same transaction: the server's own session reads it.
        await as(tx, guestClaims(W.tenant));
        return { got, gotT, after, control: (await resolve(tx, code)).length };
      });
      expect(out.got).toEqual(REFUSED);
      expect(out.gotT).toEqual(REFUSED);
      expect(out.after).toEqual({ answers: 0, open: true, on: true, audit: 0 });
      expect(out.control).toBe(1);
    });
  }

  it("EACH DOOR CARRIES ITS OWN TEST: with the read door's session test taken out, the answer and the opt-out still refuse a user and a patient claim", async () => {
    // The answer and the opt-out ask the read door again before they write, so the read door's test alone
    // would refuse for them. This arm takes that test out (in a transaction that rolls back) and shows each
    // of the two doors refusing BY ITS OWN: a later edit of the read door cannot open them.
    const dir = join(__dirname, "..");
    const promoted = promotedFiles()[0];
    const file = promoted ? join(dir, "migrations", promoted) : join(dir, "migrations-pending", "NEXT-AFTER-0101_sat01_satisfaction_survey.sql");
    const m = /CREATE FUNCTION public\.resolve_survey_code\(p_code_hash text\)[\s\S]*?\$fn\$;/.exec(readFileSync(file, "utf8"));
    if (!m) throw new Error("the read door's CREATE FUNCTION was not found in the migration");
    const open = m[0]
      .replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION")
      .replace("     AND (SELECT auth.uid()) IS NULL\n", "")
      .replace("     AND (SELECT public.jwt_patient_id()) IS NULL\n", "");
    expect(open.includes("auth.uid()") || open.includes("jwt_patient_id()")).toBe(false);
    const out = await scenario((tx) => tx.unsafe(open).then(() => undefined), jobClaims(W.tenant), async (tx) => {
      const code = hex();
      const p = await owner(tx, () => mkPatient(tx));
      const a = await owner(tx, () => mkAppt(tx, p, { by: W.t1, loc: W.locA }));
      expect(await issueAuto(tx, code, W.tenant, a)).toBe("issued");
      await as(tx, staff("therapist", W.t1));
      const asUser = await redeem(tx, code, W.tenant);
      await as(tx, patientClaims(W.tenant, p));
      const asPatient = await redeem(tx, code, W.tenant);
      const written = await owner(tx, async () => ({
        answers: (await tx`select 1 from appointment_survey_responses where appointment_id = ${a}`).length,
        on: (await tx<{ s: boolean }[]>`select survey_enabled as s from patients where id = ${p}`)[0]?.s,
      }));
      return { asUser, asPatient, written };
    });
    // THE CONTROL IS IN THE ANSWER: the opened read door now shows the row to both sessions (1), so what
    // returns false below is the answer door's and the opt-out door's own test, and nothing was written.
    expect(out.asUser).toEqual({ resolve: 1, submit: false, optOut: false });
    expect(out.asPatient).toEqual({ resolve: 1, submit: false, optOut: false });
    expect(out.written).toEqual({ answers: 0, on: true });
  });

  it("THE GUEST DOORS AND THE AUTOMATIC SEND: anon, patient and service_role hold no EXECUTE, and a patient claim is refused by the automatic door too", async () => {
    // By privilege, never by a call (a call by a role without EXECUTE takes the local backend down).
    const rows = await sql<{ f: string; role: string; can: boolean }[]>`
      select f, r.rolname as role, has_function_privilege(r.oid, to_regprocedure(f), 'EXECUTE') as can
        from unnest(${["public.resolve_survey_code(text)", "public.submit_survey_response(text,uuid,integer,integer,text,boolean,text)", "public.opt_out_survey(text,uuid)", "public.issue_survey_automatic(text,uuid,uuid,text)"]}::text[]) f
        cross join (select oid, rolname from pg_roles where rolname in ('anon', 'patient', 'service_role', 'authenticated')) r`;
    expect(rows.length).toBe(16);
    for (const r of rows) expect(r.can, `${r.role} ${r.f}`).toBe(r.role === "authenticated");
    const auto = await scenario(null, jobClaims(W.tenant), async (tx) => {
      const p = await owner(tx, () => mkPatient(tx));
      const a = await owner(tx, () => mkAppt(tx, p));
      await as(tx, patientClaims(W.tenant, p));
      const withClaim = await issueAuto(tx, hex(), W.tenant, a);
      await as(tx, jobClaims(W.tenant));
      return { withClaim, control: await issueAuto(tx, hex(), W.tenant, a) };
    });
    expect(auto).toEqual({ withClaim: "not_allowed", control: "issued" });
  });

  it("A CODE THAT IS NOT 64 HEX CHARACTERS gets the answer a wrong code gets from every door, never an error, and writes nothing", async () => {
    const MALFORMED: [string, string][] = [
      ["empty", ""], ["63 hex", "a".repeat(63)], ["65 hex", "a".repeat(65)], ["64 upper-case hex", "AB".repeat(32)],
      ["64 characters, one not hex", `${"a".repeat(63)}g`], ["a real hash with a space after it", `${"a".repeat(64)} `],
    ];
    const out = await scenario(null, jobClaims(W.tenant), async (tx) => {
      const p = await owner(tx, () => mkPatient(tx));
      const a = await owner(tx, () => mkAppt(tx, p, { by: W.t1, loc: W.locA }));
      const got: Record<string, unknown> = {};
      for (const [name, code] of MALFORMED) {
        await as(tx, jobClaims(W.tenant));
        const auto = await issueAuto(tx, code, W.tenant, a);
        const guest = await redeem(tx, code, W.tenant);
        await as(tx, staff("owner", W.owner));
        const manual = (await issueManual(tx, code, W.tenant, p)).result;
        got[name] = { auto, manual, ...guest };
      }
      const written = await owner(tx, async () => ({
        sends: (await tx`select 1 from appointment_survey_sends where patient_id = ${p}`).length,
        audit: (await tx`select 1 from audit_log where tenant_id = ${W.tenant} and entity_id in (${a}, ${p})`).length,
      }));
      // THE CONTROLS: a WELL-FORMED code nobody holds gets the same three answers from the page's doors;
      // and a well-formed code is issued, so the refusals above are the shape's.
      await as(tx, jobClaims(W.tenant));
      const unknown = await redeem(tx, hex(), W.tenant);
      const issued = await issueAuto(tx, hex(), W.tenant, a);
      return { got, written, unknown, issued };
    });
    for (const [name] of MALFORMED) expect(out.got[name], name).toEqual({ auto: "not_allowed", manual: "not_allowed", ...REFUSED });
    expect(out.written).toEqual({ sends: 0, audit: 0 });
    expect(out.unknown).toEqual(REFUSED);
    expect(out.issued).toBe("issued");
  });

  it("SUBMIT: the consent label is bounded at 64 characters by its own CHECK, and 64 is accepted", async () => {
    const attempt = async (label: string): Promise<{ ok: boolean | null; code?: string; constraint?: string }> => {
      try {
        const ok = await scenario(null, jobClaims(W.tenant), async (tx) => {
          const c = hex();
          const p = await owner(tx, () => mkPatient(tx));
          const a = await owner(tx, () => mkAppt(tx, p));
          expect(await issueAuto(tx, c, W.tenant, a)).toBe("issued");
          return submit(tx, c, W.tenant, { label });
        });
        return { ok };
      } catch (err) {
        const e = err as { code?: string; constraint_name?: string };
        return { ok: null, code: e.code, constraint: e.constraint_name };
      }
    };
    expect(await attempt("x".repeat(65))).toEqual({ ok: null, code: "23514", constraint: "appointment_survey_responses_consent_version_length" });
    expect(await attempt("x".repeat(64))).toEqual({ ok: true });
    expect(await attempt("   ")).toEqual({ ok: null, code: "23514", constraint: "appointment_survey_responses_consent_version_not_blank" });
  });

  /* ---------------------------------------------------------------------- */
  /* THE FOREIGN KEYS: WHAT A DELETE OF A PATIENT DOES, AND A MERGE         */
  /* ---------------------------------------------------------------------- */
  it("DELETE OF A PATIENT: refused by the database while a send or an answer names them (23503, the survey's own foreign key), so no answer outlives its patient and none is erased as a side effect", async () => {
    // The owning role, which bypasses RLS and holds every privilege: what refuses is the foreign key.
    const tryDelete = async (answered: boolean): Promise<{ code?: string; constraint?: string; deleted?: number }> => {
      try {
        return await scenario(null, jobClaims(W.tenant), async (tx) => {
          const code = hex();
          const p = await owner(tx, () => mkPatient(tx));
          const other = await owner(tx, () => mkPatient(tx));
          const a = await owner(tx, () => mkAppt(tx, p));
          expect(await issueAuto(tx, code, W.tenant, a)).toBe("issued");
          if (answered) expect(await submit(tx, code, W.tenant)).toBe(true);
          await tx.unsafe("reset role");
          // The appointment is moved to another patient, as a merge moves it, so the survey rows are the
          // ONLY thing that still names the patient.
          await tx`update appointments set patient_id = ${other} where id = ${a}`;
          const deleted = (await tx`delete from patients where id = ${p}`).count;
          return { deleted };
        });
      } catch (err) {
        const e = err as { code?: string; constraint_name?: string };
        return { code: e.code, constraint: e.constraint_name };
      }
    };
    const SURVEY_FKS = ["appointment_survey_sends_patient_id_fkey", "appointment_survey_responses_patient_id_fkey"];
    const unanswered = await tryDelete(false);
    expect(unanswered.code).toBe("23503");
    expect(unanswered.constraint).toBe("appointment_survey_sends_patient_id_fkey");
    const answered = await tryDelete(true);
    expect(answered.code).toBe("23503");
    expect(SURVEY_FKS).toContain(answered.constraint);
    // THE CONTROL: the same patient with NO survey row, and the appointment moved away, is deleted.
    const control = await scenario(null, jobClaims(W.tenant), async (tx) => {
      const p = await owner(tx, () => mkPatient(tx));
      const other = await owner(tx, () => mkPatient(tx));
      const a = await owner(tx, () => mkAppt(tx, p));
      await tx.unsafe("reset role");
      await tx`update appointments set patient_id = ${other} where id = ${a}`;
      return (await tx`delete from patients where id = ${p}`).count;
    });
    expect(control).toBe(1);
    // The delete rules themselves, read from the catalogue: a = NO ACTION, c = CASCADE.
    const fks = await sql<{ fk: string; rule: string }[]>`
      select c.conrelid::regclass::text || '.' || a.attname || '>' || c.confrelid::regclass::text as fk, c.confdeltype::text as rule
        from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
       where c.contype = 'f' and c.conrelid::regclass::text like 'appointment_survey_%'
         and c.confrelid in ('public.patients'::regclass, 'public.appointments'::regclass, 'public.appointment_survey_sends'::regclass)
       order by 1`;
    expect(fks.map((r) => `${r.fk}:${r.rule}`)).toEqual([
      "appointment_survey_codes.send_id>appointment_survey_sends:c",
      "appointment_survey_responses.appointment_id>appointments:a",
      "appointment_survey_responses.patient_id>patients:a",
      "appointment_survey_responses.send_id>appointment_survey_sends:a",
      "appointment_survey_sends.appointment_id>appointments:c",
      "appointment_survey_sends.patient_id>patients:a",
    ]);
  });

  it("THE EIGHT FOREIGN KEYS ADDED AT THE END ARE THE ONES AN INLINE REFERENCES WOULD HAVE MADE: ten by name, all validated, none deferrable; and every function of the file is plpgsql", async () => {
    // The migration creates its tables WITHOUT the foreign keys to tenants, appointments, patients and users,
    // and adds them by ALTER TABLE in its last group, so that no lock on an existing table is taken early.
    // The names are Postgres's own for the inline form, <table>_<column>_fkey.
    const fks = await sql<{ name: string; def: string; ok: boolean }[]>`
      select c.conname::text as name, pg_get_constraintdef(c.oid) as def, (c.convalidated and not c.condeferrable) as ok
        from pg_constraint c
       where c.contype = 'f' and c.conrelid::regclass::text like 'appointment_survey_%'
       order by 1`;
    expect(fks.map((r) => `${r.name} ${r.def.replace(/public\./g, "")}`)).toEqual([
      "appointment_survey_codes_send_id_fkey FOREIGN KEY (send_id) REFERENCES appointment_survey_sends(id) ON DELETE CASCADE",
      "appointment_survey_codes_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id)",
      "appointment_survey_responses_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES appointments(id)",
      "appointment_survey_responses_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id)",
      "appointment_survey_responses_send_id_fkey FOREIGN KEY (send_id) REFERENCES appointment_survey_sends(id)",
      "appointment_survey_responses_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id)",
      "appointment_survey_sends_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE",
      "appointment_survey_sends_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id)",
      "appointment_survey_sends_sent_by_fkey FOREIGN KEY (sent_by) REFERENCES users(id)",
      "appointment_survey_sends_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id)",
    ]);
    expect(fks.filter((r) => !r.ok)).toEqual([]);
    // A SQL-language body is planned when it is created, which locks every table it reads until the COMMIT.
    const langs = await sql<{ fn: string; lang: string }[]>`
      select p.proname::text as fn, l.lanname::text as lang
        from pg_proc p join pg_language l on l.oid = p.prolang join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and (p.proname ~ 'survey') order by 1`;
    expect(langs.length).toBe(9);
    expect(langs.filter((r) => r.lang !== "plpgsql")).toEqual([]);
  });

  it("MERGE (0005) DOES NOT KNOW THESE TABLES, application work that is OWED: after a merge the survey rows stay on the merged-away patient, and the database refuses its hard delete", async () => {
    // THIS ARM RECORDS A GAP, NOT A WISH. merge_patients moves appointments and leaves sends and answers
    // where they were. The spec's amendment of 2026-10-05 lists the application work: the merge re-points
    // or refuses (A3, still owed; when it lands, this arm changes with it), and the hard delete reports
    // has_references (A4, landed 2026-10-08, proved in apps/web/lib/patients/hard-delete-survey.db.test.ts).
    // A4 is application code: the database's own refusal, asserted at the end of this arm, is unchanged.
    const out = await scenario(null, staff("owner", W.owner), async (tx) => {
      const code = hex();
      const loser = await owner(tx, () => mkPatient(tx));
      const survivor = await owner(tx, () => mkPatient(tx));
      const a = await owner(tx, () => mkAppt(tx, loser, { daysAgo: 5 }));
      await as(tx, jobClaims(W.tenant));
      expect(await issueAuto(tx, code, W.tenant, a)).toBe("issued");
      expect((await resolve(tx, code)).length).toBe(1);
      await as(tx, staff("owner", W.owner));
      await tx`select public.merge_patients(${loser}::uuid, ${survivor}::uuid, ${W.owner}::uuid)`;
      await as(tx, jobClaims(W.tenant));
      const linkAfter = (await resolve(tx, code)).length;
      const secondSend = await issueAuto(tx, hex(), W.tenant, a);
      const rows = await owner(tx, async () => ({
        appointmentOn: (await tx<{ p: string }[]>`select patient_id::text as p from appointments where id = ${a}`)[0]?.p,
        sendsOn: (await tx<{ p: string }[]>`select patient_id::text as p from appointment_survey_sends where appointment_id = ${a} order by (patient_id = ${loser}) desc`).map((r) => r.p),
      }));
      await tx.unsafe("reset role");
      let code23503: string | undefined;
      try {
        await tx.savepoint((sp) => sp`delete from patients where id = ${loser}`);
      } catch (err) {
        code23503 = (err as { code?: string }).code;
      }
      return { linkAfter, secondSend, rows, code23503, loser, survivor };
    });
    // The appointment followed the survivor; the first send did not.
    expect(out.rows.appointmentOn).toBe(out.survivor);
    expect(out.rows.sendsOn[0]).toBe(out.loser);
    // THE TWO EFFECTS THE REVIEW NAMED: the merged-away patient's live link no longer resolves, and the
    // survivor is sent a second survey for the same visit inside 60 days (their own count starts at zero).
    expect(out.linkAfter).toBe(0);
    expect(out.secondSend).toBe("issued");
    expect(out.rows.sendsOn).toEqual([out.loser, out.survivor]);
    // And the merged-away patient cannot be hard-deleted: the database refuses, it does not orphan.
    expect(out.code23503).toBe("23503");
  });

  /* ---------------------------------------------------------------------- */
  /* THE CHECKS ON AN ANSWER                                                */
  /* ---------------------------------------------------------------------- */
  it("SUBMIT: scores out of range, a 1001-character comment and a blank consent label are refused by the CHECKs (23514), writing nothing", async () => {
    const bad: [string, Parameters<typeof submit>[3]][] = [
      ["nps -1", { nps: -1 }],
      ["nps 11", { nps: 11 }],
      ["rating 0", { rating: 0 }],
      ["rating 6", { rating: 6 }],
      ["comment 1001", { comment: "x".repeat(1001) }],
      ["blank label", { label: "   " }],
    ];
    for (const [name, args] of bad) {
      let code: string | undefined;
      try {
        await scenario(null, jobClaims(W.tenant), async (tx) => {
          const c = hex();
          const p = await owner(tx, () => mkPatient(tx));
          const a = await owner(tx, () => mkAppt(tx, p));
          expect(await issueAuto(tx, c, W.tenant, a)).toBe("issued");
          return submit(tx, c, W.tenant, args);
        });
      } catch (err) {
        code = (err as { code?: string }).code;
      }
      expect(code, name).toBe("23514");
    }
    // CONTROL: the edges themselves are accepted.
    const edges = await scenario(null, jobClaims(W.tenant), async (tx) => {
      const out: boolean[] = [];
      for (const args of [{ nps: 0, rating: 1, comment: "x".repeat(1000) }, { nps: 10, rating: 5, comment: null }]) {
        const c = hex();
        const p = await owner(tx, () => mkPatient(tx));
        const a = await owner(tx, () => mkAppt(tx, p));
        expect(await issueAuto(tx, c, W.tenant, a)).toBe("issued");
        out.push(await submit(tx, c, W.tenant, args));
      }
      return out;
    });
    expect(edges).toEqual([true, true]);
  });

  /* ---------------------------------------------------------------------- */
  /* RETENTION (S12)                                                        */
  /* ---------------------------------------------------------------------- */
  it("PURGE: nulls only comments older than 24 months, keeps the scores, one audit row each, touches no other tenant", async () => {
    const out = await scenario(null, jobClaims(W.tenant), async (tx) => {
      const codes = [hex(), hex()];
      const ps: string[] = [];
      for (const c of codes) {
        const p = await owner(tx, () => mkPatient(tx));
        const a = await owner(tx, () => mkAppt(tx, p));
        expect(await issueAuto(tx, c, W.tenant, a)).toBe("issued");
        expect(await submit(tx, c, W.tenant, { nps: 7, rating: 4, comment: "um comentario" })).toBe(true);
        ps.push(p);
      }
      return owner(tx, async () => {
        await tx`update appointment_survey_responses set submitted_at = now() - interval '24 months 1 day' where patient_id = ${ps[0] as string}`;
        await tx`update appointment_survey_responses set submitted_at = now() - interval '23 months' where patient_id = ${ps[1] as string}`;
        await tx`update appointment_survey_responses set submitted_at = now() - interval '30 months' where tenant_id = ${W.other}`;
        const [{ n }] = (await tx`select public.purge_expired_survey_comments(${W.tenant}::uuid) as n`) as unknown as [{ n: number }];
        return {
          n,
          rows: await tx`select patient_id::text, comment, comment_purged_at is not null as purged, nps, rating
                           from appointment_survey_responses where patient_id in (${ps[0] as string}, ${ps[1] as string})
                          order by (patient_id = ${ps[0] as string}) desc`,
          other: await tx`select comment from appointment_survey_responses where tenant_id = ${W.other}`,
          audit: await tx`select count(*)::int as n from audit_log where tenant_id = ${W.tenant} and action = 'survey.comment_purged'
                            and entity_type = 'appointment_survey_response' and metadata = '{}'::jsonb`,
          ps,
        };
      });
    });
    expect(out.n).toBe(1);
    expect(out.rows).toEqual([
      { patient_id: out.ps[0], comment: null, purged: true, nps: 7, rating: 4 },
      { patient_id: out.ps[1], comment: "um comentario", purged: false, nps: 7, rating: 4 },
    ]);
    expect(out.other).toEqual([{ comment: "muito bom" }]);
    expect(out.audit[0]?.n).toBe(1);
  });

  it("PURGE: refuses a NULL tenant (22004), and no application role holds EXECUTE on it", async () => {
    let code: string | undefined;
    try {
      await sql`select public.purge_expired_survey_comments(null::uuid)`;
    } catch (err) {
      code = (err as { code?: string }).code;
    }
    expect(code).toBe("22004");
    // Read in the catalogue, never exercised: a call by a role without EXECUTE is not made here.
    const [r] = await sql<{ granted: string[] }[]>`
      select coalesce(array_agg(rolname order by rolname) filter (where has_function_privilege(oid, 'public.purge_expired_survey_comments(uuid)', 'EXECUTE')), '{}') as granted
        from pg_roles where rolname in ('authenticated', 'anon', 'patient', 'service_role')`;
    expect(r?.granted).toEqual([]);
  });

  /* ---------------------------------------------------------------------- */
  /* THE APPOINTMENT DELETE (O6 (a))                                        */
  /* ---------------------------------------------------------------------- */
  it("DELETE: an appointment with an unanswered send deletes and takes the send and its code; one with an answer is refused (23503)", async () => {
    const out = await scenario(null, jobClaims(W.tenant), async (tx) => {
      const p = await owner(tx, () => mkPatient(tx));
      const unanswered = await owner(tx, () => mkAppt(tx, p, { daysAgo: 70 }));
      const code = hex();
      expect(await issueAuto(tx, code, W.tenant, unanswered)).toBe("issued");
      return owner(tx, async () => {
        await tx`delete from appointments where id = ${unanswered}`;
        const left = await tx`select (select count(*) from appointment_survey_sends where appointment_id = ${unanswered})::int as s,
                                     (select count(*) from appointment_survey_codes where code_hash = ${code})::int as c`;
        return left[0];
      });
    });
    expect(out).toEqual({ s: 0, c: 0 });
    let code: string | undefined;
    try {
      await scenario(null, null, (tx) => owner(tx, () => tx`delete from appointments where id = ${W.a1}`));
    } catch (err) {
      code = (err as { code?: string }).code;
    }
    expect(code).toBe("23503");
  });
});

/**
 * Two committed transactions racing. `first` runs and holds its transaction open; `second` starts
 * and must be seen WAITING on a lock of kind `lock` (polled from a third connection, up to 5 s)
 * before `first` commits. Without the lock the second would not wait, the poll would time out, and
 * the test goes red: this is what makes the race a race rather than two calls in sequence.
 */
async function race<A, B>(
  first: (tx: TransactionSql) => Promise<A>,
  second: (tx: TransactionSql) => Promise<B>,
  claimsA: string,
  claimsB: string,
  lock: "advisory" | "transactionid",
): Promise<[A, B]> {
  const connB = connect();
  const probe = connect();
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let firstDone!: () => void;
  const ran = new Promise<void>((r) => (firstDone = r));
  try {
    const t1 = committed(sql, claimsA, async (tx) => {
      const v = await first(tx);
      firstDone();
      await gate;
      return v;
    });
    await ran;
    const t2 = committed(connB, claimsB, second);
    let waited = false;
    for (let i = 0; i < 50 && !waited; i++) {
      const [w] = await probe<{ n: number }[]>`select count(*)::int as n from pg_locks where locktype = ${lock} and not granted`;
      waited = (w?.n ?? 0) > 0;
      if (!waited) await new Promise((r) => setTimeout(r, 100));
    }
    release();
    const out: [A, B] = [await t1, await t2];
    expect(waited, `the second call never waited on a ${lock} lock`).toBe(true);
    return out;
  } finally {
    release();
    await connB.end({ timeout: 5 });
    await probe.end({ timeout: 5 });
  }
}
