/* ====================================================================== */
/* The optional email on a public booking request: ONE rule, in ONE place. */
/* ====================================================================== */
/*
 * THE RULING (strategy S-1004-A R40, 2026-10-04). The public form gains one
 * optional field, "Email (opcional)", "Para receber a confirmação da
 * marcação". The address is stored on `guest_booking_requests.email` (0101)
 * and carried to the patient when reception converts the request.
 *
 * WHY THE RULE LIVES BESIDE THE SCHEMA AND NOT IN EITHER APP. Three places
 * decide whether a typed value is an email: the portal's server action (so the
 * visitor is told which step to fix), the API route (the real boundary) and
 * the staff app's patient form (apps/web/lib/patients/validation.ts, where the
 * address ends up). A value one of them admits and another refuses is a
 * request that arrives and cannot be converted. So the portal and the API both
 * call THIS function, and its pattern is the staff app's pattern, character
 * for character: `tests/guest-email.test.ts` reads that file and fails if the
 * two ever differ.
 *
 * THE DATABASE IS LOOSER ON PURPOSE. 0101's CHECK admits every value this
 * admits (the DB-gated suite proves it) and a few it refuses (a no-break
 * space). It is a backstop, never a second validator.
 *
 * NEVER LOG WHAT THIS IS GIVEN. An email address is personal data. The result
 * carries the address for the caller to store; a refusal carries nothing, so a
 * caller cannot echo the rejected value by accident.
 */

/** The staff app's bound: `optionalText(v, "email", 320)`. */
export const GUEST_EMAIL_MAX = 320;

/** The staff app's `EMAIL_RE`, character for character. */
export const GUEST_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type GuestEmailResult = { ok: true; email: string | null } | { ok: false };

/**
 * What a typed or posted value means.
 *
 *   absent, null, or only whitespace  ->  ok, no email (stored as NULL)
 *   a string that is an email         ->  ok, trimmed
 *   anything else                     ->  not ok
 *
 * "Anything else" includes a non-string, so a hand-rolled client posting
 * `{ "email": 1 }` or an array is refused rather than coerced.
 */
export function parseGuestEmail(value: unknown): GuestEmailResult {
  if (value === undefined || value === null) return { ok: true, email: null };
  if (typeof value !== "string") return { ok: false };
  const trimmed = value.trim();
  if (trimmed.length === 0) return { ok: true, email: null };
  if (trimmed.length > GUEST_EMAIL_MAX) return { ok: false };
  if (!GUEST_EMAIL_PATTERN.test(trimmed)) return { ok: false };
  return { ok: true, email: trimmed };
}
