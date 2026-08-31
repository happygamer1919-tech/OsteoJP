import "server-only";
import { createHash } from "node:crypto";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import {
  appointments,
  auditLog,
  patients,
  smsInboundEvents,
  type DbTx,
} from "@osteojp/db";

import { runScoped, type RequestContext } from "@/lib/auth/context";
import { withReminderTenantContext } from "./context";
import { isExclusionViolation } from "./inbound-reply";

// The reception working queue for inbound patient SMS replies (0069, W14-06).
//
// TWO RECORDS EXIST FOR ONE REPLY AND NEITHER IS REDUNDANT. `audit_log` gets an
// `appointment.patient_sms_reply` row for EVERY reply - ids, intent, outcome,
// `source: patient-sms-reply` - and it is the permanent, append-only trail.
// THIS table is the working copy: the only place the message BODY lives (audit
// metadata is contractually ids-and-instants only, CLAUDE.md rule 7) and the
// only place a resolution can be recorded, because an append-only table cannot
// be marked done.
//
// TWO DIFFERENT SEAMS, ON PURPOSE:
//   - the WRITE comes from the Twilio webhook, which has no session, so it goes
//     through withReminderTenantContext (`set local role authenticated`,
//     user_role `admin`) - the same seam reminder dispatch uses. 0069's INSERT
//     policy admits exactly that role set.
//   - the READS and the RESOLVE come from a staff request, so they go through
//     runScoped with the CALLER's own context. RLS then answers as that person,
//     which is what makes the therapist refusal real rather than a UI choice.
//
// PII rule (#7): the sender's number is stored HASHED and never logged. The body
// is stored in clear - that is the deliberate exception this table exists to
// make, confined by RLS to owner/admin/reception of the owning tenant.

/** sha256 hex of the E.164 sender. The number itself is never persisted. */
export function hashSender(e164: string): string {
  return createHash("sha256").update(e164).digest("hex");
}

export type InboundReviewItem = {
  id: string;
  /** ISO UTC receipt time. */
  receivedAt: string;
  /** The reply text, shown to reception. Source of truth is the store. */
  body: string;
  /** What the classifier made of it. */
  classification: string;
  /** Why it needs a human, when it does. */
  reviewReason: string | null;
  /** Resolved patient display name when the sender matched a patient, else null. */
  patientName: string | null;
  /** Correlated appointment id when resolvable; null when ambiguous or none. */
  appointmentId: string | null;
  /** ISO start of that appointment, so reception sees what is being talked about. */
  appointmentStartsAt: string | null;
  /** Its lifecycle status, so a resolve that cannot apply is visible up front. */
  appointmentStatus: string | null;
};

export type ReviewResolution = "confirmed" | "cancelled" | "read";

/**
 * File one inbound reply. Called by the webhook for EVERY reply, not only the
 * ones needing review: a reply that confirmed an appointment is still the
 * clinic's inbound correspondence, and reception asking "what did they actually
 * write" is a question the queue can answer only if the row exists.
 *
 * IDEMPOTENT ON THE PROVIDER SID. Twilio redelivers on any non-2xx, so the same
 * MessageSid can arrive twice; `sms_inbound_events_provider_sid_uq` refuses the
 * second and `onConflictDoNothing` turns that refusal into the no-op it should
 * be. Without it a redelivery would put the same message in front of reception
 * twice and they would resolve it twice.
 */
export async function recordInboundReply(args: {
  tenantId: string;
  providerMessageSid: string;
  /** E.164. Hashed here; never stored or logged in clear. */
  fromPhone: string;
  body: string;
  classification: string;
  reviewReason: string | null;
  patientId: string | null;
  appointmentId: string | null;
  /**
   * True when the reply was ACTED ON automatically and needs no human. Such a
   * row is filed ALREADY RESOLVED, so it never appears in the queue - the queue
   * predicate is `resolution IS NULL`. It is still stored, because "what did the
   * patient actually write" is a question about a confirmed reply as often as
   * about a confusing one, and this is the only place the text lives.
   */
  resolved: boolean;
}): Promise<void> {
  const now = new Date();
  await withReminderTenantContext(args.tenantId, async (tx) => {
    await tx
      .insert(smsInboundEvents)
      .values({
        tenantId: args.tenantId,
        providerMessageSid: args.providerMessageSid,
        fromPhoneHash: hashSender(args.fromPhone),
        body: args.body,
        classification: args.classification,
        reviewReason: args.reviewReason,
        patientId: args.patientId,
        appointmentId: args.appointmentId,
        // The pair moves together or the CHECK refuses it. `resolved_by` stays
        // NULL: no person resolved this, the classifier did, and naming a
        // staff user here would invent an actor.
        resolution: args.resolved ? "read" : null,
        resolvedAt: args.resolved ? now : null,
      })
      .onConflictDoNothing({
        target: [smsInboundEvents.tenantId, smsInboundEvents.providerMessageSid],
      });
  });
}

/**
 * The reception queue: replies not yet resolved, OLDEST FIRST.
 *
 * Oldest first, not newest. A work queue is worked from the front, and a patient
 * who wrote two days ago has waited longer than one who wrote this morning. The
 * partial index in 0069 is ordered to match.
 *
 * The patient name and the appointment are JOINED AT READ TIME rather than
 * copied into the row, the same choice 0055 made: a staff session entitled to
 * read this queue is already entitled to the name, and a copy would be a second
 * place with its own lifetime that goes stale when the ficha is corrected.
 */
export async function listReviewQueue(ctx: RequestContext): Promise<InboundReviewItem[]> {
  return runScoped(ctx, async (tx) => {
    const rows = await tx
      .select({
        id: smsInboundEvents.id,
        receivedAt: smsInboundEvents.receivedAt,
        body: smsInboundEvents.body,
        classification: smsInboundEvents.classification,
        reviewReason: smsInboundEvents.reviewReason,
        patientName: patients.fullName,
        appointmentId: smsInboundEvents.appointmentId,
        appointmentStartsAt: appointments.startsAt,
        appointmentStatus: appointments.status,
      })
      .from(smsInboundEvents)
      // LEFT joins, both of them, and that is the whole shape of this queue:
      // the reply that most needs a human is the one that matched NO patient
      // and therefore no appointment. An inner join would hide exactly those.
      .leftJoin(patients, eq(patients.id, smsInboundEvents.patientId))
      .leftJoin(appointments, eq(appointments.id, smsInboundEvents.appointmentId))
      .where(isNull(smsInboundEvents.resolution))
      .orderBy(asc(smsInboundEvents.receivedAt))
      .limit(200);

    return rows.map((r) => ({
      id: r.id,
      receivedAt: r.receivedAt.toISOString(),
      body: r.body,
      classification: r.classification,
      reviewReason: r.reviewReason,
      patientName: r.patientName,
      appointmentId: r.appointmentId,
      appointmentStartsAt: r.appointmentStartsAt?.toISOString() ?? null,
      appointmentStatus: r.appointmentStatus,
    }));
  });
}

/** How many replies are still waiting. Cheap; served by the partial index. */
export async function countReviewQueue(ctx: RequestContext): Promise<number> {
  return runScoped(ctx, async (tx) => {
    const rows = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(smsInboundEvents)
      .where(isNull(smsInboundEvents.resolution));
    return rows[0]?.n ?? 0;
  });
}

/** What actually happened when reception pressed a button. */
export type ResolveOutcome =
  /** Marked resolved. `applied` says whether an appointment also moved. */
  | { ok: true; applied: boolean }
  /** The row is not in this tenant's queue, or is already resolved. */
  | { ok: false; reason: "not_found" }
  /** Confirming would have created a second confirmed overlap (0061). */
  | { ok: false; reason: "double_booked" };

/**
 * Resolve one review item, and apply its consequence when there is one.
 *
 * THE THREE BUTTONS PROMISE DIFFERENT THINGS AND THIS HONOURS THAT. "Marcar
 * como lida" files the reply and nothing else. "Marcar como confirmada" and
 * "Marcar como cancelada" are reception ACTING on what the patient wrote, so
 * they move the matched appointment as well. Marking the row done without
 * touching the appointment would leave a button that reads as an action and
 * performs a filing.
 *
 * IT IS NOT A SECOND COPY OF THE REPLY RULES. The automatic path
 * (inbound-reply.ts) refuses outside a time window, because a reply is only an
 * answer to the reminder that asked. RECEPTION HAS NO SUCH WINDOW - a person
 * reading a message and deciding is the authority the window exists to defer
 * to. What is kept is the guard that is about the DATA rather than about
 * authority: only a `scheduled` appointment may move, because confirming a
 * completed visit or resurrecting a cancelled one is meaningless whoever asks.
 *
 * THE CONFIRM CAN STILL LOSE TO THE DATABASE. 0061's exclusion constraint bans
 * two confirmed overlaps for one practitioner. If it fires, nothing is written -
 * not the appointment, not the resolution - and reception is told, so the item
 * stays in the queue where they can pick the other outcome.
 *
 * ONE TRANSACTION for the appointment write, the resolution and the audit row.
 * A resolution recorded for a change that rolled back would be the queue lying
 * about what it did.
 */
export async function resolveReviewItem(args: {
  ctx: RequestContext;
  itemId: string;
  resolution: ReviewResolution;
}): Promise<ResolveOutcome> {
  const { ctx, itemId, resolution } = args;
  try {
    return await runScoped<ResolveOutcome>(ctx, async (tx) => {
      // RLS scopes the read to this tenant AND this role, so an item another
      // clinic owns simply is not here. `resolution IS NULL` makes a second
      // press of the same button a no-op rather than a second appointment move.
      const rows = await tx
        .select({
          id: smsInboundEvents.id,
          appointmentId: smsInboundEvents.appointmentId,
          patientId: smsInboundEvents.patientId,
        })
        .from(smsInboundEvents)
        .where(and(eq(smsInboundEvents.id, itemId), isNull(smsInboundEvents.resolution)))
        .for("update");

      const item = rows[0];
      if (!item) return { ok: false, reason: "not_found" } as const;

      let applied = false;
      if (resolution !== "read" && item.appointmentId) {
        const status = resolution === "confirmed" ? "confirmed" : "cancelled";
        const updated = await tx
          .update(appointments)
          .set(
            resolution === "confirmed"
              ? {
                  status,
                  confirmationState: "confirmed",
                  confirmationReceivedAt: new Date(),
                  // Free text by design, and this value is NOT "sms": the
                  // patient's own reply writes "sms" from inbound-reply.ts.
                  // A human at the desk deciding on their behalf is a
                  // different fact and the trail should not conflate them.
                  confirmationChannel: "sms_review",
                }
              : { status },
          )
          // The status predicate is on the UPDATE, not assumed from the read:
          // it is the last guard against a writer that slipped in between.
          .where(
            and(eq(appointments.id, item.appointmentId), eq(appointments.status, "scheduled")),
          )
          .returning({ id: appointments.id });
        applied = updated.length > 0;
      }

      await tx
        .update(smsInboundEvents)
        .set({ resolution, resolvedAt: new Date(), resolvedBy: ctx.userId })
        .where(eq(smsInboundEvents.id, item.id));

      await writeResolveAudit(tx, {
        tenantId: ctx.tenantId,
        actorUserId: ctx.userId,
        appointmentId: item.appointmentId,
        patientId: item.patientId,
        itemId: item.id,
        resolution,
        applied,
      });

      return { ok: true, applied } as const;
    });
  } catch (err) {
    // 0061 refused a second confirmed overlap. The whole transaction rolled
    // back, so the item is still unresolved and still in the queue - which is
    // the correct place for a decision that could not be carried out.
    if (isExclusionViolation(err)) return { ok: false, reason: "double_booked" };
    throw err;
  }
}

/**
 * The audit row for a HUMAN resolution.
 *
 * A DIFFERENT SOURCE FROM THE AUTOMATIC PATH, deliberately. inbound-reply.ts
 * writes `source: patient-sms-reply` because the patient's own message moved
 * the appointment. Here a receptionist read that message and decided, and the
 * actor is a real staff user. Collapsing the two would make "the patient
 * confirmed" and "somebody at the desk confirmed on their behalf" the same
 * fact in the trail, and they are not.
 */
async function writeResolveAudit(
  tx: DbTx,
  row: {
    tenantId: string;
    actorUserId: string;
    appointmentId: string | null;
    patientId: string | null;
    itemId: string;
    resolution: ReviewResolution;
    applied: boolean;
  },
): Promise<void> {
  await tx.insert(auditLog).values({
    tenantId: row.tenantId,
    actorUserId: row.actorUserId,
    action: "appointment.sms_reply_reviewed",
    entityType: "appointment",
    entityId: row.appointmentId,
    metadata: {
      source: "reception-sms-review",
      inboundEventId: row.itemId,
      resolution: row.resolution,
      // Whether an appointment actually moved. `resolution: 'confirmed'` with
      // `applied: false` is a real and readable outcome - the reply matched no
      // appointment, or it was no longer scheduled - and flattening the two
      // would put a confirmation in the trail that never happened.
      applied: row.applied,
      patientId: row.patientId,
    },
    ip: null,
  });
}
