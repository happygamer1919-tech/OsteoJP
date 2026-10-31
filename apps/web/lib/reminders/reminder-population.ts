import "server-only";
import { and, desc, eq, exists, inArray, lte, not, or, sql, type SQL } from "drizzle-orm";
import { alias, type PgColumn } from "drizzle-orm/pg-core";
import { appointments, auditLog, type DbTx } from "@osteojp/db";

/**
 * WHICH VISITS ARE OWED A REMINDER. One switch, and it is OFF.
 *
 * ==========================================================================
 * THE QUESTION IS THE OWNER'S, AND IT IS NOT ANSWERED
 * ==========================================================================
 * Some visits never had a reminder under the rules of today: an imported
 * visit, and an online request the clinic has not handled, were never handed
 * to the reminder job by anyone. Whether those should be reminded is a
 * patient-facing decision that waits for the owner. Until he rules, the answer
 * built here is NO: a visit is owed a reminder only when its audit trail holds
 * a save that handed it to the reminder job (`hasSchedulingEvent` below).
 *
 * WHAT READS IT. The first count on Lembretes SMS (./reminder-numbers.ts): with
 * the switch off, a visit that never had a reminder is not counted as one whose
 * reminder went missing. A sender that picks visits from the database must
 * read the same switch, so the two can never disagree about who is owed one.
 *
 * THE SENDING PASS HAS A SWITCH OF ITS OWN (SWEEP-47). The owner's answer was
 * to remind these visits, and strategy put that behind a second switch, off
 * by default, until the exact rule is ruled: REMINDERS_SWEEP_NEVER_REMINDED
 * (./sweep-mode.ts), read by the sending pass only (./sweep-send.ts). This
 * constant stays what the shadow pass and the two counts read. So while that
 * switch is on and this constant is off, the sending pass reminds a visit the
 * first count does not count; flipping this constant, with the sentence under
 * the counts, is the change that brings them back together.
 *
 * FLIPPING IT IS A RULING, NOT A REFACTOR. `true` makes every scheduled or
 * confirmed visit count. The sentence under the counts
 * (`remindersLog.numbersNote`) says which visits are left out and changes with
 * it; reminder-numbers.test.ts holds the two together.
 */
export const REMIND_VISITS_THAT_NEVER_HAD_A_REMINDER = false;

/**
 * THE SCHEDULING EVENTS: the audit rows of the saves that hand a visit to the
 * reminder job, each read from the code that writes it.
 *
 *   appointment.create      booking: one visit, a series, a copy, a batch
 *                           (lib/scheduling/actions.ts, batch.ts)
 *   appointment.reschedule  moving it (actions.ts)
 *   appointment.update      only with `toStatus` scheduled or confirmed (brought
 *                           back from cancelled, or accepted with the Estado
 *                           control), or with `via` portal_request_confirm
 *                           (Aceitar pedido) (actions.ts)
 *   appointment.sms_reply_reviewed   only with `resolution` confirmed and
 *                           `applied` true (lib/reminders/inbound-store.ts)
 *   appointment.patient_sms_reply    only with `outcome` confirmed
 *                           (lib/reminders/inbound-reply.ts)
 *
 * WHAT HAS NONE OF THEM: a visit the import wrote, and an online request
 * nobody at the clinic has accepted or moved.
 *
 * WIDER THAN THE EVENTS THEMSELVES IN TWO PLACES, both known. A status set to
 * confirmed by hand on a visit that is not a request writes the same
 * `appointment.update` and asks for no reminder; and moving a request that is
 * still unaccepted writes `appointment.reschedule` and asks for none. Either
 * only matters for a visit with no booking row of its own. The audit trail
 * cannot tell these apart from the saves that do ask, so they count.
 *
 * reminder-numbers.test.ts holds every name here to the file that writes it.
 */
export const SCHEDULING_SAVE_ACTIONS = ["appointment.create", "appointment.reschedule"] as const;
export const SCHEDULING_UPDATE_ACTION = "appointment.update";
export const SCHEDULING_SMS_REVIEW_ACTION = "appointment.sms_reply_reviewed";
export const SCHEDULING_SMS_REPLY_ACTION = "appointment.patient_sms_reply";

/**
 * True for the `appointments` row of the enclosing query when a scheduling
 * event is on its audit trail. Read under the caller's own claims, so a row of
 * another tenant that names this visit is never seen. Text against text on the
 * metadata, so a row of another shape matches nothing and raises nothing.
 */
export function hasSchedulingEvent(tx: DbTx): SQL {
  const saved = alias(auditLog, "reminder_scheduling_event");
  return exists(
    tx
      .select({ one: sql`1` })
      .from(saved)
      .where(
        and(
          eq(saved.entityType, "appointment"),
          eq(saved.entityId, appointments.id),
          or(
            inArray(saved.action, [...SCHEDULING_SAVE_ACTIONS]),
            and(
              eq(saved.action, SCHEDULING_UPDATE_ACTION),
              or(
                sql`${saved.metadata}->>'toStatus' in ('scheduled', 'confirmed')`,
                sql`${saved.metadata}->>'via' = 'portal_request_confirm'`,
              ),
            ),
            and(
              eq(saved.action, SCHEDULING_SMS_REVIEW_ACTION),
              sql`${saved.metadata}->>'resolution' = 'confirmed'`,
              sql`${saved.metadata}->>'applied' = 'true'`,
            ),
            and(
              eq(saved.action, SCHEDULING_SMS_REPLY_ACTION),
              sql`${saved.metadata}->>'outcome' = 'confirmed'`,
            ),
          ),
        ),
      ),
  );
}

/**
 * ==========================================================================
 * THE RE-ARMING SAVES (strategy's ruling R33)
 * ==========================================================================
 * R33, its words: "the gate does not count every save. It counts exactly the
 * saves that make the live job re-plan this visit's reminders (the doors that
 * emit appointment/scheduled with a re-arm). Derive them from code and pin
 * them with a test listing those doors. A status-only save (an SMS "confirmo",
 * a hand-set Confirmada) never counts."
 *
 * WHAT RE-PLANS. Every `appointment/scheduled` event cancels the visit's
 * sleeping reminder runs and plans them again from the moment it is handled
 * (`computeDueReminders`, ./inngest/functions.ts): a mark already past is
 * dropped. In the application the event has ONE sender (./index.ts), called
 * ONLY by `enqueueRemindersAfterCommit` (lib/scheduling/reminders.ts), and the
 * functions that call that are the doors below. Each writes an audit row in
 * the same transaction as the save, and THAT ROW is what the sweep reads: the
 * table says which rows, under which condition, for which door.
 *
 * TWO SENDERS OUTSIDE THE APPLICATION, AND THE GATE CANNOT SEE THEM. The
 * owner-run re-arm scripts packages/db/scripts/inc-1007-rearm-reminders-emit.mjs
 * and obs-05-backfill-emit.mjs send `appointment/scheduled` straight to the
 * scheduler and write no audit row, so a re-plan they cause is invisible
 * here: the sleeping job drops a past mark and the sweep still takes it. So
 * an owner-run re-arm must not run while the sweep is in send mode without a
 * fresh ruling. re-arming-saves.test.ts pins them as the only two.
 *
 *   door (file: function)                  audit row, and the condition the door emits under
 *   actions.ts: createAppointment          appointment.create: always
 *   actions.ts: batchScheduleAppointments  appointment.create (written by batch.ts: batchSchedule): always
 *   actions.ts: cloneAppointment           appointment.create: always
 *   actions.ts: rescheduleAppointment      appointment.reschedule (written by actions.ts:
 *   actions.ts: bulkRescheduleAppointments   moveAppointment, once per visit moved): always,
 *                                          BUT counted only when it changed the START
 *                                          (below), and see the question below
 *   actions.ts: confirmAppointmentRequest  appointment.update with `via` portal_request_confirm: always
 *   actions.ts: updateAppointment          appointment.update, two cases:
 *     an online request accepted with the Estado control: `fromStatus`
 *       scheduled, `toStatus` confirmed, on a visit whose `origin` is
 *       patient_portal (the row was an unaccepted request before the save);
 *     a visit brought back from Cancelada: `fromStatus` cancelled, and
 *       `toStatus` confirmed, or `toStatus` scheduled on a visit whose
 *       `origin` is not patient_portal (back to Agendada a request is
 *       unaccepted again, and emits nothing);
 *   inbound-store.ts: resolveReviewItem    appointment.sms_reply_reviewed, `resolution`
 *                                          confirmed, `applied` true, `origin` patient_portal
 *   inbound-reply.ts: applyInboundReply    appointment.patient_sms_reply, `outcome`
 *                                          confirmed, `origin` patient_portal
 *
 * WHAT IS LEFT OUT, AND IS THE POINT: the same audit rows on a visit that is
 * not an online request. A Confirmada set by hand, a review-queue "confirmada"
 * and the patient's own SMS "confirmo" write the rows above on any visit, and
 * re-plan nothing unless the visit was an unaccepted request. So on a booked
 * visit they never count. So does every other `appointment.update` (a note, a
 * room, a service, Agendada to Confirmada and back).
 *
 * WHY `origin` STANDS FOR "WAS AN UNACCEPTED REQUEST". The doors ask
 * `public.is_unconfirmed_pedido` before the write: status scheduled, and
 * origin patient_portal OR an `appointment_request` notification (0067). Each
 * row above records the status it came from (`fromStatus`, or the review's
 * and the reply's own guard: they move only a scheduled visit), and `origin`
 * never changes after the insert. The notification half cannot be read here:
 * 0055 lets a notification be read by its recipient only, and a job is nobody.
 * It matters only for a request made in the hours between 0067's apply and
 * its deploy and never backfilled, and the dispatcher reads `origin` alone for
 * the same question (./dispatch.ts, `isUnacceptedPedido`), so here and there a
 * visit is a request on the same reading.
 *
 * A VISIT BROUGHT BACK WHEN IT HAD ALREADY BEGUN emits nothing (its offsets
 * are past) and its row counts all the same. That changes no answer: a visit
 * the sweep reads starts after the pass, so if its start then was its start
 * now, it was ahead and the door emitted; if the start changed since, a later
 * move wrote its own row, after this one.
 *
 * THE QUESTION (not decided here): a move (`moveAppointment`, behind both
 * move doors) emits nothing for
 * a visit that is an unaccepted request at the move, and its audit row does
 * not record the status the visit had. Until it is ruled, every move counts,
 * as before R33. It can only differ for a visit that is an unaccepted request
 * at the pass (nothing sends to it, and the sleeping job has no run for it),
 * or one accepted afterwards through a door that writes none of the rows above.
 *
 * A MOVE COUNTS ONLY WHEN THE START IS NOT THE ONE THE MARK WAS FOR (R4
 * round 2 on #1678, prepared for strategy). A move that keeps the start (a new
 * therapist, clinic or length; a series or bulk change keeping the hour; a
 * move away and back) re-arms the sleeping job too, but that job woke at the
 * mark and sent the reminder before the save. Counted, it would leave the
 * job's claim alone in the compare (no label fits it), and in send mode it
 * would leave the patient with no reminder at all: the event cancels the
 * job's run, its re-plan has no mark left, and the gate holds the sweep. So
 * an `appointment.reschedule` after the mark counts only while the visit's
 * start AT THE MARK differs from its start now. The start at the mark is the
 * `startsAt` of the latest `appointment.create` or `appointment.reschedule`
 * row of the visit written at or before the mark; every writer of those two
 * puts it there with `toISOString()` (pinned in re-arming-saves.test.ts), so
 * it is compared as millisecond text with the start now, the way
 * scripts/db/read-sweep-unexplained-20261030.sql compares them. With no such
 * row, or one without `startsAt` (an imported visit, a row of another shape),
 * the move counts, as before. Audit rows only: no claim is read.
 *
 * re-arming-saves.test.ts lists the doors from the source and holds this table
 * to them: a door added, removed or given another condition fails it.
 */
export const RE_ARMING_SAVES = [
  {
    clause: "booked",
    action: "appointment.create",
    doors: [
      "apps/web/lib/scheduling/actions.ts:createAppointment",
      "apps/web/lib/scheduling/actions.ts:batchScheduleAppointments",
      "apps/web/lib/scheduling/actions.ts:cloneAppointment",
    ],
  },
  {
    clause: "moved",
    action: "appointment.reschedule",
    doors: [
      "apps/web/lib/scheduling/actions.ts:rescheduleAppointment",
      "apps/web/lib/scheduling/actions.ts:bulkRescheduleAppointments",
    ],
  },
  {
    clause: "accepted_in_pedidos",
    action: "appointment.update",
    doors: ["apps/web/lib/scheduling/actions.ts:confirmAppointmentRequest"],
  },
  {
    clause: "accepted_with_estado",
    action: "appointment.update",
    doors: ["apps/web/lib/scheduling/actions.ts:updateAppointment"],
  },
  {
    clause: "brought_back",
    action: "appointment.update",
    doors: ["apps/web/lib/scheduling/actions.ts:updateAppointment"],
  },
  {
    clause: "accepted_in_sms_review",
    action: "appointment.sms_reply_reviewed",
    doors: ["apps/web/lib/reminders/inbound-store.ts:resolveReviewItem"],
  },
  {
    clause: "accepted_by_sms_reply",
    action: "appointment.patient_sms_reply",
    doors: ["apps/web/lib/reminders/inbound-reply.ts:applyInboundReply"],
  },
] as const;

export type ReArmingClause = (typeof RE_ARMING_SAVES)[number]["clause"];

/** The `origin` of an online request (0067), as `is_unconfirmed_pedido` and the dispatcher read it. */
const REQUEST_ORIGIN = "patient_portal";

/**
 * The visit's start AT `mark`, as millisecond text: the `startsAt` of its
 * latest `appointment.create` or `appointment.reschedule` row written at or
 * before the mark. Null when there is none, or it carries no `startsAt`.
 */
function startAtTheMark(tx: DbTx, mark: SQL): SQL {
  const prior = alias(auditLog, "reminder_start_at_the_mark");
  // Qualified by hand: a select list renders a column without its alias, and
  // the enclosing query has another `metadata` in scope.
  return sql`(${tx
    .select({ startsAt: sql.raw(`"reminder_start_at_the_mark"."metadata"->>'startsAt'`) })
    .from(prior)
    .where(
      and(
        eq(prior.entityType, "appointment"),
        eq(prior.entityId, appointments.id),
        inArray(prior.action, ["appointment.create", "appointment.reschedule"]),
        lte(prior.createdAt, sql`${mark}`),
      ),
    )
    .orderBy(desc(prior.createdAt), desc(prior.id))
    .limit(1)})`;
}

/** The visit's start now, as the same millisecond text `toISOString()` writes. */
const START_NOW_TEXT = sql`to_char(date_trunc('milliseconds', ${appointments.startsAt}) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

/**
 * One clause of the table, on an alias of the audit table, for the enclosing
 * `appointments` row; `mark` is the instant the gate reads saves after.
 * Text against text on the metadata, so a row of another shape matches
 * nothing and raises nothing.
 */
export function reArmingClause(
  tx: DbTx,
  clause: ReArmingClause,
  saved: Record<"action" | "metadata", PgColumn>,
  mark: SQL,
): SQL {
  const action = RE_ARMING_SAVES.find((c) => c.clause === clause)!.action;
  const of = (...more: SQL[]) => and(eq(saved.action, action), ...more)!;
  const isRequest = sql`${appointments.origin} = ${REQUEST_ORIGIN}`;
  switch (clause) {
    case "booked":
      return of();
    case "moved":
      // Counted only when the start the mark was for is not the start now (see the table's notes).
      return of(sql`${startAtTheMark(tx, mark)} is distinct from ${START_NOW_TEXT}`);
    case "accepted_in_pedidos":
      return of(sql`${saved.metadata}->>'via' = 'portal_request_confirm'`);
    case "accepted_with_estado":
      return of(
        sql`${saved.metadata}->>'fromStatus' = 'scheduled'`,
        sql`${saved.metadata}->>'toStatus' = 'confirmed'`,
        isRequest,
      );
    case "brought_back":
      return of(
        sql`${saved.metadata}->>'fromStatus' = 'cancelled'`,
        or(
          sql`${saved.metadata}->>'toStatus' = 'confirmed'`,
          and(sql`${saved.metadata}->>'toStatus' = 'scheduled'`, sql`${appointments.origin} <> ${REQUEST_ORIGIN}`),
        )!,
      );
    case "accepted_in_sms_review":
      return of(
        sql`${saved.metadata}->>'resolution' = 'confirmed'`,
        sql`${saved.metadata}->>'applied' = 'true'`,
        isRequest,
      );
    case "accepted_by_sms_reply":
      return of(sql`${saved.metadata}->>'outcome' = 'confirmed'`, isRequest);
  }
}

/**
 * True for the `appointments` row of the enclosing query when a RE-ARMING SAVE
 * (the table above) on its audit trail was written STRICTLY AFTER `instant`,
 * by the row's own `created_at`, the database's clock at the save. A save
 * written AT `instant` exactly is not after it.
 *
 * `unlessPrecededBy`, when given, is a condition on that save's `created_at`
 * (passed in as SQL): a save it holds for does not count. The sending pass of
 * the sweep uses it for the held-back retry (./sweep-send.ts).
 *
 * Read by the reminder sweep for strategy's rulings R24 and R33 (./sweep.ts,
 * "NO GRACE FOR A VISIT SAVED AFTER ITS MARK").
 */
export function hasReArmingSaveAfter(tx: DbTx, instant: SQL, unlessPrecededBy?: (savedAt: SQL) => SQL): SQL {
  const saved = alias(auditLog, "reminder_re_arming_save");
  return exists(
    tx
      .select({ one: sql`1` })
      .from(saved)
      .where(
        and(
          eq(saved.entityType, "appointment"),
          eq(saved.entityId, appointments.id),
          or(...RE_ARMING_SAVES.map((c) => reArmingClause(tx, c.clause, saved, instant))),
          sql`${saved.createdAt} > ${instant}`,
          unlessPrecededBy ? not(unlessPrecededBy(sql`${saved.createdAt}`)) : undefined,
        ),
      ),
  );
}
