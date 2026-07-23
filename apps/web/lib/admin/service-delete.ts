/**
 * Pure decision core for the reference-guarded service hard-delete (W4-15 owner
 * ruling 2026-07-06; W12-03 refinement). Kept free of `server-only` and the DB so
 * it is unit-testable in isolation (mirrors ./pricing).
 *
 * A service is hard-deletable only when NO real-history / relationship reference
 * points at it. The four classes below are that guard set and must NEVER be
 * cascaded - a service carrying any of them stays archive-only.
 *
 * `service_location_prices` is deliberately NOT a blocker: a service's OWN
 * per-location price overrides are configuration, not history, and are removed as
 * part of its delete transaction (see `deleteService`). Before W12-03 those
 * config rows tripped the guard on their own, so every catalog service was
 * archive-only and Rodica's three archived "-" services could not be removed even
 * though they carried no bookings or analytics.
 */
export type ServiceDeleteBlocker = "appointments" | "therapist_services" | "analytics" | "pack";

/** Canonical order the UI lists blockers in when it names why a delete is refused. */
export const SERVICE_DELETE_BLOCKERS: readonly ServiceDeleteBlocker[] = [
  "appointments",
  "therapist_services",
  "analytics",
  "pack",
] as const;

/**
 * The blocker classes that refuse a service's hard-delete, in canonical order.
 * Empty => the service is hard-deletable (its own price overrides, if any, are
 * cleaned up inside the delete transaction, not here).
 */
export function serviceDeleteBlockers(
  present: Partial<Record<ServiceDeleteBlocker, boolean>>,
): ServiceDeleteBlocker[] {
  return SERVICE_DELETE_BLOCKERS.filter((cls) => present[cls] === true);
}

/** True when nothing in the guard set references the service. */
export function isServiceDeletable(
  present: Partial<Record<ServiceDeleteBlocker, boolean>>,
): boolean {
  return serviceDeleteBlockers(present).length === 0;
}
