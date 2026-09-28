import type { Role } from "@osteojp/auth";

/**
 * T5b, revenue per clinic: WHICH CLINICS' INVOICES the Inicio revenue tile sums,
 * for one viewer. Pure, so the page and getMonthlyRevenue ask the same question
 * in the same words and a unit test can pin every role without a database.
 *
 * The answer is a list of location ids, or `null` for "no location condition"
 * (the whole tenant, which is what the tile summed for everyone before T5b):
 *
 *   - owner: every clinic by default (`null`). The owner may choose ONE clinic
 *     on Inicio (the toggle), and then it is exactly that one.
 *   - admin and reception: exactly `viewerScope`, the caller's own
 *     `staff_locations` set as `viewerLocationScope` resolves it (the app mirror
 *     of `viewer_location_ids()`, migration 0073). A request for another clinic
 *     is ignored: the toggle is the owner's, and a hand-typed `?location=` must
 *     never move an admin's figure, not even inside their own set.
 *   - admin or reception with NO assignment: `viewerScope` is `null` there, so
 *     the whole tenant. That is the PL-09 fallback, and it is the same answer
 *     three other places already give this viewer: `viewerLocationScope`
 *     (lib/auth/viewer-locations.ts), `/invoicing` (which lists every invoice
 *     for them) and the appointments RLS itself (0078: `NOT
 *     viewer_has_location_assignment() OR location_id = ANY
 *     (viewer_location_ids())`).
 *   - any other role (the therapist): `[]`, no clinic at all. getMonthlyRevenue
 *     refuses the therapist before it gets here; this is the second fence, and
 *     it fails closed rather than falling through to "the whole tenant".
 *
 * AGAINST /invoicing, THIS FIGURE AGREES FOR TWO OF THE THREE ADMIN AND
 * RECEPTION CASES, NOT ALL THREE. With ONE clinic, /invoicing pins that clinic
 * (`scopedLocationId`, lib/auth/location-choice.ts) and lists the same invoices
 * this figure sums. With NO assignment, both are the whole tenant. With TWO OR
 * MORE clinics they differ: this figure is exactly those clinics, which is what
 * T5b asks for (`viewer_location_ids()`), while /invoicing's "Todas as
 * localizacoes" resolves to no location at all, `listInvoices` then adds no
 * location condition, and the list holds every invoice of the tenant in the
 * period, including the invoices with no marcacao. So for that viewer the
 * Inicio figure can be LOWER than the same month's issued and paid invoices on
 * their /invoicing "Todas" list. The /invoicing side predates T5b and is not
 * changed here, and this figure is deliberately not widened to match it. Which
 * of the two "Todas" is right for /invoicing is an open question with a
 * recommended default: docs/design/QUESTIONS.md, Q-T5B-1.
 */
export type RevenueLocations = readonly string[] | null;

/**
 * Only the owner chooses which clinic the tile shows. One predicate, so the
 * page (which renders the toggle) and the server function (which honours the
 * choice) cannot disagree about who may make it.
 */
export function canChooseRevenueLocation(role: Role): boolean {
  return role === "owner";
}

export function revenueLocations(
  role: Role,
  viewerScope: readonly string[] | null,
  requested: string | null,
): RevenueLocations {
  if (canChooseRevenueLocation(role)) return requested ? [requested] : null;
  if (role === "admin" || role === "reception") return viewerScope;
  return [];
}
