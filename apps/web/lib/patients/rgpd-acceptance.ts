import "server-only";
import { desc, eq } from "drizzle-orm";
import { assertCan, type RequestContext } from "@osteojp/auth";
import { patientRgpdAcceptances, type DbTx } from "@osteojp/db";
import { runScoped } from "@/lib/auth/context";
import { writeAudit } from "./audit";

// RGPD-01 — per-patient RGPD consent (migration NEXT-AFTER-0089).
//
// THE RULING (owner, Q-RGPD-NEW = b): the consent is ASKED AT CREATION and is
// NOT REQUIRED. A patient registered without it carries a visible "RGPD em
// falta" mark until it is recorded. Nothing is blocked by its absence.
//
// APPEND-ONLY, ENFORCED BY THE DATABASE, exactly as 0058 is: no UPDATE policy,
// no DELETE policy, and the migration REVOKEs UPDATE/DELETE/TRUNCATE at the
// table so a policy added later by mistake still cannot write. There is
// deliberately no update and no delete helper here, and adding one would not
// work — the database refuses both regardless of what this file asks for.
//
// EVERY READ AND WRITE GOES THROUGH `runScoped`, so RLS scopes by tenant and
// `auth.uid()` resolves. That matters more than usual: the INSERT policy pins
// `recorded_by` to `auth.uid()`, so the actor below is CHECKED by the database
// rather than merely supplied by us.

/**
 * The RGPD text this build captures consent to.
 *
 * A DOCUMENT IDENTITY, NOT ITS TEXT. The wording lives in
 * `clinical.consent.rgpd.body` (packages/i18n), which is the ratified,
 * legally-approved paragraph; copying it into every row would make each row a
 * stale duplicate of it.
 *
 * THIS LABEL HAS REAL TEXT FROM DAY ONE, and that is the difference from
 * `TERMS_VERSION`. 0058's label ledger exists because acceptances were recorded
 * under `2026-08` while NO document text existed, so a document later published
 * under that name would retroactively make every old row a claim about text
 * nobody had written. That hazard is absent here only because the wording
 * already exists and is versioned from the first row.
 *
 * WHEN THE RGPD WORDING CHANGES, ADD A NEW VALUE — never edit this one. Old
 * rows keep the version they were captured under, which is the entire reason
 * this is a table with history rather than two columns on `patients`.
 */
export const RGPD_VERSION = "rgpd-v1-2026" as const;

export type RgpdAcceptance = {
  acceptedAt: string;
  rgpdVersion: string;
};

/**
 * The most recent RGPD consent for a patient, or null.
 *
 * NULL IS THE BADGE. "RGPD em falta" is the absence of a row, not a stored
 * flag, which is what makes every existing patient read correctly without a
 * backfill and without a single row being touched by the migration.
 *
 * `patients:read` rather than `clinical_records:read`: this is an
 * administrative fact shown on the ficha header, and every staff role that can
 * open a patient can see whether their consent is on file. The RLS SELECT
 * policy is tenant-scoped and re-checks it in the database.
 */
export async function getLatestRgpdAcceptance(
  ctx: RequestContext,
  patientId: string,
): Promise<RgpdAcceptance | null> {
  assertCan(ctx.role, "patients:read");
  return runScoped(ctx, async (tx) => {
    const rows = await tx
      .select({
        acceptedAt: patientRgpdAcceptances.acceptedAt,
        rgpdVersion: patientRgpdAcceptances.rgpdVersion,
      })
      .from(patientRgpdAcceptances)
      .where(eq(patientRgpdAcceptances.patientId, patientId))
      .orderBy(desc(patientRgpdAcceptances.acceptedAt))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      acceptedAt: row.acceptedAt.toISOString(),
      rgpdVersion: row.rgpdVersion,
    };
  });
}

/**
 * Record one consent INSIDE AN EXISTING TRANSACTION.
 *
 * IT TAKES A `tx` FOR THE SAME REASON `insertPatientTx` DOES. The consent is
 * captured on the create form, so the row and the patient it belongs to must
 * commit or roll back together: a crash between them would leave either a
 * patient whose ticked consent was never recorded, or a consent row pointing at
 * a patient that does not exist. One transaction removes both states.
 *
 * APPEND-ONLY: this always INSERTs, never upserts. A second row for the same
 * version is not a bug — the migration carries no unique index, deliberately.
 *
 * `recordedBy` is the acting STAFF member, never the patient: this is a
 * staff-side capture of a form the patient signed in the room. The RLS INSERT
 * policy re-checks it against `auth.uid()`.
 *
 * `acceptedAt` is supplied rather than defaulted so a form signed earlier and
 * typed in later carries the date it was actually signed.
 */
export async function insertRgpdAcceptanceTx(
  tx: DbTx,
  ctx: RequestContext,
  input: { patientId: string; acceptedAt: Date; rgpdVersion?: string },
): Promise<void> {
  const rgpdVersion = input.rgpdVersion ?? RGPD_VERSION;
  await tx.insert(patientRgpdAcceptances).values({
    tenantId: ctx.tenantId,
    patientId: input.patientId,
    acceptedAt: input.acceptedAt,
    rgpdVersion,
    recordedBy: ctx.userId,
  });
  // Hard rule 6: a permission-sensitive write gets an audit row, in the SAME
  // tx. Hard rule 7: identifiers and a version string only — no clinical
  // content and no PII, matching what the table itself is allowed to hold.
  await writeAudit(tx, ctx, {
    action: "patient.rgpd_accept",
    entityId: input.patientId,
    metadata: { rgpdVersion },
  });
}
