import "server-only";
import { and, eq, sql, type SQL } from "drizzle-orm";
import { followupOwnPatientClause, patients, type DbTx } from "@osteojp/db";

import type { RequestContext } from "@/lib/auth/context";
import { viewerLocationScope } from "@/lib/auth/viewer-locations";
import { patientLocationScope } from "@/lib/patients/scope";
import { therapistScope } from "./queries";

/**
 * ==========================================================================
 * THE MUTATION GUARD: is this patient one this viewer may act on at all?
 * ==========================================================================
 * Owner ruling 2026-08-27 grants therapists /recuperacao scoped to their own
 * patients. That ruling is about a LIST, and it would be worth nothing without
 * this file.
 *
 * WHY. The three mutations behind the list — `postponeFollowup`,
 * `revokeFollowupPostponement`, `recordFollowupContact` — are `"use server"`
 * functions taking a `patientId` (or a postponement id) FROM THE CALLER. Their
 * own header already says it: "their arguments are attacker-controlled by
 * construction". They check `followup:read` and nothing else. So granting a
 * therapist that capability without this guard would give every therapist write
 * access to the follow-up state of EVERY patient in the tenant — postpone
 * anyone out of reception's call list, mark anyone contacted — while the screen
 * showed them six of their own.
 *
 * That is not a scoped grant. It is an unscoped one with a filtered view, which
 * is precisely what the ruling forbids in the sentence "never by hiding rows
 * client-side" — the same principle, one layer down.
 *
 * ==========================================================================
 * IT ENFORCES THE VIEWER'S WHOLE SCOPE, NOT ONLY THE THERAPIST HALF
 * ==========================================================================
 * A therapist-only check would have been smaller and would have left a hole
 * that predates this ruling: `patientLocationScope` bounds what a LOCATED
 * receptionist or admin can SEE, and nothing bounded what they could WRITE. A
 * receptionist at Castelo Branco could postpone a Linda-a-Velha patient by id.
 *
 * That is fixed here rather than carded, because the alternative is a guard that
 * enforces one of the page's two scopes and silently declines the other — and
 * the next reader would have no way to tell that was deliberate. The rule this
 * file states is the one a reader expects: **you may act on a patient exactly
 * when you could have seen them on the list.**
 *
 * ==========================================================================
 * `not_found`, NEVER `forbidden`
 * ==========================================================================
 * Same choice `assertTargetInScheduleScope` makes: a patient outside the scope
 * is indistinguishable from a patient who does not exist. `forbidden` would
 * confirm that a given uuid is a real patient at this clinic, which turns the
 * action into an existence oracle for anyone who can call it.
 */
export class FollowupScopeError extends Error {
  constructor() {
    super("not_found");
    this.name = "FollowupScopeError";
  }
}

/**
 * Throw unless `patientId` is inside this viewer's follow-up scope.
 *
 * RUNS INSIDE THE CALLER'S `runScoped` TRANSACTION, so RLS has already bounded
 * it to the tenant and this only has to answer the intra-tenant question. A
 * separate connection would ask the same question against a different snapshot,
 * which is how a check and the write it guards come to disagree.
 *
 * THE SELECT IS `1`, NOT THE PATIENT ROW. This function decides admission and
 * must never become a way to READ a patient it is about to refuse.
 */
export function followupScopeConditions(
  ctx: RequestContext,
  patientId: string,
  locationScope: string[] | null,
): SQL[] {
  const conds: SQL[] = [eq(patients.id, patientId)];
  if (locationScope) conds.push(patientLocationScope(patients.id, locationScope));

  const own = therapistScope(ctx);
  if (own) {
    /**
     * THE SAME CLAUSE THE LIST USES, imported rather than restated, and this is
     * the third reader of it. A hand-written "did I see this patient" predicate
     * here would be the drift shape `LE-apply-block-expectation-drift` was
     * carded for: it would agree with the list on the day it was written and
     * diverge on the first change to the rule, going green while admitting
     * patients the list would never have shown.
     *
     * Only `$4` appears in this clause, so only `$4` is bound. The window
     * placeholders are not in the text and there is nothing to substitute for
     * them.
     */
    conds.push(
      sql.join(
        followupOwnPatientClause('"patients"."id"')
          .split(/(\$4)/g)
          .map((part) => (part === "$4" ? sql`${own}::uuid` : sql.raw(part))),
        sql``,
      ),
    );
  }
  return conds;
}

export async function assertFollowupPatientInScope(
  tx: DbTx,
  ctx: RequestContext,
  patientId: string,
  locationScope: string[] | null,
): Promise<void> {
  if (!patientId) throw new FollowupScopeError();

  const conds = followupScopeConditions(ctx, patientId, locationScope);

  const [hit] = await tx
    .select({ ok: sql<number>`1` })
    .from(patients)
    .where(and(...conds))
    .limit(1);

  if (!hit) throw new FollowupScopeError();
}

/** Resolve the location half of the scope. Extracted so an action resolves it
 *  ONCE, before its transaction, the way every other caller of
 *  `viewerLocationScope` does — it opens its own scoped tx. */
export async function followupLocationScope(ctx: RequestContext): Promise<string[] | null> {
  return viewerLocationScope(ctx);
}

