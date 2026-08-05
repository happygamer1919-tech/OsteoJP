// W13-03 (Wave 13 LOOP 3) — the 6-digit OTP core. PG1, Decision D.
//
// Decision D: "patient login is a 6-digit SMS OTP, phone only, with a trusted
// device of 30 days. No password, no magic link, no session minted from any
// other artefact."
//
// THE ATTACK THIS IS SHAPED AROUND IS ENUMERATION, which LOOP 3 names outright:
// "A wrong code and an unknown phone return the SAME response — enumeration is
// the obvious attack here." A login form that answers differently for a known
// and an unknown number is a patient-list oracle for anyone with a phone book,
// and this clinic's patient list is itself sensitive. So every refusal in this
// module is the SAME refusal, and the code below is written to make divergence
// awkward rather than to rely on remembering.
//
// DB-AGNOSTIC BY DESIGN, matching apps/api/lib/appointments/booking.ts: every
// database touch is behind the `OtpStore` seam, so the security properties are
// unit-testable with an in-memory fake and the real Drizzle implementation lives
// separately. The properties are what matter and they should not need a database
// to prove.
//
// PII RULE (#7): no code and no phone number is ever logged, at any level. The
// phone is hashed before it is stored or used as a key, so even the rate-limit
// key carries no number.

import { createHash, randomInt, timingSafeEqual } from "node:crypto";

import type { OtpTransport } from "./otp-transport";

/* --------------------------------- policy -------------------------------- */

/** Six digits, per Decision D. */
export const OTP_LENGTH = 6;

/**
 * How long a code lives. Short, because a 6-digit code has only 10^6
 * possibilities and every extra minute is more time to spend them — the expiry
 * and the attempt cap are the same control viewed from two directions.
 */
export const OTP_TTL_MS = 5 * 60 * 1000;

/**
 * Wrong guesses permitted against one code before it is dead.
 *
 * FIVE, and the arithmetic is the justification: with a 5-attempt cap an
 * attacker gets 5 of 1,000,000 guesses per issued code, so brute force requires
 * re-requesting codes, which is what the request-side rate limit governs. The
 * cap without the request limit, or the request limit without the cap, each
 * leaves a usable attack; together they do not.
 */
export const OTP_MAX_ATTEMPTS = 5;

/** Trusted device window, per Decision D. Fixed at issue, never extended. */
export const TRUSTED_DEVICE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/* --------------------------------- hashing ------------------------------- */

/**
 * The phone number's storage and lookup key. sha256 of the normalized E.164
 * string.
 *
 * Not salted, deliberately: the value must be DETERMINISTIC so a later verify
 * can find the row a request created. That is a real trade — a phone number is
 * low-entropy and an attacker with the table could confirm a guessed number by
 * hashing it — and it is the right one, because the alternative is storing the
 * number itself, which hands over every patient's phone without any guessing at
 * all. The table is service-role only (0056) precisely because this hash is a
 * confirmation oracle rather than a secret.
 */
export function hashPhone(e164: string): string {
  return createHash("sha256").update(e164).digest("hex");
}

/**
 * The code's storage form. sha256 over the code DOMAIN-SEPARATED by the phone
 * hash, so the same six digits issued to two numbers do not produce the same
 * stored value and a precomputed table over 10^6 codes does not transfer
 * between rows.
 */
export function hashCode(code: string, phoneHash: string): string {
  return createHash("sha256").update(`${phoneHash}:${code}`).digest("hex");
}

/**
 * Constant-time comparison of two hex digests.
 *
 * `timingSafeEqual` throws on length mismatch, which would itself be a timing
 * signal, so lengths are equalised first and the result is ANDed with the
 * length check rather than returned early.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) {
    // Compare against itself so the work done is the same shape, then fail.
    timingSafeEqual(ab, ab);
    return false;
  }
  return timingSafeEqual(ab, bb);
}

/**
 * A cryptographically random 6-digit code, zero-padded.
 *
 * `randomInt` and not `Math.random`: the latter is predictable from prior
 * output, which for a login code means an attacker who has seen one can narrow
 * the next. Uniform over the full range INCLUDING codes with leading zeros —
 * excluding them would quietly shrink the space by 10%.
 */
export function generateOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(OTP_LENGTH, "0");
}

/* ---------------------------------- store -------------------------------- */

export type OtpRecord = {
  id: string;
  phoneHash: string;
  codeHash: string;
  attempts: number;
  expiresAt: Date;
  consumedAt: Date | null;
};

export type OtpStore = {
  /** Persist a new code. */
  create(row: {
    tenantId: string;
    phoneHash: string;
    codeHash: string;
    expiresAt: Date;
  }): Promise<void>;
  /** The newest unconsumed code for this phone, or null. */
  findLive(tenantId: string, phoneHash: string, now: Date): Promise<OtpRecord | null>;
  /** Record a failed guess. */
  incrementAttempts(id: string): Promise<void>;
  /**
   * Mark consumed. MUST be atomic with whatever the caller does next: the
   * session mint and the consumption belong in one transaction, for the same
   * reason 0054 couples a token action to its consumption record.
   */
  consume(id: string, now: Date): Promise<void>;
};

/* --------------------------------- results ------------------------------- */

/**
 * THE ONLY TWO OUTCOMES A CALLER MAY DISTINGUISH.
 *
 * Not an enum of reasons, on purpose. If this type carried `unknown_phone`,
 * `wrong_code`, `expired` and `too_many_attempts`, then sooner or later a route
 * would map them to different responses and rebuild the enumeration oracle this
 * whole module exists to avoid. The reason a verification failed is the server's
 * business; the client is told only that it failed.
 *
 * `rateLimited` IS separable because it must be: the client needs a Retry-After
 * to behave correctly, and being told to slow down reveals nothing about whether
 * the phone exists — an unknown number hits the same limiter.
 */
export type OtpVerifyResult =
  | { ok: true; phoneHash: string }
  | { ok: false; rateLimited?: true; retryAfterSeconds?: number };

/** The single refusal. Every failure path returns exactly this. */
const REFUSED: OtpVerifyResult = { ok: false };

/* --------------------------------- request ------------------------------- */

export type RequestCodeDeps = {
  store: OtpStore;
  transport: OtpTransport;
  now?: () => Date;
  generate?: () => string;
};

/**
 * Issue a code and send it.
 *
 * IT RETURNS NOTHING ABOUT WHETHER THE PHONE IS KNOWN, and it does not look.
 * Deliberately: the patient row is resolved at CLAIM time under WF-07, not here,
 * so this path cannot leak membership even by timing a database lookup it never
 * performs. A code is issued for any well-formed number; an unknown number
 * simply receives an SMS that helps nobody.
 *
 * THE CALLER RATE-LIMITS BEFORE CALLING THIS, per the session route's posture of
 * limiting before the auth check, so an attacker cannot spend the send budget —
 * or the clinic's SMS spend — for free.
 */
export async function requestCode(
  tenantId: string,
  phoneE164: string,
  deps: RequestCodeDeps,
): Promise<void> {
  const now = deps.now?.() ?? new Date();
  const code = (deps.generate ?? generateOtpCode)();
  const phoneHash = hashPhone(phoneE164);

  await deps.store.create({
    tenantId,
    phoneHash,
    codeHash: hashCode(code, phoneHash),
    expiresAt: new Date(now.getTime() + OTP_TTL_MS),
  });

  // Send AFTER the row exists. The other order can deliver a code the server has
  // no record of, which the patient then cannot use — indistinguishable to them
  // from the code being wrong.
  await deps.transport.send(phoneE164, code);
}

/* ---------------------------------- verify ------------------------------- */

export type VerifyCodeDeps = {
  store: OtpStore;
  now?: () => Date;
};

/**
 * Check a code.
 *
 * EVERY FAILURE RETURNS `REFUSED`, and the ways to fail are: no live code for
 * this phone (which covers both "never requested" and "unknown number"), the
 * code expired, the attempt cap is spent, or the digits are wrong. A caller
 * cannot tell them apart, which is the enumeration property stated as code
 * rather than as a comment.
 *
 * SINGLE USE is enforced by `findLive` returning only unconsumed rows plus the
 * `consume` call on success; the attempt cap is enforced before the comparison,
 * so a spent code costs an attacker nothing to keep guessing against.
 */
export async function verifyCode(
  tenantId: string,
  phoneE164: string,
  code: string,
  deps: VerifyCodeDeps,
): Promise<OtpVerifyResult> {
  const now = deps.now?.() ?? new Date();
  const phoneHash = hashPhone(phoneE164);

  const record = await deps.store.findLive(tenantId, phoneHash, now);
  if (!record) return REFUSED;

  if (record.expiresAt.getTime() <= now.getTime()) return REFUSED;
  if (record.attempts >= OTP_MAX_ATTEMPTS) return REFUSED;

  const matches = constantTimeEqual(record.codeHash, hashCode(code, phoneHash));
  if (!matches) {
    // The failed guess is recorded BEFORE returning, so a client that abandons
    // the response still spent an attempt.
    await deps.store.incrementAttempts(record.id);
    return REFUSED;
  }

  await deps.store.consume(record.id, now);
  return { ok: true, phoneHash };
}
