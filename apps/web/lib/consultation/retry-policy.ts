// Retry policy for the M1 fire. Pure functions, no I/O, no clock of their own —
// every function takes `now` so the whole policy is testable without waiting.
//
// It exists as its own module because the two decisions it makes are the ones
// that go silently wrong: WHICH HTTP responses count as delivered, and WHEN to
// stop trying. Both are the kind of one-line convenience the project's own §1.3
// rule warns about — a wrong classification here reports success for a
// consultation the partner never received, and the row is then skipped forever.

/**
 * Total attempts allowed for one consultation, INCLUDING the first fire from the
 * server action. After this many, the row goes to `needs_attention` and the
 * scanner stops picking it up.
 */
export const RETRY_CEILING = 8;

/** Delay before the 2nd attempt. Each further attempt multiplies by BACKOFF_FACTOR. */
export const BASE_DELAY_MS = 5 * 60 * 1000; // 5 minutes
export const BACKOFF_FACTOR = 3;
/** Cap on a single wait, so the tail does not stretch past the audio lifecycle. */
export const MAX_DELAY_MS = 12 * 60 * 60 * 1000; // 12 hours

/**
 * The bucket auto-deletes every object after 7 days (audio-storage.ts header,
 * André's infra). THIS IS A HARD BOUND ON THE WHOLE POLICY, not a note: past it
 * the object key still resolves, the presigned GET still signs, and the partner
 * fetches a 404. A retry schedule that outlived the audio would keep reporting
 * attempts against a recording that no longer exists.
 *
 * `retry-policy.test.ts` asserts the worst-case total elapsed time across all
 * RETRY_CEILING attempts stays inside this, so changing any constant above
 * without re-checking the bound turns the suite red.
 */
export const AUDIO_LIFECYCLE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * How long to wait after `attemptCount` attempts before making the next one.
 * Exponential, capped. Called with the row's attempt_count, so attemptCount = 1
 * (the first fire has happened) yields the wait before attempt 2.
 */
export function backoffDelayMs(attemptCount: number): number {
  if (!Number.isInteger(attemptCount) || attemptCount < 1) {
    // A caller that reaches here with 0 or a fraction has read the wrong column.
    // Fail rather than return a plausible 5 minutes for an unknown input.
    throw new RangeError(`backoffDelayMs: attemptCount must be an integer >= 1, got ${attemptCount}`);
  }
  const raw = BASE_DELAY_MS * BACKOFF_FACTOR ** (attemptCount - 1);
  return Math.min(raw, MAX_DELAY_MS);
}

/** The sum of every wait the policy will impose before giving up. */
export function worstCaseTotalDelayMs(): number {
  let total = 0;
  for (let n = 1; n < RETRY_CEILING; n += 1) total += backoffDelayMs(n);
  return total;
}

export function hasReachedCeiling(attemptCount: number): boolean {
  return attemptCount >= RETRY_CEILING;
}

/** The shape the scanner needs to decide. Deliberately narrower than the row. */
export type RetryCandidate = {
  attemptCount: number;
  lastAttemptAt: Date | null;
};

/**
 * Is this pending row due for another attempt?
 *
 * A row that has reached the ceiling is never due — the scanner should have
 * moved it to `needs_attention`, and answering "due" here would retry it
 * forever if that write were ever missed.
 */
export function isDue(row: RetryCandidate, now: Date): boolean {
  if (hasReachedCeiling(row.attemptCount)) return false;
  // Never attempted (the persist landed but the fire never ran): due immediately.
  if (row.lastAttemptAt === null || row.attemptCount === 0) return true;
  return now.getTime() - row.lastAttemptAt.getTime() >= backoffDelayMs(row.attemptCount);
}

export type FireVerdict = "delivered" | "retry";

/**
 * Classify an M1 HTTP response. AGREED WITH THE PARTNER — do not widen either
 * arm without them, because both errors are invisible from our side.
 *
 *   200, 201 -> delivered. The ordinary success answers.
 *
 *   409      -> DELIVERED, NOT AN ERROR. This is the one that looks wrong and is
 *               not. The partner keys on patient_id + consultation_started_at +
 *               consultation_ended_at, all three of which a retry re-sends
 *               VERBATIM from the persisted row. So a 409 means the record
 *               already exists under exactly this key — it is their idempotent
 *               refusal to create a second one, and the only way to reach it is
 *               that an EARLIER attempt of OURS was received and its
 *               acknowledgement never got back to us (dropped response, a
 *               timeout on our side, a redeploy mid-request).
 *
 *               Treating it as an error would be the expensive mistake in both
 *               directions: the row would stay pending and re-fire on every
 *               tick, each attempt earning another 409, until the ceiling
 *               dumped a consultation into `needs_attention` that had in fact
 *               been delivered correctly the first time. A human would then go
 *               looking for a lost recording that was never lost.
 *
 *   anything else -> retry. Includes every 5xx, every network-level failure the
 *               caller maps here, and ALSO 4xx codes that are not 409 (a 401 on
 *               a rotated x-make-apikey is fixed by an operator and the next
 *               attempt then succeeds; giving up on it would lose the
 *               consultation for an env change).
 *
 * Note what is NOT here: a bare 2xx check. `res.ok` covers 202 and 204, and
 * neither is an answer the partner sends. If one ever appears it means the
 * scenario changed, and staying pending surfaces that rather than recording a
 * delivery nobody made.
 */
export function classifyFireStatus(status: number): FireVerdict {
  if (status === 200 || status === 201) return "delivered";
  if (status === 409) return "delivered";
  return "retry";
}
