import "server-only";
import { auditLog } from "@osteojp/db";
import type { Channel } from "@osteojp/notify";
import { sql, type SQL } from "drizzle-orm";

import { assertPiiFreeAuditMetadata } from "@/lib/audit/metadata-contract";
import { withReminderTenantContext } from "./context";
import { REMINDER_OFFSETS } from "./offsets";

/**
 * THE REMINDER CLAIM: "a sender took this reminder, for this start, at this
 * moment", as a row that can be read back.
 *
 * ==========================================================================
 * RECORD ONLY. IT DECIDES NOTHING.
 * ==========================================================================
 * `takeReminderClaim` returns nothing, on purpose: the dispatcher has no value
 * to branch on, so a claim cannot stop or change a send. It adds the time of
 * its own write and nothing else. Whether a reminder goes out is exactly what
 * it was before this file existed. The claim is the trail a later change will
 * read; this change only starts writing it.
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
 * Everything below sits inside one try. A claim that cannot be written is
 * logged, ids only (rule 7), and the reminder goes out as it does today.
 *
 * ON A WAIT TOO, NOT ONLY ON AN ERROR. The dispatcher awaits the claim before
 * it sends, so a claim that queued behind a stuck holder of this reminder's
 * lock, or behind a lock on `audit_log`, would hold the reminder for as long as
 * the holder sat there. The claim's transaction therefore bounds its own waits
 * first (`boundReminderClaimWaits`): Postgres ends the wait, the catch below
 * logs it, and the reminder goes out without its claim.
 */

/** The audit action of a claim. One row per dispatcher call that found its appointment. */
export const REMINDER_CLAIM_ACTION = "appointment.reminder_claimed";

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
 * Today it only orders two writers; nothing is decided under it yet.
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

/**
 * Write one claim. Returns nothing: see the header.
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
}): Promise<void> {
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
    await withReminderTenantContext(args.tenantId, async (tx) => {
      await tx.execute(boundReminderClaimWaits());
      await tx.execute(
        acquireReminderClaimLock(args.tenantId, args.appointmentId, args.offsetId, args.channel),
      );
      await tx.insert(auditLog).values({
        tenantId: args.tenantId,
        actorUserId: null,
        action: REMINDER_CLAIM_ACTION,
        entityType: "appointment",
        entityId: args.appointmentId,
        metadata,
        ip: null,
      });
    });
  } catch (e) {
    console.error(
      `[reminders] reminder claim write FAILED tenantId=${args.tenantId} ` +
        `appointmentId=${args.appointmentId} offsetId=${args.offsetId} channel=${args.channel}: ` +
        `${e instanceof Error ? e.name : "unknown"}`,
    );
  }
}
