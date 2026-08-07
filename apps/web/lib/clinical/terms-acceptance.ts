import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { assertCan, type RequestContext } from "@osteojp/auth";
import { patientTermsAcceptances } from "@osteojp/db";
import { runScoped } from "@/lib/auth/context";
import { writeClinicalAudit, clientIp } from "./audit";

// Per-patient acceptance of the clinic's terms (W13-05, migration 0058).
//
// This is the SOLE legal basis for the 50% no-show fee line ever rendering. JP
// confirmed no existing signed document contains the fee rule, so no acceptance
// here means no fee line, whatever the global flag says. The gate itself lives
// in lib/reminders/fee-notice.ts; this module only supplies one of its inputs.
//
// APPEND-ONLY. There is deliberately no update and no delete helper, and adding
// one would not work: 0058 REVOKEs UPDATE/DELETE/TRUNCATE at the table and
// defines no UPDATE or DELETE policy, so the database refuses both regardless of
// what this file asks for. A legal record that application code can rewrite is
// not a legal record.
//
// EVERY READ AND WRITE GOES THROUGH `runScoped`, so RLS scopes by tenant and
// `auth.uid()` resolves - which matters more than usual here, because the INSERT
// policy pins `recorded_by` to `auth.uid()`. The value passed below is therefore
// checked by the database, not merely supplied by us: a caller who lied about
// the actor would be refused, not recorded.

/**
 * The terms document this build captures acceptance of.
 *
 * A DOCUMENT IDENTITY, NOT ITS TEXT. The accepted wording lives in the versioned
 * document the patient signs; copying it into every row would make each row a
 * stale duplicate of it. The column is free text precisely so the versioning
 * scheme can belong to the document rather than to this schema.
 *
 * WHEN THE TERMS CHANGE, ADD A NEW VALUE - never edit this one. Old rows keep
 * the version they were captured under, which is the entire reason 0058 is a
 * table with history rather than three columns on `patients`: "what did this
 * patient agree to in March" has to stay answerable after the terms move on.
 */
export const TERMS_VERSION = "2026-08" as const;

export type TermsAcceptance = {
  acceptedAt: string;
  termsVersion: string;
};

/**
 * The most recent acceptance for a patient, or null. Used for two different
 * things and it is worth keeping them distinct:
 *
 *   - the ficha shows it as CONTEXT, so staff can see the patient already
 *     accepted. It is NEVER used to pre-check the checkbox (LOOP 5 DoR: the box
 *     is never pre-checked, on create or on update).
 *   - `hasAcceptedTerms` reduces it to the boolean the fee gate consumes.
 */
export async function getLatestTermsAcceptance(
  ctx: RequestContext,
  patientId: string,
): Promise<TermsAcceptance | null> {
  assertCan(ctx.role, "clinical_records:read");
  return runScoped(ctx, async (tx) => {
    const rows = await tx
      .select({
        acceptedAt: patientTermsAcceptances.acceptedAt,
        termsVersion: patientTermsAcceptances.termsVersion,
      })
      .from(patientTermsAcceptances)
      .where(eq(patientTermsAcceptances.patientId, patientId))
      .orderBy(desc(patientTermsAcceptances.acceptedAt))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      acceptedAt: row.acceptedAt.toISOString(),
      termsVersion: row.termsVersion,
    };
  });
}

/**
 * Has this patient accepted the CURRENT terms version? One of the two inputs to
 * `shouldRenderFeeNotice`.
 *
 * VERSION-SPECIFIC ON PURPOSE. A patient who accepted an older version has not
 * accepted the current one, and treating "ever accepted anything" as sufficient
 * would announce a fee under terms the patient never saw - the same failure the
 * per-patient gate exists to prevent, one level down. The append-only history is
 * what makes this question answerable at all.
 */
export async function hasAcceptedTerms(
  ctx: RequestContext,
  patientId: string,
  termsVersion: string = TERMS_VERSION,
): Promise<boolean> {
  return runScoped(ctx, async (tx) => {
    const rows = await tx
      .select({ id: patientTermsAcceptances.id })
      .from(patientTermsAcceptances)
      .where(
        and(
          eq(patientTermsAcceptances.patientId, patientId),
          eq(patientTermsAcceptances.termsVersion, termsVersion),
        ),
      )
      .limit(1);
    return rows.length > 0;
  });
}

/**
 * Record one acceptance. Append-only: this always INSERTs, never upserts.
 *
 * A SECOND ROW FOR THE SAME VERSION IS NOT A BUG. 0058 carries no unique index,
 * deliberately - a patient re-accepting on a later visit is a real event, and
 * deduplicating would discard the evidence the table exists to keep.
 *
 * `recordedBy` is `ctx.userId`, the acting STAFF member. Never the patient: this
 * is a staff-side capture of something the patient did in the room, and an
 * acceptance with no attestable actor is worth nothing in a dispute. The RLS
 * INSERT policy re-checks it against `auth.uid()`.
 *
 * `acceptedAt` is supplied rather than defaulted so a paper acceptance recorded
 * later can carry the date it actually happened.
 */
export async function recordTermsAcceptance(
  ctx: RequestContext,
  input: { patientId: string; acceptedAt: Date; termsVersion?: string },
): Promise<void> {
  assertCan(ctx.role, "clinical_records:author");
  const ip = await clientIp();
  await runScoped(ctx, async (tx) => {
    await tx.insert(patientTermsAcceptances).values({
      tenantId: ctx.tenantId,
      patientId: input.patientId,
      acceptedAt: input.acceptedAt,
      termsVersion: input.termsVersion ?? TERMS_VERSION,
      recordedBy: ctx.userId,
    });
    // Rule 6: a permission-sensitive action writes an audit row. Identifiers and
    // a version string only - no clinical content, matching what the table
    // itself is allowed to hold.
    await writeClinicalAudit(tx, {
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      action: "patient_terms.accept",
      entityType: "patient",
      entityId: input.patientId,
      metadata: { termsVersion: input.termsVersion ?? TERMS_VERSION },
      ip,
    });
  });
}
