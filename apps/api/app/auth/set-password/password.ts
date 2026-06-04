// Password-strength validation for the patient set-password landing.
//
// Pure module (no DOM, no Supabase, no server-only) so it unit-tests directly and
// runs on both server shell and client. Supabase Auth applies its own project
// password policy as the authoritative gate; this is the client-side pre-check
// that gives an immediate, locale-aware reason. Identical rules to the staff
// landing — patients get the same first-credential strength bar.

import type { StringKey } from "@osteojp/i18n";

export const MIN_PASSWORD_LENGTH = 8;

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
