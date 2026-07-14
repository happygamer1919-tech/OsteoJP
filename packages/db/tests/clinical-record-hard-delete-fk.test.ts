/**
 * clinical-record-hard-delete-fk.test.ts: W6-01a regression (live DB).
 *
 * Proves the root cause of the "Ocorreu um erro" the owner hit when deleting a
 * ficha on the synthetic test patients (paol / paul), and that the fix resolves
 * it WITHOUT a schema change:
 *
 *   - A DRAFT clinical_record referenced by ai_ingestion_requests (AI-ingested
 *     draft) or patient_form_submissions (patient-submission-materialised draft)
 *     is pointed at by a NO-ACTION foreign key. Deleting the record while the
 *     pointer is set raises a Postgres FK violation (SQLSTATE 23503): the
 *     opaque failure. (pre-fix reality)
 *   - Nulling the nullable back-pointer first (what hardDeleteClinicalRecord now
 *     does) lets the draft delete succeed, and the referencing log/queue rows
 *     SURVIVE (they are unlinked, never dropped). (post-fix behaviour)
 *   - The detach + delete both run under the `authenticated` (staff) RLS role
 *     with the tenant JWT (the same context the app's runScoped uses), proving
 *     no elevated grant or migration is needed.
 *
 * GATING: requires a live, privileged DATABASE_URL (dev Supabase) with
 * migrations applied. Skipped when DATABASE_URL is absent so `vitest run` stays
 * green in ci.yml. Cases run inside rolled-back transactions; nothing persists.
 */
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { asRole, claimsFor, connect, live } from "./rls-harness";

const p = live ? connect() : null;

afterAll(async () => {
  await p?.end();
});

type Tx = Parameters<Parameters<typeof asRole>[3]>[0];

/** Seed a tenant + patient + a DRAFT clinical_record (as the privileged role). */
async function seedDraft(tx: Tx, tenant: string): Promise<{ patientId: string; recordId: string }> {
  await tx`insert into tenants (id, name, slug)
           values (${tenant}, ${`HD ${tenant}`}, ${`hd-${tenant}`})`;
  const [pt] = await tx<{ id: string }[]>`
    insert into patients (tenant_id, full_name) values (${tenant}, ${"Paulo"}) returning id`;
  const [rec] = await tx<{ id: string }[]>`
    insert into clinical_records (tenant_id, patient_id, status)
    values (${tenant}, ${pt!.id}, 'draft') returning id`;
  return { patientId: pt!.id, recordId: rec!.id };
}

describe.skipIf(!live)("W6-01a hard-delete draft ficha FK detach (live DB)", () => {
  it("PRE-FIX: deleting a draft referenced by ai_ingestion_requests raises FK 23503", async () => {
    await expect(
      asRole(p!, "service_role", null, async (tx) => {
        const t = randomUUID();
        const { recordId } = await seedDraft(tx, t);
        await tx`insert into ai_ingestion_requests
          (tenant_id, idempotency_key, request_id, payload_hash, clinical_record_id)
          values (${t}, ${`k-${recordId}`}, 'req', 'hash', ${recordId})`;
        await tx.unsafe("set local role authenticated");
        await tx`select set_config('request.jwt.claims', ${claimsFor(t, "therapist")}, true)`;
        // No detach → the NO-ACTION FK blocks the delete.
        await tx`delete from clinical_records where id = ${recordId} and status = 'draft'`;
      }),
    ).rejects.toThrow(/foreign key|23503/i);
  });

  it("PRE-FIX: deleting a draft referenced by patient_form_submissions raises FK 23503", async () => {
    await expect(
      asRole(p!, "service_role", null, async (tx) => {
        const t = randomUUID();
        const { patientId, recordId } = await seedDraft(tx, t);
        await tx`insert into patient_form_submissions
          (tenant_id, patient_id, form_key, source, clinical_record_id)
          values (${t}, ${patientId}, 'ficha_medica', 'patient', ${recordId})`;
        await tx.unsafe("set local role authenticated");
        await tx`select set_config('request.jwt.claims', ${claimsFor(t, "therapist")}, true)`;
        await tx`delete from clinical_records where id = ${recordId} and status = 'draft'`;
      }),
    ).rejects.toThrow(/foreign key|23503/i);
  });

  it("POST-FIX: detaching both back-pointers under staff RLS lets the draft delete and preserves the referencing rows", async () => {
    const res = await asRole(p!, "service_role", null, async (tx) => {
      const t = randomUUID();
      const { patientId, recordId } = await seedDraft(tx, t);
      await tx`insert into ai_ingestion_requests
        (tenant_id, idempotency_key, request_id, payload_hash, clinical_record_id)
        values (${t}, ${`k-${recordId}`}, 'req', 'hash', ${recordId})`;
      await tx`insert into patient_form_submissions
        (tenant_id, patient_id, form_key, source, clinical_record_id)
        values (${t}, ${patientId}, 'ficha_medica', 'patient', ${recordId})`;

      // Act as the staff actor, exactly as runScoped does.
      await tx.unsafe("set local role authenticated");
      await tx`select set_config('request.jwt.claims', ${claimsFor(t, "therapist")}, true)`;

      const detachedIng = (await tx`update ai_ingestion_requests set clinical_record_id = null
        where clinical_record_id = ${recordId} returning id`) as { id: string }[];
      const detachedSub = (await tx`update patient_form_submissions set clinical_record_id = null
        where clinical_record_id = ${recordId} returning id`) as { id: string }[];
      const deleted = (await tx`delete from clinical_records
        where id = ${recordId} and status = 'draft' returning id`) as { id: string }[];

      // The log/queue rows survive (unlinked), read back under the privileged role.
      await tx.unsafe("set local role service_role");
      const [ing] = await tx<{ n: number }[]>`
        select count(*)::int as n from ai_ingestion_requests where tenant_id = ${t}`;
      const [sub] = await tx<{ n: number }[]>`
        select count(*)::int as n from patient_form_submissions where tenant_id = ${t}`;
      return {
        detachedIng: detachedIng.length,
        detachedSub: detachedSub.length,
        deleted: deleted.length,
        survivingIngestion: ing!.n,
        survivingSubmission: sub!.n,
      };
    });

    expect(res.detachedIng).toBe(1);
    expect(res.detachedSub).toBe(1);
    expect(res.deleted).toBe(1);
    expect(res.survivingIngestion).toBe(1);
    expect(res.survivingSubmission).toBe(1);
  });

  it("a plain draft with no back-pointers still deletes (no regression)", async () => {
    const deleted = await asRole(p!, "service_role", null, async (tx) => {
      const t = randomUUID();
      const { recordId } = await seedDraft(tx, t);
      await tx.unsafe("set local role authenticated");
      await tx`select set_config('request.jwt.claims', ${claimsFor(t, "therapist")}, true)`;
      return (await tx`delete from clinical_records where id = ${recordId} and status = 'draft'
        returning id`) as { id: string }[];
    });
    expect(deleted.length).toBe(1);
  });
});
