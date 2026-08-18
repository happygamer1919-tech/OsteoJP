import "server-only";
import { eq } from "drizzle-orm";
import { users } from "@osteojp/db";
import { runScoped, type RequestContext } from "@/lib/auth/context";

/**
 * SEC-02 — is this account still holding the TEMPORARY password its invite
 * issued?
 *
 * ==========================================================================
 * THE DEFECT, observed on deployed production 2026-08-18.
 * ==========================================================================
 * The invite flow mints a temporary password and shows it on a screen for an
 * admin to relay. First login accepted it and logged straight in - no
 * set-password step, no prompt - so the temporary credential silently became
 * the account's permanent password.
 *
 * That is acceptable only while such a credential's life ends at first use.
 * Without rotation the relay channel (spoken, messaged, pasted) becomes the
 * password, and everyone who ever saw it keeps access to a clinical system.
 * Under R9 it is the WHOLE onboarding path, not a fallback, because
 * INVITES_LIVE_SEND is off and no invite email is sent at all.
 *
 * ==========================================================================
 * THIS IS A VERDICT PATH. AN UNHANDLED STATE FAILS; IT NEVER FALLS THROUGH.
 * ==========================================================================
 * PORTAL-REHYDRATE 1.3, and it is the whole reason this function throws rather
 * than returning a boolean with a convenient default.
 *
 * The tempting shape is `return row?.mustSetPassword ?? false` - one line, and
 * it maps EVERY failure onto "this password is fine": a user id with no row, an
 * RLS refusal, a query error, a schema that has not been migrated yet. Each of
 * those is a different problem and all four would read as "let them in", which
 * is precisely the answer that makes the guard look like it passed.
 *
 * So a missing row THROWS. An authenticated session whose `sub` matches no
 * staff row is not a normal state - it is a deleted user holding a live token,
 * or a tenant mismatch - and neither should be silently admitted.
 */
export class PasswordRotationUnknownError extends Error {
  constructor(userId: string) {
    // Ids are not PII (CLAUDE.md rule 7). No email, no name, no password.
    super(
      `password-rotation: no staff row for the authenticated user ${userId}. ` +
        "Refusing to decide whether a rotation is required rather than assuming it is not.",
    );
    this.name = "PasswordRotationUnknownError";
  }
}

/**
 * READ LIVE, ON EACH REQUEST, and that is the design rather than an oversight.
 *
 * The rejected alternative was a flag on the Supabase auth user, carried in the
 * JWT. It needs no migration and it is wrong for a reason that only shows up
 * once somebody uses it: a token is minted at sign-in and stays STALE until it
 * refreshes, so the staffer who has JUST set their new password still presents
 * a token demanding they set one. The guard would send them back to the screen
 * they had finished, forever. A column read live cannot do that.
 *
 * RLS-scoped via `runScoped`, and filtered to `ctx.userId`, so this can only
 * ever answer for the caller's own row.
 */
export async function requiresPasswordRotation(ctx: RequestContext): Promise<boolean> {
  const rows = await runScoped(ctx, (tx) =>
    tx
      .select({ mustSetPassword: users.mustSetPassword })
      .from(users)
      .where(eq(users.id, ctx.userId))
      .limit(1),
  );

  const row = rows[0];
  if (!row) throw new PasswordRotationUnknownError(ctx.userId);
  return row.mustSetPassword === true;
}

/**
 * Clear the marker. Called by the password-change action AFTER the provider has
 * accepted the new password, never before.
 *
 * ORDER MATTERS AND IS NOT INTERCHANGEABLE. Clearing first and updating second
 * would release the account from the guard on a change that then failed - the
 * temporary password would still work and nothing would ask again.
 */
export async function clearPasswordRotationFlag(ctx: RequestContext): Promise<void> {
  await runScoped(ctx, (tx) =>
    tx.update(users).set({ mustSetPassword: false }).where(eq(users.id, ctx.userId)),
  );
}
