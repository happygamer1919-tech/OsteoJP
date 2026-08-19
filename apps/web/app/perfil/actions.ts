"use server";

// W6-02 (b) - self-service profile actions. Available to EVERY authenticated
// role for their OWN account only. Own-account scoping is enforced SERVER-SIDE
// from the request context: the actions read the actor's own user id from
// requireRequestContext() and never accept a target user id from the client, so
// a user can only ever edit themselves (the users RLS policy is tenant-scoped,
// not per-row, so this app-layer scope is the own-row guard). Both mutations are
// audited (rule 6); no secret is ever logged (rule 7).

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { users } from "@osteojp/db";
import { requireRequestContext, runScoped } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/admin/audit";
// Reuse the shared invite/set-password strength precheck (W6-02).
import { validatePassword } from "../auth/update-password/password";
import { clearPasswordRotationFlag } from "@/lib/auth/password-rotation";

export type ProfileActionError = "validation" | "password_policy" | "error";
export type ProfileActionResult = { ok: true } | { ok: false; error: ProfileActionError };

/**
 * Update the ACTOR's own display name. Writes only the row whose id is the
 * request-context user id; there is no parameter to target another user, so a
 * client can never edit a foreign account. Audited.
 */
export async function updateOwnProfileAction(fullName: string): Promise<ProfileActionResult> {
  const ctx = await requireRequestContext();
  const name = fullName.trim();
  if (name.length === 0 || name.length > 200) return { ok: false, error: "validation" };
  try {
    await runScoped(ctx, async (tx) => {
      // Self-scoped by construction: eq(users.id, ctx.userId). No client id.
      await tx.update(users).set({ fullName: name }).where(eq(users.id, ctx.userId));
      await writeAudit(tx, ctx, {
        action: "user.profile.update",
        entityType: "user",
        entityId: ctx.userId,
        // PII-free: a flag only, never the name value.
        metadata: { changed: "full_name" },
      });
    });
    revalidatePath("/perfil");
    return { ok: true };
  } catch (e) {
    console.error("profile: updateOwnProfile failed", e instanceof Error ? e.name : "unknown");
    return { ok: false, error: "error" };
  }
}

/**
 * Change the ACTOR's own password. Uses the authenticated server-side Supabase
 * session (which IS the actor), so it can only ever change the caller's own
 * password - no user id crosses the wire. Reuses the shared password-strength
 * precheck; Supabase Auth applies the authoritative project policy. Audited
 * (the FACT only; the password is never logged).
 */
export async function changeOwnPasswordAction(
  password: string,
  confirm: string,
): Promise<ProfileActionResult> {
  const ctx = await requireRequestContext();
  if (validatePassword(password, confirm) !== null) return { ok: false, error: "validation" };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    // Session expired mid-flow, or the password failed Supabase's own policy.
    console.error("profile: changeOwnPassword failed", error.name);
    return { ok: false, error: "password_policy" };
  }

  // SEC-02: the temporary password is now gone, so release the account from the
  // rotation guard.
  //
  // AFTER the provider accepted the change, never before: clearing first would
  // free the account on a change that then failed, leaving the temporary
  // password working and nothing left to ask again.
  //
  // NOT wrapped in the best-effort try below, and that is deliberate. A failed
  // AUDIT write must not report failure to a user whose password really did
  // change. A failed FLAG clear is different in kind - it leaves the person
  // locked to this screen after doing exactly what was asked, which they cannot
  // diagnose and cannot escape. It surfaces.
  await clearPasswordRotationFlag(ctx);

  try {
    await runScoped(ctx, (tx) =>
      writeAudit(tx, ctx, {
        action: "user.password.change",
        entityType: "user",
        entityId: ctx.userId,
        metadata: {},
      }),
    );
  } catch (e) {
    // The password DID change; a failed audit write must not report failure to
    // the user. Log the audit miss (name only) and still succeed.
    console.error("profile: password-change audit failed", e instanceof Error ? e.name : "unknown");
  }
  return { ok: true };
}
