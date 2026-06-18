// tools/fisiozero-extractor/src/util.ts
//
// Small pure helpers: sleep, jittered delay, exponential backoff. Kept separate
// so the timing math is unit-testable without real timers.

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

/** Uniform random integer in [min, max]. `rng` injectable for deterministic tests. */
export function randomBetween(min: number, max: number, rng: () => number = Math.random): number {
  if (max < min) [min, max] = [max, min];
  return Math.floor(min + rng() * (max - min + 1));
}

/**
 * Exponential backoff with full jitter for retry `attempt` (0-based):
 * random in [0, base * 2^attempt], capped at `capMs`.
 */
export function backoffDelay(attempt: number, baseMs: number, capMs = 30_000, rng: () => number = Math.random): number {
  const ceiling = Math.min(capMs, baseMs * 2 ** attempt);
  return Math.floor(rng() * ceiling);
}
