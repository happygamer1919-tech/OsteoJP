import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { assertCan } from "@osteojp/auth";
import { guestBookingRequests, locations, patients, services } from "@osteojp/db";
import { runScoped, type RequestContext } from "@/lib/auth/context";
import { viewerLocationScope } from "@/lib/auth/viewer-locations";
import { patientPhoneMatchConds } from "./guest-match";

/**
 * ITEM 6 - reception's queue of GUEST booking requests: people with no account
 * and no patient record who asked for an appointment through the public form.
 *
 * SEPARATE FROM THE PEDIDO QUEUE ON PURPOSE. A pedido is an existing patient
 * asking to move or take a slot; the row already exists in `appointments` and
 * confirming it is a state change. A GUEST request is not an appointment at all
 * - there is no patient, no appointment and no notification behind it - and
 * confirming it CREATES both. Rendering them in one list would put two different
 * actions behind one word.
 *
 * THE POSSIBLE-EXISTING-PATIENT FLAG IS A COUNT, NEVER A LINK.
 * 0062's precedent is explicit: resolvePatientByProvenPhone REFUSES when several
 * patients share a number rather than picking one, because mis-linking a medical
 * record is the worst outcome available here. So this reports HOW MANY patients
 * share the guest's number and leaves the decision to the person reading it.
 * Zero is the ordinary case and says "new client"; one means "you may already
 * have them"; more than one means the same and warns that picking is not
 * obvious.
 *
 * IT MATCHES ON phone_e164 AT BOTH ENDS, which is why 0063 carries 0062's
 * generated-column expression verbatim and why
 * packages/db/tests/guest-phone-parity.db.test.ts gates the flow: if the two ever
 * normalise differently this returns 0 for everybody and a returning patient is
 * silently treated as new.
 */

export type GuestRequestView = {
  id: string;
  fullName: string;
  phone: string;
  serviceName: string | null;
  locationName: string | null;
  /**
   * THE PAIR, NOT JUST THE START, and that is a correctness requirement rather
   * than completeness. Under the GUEST-04 Option A ruling these two columns
   * encode a preferred DATE and a preferred PERIOD (see
   * @osteojp/db `guest-preferred-window`), and the period cannot be read off the
   * start alone: 09:00 means "morning" only when the window ends at 13:00.
   * Returning the start by itself is what let this page render "20/08/2026,
   * 09:00" for somebody who only ever said "manhã".
   */
  requestedStartsAt: Date;
  requestedEndsAt: Date;
  createdAt: Date;
  /** How many existing patients share this number. 0 = genuinely new. */
  possiblePatientMatches: number;
};

/**
 * Pending guest requests, oldest first - a queue is worked front to back, and a
 * request that has waited longest is the one somebody is most likely still
 * waiting on.
 *
 * LOCATION-SCOPED like every other reception read (PL-09): a located
 * receptionist sees the requests for their own clinic. The owner and an
 * unassigned staffer see all of them, which is the same rule listAppointments
 * applies.
 */
export async function listPendingGuestRequests(
  ctx: RequestContext,
): Promise<GuestRequestView[]> {
  assertCan(ctx.role, "appointments:read");
  const locationScope = await viewerLocationScope(ctx);

  return runScoped(ctx, async (tx) => {
    const conds = [eq(guestBookingRequests.status, "pending")];
    // `inArray`, NOT a hand-built IN list. These ids come from the database
    // rather than from a caller, so interpolating them would not be exploitable
    // today - but a parameterised predicate cannot become exploitable when
    // somebody later feeds this function a value from a request, and a
    // hand-rolled one is one refactor away from doing so.
    if (locationScope) {
      conds.push(inArray(guestBookingRequests.locationId, locationScope));
    }

    const rows = await tx
      .select({
        id: guestBookingRequests.id,
        fullName: guestBookingRequests.fullName,
        phone: guestBookingRequests.phone,
        phoneE164: guestBookingRequests.phoneE164,
        serviceName: services.name,
        locationName: locations.name,
        requestedStartsAt: guestBookingRequests.requestedStartsAt,
        requestedEndsAt: guestBookingRequests.requestedEndsAt,
        createdAt: guestBookingRequests.createdAt,
        // COUNTED IN THE SAME QUERY, as a correlated subquery, so the flag and
        // the row come from ONE snapshot. Two round trips could report a match
        // for a patient created between them, or miss one deleted between them.
        //
        // GUEST-06: the predicate is no longer written here. `patientPhoneMatchConds`
        // owns it, because convert LISTS the same set this COUNTS and the two
        // disagreeing is worse than either being wrong alone - the badge would
        // promise a match the dialog then cannot show. Building it from drizzle
        // conditions rather than raw SQL is also what removed the `p` alias: the
        // outer query selects from guest_booking_requests, so the columns are
        // unambiguous fully qualified.
        //
        // The tenant correlation this query already had is now INSIDE that
        // predicate, so the convert path carries it too rather than relying on
        // RLS alone.
        matches: sql<number>`(
          select count(*)::int from ${patients}
          where ${and(
            ...patientPhoneMatchConds(
              guestBookingRequests.tenantId,
              guestBookingRequests.phoneE164,
            ),
          )}
        )`,
      })
      .from(guestBookingRequests)
      .leftJoin(services, eq(services.id, guestBookingRequests.serviceId))
      .leftJoin(locations, eq(locations.id, guestBookingRequests.locationId))
      .where(and(...conds))
      .orderBy(asc(guestBookingRequests.createdAt));

    return rows.map((r) => ({
      id: r.id,
      fullName: r.fullName,
      phone: r.phone,
      serviceName: r.serviceName,
      locationName: r.locationName,
      requestedStartsAt: r.requestedStartsAt,
      requestedEndsAt: r.requestedEndsAt,
      createdAt: r.createdAt,
      possiblePatientMatches: Number(r.matches ?? 0),
    }));
  });
}

/** The pending count, for the notifications badge. */
export async function countPendingGuestRequests(ctx: RequestContext): Promise<number> {
  assertCan(ctx.role, "appointments:read");
  return runScoped(ctx, async (tx) => {
    const rows = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(guestBookingRequests)
      .where(eq(guestBookingRequests.status, "pending"));
    return Number(rows[0]?.n ?? 0);
  });
}
