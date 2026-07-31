/**
 * PL-18 — "is this staff member silently unrestricted?"
 *
 * Owner CR 2026-07-31, reported by reception: "currently reception, in team
 * schedule, agenda and other can choose from locations and are seeing all staff
 * from both locations". The audit found no missing rule — `viewerLocationScope`
 * has always treated reception exactly like admin, and every location control
 * routes through it. What produces that screen is the rule's own FALLBACK:
 *
 *   reception/admin with NO `staff_locations` row -> scope `null`
 *   scope `null` -> "not location-restricted" -> every clinic, every colleague
 *
 * The fallback is deliberate (a staffer must never be locked out of their own
 * clinic between account creation and assignment) and it is going to stay until
 * Q-PL-18-1 is answered. What it must stop being is INVISIBLE: the platform
 * looked broken while doing exactly what it was told.
 *
 * Pure, so Equipa and any future surface ask the same question the same way,
 * and so the rule is testable without rendering a page.
 */

/** The roles `viewerLocationScope` restricts by location at all. */
export function isLocationScopedRole(role: string | null | undefined): boolean {
  return role === "reception" || role === "admin";
}

/**
 * True when this member is subject to location scoping, is active, and holds no
 * `staff_locations` membership — i.e. the fallback is live for them right now.
 *
 * `membershipCount` MUST come from `staff_locations` alone, never from the
 * Equipa location chips: those are working hours UNION staff_locations (PL-14),
 * so an admin with working hours displays a clinic chip while the scope still
 * sees zero memberships and falls back to all. The chips answer "where does this
 * person work"; this answers "what does the platform actually restrict them to".
 *
 * An INACTIVE member is not flagged: they cannot sign in, so there is no
 * over-broad view to warn about, and flagging archived accounts would bury the
 * one row that matters.
 */
export function seesEveryLocation(
  role: string | null | undefined,
  isActive: boolean,
  membershipCount: number,
): boolean {
  return isLocationScopedRole(role) && isActive && membershipCount === 0;
}
