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

import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

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

/* ------------------------------ device token ----------------------------- */

/**
 * A trusted-device token. 32 random bytes, hex.
 *
 * NOT six digits, and the difference matters: an OTP is short because a human
 * types it and an attempt cap plus a five-minute expiry make the small space
 * survivable. This token is never typed, lives for thirty days, and is checked
 * without any attempt cap — nothing about a device token bounds guessing except
 * its own entropy, so it gets 256 bits of it.
 */
export function generateDeviceToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * The device token's storage form. Plain sha256, no domain separator, because
 * unlike a 6-digit code a 256-bit random value is not brute-forceable from its
 * hash and there is no second value to separate it from.
 *
 * IT IS HASHED FOR THE SAME REASON THE CODE IS: 0056 makes this hash the PRIMARY
 * KEY of patient_trusted_devices precisely so a database read yields nothing
 * that can be presented as a bearer credential.
 */
export function hashDeviceToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
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
   * Mark consumed, and REPORT WHETHER THIS CALL IS THE ONE THAT DID IT.
   *
   * The boolean is the single-use enforcement point, not a convenience. The
   * store's UPDATE carries a `consumed_at IS NULL` guard, so under two
   * simultaneous redemptions of one code the loser matches zero rows and writes
   * nothing — but a void return would leave the loser indistinguishable from the
   * winner at the call site, and it would go on to grant whatever the winner
   * granted. Both requests would then "succeed" against one code, which is
   * exactly the property single-use exists to deny.
   *
   * MUST be atomic with whatever the caller grants: the consumption and the
   * grant belong in one transaction, for the same reason 0054 couples a token
   * action to its consumption record.
   */
  consume(id: string, now: Date): Promise<boolean>;
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
  | { ok: true; phoneHash: string; codeId: string }
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
 * THE CODE ROW COULD NOT BE WRITTEN. Nothing was sent and nothing is live.
 *
 * WHY THIS CLASS EXISTS, and it is the same reason `OtpTransportMisconfigured`
 * exists one module over: `requestCode` has two failure points and the caller
 * cannot tell them apart from an ordinary `Error`, but it has to, because the
 * TRUE SENTENCE ABOUT THE DATABASE IS THE OPPOSITE IN EACH CASE.
 *
 *   - the SEND throws  -> the row was already written and is now live but
 *     undelivered until its TTL expires. Somebody reading that table later needs
 *     to know why codes exist that nobody received.
 *   - the WRITE throws -> there is no row. Nothing is live, nothing needs
 *     explaining, and looking for one wastes the reader's time.
 *
 * THE ROUTE'S LOG LINE USED TO SAY THE FIRST OF THOSE UNCONDITIONALLY, because
 * when it was written (SEC-otp-unassigned-prefix-500) the only failure it was
 * absorbing WAS the send. Then `SEC-otp-request-tenant-500-oracle` observed the
 * other one: `patient_otp_codes.tenant_id` carries `REFERENCES tenants(id)`
 * (migration 0056:95), so a fabricated tenantId makes `store.create` raise a
 * foreign-key violation — which that same catch absorbs, and then describes
 * with a sentence that is false about it.
 *
 * A LOG LINE ON A FAILURE PATH IS A VERDICT PATH. It is read exactly when
 * something has already gone wrong, by somebody who cannot see the code, and it
 * is the only account they get. Section 1.3's rule applies to it in full: two
 * distinct failures were being reported as one, and the one being reported was
 * the one that happens to be benign.
 *
 * DISCRIMINATED BY CLASS, NEVER BY MESSAGE TEXT, for the reason
 * `OtpTransportMisconfigured` already gives: a string match fails OPEN the
 * moment somebody rewords the prose.
 *
 * IT CHANGES NO RESPONSE. Both failures still answer 204. The enumeration
 * property is the whole design of this endpoint and this class does not touch
 * it — it decides what the LOG says, not what the CALLER sees.
 */
export class OtpCodeNotStored extends Error {
  constructor(cause: unknown) {
    super("otp: the code row could not be written; nothing was sent and nothing is live");
    this.name = "OtpCodeNotStored";
    this.cause = cause;
  }
}

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

  // THE WRITE IS NAMED SO THE CALLER CAN TELL IT FROM THE SEND. See
  // `OtpCodeNotStored`. The original error rides along as `cause`, so nothing
  // diagnostic is lost - the class adds a fact the caller could not otherwise
  // recover, it does not replace one.
  try {
    await deps.store.create({
      tenantId,
      phoneHash,
      codeHash: hashCode(code, phoneHash),
      expiresAt: new Date(now.getTime() + OTP_TTL_MS),
    });
  } catch (e) {
    throw new OtpCodeNotStored(e);
  }

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
 * Check a code. PROVES it; does NOT spend it.
 *
 * EVERY FAILURE RETURNS `REFUSED`, and the ways to fail are: no live code for
 * this phone (which covers both "never requested" and "unknown number"), the
 * code expired, the attempt cap is spent, or the digits are wrong. A caller
 * cannot tell them apart, which is the enumeration property stated as code
 * rather than as a comment.
 *
 * WHY CONSUMPTION IS NOT DONE HERE, having previously been. Success returns
 * `codeId` and the caller must call `store.consume(codeId, now)` INSIDE the same
 * transaction as whatever it grants. Consuming here would put the spend in its
 * own statement, outside the caller's transaction, which is the failure 0054
 * exists to prevent: a crash between the spend and the grant leaves either a
 * dead code with no session or a session with a still-live code. The claim is
 * one atomic act, so the two halves cannot live in two places.
 *
 * WHAT THAT MOVES, honestly stated: single use is now enforced by the caller's
 * `consume` and its boolean, not by this function. `findLive` still refuses an
 * already-consumed row, so a code cannot be proven twice once it is spent, but
 * a code proven and NOT spent stays live — which is precisely what the claim
 * path wants when linkage refuses, and precisely why `consume` reports whether
 * it won.
 *
 * The attempt cap is still enforced before the comparison, so a spent code costs
 * an attacker nothing to keep guessing against.
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

  return { ok: true, phoneHash, codeId: record.id };
}
