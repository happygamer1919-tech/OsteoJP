// THE 24h SMS CONFIRM LINK — code issuance, and the gate that arms it.
//
// ==========================================================================
// WHAT THIS IS FOR
// ==========================================================================
// The 24h reminder carries one line: `Confirmar: osteojp.pt/c/XXXXXXXX`. The
// eight characters are a CODE, not a token: they name a row in
// `appointment_confirm_codes` (migration 0072) rather than carrying signed
// claims. Section 6 of docs/audit/PERF-06-RLS.md has the arithmetic that
// forced that — a stateless token needs 59 characters and 36 were available —
// but the shorter reason is that ONE-TIME USE CANNOT BE STATELESS, and *pedir
// remarcação* is not idempotent.
//
// ==========================================================================
// THE STORED VALUE IS AN HMAC AND THE KEY IS THE WHOLE POINT (SR-28)
// ==========================================================================
// Eight base64url characters is 48 bits. A bare sha256 of 48 bits is
// exhaustible offline — 2.8e14 candidates is a GPU afternoon — so a copy of the
// table would yield every live code. Keyed on a server secret, the table alone
// is useless to whoever holds it.
//
// THE SECRET IS NAMED, NEVER READ INTO A LOG OR AN ERROR. If it is absent,
// issuance REFUSES rather than falling back to an unkeyed digest: a fallback
// here would produce codes that look identical and are offline-breakable, which
// is precisely the shape PORTAL-REHYDRATE §1.3 catalogues — an unknown case
// mapped onto a harmless-looking known one.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { EnvSource } from "@osteojp/notify";

/**
 * The capability flag. Exact string "true" arms it — the same fail-safe rule
 * REMINDERS_LIVE_SEND, REMINDERS_FEE_NOTICE_ENABLED and REMINDERS_REPLY_CAPABLE
 * follow, and for the same reason: a typo in a Vercel variable must fail
 * CLOSED, not open. "TRUE", "1", "yes" and " true " all leave it disarmed.
 */
export const CONFIRM_LINK_FLAG = "REMINDERS_CONFIRM_LINK_ENABLED" as const;

/** The env var naming the HMAC key. The NAME travels; the value never does. */
export const CONFIRM_CODE_SECRET_VAR = "REMINDERS_CONFIRM_CODE_SECRET" as const;

/**
 * ==========================================================================
 * THE HOST COMES FROM DEPLOYMENT, NOT FROM THE COPY. READ THIS BEFORE
 * RESTORING A LITERAL.
 * ==========================================================================
 * JP approved the line as `Confirmar: osteojp.pt/c/XXXXXXXX`, and
 * `osteojp.pt` IS NOT A HOST THAT CAN SERVE THIS PAGE. The apex resolves to
 * 62.233.41.48 (nv7.serverhs.org), the clinic's existing website on shared
 * hosting; the page is served by this app at `app.osteojp.pt/c/<code>`. A
 * patient tapping the approved line reaches the marketing site and a 404.
 *
 * THIS PROJECT HAS ALREADY PAID FOR THIS ONCE, ONE CHANNEL OVER.
 * `dispatch.ts` `requiredRescheduleBase` exists because the EMAIL reschedule
 * link defaulted to `https://osteojp.pt` and "unset in prod meant every
 * reminder and no-show email carried a /r/<token> link that 404s, with nothing
 * failing anywhere: the send succeeded, the patient hit a dead page, and the
 * clinic learned about it from a phone call". The first draft of this file
 * reintroduced exactly that, as a constant instead of a default.
 *
 * So the host is read from the SAME env var the email link uses. The two
 * cannot disagree about which origin serves patient-facing links, because
 * there is only one answer and one place it lives.
 *
 * THE SHAPE JP APPROVED IS PRESERVED: `Confirmar: <host>/c/<8 chars>`, bare
 * host, no scheme. Only the host follows deployment reality.
 */
export const CONFIRM_LINK_BASE_VAR = "REMINDERS_RESCHEDULE_BASE_URL" as const;

/**
 * The bare host for the SMS line: scheme and any trailing slash removed,
 * because JP's line carries neither.
 *
 * THROWS WHEN UNSET, and does not fall back. A fallback here is the defect
 * described above, and the email path in dispatch.ts already made this
 * variable required for the same reason: failing at render is strictly better
 * than shipping a dead link to a patient.
 */
export function confirmLinkHost(env: EnvSource = process.env): string {
  const base = env[CONFIRM_LINK_BASE_VAR]?.trim();
  if (!base) {
    throw new Error(
      `reminders/confirm-code: ${CONFIRM_LINK_BASE_VAR} is required and has no default. ` +
        "Set it to the deployed app origin (the host that serves /c/<code>), not the marketing site.",
    );
  }
  return base.replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

/** JP's line, with the real host and the code filled in. ONE home for the copy. */
export function confirmLinkLine(code: string, env: EnvSource = process.env): string {
  return `Confirmar: ${confirmLinkHost(env)}/c/${code}`;
}

/**
 * base64url, as migration 0072's own header states the code is. 64 symbols, so
 * eight characters carry exactly 48 bits and the figure JP's approval was
 * granted against stays true.
 *
 * EVERY SYMBOL IS GSM-7 SAFE, including `-` and `_`. That is asserted in the
 * tests rather than eyeballed here: a symbol outside GSM-7 would silently halve
 * the segment limit from 160 to 70 and double the cost of every reminder.
 */
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** JP approved eight. The budget allows up to 36; see PERF-06-RLS.md §6. */
export const CONFIRM_CODE_LENGTH = 8;

/**
 * A fresh code.
 *
 * REJECTION SAMPLING, not modulo. 256 is not a multiple of 64 only in the sense
 * that it IS — 256/64 = 4 exactly — so modulo would be uniform here and the
 * loop is unnecessary. It is written this way anyway because the alphabet is a
 * constant somebody will one day shorten (dropping `-` and `_` to make codes
 * dictatable over the telephone is an obvious future request), and a modulo
 * that is uniform for 64 symbols is silently biased for 62.
 */
export function generateConfirmCode(length: number = CONFIRM_CODE_LENGTH): string {
  const n = ALPHABET.length;
  const limit = Math.floor(256 / n) * n; // the largest unbiased byte value + 1
  let out = "";
  while (out.length < length) {
    for (const byte of randomBytes(length * 2)) {
      if (byte >= limit) continue;
      out += ALPHABET[byte % n];
      if (out.length === length) break;
    }
  }
  return out;
}

/** Shape only — never whether the code EXISTS, which is the database's answer. */
export function isWellFormedConfirmCode(code: string): boolean {
  if (code.length !== CONFIRM_CODE_LENGTH) return false;
  for (const ch of code) if (!ALPHABET.includes(ch)) return false;
  return true;
}

/**
 * The HMAC the table stores, hex, 64 characters — the shape 0072's CHECK pins.
 *
 * THROWS ON A MISSING SECRET. See the header: a fallback to an unkeyed digest
 * would produce codes indistinguishable from real ones and offline-breakable,
 * and the caller would carry on reporting success.
 */
export function hashConfirmCode(code: string, env: EnvSource = process.env): string {
  const secret = env[CONFIRM_CODE_SECRET_VAR]?.trim();
  if (!secret) {
    throw new Error(
      `reminders/confirm-code: ${CONFIRM_CODE_SECRET_VAR} is not set; refusing to issue or resolve a code with an unkeyed digest`,
    );
  }
  return createHmac("sha256", secret).update(code).digest("hex");
}

/**
 * Constant-time hex comparison, for the one place a caller compares two hashes
 * itself. The database lookup is an equality on a PRIMARY KEY and is not
 * constant time; SR-30's indistinguishability is built at the OUTPUT, not here.
 */
export function hashesEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

/**
 * Is the confirm link armed?
 *
 * TAKES THE ENV, RETURNS AN ANSWER. Callers that render the SMS receive the
 * ANSWER and never the inputs — the same discipline `SmsAdditions` uses in
 * templates.ts, so the render site cannot know what any flag is called and a
 * second, drifting copy of this rule cannot appear there.
 *
 * BOTH GATES MUST HOLD. The flag alone is not enough: without the HMAC key
 * there is nothing to issue a code with, and arming the flag on a project that
 * has no secret would otherwise produce a reminder whose link is broken for
 * every patient. Two variables, one answer, checked in one place.
 */
export function confirmLinkEnabled(env: EnvSource = process.env): boolean {
  return env[CONFIRM_LINK_FLAG] === "true" && Boolean(env[CONFIRM_CODE_SECRET_VAR]?.trim());
}

/** Why the answer is what it is. Operator-facing log only; never branched on. */
export function confirmLinkReason(env: EnvSource = process.env): string {
  if (env[CONFIRM_LINK_FLAG] !== "true") {
    return `${CONFIRM_LINK_FLAG} is not exactly "true"; the confirm link is disarmed`;
  }
  if (!env[CONFIRM_CODE_SECRET_VAR]?.trim()) {
    return `${CONFIRM_LINK_FLAG} is armed but ${CONFIRM_CODE_SECRET_VAR} is absent; refusing to issue codes with an unkeyed digest`;
  }
  return `${CONFIRM_LINK_FLAG} is exactly "true" and ${CONFIRM_CODE_SECRET_VAR} is present`;
}
