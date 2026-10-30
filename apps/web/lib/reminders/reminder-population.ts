import "server-only";
import { and, eq, exists, inArray, not, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
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
 * The scheduling events of the enclosing `appointments` row, under an alias of
 * the audit table of their own: the rows and the condition that picks them.
 * ONE condition, read by both predicates below, so "a scheduling save" means
 * the same audit rows to each of them.
 */
function schedulingEvents(name: string) {
  const saved = alias(auditLog, name);
  const where = and(
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
  );
  return { saved, where };
}

/**
 * True for the `appointments` row of the enclosing query when a scheduling
 * event is on its audit trail. Read under the caller's own claims, so a row of
 * another tenant that names this visit is never seen. Text against text on the
 * metadata, so a row of another shape matches nothing and raises nothing.
 */
export function hasSchedulingEvent(tx: DbTx): SQL {
  const { saved, where } = schedulingEvents("reminder_scheduling_event");
  return exists(tx.select({ one: sql`1` }).from(saved).where(where));
}

/**
 * True for the `appointments` row of the enclosing query when a scheduling
 * event on its audit trail was written STRICTLY AFTER `instant`: the same audit
 * rows `hasSchedulingEvent` reads, and their own `created_at`, the database's
 * clock at the save. A save written AT `instant` exactly is not after it.
 *
 * `unlessPrecededBy`, when given, is a condition on that save's `created_at`
 * (passed in as SQL): a save it holds for does not count. The sending pass of
 * the sweep uses it for "this mark was already handed over at or before the
 * save" (./sweep-send.ts).
 *
 * Read by the reminder sweep for strategy's ruling R24 (./sweep.ts, "NO GRACE
 * FOR A VISIT SAVED AFTER ITS MARK").
 */
export function hasSchedulingEventAfter(
  tx: DbTx,
  instant: SQL,
  unlessPrecededBy?: (savedAt: SQL) => SQL,
): SQL {
  const { saved, where } = schedulingEvents("reminder_scheduling_event_after_mark");
  const savedAt = sql`${saved.createdAt}`;
  return exists(
    tx
      .select({ one: sql`1` })
      .from(saved)
      .where(
        and(
          where,
          sql`${saved.createdAt} > ${instant}`,
          unlessPrecededBy ? not(unlessPrecededBy(savedAt)) : undefined,
        ),
      ),
  );
}
