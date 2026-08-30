/**
 * The postponement lengths reception may choose, in weeks.
 *
 * ==========================================================================
 * WHY THIS IS ITS OWN FILE, AND IT IS NOT TIDINESS. INC-13, Sentry
 * OSTEOJP-WEB-2, error E352 on POST /recuperacao.
 * ==========================================================================
 * These three symbols lived in `actions.ts`, which begins `"use server"`.
 * EVERY export of a "use server" module must be an async function: Next.js
 * turns each one into a callable server-action endpoint, and a plain value has
 * no endpoint to become. `export const POSTPONE_WEEKS = [...]` is therefore a
 * build/runtime error, and it is the E352 Sentry reported.
 *
 * The type export beside it was always harmless (types are erased before the
 * directive means anything). The `const` was not.
 *
 * A PLAIN MODULE IS THE FIX, not a rename and not an inline literal: the value
 * has to be readable from BOTH sides. `actions.ts` validates against it on the
 * server, and `followup-list.tsx` renders one button per entry on the client.
 *
 * IT ALSO CLOSES A DUPLICATE. Before this file existed, `followup-list.tsx`
 * carried its own `const POSTPONE_CHOICES = [2, 4, 8, 12] as const` - a second
 * copy of a closed set whose whole purpose is to be closed. The screen offering
 * a length the server then rejects is the drift this codebase keeps
 * cataloguing, and two literals four files apart is how it arrives. One
 * definition, imported by both.
 *
 * A CLOSED SET, NOT A FREE NUMBER. A text field would admit 0 (a postponement
 * that does nothing), 5200 (a deletion wearing a postponement's clothes) and
 * every typo between. The card asks for "postpone N weeks"; these are the N.
 */
export const POSTPONE_WEEKS = [2, 4, 8, 12] as const;

export type PostponeWeeks = (typeof POSTPONE_WEEKS)[number];

/** Narrowing guard, beside the set it narrows to. */
export function isPostponeWeeks(n: number): n is PostponeWeeks {
  return (POSTPONE_WEEKS as readonly number[]).includes(n);
}
