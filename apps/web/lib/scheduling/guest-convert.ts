"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { guestBookingRequests, patients } from "@osteojp/db";
import { can, type Role } from "@osteojp/auth";

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
 * THE CONVERT NO LONGER MOVES THE STATUS. OWNER RULING 2026-09-06, OPTION B.
 * ===========================================================================
 * It used to write `status = 'confirmed'`, and the queue reads
 * `status = 'pending'`, so the row left the queue the moment a patient was
 * created. Reception could then be interrupted before booking, and the person
 * who asked for an appointment had a record, no appointment, and nothing
 * chasing them. That was carded as LE-guest-convert-abandoned-booking and the
 * owner ruled option B: the request STAYS PENDING, the queue keeps showing it,
 * and it says what it is - `Convertido - sem marcação`.
 *
 * SO THE STATUS NOW MEANS WHAT 0063 SAYS IT MEANS. `confirmed` is reserved for
 * a request that became a booking, which nothing writes yet, and a request that
 * never became one is never labelled as though it did. That is a truer reading
 * of the vocabulary than the one this file shipped with, not a workaround for
 * it.
 *
 * WHAT LEAVES THE QUEUE IS `handled_at`, AND IT IS A DISMISS RATHER THAN A
 * STATE. The owner's words: "the reception action is a dismiss on the queue
 * row, not a status change on the request." `handled_at` / `handled_by` are the
 * only columns 0063 gives that meaning to - "who finished with this, and when" -
 * they are read by nothing else in the codebase, and using them costs no
 * migration. `dismissGuestRequest` below is the only writer.
 *
 * THE CONSEQUENCE, STATED SO NOBODY READS IT AS A BUG: the happy path is now
 * two actions. Convert, book, come back, dismiss. That is the cost the owner
 * accepted, and it buys the case that has no other guard - the one where the
 * second step never happens.
 *
 * `converted_appointment_id` IS STILL LEFT NULL, and nothing in the repository
 * has ever written it. Filling it is the threading of a request id through
 * `createAppointment` - the change this whole shape exists to avoid - and that
 * was option A, which the owner declined.
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
  /** A dismiss was attempted on a request nobody has converted. The queue may
   *  only be emptied by resolving a person, never by hiding the row - so this
   *  is its own code rather than a silent no-op. */
  | "not_converted"
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
 * FRONT DESK ONLY: owner, admin, reception. A therapist does not answer the
 * phone or work the request queue, and convert is the front desk's judgement
 * call about who a caller IS.
 *
 * ==========================================================================
 * SEC-01 (2026-08-18): THIS IS NOW THE CAPABILITY, AND THE REASON IT WAS NOT
 * IS WORTH KEEPING.
 * ==========================================================================
 * It used to be a hardcoded role list, on this reasoning, which was correct at
 * the time: "every role in the matrix holds `patients:write` and
 * `appointments:write`, therapists included — so a capability gate here would
 * refuse nobody and would READ LIKE A CONTROL WHILE BEING ONE."
 *
 * THAT SENTENCE TURNED OUT TO DESCRIBE THE DEFECT ONE FILE OVER. The READ path
 * (`listPendingGuestRequests`) was gated on `appointments:read` — a capability
 * every role holds — and it refused nobody, exactly as predicted here, while
 * reading like a control. A therapist saw the whole tenant's guest queue on
 * deployed production. This file's author saw the trap and avoided it; the
 * neighbouring file walked into it.
 *
 * `guest_requests:read` NOW EXISTS AND DOES DISTINGUISH THE ROLES, so the
 * premise of the hardcoded list is gone. Using it here means the queue's READ
 * gate and its WRITE gate are ONE definition rather than two copies of the same
 * role list — and two copies of a rule drift silently, which is the failure
 * `bookingLocationScope` documents in its own header for the location scope.
 *
 * The refusal SHAPE is unchanged: `{ok: false, error: "forbidden"}` for the
 * caller, not a throw, because these are server actions a client component
 * awaits and renders.
 */
function isFrontDesk(role: Role): boolean {
  return can(role, "guest_requests:read");
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
        convertedPatientId: guestBookingRequests.convertedPatientId,
        handledAt: guestBookingRequests.handledAt,
        phoneE164: guestBookingRequests.phoneE164,
        locationId: guestBookingRequests.locationId,
      })
      .from(guestBookingRequests)
      .where(eq(guestBookingRequests.id, requestId))
      .limit(1);

    if (!request) return { ok: false as const, error: "not_found" as const };
    // THREE WAYS TO BE HANDLED NOW, NOT ONE. A declined request, a request
    // somebody already converted, and a request somebody already dismissed. The
    // status alone stopped being the whole answer when the convert stopped
    // moving it, and a guard that still read only the status would offer the
    // resolution dialog for a person who already has a record.
    if (
      request.status !== "pending" ||
      request.convertedPatientId !== null ||
      request.handledAt !== null
    ) {
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
        convertedPatientId: guestBookingRequests.convertedPatientId,
        handledAt: guestBookingRequests.handledAt,
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
    // SAME THREE-WAY GUARD AS THE DIALOG ABOVE, and it is the one that stops a
    // second convert creating a SECOND patient for one request now that the
    // status no longer moves out from under it.
    if (
      request.status !== "pending" ||
      request.convertedPatientId !== null ||
      request.handledAt !== null
    ) {
      return { ok: false, error: "already_handled" };
    }

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

    // CONDITIONAL IN THE WRITE ITSELF, not only on the read above. Two
    // receptionists converting the same row race between the SELECT and the
    // UPDATE; the loser must not overwrite the winner's converted_patient_id.
    // Zero rows updated means somebody got there first.
    //
    // THE PREDICATE MOVED WITH THE SHAPE. It used to be `status = 'pending'`
    // alone, which worked only because the winner's own write changed the
    // status. It no longer does, so `converted_patient_id IS NULL` is what
    // makes this write lose the race - and `handled_at IS NULL` refuses a
    // convert on a row somebody dismissed while this transaction was open.
    // Dropping either one would leave two receptionists creating two patients
    // for one request, which is the duplicate the whole flow exists to avoid.
    const updated = await tx
      .update(guestBookingRequests)
      .set({ convertedPatientId: patientId })
      .where(
        and(
          eq(guestBookingRequests.id, request.id),
          eq(guestBookingRequests.status, "pending"),
          isNull(guestBookingRequests.convertedPatientId),
          isNull(guestBookingRequests.handledAt),
        ),
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

/**
 * LE-guest-convert-abandoned-booking, OPTION B. RECEPTION DISMISSES THE ROW.
 *
 * ===========================================================================
 * WHAT IT IS, AND THE ONE THING IT IS NOT
 * ===========================================================================
 * It takes a CONVERTED request off reception's queue. It is not a decline, it
 * is not a confirmation, and it does not touch `status` - the owner's ruling in
 * his words: "a dismiss on the queue row, not a status change on the request."
 * The request stays `pending` forever, which is the truth: nobody ever turned it
 * into a booking, and `confirmed` would say somebody had.
 *
 * ===========================================================================
 * IT REFUSES ON A REQUEST NOBODY HAS CONVERTED, AND THAT IS THE POINT OF IT
 * ===========================================================================
 * A dismiss that worked on any row would be a way to empty the queue without
 * resolving a person - the same outcome as the defect this ruling closes, just
 * reached deliberately. So `converted_patient_id IS NULL` is refused as
 * `not_converted`, and the only way a stranger's request leaves this queue is
 * with a patient record at the other end of it.
 *
 * ===========================================================================
 * SAME GATE AND SAME SCOPE AS THE CONVERT, DERIVED THE SAME WAY
 * ===========================================================================
 * `isFrontDesk` and `bookingLocationScope`, not copies of the role list or the
 * assignment set. A dismiss is the back half of the convert and a receptionist
 * who may not convert an LV request may not clear it either - STAFF-02 applies
 * to the whole pair or to neither.
 */
export async function dismissGuestRequest(
  requestId: string,
): Promise<{ ok: true } | { ok: false; error: GuestConvertError }> {
  const ctx = await requireRequestContext();
  if (!isFrontDesk(ctx.role)) return { ok: false, error: "forbidden" };
  if (!requestId) return { ok: false, error: "validation" };

  const result = await runScoped<{ ok: true } | { ok: false; error: GuestConvertError }>(
    ctx,
    async (tx) => {
      const [request] = await tx
        .select({
          id: guestBookingRequests.id,
          status: guestBookingRequests.status,
          convertedPatientId: guestBookingRequests.convertedPatientId,
          handledAt: guestBookingRequests.handledAt,
          locationId: guestBookingRequests.locationId,
        })
        .from(guestBookingRequests)
        .where(eq(guestBookingRequests.id, requestId))
        .limit(1);

      if (!request) return { ok: false as const, error: "not_found" as const };
      if (request.handledAt !== null) {
        return { ok: false as const, error: "already_handled" as const };
      }
      if (!isLocationBookable(await bookingLocationScope(ctx), request.locationId)) {
        return { ok: false as const, error: "location_not_assigned" as const };
      }
      // ORDERED AFTER THE SCOPE CHECK ON PURPOSE. A receptionist outside the
      // clinic must be told they are outside it, not told about the state of a
      // request they may not read.
      if (request.convertedPatientId === null) {
        return { ok: false as const, error: "not_converted" as const };
      }

      // `handled_at IS NULL` IN THE WRITE, for the same reason the convert
      // carries its own predicate: two receptionists clearing the same row race
      // between this SELECT and this UPDATE, and the second one must be told
      // rather than silently overwrite who cleared it.
      const updated = await tx
        .update(guestBookingRequests)
        .set({ handledAt: sql`now()`, handledBy: ctx.userId })
        .where(
          and(eq(guestBookingRequests.id, request.id), isNull(guestBookingRequests.handledAt)),
        )
        .returning({ id: guestBookingRequests.id });

      if (updated.length === 0) {
        return { ok: false as const, error: "already_handled" as const };
      }

      // THE PATIENT IS THE ENTITY, not the request, so this audit row sits with
      // the other one on the same person. Ids and the action only - hard rule 7.
      await writeAudit(tx, ctx, {
        action: "patient.guest_request_dismissed",
        entityId: request.convertedPatientId,
        metadata: { guestRequestId: request.id },
      });

      return { ok: true as const };
    },
  );

  if (result.ok) revalidatePath("/notificacoes");
  return result;
}
