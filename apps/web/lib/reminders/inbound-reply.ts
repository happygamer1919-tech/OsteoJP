import "server-only";
import { and, asc, eq, gt, sql } from "drizzle-orm";
import { appointments, auditLog, patients, type DbTx } from "@osteojp/db";
import { normalizePhonePT } from "@osteojp/notify";

import { withReminderTenantContext } from "./context";
import { classifyInboundReply, type InboundIntent } from "./inbound-classify";
import { REMINDER_OFFSETS } from "./offsets";

// The production path for an inbound SMS reply: phone -> patient -> that
// patient's next scheduled appointment -> a status transition, or nothing.
//
// R11 supplies the classification and it is deliberately conservative. THIS
// module supplies the four guard rails that stand between a classified reply
// and a real appointment, and each one exists because the reply is
// UNAUTHENTICATED CONTENT arriving from a phone number. Twilio's signature
// proves the request came from Twilio. It proves nothing about who is holding
// the handset.
//
//   1. STATUS. Only an appointment currently `scheduled` may transition. A
//      completed visit cannot be cancelled by text; an already-`cancelled` one
//      cannot be resurrected into `confirmed`.
//   2. WINDOW. Only between the 24h reminder's send instant and the
//      appointment's start. Outside it, a reply is not an answer to anything.
//   3. MATCH. Exactly one live patient must carry the replying number, and
//      they must have exactly one next scheduled appointment. Zero matches or
//      several change nothing.
//   4. THE DATABASE'S OWN REFUSAL. `appointments_no_double_confirmed` (0061)
//      is an EXCLUDE constraint, so the confirm can lose to it. See below.
//
// A reply that fails any of them CHANGES NOTHING and is recorded for reception
// rather than discarded.
//
// PII rule (#7): nothing here logs the reply body, the phone, or a patient
// name. The audit row carries ids, the intent, and the source.

const MS_PER_MINUTE = 60_000;

/**
 * How long before the appointment a reply is still an answer.
 *
 * DERIVED FROM `REMINDER_OFFSETS`, not written as 24 hours, because the window
 * IS "from the reminder that asked the question". The interactive reminder is
 * the SMS offset; if its lead time ever moves, the window has to move with it
 * or a patient answering the message they just received is told they are out
 * of time. Taking the largest SMS offset is what makes it "from the FIRST such
 * reminder" if a second one is ever added.
 */
export const REPLY_WINDOW_MINUTES = Math.max(
  ...REMINDER_OFFSETS.filter((o) => o.channel === "sms").map((o) => o.minutesBefore),
);

/** Why a reply changed nothing. Recorded; never returned to the sender. */
export type ReviewReason =
  /** R11 unmatched tier - not an exact keyword. Reception reads it. */
  | "ambiguous"
  /** Zero, or more than one, live patient carries the replying number. */
  | "no_patient_match"
  /** The patient has no upcoming appointment at all. */
  | "no_appointment"
  /** They have one, but it is not `scheduled` - already confirmed, cancelled,
   *  completed or no-show. A reply may not move any of those. */
  | "wrong_status"
  /** They have one, but the reply arrived before its reminder was due. */
  | "outside_window"
  /** The confirm would have violated appointments_no_double_confirmed. */
  | "double_confirmed_refused";

/**
 * WHAT THE REPLY MATCHED, carried on every outcome so the caller can file the
 * queue row without asking the database the same questions again. Both are null
 * on a reply that matched nothing, which is the common review case.
 */
export type InboundReplyMatch = {
  patientId: string | null;
  appointmentId: string | null;
};

export type InboundReplyResult = InboundReplyMatch &
  (
    | { outcome: "confirmed"; appointmentId: string }
    | { outcome: "cancelled"; appointmentId: string }
    | { outcome: "opt_out"; patientId: string }
    | { outcome: "review"; reason: ReviewReason; intent: InboundIntent }
  );

/**
 * Postgres 23P01 exclusion_violation, however the driver surfaces it.
 * Mirrors `isUniqueViolation` in redeem.ts, which handles the 23505 sibling.
 */
export function isExclusionViolation(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const code = (err as { code?: unknown }).code;
  if (code === "23P01") return true;
  const cause = (err as { cause?: unknown }).cause;
  return (
    typeof cause === "object" &&
    cause !== null &&
    (cause as { code?: unknown }).code === "23P01"
  );
}

/**
 * The stored-phone predicate.
 *
 * `patients.phone` is FREE TEXT - the staff form caps its length and the portal
 * PATCH accepts any 7-15 digit string - so the same mobile is stored as
 * "912 345 678", "+351912345678" or "00351912345678" depending on who typed
 * it. Matching on equality against the E.164 form would miss most of them.
 *
 * IT IS NOT A SUFFIX MATCH, deliberately. `right(digits, 9) = subscriber`
 * would be simpler and would also match a foreign number whose last nine
 * digits coincide - and the consequence of a wrong match here is cancelling a
 * different person's appointment. The set below is exactly the four forms
 * `normalizePhonePT` accepts, so this predicate and that function agree by
 * construction on which stored strings ARE this number.
 */
function storedPhoneMatches(e164: string) {
  const subscriber = e164.slice(4); // "+351" + 9 digits
  const digits = sql`regexp_replace(coalesce(${patients.phone}, ''), '[^0-9]', '', 'g')`;
  return sql`${digits} in (${subscriber}, ${"351" + subscriber}, ${"00351" + subscriber})`;
}

async function writeReplyAudit(
  tx: DbTx,
  row: {
    tenantId: string;
    appointmentId: string | null;
    patientId: string | null;
    intent: InboundIntent;
    outcome: string;
    reason: string | null;
  },
): Promise<void> {
  await tx.insert(auditLog).values({
    tenantId: row.tenantId,
    // NULL, and it has to be. `audit_log.actor_user_id` references `users`,
    // and a patient replying to an SMS has no staff users row - 0067's header
    // records that patients have no `users` entry at all. The actor is named
    // in `metadata.source` instead, which is the field this dispatch asked
    // for by name.
    actorUserId: null,
    action: "appointment.patient_sms_reply",
    entityType: "appointment",
    entityId: row.appointmentId,
    metadata: {
      // THE NAMED SOURCE. Every status change this module makes carries it, so
      // a status that changed without a person can always be traced to the
      // channel that changed it.
      source: "patient-sms-reply",
      intent: row.intent,
      outcome: row.outcome,
      reason: row.reason,
      patientId: row.patientId,
    },
    ip: null,
  });
}

/**
 * Classify one inbound reply and apply its consequence, or none.
 *
 * `now` is injected rather than read here so the window is testable without
 * faking the system clock - the same choice redeem.ts makes for the cutoff.
 */
export async function applyInboundReply(args: {
  tenantId: string;
  fromPhone: string;
  body: string;
  now: Date;
}): Promise<InboundReplyResult> {
  const { tenantId, body, now } = args;
  const classification = classifyInboundReply(body);
  const e164 = normalizePhonePT(args.fromPhone);

  return withReminderTenantContext<InboundReplyResult>(tenantId, async (tx) => {
    // A sender we cannot even normalize is a no-match, not an error. It is
    // recorded with no patient and no appointment, which is the honest row.
    if (!e164) {
      await writeReplyAudit(tx, {
        tenantId,
        appointmentId: null,
        patientId: null,
        intent: classification.intent,
        outcome: "review",
        reason: "no_patient_match",
      });
      return {
        outcome: "review",
        reason: "no_patient_match",
        intent: classification.intent,
        patientId: null,
        appointmentId: null,
      } as const;
    }

    // EXACTLY ONE, or nothing happens. `limit(2)` rather than `limit(1)` is
    // what makes "exactly one" provable: with limit(1) a number shared by two
    // patient records reads as a clean match and the reply lands on whichever
    // row the planner returned first. WF-07 ruled the same refusal for OTP
    // linkage, and for the same reason - mis-attributing a medical record is
    // the failure class the refusal exists to prevent.
    const candidates = await tx
      .select({ id: patients.id })
      .from(patients)
      .where(and(eq(patients.tenantId, tenantId), storedPhoneMatches(e164)))
      .limit(2);

    if (candidates.length !== 1) {
      await writeReplyAudit(tx, {
        tenantId,
        appointmentId: null,
        patientId: null,
        intent: classification.intent,
        outcome: "review",
        reason: "no_patient_match",
      });
      return {
        outcome: "review",
        reason: "no_patient_match",
        intent: classification.intent,
        patientId: null,
        appointmentId: null,
      } as const;
    }
    const patientId = candidates[0]!.id;

    // STOP is answered before anything else (R11 legal precedence) and it is
    // the one intent that needs no appointment: it is a standing instruction
    // about the channel, not an answer about a booking.
    if (classification.intent === "opt_out") {
      await tx
        .update(patients)
        .set({ reminderSmsEnabled: false })
        .where(and(eq(patients.id, patientId), eq(patients.tenantId, tenantId)));
      await writeReplyAudit(tx, {
        tenantId,
        appointmentId: null,
        patientId,
        intent: classification.intent,
        outcome: "opt_out",
        reason: null,
      });
      return { outcome: "opt_out", patientId, appointmentId: null } as const;
    }

    // The patient's NEXT scheduled appointment. `for update` holds it for the
    // rest of the transaction, so two replies arriving together serialise here
    // instead of racing the status read against each other.
    const rows = await tx
      .select({
        id: appointments.id,
        status: appointments.status,
        startsAt: appointments.startsAt,
      })
      .from(appointments)
      .where(
        and(
          eq(appointments.tenantId, tenantId),
          eq(appointments.patientId, patientId),
          gt(appointments.startsAt, now),
        ),
      )
      .orderBy(asc(appointments.startsAt))
      .limit(1)
      .for("update");

    const appt = rows[0];
    const review = async (reason: ReviewReason): Promise<InboundReplyResult> => {
      await writeReplyAudit(tx, {
        tenantId,
        appointmentId: appt?.id ?? null,
        patientId,
        intent: classification.intent,
        outcome: "review",
        reason,
      });
      return {
        outcome: "review",
        reason,
        intent: classification.intent,
        patientId,
        appointmentId: appt?.id ?? null,
      } as const;
    };

    if (!appt) return review("no_appointment");

    // GUARD 1 - STATUS. Ordered before the window on purpose: an appointment
    // in the wrong status is wrong regardless of when the reply arrived, and
    // reporting the timing of an untouchable row would be misleading.
    if (appt.status !== "scheduled") return review("wrong_status");

    // GUARD 2 - WINDOW. `startsAt > now` is already true from the query, so
    // this is the lower bound only: the reply must not predate the reminder
    // that asked the question.
    const windowOpensAt = appt.startsAt.getTime() - REPLY_WINDOW_MINUTES * MS_PER_MINUTE;
    if (now.getTime() < windowOpensAt) return review("outside_window");

    // GUARD 3 - the AMBIGUOUS tier changes nothing, by construction. It is
    // checked last so that an ambiguous reply on an out-of-window appointment
    // still reports the structural reason rather than the classification one.
    if (classification.needsReview) return review("ambiguous");

    if (classification.intent === "cancelada") {
      await tx
        .update(appointments)
        .set({ status: "cancelled" })
        .where(eq(appointments.id, appt.id));
      await writeReplyAudit(tx, {
        tenantId,
        appointmentId: appt.id,
        patientId,
        intent: classification.intent,
        outcome: "cancelled",
        reason: null,
      });
      return { outcome: "cancelled", appointmentId: appt.id, patientId } as const;
    }

    // ================================================================== //
    // THE CONFIRM CAN LOSE TO THE DATABASE, AND THAT IS THE CORRECT
    // OUTCOME RATHER THAN AN ERROR TO HANDLE AWAY.
    // ================================================================== //
    // `appointments_no_double_confirmed` (0061) is an EXCLUDE constraint
    // banning two CONFIRMED appointments overlapping for one practitioner. It
    // exists because INC-08 produced exactly that in production through three
    // separate code paths, two of which left no evidence.
    //
    // Two `scheduled` rows on one window are still legal at the database
    // layer - 0061 says so explicitly - so a stacked pedido, or a deliberate
    // staff override, can leave this patient's appointment overlapping one
    // that is ALREADY confirmed. Their SIM then asks for the second confirmed
    // row the constraint forbids.
    //
    // WHAT HAPPENS: the UPDATE raises 23P01, the transaction rolls back, the
    // appointment is UNCHANGED and still `scheduled`, and the reply is
    // recorded for reception with `double_confirmed_refused`. The patient is
    // not told their appointment is confirmed when it is not, and reception
    // gets the one thing that actually resolves it - a human deciding which of
    // two overlapping appointments is real.
    //
    // The audit row is written in its OWN transaction afterwards, because this
    // one is already dead: writing it here would roll back with the failure it
    // is recording.
    try {
      await tx
        .update(appointments)
        .set({
          status: "confirmed",
          confirmationState: "confirmed",
          confirmationReceivedAt: now,
          // Free text by design (schema.ts) so a new reply channel needs no
          // migration. This is the first writer of the SMS value.
          confirmationChannel: "sms",
        })
        .where(eq(appointments.id, appt.id));
    } catch (err) {
      if (isExclusionViolation(err)) {
        // Re-thrown as a sentinel so the OUTER catch, outside this dead
        // transaction, can write the audit row and report the review outcome.
        throw new DoubleConfirmedRefusal(appt.id, patientId, classification.intent);
      }
      throw err;
    }

    await writeReplyAudit(tx, {
      tenantId,
      appointmentId: appt.id,
      patientId,
      intent: classification.intent,
      outcome: "confirmed",
      reason: null,
    });
    return { outcome: "confirmed", appointmentId: appt.id, patientId } as const;
  }).catch(async (err: unknown) => {
    if (err instanceof DoubleConfirmedRefusal) {
      await withReminderTenantContext(tenantId, (tx) =>
        writeReplyAudit(tx, {
          tenantId,
          appointmentId: err.appointmentId,
          patientId: err.patientId,
          intent: err.intent,
          outcome: "review",
          reason: "double_confirmed_refused",
        }),
      );
      return {
        outcome: "review",
        reason: "double_confirmed_refused",
        intent: err.intent,
        patientId: err.patientId,
        appointmentId: err.appointmentId,
      } as const;
    }
    throw err;
  });
}

/** Carries the ids across the transaction boundary the rollback destroys. */
class DoubleConfirmedRefusal extends Error {
  constructor(
    readonly appointmentId: string,
    readonly patientId: string,
    readonly intent: InboundIntent,
  ) {
    super("appointments_no_double_confirmed refused the confirm");
    this.name = "DoubleConfirmedRefusal";
  }
}
