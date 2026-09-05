import "server-only";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
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
  /**
   * LE-guest-convert-abandoned-booking, option B: reception created the person
   * and the row STAYED HERE, because nothing has recorded a booking for them.
   *
   * It is derived from `converted_patient_id`, which is the only fact this
   * table holds about it. It deliberately does NOT mean "has no appointment" -
   * nothing writes `converted_appointment_id`, so the system cannot know that -
   * it means "this queue has no booking recorded against this request", which
   * is what the row says on screen and is true by construction.
   */
  converted: boolean;
};

/**
 * Pending guest requests, oldest first - a queue is worked front to back, and a
 * request that has waited longest is the one somebody is most likely still
 * waiting on.
 *
 * ==========================================================================
 * SEC-01, owner ruling 2026-08-18. WHO MAY READ THIS AT ALL.
 * ==========================================================================
 * OWNER, ADMIN AND RECEPTION. A THERAPIST GETS NOTHING.
 *
 * THE DEFECT THIS CLOSES, observed on deployed production: a therapist
 * (assigned to two clinics) opened /notificacoes and saw the ENTIRE "Pedidos de
 * novos clientes" section - names, phone numbers and convert buttons - for the
 * whole tenant, including requests submitted by other staff.
 *
 * IT WAS TWO THINGS AT ONCE, AND ONLY ONE OF THEM LOOKS LIKE A BUG:
 *   1. The gate was `appointments:read`, which EVERY role holds, because every
 *      role works the calendar. So the capability check passed for a therapist
 *      and read as a real check while gating nothing.
 *   2. `viewerLocationScope` returns `null` for a therapist - correct for the
 *      agenda, where a therapist is bounded by their own-data rules rather than
 *      by location, and catastrophic here, because `null` means UNRESTRICTED.
 *      The one role with no location scope got the widest possible read.
 *
 * The two combined turn "a therapist may read appointments" into "a therapist
 * may read every stranger's phone number in the tenant". Neither line is wrong
 * on its own, which is why this survived review; the gate is now a capability
 * that means what this list actually is.
 *
 * `guest_requests:read` IS A SEPARATE CAPABILITY ON PURPOSE. A guest request is
 * not an appointment - no patient, no appointment row, no practitioner - so
 * there is nothing about it that scopes to a therapist the way an appointment
 * does. There is no therapist-shaped subset of this queue to hand out.
 *
 * IT THROWS RATHER THAN RETURNING AN EMPTY LIST. `notificacoes/page.tsx` does
 * not call this for a role that may not read it, so the throw is unreachable
 * through the UI - and that is the point. An empty list is a valid answer that
 * a future caller would render as "no requests"; a throw is not something a
 * caller can mistake for data. The page hiding the section is the courtesy; this
 * is the boundary.
 *
 * LOCATION-SCOPED like every other reception read (PL-09): a located
 * receptionist or admin sees the requests for their own clinic. The owner sees
 * all of them. An UNASSIGNED reception or admin user is unrestricted, mirroring
 * STAFF-02 and PL-09's own documented fallback, so nobody is locked out
 * mid-onboarding; assigning them a location in Equipa makes the restriction take
 * effect.
 */
export async function listPendingGuestRequests(
  ctx: RequestContext,
): Promise<GuestRequestView[]> {
  assertCan(ctx.role, "guest_requests:read");
  const locationScope = await viewerLocationScope(ctx);

  return runScoped(ctx, async (tx) => {
    // TWO CONDITIONS NOW, AND THE SECOND ONE IS THE FEATURE. Since the owner's
    // option B ruling the convert no longer moves the status, so `pending`
    // alone would keep a converted row here for ever. What takes a row out of
    // reception's queue is `handled_at` - the dismiss - and nothing else.
    const conds = [
      eq(guestBookingRequests.status, "pending"),
      isNull(guestBookingRequests.handledAt),
    ];
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
        convertedPatientId: guestBookingRequests.convertedPatientId,
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
      converted: r.convertedPatientId !== null,
    }));
  });
}

/**
 * The pending count, for the notifications badge.
 *
 * SEC-01: SAME GATE AND SAME SCOPE AS THE LIST, and it had NEITHER before.
 *
 * IT HAS NO CALLER TODAY, which is precisely why it is fixed in this PR rather
 * than left. A counterpart of a secured read that is itself unsecured is the
 * shape that drifts: the badge is the obvious next thing somebody wires up, and
 * a count is easy to read as harmless because it returns no names. It is not
 * harmless - it is a count of how many strangers the clinic is holding contact
 * details for, answered for a role that may not know the queue exists, across
 * locations that role may not read.
 *
 * The location scope was missing too, so a located receptionist would have seen
 * a badge counting the OTHER clinic's requests and then opened a shorter list.
 * A badge that disagrees with the list it describes is its own defect.
 */
export async function countPendingGuestRequests(ctx: RequestContext): Promise<number> {
  assertCan(ctx.role, "guest_requests:read");
  const locationScope = await viewerLocationScope(ctx);

  return runScoped(ctx, async (tx) => {
    // THE SAME TWO CONDITIONS AS THE LIST, and the paragraph above this function
    // is why: a badge that disagrees with the list it describes is its own
    // defect. Option B made the predicate two clauses instead of one, and a
    // count still reading `status = 'pending'` alone would have counted every
    // converted row this queue no longer shows once it is dismissed.
    const conds = [
      eq(guestBookingRequests.status, "pending"),
      isNull(guestBookingRequests.handledAt),
    ];
    if (locationScope) {
      conds.push(inArray(guestBookingRequests.locationId, locationScope));
    }
    const rows = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(guestBookingRequests)
      .where(and(...conds));
    return Number(rows[0]?.n ?? 0);
  });
}
