import "server-only";
import { eq } from "drizzle-orm";
import { users } from "@osteojp/db";
import { runScoped, type RequestContext } from "@/lib/auth/context";

/**
 * LE-staff-display-name-is-email-local-part — the name the staff header shows.
 *
 * ==========================================================================
 * THE DEFECT: THE SHELL INVENTED A HUMAN NAME FROM AN EMAIL ADDRESS.
 * ==========================================================================
 * `AppShell` derived its greeting from the session email claim, splitting the
 * local part on `. _ -` and title-casing the pieces. For `ana.morais@…` that
 * gives "Ana Morais" and looks like a feature. For the address a real invite
 * used it produced **"Boa noite, Chris+terapeuta2"** — the plus-tag and all —
 * on a clinic screen in a product whose tone is "serious, precise, not warm".
 *
 * IT IS THE SAME FAMILY AS INC-09, one surface over: a confident, specific,
 * WRONG rendering derived from data that was never a name. The owner's ruling
 * is explicit — do not invent a human name from an address.
 *
 * ==========================================================================
 * THE FIELD THE RULING ASKS FOR ALREADY EXISTS, WHICH IS WHY THIS IS SMALL.
 * ==========================================================================
 * The ruling asks for "an optional display-name field captured at invite or
 * editable in O meu perfil". `users.full_name` is exactly that and has been all
 * along: `StaffInviteForm` marks it REQUIRED, `updateOwnProfileAction` lets a
 * staff member change it, and `perfil/page.tsx` already reads it back.
 *
 * NOTHING WAS ADDED. No column, no migration, no new copy. The shell simply
 * reads the name the clinic already typed instead of guessing one from an
 * address it happens to hold in a token.
 *
 * ==========================================================================
 * WHY THE SHELL DID NOT READ IT, AND WHY THAT REASON EXPIRED
 * ==========================================================================
 * The original comment says "existing session data, no new data" — the shell
 * deliberately did no profile read, so the user cluster cost nothing. That was
 * a real constraint and it is gone: SEC-02 put a per-request `users` read in
 * this same component to enforce the password-rotation gate. The read is
 * already paid for; declining to use it would keep the guess for a saving that
 * no longer exists.
 *
 * FALLS BACK RATHER THAN THROWING, and this is the one place in this session's
 * work where a fallback is right. `requiresPasswordRotation` throws on a
 * missing row because it decides ACCESS; this decides a GREETING. Refusing to
 * render the shell because a name could not be read would take the whole
 * platform down over a cosmetic string. An empty result returns null and the
 * caller keeps the old behaviour.
 */
export async function staffDisplayName(ctx: RequestContext): Promise<string | null> {
  const rows = await runScoped(ctx, (tx) =>
    tx
      .select({ fullName: users.fullName })
      .from(users)
      .where(eq(users.id, ctx.userId))
      .limit(1),
  );
  const name = rows[0]?.fullName?.trim();
  return name ? name : null;
}

/**
 * Initials for the avatar, from whatever name is actually being displayed.
 *
 * TAKES THE DISPLAYED NAME rather than deriving its own from the email, so the
 * two can never disagree — an avatar reading "CT" beside a header reading
 * "Chris Silva" is its own small wrongness.
 */
export function initialsFor(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  return (
    parts
      .slice(0, 2)
      .map((p) => p.charAt(0).toUpperCase())
      .join("") || name.charAt(0).toUpperCase()
  );
}
