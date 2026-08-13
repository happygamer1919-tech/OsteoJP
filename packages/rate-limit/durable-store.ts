// W13-03 (Wave 13 LOOP 3) — the durable rate-limit store WF-06 authorised.
//
// WHY THIS EXISTS, in the limiter's own words (limiter.ts:8-20): the default
// store is per-process memory, "each instance keeps its own counters and a cold
// start resets them", which is "an acceptable trade for COARSE abuse throttling"
// and is explicitly NOT acceptable for the OTP flow, because "a control an
// attacker can reset by waiting for a cold instance is not a control."
//
// That file also recorded the decision as pending: "every option is either a new
// vendor (Upstash Redis) or a new table, and neither is authorized yet."
// WF-06 (R3, owner 2026-08-05) authorised the table, on the existing Postgres,
// with no new vendor. Migration 0056 created it. This is the implementation.
//
// THE INTERFACE IS ASYNC AND THE MEMORY ONE IS NOT, which is the one promise
// limiter.ts could not keep. Its header says swapping the store is "a one-line
// change and no call site moves" — true only between synchronous stores. A
// database read cannot be synchronous, so the async seam lives here rather than
// pretending otherwise, and the sync memory store is left exactly as it is for
// the coarse throttling it already serves well. Two stores, two shapes, each
// honest about what it can promise.

import { sql } from "drizzle-orm";
import { getDbAdmin } from "@osteojp/db";

import type { RateLimitRule, RateLimitVerdict } from "./limiter";

/**
 * The durable counterpart of `RateLimitStore`. One method, async, same fixed
 * window semantics so the two implementations cannot disagree about what a
 * limit means.
 */
export type DurableRateLimitStore = {
  hit(
    key: string,
    windowMs: number,
  ): Promise<{ count: number; resetAt: Date }>;
};

/**
 * Postgres-backed fixed window.
 *
 * THE WHOLE THING IS ONE STATEMENT, and that is the point rather than a
 * micro-optimisation. A read-then-write pair — SELECT the row, decide whether
 * the window expired, then UPDATE — has a gap between the two in which a second
 * request reads the same count. Under a brute-force attempt that gap is exactly
 * when concurrency is highest, so the control would degrade precisely when it
 * matters. Folding the reset into the UPSERT's CASE makes the increment and the
 * expiry decision the same row lock.
 *
 * NOW() IS THE DATABASE'S CLOCK, not the application's, and that is deliberate:
 * serverless instances do not share a clock, and a lockout whose expiry depended
 * on whichever instance answered would be inconsistent in the same way the
 * memory store is.
 */
export function createDurableRateLimitStore(): DurableRateLimitStore {
  return {
    async hit(key, windowMs) {
      const seconds = Math.max(1, Math.ceil(windowMs / 1000));
      const rows = (await getDbAdmin().execute(sql`
        insert into rate_limit_counters (key, count, reset_at)
        values (${key}, 1, now() + make_interval(secs => ${seconds}))
        on conflict (key) do update set
          count = case
            when rate_limit_counters.reset_at <= now() then 1
            else rate_limit_counters.count + 1
          end,
          reset_at = case
            when rate_limit_counters.reset_at <= now()
              then now() + make_interval(secs => ${seconds})
            else rate_limit_counters.reset_at
          end
        returning count, reset_at
      `)) as unknown as Array<{ count: number; reset_at: string | Date }>;

      const row = rows[0];
      if (!row) {
        // Cannot happen: RETURNING on an upsert always yields the row. Treated
        // as a hard failure rather than a permissive default, because the only
        // safe direction for a rate limiter that cannot read its own counter is
        // to refuse, and a silent `{count: 1}` here would open the gate.
        throw new Error("rate-limit/durable: upsert returned no row");
      }
      return {
        count: Number(row.count),
        resetAt: row.reset_at instanceof Date ? row.reset_at : new Date(row.reset_at),
      };
    },
  };
}

/**
 * Record a hit and decide, against the durable store.
 *
 * Mirrors `checkRateLimit`'s verdict shape exactly so a caller can move between
 * the two without reinterpreting the result.
 *
 * FAIL CLOSED. If the store throws — the database is unreachable, the table is
 * missing — this REFUSES rather than allowing. That is the opposite of the usual
 * availability instinct and it is correct here: this limiter guards the OTP
 * verify path, so failing open would turn a database blip into an unlimited
 * guessing window against a 6-digit code. A patient seeing "try again shortly"
 * during an outage is a much smaller harm than an uncapped brute force.
 */
export async function checkDurableRateLimit(
  key: string,
  rule: RateLimitRule,
  store: DurableRateLimitStore,
  now: Date = new Date(),
): Promise<RateLimitVerdict> {
  let count: number;
  let resetAt: Date;
  try {
    ({ count, resetAt } = await store.hit(key, rule.windowMs));
  } catch (err) {
    // The key is already a hash and carries no PII; the cause is logged without
    // it so an operator can see the store is down without reading identities.
    console.error(
      "[rate-limit] durable store unavailable, refusing (fail closed):",
      err instanceof Error ? `${err.name}: ${err.message}` : "unknown",
    );
    return {
      ok: false,
      limit: rule.limit,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil(rule.windowMs / 1000)),
    };
  }

  return {
    ok: count <= rule.limit,
    limit: rule.limit,
    remaining: Math.max(0, rule.limit - count),
    retryAfterSeconds: Math.max(1, Math.ceil((resetAt.getTime() - now.getTime()) / 1000)),
  };
}
