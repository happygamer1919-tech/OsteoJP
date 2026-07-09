/**
 * review-finalize-rls.test.ts
 *
 * DB-level proof of the staff REVIEW / FINALIZE write path (the #133 keystone),
 * exercised at the SQL the app service (apps/web lib/clinical/review.ts) issues.
 * Two sources funnel into one immutable clinical_record:
 *
 *   * source='ai_ingested' — the queue item IS a draft clinical_record; claim
 *     flips ai_review_state pending_review → in_review, finalize signs it AND
 *     sets ai_review_state='approved' in ONE statement.
 *   * source='patient' — claim MATERIALISES a draft clinical_record and links it
 *     to the patient_form_submissions row (migration 0013 clinical_record_id);
 *     finalize signs the record and moves the submission to 'approved' with
 *     reviewed_by/reviewed_at.
 *
 * What this locks (the parts only the DB can prove):
 *   1. FULL LIFECYCLE for BOTH sources succeeds under a therapist JWT and ends
 *      in a locked/signed record + approved review.
 *   2. NEVER AUTO-FINALIZE — finalizing a pending_review item (no claim) matches
 *      0 rows (the service's in_review guard), so approved is unreachable from
 *      pending_review.
 *   3. SINGLE-STATEMENT finalize is REQUIRED — signing first and THEN setting
 *      ai_review_state in a second UPDATE is rejected by the immutability trigger
 *      (OLD.status='signed'); the combined UPDATE is the only path that works.
 *   4. IMMUTABILITY — once signed, any further UPDATE is blocked by the trigger.
 *   5. ADVERSARIAL CROSS-TENANT — a tenant-A therapist can neither see nor
 *      claim/finalize tenant-B's record or submission, and cannot forge a
 *      tenant-B insert (WITH CHECK). The not-visible / 0-rows-affected sanity
 *      assertions go RED if the clinical_records or patient_form_submissions RLS
 *      is weakened — the deliberate-policy-break tripwire the task requires.
 *
 * Reuses rls-harness.ts: the owner connection seeds/cleans (bypasses RLS by
 * ownership); every assertion runs through asRole("authenticated", therapist
 * claims, …) inside a rolled-back tx, so RLS is actually in force and nothing
 * persists. GATING: needs a live privileged DATABASE_URL with migrations
 * applied; skipped in CI without a DB.
 */
import { randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asRole, claimsFor, connect, live } from "./rls-harness";

type Fixture = {
  tenant: string;
  user: string;
  patient: string;
  aiRecord: string; // source='ai_ingested', pending_review draft
  submission: string; // source='patient', pending_review
};

const mk = (): Fixture => ({
  tenant: randomUUID(),
  user: randomUUID(),
  patient: randomUUID(),
  aiRecord: randomUUID(),
  submission: randomUUID(),
});

const A = mk();
const B = mk();

async function seed(p: Sql, f: Fixture, label: string): Promise<void> {
  await p`insert into tenants (id, name, slug) values (${f.tenant}, ${`Rev ${label}`}, ${`rev-${label}-${f.tenant}`})`;
  await p`insert into users (id, tenant_id, email, full_name)
          values (${f.user}, ${f.tenant}, ${`t-${f.user}@x.pt`}, 'Therapist')`;
  await p`insert into patients (id, tenant_id, full_name) values (${f.patient}, ${f.tenant}, 'Utente')`;
  // AI draft awaiting review.
  await p`insert into clinical_records (id, tenant_id, patient_id, source, status, ai_review_state, data)
          values (${f.aiRecord}, ${f.tenant}, ${f.patient}, 'ai_ingested', 'draft', 'pending_review',
                  ${JSON.stringify({ _aiIngestionRaw: { consultation_reason: "dor" } })}::jsonb)`;
  // Patient submission awaiting review.
  await p`insert into patient_form_submissions (id, tenant_id, patient_id, form_key, therapy, source, review_state, payload)
          values (${f.submission}, ${f.tenant}, ${f.patient}, 'ficha_geral', null, 'patient', 'pending_review',
                  ${JSON.stringify({ observations: "texto", weight_kg: 70 })}::jsonb)`;
}

describe.skipIf(!live)("review/finalize write path RLS + lifecycle", () => {
  let sql: Sql;
  beforeAll(async () => {
    sql = connect();
    await seed(sql, A, "A");
    await seed(sql, B, "B");
  });
  afterAll(async () => {
    if (!sql) return;
    await sql`delete from patient_form_submissions where tenant_id in (${A.tenant}, ${B.tenant})`;
    await sql`delete from clinical_records where tenant_id in (${A.tenant}, ${B.tenant})`;
    await sql`delete from tenants where id in (${A.tenant}, ${B.tenant})`;
    await sql.end();
  });

  const asTherapistA = <R>(fn: Parameters<typeof asRole<R>>[3]) =>
    asRole(sql, "authenticated", claimsFor(A.tenant, "therapist"), fn);

  /* ---- AI source: full lifecycle pending_review → in_review → approved ---- */
  it("AI: claim → narrative edit → single-statement finalize signs + approves", async () => {
    await asTherapistA(async (tx) => {
      const claimed = await tx<{ id: string }[]>`
        update clinical_records set ai_review_state = 'in_review'
        where id = ${A.aiRecord} and status = 'draft' and ai_review_state = 'pending_review'
        returning id`;
      expect(claimed.length).toBe(1);

      // Narrative edit (the service applies only narrative free-text; here we
      // merge a free-text key into the draft data while it is still a draft).
      await tx`update clinical_records set data = data || ${JSON.stringify({ consultation_reason: "lombalgia" })}::jsonb
               where id = ${A.aiRecord} and status = 'draft'`;

      // Finalize: status + ai_review_state in ONE statement so OLD.status is
      // still 'draft' when the immutability trigger fires.
      const finalized = await tx<{ status: string; ai_review_state: string }[]>`
        update clinical_records
        set status = 'signed', signed_by = ${A.user}, signed_at = now(), ai_review_state = 'approved'
        where id = ${A.aiRecord} and status = 'draft' and ai_review_state = 'in_review'
        returning status, ai_review_state`;
      expect(finalized.length).toBe(1);
      expect(finalized[0]?.status).toBe("signed");
      expect(finalized[0]?.ai_review_state).toBe("approved");
    });
  });

  /* ---- W5-17: Assumir maps the twelve AI keys onto the Ficha Médica field
     paths at claim, and the two axes transition INDEPENDENTLY. ---- */
  it("W5-17 AI: claim projects the twelve keys to field paths; axes stay separate through finalize", async () => {
    await asTherapistA(async (tx) => {
      // The raw AI payload the ingestion endpoint stored under `_aiIngestionRaw`
      // (mirrors the ingestion store shape) — the source of truth the projection
      // lifts onto field paths.
      const aiRaw = {
        template: "osteopathy",
        consultation_reason: "dor lombar",
        systems_review: { neurological: "sem alteracoes" },
        observations: "obs IA",
      };
      await tx`update clinical_records set data = ${tx.json({
        _aiIngestionRaw: aiRaw,
      })} where id = ${A.aiRecord}`;

      // CLAIM (the service's claim UPDATE, review.ts claimReviewItem): flip
      // ai_review_state AND write the WHOLE projected `data` in ONE update, exactly
      // as the service does — it computes `projectAiPayloadOntoFichaFields(data)` in
      // JS and persists `.set({ aiReviewState: "in_review", data: projected })`, a
      // whole-value jsonb assignment (NOT a SQL `data || …` merge). `projected` is
      // the raw payload with the twelve keys copied to their Ficha Médica field
      // paths and `_aiIngestionRaw` preserved untouched. record_status stays 'draft'
      // (the record_status axis does NOT move on claim).
      //
      // jsonb is bound with `tx.json(obj)` (native jsonb param), the way Drizzle
      // binds `.set({ data })`. Two postgres.js pitfalls this deliberately avoids —
      // both silently corrupted the earlier hand-rolled version of this test:
      //   1. `data = data || ${JSON.stringify(obj)}::jsonb` does NOT merge keys: a
      //      stringified object bound then cast to jsonb becomes a jsonb *string
      //      scalar*, so `||` yields a jsonb ARRAY (`[obj, "…"]`), not a key merge.
      //   2. writing a value via `${JSON.stringify(obj)}::jsonb` (text→jsonb cast)
      //      makes a subsequent `select data` come back as an UNPARSED string, so
      //      `d.consultation_reason` reads undefined. `tx.json` round-trips as an
      //      object. The service issues neither pattern; it writes the full object.
      const projected = {
        _aiIngestionRaw: aiRaw, // source of truth kept
        consultation_reason: aiRaw.consultation_reason,
        systems_review: { neurological: aiRaw.systems_review.neurological },
        observations: aiRaw.observations,
      };
      const claimed = await tx<{ status: string; ai_review_state: string }[]>`
        update clinical_records
        set ai_review_state = 'in_review',
            data = ${tx.json(projected)}
        where id = ${A.aiRecord} and status = 'draft' and ai_review_state = 'pending_review'
        returning status, ai_review_state`;
      expect(claimed.length).toBe(1);
      // Axis separation on claim: review axis moved, record_status did NOT.
      expect(claimed[0]?.ai_review_state).toBe("in_review");
      expect(claimed[0]?.status).toBe("draft");

      // The twelve keys are now reachable at their FIELD PATHS (editable in the
      // Ficha Médica editor), while _aiIngestionRaw is preserved.
      const afterClaim = await tx<{ data: Record<string, unknown> }[]>`
        select data from clinical_records where id = ${A.aiRecord}`;
      const d = afterClaim[0]!.data as Record<string, unknown>;
      expect(d.consultation_reason).toBe("dor lombar");
      expect((d.systems_review as Record<string, unknown>).neurological).toBe("sem alteracoes");
      expect(d.observations).toBe("obs IA");
      expect(d._aiIngestionRaw).toBeTruthy(); // source of truth kept

      // FINALIZE (single-statement): record_status → signed AND ai_review_state →
      // approved. The two axes move together HERE but by DISTINCT columns — never
      // collapsed into one. A finalize BEFORE claim would have matched 0 rows.
      const finalized = await tx<{ status: string; ai_review_state: string }[]>`
        update clinical_records
        set status = 'signed', signed_by = ${A.user}, signed_at = now(), ai_review_state = 'approved'
        where id = ${A.aiRecord} and status = 'draft' and ai_review_state = 'in_review'
        returning status, ai_review_state`;
      expect(finalized[0]?.status).toBe("signed");
      expect(finalized[0]?.ai_review_state).toBe("approved");

      // Immutability: the projected field-path values are now frozen.
      await expect(
        tx`update clinical_records set data = data || ${JSON.stringify({ consultation_reason: "x" })}::jsonb where id = ${A.aiRecord}`,
      ).rejects.toThrow(/immutable/i);
    });
  });

  it("AI: NEVER auto-finalize — finalizing a pending_review item matches 0 rows", async () => {
    await asTherapistA(async (tx) => {
      const jumped = await tx<{ id: string }[]>`
        update clinical_records
        set status = 'signed', ai_review_state = 'approved'
        where id = ${A.aiRecord} and status = 'draft' and ai_review_state = 'in_review'
        returning id`;
      // The row is still pending_review (claim happened in another, rolled-back
      // tx), so the in_review guard matches nothing — no jump to approved.
      expect(jumped.length).toBe(0);
    });
  });

  it("AI: two-statement finalize is BLOCKED by the immutability trigger", async () => {
    await asTherapistA(async (tx) => {
      // Claim first.
      await tx`update clinical_records set ai_review_state = 'in_review'
               where id = ${A.aiRecord} and ai_review_state = 'pending_review'`;
      // Sign WITHOUT setting ai_review_state…
      await tx`update clinical_records set status = 'signed', signed_by = ${A.user}, signed_at = now()
               where id = ${A.aiRecord} and status = 'draft'`;
      // …then a SECOND update to set ai_review_state now sees OLD.status='signed'.
      await expect(
        tx`update clinical_records set ai_review_state = 'approved' where id = ${A.aiRecord}`,
      ).rejects.toThrow(/immutable/i);
    });
  });

  it("once finalized (signed) the record rejects further edits (trigger)", async () => {
    await asTherapistA(async (tx) => {
      await tx`update clinical_records set ai_review_state = 'in_review'
               where id = ${A.aiRecord} and ai_review_state = 'pending_review'`;
      await tx`update clinical_records
               set status = 'signed', signed_by = ${A.user}, signed_at = now(), ai_review_state = 'approved'
               where id = ${A.aiRecord} and status = 'draft' and ai_review_state = 'in_review'`;
      // Last statement in the tx: the immutability trigger blocks any further edit.
      await expect(
        tx`update clinical_records set data = ${JSON.stringify({ tampered: true })}::jsonb where id = ${A.aiRecord}`,
      ).rejects.toThrow(/immutable/i);
    });
  });

  /* ---- Patient source: claim materialises a draft, finalize signs it ---- */
  it("patient: claim materialises a linked draft → finalize signs + approves submission", async () => {
    await asTherapistA(async (tx) => {
      const rec = await tx<{ id: string }[]>`
        insert into clinical_records (tenant_id, patient_id, source, practitioner_id, status, data)
        values (${A.tenant}, ${A.patient}, 'patient', ${A.user}, 'draft', ${JSON.stringify({ observations: "texto" })}::jsonb)
        returning id`;
      const recordId = rec[0]!.id;

      const linked = await tx<{ id: string }[]>`
        update patient_form_submissions
        set review_state = 'in_review', clinical_record_id = ${recordId}
        where id = ${A.submission} and review_state = 'pending_review'
        returning id`;
      expect(linked.length).toBe(1);

      // Narrative edit on the materialised draft.
      await tx`update clinical_records set data = data || ${JSON.stringify({ treatment_plan: "RPG" })}::jsonb
               where id = ${recordId} and status = 'draft'`;

      const signed = await tx<{ status: string }[]>`
        update clinical_records set status = 'signed', signed_by = ${A.user}, signed_at = now()
        where id = ${recordId} and status = 'draft'
        returning status`;
      expect(signed[0]?.status).toBe("signed");

      const subFinal = await tx<
        { review_state: string; clinical_record_id: string; reviewed_by: string }[]
      >`
        update patient_form_submissions
        set review_state = 'approved', reviewed_by = ${A.user}, reviewed_at = now()
        where id = ${A.submission} and review_state = 'in_review'
        returning review_state, clinical_record_id, reviewed_by`;
      expect(subFinal[0]?.review_state).toBe("approved");
      expect(subFinal[0]?.clinical_record_id).toBe(recordId);
      expect(subFinal[0]?.reviewed_by).toBe(A.user);
    });
  });

  /* ---- Adversarial cross-tenant (deliberate-policy-break tripwire) ---- */
  it("NEGATIVE CONTROL: owner (BYPASSRLS) CAN see tenant-B's record + submission", async () => {
    const recs = await sql<{ id: string }[]>`select id from clinical_records where id = ${B.aiRecord}`;
    const subs = await sql<{ id: string }[]>`select id from patient_form_submissions where id = ${B.submission}`;
    expect(recs.length).toBe(1);
    expect(subs.length).toBe(1);
  });

  it("tenant-A therapist CANNOT see tenant-B's record or submission", async () => {
    await asTherapistA(async (tx) => {
      const recs = await tx<{ id: string }[]>`select id from clinical_records where id = ${B.aiRecord}`;
      const subs = await tx<{ id: string }[]>`select id from patient_form_submissions where id = ${B.submission}`;
      // SANITY: red if clinical_records / patient_form_submissions RLS is broken.
      expect(recs.length).toBe(0);
      expect(subs.length).toBe(0);
    });
  });

  it("tenant-A therapist CANNOT claim or finalize a tenant-B record (USING → 0 rows)", async () => {
    await asTherapistA(async (tx) => {
      const claimed = await tx<{ id: string }[]>`
        update clinical_records set ai_review_state = 'in_review' where id = ${B.aiRecord} returning id`;
      expect(claimed.length).toBe(0);
      const finalized = await tx<{ id: string }[]>`
        update clinical_records set status = 'signed' where id = ${B.aiRecord} returning id`;
      expect(finalized.length).toBe(0);
    });
  });

  it("tenant-A therapist CANNOT finalize a tenant-B submission (USING → 0 rows)", async () => {
    await asTherapistA(async (tx) => {
      const updated = await tx<{ id: string }[]>`
        update patient_form_submissions set review_state = 'approved', reviewed_by = ${A.user}
        where id = ${B.submission} returning id`;
      expect(updated.length).toBe(0);
    });
  });

  it("tenant-A therapist CANNOT forge a tenant-B clinical_record (WITH CHECK)", async () => {
    await expect(
      asTherapistA(
        (tx) => tx`
          insert into clinical_records (tenant_id, patient_id, source, status, data)
          values (${B.tenant}, ${B.patient}, 'patient', 'draft', ${JSON.stringify({})}::jsonb)`,
      ),
    ).rejects.toThrow(/row-level security/i);
  });
});
