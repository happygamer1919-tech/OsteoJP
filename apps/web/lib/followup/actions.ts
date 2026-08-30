"use server";

import { revalidatePath } from "next/cache";
import { sql } from "drizzle-orm";
import { assertCan } from "@osteojp/auth";
import { patientFollowupPostponements } from "@osteojp/db";

import { requireRequestContext, runScoped } from "@/lib/auth/context";
import { assertFollowupPatientInScope, followupLocationScope, FollowupScopeError } from "./scope";
import { POSTPONE_WEEKS, isPostponeWeeks } from "./postpone-weeks";

/**
 * RB-01 — the mutations behind the recuperacao list.
 *
 * ==========================================================================
 * THERE WERE THREE. THE THIRD MOVED, AND IT IS NOT A FOURTH.
 * ==========================================================================
 * `recordFollowupContact` used to live here as a Server Action. It is now
 * `apps/web/app/api/followup/contact/route.ts`, over the ONE definition in
 * `lib/followup/record-contact.ts`, and the route handler's own header carries
 * the full reasoning. The short version: that write is issued by a click that
 * ALSO navigates, and a Server Action cannot be marked `keepalive`, so whether
 * the request survived the navigation was left to the browser. On 2026-08-28 it
 * did not.
 *
 * IT IS GONE FROM HERE RATHER THAN KEPT AS A SECOND DOOR. Two entry points to
 * one write is how the two come to disagree, and there is exactly one caller.
 *
 * WHAT STAYS HERE ARE THE TWO THAT DO NOT NAVIGATE - postpone and revoke - and
 * that is not a coincidence: they are invoked from ordinary buttons, so a
 * Server Action's transport is entirely adequate for them. `postponeFollowup`
 * working on the owner's screen in the same sitting where the contact mark
 * failed is what isolated the defect to the navigation.
 *
 * EVERY ONE RE-DERIVES THE ACTOR FROM THE VERIFIED SESSION and never takes a
 * user id from the caller. These are "use server" functions, so their arguments
 * are attacker-controlled by construction: anything the browser could supply is
 * treated as a request, not as a fact.
 *
 * ==========================================================================
 * AND FROM 2026-08-27 EVERY ONE CHECKS THE PATIENT, NOT ONLY THE CAPABILITY.
 * ==========================================================================
 * They used to check `followup:read` and stop, which was sound only while every
 * holder of that capability could see every patient. The owner ruling granting
 * therapists a SCOPED list ends that: without a per-patient check, the
 * capability would carry unscoped WRITE access behind a scoped READ, and the
 * `patientId` argument is the thing the header above already says is
 * attacker-controlled.
 *
 * `assertFollowupPatientInScope` (in `./scope`) is the one definition, and the
 * rule it states is the one a reader expects: you may act on a patient exactly
 * when you could have seen them on the list.
 *
 * NONE OF THEM SENDS A MESSAGE. `recordFollowupContact` records that a human
 * pressed a link on their own device. It is a marker, not a delivery receipt,
 * and the difference is written on the screen as well as here — see §"what the
 * tick means" in `followup-list.tsx`.
 */

/*
 * POSTPONE_WEEKS AND ITS GUARD MOVED OUT, and they must not come back. INC-13.
 *
 * Every export of a "use server" module must be an async function - Next.js
 * makes each one a callable server-action endpoint, and a plain value has none.
 * `export const POSTPONE_WEEKS = [...]` right here is what raised E352 on
 * POST /recuperacao (Sentry OSTEOJP-WEB-2). They now live in the plain module
 * ./postpone-weeks, which the client component imports too.
 *
 * THIS FILE MAY EXPORT ASYNC FUNCTIONS AND NOTHING ELSE.
 */

/**
 * Postpone a patient out of the list for N weeks.
 *
 * THE ROW IS THE RECORD AND THE PREDICATE AT ONCE. `postponed_until` is stored
 * as an instant rather than a week count precisely so the list's clause is a
 * comparison — see 0067's own comment on the column. Computing the instant here
 * and storing arithmetic there would put the same rule in two places.
 */
export async function postponeFollowup(patientId: string, weeks: number): Promise<void> {
  const ctx = await requireRequestContext();
  assertCan(ctx.role, "followup:read");
  if (!isPostponeWeeks(weeks)) {
    throw new Error(`postponeFollowup: ${weeks} is not one of ${POSTPONE_WEEKS.join(", ")}`);
  }

  const until = new Date(Date.now() + weeks * 7 * 24 * 60 * 60 * 1000);
  const locationScope = await followupLocationScope(ctx);

  await runScoped(ctx, async (tx) => {
    await assertFollowupPatientInScope(tx, ctx, patientId, locationScope);
    await tx.insert(patientFollowupPostponements).values({
      tenantId: ctx.tenantId,
      patientId,
      postponedUntil: until,
      createdBy: ctx.userId,
    });
  });

  revalidatePath("/recuperacao");
}

/**
 * Bring a postponed patient back to the list.
 *
 * IT RECORDS THE REVERSAL RATHER THAN DELETING THE ROW, which is the card's
 * requirement and also the only shape 0067 permits: `authenticated` holds no
 * DELETE on this table, so a handler that tried would fail at the database
 * gate. Both halves are written together because the CHECK constraint refuses a
 * row carrying a revoker and no time.
 *
 * SCOPED TO ROWS THIS TENANT CAN SEE by RLS, and to ACTIVE rows by the WHERE.
 * Revoking an already-revoked postponement would otherwise overwrite the name
 * of whoever really reversed it.
 *
 * THE ARGUMENT IS A POSTPONEMENT ID, NOT A PATIENT ID, so the scope check needs
 * one extra step: read whose postponement it is, then ask whether this viewer
 * may act on that patient. The read happens INSIDE the same transaction and
 * selects the patient id alone — it is a lookup for the guard, never a way to
 * see a row the guard is about to refuse.
 *
 * A MISSING OR ALREADY-REVOKED ROW TAKES THE SAME BRANCH AS AN OUT-OF-SCOPE
 * ONE. Distinguishing them would tell a caller that some postponement id exists
 * at this clinic, which is the existence oracle `scope.ts` refuses to be.
 */
export async function revokeFollowupPostponement(postponementId: string): Promise<void> {
  const ctx = await requireRequestContext();
  assertCan(ctx.role, "followup:read");
  const locationScope = await followupLocationScope(ctx);

  await runScoped(ctx, async (tx) => {
    const [row] = await tx
      .select({ patientId: patientFollowupPostponements.patientId })
      .from(patientFollowupPostponements)
      .where(
        sql`${patientFollowupPostponements.id} = ${postponementId}
            AND ${patientFollowupPostponements.revokedAt} IS NULL`,
      )
      .limit(1);
    if (!row) throw new FollowupScopeError();
    await assertFollowupPatientInScope(tx, ctx, row.patientId, locationScope);

    await tx
      .update(patientFollowupPostponements)
      .set({ revokedBy: ctx.userId, revokedAt: new Date() })
      .where(
        sql`${patientFollowupPostponements.id} = ${postponementId}
            AND ${patientFollowupPostponements.revokedAt} IS NULL`,
      );
  });

  revalidatePath("/recuperacao");
}
