// THE SATISFACTION SURVEY LINK (SAT-01): the code `/s/<code>` carries, and its
// stored hash.
//
// ==========================================================================
// ONE KEY, TWO DOMAINS (ruled: the confirm-code key with a `survey:` prefix)
// ==========================================================================
// A survey code has the confirm code's shape: eight base64url characters, 48
// bits, stored only as an HMAC (migration 0102, the 0072 shape). It is keyed on
// the SAME server secret as the confirm code, so there is no second secret to
// set, and the two are kept apart by what is hashed:
//
//   a confirm code  ->  HMAC(key, code)
//   a survey code   ->  HMAC(key, "survey:" + code)
//
// WHY NEITHER CAN STAND IN FOR THE OTHER. The hash of a survey code is the
// confirm hash of the fifteen characters `survey:XXXXXXXX`. That string is not
// a confirm code: it is not eight characters long, and `:` is not in the
// alphabet. Every path that takes a confirm code from outside checks its shape
// before hashing it, and this module refuses to hash anything that is not a
// well-formed code, so no input of either kind can produce the other's hash.
// The two hashes also live in two tables (`appointment_confirm_codes`,
// `appointment_survey_codes`) behind two sets of doors. Both directions are
// proven in survey-code.test.ts and, against a database, in
// survey-page.db.test.ts.
//
// PURE: no `server-only`, no database, no env read at import, so the browser
// suite can hash with the real function instead of a copy.

import type { EnvSource } from "@osteojp/notify";
import {
  CONFIRM_CODE_LENGTH,
  generateConfirmCode,
  hashConfirmCode,
  isWellFormedConfirmCode,
} from "@/lib/reminders/confirm-code";

/** What is put in front of the code before it is hashed. Never changed once a code is live. */
export const SURVEY_CODE_DOMAIN = "survey:" as const;

/** The same eight characters JP's SMS line was approved against. */
export const SURVEY_CODE_LENGTH = CONFIRM_CODE_LENGTH;

/** A fresh code: the confirm code's generator, alphabet and length. Touches nothing. */
export function generateSurveyCode(): string {
  return generateConfirmCode(SURVEY_CODE_LENGTH);
}

/** Shape only, never whether the code EXISTS, which is the database's answer. */
export function isWellFormedSurveyCode(code: string): boolean {
  return isWellFormedConfirmCode(code);
}

/**
 * The HMAC `appointment_survey_codes` stores: hex, 64 characters.
 *
 * THROWS ON A CODE THAT IS NOT WELL FORMED, and that is the half of the
 * separation this module owns: only `survey:` plus eight alphabet characters is
 * ever hashed here. A caller holding an untrusted value checks its shape first
 * (survey-store.ts looks a malformed code up against a hash that cannot exist).
 *
 * THROWS ON A MISSING SECRET, through `hashConfirmCode`: one reading of the
 * key, one refusal to fall back to an unkeyed digest.
 */
export function hashSurveyCode(code: string, env: EnvSource = process.env): string {
  if (!isWellFormedSurveyCode(code)) {
    throw new Error("surveys/survey-code: refusing to hash a value that is not a well-formed code");
  }
  return hashConfirmCode(`${SURVEY_CODE_DOMAIN}${code}`, env);
}
