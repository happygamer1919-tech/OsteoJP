import "server-only";
import { auditLog, reminderDispatches, type DbTx } from "@osteojp/db";
import type { Channel } from "@osteojp/notify";
import { and, eq, exists, gt, gte, inArray, like, lte, notExists, sql, type SQL } from "drizzle-orm";
import { alias, type PgColumn } from "drizzle-orm/pg-core";

import { assertPiiFreeAuditMetadata } from "@/lib/audit/metadata-contract";
import { withReminderTenantContext } from "./context";
import { REMINDER_OFFSETS } from "./offsets";

/**
 * THE REMINDER CLAIM: "a sender took this reminder, for this start, at this
 * moment", as a row that can be read back.
 *
 * ==========================================================================
 * WHAT IT DECIDES, AND IT IS ONE THING
 * ==========================================================================
 * `takeReminderClaim` answers `held` in exactly one case: this reminder, for
 * the start the visit has now, WAS ALREADY HANDED TO THE PROVIDER. An earlier
 * claim for the same appointment, offset, channel and start is still live, and
 * a `sent` ledger row followed it (`claimIsHeld`, below). The dispatcher then
 * sends nothing and writes nothing. That is the second sender of a reminder
 * that already went out: a step the scheduler ran again, a second run for the
 * same mark.
 *
 * IN EVERY OTHER CASE THE DISPATCHER DOES WHAT IT ALWAYS DID. A CLAIM ALONE
 * NEVER BLOCKS, WHATEVER ITS AGE. A claim with no `sent` row after it is a
 * sender that died, or threw, or could not write its release, or decided to
 * send nothing, and the next caller claims again and is asked every gate
 * afresh. So a claim cannot cost a patient a reminder: the most this file can
 * remove is a SECOND COPY of a message already sent. Two senders inside the
 * same instant both find no `sent` row yet and both send, as before.
 *
 * ==========================================================================
 * A THROW RELEASES THE CLAIM
 * ==========================================================================
 * `audit_log` is append only, so a release is a second row that names its
 * claim (`releaseReminderClaim`). A claim is LIVE while no release names it.
 * The dispatcher writes one whenever it throws after taking a claim, and
 * throws the same error on. Today a release changes one answer: a `sent` row
 * is never counted as a released claim's own, so the released claim of a
 * sender that was refused cannot take that row away from the live claim of
 * the sender that did send (`claimIsHeld`). It changes no other, because a
 * claim with no `sent` row does not block anyway; it keeps the claims in order
 * for the change that will make a live claim block at any age.
 *
 * ==========================================================================
 * WHY AN AUDIT ROW, AND NOT A LEDGER ROW
 * ==========================================================================
 * The same reason as the booking-approved hand-over (dispatch-ledger.ts): the
 * key carries the START, so a visit moved to another time earns a claim of its
 * own, and `reminder_dispatches` has no column that can say which start a row
 * was for. `audit_log` takes ids, enums and an ISO instant, with no migration.
 * No actor: a background job wrote it.
 *
 * ==========================================================================
 * IT NEVER THROWS INTO THE SEND PATH, AND IT FAILS OPEN
 * ==========================================================================
 * Everything in `takeReminderClaim` sits inside one try. A claim that cannot
 * be read or written is logged, ids only (rule 7), and answers "not held": the
 * reminder goes out as it does today, without its claim. An unreadable trail
 * costs at most a repeat, never the message.
 *
 * ON A WAIT TOO, NOT ONLY ON AN ERROR. The dispatcher awaits the claim before
 * it sends, so a claim that queued behind a stuck holder of this reminder's
 * lock, or behind a lock on `audit_log`, would hold the reminder for as long as
 * the holder sat there. The claim's transaction therefore bounds its own waits
 * first (`boundReminderClaimWaits`): Postgres ends the wait, the catch below
 * logs it, and the reminder goes out without its claim.
 */

/**
 * The audit action of a claim. One row per dispatcher call that found its
 * appointment and was not held.
 */
export const REMINDER_CLAIM_ACTION = "appointment.reminder_claimed";

/** The audit action of a release: the row that names a claim its sender gave up. */
export const REMINDER_CLAIM_RELEASE_ACTION = "appointment.reminder_claim_released";

/**
 * THE LEDGER OUTCOMES THAT MAKE A CLAIM BLOCK. ONE LIST, PINNED BY A TEST.
 *
 * `sent`: the message was handed to the provider. A second sender would be a
 * second copy of it.
 *
 * `suppressed` IS NOT HERE, AND THAT IS A DEPARTURE FROM THE SWEEP'S DESIGN,
 * HELD FOR A RULING. THE DESIGN NAMES TWO OUTCOMES, `sent` AND `suppressed`,
 * and calls a suppression final for its start. This list has one. A
 * suppression is the dispatcher deciding, on record, to send nothing: the
 * visit was cancelled, the request was not accepted, the channel is off. If
 * it blocked, a second sender that arrives after the visit was put right
 * would send nothing, where today it reads the row again and sends. Such a
 * second sender exists: the scheduler runs the step again when it loses the
 * answer of the first. And the same design leaves a visit brought back after
 * its mark to the owner. Whether a suppression is final for its start is not
 * this file's to decide, so until it is ruled a suppressed reminder is asked
 * again exactly as it was before claims existed. Adding the word here is the
 * whole change.
 *
 * `provider_error` IS NOT HERE EITHER, and that one is settled: the provider
 * refused, the run failed, and the scheduler's retry is how that reminder
 * still gets out.
 */
export const BLOCKING_LEDGER_OUTCOMES = ["sent"] as const;

/**
 * Who took the claim. `run` is the sleeping job of today
 * (send-appointment-reminder); `sweep` is reserved for the pass that reads the
 * database, which does not exist yet.
 */
export type ReminderClaimTaker = "run" | "sweep";

/** A claim taken MORE than this before its mark is recorded as `early`. */
export const EARLY_CLAIM_MS = 10 * 60_000;

/**
 * The instant a reminder is due: the start minus the offset. Null for an offset
 * this build does not know, because a mark with no rule behind it is a guess.
 */
export function reminderMark(startsAt: Date, offsetId: string): Date | null {
  const offset = REMINDER_OFFSETS.find((o) => o.id === offsetId);
  return offset ? new Date(startsAt.getTime() - offset.minutesBefore * 60_000) : null;
}

/**
 * Was this claim taken over ten minutes before its mark? A sleeping job that
 * wakes at the old time of a visit since moved later is the case: it is early
 * for the start the visit has now. Exactly ten minutes is NOT early. Null when
 * the mark is unknown.
 *
 * Pure: `now` is passed in.
 */
export function isEarlyClaim(startsAt: Date, offsetId: string, now: Date): boolean | null {
  const mark = reminderMark(startsAt, offsetId);
  if (mark === null) return null;
  return mark.getTime() - now.getTime() > EARLY_CLAIM_MS;
}

/** Tenant, appointment, offset and channel. Never table-global. */
export function reminderClaimLockPayload(
  tenantId: string,
  appointmentId: string,
  offsetId: string,
  channel: string,
): string {
  return `reminder-claim:${tenantId}:${appointmentId}:${offsetId}:${channel}`;
}

/**
 * The transaction-scoped advisory lock two senders of ONE reminder queue on,
 * the pattern of lib/scheduling/slot-lock.ts. pg_advisory_xact_lock releases at
 * commit or rollback, so it cannot outlive the claim's own short transaction.
 * Under it the claim reads whether this reminder is held and then writes its
 * own row, so two takers cannot both read before either has written.
 */
export function acquireReminderClaimLock(
  tenantId: string,
  appointmentId: string,
  offsetId: string,
  channel: string,
): SQL {
  const payload = reminderClaimLockPayload(tenantId, appointmentId, offsetId, channel);
  return sql`select pg_advisory_xact_lock(hashtextextended(${payload}, 0))`;
}

/**
 * How long the claim may wait, in Postgres's own units. Two seconds for a lock
 * (this reminder's advisory lock, or a lock another session holds on
 * `audit_log`), five for any one statement. An uncontended claim takes
 * milliseconds, and two honest senders of one reminder queue for as long as
 * one INSERT, so neither bound is reached by a claim that is working.
 */
export const CLAIM_LOCK_TIMEOUT = "2s";
export const CLAIM_STATEMENT_TIMEOUT = "5s";

/**
 * The first statement of the claim's transaction: bound every wait that
 * follows. `set_config(..., true)` is `SET LOCAL` with the value as a bound
 * parameter, so both settings end with this transaction and never reach the
 * pooled connection's next user.
 */
export function boundReminderClaimWaits(): SQL {
  return sql`select set_config('lock_timeout', ${CLAIM_LOCK_TIMEOUT}, true), set_config('statement_timeout', ${CLAIM_STATEMENT_TIMEOUT}, true)`;
}

/** The `audit_log` columns a claim of one reminder is recognised by, under any alias. */
type ClaimColumns = Record<"tenantId" | "entityType" | "entityId" | "action" | "metadata", PgColumn>;

/**
 * IS THIS REMINDER HELD? True when a claim for this appointment, offset,
 * channel and START:
 *
 *   - was not taken `early`. A sleeping job that woke at the old time of a
 *     visit since moved later sent over ten minutes before the mark of the
 *     start the visit has now. That send does not hold the one at the right
 *     time, for any taker: today both go out;
 *   - is LIVE: no release names it;
 *   - has a ledger row AFTER it whose outcome is on the list above: `sent`.
 *
 * "AFTER IT" IS DERIVED, because the ledger holds no start, no offset and no
 * claim id (0075), and it is the derivation the second count on Lembretes SMS
 * uses (reminder-numbers.ts), with one clause more: a row for the same
 * appointment and channel, whose template is this offset's reminder
 * (`reminder.<offset>.`, the fee-notice body included), written at or after
 * the claim and BEFORE THE NEXT LIVE CLAIM OF THIS REMINDER, WHATEVER START
 * THAT ONE NAMES. Without the last clause a visit moved away and back would
 * let the row of the other start count for the old claim.
 *
 * A RELEASED CLAIM IN BETWEEN DOES NOT TAKE THE ROW (the clause the count does
 * not have). A release is written only by a sender that threw, and a sender
 * that threw handed nothing over: the dispatcher writes its `sent` row as the
 * last thing it does (dispatch.ts). So a `sent` row is never a released
 * claim's own, and it stays with the live claim before it. The order this
 * closes: one sender is slow at the provider, a second claims, is refused and
 * releases, and then the first one's `sent` row lands. The second sender's
 * retry is held, where it would have sent a second copy.
 *
 * An offset this build does not know has no mark and no rule behind it, and
 * never holds anything.
 *
 * Reads as the caller: inside the reminder job's context that is the tenant's
 * own rows and nobody else's (the policies of `audit_log` and of
 * `reminder_dispatches`). The tenant is stated in every clause as well.
 *
 * IT THROWS when the read fails. `takeReminderClaim` is the one caller, and
 * its catch turns that into "not held".
 */
export async function claimIsHeld(
  tx: DbTx,
  args: { tenantId: string; appointmentId: string; offsetId: string; channel: Channel; startsAt: Date },
): Promise<boolean> {
  if (!REMINDER_OFFSETS.some((o) => o.id === args.offsetId)) return false;

  const claim = alias(auditLog, "reminder_claim");
  const release = alias(auditLog, "reminder_claim_release");
  const later = alias(auditLog, "reminder_later_claim");
  const laterRelease = alias(auditLog, "reminder_later_claim_release");
  /** A release of this appointment that names the claim with this id. */
  const releaseNaming = (r: ClaimColumns, claimId: PgColumn): SQL | undefined =>
    and(
      eq(r.tenantId, args.tenantId),
      eq(r.entityType, "appointment"),
      eq(r.entityId, args.appointmentId),
      eq(r.action, REMINDER_CLAIM_RELEASE_ACTION),
      sql`${r.metadata}->>'claimId' = ${claimId}::text`,
    );
  /** A claim of THIS reminder (appointment, offset, channel), of any start. */
  const ofThisReminder = (t: ClaimColumns): SQL | undefined =>
    and(
      eq(t.tenantId, args.tenantId),
      eq(t.entityType, "appointment"),
      eq(t.entityId, args.appointmentId),
      eq(t.action, REMINDER_CLAIM_ACTION),
      sql`${t.metadata}->>'offsetId' = ${args.offsetId}`,
      sql`${t.metadata}->>'channel' = ${args.channel}`,
    );

  const rows = await tx
    .select({ id: claim.id })
    .from(claim)
    .where(
      and(
        ofThisReminder(claim),
        // The start this claim was taken for. Both sides are the same
        // `toISOString()` of the same column, so equality is exact.
        sql`${claim.metadata}->>'startsAt' = ${args.startsAt.toISOString()}`,
        sql`${claim.metadata}->>'early' is distinct from 'true'`,
        notExists(tx.select({ one: sql`1` }).from(release).where(releaseNaming(release, claim.id))),
        exists(
          tx
            .select({ one: sql`1` })
            .from(reminderDispatches)
            .where(
              and(
                eq(reminderDispatches.tenantId, args.tenantId),
                eq(reminderDispatches.appointmentId, args.appointmentId),
                eq(reminderDispatches.channel, args.channel),
                like(reminderDispatches.templateId, `reminder.${args.offsetId}.%`),
                inArray(reminderDispatches.outcome, [...BLOCKING_LEDGER_OUTCOMES]),
                gte(reminderDispatches.createdAt, claim.createdAt),
                notExists(
                  tx
                    .select({ one: sql`1` })
                    .from(later)
                    .where(
                      and(
                        ofThisReminder(later),
                        gt(later.createdAt, claim.createdAt),
                        lte(later.createdAt, reminderDispatches.createdAt),
                        // Live: a released claim in between does not take the row.
                        notExists(
                          tx
                            .select({ one: sql`1` })
                            .from(laterRelease)
                            .where(releaseNaming(laterRelease, later.id)),
                        ),
                      ),
                    ),
                ),
              ),
            ),
        ),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * What taking a claim answers.
 *
 * `held`: this reminder was already sent for this start. No row was written,
 * and the caller sends nothing.
 *
 * Not held: the caller goes on. `claimId` is the row just written, for the
 * release a throw owes it; null when the claim could not be read or written,
 * where there is nothing to release.
 */
export type ReminderClaimAnswer = { held: true } | { held: false; claimId: string | null };

/**
 * Take the claim for one reminder, or learn that it is held. One tenant
 * transaction: bound the waits, take the lock, read (`claimIsHeld`), and write
 * the row unless it is held.
 *
 * It never throws, and every failure answers "not held": see the header.
 *
 * The start is stored as an ISO instant, the same `toISOString()` the
 * booking-approved hand-over stores, so a reader can compare it exactly.
 */
export async function takeReminderClaim(args: {
  tenantId: string;
  appointmentId: string;
  offsetId: string;
  channel: Channel;
  startsAt: Date;
  taker: ReminderClaimTaker;
  /** The taker's clock. Passed in by tests; the dispatcher leaves it out. */
  now?: Date;
}): Promise<ReminderClaimAnswer> {
  try {
    const metadata = {
      source: "reminder-claim",
      offsetId: args.offsetId,
      channel: args.channel,
      startsAt: args.startsAt.toISOString(),
      taker: args.taker,
      early: isEarlyClaim(args.startsAt, args.offsetId, args.now ?? new Date()),
    };
    // The audit metadata contract, asked of this writer like every other
    // (lib/audit/metadata-contract.ts). INSIDE the try, so a refusal is logged
    // below and never thrown into the send path.
    assertPiiFreeAuditMetadata(metadata, "reminders/takeReminderClaim");
    return await withReminderTenantContext(args.tenantId, async (tx): Promise<ReminderClaimAnswer> => {
      await tx.execute(boundReminderClaimWaits());
      await tx.execute(
        acquireReminderClaimLock(args.tenantId, args.appointmentId, args.offsetId, args.channel),
      );
      if (await claimIsHeld(tx, args)) return { held: true };
      const [row] = await tx
        .insert(auditLog)
        .values({
          tenantId: args.tenantId,
          actorUserId: null,
          action: REMINDER_CLAIM_ACTION,
          entityType: "appointment",
          entityId: args.appointmentId,
          metadata,
          ip: null,
        })
        .returning({ id: auditLog.id });
      return { held: false, claimId: row?.id ?? null };
    });
  } catch (e) {
    console.error(
      `[reminders] reminder claim write FAILED tenantId=${args.tenantId} ` +
        `appointmentId=${args.appointmentId} offsetId=${args.offsetId} channel=${args.channel}: ` +
        `${e instanceof Error ? e.name : "unknown"}`,
    );
    return { held: false, claimId: null };
  }
}

/**
 * Release a claim: one more audit row, naming it. The dispatcher calls this
 * when it throws after taking a claim, and then throws the same error on.
 *
 * IT NEVER THROWS, for the dispatcher's reason: the error on its way out is
 * the one the scheduler must see, and a failed release must not replace it. A
 * release that cannot be written is logged, ids only. The claim then stays
 * live with no `sent` row after it, which blocks nothing: the retry claims
 * again and sends.
 *
 * Its waits are bounded like the claim's, and it queues on the same lock, so a
 * release never lands between another taker's read and its write.
 */
export async function releaseReminderClaim(args: {
  tenantId: string;
  appointmentId: string;
  offsetId: string;
  channel: Channel;
  claimId: string;
}): Promise<void> {
  try {
    const metadata = {
      source: "reminder-claim",
      claimId: args.claimId,
      offsetId: args.offsetId,
      channel: args.channel,
    };
    assertPiiFreeAuditMetadata(metadata, "reminders/releaseReminderClaim");
    await withReminderTenantContext(args.tenantId, async (tx) => {
      await tx.execute(boundReminderClaimWaits());
      await tx.execute(
        acquireReminderClaimLock(args.tenantId, args.appointmentId, args.offsetId, args.channel),
      );
      await tx.insert(auditLog).values({
        tenantId: args.tenantId,
        actorUserId: null,
        action: REMINDER_CLAIM_RELEASE_ACTION,
        entityType: "appointment",
        entityId: args.appointmentId,
        metadata,
        ip: null,
      });
    });
  } catch (e) {
    console.error(
      `[reminders] reminder claim release FAILED tenantId=${args.tenantId} ` +
        `appointmentId=${args.appointmentId} offsetId=${args.offsetId} channel=${args.channel}: ` +
        `${e instanceof Error ? e.name : "unknown"}`,
    );
  }
}
