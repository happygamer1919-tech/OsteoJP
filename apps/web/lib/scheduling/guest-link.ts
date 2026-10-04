import { and, eq, isNull } from "drizzle-orm";
import { guestBookingRequests, type DbTx } from "@osteojp/db";
import type { RequestContext } from "@osteojp/auth";

import { isLocationBookable } from "@/lib/auth/viewer-locations";
import type { ReminderEnqueueTarget } from "./reminders";

// BOOK-CONFIRM, the public-form (guest) path. Strategy dispatch S-1004-A, R40,
// owner ruled 2026-10-04: "public-form requests get linked to the appointment
// reception books for them, and that link is the approval trigger."
//
// A guest request is not booked by one action. Reception CONVERTS it (a person
// is resolved, `converted_patient_id` is written) and is sent to the ordinary
// Nova marcação drawer, which books through `createAppointment` like any staff
// booking. Until now nothing told that booking which request it answered:
// `converted_appointment_id` (0063) was never written, the appointment was a
// plain staff booking, and the patient who asked online heard nothing.
//
// The deep link now carries the request id, the drawer hands it to the booking
// action, and the action calls `linkGuestRequestTx` INSIDE its transaction.
// The link row is the fact everything else reads: the request leaves the queue
// (status `confirmed`), the event is marked, and the confirmation dispatch
// admits the appointment past its origin gate only after reading the row.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Link a converted guest request to the appointment just booked for it.
 * Returns true when the link was written, false when it was not.
 *
 * ==========================================================================
 * A FORGED OR STALE ID CHANGES NOTHING AND DOES NOT FAIL THE BOOKING
 * ==========================================================================
 * The id arrives from a URL. It may be made up, belong to another tenant, name
 * a request that was declined or is already linked, or name one converted to a
 * DIFFERENT patient. In every such case this writes nothing and answers false,
 * and the booking it sits inside commits exactly as it would have without it.
 *
 * Refusing the booking instead was considered and rejected: the appointment is
 * reception's real work and is correct on its own, and the only thing a false
 * here costs is the confirmation message, which is what every staff booking
 * already goes without. Failing would be the safer choice only if a wrong link
 * could send a message to the wrong person. It cannot: the link requires the
 * request's `converted_patient_id` to be the patient who was booked.
 *
 * WHAT IS REQUIRED, all of it re-read inside the caller's transaction:
 *   - the request is visible to this tenant (RLS; another tenant's id is no row)
 *   - it is still open: status `pending`
 *   - it was converted to THIS patient
 *   - it is not linked yet
 *   - its clinic is inside the actor's booking scope (STAFF-02, the same rule
 *     the convert and the dismiss apply)
 *
 * `handled_at` IS DELIBERATELY NOT REQUIRED TO BE NULL. A dismiss takes a
 * converted request off the queue; it is not a decline (the request stays
 * `pending`). In the order the screens lead reception through, the booking
 * comes first and the dismiss after, but the two production requests measured
 * on 2026-10-04 were both converted AND dismissed with no link, so a dismissed
 * request whose booking arrives afterwards still links.
 *
 * THE WRITE REPEATS THE PREDICATES, as the convert's does: two bookings racing
 * for one request must not both link, and zero rows updated means the other
 * one won.
 *
 * ONCE LINKED THE STATUS IS `confirmed`, which 0063 reserved for "a request
 * that became a booking" and nothing wrote until now. The queue and its count
 * read `pending`, so a linked request leaves both without a dismiss.
 *
 * IN A SAVEPOINT, AND IT NEVER THROWS. A failure here (a constraint, a lock)
 * would otherwise abort the booking's transaction. The savepoint confines it
 * to the link, exactly as care-team-auto.ts confines its own write. Logged with
 * the error NAME only (rule 7).
 */
export async function linkGuestRequestTx(
  tx: DbTx,
  actor: RequestContext,
  args: {
    guestRequestId: string | null | undefined;
    patientId: string;
    appointmentId: string;
    /** `bookingLocationScope(actor)`, computed by the caller before its transaction. */
    locationScope: string[] | null;
  },
): Promise<boolean> {
  const requestId = (args.guestRequestId ?? "").trim();
  // Shape first: a value that is not a uuid would make Postgres raise on the
  // cast, and an error is not "no row".
  if (!UUID.test(requestId)) return false;
  try {
    return await tx.transaction(async (sp) => {
      const [request] = await sp
        .select({
          id: guestBookingRequests.id,
          status: guestBookingRequests.status,
          convertedPatientId: guestBookingRequests.convertedPatientId,
          convertedAppointmentId: guestBookingRequests.convertedAppointmentId,
          locationId: guestBookingRequests.locationId,
        })
        .from(guestBookingRequests)
        .where(eq(guestBookingRequests.id, requestId))
        .limit(1);

      if (!request) return false;
      if (request.status !== "pending") return false;
      if (request.convertedPatientId !== args.patientId) return false;
      if (request.convertedAppointmentId !== null) return false;
      if (!isLocationBookable(args.locationScope, request.locationId)) return false;

      const updated = await sp
        .update(guestBookingRequests)
        .set({ convertedAppointmentId: args.appointmentId, status: "confirmed" })
        .where(
          and(
            eq(guestBookingRequests.id, request.id),
            eq(guestBookingRequests.status, "pending"),
            eq(guestBookingRequests.convertedPatientId, args.patientId),
            isNull(guestBookingRequests.convertedAppointmentId),
          ),
        )
        .returning({ id: guestBookingRequests.id });
      return updated.length > 0;
    });
  } catch (e) {
    console.error(
      "scheduling: the guest request link failed and was rolled back to its savepoint; the booking itself is unaffected",
      e instanceof Error ? e.name : "unknown",
    );
    return false;
  }
}

/**
 * The enqueue target for the appointment a guest request was linked to,
 * carrying the marker. ONE PLACE WRITES IT, the same shape as
 * `acceptedPedidoTarget` in ./pedido-acceptance.ts: the booking actions build
 * the linked occurrence's target here and every other target by hand.
 *
 * The marker only ASKS the dispatch to look. It decides nothing by itself: the
 * dispatch reads the link row before it sends anything (lib/reminders/data.ts,
 * `isGuestLinkedAppointment`).
 */
export function acceptedGuestRequestTarget(
  appointmentId: string,
  startsAt: Date,
): ReminderEnqueueTarget {
  return { appointmentId, startsAt, acceptedGuestRequest: true };
}

/**
 * Which occurrence of a booking is the one a guest request links to: the
 * EARLIEST start, the same occurrence `confirmationEligibleIndex` gives the
 * confirmation to. A series booked for a guest is one answer to one request,
 * so one occurrence is linked and confirmed. Null for an empty list.
 */
export function guestLinkOccurrence<T extends { startsAt: Date }>(created: readonly T[]): T | null {
  let best: T | null = null;
  for (const c of created) {
    if (best === null || c.startsAt.getTime() < best.startsAt.getTime()) best = c;
  }
  return best;
}
