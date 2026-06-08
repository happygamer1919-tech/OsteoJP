import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { assertCan, type RequestContext } from "@osteojp/auth";
import {
  clinicalRecords,
  formTemplates,
  patientFormSubmissions,
  patients,
  type DbTx,
} from "@osteojp/db";
import { runScoped } from "@/lib/auth/context";
import { writeClinicalAudit, clientIp } from "./audit";
import { ClinicalError } from "./errors";
import { parseTemplateSchema } from "./form-template";
import { partitionNarrativeEdit } from "./review-fields";
import {
  FINALIZED_REVIEW_STATE,
  assertReviewTransition,
  isTerminalReviewState,
  type AiReviewState,
} from "@/lib/ingestion/review-state";

// Staff finalize / review write path (the #133 keystone).
//
// A therapist opens a `pending_review` item from one of two sources and drives
// it through claim → narrative edit → finalize into a locked/signed
// clinical_record, advancing the review state pending_review → in_review →
// approved:
//
//   * source = 'ai_ingested' — the item IS already a draft clinical_record
//     (created by the ingestion endpoint as service_role, rule #3/#4). Its
//     `ai_review_state` carries the queue state. Finalize signs THAT record.
//
//   * source = 'patient' — the item is a patient_form_submissions row with no
//     clinical_record yet. CLAIMING it MATERIALISES a draft clinical_record
//     (source='patient'); the submission's `review_state` carries the queue
//     state and `clinical_record_id` links the two (migration 0013). Finalize
//     signs the materialised record.
//
// After claim, both paths are addressed by a clinical_record id and share the
// edit + finalize code. The presence of a linked patient_form_submissions row
// distinguishes which review-state machine to advance.
//
// HARD RULES enforced here (task brief):
//   * narrative free-text ONLY for edits/auto-fill (review-fields.ts); coded +
//     safety fields stay manual.
//   * tenant_id + patient_id come from the authenticated principal / the
//     resolved submission row — NEVER from a request payload.
//   * never auto-finalize: `approved` is reachable ONLY from `in_review`
//     (review-state.ts), and finalize is an explicit, separately-gated call.
//   * a locked/signed record is immutable: every write is guarded on
//     status='draft' and the DB BEFORE-trigger (migration 0001) is the wall.

const ACTIVE_REVIEW_STATES: readonly AiReviewState[] = ["pending_review", "in_review"];

export type ReviewItemRef =
  | { source: "ai"; recordId: string }
  | { source: "patient"; submissionId: string };

export type ReviewQueueItem = {
  /** Stable key for the row (recordId for AI, submissionId for patient). */
  id: string;
  source: "ai" | "patient";
  /** The draft clinical_record id, once one exists (AI: always; patient: after claim). */
  recordId: string | null;
  patientId: string;
  patientName: string;
  /** Human label: template title (AI) or form_key/therapy (patient). */
  label: string;
  state: AiReviewState;
  updatedAt: string;
};

/* ------------------------------------------------------------------ */
/* Queue read                                                         */
/* ------------------------------------------------------------------ */

/** Active review-queue items (pending_review + in_review) across both sources. */
export async function listReviewQueue(ctx: RequestContext): Promise<ReviewQueueItem[]> {
  assertCan(ctx.role, "clinical_records:review");
  return runScoped(ctx, async (tx) => {
    const aiRows = await tx
      .select({
        id: clinicalRecords.id,
        patientId: clinicalRecords.patientId,
        patientName: patients.fullName,
        templateTitle: formTemplates.title,
        state: clinicalRecords.aiReviewState,
        updatedAt: clinicalRecords.updatedAt,
      })
      .from(clinicalRecords)
      .innerJoin(patients, eq(patients.id, clinicalRecords.patientId))
      .leftJoin(formTemplates, eq(formTemplates.id, clinicalRecords.formTemplateId))
      .where(
        and(
          eq(clinicalRecords.source, "ai_ingested"),
          inArray(clinicalRecords.aiReviewState, ACTIVE_REVIEW_STATES),
        ),
      )
      .orderBy(desc(clinicalRecords.updatedAt));

    const patientRows = await tx
      .select({
        id: patientFormSubmissions.id,
        recordId: patientFormSubmissions.clinicalRecordId,
        patientId: patientFormSubmissions.patientId,
        patientName: patients.fullName,
        formKey: patientFormSubmissions.formKey,
        therapy: patientFormSubmissions.therapy,
        state: patientFormSubmissions.reviewState,
        updatedAt: patientFormSubmissions.updatedAt,
      })
      .from(patientFormSubmissions)
      .innerJoin(patients, eq(patients.id, patientFormSubmissions.patientId))
      .where(inArray(patientFormSubmissions.reviewState, ACTIVE_REVIEW_STATES))
      .orderBy(desc(patientFormSubmissions.updatedAt));

    const ai: ReviewQueueItem[] = aiRows.map((r) => ({
      id: r.id,
      source: "ai" as const,
      recordId: r.id,
      patientId: r.patientId,
      patientName: r.patientName,
      label:
        (r.templateTitle as { pt?: string; en?: string } | null)?.pt ??
        (r.templateTitle as { pt?: string; en?: string } | null)?.en ??
        "AI",
      state: (r.state ?? "pending_review") as AiReviewState,
      updatedAt: r.updatedAt.toISOString(),
    }));
    const pt: ReviewQueueItem[] = patientRows.map((r) => ({
      id: r.id,
      source: "patient" as const,
      recordId: r.recordId,
      patientId: r.patientId,
      patientName: r.patientName,
      label: r.therapy ? `${r.formKey} (${r.therapy})` : r.formKey,
      state: r.state as AiReviewState,
      updatedAt: r.updatedAt.toISOString(),
    }));
    return [...ai, ...pt].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  });
}

/* ------------------------------------------------------------------ */
/* Claim — pending_review → in_review                                 */
/* ------------------------------------------------------------------ */

/**
 * Claim a queue item for review. For an AI draft this flips the record's
 * `ai_review_state` to `in_review`; for a patient submission it MATERIALISES a
 * draft clinical_record (narrative-only auto-fill from the payload — coded +
 * safety fields stay blank for manual entry) and links it. Idempotent: a
 * re-claim of an already-claimed item returns the same record id.
 */
export async function claimReviewItem(
  ctx: RequestContext,
  ref: ReviewItemRef,
): Promise<{ recordId: string }> {
  assertCan(ctx.role, "clinical_records:review");
  const ip = await clientIp();
  return runScoped(ctx, async (tx) => {
    if (ref.source === "ai") {
      const rows = await tx
        .select({
          status: clinicalRecords.status,
          source: clinicalRecords.source,
          state: clinicalRecords.aiReviewState,
        })
        .from(clinicalRecords)
        .where(eq(clinicalRecords.id, ref.recordId))
        .limit(1);
      const row = rows[0];
      if (!row) throw new ClinicalError("not_found");
      if (row.source !== "ai_ingested" || !row.state) throw new ClinicalError("not_reviewable");
      const state = row.state as AiReviewState;
      if (state === "in_review") return { recordId: ref.recordId }; // idempotent
      if (isTerminalReviewState(state)) throw new ClinicalError("already_reviewed");
      assertReviewTransition(state, "in_review");

      const updated = await tx
        .update(clinicalRecords)
        .set({ aiReviewState: "in_review" })
        .where(
          and(
            eq(clinicalRecords.id, ref.recordId),
            eq(clinicalRecords.status, "draft"),
            eq(clinicalRecords.aiReviewState, "pending_review"),
          ),
        )
        .returning({ id: clinicalRecords.id });
      if (updated.length === 0) throw new ClinicalError("not_under_review");

      await writeClinicalAudit(tx, {
        tenantId: ctx.tenantId,
        actorUserId: ctx.userId,
        action: "clinical_record.review_claim",
        entityType: "clinical_record",
        entityId: ref.recordId,
        metadata: { source: "ai_ingested", from: state, to: "in_review" },
        ip,
      });
      return { recordId: ref.recordId };
    }

    // source === "patient"
    const subs = await tx
      .select({
        reviewState: patientFormSubmissions.reviewState,
        patientId: patientFormSubmissions.patientId,
        clinicalRecordId: patientFormSubmissions.clinicalRecordId,
        payload: patientFormSubmissions.payload,
      })
      .from(patientFormSubmissions)
      .where(eq(patientFormSubmissions.id, ref.submissionId))
      .limit(1);
    const sub = subs[0];
    if (!sub) throw new ClinicalError("not_found");
    const subState = sub.reviewState as AiReviewState;
    if (subState === "in_review" && sub.clinicalRecordId) {
      return { recordId: sub.clinicalRecordId }; // idempotent
    }
    if (isTerminalReviewState(subState)) throw new ClinicalError("already_reviewed");
    assertReviewTransition(subState, "in_review");

    // Auto-fill ONLY narrative free-text from the patient payload; coded + safety
    // fields are dropped so the clinician enters them manually. No template is
    // bound yet, so the classifier runs in its no-schema mode.
    const { narrative } = partitionNarrativeEdit(
      (sub.payload as Record<string, unknown>) ?? {},
    );

    const inserted = await tx
      .insert(clinicalRecords)
      .values({
        tenantId: ctx.tenantId, // from the principal, never the payload
        patientId: sub.patientId, // from the resolved submission, never the payload
        source: "patient",
        practitionerId: ctx.userId,
        status: "draft",
        data: narrative,
      })
      .returning({ id: clinicalRecords.id });
    const recordId = inserted[0]!.id;

    const linked = await tx
      .update(patientFormSubmissions)
      .set({ reviewState: "in_review", clinicalRecordId: recordId })
      .where(
        and(
          eq(patientFormSubmissions.id, ref.submissionId),
          eq(patientFormSubmissions.reviewState, "pending_review"),
        ),
      )
      .returning({ id: patientFormSubmissions.id });
    if (linked.length === 0) throw new ClinicalError("not_under_review");

    await writeClinicalAudit(tx, {
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      action: "clinical_record.create",
      entityType: "clinical_record",
      entityId: recordId,
      metadata: { source: "patient", submissionId: ref.submissionId },
      ip,
    });
    await writeClinicalAudit(tx, {
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      action: "clinical_record.review_claim",
      entityType: "clinical_record",
      entityId: recordId,
      metadata: { source: "patient", submissionId: ref.submissionId, to: "in_review" },
      ip,
    });
    return { recordId };
  });
}

/* ------------------------------------------------------------------ */
/* Edit narrative — only while in_review, narrative free-text only    */
/* ------------------------------------------------------------------ */

/**
 * Apply a narrative free-text edit to a claimed review item's draft. Rejects the
 * WHOLE edit if it reaches for any coded/safety field, and refuses any record
 * that is not currently under review (finalized records are immutable).
 */
export async function editReviewNarrative(
  ctx: RequestContext,
  recordId: string,
  edit: Record<string, unknown>,
): Promise<void> {
  assertCan(ctx.role, "clinical_records:review");
  const ip = await clientIp();
  await runScoped(ctx, async (tx) => {
    const rows = await tx
      .select({
        status: clinicalRecords.status,
        source: clinicalRecords.source,
        aiState: clinicalRecords.aiReviewState,
        data: clinicalRecords.data,
        schema: formTemplates.schema,
      })
      .from(clinicalRecords)
      .leftJoin(formTemplates, eq(formTemplates.id, clinicalRecords.formTemplateId))
      .where(eq(clinicalRecords.id, recordId))
      .limit(1);
    const row = rows[0];
    if (!row) throw new ClinicalError("not_found");
    // App-level guard for a clean message; the DB trigger is the real wall.
    if (row.status !== "draft") throw new ClinicalError("finalized");

    await assertUnderReview(tx, recordId, row.source, row.aiState as AiReviewState | null);

    const schema = parseTemplateSchema(row.schema);
    const { narrative, rejected } = partitionNarrativeEdit(edit, schema);
    if (Object.keys(rejected).length > 0) {
      throw new ClinicalError("not_narrative_field", rejected);
    }
    if (Object.keys(narrative).length === 0) return; // nothing to apply

    const merged = { ...((row.data as Record<string, unknown>) ?? {}), ...narrative };
    await tx
      .update(clinicalRecords)
      .set({ data: merged })
      .where(and(eq(clinicalRecords.id, recordId), eq(clinicalRecords.status, "draft")));

    await writeClinicalAudit(tx, {
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      action: "clinical_record.update",
      entityType: "clinical_record",
      entityId: recordId,
      metadata: { review: true, fields: Object.keys(narrative) },
      ip,
    });
  });
}

/* ------------------------------------------------------------------ */
/* Finalize — in_review → approved, sign + lock the record            */
/* ------------------------------------------------------------------ */

/**
 * Finalize a claimed review item: advance the review decision to `approved` and
 * sign+lock the draft clinical_record in the SAME statement (so the immutability
 * trigger sees OLD.status='draft'). For a patient item the linked submission is
 * also moved to `approved` with reviewed_by/reviewed_at recorded. Requires both
 * the review and sign capabilities — finalize is a signing action.
 */
export async function finalizeReview(
  ctx: RequestContext,
  recordId: string,
): Promise<void> {
  assertCan(ctx.role, "clinical_records:review");
  assertCan(ctx.role, "clinical_records:sign");
  const ip = await clientIp();
  await runScoped(ctx, async (tx) => {
    const rows = await tx
      .select({
        status: clinicalRecords.status,
        source: clinicalRecords.source,
        aiState: clinicalRecords.aiReviewState,
      })
      .from(clinicalRecords)
      .where(eq(clinicalRecords.id, recordId))
      .limit(1);
    const row = rows[0];
    if (!row) throw new ClinicalError("not_found");
    if (row.status !== "draft") throw new ClinicalError("finalized");

    const signedAt = new Date();

    if (row.source === "ai_ingested") {
      const state = (row.aiState ?? null) as AiReviewState | null;
      if (state !== "in_review") throw new ClinicalError("not_under_review");
      assertReviewTransition(state, FINALIZED_REVIEW_STATE); // in_review → approved

      // ONE update: sign + lock AND set review state, so OLD.status is still
      // 'draft' when the immutability trigger fires.
      const updated = await tx
        .update(clinicalRecords)
        .set({
          status: "signed",
          signedBy: ctx.userId,
          signedAt,
          aiReviewState: FINALIZED_REVIEW_STATE,
        })
        .where(
          and(
            eq(clinicalRecords.id, recordId),
            eq(clinicalRecords.status, "draft"),
            eq(clinicalRecords.aiReviewState, "in_review"),
          ),
        )
        .returning({ id: clinicalRecords.id });
      if (updated.length === 0) throw new ClinicalError("not_under_review");
    } else {
      // patient (or any non-AI) record materialised from a submission.
      const subs = await tx
        .select({ id: patientFormSubmissions.id, state: patientFormSubmissions.reviewState })
        .from(patientFormSubmissions)
        .where(eq(patientFormSubmissions.clinicalRecordId, recordId))
        .limit(1);
      const sub = subs[0];
      if (!sub) throw new ClinicalError("not_reviewable");
      const state = sub.state as AiReviewState;
      if (state !== "in_review") throw new ClinicalError("not_under_review");
      assertReviewTransition(state, FINALIZED_REVIEW_STATE);

      const updated = await tx
        .update(clinicalRecords)
        .set({ status: "signed", signedBy: ctx.userId, signedAt })
        .where(and(eq(clinicalRecords.id, recordId), eq(clinicalRecords.status, "draft")))
        .returning({ id: clinicalRecords.id });
      if (updated.length === 0) throw new ClinicalError("finalized");

      await tx
        .update(patientFormSubmissions)
        .set({
          reviewState: FINALIZED_REVIEW_STATE,
          reviewedBy: ctx.userId,
          reviewedAt: signedAt,
        })
        .where(
          and(
            eq(patientFormSubmissions.id, sub.id),
            eq(patientFormSubmissions.reviewState, "in_review"),
          ),
        );
    }

    await writeClinicalAudit(tx, {
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      action: "clinical_record.review_finalize",
      entityType: "clinical_record",
      entityId: recordId,
      metadata: { source: row.source, reviewState: FINALIZED_REVIEW_STATE, signedAt: signedAt.toISOString() },
      ip,
    });
  });
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Throws unless `recordId` is a queue item currently in `in_review`. */
async function assertUnderReview(
  tx: DbTx,
  recordId: string,
  source: string,
  aiState: AiReviewState | null,
): Promise<void> {
  if (source === "ai_ingested") {
    if (aiState !== "in_review") throw new ClinicalError("not_under_review");
    return;
  }
  const subs = await tx
    .select({ state: patientFormSubmissions.reviewState })
    .from(patientFormSubmissions)
    .where(eq(patientFormSubmissions.clinicalRecordId, recordId))
    .limit(1);
  const sub = subs[0];
  if (!sub) throw new ClinicalError("not_reviewable");
  if ((sub.state as AiReviewState) !== "in_review") throw new ClinicalError("not_under_review");
}
