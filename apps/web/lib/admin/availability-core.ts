// Pure availability-template helpers (no DB / no server-only) so the overlap
// rule is unit-testable in the node vitest environment.

/**
 * Two "HH:MM[:SS]" wall-clock intervals overlap iff each starts before the other
 * ends. String-lexicographic — zero-padded 24h times sort chronologically.
 * Touching (end == start) is NOT an overlap.
 */
export function timesOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
  return startA < endB && startB < endA;
}
