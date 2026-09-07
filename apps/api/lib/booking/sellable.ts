import { and, eq } from "drizzle-orm";
import { getDbAdmin, locations, serviceLocationPrices, services } from "@osteojp/db";

/**
 * GUEST-08, STATED ONCE, FOR THE ENDPOINT THAT ACCEPTS AS WELL AS THE ONE THAT
 * LISTS.
 *
 * ==========================================================================
 * WHAT WAS WRONG
 * ==========================================================================
 * `GET /api/v1/booking/guest/catalog` applies FIVE conditions before it will
 * show a service at a clinic: the service is active, is not internal-only, is
 * patient-bookable, the location is active, and an ACTIVE
 * `service_location_prices` row exists for that pair. That last one is the
 * owner's 2026-08-19 ruling — offered only where priced — and it is what draws
 * the "Oferecido aqui" / "Nao oferecido aqui" badge on Administracao > Servicos.
 *
 * `POST /api/v1/booking/guest` applied NONE of them. It validated `serviceId`
 * and `locationId` as non-empty strings and inserted. The foreign keys enforce
 * that the rows EXIST; nothing enforced that the clinic SELLS the thing.
 *
 * SO THE CATALOGUE COULD HIDE A SERVICE WHILE THE SUBMIT ENDPOINT ACCEPTED ITS
 * ID. Anybody holding an id — from an older page, a bookmarked request, a
 * screenshot, or simply by trying uuids from the catalogue at a DIFFERENT
 * clinic — could put a service on reception's queue that the clinic cannot
 * sell there. `Diversos` is the worked example: `store.ts` names it as the
 * internal-only service that must never appear in a patient wizard.
 *
 * ==========================================================================
 * WHY IT IS ONE MODULE AND NOT A SECOND COPY OF THE PREDICATE
 * ==========================================================================
 * The gap was NOT that somebody forgot a check. It is that the rule lived in
 * one route's SELECT and the other route had no reason to know it existed. A
 * copied predicate would close today's hole and reopen it the day GUEST-08 is
 * amended in one file. This module is the rule; `sellable.test.ts` pins the
 * catalogue route's own SELECT to the same five clauses, so amending one
 * without the other fails the build.
 *
 * ==========================================================================
 * IT IS A SINGLE-PAIR QUESTION, DELIBERATELY NARROW
 * ==========================================================================
 * The catalogue asks "what may I show"; this asks "may THIS service be booked
 * at THIS clinic". Answering the second by materialising the first would read
 * the whole catalogue on every submit for one boolean.
 *
 * THE ANSWER IS A BOOLEAN AND NOT A REASON, and that is not laziness. This is
 * an unauthenticated endpoint whose every refusal is the same `invalid_input`
 * (SR-30's shape, and the OTP route's): a caller who learns WHY is a caller who
 * can enumerate the catalogue, the price grid and the location list from a
 * surface built to answer nothing. The reason belongs in the operator's log,
 * never in the response.
 */

/**
 * The five clauses, named so a reader and a test see the same list.
 *
 * `sellable.test.ts` asserts every one of these strings appears in the
 * catalogue route's source. That is a crude tie and it is the RIGHT crudeness:
 * it cannot be satisfied by a route that computes the right answer a different
 * way, but it CANNOT be satisfied at all by a route that silently drops one.
 */
export const GUEST_SELLABILITY_CLAUSES = [
  "services.isActive",
  "services.internalOnly",
  "services.patientBookable",
  "locations.isActive",
  "serviceLocationPrices.isActive",
] as const;

/**
 * May a member of the public book `serviceId` at `locationId` in this tenant?
 *
 * One round trip. The join IS the rule: an inner join to `locations` enforces
 * the active clinic, an inner join to `service_location_prices` enforces
 * offered-only-where-priced, and the three service columns are the wizard's own
 * conditions. A missing row on either side of either join is a `false`, which
 * is the same answer a wrong tenant gets.
 *
 * THE PRICE ROW'S VALUE IS NEVER READ. Its EXISTENCE is the whole signal, which
 * is what lets this run on a public path without exposing what anything costs.
 */
export async function isGuestSellable(args: {
  tenantId: string;
  serviceId: string;
  locationId: string;
}): Promise<boolean> {
  // A malformed uuid must ANSWER FALSE, not throw. Postgres raises 22P02 on a
  // bad uuid cast, and an unhandled throw here becomes a 500 — a fourth
  // distinguishable outcome on a surface designed to have three, which is
  // exactly the shape SEC-otp-unassigned-prefix-500 was carded for.
  try {
    const rows = await getDbAdmin()
      .select({ id: services.id })
      .from(services)
      .innerJoin(
        serviceLocationPrices,
        and(
          eq(serviceLocationPrices.serviceId, services.id),
          eq(serviceLocationPrices.tenantId, services.tenantId),
          eq(serviceLocationPrices.locationId, args.locationId),
          eq(serviceLocationPrices.isActive, true),
        ),
      )
      .innerJoin(
        locations,
        and(
          eq(locations.id, args.locationId),
          eq(locations.tenantId, services.tenantId),
          eq(locations.isActive, true),
        ),
      )
      .where(
        and(
          eq(services.tenantId, args.tenantId),
          eq(services.id, args.serviceId),
          eq(services.isActive, true),
          eq(services.internalOnly, false),
          eq(services.patientBookable, true),
        ),
      )
      .limit(1);
    return rows.length === 1;
  } catch {
    return false;
  }
}
