// E.164 normalization for stored PT patient phone numbers.
//
// patients.phone is free text (staff form caps length; the portal PATCH allows
// any 7-15 digit string), so numbers arrive as "912 345 678", "00351912345678",
// "+351 912-345-678", etc. Twilio requires E.164 and rejects everything else
// with error 21211 — so nothing may reach messages.create un-normalized.
// Closes the launch blocker recorded in docs/QUESTIONS.md (2026-07-06) and
// pinned by the #485 characterization tests.
//
// Pure module: no DB, no env, no `server-only` — unit-testable anywhere.

/**
 * PT subscriber numbers are 9 digits: geographic lines start with 2, mobile
 * (and nomadic 9x ranges) with 9. Prefix-level assignment validity (91/92/93/96
 * vs unassigned 9x blocks) is deliberately NOT enforced here — that is the
 * carrier's call; Twilio rejects unassigned ranges with a clear error, whereas
 * over-strictness here would silently drop reachable patients.
 */
const PT_SUBSCRIBER = /^[29]\d{8}$/;

/**
 * Normalize a stored PT phone number to E.164 (+3519xxxxxxxx / +3512xxxxxxxx).
 *
 * Accepted inputs (separators — spaces, dots, dashes, parentheses — stripped):
 *   "912345678"        → "+351912345678"   (bare 9-digit subscriber)
 *   "+351912345678"    → "+351912345678"   (already E.164, passthrough)
 *   "00351912345678"   → "+351912345678"   (international 00 prefix)
 *   "351912345678"     → "+351912345678"   (country code without +/00)
 *
 * Returns null for anything that does not resolve to a valid PT format —
 * including non-PT country codes, by design for now: reminders are a PT-clinic
 * feature and a mis-stored foreign number must fail visibly at the skip log,
 * not send to a random international destination. The caller skips the send
 * and logs a structured warning with ids only (PII rule #7 — never the raw
 * number).
 */
export function normalizePhonePT(raw: string): string | null {
  const compact = raw.replace(/[\s.\-()]/g, "");
  let subscriber: string;
  if (compact.startsWith("+351")) {
    subscriber = compact.slice(4);
  } else if (compact.startsWith("00351")) {
    subscriber = compact.slice(5);
  } else if (/^351\d{9}$/.test(compact)) {
    subscriber = compact.slice(3);
  } else {
    subscriber = compact;
  }
  return PT_SUBSCRIBER.test(subscriber) ? `+351${subscriber}` : null;
}
