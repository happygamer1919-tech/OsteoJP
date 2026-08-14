import { createHash } from "node:crypto";

// Rate limiting for the patient-facing surface (SEC-04).
//
// Before this module there was no rate limiting anywhere in the repo, on any
// endpoint, of any kind.
//
// HONEST LIMITATION, READ BEFORE RELYING ON THIS
// The default store is per-process memory. On Vercel's serverless runtime each
// instance keeps its own counters and a cold start resets them, so this raises
// the cost of a brute-force attack but does not hard-cap it. That is an
// acceptable trade for COARSE abuse throttling, which is what W1 needs.
//
// It is NOT acceptable for the OTP flow's "5 attempts then 30 minute lockout".
// A lockout counter is a security control, and a control an attacker can reset
// by waiting for a cold instance is not a control. The OTP flow therefore needs
// a DURABLE shared store before it ships. That store is a pending decision:
// every option is either a new vendor (Upstash Redis) or a new table (GREEN's
// migration lane), and neither is authorized yet. The interface below exists so
// that swapping the implementation is a one-line change and no call site moves.

export type RateLimitRule = {
  /** Requests permitted per window. */
  limit: number;
  /** Fixed window length in milliseconds. */
  windowMs: number;
};

export type RateLimitVerdict = {
  ok: boolean;
  limit: number;
  remaining: number;
  /** Seconds until the current window resets. Feeds the Retry-After header. */
  retryAfterSeconds: number;
};

export type RateLimitStore = {
  /** Record one hit against `key` and return the running count + window end. */
  hit(
    key: string,
    windowMs: number,
    now: number,
  ): { count: number; resetAt: number };
  /** Test-only escape hatch so suites do not leak counters into each other. */
  clear(): void;
};

/**
 * Fixed-window in-memory store. Entries are evicted lazily on read, plus a
 * bounded sweep, so a long-lived instance under key churn cannot grow forever.
 */
export function createMemoryStore(): RateLimitStore {
  const windows = new Map<string, { count: number; resetAt: number }>();
  let sweepCounter = 0;

  return {
    hit(key, windowMs, now) {
      // Bounded sweep: every 500 hits, drop windows that have already expired.
      if (++sweepCounter >= 500) {
        sweepCounter = 0;
        for (const [k, v] of windows) if (v.resetAt <= now) windows.delete(k);
      }

      const existing = windows.get(key);
      if (!existing || existing.resetAt <= now) {
        const fresh = { count: 1, resetAt: now + windowMs };
        windows.set(key, fresh);
        return fresh;
      }
      existing.count += 1;
      return existing;
    },
    clear() {
      windows.clear();
      sweepCounter = 0;
    },
  };
}

/** The process-wide default store. */
export const memoryStore = createMemoryStore();

/**
 * Record a hit and decide whether it is permitted.
 *
 * Fixed window, deliberately: it is the cheapest correct thing under a store
 * with no atomic primitives. A sliding window would be a false promise here,
 * because the store it would need does not exist yet (see the note at the top).
 */
export function checkRateLimit(
  key: string,
  rule: RateLimitRule,
  store: RateLimitStore = memoryStore,
  now: number = Date.now(),
): RateLimitVerdict {
  const { count, resetAt } = store.hit(key, rule.windowMs, now);
  const ok = count <= rule.limit;
  return {
    ok,
    limit: rule.limit,
    remaining: Math.max(0, rule.limit - count),
    retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now) / 1000)),
  };
}

/**
 * The caller's rate-limit identity.
 *
 * x-forwarded-for is spoofable in general, but on Vercel the platform rewrites
 * it and the LEFTMOST entry is the real client. We take the leftmost for that
 * reason. A patient id is preferred where one is known, because it survives an
 * attacker rotating IPs.
 */
export function clientKey(req: Request, scope: string, subject?: string): string {
  return clientKeyFromHeaders(req.headers, scope, subject);
}

/**
 * The same identity, for a caller that has HEADERS but no `Request`.
 *
 * WHY IT EXISTS. A Next.js SERVER ACTION never receives a `Request` — it gets
 * `headers()` from `next/headers`. `apps/web`'s public token action is a server
 * action, so without this the only way to limit it would have been a second
 * key-derivation, and two ways of deciding "who is this caller" is exactly the
 * drift this package was created to stop.
 *
 * `clientKey(req, ...)` now delegates here, so the route-handler and
 * server-action paths cannot disagree about what a caller's bucket is. The
 * parameter type is the minimum both satisfy: `Headers` and Next's
 * `ReadonlyHeaders` both provide `get`.
 */
export function clientKeyFromHeaders(
  headers: { get(name: string): string | null },
  scope: string,
  subject?: string,
): string {
  if (subject) return `${scope}:sub:${subject}`;

  const forwarded = headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim();
  if (ip) return `${scope}:ip:${ip}`;

  // No proxy header: local dev, CI, or a direct connection. Vercel always sets
  // it, so production does not reach here.
  //
  // Collapsing every such caller into ONE bucket (the original bug) is not a
  // harmless default: a shared counter makes the limit fire EARLIER than
  // configured, so unrelated callers throttle each other and a 429 test can
  // pass for the wrong reason. Separate callers by their bearer token where
  // there is one.
  const auth = headers.get("authorization");
  if (auth) return `${scope}:tok:${fingerprintToken(auth)}`;

  // Genuinely unattributable: no subject, no IP, no credential. These DO share
  // one bucket, deliberately - it is the strict direction, and an anonymous
  // unattributable caller is exactly what we are willing to throttle hard.
  return `${scope}:unattributed`;
}

/**
 * Short, non-reversible fingerprint of a credential, used only as a bucket key.
 * The token itself is never stored, compared, or logged - only this digest.
 */
function fingerprintToken(authHeader: string): string {
  return createHash("sha256").update(authHeader).digest("hex").slice(0, 16);
}

/** 429 with the standard headers. Body is intentionally opaque. */
export function tooManyRequests(verdict: RateLimitVerdict): Response {
  return new Response(JSON.stringify({ error: "rate_limited" }), {
    status: 429,
    headers: {
      "content-type": "application/json",
      "retry-after": String(verdict.retryAfterSeconds),
      "x-ratelimit-limit": String(verdict.limit),
      "x-ratelimit-remaining": String(verdict.remaining),
    },
  });
}

/**
 * The configured rules. Tuned for a single clinic's real traffic: a patient
 * checking their appointments a few times a minute is normal, thirty booking
 * attempts a minute is not.
 */
export const RULES = {
  /** Identity/session reads on the patient auth surface. */
  authSession: { limit: 30, windowMs: 60_000 },

  /* ================================================================== */
  /* GUEST BOOKING (ITEM 6) - the project's FIRST unauthenticated write. */
  /* ================================================================== */
  //
  // WHAT IS BEING PROTECTED IS NOT A BILL. Under R9 this flow sends NO SMS, so
  // unlike the OTP ceilings below there is no spend to exhaust. What an abuser
  // can burn instead is RECEPTION'S QUEUE and the cleanliness of the patient
  // list - a hundred junk requests is a morning of somebody's work and a queue
  // nobody trusts afterwards. That is the thing being rate-limited.
  //
  // THREE INDEPENDENT AXES, because each alone is trivially bypassable: rotate
  // the phone, rotate the source, or spread thinly across both.
  //
  // The per-phone limit is TIGHTEST because a real person books once. It sits
  // at the same 3/hour as otpRequest, which is the closest analogue: a
  // legitimate human on a phone number, doing a thing once.
  /** Per phone. A real person books once; three is already generous. */
  guestBookingPhone: { limit: 3, windowMs: 60 * 60_000 },
  guestBookingPhoneDay: { limit: 5, windowMs: 24 * 60 * 60_000 },
  /** Per source. Looser than per-phone: a family or an office share an IP. */
  guestBookingIp: { limit: 5, windowMs: 60 * 60_000 },
  guestBookingIpDay: { limit: 20, windowMs: 24 * 60 * 60_000 },
  /** Tenant-wide backstop, the shape otpGlobal* established: the only limit a
   *  distributed attacker cannot rotate around. Sized so a busy real clinic
   *  never approaches it - 30 new-client requests in an hour would itself be
   *  remarkable news. */
  guestBookingGlobalHour: { limit: 30, windowMs: 60 * 60_000 },
  guestBookingGlobalDay: { limit: 100, windowMs: 24 * 60 * 60_000 },
  /** Booking writes. Deliberately tight: each one mutates the agenda. */
  booking: { limit: 10, windowMs: 60_000 },

  /**
   * The reminder-link redemption POST — `apps/web`'s `/r/[token]` confirm or
   * cancel. SEC-r-token-no-rate-limit.
   *
   * TEN PER MINUTE, matching `booking`, and for the same reason: each one that
   * gets through MUTATES AN APPOINTMENT in the clinic's diary. A patient
   * following a link from an SMS taps once, or twice if they mis-tap. Nothing
   * legitimate approaches ten.
   *
   * WHAT THIS IS AND IS NOT. It is DEFENCE IN DEPTH and a cost control, not a
   * plug for a live hole, and the card is emphatic that it must not be
   * over-read: the token is 128 bits and is not brute-forceable at any rate,
   * and a GET performs nothing — opening a link renders a page, and the action
   * runs only from the confirmation POST. What was actually exposed is an
   * unauthenticated endpoint on the patient-facing domain that hits the
   * database on every request, with nothing bounding how often.
   *
   * KEYED ON IP, NOT ON THE TOKEN, and that choice matters. Keying on the token
   * would let an attacker rotate tokens to get a fresh budget each time, which
   * is exactly the traffic worth refusing; and it would mean a patient who
   * genuinely re-taps their own link competes with nobody. The token is also a
   * credential and has no business being a bucket key.
   */
  tokenRedeem: { limit: 10, windowMs: 60_000 },

  /**
   * OTP request. Per phone AND per client, both keyed separately by the caller.
   *
   * THREE PER HOUR is deliberately mean, and the reason is money as much as
   * security: every request that gets past this sends a real SMS at the
   * clinic's expense. A patient who genuinely did not receive one retries once
   * or twice; an attacker cycling codes needs volume, and volume is what this
   * refuses.
   *
   * These rules MUST be used with checkDurableRateLimit (the Postgres store),
   * never the in-memory one. This module's own header explains why: a lockout
   * an attacker can reset by waiting for a cold serverless instance is not a
   * lockout. The memory store stays correct for coarse throttling elsewhere.
   */
  otpRequest: { limit: 3, windowMs: 60 * 60_000 },

  /**
   * OTP verify. Ten per hour per client, on top of the five-attempt cap that
   * lives on the code row itself.
   *
   * The two together are what make brute force impractical, and neither is
   * sufficient alone: the per-code cap without this lets an attacker re-request
   * codes and spend five guesses against each, while this without the per-code
   * cap lets ten guesses land against one long-lived code.
   */
  otpVerify: { limit: 10, windowMs: 60 * 60_000 },

  /**
   * THE GLOBAL SEND CEILING (SEC-otp-unauthenticated-sms-pump, direction a).
   *
   * NEITHER EXISTING OTP LIMIT BOUNDS SPEND, and that is the gap these close.
   * `otpRequest` caps 3/hour per phone and 3/hour per client key. An attacker
   * rotating numbers never approaches the first; a proxy pool defeats the
   * second, yielding 3 sends per IP per hour with NO ceiling on the total. The
   * accepted input space is ~10^8 numbers after landline rejection, so "3 per
   * key" multiplied by an unbounded number of keys is unbounded spend.
   *
   * These two are absolute. They are not per phone, not per client, and not per
   * tenant: they are checked against a CONSTANT key, so nothing the caller
   * controls can move them to a fresh bucket. See OTP_GLOBAL_HOUR_KEY.
   *
   * THE NUMBERS, and they are a clinic-scale judgement rather than a standard.
   * One clinic across two locations. The hour cap bounds a burst at roughly one
   * send a minute sustained, which is far above any real login demand and far
   * below a pump. The day cap is the one that bounds MONEY: at PT SMS pricing it
   * puts a hard floor under the worst day, and it binds before the hour cap
   * could (60 x 24 = 1440 is never reachable).
   *
   * IF A REAL CLINIC EVER TRIPS THESE, THAT IS THE SIGNAL WORKING, not a
   * misconfiguration to raise reflexively. The route logs the trip loudly. Raise
   * them deliberately, with the traffic in front of you.
   *
   * FIXED WINDOW, NOT ROLLING, because that is what the store implements
   * (see the header of this file and durable-store.ts). Calling it rolling in a
   * comment would be a promise the code does not keep: a burst spanning a window
   * boundary can spend up to two windows' budget. That is a known and accepted
   * property of a fixed window, and it still bounds spend absolutely, which
   * neither existing limit does at all.
   */
  otpGlobalHour: { limit: 60, windowMs: 60 * 60_000 },
  otpGlobalDay: { limit: 300, windowMs: 24 * 60 * 60_000 },
} as const satisfies Record<string, RateLimitRule>;

/**
 * The ceiling's keys. CONSTANTS, and that is the entire security property.
 *
 * A ceiling keyed on anything the caller supplies is not a ceiling. The obvious
 * shape - key it on `tenantId` - looks tenant-correct and is bypassable by
 * construction: `tenantId` arrives in the request body of an unauthenticated
 * endpoint and is not validated before the limit is checked, so an attacker
 * rotating it gets a fresh budget for free.
 *
 * (A `tenantId` that is not a real tenant cannot actually produce an SMS - the
 * FK on `patient_otp_codes.tenant_id` throws first - so the bypass would not
 * have spent money. It would, however, have let an attacker keep the REAL
 * tenant's counter at zero while probing, which is worse than useless: a
 * ceiling that reads healthy during an attack.)
 *
 * A constant needs no trust in the body at all. It is also correct under
 * multi-tenancy in the direction that matters: the bill is the platform's, so
 * the ceiling that protects the bill belongs to the platform.
 */
export const OTP_GLOBAL_HOUR_KEY = "otp-request:global:hour";
export const OTP_GLOBAL_DAY_KEY = "otp-request:global:day";

/* ITEM 6 - the tenant-wide guest-booking backstop. Constant keys, like the OTP
   pair above: the counter must not be divisible by anything the caller
   controls, or it is not a global limit. */
export const GUEST_BOOKING_GLOBAL_HOUR_KEY = "guest-booking:global:hour";
export const GUEST_BOOKING_GLOBAL_DAY_KEY = "guest-booking:global:day";
