"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq, sql } from "drizzle-orm";
import { guestBookingRequests, patients } from "@osteojp/db";

import { requireRequestContext, runScoped } from "@/lib/auth/context";
import { bookingLocationScope, isLocationBookable } from "@/lib/auth/viewer-locations";
import { insertPatientTx } from "@/lib/patients/insert";
import { writeAudit } from "@/lib/patients/audit";
import { lisbonParts } from "./time";
import { patientPhoneMatchConds } from "./guest-match";

/**
 * GUEST-06 — reception converts a guest booking request.
 *
 * ===========================================================================
 * WHAT THIS ACTION DOES, AND THE SHORTER LIST OF WHAT IT DOES NOT
 * ===========================================================================
 * It resolves a person and marks the request handled. It DOES NOT BOOK.
 *
 * The appointment is created afterwards by the ordinary staff booking path —
 * the agenda's create drawer calling `createAppointment` — carrying every guard
 * that path already has: the STAFF-02 location refusal, the PL-10 therapist
 * lock, the conflict check, the 0061 double-booking constraint, the reminder
 * enqueue and the audit row. A direct write from here would have been a second
 * booking path, and a second booking path is the INC-08 shape: two ways to
 * reach one state, one of them missing a guard nobody notices is missing.
 *
 * So the convert PREFILLS. Its return value is the deep link the queue follows.
 *
 * ===========================================================================
 * THE DECISION IS THE PRODUCT, AND THE SERVER NEVER MAKES IT
 * ===========================================================================
 * 0062's precedent binds and GUEST-03 restated it: the possible-existing-patient
 * flag is a COUNT and never a link, because mis-linking a medical record is the
 * worst outcome available here. So `resolution` is REQUIRED on every call, in
 * every case, including the ordinary zero-match one. There is no default arm and
 * no "decide for me" value:
 *
 *   { kind: "new_patient" }                  create a person
 *   { kind: "existing_patient", patientId }  this IS somebody we already have
 *
 * A caller that omits it does not get a guess, it gets `validation`. That is
 * PORTAL-REHYDRATE §1.3 applied to a write: the unknown case fails rather than
 * collapsing onto the harmless-looking one — and here the harmless-looking one
 * ("just create a new patient") is precisely the duplicate the flag exists to
 * prevent.
 *
 * `new_patient` STAYS LEGAL WHEN THE PHONE MATCHES, deliberately. Households
 * share a number; a mother booking for her son is not a duplicate. Refusing it
 * would send reception to create the patient by hand somewhere else and come
 * back, which is the same row with the request no longer attached to it.
 *
 * `existing_patient` IS THE ARM THAT IS POLICED. The named patient must be in
 * the match set THIS SERVER derives, re-read inside the transaction — not the
 * set the browser was shown, which is a snapshot from whenever the page rendered.
 * Without that check the action would attach a guest request to any patient id a
 * caller cared to name, which is mis-linking with the flag still switched on.
 *
 * ===========================================================================
 * "converted" IS SPELLED `confirmed`, AND THAT IS A CONSTRAINT, NOT A CHOICE
 * ===========================================================================
 * Migration 0063 pins the vocabulary:
 *   CONSTRAINT guest_booking_requests_status_check
 *     CHECK (status IN ('pending', 'confirmed', 'declined'))
 * There is no 'converted' member and adding one is a migration. So a converted
 * request is `status = 'confirmed'` WITH `converted_patient_id` set, which is
 * exactly the pair 0063 created those columns for. The queue reads
 * `status = 'pending'`, so the row leaves it either way; `converted_patient_id`
 * is what distinguishes a conversion from a decline after the fact.
 *
 * `converted_appointment_id` IS LEFT NULL HERE ON PURPOSE. No appointment exists
 * yet — see the first section. It is the column that records the booking once the
 * staff path makes one, and writing an id into it now would be a claim that a
 * patient has an appointment when they have not.
 *
 * THE GAP THAT LEAVES, STATED RATHER THAN HIDDEN: reception can convert and then
 * abandon the booking drawer, and the request has already left the queue. The
 * patient row survives that — it is created, audited, findable in Pacientes, and
 * "Nova marcação" from their profile (W6-03) resumes the flow — so nothing is
 * lost, but nothing chases it either. Carded as LE-guest-convert-abandoned-booking.
 */

/** Internal: the only way to abort the transaction after the patient insert. */
class GuestConvertRace extends Error {
  constructor() {
    super("guest request was handled by another actor");
    this.name = "GuestConvertRace";
  }
}

export type GuestConvertResolution =
  | { kind: "new_patient" }
  | { kind: "existing_patient"; patientId: string };

export type GuestConvertError =
  /** The caller's role may not work the front desk. */
  | "forbidden"
  /** No pending request with that id is visible to this caller. */
  | "not_found"
  /** Somebody else converted or declined it first. Its own code because the
   *  answer is "refresh, it is handled", not "that does not exist". */
  | "already_handled"
  /** STAFF-02: the request belongs to a clinic outside the actor's assignment. */
  | "location_not_assigned"
  /** `existing_patient` named a patient this phone number does not match. The
   *  flag-never-link refusal, named separately so a test can assert exactly it
   *  and reception is told WHICH thing was refused. */
  | "match_not_found"
  /** No resolution supplied, or a malformed one. */
  | "validation";

export type GuestConvertResult =
  | {
      ok: true;
      data: {
        patientId: string;
        /** Everything the staff booking flow should open with. Ids only —
         *  the agenda re-resolves each against the options it actually loaded
         *  before preselecting anything (see agenda/page.tsx). */
        prefill: { serviceId: string; locationId: string; date: string };
      };
    }
  | { ok: false; error: GuestConvertError };

export type GuestPatientMatch = {
  id: string;
  fullName: string;
  /** Rodica disambiguates same-name patients by NIF; the queue dialog must let
   *  reception do the same. Null for a stub patient that has none. */
  nif: string | null;
  patientNumber: number;
};

/**
 * FRONT DESK ONLY, and it is a ROLE check rather than a capability one.
 *
 * Every role in the matrix holds `patients:write` and `appointments:write`,
 * therapists included — so a capability gate here would refuse nobody and would
 * read like a control while being one. STAFF-06 made the same distinction in the
 * other direction: the capability says which surfaces you may reach, the scope
 * says whose data you may touch.
 *
 * A therapist does not answer the phone or work the request queue, and convert
 * is the front desk's judgement call about who a caller IS. Owner, admin and
 * reception; therapist refused. Recorded on the card because the dispatch said
 * "role gate" without naming the roles.
 */
function isFrontDesk(role: string): boolean {
  return role === "owner" || role === "admin" || role === "reception";
}

/**
 * The patients this request's number matches, for the resolution dialog.
 *
 * FETCHED ON DEMAND, never rendered into the queue with every row. The queue
 * shows a COUNT; names arrive only when somebody opens the one row they are
 * working. That keeps a list of patient names off a page that renders for every
 * staff member on every visit, which is the same payload-minimisation argument
 * PG4 makes about the notification centre.
 */
export async function listGuestRequestMatches(
  requestId: string,
): Promise<{ ok: true; data: GuestPatientMatch[] } | { ok: false; error: GuestConvertError }> {
  const ctx = await requireRequestContext();
  if (!isFrontDesk(ctx.role)) return { ok: false, error: "forbidden" };

  return runScoped(ctx, async (tx) => {
    const [request] = await tx
      .select({
        status: guestBookingRequests.status,
        phoneE164: guestBookingRequests.phoneE164,
        locationId: guestBookingRequests.locationId,
      })
      .from(guestBookingRequests)
      .where(eq(guestBookingRequests.id, requestId))
      .limit(1);

    if (!request) return { ok: false as const, error: "not_found" as const };
    if (request.status !== "pending") {
      return { ok: false as const, error: "already_handled" as const };
    }
    if (!isLocationBookable(await bookingLocationScope(ctx), request.locationId)) {
      return { ok: false as const, error: "location_not_assigned" as const };
    }
    // A request whose number never normalised has NO match set. Returning [] is
    // the honest answer and the dialog then offers only "create". It is written
    // as its own branch rather than left to `NULL = NULL` because the two read
    // identically and only one of them is intended.
    if (!request.phoneE164) return { ok: true as const, data: [] };

    const rows = await tx
      .select({
        id: patients.id,
        fullName: patients.fullName,
        nif: patients.nif,
        patientNumber: patients.patientNumber,
      })
      .from(patients)
      .where(and(...patientPhoneMatchConds(ctx.tenantId, request.phoneE164)))
      .orderBy(asc(patients.fullName));

    return { ok: true as const, data: rows };
  });
}

export async function convertGuestRequest(
  requestId: string,
  resolution: GuestConvertResolution,
): Promise<GuestConvertResult> {
  const ctx = await requireRequestContext();
  if (!isFrontDesk(ctx.role)) return { ok: false, error: "forbidden" };

  if (!requestId) return { ok: false, error: "validation" };
  // EXHAUSTIVE OVER THE UNION WITH NO ELSE. A resolution that is neither arm —
  // including `undefined` from a caller that forgot it — is refused. There is
  // deliberately no branch that picks one.
  if (
    !resolution ||
    (resolution.kind !== "new_patient" && resolution.kind !== "existing_patient")
  ) {
    return { ok: false, error: "validation" };
  }
  if (resolution.kind === "existing_patient" && !resolution.patientId) {
    return { ok: false, error: "validation" };
  }

  const result = await runScoped<GuestConvertResult>(ctx, async (tx) => {
    // Read the request INSIDE the transaction. The browser's copy is a snapshot
    // of whenever /notificacoes last rendered, and two receptionists can be
    // looking at the same queue.
    const [request] = await tx
      .select({
        id: guestBookingRequests.id,
        status: guestBookingRequests.status,
        fullName: guestBookingRequests.fullName,
        phone: guestBookingRequests.phone,
        phoneE164: guestBookingRequests.phoneE164,
        serviceId: guestBookingRequests.serviceId,
        locationId: guestBookingRequests.locationId,
        requestedStartsAt: guestBookingRequests.requestedStartsAt,
      })
      .from(guestBookingRequests)
      .where(eq(guestBookingRequests.id, requestId))
      .limit(1);

    if (!request) return { ok: false, error: "not_found" };
    if (request.status !== "pending") return { ok: false, error: "already_handled" };

    // ================================================================= //
    // STAFF-02 - THE SERVER REFUSES A LOCATION OUTSIDE THE ACTOR'S SCOPE.
    // ================================================================= //
    // Same predicate and same scope function the booking path uses, because this
    // is the front half of a booking: an LV-only receptionist converting a CB
    // request would create a patient and a booking at a clinic they cannot see,
    // which is the exact defect STAFF-02 closed one surface over.
    if (!isLocationBookable(await bookingLocationScope(ctx), request.locationId)) {
      return { ok: false, error: "location_not_assigned" };
    }

    let patientId: string;

    if (resolution.kind === "existing_patient") {
      // THE FLAG-NEVER-LINK ENFORCEMENT. The named patient must be in the match
      // set derived HERE, now, under this transaction's RLS. A patient id that
      // does not match this number cannot be attached by any caller, however the
      // request reached the server.
      if (!request.phoneE164) return { ok: false, error: "match_not_found" };
      const [match] = await tx
        .select({ id: patients.id })
        .from(patients)
        .where(
          and(
            eq(patients.id, resolution.patientId),
            ...patientPhoneMatchConds(ctx.tenantId, request.phoneE164),
          ),
        )
        .limit(1);
      if (!match) return { ok: false, error: "match_not_found" };
      patientId = match.id;
    } else {
      // R16 (0043): the create's location context becomes the clinical fallback
      // location. The guest chose a clinic on the public form and that is the
      // honest value. It needs no separate tenant check — it was read back out
      // of a row this transaction's RLS already confined to the caller's tenant,
      // and 0063 holds a FK on it.
      const created = await insertPatientTx(tx, ctx, {
        fullName: request.fullName,
        phone: request.phone,
        primaryLocationId: request.locationId,
      });
      patientId = created.id;
    }

    // CONDITIONAL ON `status = 'pending'` IN THE WRITE ITSELF, not only on the
    // read above. Two receptionists converting the same row race between the
    // SELECT and the UPDATE; the loser must not overwrite the winner's
    // converted_patient_id. Zero rows updated means somebody got there first.
    const updated = await tx
      .update(guestBookingRequests)
      .set({
        status: "confirmed",
        convertedPatientId: patientId,
        handledAt: sql`now()`,
        handledBy: ctx.userId,
      })
      .where(
        and(eq(guestBookingRequests.id, request.id), eq(guestBookingRequests.status, "pending")),
      )
      .returning({ id: guestBookingRequests.id });

    if (updated.length === 0) {
      // Roll the patient insert back with it. A half-applied convert is the one
      // outcome worth failing the whole thing for.
      throw new GuestConvertRace();
    }

    // Ids and the branch taken. No name, no number: hard rule 7.
    await writeAudit(tx, ctx, {
      action: "patient.guest_request_converted",
      entityId: patientId,
      metadata: { guestRequestId: request.id, resolution: resolution.kind },
    });

    return {
      ok: true,
      data: {
        patientId,
        prefill: {
          serviceId: request.serviceId,
          locationId: request.locationId,
          // The DATE the guest asked for, in Lisbon. Not the time: under the
          // GUEST-04 Option A ruling the stored window encodes a date and a
          // PERIOD, and the start instant is an encoding artefact rather than a
          // time anybody chose. Prefilling 09:00 from it would put an invented
          // choice in the one field reception is there to decide.
          date: lisbonParts(request.requestedStartsAt).date,
        },
      },
    };
  }).catch((e: unknown) => {
    if (e instanceof GuestConvertRace) {
      return { ok: false as const, error: "already_handled" as const };
    }
    throw e;
  });

  if (result.ok) {
    revalidatePath("/notificacoes");
    revalidatePath("/patients");
  }
  return result;
}
