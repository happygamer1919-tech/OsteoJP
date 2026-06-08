// Password-strength validation for the set-password landing page.
//
// Pure module — no DOM, no Supabase, no server-only — so it unit-tests directly
// and can run on both the server-rendered shell and the client. Supabase Auth
// applies its own project-level password policy as the authoritative gate; this
// is the client-side pre-check that gives the invited user an immediate, locale-
// aware reason before we ever call updateUser().

import type { StringKey } from "@osteojp/i18n";

/** Minimum length. Above Supabase's default (6) — invite = first credential. */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * Validation failures, as i18n keys so the caller renders them in the active
 * locale without a second mapping table. `null` means the password is accepted.
 * Checked in priority order (length → letter → number → match).
 */
export type PasswordErrorKey = Extract<
  StringKey,
  | "auth.setPassword.errTooShort"
  | "auth.setPassword.errNoLetter"
  | "auth.setPassword.errNoNumber"
  | "auth.setPassword.errMismatch"
>;

export function validatePassword(
  password: string,
  confirm: string,
): PasswordErrorKey | null {
  if (password.length < MIN_PASSWORD_LENGTH) return "auth.setPassword.errTooShort";
  if (!/[A-Za-z]/.test(password)) return "auth.setPassword.errNoLetter";
  if (!/[0-9]/.test(password)) return "auth.setPassword.errNoNumber";
  if (password !== confirm) return "auth.setPassword.errMismatch";
  return null;
}
