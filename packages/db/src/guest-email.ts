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
 * request that arrives and cannot be converted. So the portal (its server
 * action AND its client component, through the package's `./guest-email`
 * entry, which imports nothing and so brings no database driver into a
 * browser) and the API all call THIS function. Its pattern is the staff app's
 * pattern, character for character: `tests/guest-email.test.ts` reads that
 * file and fails if the two ever differ.
 *
 * THE PUBLIC PATH IS STRICTER THAN THE STAFF FORM, AND ONLY THE PUBLIC PATH.
 * A member of staff types an address they were given, and can see it. This
 * value comes from anybody on the internet, is shown to reception and, for a
 * new patient, becomes the address the clinic writes to. So on top of the
 * staff rule it refuses every character in `GUEST_EMAIL_UNSAFE` below, each
 * with its reason. Everything this admits the staff rule admits, so a value
 * accepted here can always be saved on a patient.
 *
 * THE DATABASE IS LOOSER ON PURPOSE. 0101's CHECK admits every value this
 * admits (the DB-gated suite proves it) and many it refuses. It is a backstop,
 * never a second validator. The reverse must never happen: nothing this
 * admits may be refused by the database, which is why a NUL is refused HERE
 * (Postgres cannot store one, and the route would answer 503 instead of 400).
 *
 * NEVER LOG WHAT THIS IS GIVEN. An email address is personal data. The result
 * carries the address for the caller to store; a refusal carries nothing, so a
 * caller cannot echo the rejected value by accident.
 */

/** The staff app's bound: `optionalText(v, "email", 320)`. */
export const GUEST_EMAIL_MAX = 320;

/** The staff app's `EMAIL_RE`, character for character. */
export const GUEST_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * WHAT THE PUBLIC PATH REFUSES ON TOP OF THE STAFF RULE. One character from
 * this set anywhere in the value refuses it.
 *
 *   \p{Cc}  CONTROL CHARACTERS: U+0000 to U+001F and U+007F to U+009F. A NUL
 *           cannot be stored by Postgres at all; U+0085 (NEL) is a line break
 *           to a mail header and is not whitespace to the staff pattern.
 *   \p{Cf}  FORMAT CHARACTERS, which draw nothing or change how the rest is
 *           drawn: zero-width space and joiners (U+200B to U+200D), the
 *           bidirectional overrides and isolates (U+202A to U+202E, U+2066 to
 *           U+2069), the soft hyphen (U+00AD), the byte order mark (U+FEFF),
 *           the tag characters (U+E0001, U+E0020 to U+E007F). With one of
 *           them, two addresses that read the same are different addresses,
 *           or one address reads backwards.
 *   \p{Cs}  A LONE SURROGATE. It is not text: it has no UTF-8 form, so the
 *           database refuses it. (A well-formed pair is an ordinary character
 *           and is not matched.)
 *   \p{Co}  PRIVATE USE (U+E000 to U+F8FF and planes 15 and 16): no agreed
 *           glyph, so what reception sees depends on the font.
 *   NONCHARACTERS: U+FDD0 to U+FDEF, and U+FFFE and U+FFFF of every plane.
 *           Never valid in text that is exchanged.
 *   U+FFFD, U+FFFC  the REPLACEMENT CHARACTER and the object replacement
 *           character. U+FFFD is what a decoder writes where the bytes were
 *           not text, and it is what a lone surrogate becomes on its way
 *           through a form post or a JSON body. Nobody's address holds one.
 *   U+FF20, U+FE6B  FULLWIDTH and SMALL COMMERCIAL AT: they read as "@" and
 *           are not, so the visible address is not the one mail goes to.
 *   U+3002, U+FF0E, U+FF61  the ideographic and fullwidth full stops: domain
 *           name processing (IDNA) turns each into ".", so the domain mail is
 *           routed to is not the one that is read.
 *   EVERY OTHER CHARACTER WHOSE COMPATIBILITY FORM (NFKC) HOLDS A FULL STOP,
 *           for the same reason: U+FE52 SMALL FULL STOP and U+2024 ONE DOT
 *           LEADER (each becomes "."), U+2025 and U+2026 (".." and "..."),
 *           U+2488 to U+249B and U+1F100 (a number and a full stop, "1."),
 *           U+33C2, U+33C7, U+33D8 ("a.m.", "Co.", "p.m.") and the vertical
 *           forms U+FE12, U+FE19, U+FE30. `tests/guest-email.test.ts` walks
 *           every code point and fails if one such character is admitted, so
 *           the list is complete for the engine's Unicode version. U+FF20 and
 *           U+FE6B are the only ones whose form holds an "@".
 *   U+0701, U+0702, U+A60E, U+10A50, U+1D16D  punctuation of other scripts and
 *           notations that is drawn as a dot on the baseline (the Syriac full
 *           stops, the Vai full stop, the Kharoshthi dot, a musical dot). Not
 *           letters of an address, and they read as ".".
 *   ( ) < > [ ] : ; , \ "  the characters with a structural meaning in a
 *           mail header (RFC 5322 "specials", "@" and "." apart). They are
 *           legal only inside a quoted local part or a domain literal, which
 *           this form does not accept. Unquoted, a transport may read
 *           `x<a@b.pt>` as a display name and ANOTHER address, and "," or ";"
 *           as a list of recipients.
 *
 * NOT IN THE SET, ON PURPOSE: letters of any script (a non-ASCII local part
 * and an internationalised domain are real addresses), digits of any script
 * (the Arabic-Indic zero, U+0660 and U+06F0, is drawn as a dot and is still a
 * digit), the RAISED dots, which do not read as a full stop (U+00B7 MIDDLE
 * DOT, U+0387, U+2027, U+2219, U+22C5, U+30FB), combining marks, and
 * the other ASCII punctuation an address may carry (+ - _ ' ! # $ % & * / = ?
 * ^ ` { | } ~). The Unicode line and paragraph separators (U+2028, U+2029) and
 * every Unicode space are already refused by the staff pattern's `\s`.
 */
export const GUEST_EMAIL_UNSAFE =
  /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\uFDD0-\uFDEF\uFFFC\uFFFD\uFF20\uFE6B\u3002\uFF0E\uFF61\u2024-\u2026\u2488-\u249B\u33C2\u33C7\u33D8\uFE12\uFE19\uFE30\uFE52\u{1F100}\u0701\u0702\uA60E\u{10A50}\u{1D16D}()<>[\]:;,\\"]|[\uFFFE\uFFFF]|[\u{1FFFE}\u{1FFFF}\u{2FFFE}\u{2FFFF}\u{3FFFE}\u{3FFFF}\u{4FFFE}\u{4FFFF}\u{5FFFE}\u{5FFFF}\u{6FFFE}\u{6FFFF}\u{7FFFE}\u{7FFFF}\u{8FFFE}\u{8FFFF}\u{9FFFE}\u{9FFFF}\u{AFFFE}\u{AFFFF}\u{BFFFE}\u{BFFFF}\u{CFFFE}\u{CFFFF}\u{DFFFE}\u{DFFFF}\u{EFFFE}\u{EFFFF}\u{FFFFE}\u{FFFFF}\u{10FFFE}\u{10FFFF}]/u;

export type GuestEmailResult = { ok: true; email: string | null } | { ok: false };

/**
 * What a typed or posted value means.
 *
 *   absent, null, or only whitespace  ->  ok, no email (stored as NULL)
 *   a string that is an email         ->  ok, trimmed
 *   anything else                     ->  not ok
 *
 * "Anything else" includes a non-string, so a hand-rolled client posting
 * `{ "email": 1 }` or an array is refused rather than coerced. It also includes
 * a value with an unsafe character ANYWHERE, the ends included: a zero-width
 * space at the end of an address is not whitespace to `trim`, and is refused
 * rather than stored.
 */
export function parseGuestEmail(value: unknown): GuestEmailResult {
  if (value === undefined || value === null) return { ok: true, email: null };
  if (typeof value !== "string") return { ok: false };
  const trimmed = value.trim();
  if (trimmed.length === 0) return { ok: true, email: null };
  if (trimmed.length > GUEST_EMAIL_MAX) return { ok: false };
  if (!GUEST_EMAIL_PATTERN.test(trimmed)) return { ok: false };
  if (GUEST_EMAIL_UNSAFE.test(trimmed)) return { ok: false };
  return { ok: true, email: trimmed };
}
