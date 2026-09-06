import "server-only";
import { and, asc, eq, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { appointmentRescheduleRequests, appointments, patients, users } from "@osteojp/db";
import { runScoped, type RequestContext } from "@/lib/auth/context";

// SEC-reschedule-request-has-no-row — the READ half of migration 0080, and the
// screen INC-CONFIRM-10 said did not exist.
//
// ==========================================================================
// WHY THIS IS NOT A SECOND `listPendingRequests`
// ==========================================================================
// They answer different questions and the incident happened because the two
// were conflated. `listPendingRequests` asks "which portal BOOKINGS is
// reception yet to accept" and is keyed on `appointments.origin`. This asks
// "who has asked to MOVE an appointment that already exists", and it is keyed
// on nothing about the appointment at all — a staff-created booking produces a
// request row exactly like a portal one, which is the "independent of origin"
// half of the owner's ruling.
//
// ==========================================================================
// THERE IS NO ROLE GATE ON THIS READ, AND THAT IS SEC-01's LESSON APPLIED
// RATHER THAN IGNORED
// ==========================================================================
// SEC-01 was a tenant-wide table (`guest_booking_requests`) added to a page
// whose stated reason for having no role check was that every row was
// per-recipient. That reason silently became false and nothing re-read it.
//
// This table is ALSO tenant-wide — one row per request, no recipient column.
// The difference is that its POLICY is not tenant-wide: migration 0080 scopes
// every row to "can you see the appointment this is about", by EXISTS against
// `appointments` evaluated under `appointments_rls`. So a therapist sees
// requests for their own patients' appointments, reception sees the ones at
// their locations, and the owner sees all — WITHOUT this file naming a role.
//
// THAT IS THE PROPERTY THAT MAKES "BOTH PRACTITIONERS ARE NOTIFIED" TRUE BY
// CONSTRUCTION. `appointments_rls`'s therapist arm is
// `practitioner_id = auth.uid() OR practitioner_2_id = auth.uid()`, so a
// second practitioner sees the request through the same expression that lets
// them see the appointment. Nothing here fans out, so nothing here can fan out
// to one practitioner and fail on the other — which two INSERTs could.

/** One unhandled reschedule request, as reception's queue renders it. */
export type RescheduleRequestEntry = {
  id: string;
  appointmentId: string;
  patientId: string;
  /** Joined at read time, never stored. Same rule as the notification centre:
   *  a queue row must not become a second, stale copy of a patient's name. */
  patientName: string | null;
  /** The appointment AS IT STANDS NOW, not as it stood when the patient asked.
   *  Reception has to act on the current booking, and `centre.ts` already
   *  established this distinction for the pedido queue. */
  startsAt: Date;
  endsAt: Date;
  practitionerName: string | null;
  practitionerTwoName: string | null;
  /** When the PATIENT pressed. */
  requestedAt: Date;
  /** How they asked. One value today ('sms_code'); rendered as a label so a
   *  second channel does not need this type to change. */
  via: string;
};

/** How many the queue lists. Same finite-worklist reasoning as CENTRE_PAGE_SIZE. */
export const RESCHEDULE_QUEUE_PAGE_SIZE = 50;

/**
 * The open queue: reschedule requests nobody has dealt with yet.
 *
 * ORDERED OLDEST FIRST, and that is the opposite of the notification centre on
 * purpose. The centre is a log, so it is newest-first. This is a worklist, and
 * the person who has waited longest is the one to answer — the appointment's
 * own start time is NOT the ordering key here, because a request about a visit
 * three weeks out is still a patient waiting for a reply today.
 */
export async function listOpenRescheduleRequests(
  ctx: RequestContext,
  limit: number = RESCHEDULE_QUEUE_PAGE_SIZE,
): Promise<RescheduleRequestEntry[]> {
  return runScoped(ctx, async (tx) => {
    // Two more `users` references for the practitioners' names. `alias` rather
    // than raw SQL so the join stays typed and the column list cannot drift.
    const prac = alias(users, "reschedule_prac");
    const prac2 = alias(users, "reschedule_prac2");
    const rows = await tx
      .select({
        id: appointmentRescheduleRequests.id,
        appointmentId: appointmentRescheduleRequests.appointmentId,
        patientId: appointmentRescheduleRequests.patientId,
        patientName: patients.fullName,
        startsAt: appointments.startsAt,
        endsAt: appointments.endsAt,
        practitionerName: prac.fullName,
        practitionerTwoName: prac2.fullName,
        requestedAt: appointmentRescheduleRequests.requestedAt,
        via: appointmentRescheduleRequests.via,
      })
      .from(appointmentRescheduleRequests)
      // INNER, not LEFT. A request whose appointment this reader cannot see is
      // not "a request with a missing appointment" — it is a request that is
      // none of their business, and the policy has already excluded it. An
      // outer join here would render a row with blank details rather than not
      // rendering it, which is the §1.3 shape: an excluded case wearing the
      // face of a benign one.
      .innerJoin(appointments, eq(appointments.id, appointmentRescheduleRequests.appointmentId))
      .leftJoin(patients, eq(patients.id, appointmentRescheduleRequests.patientId))
      .leftJoin(prac, eq(prac.id, appointments.practitionerId))
      .leftJoin(prac2, eq(prac2.id, appointments.practitionerTwoId))
      .where(isNull(appointmentRescheduleRequests.handledAt))
      .orderBy(asc(appointmentRescheduleRequests.requestedAt))
      .limit(limit);
    return rows;
  });
}

/**
 * Clear one request off the queue.
 *
 * ==========================================================================
 * IT STAMPS, IT DOES NOT DELETE, AND IT DOES NOT TOUCH THE APPOINTMENT
 * ==========================================================================
 * A handled request is the record that a patient asked and the clinic answered.
 * 0080 grants no DELETE to anybody for that reason.
 *
 * AND IT DELIBERATELY DOES NOT MOVE THE BOOKING. Reception moves appointments
 * in the agenda, where the conflict checks, the slot lock and the audit trail
 * live. A "reschedule" button here would be a second, thinner write path onto
 * the same rows — the double-booking family of incidents, invited back in.
 * Marking handled says "I have dealt with this patient", nothing more.
 *
 * THE `handled_at IS NULL` PREDICATE IS ON THE UPDATE ITSELF, so two receptionists
 * pressing at once cannot both win and the second is told nothing changed. The
 * same shape PACK-01's link write uses.
 */
export async function markRescheduleRequestHandled(
  ctx: RequestContext,
  requestId: string,
): Promise<{ ok: boolean }> {
  const actor = ctx.userId ?? null;
  if (actor === null) return { ok: false };
  const updated = await runScoped(ctx, async (tx) =>
    tx
      .update(appointmentRescheduleRequests)
      .set({ handledAt: new Date(), handledBy: actor })
      .where(
        and(
          eq(appointmentRescheduleRequests.id, requestId),
          isNull(appointmentRescheduleRequests.handledAt),
        ),
      )
      .returning({ id: appointmentRescheduleRequests.id }),
  );
  return { ok: updated.length === 1 };
}
