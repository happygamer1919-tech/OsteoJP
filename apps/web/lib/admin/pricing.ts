// Pure price-resolution helpers — no DB, no "server-only" — so they can be
// unit tested and reused on any side.

/**
 * Resolve an effective price: a per-location override wins when present,
 * otherwise the service base price. `0` is a valid override (free) and must
 * beat the base, so this uses `??` (null-coalescing), never a truthiness check.
 */
export function effectivePriceCents(
  basePriceCents: number | null,
  overridePriceCents: number | null,
): number | null {
  return overridePriceCents ?? basePriceCents;
}
