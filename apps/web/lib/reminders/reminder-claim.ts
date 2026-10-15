import "server-only";
import { reminderClaims, reminderDispatches, type DbTx } from "@osteojp/db";
import type { Channel } from "@osteojp/notify";
import { and, eq, exists, gt, gte, inArray, like, lte, max, notExists, sql, type SQL } from "drizzle-orm";
import { alias, type PgColumn } from "drizzle-orm/pg-core";

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
 * `reminder_claims` is append only, so a release is a second row that names
 * its claim (`releaseReminderClaim`). A claim is LIVE while no release names it.
 * The dispatcher writes one whenever it throws after taking a claim, and
 * throws the same error on. Today a release changes one answer: a `sent` row
 * is never counted as a released claim's own, so the released claim of a
 * sender that was refused cannot take that row away from the live claim of
 * the sender that did send (`claimIsHeld`). It changes no other, because a
 * claim with no `sent` row does not block anyway; it keeps the claims in order
 * for the change that will make a live claim block at any age.
 *
 * ==========================================================================
 * WHERE IT IS KEPT: `reminder_claims`, NOT THE LEDGER AND NOT THE AUDIT TRAIL
 * ==========================================================================
 * Not the ledger: the key carries the START, so a visit moved to another time
 * earns a claim of its own, and `reminder_dispatches` has no column that can
 * say which start a row was for. Not `audit_log`, where these rows were first
 * drafted: any staff session of the tenant may insert an audit row, so any
 * staff session could have written a claim or a release this file would then
 * believe, and a claim is operational bookkeeping, not part of the record of
 * who did what. The table takes a row from the reminder job's own session
 * only (a tenant and no user), lets nobody update or delete one, and holds
 * each column to the kinds of row that carry it. A claim, a release and the
 * sweep's shadow row are its three kinds. It stores no outcome: whether a
 * reminder was sent stays in the ledger, and whether a claim blocks is decided
 * here, by reading both.
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
 * lock, or behind a lock on `reminder_claims`, would hold the reminder for as long as
 * the holder sat there. The claim's transaction therefore bounds its own waits
 * first (`boundReminderClaimWaits`): Postgres ends the wait, the catch below
 * logs it, and the reminder goes out without its claim.
 *
 * ONE REFUSAL IS AN ANSWER, NOT A FAILURE: THE SAME ATTEMPT TWICE. Every claim
 * carries its attempt number (`nextReminderClaimAttempt`), and the table takes
 * one claim per attempt of a reminder and start (0106,
 * `reminder_claims_claim_attempt_key`). When the table refuses this claim on
 * that key, another taker holds this attempt, and the answer is HELD, BY A
 * DUPLICATE: nothing is sent (strategy, Q-A of 2026-10-15). Only a 23505 on
 * that key; every other refusal fails open as above.
 *
 * ==========================================================================
 * WHILE THE SWEEP IS THE SENDER, THE CLAIM IS CLOSED INSTEAD (SWEEP-47)
 * ==========================================================================
 * Everything above is the claim as it works today, and it is what runs while
 * the send switch is off (./sweep-mode.ts). With the switch on the dispatcher
 * takes the claim through `takeReminderClaimClosed`, at the foot of this file,
 * and three answers change:
 *
 *   - A LIVE CLAIM BLOCKS AT ANY AGE, with or without a `sent` row after it.
 *     Two senders inside the same instant queue on the lock, the first writes
 *     its claim, and the second finds it and sends nothing.
 *   - A CLAIM THAT CANNOT BE READ OR WRITTEN STOPS THE SEND. It throws, and the
 *     caller tries again later: the next pass, or the scheduler's retry.
 *   - THE SENDER GIVES ITS CLAIM UP WHEN IT HANDED NOTHING OVER (a release, as
 *     above), so a reminder that was held back can be taken again. A claim
 *     whose message went out, or may have gone out, is never released.
 */

/**
 * The kind of a claim row in `reminder_claims`. One row per dispatcher call
 * that found its appointment and was not held. The row's id is the claim id.
 */
export const REMINDER_CLAIM_KIND = "claim";

/**
 * The kind of a release row: the row that names, in `claim_id`, a claim its
 * sender gave up. It carries no start of its own, and the table takes one
 * release per claim.
 */
export const REMINDER_CLAIM_RELEASE_KIND = "release";


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
 * `reminder_claims`), five for any one statement. An uncontended claim takes
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

/**
 * The unique index that takes one claim per attempt of a reminder and start
 * (0106): appointment, offset, channel, start and attempt, over claims only.
 */
export const REMINDER_CLAIM_ATTEMPT_KEY = "reminder_claims_claim_attempt_key";

/** Postgres's unique_violation. */
const UNIQUE_VIOLATION = "23505";

/**
 * Did the table refuse this claim because another taker holds the same
 * attempt? A 23505 that names `REMINDER_CLAIM_ATTEMPT_KEY`, and nothing else:
 * another unique index, or another code on this one, is not. Drizzle wraps
 * the driver's error, so the error and its cause are both read.
 *
 * Exported for direct testing.
 */
export function isDuplicateClaimAttempt(e: unknown): boolean {
  const cause = typeof e === "object" && e !== null ? (e as { cause?: unknown }).cause : undefined;
  return [e, cause].some((err) => {
    if (typeof err !== "object" || err === null) return false;
    const pg = err as { code?: unknown; constraint_name?: unknown };
    return pg.code === UNIQUE_VIOLATION && pg.constraint_name === REMINDER_CLAIM_ATTEMPT_KEY;
  });
}

/**
 * THE ATTEMPT NUMBER A NEW CLAIM CARRIES (0106): one more than the highest
 * attempt stored for this appointment, offset, channel and START among the
 * claims, any taker, early or not, released or not; 1 when there is none. A
 * release frees no number.
 *
 * Read under the reminder's lock, after the "is it held" read and before the
 * row, so for every taker that takes the lock the read and the write are one
 * step. The table refuses the collision for one that does not.
 *
 * IT THROWS when the read fails; the claim's own catch decides what that means.
 */
export async function nextReminderClaimAttempt(
  tx: DbTx,
  args: { tenantId: string; appointmentId: string; offsetId: string; channel: Channel; startsAt: Date },
): Promise<number> {
  const [last] = await tx
    .select({ attempt: max(reminderClaims.attempt) })
    .from(reminderClaims)
    .where(
      and(
        eq(reminderClaims.tenantId, args.tenantId),
        eq(reminderClaims.appointmentId, args.appointmentId),
        eq(reminderClaims.kind, REMINDER_CLAIM_KIND),
        eq(reminderClaims.offsetId, args.offsetId),
        eq(reminderClaims.channel, args.channel),
        eq(reminderClaims.startsAt, args.startsAt),
      ),
    );
  return (last?.attempt ?? 0) + 1;
}

/** The `reminder_claims` columns a row of one reminder is recognised by, under any alias. */
type ClaimColumns = Record<"tenantId" | "appointmentId" | "kind" | "offsetId" | "channel" | "claimId", PgColumn>;

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
 * own rows and nobody else's (the policies of `reminder_claims` and of
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

  const claim = alias(reminderClaims, "reminder_claim");
  const release = alias(reminderClaims, "reminder_claim_release");
  const later = alias(reminderClaims, "reminder_later_claim");
  const laterRelease = alias(reminderClaims, "reminder_later_claim_release");
  /**
   * A release that names the claim with this id. The table lets a release
   * name only a row of its own tenant and its own appointment
   * (`reminder_claims_claim_fkey`); both are stated here all the same.
   */
  const releaseNaming = (r: ClaimColumns, claimId: PgColumn): SQL | undefined =>
    and(
      eq(r.tenantId, args.tenantId),
      eq(r.appointmentId, args.appointmentId),
      eq(r.kind, REMINDER_CLAIM_RELEASE_KIND),
      eq(r.claimId, claimId),
    );
  /** A claim of THIS reminder (appointment, offset, channel), of any start. */
  const ofThisReminder = (t: ClaimColumns): SQL | undefined =>
    and(
      eq(t.tenantId, args.tenantId),
      eq(t.appointmentId, args.appointmentId),
      eq(t.kind, REMINDER_CLAIM_KIND),
      eq(t.offsetId, args.offsetId),
      eq(t.channel, args.channel),
    );

  const rows = await tx
    .select({ id: claim.id })
    .from(claim)
    .where(
      and(
        ofThisReminder(claim),
        // The start this claim was taken for. Both sides are the visit's own
        // start as a sender's clock carries it, so equality is exact.
        eq(claim.startsAt, args.startsAt),
        sql`${claim.early} is distinct from true`,
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
 * and the caller sends nothing. `duplicate`: held because the table refused
 * this claim's attempt, which another taker holds (`isDuplicateClaimAttempt`).
 *
 * Not held: the caller goes on. `claimId` is the row just written, for the
 * release a throw owes it; null when the claim could not be read or written,
 * where there is nothing to release.
 */
export type ReminderClaimAnswer = { held: true; duplicate?: true } | { held: false; claimId: string | null };

/**
 * Take the claim for one reminder, or learn that it is held. One tenant
 * transaction: bound the waits, take the lock, read (`claimIsHeld`), and
 * unless it is held, read the next attempt number and write the row.
 *
 * It never throws, and every failure answers "not held", except the table's
 * refusal of a duplicate attempt, which answers held: see the header.
 *
 * The start is stored as the instant itself (`starts_at`), with the mark it
 * was due at (`due_at`), so a reader compares instants and never text.
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
    // A start that is not an instant is a fixture's shape, never a row's. Said
    // HERE, inside the try, so it is logged below and never reaches the driver.
    if (Number.isNaN(args.startsAt.getTime())) throw new RangeError("the start is not an instant");
    const dueAt = reminderMark(args.startsAt, args.offsetId);
    const row = {
      tenantId: args.tenantId,
      appointmentId: args.appointmentId,
      kind: REMINDER_CLAIM_KIND,
      offsetId: args.offsetId,
      channel: args.channel,
      startsAt: args.startsAt,
      // The mark as the offset is defined today, stored so the row says what
      // was true when it was taken. Null, with `early`, for an unknown offset.
      dueAt,
      taker: args.taker,
      early: isEarlyClaim(args.startsAt, args.offsetId, args.now ?? new Date()),
    };
    return await withReminderTenantContext(args.tenantId, async (tx): Promise<ReminderClaimAnswer> => {
      await tx.execute(boundReminderClaimWaits());
      await tx.execute(
        acquireReminderClaimLock(args.tenantId, args.appointmentId, args.offsetId, args.channel),
      );
      if (await claimIsHeld(tx, args)) return { held: true };
      const attempt = await nextReminderClaimAttempt(tx, args);
      const [written] = await tx
        .insert(reminderClaims)
        .values({ ...row, attempt })
        .returning({ id: reminderClaims.id });
      return { held: false, claimId: written?.id ?? null };
    });
  } catch (e) {
    if (isDuplicateClaimAttempt(e)) return { held: true, duplicate: true };
    console.error(
      `[reminders] reminder claim write FAILED tenantId=${args.tenantId} ` +
        `appointmentId=${args.appointmentId} offsetId=${args.offsetId} channel=${args.channel}: ` +
        `${e instanceof Error ? e.name : "unknown"}`,
    );
    return { held: false, claimId: null };
  }
}

/**
 * Release a claim: one more row of `reminder_claims`, of kind release, naming
 * it. The dispatcher calls this
 * when it throws after taking a claim, and then throws the same error on.
 *
 * IT NEVER THROWS, for the dispatcher's reason: the error on its way out is
 * the one the scheduler must see, and a failed release must not replace it. A
 * release that cannot be written is logged, ids only. The claim then stays
 * live with no `sent` row after it, which blocks nothing: the retry claims
 * again and sends. The table refuses a second release of one claim, and a
 * release that names no claim of this appointment; both end here, logged.
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
    const row = {
      tenantId: args.tenantId,
      appointmentId: args.appointmentId,
      kind: REMINDER_CLAIM_RELEASE_KIND,
      offsetId: args.offsetId,
      channel: args.channel,
      claimId: args.claimId,
    };
    await withReminderTenantContext(args.tenantId, async (tx) => {
      await tx.execute(boundReminderClaimWaits());
      await tx.execute(
        acquireReminderClaimLock(args.tenantId, args.appointmentId, args.offsetId, args.channel),
      );
      await tx.insert(reminderClaims).values(row);
    });
  } catch (e) {
    console.error(
      `[reminders] reminder claim release FAILED tenantId=${args.tenantId} ` +
        `appointmentId=${args.appointmentId} offsetId=${args.offsetId} channel=${args.channel}: ` +
        `${e instanceof Error ? e.name : "unknown"}`,
    );
  }
}

/* ------------------------------------------------------------------ */
/* The closed claim: while the sweep is the sender (SWEEP-47)          */
/* ------------------------------------------------------------------ */

/**
 * The claim could not be read or written while the sweep is the sender. The
 * dispatcher lets it go on to its caller and sends nothing: an unreadable
 * claim store costs a delay, never a second copy. Ids only (rule 7).
 */
export class ReminderClaimStoreError extends Error {
  constructor(
    readonly tenantId: string,
    readonly appointmentId: string,
    readonly offsetId: string,
    readonly channel: string,
    readonly causeName: string,
  ) {
    super(
      `reminder claim store: the claim could not be read or written tenantId=${tenantId} ` +
        `appointmentId=${appointmentId} offsetId=${offsetId} channel=${channel}: ${causeName}`,
    );
    this.name = "ReminderClaimStoreError";
  }
}

/**
 * IS THERE A LIVE CLAIM OF THIS REMINDER FOR THIS START? A claim for this
 * appointment, offset, channel and START that no release names, taken by
 * either sender, at any age. An `early` claim is not one: it was taken over
 * ten minutes before this start's mark, by a job that woke at an older time.
 *
 * THE LEDGER IS NOT ASKED, and that is the difference from `claimIsHeld`. A
 * sender that handed nothing over releases its own claim (dispatch.ts), by the
 * claim's id, so "live" already means "sent, being sent, or of unknown
 * outcome". No row has to be matched to a claim by its time.
 *
 * IT THROWS when the read fails; `takeReminderClaimClosed` is the one caller.
 */
export async function claimIsLive(
  tx: DbTx,
  args: { tenantId: string; appointmentId: string; offsetId: string; channel: Channel; startsAt: Date },
): Promise<boolean> {
  const claim = alias(reminderClaims, "reminder_live_claim");
  const release = alias(reminderClaims, "reminder_live_claim_release");
  const rows = await tx
    .select({ id: claim.id })
    .from(claim)
    .where(
      and(
        eq(claim.tenantId, args.tenantId),
        eq(claim.appointmentId, args.appointmentId),
        eq(claim.kind, REMINDER_CLAIM_KIND),
        eq(claim.offsetId, args.offsetId),
        eq(claim.channel, args.channel),
        eq(claim.startsAt, args.startsAt),
        sql`${claim.early} is distinct from true`,
        notExists(
          tx
            .select({ one: sql`1` })
            .from(release)
            .where(
              and(
                eq(release.tenantId, args.tenantId),
                eq(release.appointmentId, args.appointmentId),
                eq(release.kind, REMINDER_CLAIM_RELEASE_KIND),
                eq(release.claimId, claim.id),
              ),
            ),
        ),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * What the closed claim answers. `held`: a live claim of this reminder for
 * this start exists, and the caller sends nothing; `duplicate` when it is the
 * table that said so, refusing this claim's attempt (`isDuplicateClaimAttempt`).
 * Not held: the row was written, and `claimId` is never null, because a claim
 * that could not be written is a throw here and not an answer.
 */
export type ClosedReminderClaimAnswer = { held: true; duplicate?: true } | { held: false; claimId: string };

/**
 * TAKE THE CLAIM WHILE THE SWEEP IS THE SENDER. The same transaction as
 * `takeReminderClaim`: bound the waits, take the reminder's lock, read, write.
 * Three things differ, and each is the point:
 *
 *   - it reads `claimIsLive`, so a live claim blocks whatever followed it;
 *   - IT THROWS `ReminderClaimStoreError` when anything fails, a wait that ran
 *     out included, and the caller sends nothing. One refusal is an answer
 *     instead: the table's 23505 on the attempt key is held, by a duplicate
 *     (Q-A, 2026-10-15), as on the open claim;
 *   - a claim the day's last pass takes ahead of its mark (`takenAhead`) is
 *     NOT recorded as early. An early claim blocks nobody, and this one must
 *     block the morning's first pass.
 *
 * THIS IS THE DUPLICATE REFUSAL. Two takers of one reminder queue on the lock;
 * the first commits its row before the second reads; the second answers held.
 * Behind it the table refuses a second claim of the same attempt (0106): the
 * number is read under the same lock, after `claimIsLive`, over every claim
 * of this start, early ones included, which `claimIsLive` passes over for
 * "held" but which hold their numbers all the same.
 */
export async function takeReminderClaimClosed(args: {
  tenantId: string;
  appointmentId: string;
  offsetId: string;
  channel: Channel;
  startsAt: Date;
  taker: ReminderClaimTaker;
  /** The day's last pass took this mark before it fell due. Never early. */
  takenAhead?: boolean;
  /** The taker's clock. Passed in by tests and by the pass. */
  now?: Date;
}): Promise<ClosedReminderClaimAnswer> {
  try {
    if (Number.isNaN(args.startsAt.getTime())) throw new RangeError("the start is not an instant");
    const dueAt = reminderMark(args.startsAt, args.offsetId);
    const early = isEarlyClaim(args.startsAt, args.offsetId, args.now ?? new Date());
    const row = {
      tenantId: args.tenantId,
      appointmentId: args.appointmentId,
      kind: REMINDER_CLAIM_KIND,
      offsetId: args.offsetId,
      channel: args.channel,
      startsAt: args.startsAt,
      dueAt,
      taker: args.taker,
      early: early === null ? null : args.takenAhead === true ? false : early,
    };
    return await withReminderTenantContext(args.tenantId, async (tx): Promise<ClosedReminderClaimAnswer> => {
      await tx.execute(boundReminderClaimWaits());
      await tx.execute(
        acquireReminderClaimLock(args.tenantId, args.appointmentId, args.offsetId, args.channel),
      );
      if (await claimIsLive(tx, args)) return { held: true };
      const attempt = await nextReminderClaimAttempt(tx, args);
      const [written] = await tx
        .insert(reminderClaims)
        .values({ ...row, attempt })
        .returning({ id: reminderClaims.id });
      if (!written?.id) throw new Error("the claim row came back without its id");
      return { held: false, claimId: written.id };
    });
  } catch (e) {
    if (isDuplicateClaimAttempt(e)) return { held: true, duplicate: true };
    throw new ReminderClaimStoreError(
      args.tenantId,
      args.appointmentId,
      args.offsetId,
      args.channel,
      e instanceof Error ? e.name : "unknown",
    );
  }
}
