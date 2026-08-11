import type { StringKey } from "@osteojp/i18n";

/**
 * LE-staff-no-forgot-password - the rules behind the staff recovery request,
 * as pure functions.
 *
 * They live outside the component for the reason `link-params.ts` and
 * `password.ts` do: the properties that matter here are decidable without a
 * browser, and apps/web has no jsdom. A rule that can only be exercised through
 * a rendered click is a rule that ends up asserted by a source scan or not at
 * all.
 */

/**
 * The same shape the login screen validates against
 * (`apps/web/app/login/page.tsx`). Deliberately loose: this is a typo catcher,
 * not an address verifier. Anything stricter rejects real addresses, and the
 * only authority on whether an address exists is Supabase - which, by design,
 * does not tell us.
 */
const EMAIL_SHAPE = /.+@.+\..+/;

/**
 * `null` means "send it". Any other value is an i18n key for an inline field
 * error, and describes the CALLER's own typing - never anything about the
 * account behind the address.
 */
export function validateRecoveryEmail(email: string): StringKey | null {
  const trimmed = email.trim();
  if (!trimmed) return "auth.forgotPassword.errEmailRequired";
  if (!EMAIL_SHAPE.test(trimmed)) return "auth.forgotPassword.errEmailInvalid";
  return null;
}

/**
 * What the screen does with whatever Supabase answered.
 *
 * ================================================================== //
 * THERE IS EXACTLY ONE OUTCOME, AND THAT IS THE POINT.
 * ================================================================== //
 *
 * Success and every possible failure render the SAME screen. The staff email
 * list is the clinic's own roster, and a recovery form that answers differently
 * for a known address than for an unknown one publishes that roster to anyone
 * with a browser. That is the same oracle the patient OTP path refuses to
 * become: `POST /api/v1/auth/otp/request` answers 204 for any well-formed
 * number and never queries the patient table at all, and `/verify` returns ONE
 * 401 body for five distinct failure modes.
 *
 * This is stated as a returned SCREEN rather than an `if` in the component so
 * that a future edit adding a second branch has to change a value a test reads,
 * instead of adding a line nobody notices.
 *
 * THE COST IS REAL AND IS ACCEPTED RATHER THAN HIDDEN: a staff member who is
 * being rate-limited by Supabase sees "check your email" and no mail arrives.
 * They cannot be told which of the two happened. The alternative tells anyone
 * who asks which addresses belong to this clinic.
 */
export type RecoveryScreen = "sent";

export type RecoveryResult = {
  /** Always "sent". Never varies. */
  screen: RecoveryScreen;
  /**
   * The reason the send failed, for `console.error`, or null when it did not.
   *
   * PG7, no silent degradation: a failure that changes nothing on screen must
   * still be visible somewhere, or a broken SMTP configuration looks exactly
   * like a working one. It carries the transport's own message ONLY. The email
   * address is never in it - that is the user's PII and CLAUDE.md rule 7 keeps
   * it out of logs, including this one.
   */
  logDetail: string | null;
};

export function collapseRecoveryOutcome(
  error: { message?: string } | null,
): RecoveryResult {
  return {
    screen: "sent",
    logDetail: error ? `password recovery send failed: ${error.message ?? "unknown"}` : null,
  };
}
