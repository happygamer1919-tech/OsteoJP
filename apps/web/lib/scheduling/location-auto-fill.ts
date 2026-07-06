// W4-12 — location auto-fill decision (owner ruling, Ivan 2026-07-06).
//
// When a therapist is selected in booking, auto-fill Localização from that
// therapist's location assignment ONLY when they have EXACTLY ONE active
// location. Zero or multiple active locations → leave the field for manual
// selection. An auto-filled value is always editable and a manual pick is never
// clobbered. This pure decision is extracted so the ruling is unit-testable in
// the node test env (the booking drawer is effect-driven and not renderable
// there).

export interface LocationAutoFillGuards {
  /** The therapist field was changed by the user (not an initial/edit value). */
  userChangedTherapist: boolean;
  /** The location field was already changed by the user — never clobber it. */
  userChangedLocation: boolean;
}

/**
 * The location id to auto-fill, or null to leave the field as-is.
 * Auto-fills only on a real therapist selection, only when the therapist has
 * exactly one active location, and never over a manual location pick.
 */
export function pickAutoFillLocation(
  activeLocationIds: readonly string[],
  guards: LocationAutoFillGuards,
): string | null {
  if (!guards.userChangedTherapist) return null;
  if (guards.userChangedLocation) return null;
  return activeLocationIds.length === 1 ? activeLocationIds[0] : null;
}
