/**
 * hard-delete-survey.db.test.ts: SAT-01 (spec item A4). THE PATIENT HARD DELETE
 * COUNTS SATISFACTION SURVEY SENDS AND ANSWERS, AGAINST REAL ROWS AND REAL RLS.
 *
 * Migration 0102 lets a survey send and its answer name a patient, each with a
 * NO ACTION foreign key, so the database refuses that patient's delete (23503).
 * The action and the danger-zone read now count both. Three things only a
 * database can say:
 *
 *   1. THE OWNER COUNTS THE ROW. The owner's session reads every send and
 *      answer of the tenant, so the danger zone shows the count and the action
 *      refuses on its own count, before it deletes anything.
 *   2. AN ADMIN OF ANOTHER CLINIC COUNTS ZERO AND IS STILL REFUSED. 0102's
 *      SELECT policy shows an admin only the sends at their own clinics. Such
 *      an admin reads zero for a send at another clinic, the action goes on to
 *      its deletes, the database refuses, and the action names that refusal
 *      `has_references` (the mapping DEL-02 put on main; this suite does not
 *      change it). Everything the action deleted on the way is taken back.
 *   3. A PATIENT NOTHING REFERENCES IS STILL DELETED, with its audit row, by
 *      the owner and by that same admin.
 *
 * WHICH OF THE TWO REFUSED IS MEASURED, NOT INFERRED. Both the count and the
 * database's refusal answer `has_references`, so the answer alone cannot tell
 * them apart. `isForeignKeyViolation` is wrapped to record each answer it gives
 * and is otherwise the real function: no answer recorded means the count
 * refused; one `true` means the database refused and the action named it.
 *
 * THE FIXTURE IS THE STATE A MERGE LEAVES TODAY. `merge_patients` (0005) moves
 * the merged-away patient's appointments to the survivor and does not know the
 * survey tables (0102's header, the spec's item A3), so the send still names
 * the merged-away patient while its appointment names the survivor. A patient
 * who was never merged is stopped earlier, by the appointment itself. Each
 * merged-away patient here is given a clinic link although a merge moves those
 * too: the link is the row the action deletes first, so its survival is what
 * shows the refusal rolled the whole transaction back.
 *
 * THE ROWS ARE WRITTEN ON THE ADMIN CONNECTION. No application role may write
 * the survey tables; in production only 0102's doors do. The answer's clinic
 * differs from its send's, which the doors allow: the send copies the
 * appointment's clinic when it is sent and the answer copies it when it is
 * submitted, so an appointment moved between the two leaves exactly this.
 *
 * WHAT IS STUBBED, AND NEITHER IS UNDER TEST: `requireRequestContext`, because
 * a vitest worker has no Supabase session, and `next/cache`, which needs a
 * request scope. The password gate, `runScoped`, RLS, every count, every delete
 * and the audit insert are real.
 *
 * THE FIXTURE IS BUILT, NEVER BORROWED: a tenant of its own, removed afterwards.
 * Runs in `.github/workflows/db-tests.yml` (it globs `.db.test.ts` in this
 * workspace) and self-skips without DATABASE_URL. Invented names only.
 */
import { randomUUID } from "node:crypto";
import { sql as raw } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  updateTag: () => {},
  revalidateTag: () => {},
  unstable_cache: (fn: unknown) => fn,
}));

const acting = vi.hoisted(() => ({
  ctx: null as { tenantId: string; role: string; userId: string } | null,
}));
vi.mock("@/lib/auth/context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/context")>();
  return {
    ...actual,
    requireRequestContext: async () => {
      if (!acting.ctx) throw new Error("no acting principal - use asOwner() or asOtherClinicAdmin()");
      return acting.ctx;
    },
  };
});

/** Every answer `isForeignKeyViolation` gave since the last reset. The function itself is the real one. */
const databaseRefusal = vi.hoisted(() => ({ answers: [] as boolean[] }));
vi.mock("@/lib/admin/foreign-key-refusal", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/foreign-key-refusal")>();
  return {
    ...actual,
    isForeignKeyViolation: (err: unknown) => {
      const answer = actual.isForeignKeyViolation(err);
      databaseRefusal.answers.push(answer);
      return answer;
    },
  };
});

const live = Boolean(process.env.DATABASE_URL);
const d = live ? describe : describe.skip;

d("SAT-01: the patient hard delete counts satisfaction survey sends and answers", () => {
  let db: ReturnType<typeof import("@osteojp/db").getDbAdmin>;
  let hardDeletePatient: typeof import("./actions").hardDeletePatient;
  let getPatientHardDeleteBlockers: typeof import("./queries").getPatientHardDeleteBlockers;
  let password: string;

  const tenant = randomUUID();
  const owner = randomUUID();
  /** An admin assigned to clinic B only. */
  const otherClinicAdmin = randomUUID();
  const therapist = randomUUID();
  /** Where both visits took place, so where both sends were made. */
  const clinicA = randomUUID();
  /** The clinic of the three patients below and of the admin. */
  const clinicB = randomUUID();
  /** Both visits are this patient's since the merge. */
  const survivor = randomUUID();
  /** Merged away. One send, never answered, still names it. */
  const sent = randomUUID();
  /** Merged away. One send and its answer still name it. */
  const answered = randomUUID();
  /** Nothing references these two but their clinic link. */
  const cleanForOwner = randomUUID();
  const cleanForAdmin = randomUUID();
  const visitOfSent = randomUUID();
  const visitOfAnswered = randomUUID();
  const sendOfSent = randomUUID();
  const sendOfAnswered = randomUUID();
  const answer = randomUUID();

  async function as<T>(role: "owner" | "admin", userId: string, fn: () => Promise<T>): Promise<T> {
    acting.ctx = { tenantId: tenant, role, userId };
    try {
      return await fn();
    } finally {
      acting.ctx = null;
    }
  }
  const asOwner = <T>(fn: () => Promise<T>) => as("owner", owner, fn);
  const asOtherClinicAdmin = <T>(fn: () => Promise<T>) => as("admin", otherClinicAdmin, fn);

  /** Every read-back below is on the admin connection, so RLS hides nothing from it. */
  const countOf = async (query: ReturnType<typeof raw>): Promise<number> => {
    const rows = (await db.execute(query)) as unknown as { n: number }[];
    return Number(rows[0]!.n);
  };
  const patientRows = (id: string) =>
    countOf(raw`select count(*)::int as n from patients where id = ${id}::uuid`);
  const linkRows = (id: string) =>
    countOf(raw`select count(*)::int as n from patient_locations where patient_id = ${id}::uuid`);
  const sendRows = (id: string) =>
    countOf(
      raw`select count(*)::int as n from appointment_survey_sends where patient_id = ${id}::uuid`,
    );
  const answerRows = (id: string) =>
    countOf(
      raw`select count(*)::int as n from appointment_survey_responses where patient_id = ${id}::uuid`,
    );
  const auditRows = (id: string) =>
    countOf(
      raw`select count(*)::int as n from audit_log
           where tenant_id = ${tenant}::uuid and action = 'patient.hard_delete'
             and entity_id = ${id}::uuid`,
    );

  /** The classes the preflight read found rows in, as the danger zone lists them. */
  const present = (blockers: Awaited<ReturnType<typeof getPatientHardDeleteBlockers>>) =>
    blockers.counts.filter((c) => c.count > 0);

  beforeAll(async () => {
    const schema = await import("@osteojp/db");
    db = schema.getDbAdmin();
    ({ hardDeletePatient } = await import("./actions"));
    ({ getPatientHardDeleteBlockers } = await import("./queries"));
    // The house default: a tenant with no stored hash is checked against it.
    password = (await import("../admin/appointment-delete-password")).DEFAULT_DELETE_PASSWORD;

    await db.execute(
      raw`insert into tenants (id, name, slug)
          values (${tenant}::uuid, 'sat01 delete', ${"sat01del-" + tenant.slice(0, 8)})`,
    );
    await db.execute(
      raw`insert into locations (id, tenant_id, name)
          values (${clinicA}::uuid, ${tenant}::uuid, 'Clinica A SAT01'),
                 (${clinicB}::uuid, ${tenant}::uuid, 'Clinica B SAT01')`,
    );
    for (const [id, label] of [
      [owner, "owner"],
      [otherClinicAdmin, "admin-b"],
      [therapist, "therapist"],
    ] as const) {
      await db.execute(
        raw`insert into users (id, tenant_id, email, full_name)
            values (${id}::uuid, ${tenant}::uuid,
                    ${`${label}-${id.slice(0, 8)}@sat01del.test`}, ${`${label} SAT01`})`,
      );
    }
    // The admin's ONLY clinic is B. An admin with no row here reads every
    // patient of the tenant and no send at all; this one is the ruled case, an
    // admin of another clinic than the send's.
    await db.execute(
      raw`insert into staff_locations (tenant_id, user_id, location_id)
          values (${tenant}::uuid, ${otherClinicAdmin}::uuid, ${clinicB}::uuid)`,
    );
    await db.execute(
      raw`insert into patients (id, tenant_id, full_name, primary_location_id)
          values (${survivor}::uuid, ${tenant}::uuid, 'Paciente Sobrevivente SAT01', ${clinicA}::uuid)`,
    );
    // Clinic B is each one's primary clinic: that is what lets the clinic B
    // admin read the patient row at all (patients_select, 0074).
    await db.execute(
      raw`insert into patients (id, tenant_id, full_name, primary_location_id, merged_into_id, deleted_at)
          values (${sent}::uuid, ${tenant}::uuid, 'Paciente Fundido Um SAT01', ${clinicB}::uuid,
                  ${survivor}::uuid, now()),
                 (${answered}::uuid, ${tenant}::uuid, 'Paciente Fundido Dois SAT01', ${clinicB}::uuid,
                  ${survivor}::uuid, now()),
                 (${cleanForOwner}::uuid, ${tenant}::uuid, 'Paciente Livre Um SAT01', ${clinicB}::uuid,
                  null, null),
                 (${cleanForAdmin}::uuid, ${tenant}::uuid, 'Paciente Livre Dois SAT01', ${clinicB}::uuid,
                  null, null)`,
    );
    for (const id of [sent, answered, cleanForOwner, cleanForAdmin]) {
      await db.execute(
        raw`insert into patient_locations (tenant_id, patient_id, location_id)
            values (${tenant}::uuid, ${id}::uuid, ${clinicB}::uuid)`,
      );
    }
    // Both visits are the SURVIVOR's, at clinic A: no appointment names a
    // merged-away patient, so the appointments count reads zero for both.
    await db.execute(
      raw`insert into appointments (id, tenant_id, patient_id, practitioner_id, location_id,
                                    starts_at, ends_at, status)
          values (${visitOfSent}::uuid, ${tenant}::uuid, ${survivor}::uuid, ${therapist}::uuid,
                  ${clinicA}::uuid, '2026-09-01T10:00:00Z'::timestamptz,
                  '2026-09-01T10:45:00Z'::timestamptz, 'completed'::appointment_status),
                 (${visitOfAnswered}::uuid, ${tenant}::uuid, ${survivor}::uuid, ${therapist}::uuid,
                  ${clinicA}::uuid, '2026-09-02T10:00:00Z'::timestamptz,
                  '2026-09-02T10:45:00Z'::timestamptz, 'completed'::appointment_status)`,
    );
    await db.execute(
      raw`insert into appointment_survey_sends
            (id, tenant_id, appointment_id, patient_id, location_id, channel, origin, consumed_at, outcome)
          values (${sendOfSent}::uuid, ${tenant}::uuid, ${visitOfSent}::uuid, ${sent}::uuid,
                  ${clinicA}::uuid, 'email', 'automatic', null, null),
                 (${sendOfAnswered}::uuid, ${tenant}::uuid, ${visitOfAnswered}::uuid, ${answered}::uuid,
                  ${clinicA}::uuid, 'email', 'automatic', now(), 'answered')`,
    );
    // The answer's clinic is B: the visit moved there between the send and the
    // answer. So the clinic B admin reads this answer and not its send.
    await db.execute(
      raw`insert into appointment_survey_responses
            (id, tenant_id, send_id, appointment_id, patient_id, location_id, practitioner_id,
             nps, rating, contact_consent, consent_version, channel, sent_at)
          values (${answer}::uuid, ${tenant}::uuid, ${sendOfAnswered}::uuid, ${visitOfAnswered}::uuid,
                  ${answered}::uuid, ${clinicB}::uuid, ${therapist}::uuid,
                  9, 5, false, 'sat01-delete-fixture', 'email', now())`,
    );
  });

  afterAll(async () => {
    if (!db) return;
    const statements = [
      raw`delete from appointment_survey_responses where tenant_id = ${tenant}::uuid`,
      raw`delete from appointment_survey_sends where tenant_id = ${tenant}::uuid`,
      raw`delete from appointments where tenant_id = ${tenant}::uuid`,
      raw`delete from audit_log where tenant_id = ${tenant}::uuid`,
      raw`delete from patient_locations where tenant_id = ${tenant}::uuid`,
      // The merged-away patients name the survivor: they go first.
      raw`delete from patients where tenant_id = ${tenant}::uuid and merged_into_id is not null`,
      raw`delete from patients where tenant_id = ${tenant}::uuid`,
      raw`delete from staff_locations where tenant_id = ${tenant}::uuid`,
      raw`delete from users where tenant_id = ${tenant}::uuid`,
      raw`delete from locations where tenant_id = ${tenant}::uuid`,
      raw`delete from tenants where id = ${tenant}::uuid`,
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
    databaseRefusal.answers.length = 0;
  });

  it("PREMISE: the fixture is what the arms below say it is", async () => {
    expect(await sendRows(sent)).toBe(1);
    expect(await answerRows(sent)).toBe(0);
    expect(await sendRows(answered)).toBe(1);
    expect(await answerRows(answered)).toBe(1);
    for (const id of [sent, answered, cleanForOwner, cleanForAdmin]) {
      expect(await patientRows(id), id).toBe(1);
      expect(await linkRows(id), id).toBe(1);
    }
    expect(await sendRows(cleanForOwner)).toBe(0);
    expect(await sendRows(cleanForAdmin)).toBe(0);
    // No appointment names a merged-away patient, as either participant.
    expect(
      await countOf(
        raw`select count(*)::int as n from appointments
             where patient_id in (${sent}::uuid, ${answered}::uuid)
                or patient_2_id in (${sent}::uuid, ${answered}::uuid)`,
      ),
    ).toBe(0);
  });

  it("the owner: one survey send is counted, named in the danger zone's list, and refuses the delete on the count", async () => {
    const blockers = await asOwner(() => getPatientHardDeleteBlockers(sent));
    expect(blockers.hasClinicalRecords).toBe(false);
    expect(blockers.hasOtherReferences).toBe(true);
    // The send is the ONLY class with rows: nothing else is refusing.
    expect(present(blockers)).toEqual([{ key: "surveySends", count: 1 }]);

    const result = await asOwner(() => hardDeletePatient(sent, password));
    expect(result).toEqual({ ok: false, error: "has_references" });
    // The count refused: the action never reached its deletes, so the database
    // was never asked and its refusal was never read.
    expect(databaseRefusal.answers).toEqual([]);

    expect(await patientRows(sent)).toBe(1);
    expect(await linkRows(sent)).toBe(1);
    expect(await sendRows(sent)).toBe(1);
    expect(await auditRows(sent)).toBe(0);
  });

  it("the owner: a send and its answer are both counted, each under its own name", async () => {
    const blockers = await asOwner(() => getPatientHardDeleteBlockers(answered));
    expect(blockers.hasOtherReferences).toBe(true);
    expect(present(blockers)).toEqual([
      { key: "surveySends", count: 1 },
      { key: "surveyAnswers", count: 1 },
    ]);

    const result = await asOwner(() => hardDeletePatient(answered, password));
    expect(result).toEqual({ ok: false, error: "has_references" });
    expect(databaseRefusal.answers).toEqual([]);

    expect(await patientRows(answered)).toBe(1);
    expect(await linkRows(answered)).toBe(1);
    expect(await answerRows(answered)).toBe(1);
    expect(await auditRows(answered)).toBe(0);
  });

  it("an admin of another clinic than the send's: the count reads ZERO, and the delete is still refused as has_references, by the database", async () => {
    const blockers = await asOtherClinicAdmin(() => getPatientHardDeleteBlockers(sent));
    // The read shows this admin nothing in the way: the button is enabled.
    expect(blockers.hasClinicalRecords).toBe(false);
    expect(blockers.hasOtherReferences).toBe(false);
    expect(present(blockers)).toEqual([]);

    const result = await asOtherClinicAdmin(() => hardDeletePatient(sent, password));
    expect(result).toEqual({ ok: false, error: "has_references" });
    // The counts passed, the DELETE was reached, the database refused it with a
    // foreign-key violation, and the action named that refusal.
    expect(databaseRefusal.answers).toEqual([true]);

    expect(await patientRows(sent)).toBe(1);
    // The clinic link is deleted before the patient: the refusal took it back.
    expect(await linkRows(sent)).toBe(1);
    expect(await sendRows(sent)).toBe(1);
    expect(await auditRows(sent)).toBe(0);
  });

  it("the same admin reads the ANSWER at their own clinic and not its send: the answers count alone refuses", async () => {
    const blockers = await asOtherClinicAdmin(() => getPatientHardDeleteBlockers(answered));
    expect(blockers.hasOtherReferences).toBe(true);
    expect(present(blockers)).toEqual([{ key: "surveyAnswers", count: 1 }]);

    const result = await asOtherClinicAdmin(() => hardDeletePatient(answered, password));
    expect(result).toEqual({ ok: false, error: "has_references" });
    expect(databaseRefusal.answers).toEqual([]);

    expect(await patientRows(answered)).toBe(1);
    expect(await linkRows(answered)).toBe(1);
    expect(await auditRows(answered)).toBe(0);
  });

  it("CONTROL: the owner deletes a patient nothing references, with its audit row", async () => {
    const blockers = await asOwner(() => getPatientHardDeleteBlockers(cleanForOwner));
    expect(blockers.hasOtherReferences).toBe(false);
    expect(present(blockers)).toEqual([]);

    const result = await asOwner(() => hardDeletePatient(cleanForOwner, password));
    expect(result).toEqual({ ok: true, id: cleanForOwner });
    expect(databaseRefusal.answers).toEqual([]);
    expect(await patientRows(cleanForOwner)).toBe(0);
    expect(await linkRows(cleanForOwner)).toBe(0);
    expect(await auditRows(cleanForOwner)).toBe(1);
  });

  it("CONTROL: that same admin deletes a patient nothing references, so the refusal above is the send's and not the admin's", async () => {
    const result = await asOtherClinicAdmin(() => hardDeletePatient(cleanForAdmin, password));
    expect(result).toEqual({ ok: true, id: cleanForAdmin });
    expect(databaseRefusal.answers).toEqual([]);
    expect(await patientRows(cleanForAdmin)).toBe(0);
    expect(await linkRows(cleanForAdmin)).toBe(0);
    expect(await auditRows(cleanForAdmin)).toBe(1);
  });

  it("CONTROL: with its send gone, the same admin deletes the same patient", async () => {
    await db.execute(raw`delete from appointment_survey_sends where id = ${sendOfSent}::uuid`);
    const result = await asOtherClinicAdmin(() => hardDeletePatient(sent, password));
    expect(result).toEqual({ ok: true, id: sent });
    expect(databaseRefusal.answers).toEqual([]);
    expect(await patientRows(sent)).toBe(0);
    expect(await auditRows(sent)).toBe(1);
  });
});
