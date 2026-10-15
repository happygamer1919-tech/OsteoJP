/**
 * profile-survey.db.test.ts: SAT-01 (S8). THE PATIENT'S OWN SURVEY SWITCH,
 * THROUGH THE PROFILE ROUTE, AGAINST REAL ROWS AND REAL RLS, AS THE REAL
 * `patient` ROLE.
 *
 * The route reads and writes `patients.survey_enabled` in the patient's own
 * session: a plain SELECT and a plain UPDATE of one column, allowed by the
 * column grant of migration 0102 and row-gated by the two self-scope policies
 * (0010, 0019). What only a database can say:
 *
 *   1. WHILE THE SURVEY IS SWITCHED OFF, NOTHING. The profile carries no
 *      `surveyEnabled` key and a write that names it changes no row and writes
 *      no audit row, for off, unset and near-miss values.
 *   2. SWITCHED ON, THE PATIENT READS AND SETS THEIR OWN. One column of one
 *      row moves, and the database's own `survey.switch_changed` row names the
 *      patient as the actor.
 *   3. THE ROUND TRIP. The two reminder switches do not move when the survey
 *      switch does, and the survey switch does not move when they do.
 *   4. UNDER CANARY, ONLY A LISTED PATIENT. A patient not on the list gets no
 *      key and their write changes nothing.
 *   5. ONLY EVER THEIR OWN. As patient A, an UPDATE aimed at another patient of
 *      the same clinic or at a patient of another tenant touches no row.
 *   6. A PRESS THAT CHANGES NOTHING WRITES NO AUDIT ROW.
 *
 * WHAT IS STUBBED, AND IT IS NOT UNDER TEST: `getPatientPrincipal`, because a
 * vitest worker has no signed session cookie (its verification has its own
 * suites, `lib/auth/*.test.ts`). The route, `runAsPatient`, `set local role
 * patient`, the claims, RLS, the grant, the UPDATE and the trigger are real.
 *
 * EVERY COUNT IS OF THIS SUITE'S OWN TENANTS. Read-backs are on the admin
 * connection, so RLS hides nothing from them.
 *
 * THE FIXTURE IS BUILT, NEVER BORROWED: two tenants of its own, removed
 * afterwards. Invented names only. It globs into
 * `.github/workflows/db-tests.yml` with every `.db.test.ts` of this workspace
 * and self-skips without DATABASE_URL.
 */
import { randomUUID } from "node:crypto";
import { sql as raw } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Principal = { tenantId: string; patientId: string; userId: string };
const acting = vi.hoisted(() => ({ principal: null as unknown }));
vi.mock("@/lib/auth/patient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/patient")>();
  return { ...actual, getPatientPrincipal: async () => acting.principal };
});

const live = Boolean(process.env.DATABASE_URL);
const d = live ? describe : describe.skip;

d("SAT-01: the patient's own survey switch, through the profile route, against a real database", () => {
  let db: ReturnType<typeof import("@osteojp/db").getDbAdmin>;
  let withPatientContext: typeof import("@osteojp/db").withPatientContext;
  let GET: typeof import("@/app/api/v1/patient/profile/route").GET;
  let PATCH: typeof import("@/app/api/v1/patient/profile/route").PATCH;

  const tenant = randomUUID();
  const otherTenant = randomUUID();
  const run = tenant.slice(0, 8);
  /** The patient under test. */
  const patientA = randomUUID();
  /** Another patient of the same tenant. */
  const patientB = randomUUID();
  /** A patient of the other tenant. */
  const foreignPatient = randomUUID();

  const A: Principal = { tenantId: tenant, patientId: patientA, userId: randomUUID() };
  const B: Principal = { tenantId: tenant, patientId: patientB, userId: randomUUID() };

  const rowsOf = <T>(result: unknown): T[] =>
    (Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? [])) as T[];
  const one = async <T>(query: ReturnType<typeof raw>): Promise<T> => rowsOf<T>(await db.execute(query))[0]!;

  async function as<T>(principal: Principal | null, fn: () => Promise<T>): Promise<T> {
    acting.principal = principal;
    try {
      return await fn();
    } finally {
      acting.principal = null;
    }
  }
  type Body = { profile?: Record<string, unknown>; error?: string };
  const read = (principal: Principal | null) =>
    as(principal, async () => {
      const res = await GET();
      return { status: res.status, body: (await res.json()) as Body };
    });
  const write = (principal: Principal | null, body: unknown) =>
    as(principal, async () => {
      const res = await PATCH(
        new Request("http://localhost/api/v1/patient/profile", {
          method: "PATCH",
          body: JSON.stringify(body),
          headers: { "Content-Type": "application/json" },
        }),
      );
      return { status: res.status, body: (await res.json()) as Body };
    });

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
  const auditOf = async (patientId: string) =>
    rowsOf<{ action: string; entity_type: string; actor_user_id: string | null; metadata: Record<string, unknown> }>(
      await db.execute(
        raw`select action, entity_type, actor_user_id::text as actor_user_id, metadata
              from audit_log
             where tenant_id in (${tenant}::uuid, ${otherTenant}::uuid) and entity_id = ${patientId}::uuid
             order by created_at, id`,
      ),
    );
  /** Every patients row and every audit row of this suite's two tenants, as a digest and a count. */
  const snapshot = () =>
    one<{ patients: string; audit_rows: number }>(raw`
      select
        (select coalesce(md5(string_agg(p::text, '|' order by p.id)), 'none')
           from patients p where p.tenant_id in (${tenant}::uuid, ${otherTenant}::uuid)) as patients,
        (select count(*)::int from audit_log
          where tenant_id in (${tenant}::uuid, ${otherTenant}::uuid)) as audit_rows
    `);

  const saved = { mode: process.env.SURVEY_SEND_MODE, list: process.env.SURVEY_CANARY_PATIENT_IDS };
  function setSwitch(mode: string | undefined, list?: string) {
    if (mode === undefined) delete process.env.SURVEY_SEND_MODE;
    else process.env.SURVEY_SEND_MODE = mode;
    if (list === undefined) delete process.env.SURVEY_CANARY_PATIENT_IDS;
    else process.env.SURVEY_CANARY_PATIENT_IDS = list;
  }

  beforeAll(async () => {
    const schema = await import("@osteojp/db");
    db = schema.getDbAdmin();
    withPatientContext = schema.withPatientContext;
    ({ GET, PATCH } = await import("@/app/api/v1/patient/profile/route"));

    for (const [id, label] of [
      [tenant, "a"],
      [otherTenant, "b"],
    ] as const) {
      await db.execute(
        raw`insert into tenants (id, name, slug)
            values (${id}::uuid, ${`sat01 portal ${label}`}, ${`sat01portal-${label}-${run}`})`,
      );
    }
    // The reminder switches start in a state that is NOT the column defaults,
    // and differ between the two patients, so a write that reset them, or that
    // copied one patient's onto the other, would show.
    await db.execute(
      raw`insert into patients (id, tenant_id, full_name, email, phone, reminder_sms_enabled, reminder_email_enabled)
          values (${patientA}::uuid, ${tenant}::uuid, ${`Paciente Portal A ${run}`},
                  ${`a-${run}@sat01portal.test`}, '+351930000201', false, true),
                 (${patientB}::uuid, ${tenant}::uuid, ${`Paciente Portal B ${run}`},
                  ${`b-${run}@sat01portal.test`}, '+351930000202', true, false),
                 (${foreignPatient}::uuid, ${otherTenant}::uuid, ${`Paciente Alheio ${run}`},
                  ${`c-${run}@sat01portal.test`}, '+351930000203', true, true)`,
    );
  });

  afterAll(async () => {
    setSwitch(saved.mode, saved.list);
    if (!db) return;
    const both = raw`(${tenant}::uuid, ${otherTenant}::uuid)`;
    const statements = [
      raw`delete from audit_log where tenant_id in ${both}`,
      raw`delete from patients where tenant_id in ${both}`,
      raw`delete from tenants where id in ${both}`,
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

  beforeEach(async () => {
    setSwitch(undefined);
    // Every test starts from the column's default: on, for all three.
    await db.execute(
      raw`update patients set survey_enabled = true
           where tenant_id in (${tenant}::uuid, ${otherTenant}::uuid) and survey_enabled is distinct from true`,
    );
  });
  afterEach(() => setSwitch(saved.mode, saved.list));

  /* ---------------------------------------------------------------- */

  it("THE FIXTURE IS REAL: the column exists, is on by default, and the profile route answers for the patient", async () => {
    expect(await switchesOf(patientA)).toEqual({ survey: true, sms: false, email: true });
    expect(await switchesOf(patientB)).toEqual({ survey: true, sms: true, email: false });
    const got = await read(A);
    expect(got.status).toBe(200);
    expect(got.body.profile).toMatchObject({ id: patientA, reminderSmsEnabled: false, reminderEmailEnabled: true });
  });

  it.each([
    ["unset", undefined],
    ["off", "off"],
    ["ON (a near-miss)", "ON"],
    ["on with a trailing space (a near-miss)", "on "],
    ["true (a near-miss)", "true"],
    ["empty", ""],
  ] as const)("SWITCHED OFF (%s): the profile has no key, and a write that names it changes nothing", async (_n, mode) => {
    // The list names the patient, to prove a list alone offers nothing.
    setSwitch(mode, patientA);
    const got = await read(A);
    expect(got.status).toBe(200);
    expect(got.body.profile).toBeDefined();
    expect(got.body.profile).not.toHaveProperty("surveyEnabled");

    const before = await snapshot();
    const alone = await write(A, { surveyEnabled: false });
    expect(alone).toEqual({ status: 400, body: { error: "no_editable_fields" } });
    expect(await snapshot()).toEqual(before);

    // Beside a real field: the field saves, the switch stays, the answer has no key.
    const beside = await write(A, { city: `Cidade ${run}`, surveyEnabled: false });
    expect(beside.status).toBe(200);
    expect(beside.body.profile).toMatchObject({ city: `Cidade ${run}` });
    expect(beside.body.profile).not.toHaveProperty("surveyEnabled");
    expect(await switchesOf(patientA)).toEqual({ survey: true, sms: false, email: true });
    expect((await snapshot()).audit_rows).toBe(before.audit_rows);
    await db.execute(raw`update patients set city = null where id = ${patientA}::uuid`);
  });

  it("SWITCHED ON: the patient reads their switch, turns it off and on again, and only that column moves", async () => {
    setSwitch("on");
    expect((await read(A)).body.profile).toMatchObject({ surveyEnabled: true });

    const restBefore = await restOfPatient(patientA);
    const othersBefore = [await switchesOf(patientB), await switchesOf(foreignPatient)];
    const digestB = await restOfPatient(patientB);

    const off = await write(A, { surveyEnabled: false });
    expect(off.status).toBe(200);
    expect(off.body.profile).toMatchObject({ id: patientA, surveyEnabled: false });
    // THE ROUND TRIP: the reminder switches are where the fixture put them.
    expect(off.body.profile).toMatchObject({ reminderSmsEnabled: false, reminderEmailEnabled: true });
    expect(await switchesOf(patientA)).toEqual({ survey: false, sms: false, email: true });
    // Nothing else of the row moved, not even its change stamp.
    expect(await restOfPatient(patientA)).toBe(restBefore);
    // Nobody else moved.
    expect([await switchesOf(patientB), await switchesOf(foreignPatient)]).toEqual(othersBefore);
    expect(await restOfPatient(patientB)).toBe(digestB);
    // A later read says off.
    expect((await read(A)).body.profile).toMatchObject({ surveyEnabled: false });

    // The database's own row: the patient is the actor, no member of staff is.
    expect(await auditOf(patientA)).toEqual([
      {
        action: "survey.switch_changed",
        entity_type: "patient",
        actor_user_id: null,
        metadata: { survey_enabled: false, actor_patient_id: patientA },
      },
    ]);

    const on = await write(A, { surveyEnabled: true });
    expect(on.status).toBe(200);
    expect(on.body.profile).toMatchObject({ surveyEnabled: true, reminderSmsEnabled: false, reminderEmailEnabled: true });
    expect(await switchesOf(patientA)).toEqual({ survey: true, sms: false, email: true });
    expect(await restOfPatient(patientA)).toBe(restBefore);
    const audit = await auditOf(patientA);
    expect(audit.map((r) => [r.action, r.metadata.survey_enabled, r.metadata.actor_patient_id])).toEqual([
      ["survey.switch_changed", false, patientA],
      ["survey.switch_changed", true, patientA],
    ]);
    expect(await auditOf(patientB)).toEqual([]);
  });

  it("A PRESS THAT CHANGES NOTHING writes no audit row", async () => {
    setSwitch("on");
    const before = await snapshot();
    const same = await write(A, { surveyEnabled: true });
    expect(same.status).toBe(200);
    expect(same.body.profile).toMatchObject({ surveyEnabled: true });
    expect(await snapshot()).toEqual(before);
  });

  it("THE ROUND TRIP, THE OTHER WAY: moving a reminder switch does not move the survey switch", async () => {
    setSwitch("on");
    await write(A, { surveyEnabled: false });
    const auditBefore = (await auditOf(patientA)).length;

    const res = await write(A, { reminderSmsEnabled: true, reminderEmailEnabled: false });
    expect(res.status).toBe(200);
    expect(res.body.profile).toMatchObject({ reminderSmsEnabled: true, reminderEmailEnabled: false, surveyEnabled: false });
    expect(await switchesOf(patientA)).toEqual({ survey: false, sms: true, email: false });
    // The survey switch did not change, so the database wrote no row for it.
    expect((await auditOf(patientA)).length).toBe(auditBefore);

    // Back to the fixture's reminder state; the survey switch still does not move.
    await write(A, { reminderSmsEnabled: false, reminderEmailEnabled: true });
    expect(await switchesOf(patientA)).toEqual({ survey: false, sms: false, email: true });
    expect((await auditOf(patientA)).length).toBe(auditBefore);
  });

  it("SWITCHED ON: a value that is not a boolean is refused and nothing is written", async () => {
    setSwitch("on");
    const before = await snapshot();
    for (const value of ["false", 0, null]) {
      expect(await write(A, { surveyEnabled: value })).toEqual({
        status: 422,
        body: { error: "invalid_survey_enabled" },
      });
    }
    expect(await snapshot()).toEqual(before);
  });

  it("CANARY: the listed patient has the switch; a patient not on the list has no key and cannot write it", async () => {
    setSwitch("canary", patientA);

    expect((await read(A)).body.profile).toMatchObject({ surveyEnabled: true });
    const notListed = await read(B);
    expect(notListed.status).toBe(200);
    expect(notListed.body.profile).toMatchObject({ id: patientB });
    expect(notListed.body.profile).not.toHaveProperty("surveyEnabled");

    const before = await snapshot();
    expect(await write(B, { surveyEnabled: false })).toEqual({ status: 400, body: { error: "no_editable_fields" } });
    expect(await snapshot()).toEqual(before);

    const listed = await write(A, { surveyEnabled: false });
    expect(listed.status).toBe(200);
    expect(await switchesOf(patientA)).toEqual({ survey: false, sms: false, email: true });
    expect(await switchesOf(patientB)).toEqual({ survey: true, sms: true, email: false });
  });

  it("CANARY with an empty list: nobody has the switch", async () => {
    setSwitch("canary", "");
    for (const principal of [A, B]) {
      expect((await read(principal)).body.profile).not.toHaveProperty("surveyEnabled");
    }
    const before = await snapshot();
    expect((await write(A, { surveyEnabled: false })).status).toBe(400);
    expect(await snapshot()).toEqual(before);
  });

  it("ONLY EVER THEIR OWN: an id in the body is ignored, and the database refuses the row of anyone else", async () => {
    setSwitch("on");

    // The route has no place for an id: one in the body changes the caller's own row.
    const res = await write(A, { surveyEnabled: false, id: patientB, patientId: patientB, tenantId: otherTenant });
    expect(res.status).toBe(200);
    expect(res.body.profile).toMatchObject({ id: patientA, surveyEnabled: false });
    expect(await switchesOf(patientB)).toEqual({ survey: true, sms: true, email: false });
    expect(await switchesOf(foreignPatient)).toEqual({ survey: true, sms: true, email: true });

    // Past the route: the same statement, aimed at someone else, in patient A's
    // own session. The row policy leaves it nothing to update.
    const before = await snapshot();
    for (const target of [patientB, foreignPatient]) {
      const touched = await withPatientContext({ tenant_id: tenant, patient_id: patientA }, async (tx) =>
        rowsOf<{ id: string }>(
          await tx.execute(
            raw`update patients set survey_enabled = false where id = ${target}::uuid returning id`,
          ),
        ),
      );
      expect(touched, `patient A updated ${target === patientB ? "another patient" : "a patient of another tenant"}`).toEqual([]);
    }
    // And with no WHERE at all, exactly one row is reachable: their own.
    const reachable = await withPatientContext({ tenant_id: tenant, patient_id: patientA }, async (tx) =>
      rowsOf<{ id: string }>(await tx.execute(raw`update patients set survey_enabled = false returning id`)),
    );
    expect(reachable.map((r) => r.id)).toEqual([patientA]);
    expect(await snapshot()).toEqual(before);

    // A session that names patient A under the other tenant reaches nothing.
    const crossed = await withPatientContext({ tenant_id: otherTenant, patient_id: patientA }, async (tx) =>
      rowsOf<{ id: string }>(await tx.execute(raw`update patients set survey_enabled = true returning id`)),
    );
    expect(crossed).toEqual([]);
    expect(await switchesOf(patientA)).toEqual({ survey: false, sms: false, email: true });
  });

  it("NO SESSION: 401 on both verbs, and nothing is written", async () => {
    setSwitch("on");
    const before = await snapshot();
    expect((await read(null)).status).toBe(401);
    expect((await write(null, { surveyEnabled: false })).status).toBe(401);
    expect(await snapshot()).toEqual(before);
  });
});
