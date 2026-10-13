import "server-only";
import { and, count, eq, gt, gte, inArray, like, lt, lte, min, notExists, sql, type SQL } from "drizzle-orm";
import { alias, type PgColumn } from "drizzle-orm/pg-core";
import { assertCan } from "@osteojp/auth";
import { appointments, auditLog, reminderDispatches, type DbTx } from "@osteojp/db";
import type { Channel } from "@osteojp/notify";

import { runScoped, type RequestContext } from "@/lib/auth/context";

import { REMINDER_OFFSETS, type ReminderOffset } from "./offsets";
import { REMINDER_CLAIM_ACTION } from "./reminder-claim";
import { REMIND_VISITS_THAT_NEVER_HAD_A_REMINDER, hasSchedulingEvent } from "./reminder-population";

/**
 * THE TWO NUMBERS ON LEMBRETES SMS, for both channels.
 *
 * ==========================================================================
 * WHAT THE LIST BELOW THEM CANNOT SHOW
 * ==========================================================================
 * The list is `reminder_dispatches`: one row per attempt that REACHED the
 * sending stage, SMS only. A reminder nobody ever attempted leaves no row
 * there, and neither does an attempt that died before it could write one. Both
 * are absences, and a list cannot show an absence. These two counts can,
 * because the dispatcher now leaves a claim (./reminder-claim.ts) before it
 * decides anything:
 *
 *   NUMBER ONE, a mark with no claim. The reminder's time passed more than 30
 *   minutes ago, the visit is still ahead, and no sender took it for the start
 *   the visit has now.
 *
 *   NUMBER TWO, a claim with no outcome. A sender took the reminder more than
 *   30 minutes ago and no ledger row followed.
 *
 * ==========================================================================
 * THEY COUNT. THEY DECIDE NOTHING AND SEND NOTHING.
 * ==========================================================================
 * Two reads, as the viewer, under the viewer's own claims (`runScoped`), never
 * the reminder job's context: the same rule and the same reason as
 * reminder-log.ts. An admin or receptionist assigned to clinics counts only
 * the visits `appointments_rls` lets them read.
 *
 * ==========================================================================
 * WHICH VISITS NUMBER ONE COUNTS, AND FROM WHEN
 * ==========================================================================
 * ONLY A VISIT THE CLINIC SAVED. A visit that never had a reminder under the
 * rules of today (an imported one, an online request nobody has handled) is
 * not a visit whose reminder went missing, and whether such a visit should be
 * reminded at all is the owner's open question. The switch and its default,
 * NO, are in ./reminder-population.ts; this file reads it and decides nothing.
 *
 * ONLY A MARK THAT FELL DUE AFTER CLAIMS BEGAN. A reminder sent before the
 * dispatcher wrote claims has no claim and never will, and the list below the
 * counts shows it as sent. So number one has a floor: the first claim of the
 * last seven days. A mark before it is not counted. With NO claim in seven
 * days there is no floor, and number one is not a number at all (null): the
 * page says so in words, because a zero there would mean "nothing was missed"
 * and nobody counted.
 *
 * WHAT IS STILL IN IT, so it has a baseline above zero: a request accepted
 * after its mark, and a visit moved to within the lead time.
 */

/** "Over 30 minutes": how long a mark or a claim is left alone before it is counted. */
export const NUMBERS_SETTLE_MS = 30 * 60_000;

/**
 * Number two looks at claims taken in the last seven days. A bound, so the
 * read stays on `audit_log_created_idx` and one lost attempt is not counted
 * for ever.
 */
export const CLAIM_OUTCOME_WINDOW_MS = 7 * 24 * 60 * 60_000;

/**
 * The statuses a reminder is still sent for: the dispatcher's
 * REMINDABLE_STATUSES (dispatch.ts), which that file does not export.
 * reminder-numbers.test.ts reads dispatch.ts and fails if the two differ.
 */
export const NUMBERS_REMINDABLE_STATUSES = ["scheduled", "confirmed"] as const;

export type ReminderChannelNumbers = {
  /** Number one. Null when it could not be counted: no claim in the last seven days. */
  marksWithoutClaim: number | null;
  /** Number two. */
  claimsWithoutOutcome: number;
};

export type ReminderNumbers = Record<Channel, ReminderChannelNumbers>;

/**
 * A timestamptz column as the ISO instant `Date.prototype.toISOString()`
 * writes, which is how a claim stores its start. Text against text, so a
 * malformed value in a row can never raise a cast error into the page.
 */
function isoInstant(column: PgColumn): SQL {
  return sql`to_char(${column} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
}

/** The three `audit_log` columns a claim is recognised by, under any alias. */
type ClaimColumns = Record<"entityType" | "action" | "metadata", PgColumn>;

/** The claims of one offset and channel, in whichever alias asks. */
function isClaimFor(t: ClaimColumns, offset: ReminderOffset): SQL | undefined {
  return and(
    eq(t.entityType, "appointment"),
    eq(t.action, REMINDER_CLAIM_ACTION),
    sql`${t.metadata}->>'offsetId' = ${offset.id}`,
    sql`${t.metadata}->>'channel' = ${offset.channel}`,
  );
}

/**
 * NUMBER ONE'S FLOOR: when the first claim of the last seven days was written,
 * of any reminder of the tenant. Null when there is none.
 *
 * Seven days and not "ever": the bound keeps the read on
 * `audit_log_created_idx`, as number two's is, and it loses nothing. A mark
 * number one looks at is at most the longest offset old, so a first claim
 * older than that moves no count. And seven days with no claim at all is not
 * a start-up any more: the claims have stopped, and null says that too.
 */
async function readFirstClaimAt(tx: DbTx, now: Date): Promise<Date | null> {
  const [row] = await tx
    .select({ first: min(auditLog.createdAt) })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.entityType, "appointment"),
        eq(auditLog.action, REMINDER_CLAIM_ACTION),
        gte(auditLog.createdAt, new Date(now.getTime() - CLAIM_OUTCOME_WINDOW_MS)),
      ),
    );
  return row?.first ?? null;
}

/**
 * NUMBER ONE for one offset: visits still ahead whose mark passed more than 30
 * minutes ago, with no claim for this offset, this channel and THIS start.
 *
 *   - "visit ahead" and "mark over 30 minutes past" are one range on the
 *     start: after now, and before now minus 30 minutes plus the offset.
 *   - the mark is at or after the floor (`firstClaimAt`): claims were being
 *     written when it fell due.
 *   - the clinic saved it (./reminder-population.ts), unless the switch says
 *     every visit counts.
 *   - created before its mark. A visit booked inside the lead time never had
 *     this reminder (computeDueReminders drops a mark already past).
 *   - a claim for ANOTHER start does not count: the visit moved, and the
 *     claim is about the time it no longer has.
 *   - an `early` claim does not count either: it was taken over ten minutes
 *     before this mark, by a job that woke at an older time.
 */
async function countMarksWithoutClaim(
  tx: DbTx,
  offset: ReminderOffset,
  now: Date,
  firstClaimAt: Date,
  includeNeverReminded: boolean,
): Promise<number> {
  const claim = alias(auditLog, "reminder_number_claim");
  const startBefore = new Date(now.getTime() - NUMBERS_SETTLE_MS + offset.minutesBefore * 60_000);
  const startFrom = new Date(firstClaimAt.getTime() + offset.minutesBefore * 60_000);
  const [row] = await tx
    .select({ n: count() })
    .from(appointments)
    .where(
      and(
        inArray(appointments.status, [...NUMBERS_REMINDABLE_STATUSES]),
        gt(appointments.startsAt, now),
        lt(appointments.startsAt, startBefore),
        gte(appointments.startsAt, startFrom),
        sql`${appointments.createdAt} < ${appointments.startsAt} - make_interval(mins => ${offset.minutesBefore}::int)`,
        includeNeverReminded ? undefined : hasSchedulingEvent(tx),
        notExists(
          tx
            .select({ one: sql`1` })
            .from(claim)
            .where(
              and(
                isClaimFor(claim, offset),
                eq(claim.entityId, appointments.id),
                sql`${claim.metadata}->>'startsAt' = ${isoInstant(appointments.startsAt)}`,
                sql`${claim.metadata}->>'early' is distinct from 'true'`,
              ),
            ),
        ),
      ),
    );
  return Number(row?.n ?? 0);
}

/**
 * NUMBER TWO for one offset: claims between 30 minutes and seven days old that
 * no ledger row followed.
 *
 * "FOLLOWED" IS DERIVED, because the ledger holds no start, no offset and no
 * claim id (0075): a row for the same appointment and channel, whose template
 * is this offset's reminder (`reminder.<offset>.`, the fee-notice body
 * included), written at or after the claim and before the next claim of the
 * same reminder. Any outcome counts: sent, suppressed or refused by the
 * provider are all a recorded result.
 *
 * The INNER join is what narrows it to the viewer's clinics, as in
 * reminder-log.ts: a claim whose appointment this viewer may not read is a
 * claim this viewer does not count.
 */
async function countClaimsWithoutOutcome(tx: DbTx, offset: ReminderOffset, now: Date): Promise<number> {
  const claim = alias(auditLog, "reminder_number_claim");
  const later = alias(auditLog, "reminder_number_later_claim");
  const [row] = await tx
    .select({ n: count() })
    .from(claim)
    .innerJoin(appointments, eq(appointments.id, claim.entityId))
    .where(
      and(
        isClaimFor(claim, offset),
        lt(claim.createdAt, new Date(now.getTime() - NUMBERS_SETTLE_MS)),
        gte(claim.createdAt, new Date(now.getTime() - CLAIM_OUTCOME_WINDOW_MS)),
        notExists(
          tx
            .select({ one: sql`1` })
            .from(reminderDispatches)
            .where(
              and(
                eq(reminderDispatches.appointmentId, claim.entityId),
                eq(reminderDispatches.channel, offset.channel),
                like(reminderDispatches.templateId, `reminder.${offset.id}.%`),
                gte(reminderDispatches.createdAt, claim.createdAt),
                notExists(
                  tx
                    .select({ one: sql`1` })
                    .from(later)
                    .where(
                      and(
                        isClaimFor(later, offset),
                        eq(later.entityId, claim.entityId),
                        gt(later.createdAt, claim.createdAt),
                        lte(later.createdAt, reminderDispatches.createdAt),
                      ),
                    ),
                ),
              ),
            ),
        ),
      ),
    );
  return Number(row?.n ?? 0);
}

/**
 * Both numbers, per channel. Each offset goes out on one channel
 * (REMINDER_OFFSETS), so today SMS is the 24 hour reminder and email the 48
 * hour one; two offsets on one channel would add up.
 *
 * `now` is passed in by tests. Every instant the queries compare against comes
 * from it, so a seeded database gives the same answer at any hour.
 *
 * `includeNeverReminded` is the switch of ./reminder-population.ts, and that
 * constant is its value everywhere but in a test: the page passes nothing.
 */
export async function readReminderNumbers(
  ctx: RequestContext,
  opts: { now?: Date; includeNeverReminded?: boolean } = {},
): Promise<ReminderNumbers> {
  assertCan(ctx.role, "reminders:log_read");
  const now = opts.now ?? new Date();
  const includeNeverReminded = opts.includeNeverReminded ?? REMIND_VISITS_THAT_NEVER_HAD_A_REMINDER;

  return runScoped(
    ctx,
    async (tx) => {
      const firstClaimAt = await readFirstClaimAt(tx, now);
      const marks: Record<Channel, number> = { sms: 0, email: 0 };
      const claims: Record<Channel, number> = { sms: 0, email: 0 };
      for (const offset of REMINDER_OFFSETS) {
        if (firstClaimAt !== null) {
          marks[offset.channel] += await countMarksWithoutClaim(tx, offset, now, firstClaimAt, includeNeverReminded);
        }
        claims[offset.channel] += await countClaimsWithoutOutcome(tx, offset, now);
      }
      // No claim in seven days: number one was not counted, and is not a zero.
      const counted = firstClaimAt !== null;
      return {
        sms: { marksWithoutClaim: counted ? marks.sms : null, claimsWithoutOutcome: claims.sms },
        email: { marksWithoutClaim: counted ? marks.email : null, claimsWithoutOutcome: claims.email },
      };
    },
    "db:reminder-numbers",
  );
}
