/**
 * survey-switch.db.test.ts: SAT-01 (S8). THE PATIENT'S SURVEY SWITCH, SET BY
 * STAFF FROM THE FICHA, AGAINST REAL ROWS AND REAL RLS, AS EACH REAL ROLE.
 *
 * `setPatientSurveySwitch` is a plain UPDATE of one column of `patients` in
 * the caller's own session (migration 0102 gives staff no function for it).
 * What only a database can say:
 *
 *   1. WHO MAY. Owner; admin and reception at the patient's clinic. Each
 *      change is one column of one row, one `patient.update` audit row naming
 *      the field, and the database's own `survey.switch_changed` row beside
 *      it, both carrying the member of staff.
 *   2. WHO MAY NOT, AND THAT NOTHING IS WRITTEN. Reception at another clinic;
 *      a therapist, even for a patient they treat (the database would let
 *      them; the application does not offer it); anyone on a soft-deleted
 *      patient or a patient of another tenant.
 *   3. WHILE THE SURVEY IS SWITCHED OFF, NOBODY: the write refuses for every
 *      role and the read answers nothing, for off, unset and near-miss values.
 *   4. ONLY THE SURVEY SWITCH MOVES. Both reminder switches and every other
 *      column are as they were, and so is every other patient.
 *   5. NO SEND PATH OVERRIDES IT. With the switch off the automatic door
 *      refuses the patient; turned back on, it sends.
 *   6. A PRESS THAT CHANGES NOTHING WRITES NOTHING, not even an audit row.
 *
 * WHAT IS STUBBED, AND NEITHER IS UNDER TEST: `requireRequestContext`, because
 * a vitest worker has no Supabase session, and `next/cache`. `runScoped`, RLS,
 * `getPatient`'s clinic scope, the UPDATE, the trigger and both audit inserts
 * are real.
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
vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  updateTag: () => {},
  revalidateTag: () => {},
  unstable_cache: (fn: unknown) => fn,
}));

type Ctx = { tenantId: string; role: "owner" | "admin" | "reception" | "therapist"; userId: string };
const acting = vi.hoisted(() => ({ ctx: null as unknown }));
vi.mock("@/lib/auth/context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/context")>();
  return {
    ...actual,
    requireRequestContext: async () => {
      if (!acting.ctx) throw new Error("no acting principal");
      return acting.ctx;
    },
  };
});

const live = Boolean(process.env.DATABASE_URL);
const d = live ? describe : describe.skip;

d("SAT-01: the patient's survey switch, set by staff, against a real database", () => {
  let db: ReturnType<typeof import("@osteojp/db").getDbAdmin>;
  let setPatientSurveySwitch: typeof import("./survey-switch").setPatientSurveySwitch;
  let readPatientSurveySwitch: typeof import("./survey-switch").readPatientSurveySwitch;
  let withReminderTenantContext: typeof import("@/lib/reminders/context").withReminderTenantContext;

  const tenant = randomUUID();
  const otherTenant = randomUUID();
  const run = tenant.slice(0, 8);
  const clinicA = randomUUID();
  const clinicB = randomUUID();
  const owner = randomUUID();
  const adminA = randomUUID();
  const receptionA = randomUUID();
  const receptionB = randomUUID();
  const therapist = randomUUID();
  /** A patient of the other tenant. */
  const foreignPatient = randomUUID();

  const ctxOf = (role: Ctx["role"], userId: string): Ctx => ({ tenantId: tenant, role, userId });
  const OWNER = ctxOf("owner", owner);
  const ADMIN_A = ctxOf("admin", adminA);
  const RECEPTION_A = ctxOf("reception", receptionA);
  const RECEPTION_B = ctxOf("reception", receptionB);
  const THERAPIST = ctxOf("therapist", therapist);

  async function as<T>(ctx: Ctx, fn: () => Promise<T>): Promise<T> {
    acting.ctx = ctx;
    try {
      return await fn();
    } finally {
      acting.ctx = null;
    }
  }
  const set = (ctx: Ctx, patientId: string, enabled: boolean) =>
    as(ctx, () => setPatientSurveySwitch(patientId, enabled));
  /** The name of the error a refused write threw, or the value it returned. */
  const attempt = async (ctx: Ctx, patientId: string, enabled: boolean): Promise<string> => {
    try {
      return await set(ctx, patientId, enabled);
    } catch (e) {
      return `threw ${e instanceof Error ? e.name : "unknown"}`;
    }
  };

  const rowsOf = <T>(result: unknown): T[] =>
    (Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? [])) as T[];
  const one = async <T>(query: ReturnType<typeof raw>): Promise<T> =>
    rowsOf<T>(await db.execute(query))[0]!;

  let serial = 0;
  /** A patient at clinic A, treated there by the therapist (one concluded visit). */
  async function patient(over: { deleted?: boolean } = {}): Promise<{ id: string; appointmentId: string }> {
    const n = ++serial;
    const id = randomUUID();
    const appointmentId = randomUUID();
    await db.execute(
      raw`insert into patients (id, tenant_id, full_name, email, phone, primary_location_id, deleted_at)
          values (${id}::uuid, ${tenant}::uuid, ${`Paciente Fixture ${run} ${n}`},
                  ${`paciente-${n}-${run}@sat01switch.test`}, ${`+3519300${String(n).padStart(5, "0")}`},
                  ${clinicA}::uuid, ${over.deleted ? raw`now()` : raw`null`})`,
    );
    await db.execute(
      raw`insert into patient_locations (tenant_id, patient_id, location_id)
          values (${tenant}::uuid, ${id}::uuid, ${clinicA}::uuid)`,
    );
    const startsAt = new Date(Date.now() - 2 * 86_400_000 - n * 2 * 3_600_000);
    await db.execute(
      raw`insert into appointments (id, tenant_id, patient_id, practitioner_id, location_id,
                                    starts_at, ends_at, status)
          values (${appointmentId}::uuid, ${tenant}::uuid, ${id}::uuid, ${therapist}::uuid, ${clinicA}::uuid,
                  ${startsAt.toISOString()}::timestamptz,
                  ${new Date(startsAt.getTime() + 45 * 60_000).toISOString()}::timestamptz,
                  'completed'::appointment_status)`,
    );
    return { id, appointmentId };
  }

  const switchesOf = (patientId: string) =>
    one<{ survey: boolean; sms: boolean; email: boolean }>(
      raw`select survey_enabled as survey, reminder_sms_enabled as sms, reminder_email_enabled as email
            from patients where id = ${patientId}::uuid`,
    );
  /** A patient's whole row but for the survey switch and the row's own change stamp, as one digest. */
  const restOfPatient = async (patientId: string) =>
    (
      await one<{ digest: string }>(
        raw`select md5((to_jsonb(p) - 'survey_enabled' - 'updated_at')::text) as digest
              from patients p where p.id = ${patientId}::uuid`,
      )
    ).digest;
  const auditOf = async (patientId: string) =>
    rowsOf<{ action: string; entity_type: string; actor_user_id: string | null; metadata: Record<string, unknown> }>(
      await db.execute(
        raw`select action, entity_type, actor_user_id::text as actor_user_id, metadata
              from audit_log
             where tenant_id in (${tenant}::uuid, ${otherTenant}::uuid) and entity_id = ${patientId}::uuid
             order by action`,
      ),
    );
  /** Every patients row and every audit row of this suite's two tenants, as digests and a count. */
  const snapshot = () =>
    one<{ patients: string; audit_rows: number }>(raw`
      select
        (select coalesce(md5(string_agg(p::text, '|' order by p.id)), 'none')
           from patients p where p.tenant_id in (${tenant}::uuid, ${otherTenant}::uuid)) as patients,
        (select count(*)::int from audit_log
          where tenant_id in (${tenant}::uuid, ${otherTenant}::uuid)) as audit_rows
    `);

  const savedMode = process.env.SURVEY_SEND_MODE;

  beforeAll(async () => {
    const schema = await import("@osteojp/db");
    db = schema.getDbAdmin();
    ({ setPatientSurveySwitch, readPatientSurveySwitch } = await import("./survey-switch"));
    ({ withReminderTenantContext } = await import("@/lib/reminders/context"));

    for (const [id, label] of [
      [tenant, "a"],
      [otherTenant, "b"],
    ] as const) {
      await db.execute(
        raw`insert into tenants (id, name, slug)
            values (${id}::uuid, ${`sat01 switch ${label}`}, ${`sat01switch-${label}-${run}`})`,
      );
    }
    await db.execute(
      raw`insert into locations (id, tenant_id, name)
          values (${clinicA}::uuid, ${tenant}::uuid, ${`Clinica A ${run}`}),
                 (${clinicB}::uuid, ${tenant}::uuid, ${`Clinica B ${run}`})`,
    );
    for (const [id, label] of [
      [owner, "owner"],
      [adminA, "admin-a"],
      [receptionA, "reception-a"],
      [receptionB, "reception-b"],
      [therapist, "therapist"],
    ] as const) {
      await db.execute(
        raw`insert into users (id, tenant_id, email, full_name)
            values (${id}::uuid, ${tenant}::uuid, ${`${label}-${run}@sat01switch.test`}, ${`${label} ${run}`})`,
      );
    }
    // Each member of staff's ONLY clinic. Reception B is the ruled outsider:
    // reception at another clinic than the patient's.
    for (const [userId, locationId] of [
      [adminA, clinicA],
      [receptionA, clinicA],
      [receptionB, clinicB],
      [therapist, clinicA],
    ] as const) {
      await db.execute(
        raw`insert into staff_locations (tenant_id, user_id, location_id)
            values (${tenant}::uuid, ${userId}::uuid, ${locationId}::uuid)`,
      );
    }
    await db.execute(
      raw`insert into patients (id, tenant_id, full_name)
          values (${foreignPatient}::uuid, ${otherTenant}::uuid, ${`Paciente Alheio ${run}`})`,
    );
  });

  afterAll(async () => {
    if (savedMode === undefined) delete process.env.SURVEY_SEND_MODE;
    else process.env.SURVEY_SEND_MODE = savedMode;
    if (!db) return;
    const both = raw`(${tenant}::uuid, ${otherTenant}::uuid)`;
    const statements = [
      raw`delete from appointment_survey_sends where tenant_id in ${both}`,
      raw`delete from appointments where tenant_id in ${both}`,
      raw`delete from audit_log where tenant_id in ${both}`,
      raw`delete from patient_locations where tenant_id in ${both}`,
      raw`delete from patients where tenant_id in ${both}`,
      raw`delete from staff_locations where tenant_id in ${both}`,
      raw`delete from users where tenant_id in ${both}`,
      raw`delete from locations where tenant_id in ${both}`,
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

  beforeEach(() => {
    process.env.SURVEY_SEND_MODE = "on";
  });
  afterEach(() => {
    acting.ctx = null;
  });

  /* ================================================================== */
  /* 1. WHO MAY, AND WHAT IS WRITTEN                                     */
  /* ================================================================== */

  it.each([
    ["the owner", () => OWNER],
    ["an admin at the patient's clinic", () => ADMIN_A],
    ["reception at the patient's clinic", () => RECEPTION_A],
  ] as const)("%s turns the switch off and back on: one column, and two audit rows each time", async (_name, who) => {
    const ctx = who();
    const p = await patient();
    const bystander = await patient();
    expect(await switchesOf(p.id)).toEqual({ survey: true, sms: true, email: true });
    const rest = await restOfPatient(p.id);
    const bystanderRow = await one<{ digest: string }>(
      raw`select md5(q::text) as digest from patients q where q.id = ${bystander.id}::uuid`,
    );

    expect(await set(ctx, p.id, false)).toBe("changed");
    // ONLY THE SURVEY SWITCH. The reminder switches and every other column
    // (but the row's own change stamp) are as they were.
    expect(await switchesOf(p.id)).toEqual({ survey: false, sms: true, email: true });
    expect(await restOfPatient(p.id)).toBe(rest);
    // The application's row names the field and no value; the database's row
    // carries the new value. Both carry the member of staff.
    expect(await auditOf(p.id)).toEqual([
      { action: "patient.update", entity_type: "patient", actor_user_id: ctx.userId, metadata: { fields: ["surveyEnabled"] } },
      {
        action: "survey.switch_changed",
        entity_type: "patient",
        actor_user_id: ctx.userId,
        metadata: { survey_enabled: false, actor_patient_id: null },
      },
    ]);
    // The viewer reads it back as it stands.
    expect(await readPatientSurveySwitch(ctx, p.id)).toBe(false);

    expect(await set(ctx, p.id, true)).toBe("changed");
    expect(await switchesOf(p.id)).toEqual({ survey: true, sms: true, email: true });
    expect(await restOfPatient(p.id)).toBe(rest);
    expect((await auditOf(p.id)).map((r) => [r.action, r.metadata])).toEqual([
      ["patient.update", { fields: ["surveyEnabled"] }],
      ["patient.update", { fields: ["surveyEnabled"] }],
      ["survey.switch_changed", { survey_enabled: false, actor_patient_id: null }],
      ["survey.switch_changed", { survey_enabled: true, actor_patient_id: null }],
    ]);
    expect(await readPatientSurveySwitch(ctx, p.id)).toBe(true);

    // THE OTHER PATIENT is untouched, row and audit.
    expect(
      await one<{ digest: string }>(raw`select md5(q::text) as digest from patients q where q.id = ${bystander.id}::uuid`),
    ).toEqual(bystanderRow);
    expect(await auditOf(bystander.id)).toEqual([]);
  });

  /* ================================================================== */
  /* 6. A PRESS THAT CHANGES NOTHING WRITES NOTHING                      */
  /* ================================================================== */

  it("setting the switch to what it already reads changes nothing and writes no audit row", async () => {
    const p = await patient();
    const before = await snapshot();
    expect(await set(RECEPTION_A, p.id, true)).toBe("unchanged");
    expect(await snapshot()).toEqual(before);

    expect(await set(RECEPTION_A, p.id, false)).toBe("changed");
    const off = await snapshot();
    expect(await set(RECEPTION_A, p.id, false)).toBe("unchanged");
    expect(await set(OWNER, p.id, false)).toBe("unchanged");
    expect(await snapshot()).toEqual(off);
    // CONTROL: the snapshot moved for the one real change, by two audit rows.
    expect(off.audit_rows).toBe(before.audit_rows + 2);
    expect(off.patients).not.toBe(before.patients);
  });

  /* ================================================================== */
  /* 2. WHO MAY NOT, AND THAT NOTHING IS WRITTEN                         */
  /* ================================================================== */

  it("reception at another clinic is refused, and nothing is written", async () => {
    const p = await patient();
    const before = await snapshot();
    expect(await attempt(RECEPTION_B, p.id, false)).toBe("threw PatientNotFoundError");
    expect(await readPatientSurveySwitch(RECEPTION_B, p.id)).toBeNull();
    expect(await snapshot()).toEqual(before);
    // CONTROL: the same patient, by reception at its own clinic.
    expect(await attempt(RECEPTION_A, p.id, false)).toBe("changed");
  });

  it("a therapist is refused even for a patient they treat, and is shown nothing", async () => {
    const p = await patient();
    // PREMISE: this therapist does treat this patient, at their own clinic.
    expect(
      await one<{ n: number }>(
        raw`select count(*)::int as n from appointments
             where patient_id = ${p.id}::uuid and practitioner_id = ${therapist}::uuid`,
      ),
    ).toEqual({ n: 1 });
    const before = await snapshot();
    expect(await attempt(THERAPIST, p.id, false)).toBe("threw ForbiddenError");
    expect(await attempt(THERAPIST, p.id, true)).toBe("threw ForbiddenError");
    expect(await readPatientSurveySwitch(THERAPIST, p.id)).toBeNull();
    expect(await snapshot()).toEqual(before);
  });

  it("a soft-deleted patient has no switch to set or to show, for anyone", async () => {
    const p = await patient({ deleted: true });
    const before = await snapshot();
    for (const ctx of [OWNER, ADMIN_A, RECEPTION_A]) {
      expect(await attempt(ctx, p.id, false), ctx.role).toBe("threw PatientNotFoundError");
      expect(await readPatientSurveySwitch(ctx, p.id), ctx.role).toBeNull();
    }
    expect(await snapshot()).toEqual(before);
  });

  it("a patient of another tenant, an id nobody has, and a thing that is not an id: refused, nothing written", async () => {
    const before = await snapshot();
    for (const id of [foreignPatient, randomUUID(), "not-an-id", ""]) {
      expect(await attempt(OWNER, id, false), id).toBe("threw PatientNotFoundError");
      expect(await readPatientSurveySwitch(OWNER, id), id).toBeNull();
    }
    expect(await snapshot()).toEqual(before);
    expect(await switchesOf(foreignPatient)).toEqual({ survey: true, sms: true, email: true });
  });

  /* ================================================================== */
  /* 3. WHILE THE SURVEY IS SWITCHED OFF, NOBODY                         */
  /* ================================================================== */

  it.each([undefined, "", "off", "ON", "On", " on", "on ", "Canary", "true"])(
    "SURVEY_SEND_MODE=%j: every role is refused, nobody is shown a switch, and nothing is written",
    async (mode) => {
      const p = await patient();
      if (mode === undefined) delete process.env.SURVEY_SEND_MODE;
      else process.env.SURVEY_SEND_MODE = mode;
      const before = await snapshot();
      for (const ctx of [OWNER, ADMIN_A, RECEPTION_A, RECEPTION_B, THERAPIST]) {
        expect(await attempt(ctx, p.id, false), ctx.role).toBe("threw ForbiddenError");
        expect(await readPatientSurveySwitch(ctx, p.id), ctx.role).toBeNull();
      }
      expect(await snapshot()).toEqual(before);
      expect(await switchesOf(p.id)).toEqual({ survey: true, sms: true, email: true });

      // CONTROL: the same patient and the same person, with the survey on.
      process.env.SURVEY_SEND_MODE = "on";
      expect(await attempt(RECEPTION_A, p.id, false)).toBe("changed");
    },
  );

  it("under canary the switch is offered and works, for a patient on no list", async () => {
    const p = await patient();
    process.env.SURVEY_SEND_MODE = "canary";
    expect(await readPatientSurveySwitch(RECEPTION_A, p.id)).toBe(true);
    expect(await set(RECEPTION_A, p.id, false)).toBe("changed");
    expect(await readPatientSurveySwitch(RECEPTION_A, p.id)).toBe(false);
    expect(await attempt(THERAPIST, p.id, true)).toBe("threw ForbiddenError");
  });

  /* ================================================================== */
  /* 5. NO SEND PATH OVERRIDES IT                                        */
  /* ================================================================== */

  it("with the switch off the automatic door refuses the patient; turned back on, it sends", async () => {
    const p = await patient();
    const issue = async () =>
      rowsOf<{ result: string }>(
        await withReminderTenantContext(tenant, async (tx) =>
          tx.execute(
            raw`select public.issue_survey_automatic(${randomUUID().replace(/-/g, "").repeat(2)}, ${tenant}::uuid,
                                                    ${p.appointmentId}::uuid, 'email') as result`,
          ),
        ),
      )[0]?.result;

    expect(await set(RECEPTION_A, p.id, false)).toBe("changed");
    expect(await issue()).toBe("not_eligible");
    expect(
      await one<{ n: number }>(
        raw`select count(*)::int as n from appointment_survey_sends where tenant_id = ${tenant}::uuid and patient_id = ${p.id}::uuid`,
      ),
    ).toEqual({ n: 0 });

    expect(await set(RECEPTION_A, p.id, true)).toBe("changed");
    expect(await issue()).toBe("issued");
  });
});
