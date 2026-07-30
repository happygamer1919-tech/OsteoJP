// Conflict classification — PURE core (no DB, no server-only), so it is
// unit-testable in isolation. Mirrors the day-availability-core.ts split.
import type { ConflictInfo } from "./types";

/**
 * Availability is ADVISORY (owner ruling PL-11, 2026-07-30: "availability warning
 * is advisory, never a hard block"). Booking outside a therapist's configured
 * working hours is surfaced by the availability panel but must NEVER block a save.
 * Real double-bookings (therapist/room) and time_off absences still block by
 * default (overridable via allowConflict / "Save anyway"). This is the single
 * place that classifies a conflict kind as advisory vs blocking.
 */
export const ADVISORY_CONFLICT_KINDS: ReadonlySet<ConflictInfo["kind"]> =
  new Set<ConflictInfo["kind"]>(["availability"]);

/** Keep only the conflicts that should block a save (drops advisory kinds). */
export function blockingConflicts(conflicts: ConflictInfo[]): ConflictInfo[] {
  return conflicts.filter((c) => !ADVISORY_CONFLICT_KINDS.has(c.kind));
}
