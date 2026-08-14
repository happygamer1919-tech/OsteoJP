import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { getDbAdmin, locations, services } from "@osteojp/db";

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
    /** Which clinics offer it. Empty means every clinic in `locations`. */
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
      // A location-bound service only lists if its location is active, matching
      // the authenticated catalog. Otherwise the form would offer a service at a
      // clinic that is closed.
      .filter((s) => s.locationId === null || activeLocationIds.includes(s.locationId))
      .map((s) => ({
        id: s.id,
        name: s.name,
        // WHICH CLINIC OFFERS WHAT IS PART OF THE PUBLISHED CATALOG, not an
        // internal field: it is what the clinic's own site says about where a
        // treatment is available. Without it the form could produce a
        // service/clinic pair the clinic does not offer, and reception would
        // find out by telephone.
        locationIds: s.locationId === null ? activeLocationIds : [s.locationId],
      })),
  };

  return NextResponse.json(payload);
}
