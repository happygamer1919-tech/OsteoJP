import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { getDbAdmin, locations, serviceLocationPrices, services } from "@osteojp/db";

import { createDurableRateLimitStore, checkDurableRateLimit } from "@/lib/rate-limit/durable-store";
import { RULES, clientKey, tooManyRequests } from "@/lib/rate-limit/limiter";

/**
 * GET /api/v1/booking/guest/catalog — the ONE unauthenticated READ the guest
 * form is allowed. GUEST-04, Option A, ratified 2026-08-14.
 *
 * THE RULING IT IMPLEMENTS, because the shape only makes sense against it. The
 * guest form collects a service, a clinic, a preferred date and a preferred
 * period. It shows no therapist, no slot grid and no availability of any kind:
 * reception resolves the real slot when they call. So the form needs exactly one
 * thing this API can answer without a patient principal — WHAT CAN BE BOOKED AND
 * WHERE — and that is all this route returns.
 *
 * THE TWO READS THIS ROUTE IS NOT. `booking/therapists` and `booking/slots` stay
 * authenticated, permanently and by ruling. Both are recorded as MUST-NEVER rows
 * (MN-24, MN-25) in docs/recon/W13-06-exposure-matrix.md, where the suite that
 * enforces the exposure matrix will make the next person adding a route read
 * them. The reasoning, in one line each: a public roster tells a stranger who
 * works at a clinic, and a public slot list tells them when the building is
 * empty and when a named therapist is not with a patient.
 *
 * WHY DISCLOSING THIS IS SAFE, AND IT IS AN ARGUMENT ABOUT THE DATA RATHER THAN
 * ABOUT THE CALLER. Every row here is already published: the services are on
 * osteojp.pt, and both clinics are on the portal's own public Clínicas page with
 * their addresses and telephone numbers. Nothing about any PERSON is reachable
 * through it — no patient, no therapist, no appointment, no schedule. The
 * projection is `id` and `name` and nothing else: no price, no duration, no
 * internal flag.
 *
 * `tenantId` IS AN UNVERIFIED QUERY PARAMETER, and that is unavoidable rather
 * than careless — the route runs before any authentication, exactly as
 * `auth/otp/request` does, so there is no token to derive a tenant from. What
 * follows from it is bounded: a caller who guesses a tenant uuid learns that
 * tenant's published service names. It is NOT a rate-limit key (that would be
 * the bypass OTP_GLOBAL_HOUR_KEY's comment describes), and it is NOT an oracle
 * for anything private — an unknown or empty tenant answers with empty lists,
 * exactly as a real tenant with nothing bookable would.
 *
 * RATE LIMITED PER SOURCE, on the DURABLE store. Two windows. There is no global
 * ceiling on this read, deliberately; RULES.guestCatalogIp carries the reasoning.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type PublicBookingCatalog = {
  locations: { id: string; name: string }[];
  services: {
    id: string;
    name: string;
    /**
     * Which clinics offer it. NEVER EMPTY: a service offered at no active
     * clinic is dropped from the response entirely (see the filter below), so a
     * consumer must not read an empty list as "every clinic". It used to mean
     * exactly that, before the GUEST-08 ruling of 2026-08-19 made the price grid
     * the authority, and the sentence outlived the rule.
     */
    locationIds: string[];
  }[];
};

export async function GET(req: Request): Promise<Response> {
  const store = createDurableRateLimitStore();
  for (const [key, rule] of [
    [clientKey(req, "guest-catalog:min"), RULES.guestCatalogIp],
    [clientKey(req, "guest-catalog:hour"), RULES.guestCatalogIpHour],
  ] as const) {
    const verdict = await checkDurableRateLimit(key, rule, store);
    if (!verdict.ok) return tooManyRequests(verdict);
  }

  const tenantId = new URL(req.url).searchParams.get("tenantId");
  if (!tenantId) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const db = getDbAdmin();
  const [locationRows, serviceRows] = await Promise.all([
    db
      .select({ id: locations.id, name: locations.name })
      .from(locations)
      .where(and(eq(locations.tenantId, tenantId), eq(locations.isActive, true)))
      .orderBy(asc(locations.name)),
    db
      .select({
        id: services.id,
        name: services.name,
        locationId: services.locationId,
      })
      .from(services)
      // THE SAME FOUR PREDICATES THE AUTHENTICATED CATALOG USES, and they must
      // stay the same four. `internal_only` (W12-26) and `patient_bookable`
      // (0057, Decision B) are how the clinic says a service is not for
      // self-booking; a public form that ignored either would offer strangers
      // something a logged-in patient is not allowed to book, which is the
      // wrong direction for the one endpoint with no caller identity at all.
      .where(
        and(
          eq(services.tenantId, tenantId),
          eq(services.isActive, true),
          eq(services.internalOnly, false),
          eq(services.patientBookable, true),
        ),
      )
      .orderBy(asc(services.name)),
  ]);

  const activeLocationIds = locationRows.map((l) => l.id);

  // ==========================================================================
  // WHERE A SERVICE IS OFFERED. Owner ruling 2026-08-19 (GUEST-08).
  // ==========================================================================
  // THE AUTHORITY IS `service_location_prices`, AND IT IS NOT A PRICE LOOKUP.
  // W8-01a calls this offered-only-where-priced: a service is offered at a
  // location IFF AN ACTIVE PRICE ROW EXISTS THERE. That single rule is what
  // draws the "Oferecido aqui" / "Nao oferecido aqui" badge on
  // Administracao > Servicos, which is the screen the clinic actually
  // maintains, and it is the configuration the owner named.
  //
  // WHAT THIS REPLACES, AND THE OLD PREDICATE WAS A DIFFERENT QUESTION.
  // This route derived the answer from `services.location_id` - null meaning
  // "all locations". That column scopes a service to a clinic; it says nothing
  // about whether the clinic offers it. The two disagree the moment somebody
  // turns a service off at one clinic in Servicos, because that action writes
  // a price row and never touches `services.location_id`. Observed exactly
  // that way: Drenagem Linfatica reads "Nao oferecido aqui" at Castelo Branco
  // and "Oferecido aqui" at Linda-a-Velha, while this endpoint reported it
  // available at both and the public form offered it at both.
  //
  // NO NEW PUBLIC SURFACE (MN-27, MN-28). The response keeps exactly the keys
  // it had - `locationIds` already existed and is still the only place-shaped
  // field. What changed is which locations land in it. No price, no count and
  // no configuration detail is exposed: a price row's EXISTENCE is read, its
  // VALUE never leaves this function.
  //
  // A SERVICE PRICED NOWHERE NOW LISTS NOWHERE, and that is the rule rather
  // than an edge case. Administracao > Servicos already shows such a service as
  // "Nao oferecido aqui" at every clinic, so the public form disappearing it is
  // the form agreeing with the screen the clinic reads. It does mean the
  // catalog is only as complete as the price grid.
  const offeringRows = await db
    .select({
      serviceId: serviceLocationPrices.serviceId,
      locationId: serviceLocationPrices.locationId,
    })
    .from(serviceLocationPrices)
    .where(
      and(
        eq(serviceLocationPrices.tenantId, tenantId),
        eq(serviceLocationPrices.isActive, true),
      ),
    );

  // serviceId -> the active locations it is priced at, intersected with the
  // ACTIVE locations. A price row at a closed clinic must not resurrect it.
  const offeredLocationsByService = new Map<string, string[]>();
  for (const row of offeringRows) {
    if (!activeLocationIds.includes(row.locationId)) continue;
    const list = offeredLocationsByService.get(row.serviceId);
    if (list) list.push(row.locationId);
    else offeredLocationsByService.set(row.serviceId, [row.locationId]);
  }

  const payload: PublicBookingCatalog = {
    // MAPPED EXPLICITLY, not passed through, and the difference is not stylistic
    // on a public endpoint. Passing `locationRows` straight out makes the SELECT
    // above the only thing standing between the internet and whatever a future
    // edit adds to it - `address`, `isActive`, a phone number - and that edit
    // would read as harmless in a diff because the response line would not
    // change at all. The projection is stated in the place the response is
    // built, and `catalog/route.test.ts` §2 pins both key sets.
    locations: locationRows.map((l) => ({ id: l.id, name: l.name })),
    services: serviceRows
      .map((s) => ({
        id: s.id,
        name: s.name,
        // WHICH CLINIC OFFERS WHAT IS PART OF THE PUBLISHED CATALOG, not an
        // internal field: it is what the clinic's own site says about where a
        // treatment is available. Without it the form could produce a
        // service/clinic pair the clinic does not offer, and reception would
        // find out by telephone.
        //
        // `services.location_id` IS STILL HONOURED, as a CEILING rather than as
        // the answer. A service scoped to one clinic cannot be offered at
        // another, whatever a stray price row says, so the two are intersected:
        // the price grid decides where a service is offered, and the scope
        // decides where it COULD be. Neither alone is right - the scope ignores
        // what the clinic configured, and the grid alone would let a
        // clinic-specific service surface somewhere it was never meant to.
        locationIds: (offeredLocationsByService.get(s.id) ?? []).filter(
          (id) => s.locationId === null || id === s.locationId,
        ),
      }))
      // A service offered at NO active clinic is not listed at all. It would be
      // an unpickable row: every clinic choice would filter it away, so the
      // visitor would see a name they can never reach.
      .filter((s) => s.locationIds.length > 0),
  };

  return NextResponse.json(payload);
}
