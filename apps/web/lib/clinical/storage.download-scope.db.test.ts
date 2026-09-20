/**
 * storage.download-scope.db.test.ts — SEC-attachment-download-by-path-skips-the-patient-scope,
 * THE REGISTO ARM, AGAINST A REAL POSTGRES.
 *
 * ==========================================================================
 * WHY THIS EXISTS BESIDE storage.download-scope.test.ts
 * ==========================================================================
 * That file asserts the SQL this code builds, by rendering the captured WHERE
 * through Drizzle's dialect. It is the right instrument for "did the predicate
 * change shape", and it cannot answer the only question that matters to a
 * patient: does the database, under RLS, with a real therapist's claims,
 * actually refuse the other therapist?
 *
 * The registo arm's whole defence is `clinical_records`' OWN RLS deciding
 * whether the LEFT JOINed row survives. A rendered WHERE cannot show that. A
 * manual psql proof did show it on 2026-09-20, on a throwaway database, once,
 * for the therapist only — and a proof that ran once in a terminal is not a
 * gate. This is that proof, in CI, on the same Supabase stack the RLS suites
 * use, extended to the principals the manual run did not cover: the owner, an
 * ASSIGNED admin, an UNASSIGNED admin, and the both-columns-set row an import
 * produces.
 *
 * ==========================================================================
 * THE ONE SEAM
 * ==========================================================================
 * `createSupabaseAdminClient` is stubbed, and nothing else is. Storage is
 * excluded from the CI Supabase stack (db-tests.yml starts it with
 * `-x ... storage ...`), so signing cannot happen here — and signing is not
 * what is under test. `runScoped` is REAL, so `set local role authenticated`
 * and the JWT claims are real, `clinical_records_select` runs, and
 * `therapistPatientScope` / `patientLocationScope` build their real predicates.
 * A stubbed signer turns "the row was found" into a resolved URL and "it was
 * not" into `not_found`, which is exactly the boundary being asserted.
 *
 * EVERY EXPECTATION BELOW IS TRUE BY CONSTRUCTION FROM THE FIXTURE, and the
 * fixture is deliberately minimal: one patient, one registo, three attachment
 * rows covering the three shapes the predicate distinguishes.
 */
import { randomUUID } from "node:crypto";
import { sql as raw } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { createSignedUrl } = vi.hoisted(() => ({ createSignedUrl: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ storage: { from: () => ({ createSignedUrl }) } }),
}));

import type { RequestContext } from "@osteojp/auth";
import { isClinicalError } from "./errors";

const live = Boolean(process.env.DATABASE_URL);
const d = live ? describe : describe.skip;

const SIGNED = "https://signed.example/ok";

d("createAttachmentDownloadUrl under real RLS — the registo arm", () => {
  let db: ReturnType<typeof import("@osteojp/db").getDbAdmin>;
  let createAttachmentDownloadUrl: typeof import("./storage").createAttachmentDownloadUrl;

  const tenant = randomUUID();
  const clinic = randomUUID();
  const therapistTreating = randomUUID();
  const therapistOther = randomUUID();
  const ownerUser = randomUUID();
  const adminAssigned = randomUUID();
  const adminUnassigned = randomUUID();

  const patient = randomUUID();
  const record = randomUUID();

  /** A registo upload: clinical_record_id set, patient_id NULL. */
  const registoPath = `${tenant}/${record}/${randomUUID()}__scan.pdf`;
  /** A Documentos upload: patient_id set, clinical_record_id NULL. */
  const documentPath = `${tenant}/patient-documents/${patient}/${randomUUID()}__exame.pdf`;
  /** An imported original: BOTH columns set. Only an import produces this. */
  const importedPath = `${tenant}/migration/fisiozero/exame-2019.pdf`;

  const ctx = (userId: string, role: RequestContext["role"]): RequestContext => ({
    tenantId: tenant,
    role,
    userId,
  });

  beforeAll(async () => {
    const mod = await import("@osteojp/db");
    db = mod.getDbAdmin();
    ({ createAttachmentDownloadUrl } = await import("./storage"));

    await db.execute(
      raw`insert into tenants (id, name, slug)
          values (${tenant}::uuid, 'attpath', ${"attpath-" + tenant.slice(0, 8)})`,
    );
    await db.execute(
      raw`insert into locations (id, tenant_id, name) values (${clinic}::uuid, ${tenant}::uuid, 'LV')`,
    );
    for (const [id, label] of [
      [therapistTreating, "treating"],
      [therapistOther, "other"],
      [ownerUser, "owner"],
      [adminAssigned, "adm-asg"],
      [adminUnassigned, "adm-una"],
    ] as const) {
      await db.execute(
        raw`insert into users (id, tenant_id, email, full_name)
            values (${id}::uuid, ${tenant}::uuid,
                    ${`${label}-${id.slice(0, 8)}@example.test`}, ${label})`,
      );
    }
    // ONLY the assigned admin gets a staff_locations row. The unassigned one is
    // defined by its ABSENCE from this table.
    await db.execute(
      raw`insert into staff_locations (tenant_id, user_id, location_id)
          values (${tenant}::uuid, ${adminAssigned}::uuid, ${clinic}::uuid)`,
    );
    await db.execute(
      raw`insert into patients (id, tenant_id, full_name, primary_location_id, created_by)
          values (${patient}::uuid, ${tenant}::uuid, 'Paciente Attpath',
                  ${clinic}::uuid, ${therapistTreating}::uuid)`,
    );
    // The appointment is what makes `therapistTreating` treat this patient AND
    // what puts the patient in `adminAssigned`'s clinic. It is also why the
    // UNASSIGNED admin is refused: clinical_admin_sees_patient's fallback arm
    // only fires for a patient with NO located appointment, and this one has
    // exactly that.
    await db.execute(
      raw`insert into appointments (tenant_id, patient_id, practitioner_id, location_id,
                                    starts_at, ends_at, status)
          values (${tenant}::uuid, ${patient}::uuid, ${therapistTreating}::uuid, ${clinic}::uuid,
                  '2026-09-02T10:00:00Z'::timestamptz, '2026-09-02T10:45:00Z'::timestamptz,
                  'completed'::appointment_status)`,
    );
    await db.execute(
      raw`insert into clinical_records (id, tenant_id, patient_id, practitioner_id, status)
          values (${record}::uuid, ${tenant}::uuid, ${patient}::uuid,
                  ${therapistTreating}::uuid, 'draft')`,
    );
    await db.execute(
      raw`insert into attachments (tenant_id, clinical_record_id, patient_id, storage_path, file_name)
          values
            (${tenant}::uuid, ${record}::uuid, null,              ${registoPath},   'scan.pdf'),
            (${tenant}::uuid, null,            ${patient}::uuid,  ${documentPath},  'exame.pdf'),
            (${tenant}::uuid, ${record}::uuid, ${patient}::uuid,  ${importedPath},  'exame-2019.pdf')`,
    );
  }, 30_000);

  /**
   * EVERY DELETE IS ATTEMPTED, AND THE FIRST FAILURE IS RE-RAISED AT THE END.
   *
   * A straight sequence of awaits abandons the rest of the teardown at the
   * first error, which leaves a PARTIAL tenant behind: rows whose FK parents
   * are gone, or a tenant row with no way to find its children. CI builds a
   * fresh database per job so it cannot accumulate there, but these suites are
   * also run against a long-lived dev database, and one partial `attpath`
   * tenant was found in exactly that state on 2026-09-20.
   *
   * The order is FK order and must stay that way; swallowing per statement does
   * not make the order optional, it makes a mid-sequence failure recoverable.
   */
  afterAll(async () => {
    if (!db) return;
    const statements = [
      raw`delete from attachments where tenant_id = ${tenant}::uuid`,
      raw`delete from clinical_records where tenant_id = ${tenant}::uuid`,
      raw`delete from appointments where tenant_id = ${tenant}::uuid`,
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
    // Re-raised so a teardown that could not finish is a RED suite rather than
    // a quiet leak somebody finds weeks later.
    if (first) throw first;
  });

  // Cleared per test, not per file: "nothing was signed" is asserted below, and
  // a call left over from the previous case would satisfy it wrongly. It did,
  // on the first run of this file.
  beforeEach(() => {
    createSignedUrl.mockReset();
    createSignedUrl.mockResolvedValue({ data: { signedUrl: SIGNED }, error: null });
  });

  const refused = (p: Promise<unknown>) =>
    expect(p).rejects.toSatisfy((e: unknown) => isClinicalError(e) && e.code === "not_found");

  /* ---------------------------------------------------------------- *
   * THE GAP ITSELF: two therapists, one registo path, opposite answers.
   * ---------------------------------------------------------------- */

  it("the TREATING therapist gets a signed URL for the registo attachment", async () => {
    await expect(
      createAttachmentDownloadUrl(ctx(therapistTreating, "therapist"), registoPath),
    ).resolves.toBe(SIGNED);
  });

  it("ANOTHER therapist in the SAME TENANT is refused that exact path", async () => {
    // Before the fix this resolved: `attachments` carries a tenant-only policy
    // for staff, so a live in-tenant row was the whole test. The registo arm is
    // what refuses it now, and it is the database refusing, not the app.
    await refused(createAttachmentDownloadUrl(ctx(therapistOther, "therapist"), registoPath));
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  /* ---------------------------------------------------------------- *
   * THE PATIENT-LEVEL ARM, so the registo fix is not read as the only one.
   * ---------------------------------------------------------------- */

  it("the TREATING therapist gets a signed URL for the patient-level document", async () => {
    await expect(
      createAttachmentDownloadUrl(ctx(therapistTreating, "therapist"), documentPath),
    ).resolves.toBe(SIGNED);
  });

  it("ANOTHER therapist is refused the patient-level document", async () => {
    await refused(createAttachmentDownloadUrl(ctx(therapistOther, "therapist"), documentPath));
  });

  /* ---------------------------------------------------------------- *
   * THE PRINCIPALS THE MANUAL PROOF DID NOT COVER.
   * ---------------------------------------------------------------- */

  it("the OWNER reads the registo attachment: clinical_records RLS has an owner branch", async () => {
    await expect(
      createAttachmentDownloadUrl(ctx(ownerUser, "owner"), registoPath),
    ).resolves.toBe(SIGNED);
  });

  it("an admin ASSIGNED to the patient's clinic reads the registo attachment", async () => {
    await expect(
      createAttachmentDownloadUrl(ctx(adminAssigned, "admin"), registoPath),
    ).resolves.toBe(SIGNED);
  });

  it("an UNASSIGNED admin is refused it, which is what the registo PAGE already answers", async () => {
    // Not a regression: getRecordDetail 404s the registo page for this
    // principal, so no legitimate click can produce this path for them.
    await refused(createAttachmentDownloadUrl(ctx(adminUnassigned, "admin"), registoPath));
  });

  /* ---------------------------------------------------------------- *
   * THE ROW SHAPE ONLY AN IMPORT PRODUCES: both columns set.
   * ---------------------------------------------------------------- */

  it("an imported original with BOTH columns set is served through the registo arm to the treating therapist", async () => {
    await expect(
      createAttachmentDownloadUrl(ctx(therapistTreating, "therapist"), importedPath),
    ).resolves.toBe(SIGNED);
  });

  it("and is refused to another therapist — the patient-level arm cannot rescue it either", async () => {
    // The patient-level arm requires clinical_record_id IS NULL, which this row
    // fails, so the ONLY route is the registo arm. This pins that a both-set row
    // is not accidentally reachable through the wider of the two branches.
    await refused(createAttachmentDownloadUrl(ctx(therapistOther, "therapist"), importedPath));
  });

  /* ---------------------------------------------------------------- *
   * THE SOFT-DELETE GUARANTEE 0089 ADDED, still holding under RLS.
   * ---------------------------------------------------------------- */

  it("a soft-deleted row is refused even to the therapist who may see the patient", async () => {
    // The restore is in a `finally`: without it a failed assertion here leaves
    // the row soft-deleted for every case that runs after it, and the next
    // failure would be blamed on the wrong thing.
    await db.execute(
      raw`update attachments
             set deleted_at = now(), deleted_by_user_id = ${therapistTreating}::uuid,
                 delete_reason = 'teste attpath'
           where tenant_id = ${tenant}::uuid and storage_path = ${documentPath}`,
    );
    try {
      await refused(createAttachmentDownloadUrl(ctx(therapistTreating, "therapist"), documentPath));
    } finally {
      await db.execute(
        raw`update attachments
               set deleted_at = null, deleted_by_user_id = null, delete_reason = null
             where tenant_id = ${tenant}::uuid and storage_path = ${documentPath}`,
      );
    }
  });
});
