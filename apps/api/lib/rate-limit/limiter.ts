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
  if (subject) return `${scope}:sub:${subject}`;

  const forwarded = req.headers.get("x-forwarded-for");
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
  const auth = req.headers.get("authorization");
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
  /** Booking writes. Deliberately tight: each one mutates the agenda. */
  booking: { limit: 10, windowMs: 60_000 },
} as const satisfies Record<string, RateLimitRule>;
