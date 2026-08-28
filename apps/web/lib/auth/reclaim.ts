import "server-only";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { toClaims } from "@osteojp/auth";
import { auditLog, patients, users, withTenantContext } from "@osteojp/db";

import type { RequestContext } from "./context";

/**
 * ==========================================================================
 * LE-staff-delete-leaves-auth-user — RECLAIMING AN ORPHANED STAFF LOGIN.
 * ==========================================================================
 * THE DEFECT. `deleteStaffMember` removes therapist_services,
 * availability_templates, time_off and the `public.users` row. It never deletes
 * the Supabase auth user. The orphan cannot USE the platform — no staff row
 * means no claims and every route fails closed — but it HOLDS THE ADDRESS
 * FOREVER: `createUser` then answers `auth_email_taken`, and the one case the
 * delete exists for, a mistyped or wrong-role invite, is exactly the case it
 * breaks. There is no path in the product to clear it.
 *
 * ==========================================================================
 * WHY THIS RECLAIMS INSTEAD OF DELETING, WHICH IS THE SHAPE THAT WAS CHOSEN
 * ==========================================================================
 * The obvious fix is to make the delete remove the auth user too. That is a
 * delete which must succeed in TWO SYSTEMS WITH NO TRANSACTION between them,
 * and a half-succeeding delete is worse than one that refuses: the staff row is
 * gone and the credential is live, or the credential is gone and the row is
 * orphaned in the other direction. The shape that created this defect is
 * precisely a two-system write with no way to make both true.
 *
 * Reclaiming moves the work to the moment somebody actually needs it — the
 * re-invite — where there is a person present, a clear intent, and one system
 * at a time.
 *
 * ==========================================================================
 * THE CANDIDATE SET IS CLOSED, AND THAT IS THE WHOLE SECURITY ARGUMENT.
 * ==========================================================================
 * The obvious predicate is "an auth user exists for this email and no
 * `public.users` row references it, therefore it is an orphan". THAT PREDICATE
 * IS DANGEROUS AND IT WAS REJECTED, because it is open at both ends:
 *
 *   A PORTAL PATIENT HAS AN AUTH USER AND NO `users` ROW. The schema says so on
 *   the column itself: "A patient is a DISTINCT principal from a staff `users`
 *   row: there is no users row for a patient." So every patient with a portal
 *   login would be classified as a reclaimable orphan. An admin could invite
 *   staff using a patient's email, have the password reset onto that identity,
 *   and take over the patient's portal login — locking the patient out of their
 *   own clinical record. That is a severe escalation CREATED BY THE FIX.
 *
 *   AND THE SET IS OPEN. Any future table that links an auth identity re-opens
 *   the hole silently, and the failure is invisible until somebody is locked
 *   out of their account.
 *
 * SO THE SET IS BUILT FROM THE OTHER DIRECTION: only an identity THIS TENANT
 * CREATED AS STAFF AND THEN DELETED is ever a candidate. That set is enumerable
 * without guessing, because `deleteStaffMember` writes an audit row that
 * SURVIVES the delete — `action: "staff.delete"`, `entityType: "user"`,
 * `entityId: <the auth id>` — and audit rows are never removed, which is the
 * reason the delete refuses an account with any activity in the first place.
 *
 * A patient's auth id is never in that set. Another tenant's live user is never
 * in it. A future auth-linked table cannot put anything in it. The set is
 * CLOSED by construction rather than by a list of exclusions that has to be
 * maintained.
 *
 * ==========================================================================
 * NO MIGRATION, AND THAT WAS A CONSTRAINT RATHER THAN A PREFERENCE.
 * ==========================================================================
 * `audit_log`, `entity_id`, `action` and GoTrue's `getUserById` all exist
 * today. Two alternatives WOULD have needed one and are recorded on the card:
 * a table recording deleted staff identities by address, and
 * `GRANT SELECT ON auth.users TO service_role` — measured against a live
 * Supabase Postgres, where `service_role` is refused on `auth.users` with
 * "permission denied for table users" while `postgres` reads it.
 */

/**
 * How many of this tenant's staff deletions are considered, most recent first.
 *
 * BOUNDED RATHER THAN COMPLETE, and the bound is stated instead of being a
 * silent `LIMIT`. This runs on the invite path, only after `auth_email_taken`,
 * and each candidate costs one GoTrue read. A clinic that has deleted more than
 * this many staff accounts and is re-inviting the very oldest of them gets
 * today's refusal, which is the same answer it gets now — never a wrong
 * reclaim.
 */
export const RECLAIM_CANDIDATE_LIMIT = 100;

/** The one GoTrue call this module makes, as a type, so the caller injects it
 *  and a test can drive the real database against a fake auth service. */
export type AuthUserReader = (
  id: string,
) => Promise<{ id: string; email: string | null } | null>;

/**
 * The auth id this tenant may reclaim for `email`, or null.
 *
 * THE EMAIL MUST STILL MATCH ON THE AUTH SIDE. The audit row records an id, not
 * an address (metadata is PII-free by rule 7, and rightly). So the address is
 * confirmed against GoTrue, which is also what stops a recycled id being taken:
 * if that identity now holds a different address, it is not ours to reclaim.
 *
 * Comparison is case-insensitive and trimmed, because an invite form and a
 * provider store disagree about case far more often than about identity.
 */
export async function findReclaimableStaffAuthId(
  actor: RequestContext,
  email: string,
  readAuthUser: AuthUserReader,
): Promise<string | null> {
  const wanted = email.trim().toLowerCase();
  if (!wanted) return null;

  const candidates = await withTenantContext(toClaims(actor), async (tx) => {
    // THIS TENANT'S OWN DELETIONS. RLS scopes it; no privileged read, no
    // cross-tenant query, and nothing about another clinic is observable.
    const deleted = await tx
      .select({ id: auditLog.entityId })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.tenantId, actor.tenantId),
          eq(auditLog.action, "staff.delete"),
          eq(auditLog.entityType, "user"),
          isNotNull(auditLog.entityId),
        ),
      )
      .orderBy(desc(auditLog.createdAt))
      .limit(RECLAIM_CANDIDATE_LIMIT);

    const ids = [...new Set(deleted.map((d) => d.id).filter((v): v is string => !!v))];
    if (ids.length === 0) return [];

    /**
     * STILL DELETED, AND STILL NOT A PATIENT. Two cheap in-tenant checks, and
     * neither is redundant with the audit row:
     *
     *   a `users` row means the account was RE-CREATED at this id since the
     *   delete (`attachAuthLogin` keys a login to an existing row's id), so it
     *   is live and must not be touched;
     *
     *   `patients.auth_user_id` means the identity has since been claimed by a
     *   patient. Not reachable today, and checked anyway: the cost is one
     *   predicate and the failure it prevents is a patient losing their portal
     *   login. Defending against the impossible is only wasteful when the
     *   impossible is cheap to be wrong about.
     */
    const live = await tx.select({ id: users.id }).from(users);
    const liveIds = new Set(live.map((u) => u.id));
    const claimed = await tx
      .select({ id: patients.authUserId })
      .from(patients)
      .where(isNotNull(patients.authUserId));
    const claimedIds = new Set(claimed.map((p) => p.id).filter((v): v is string => !!v));

    return ids.filter((id) => !liveIds.has(id) && !claimedIds.has(id));
  });

  for (const id of candidates) {
    const authUser = await readAuthUser(id);
    if (!authUser) continue; // already gone from auth: nothing to reclaim.
    if ((authUser.email ?? "").trim().toLowerCase() === wanted) return id;
  }
  return null;
}
