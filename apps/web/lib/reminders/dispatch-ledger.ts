import "server-only";
import { auditLog, reminderDispatches } from "@osteojp/db";
import { and, eq, sql } from "drizzle-orm";

import { assertPiiFreeAuditMetadata } from "@/lib/audit/metadata-contract";
import { withReminderTenantContext } from "./context";

/**
 * THE REMINDER DISPATCH LEDGER — one row per ATTEMPT to hand a message over.
 *
 * ==========================================================================
 * THE TABLE HAS EXISTED SINCE 2026-09-04 AND NOTHING HAS EVER WRITTEN TO IT
 * ==========================================================================
 * Migration 0075 created `reminder_dispatches`, its RLS, three policies, the
 * grants, the indexes, a SECURITY DEFINER tenant resolver and a DB-gated suite,
 * and was applied to production the same day. OBS-04's shipped evidence said
 * "the write path ships with it". IT DID NOT. Until this file, the only
 * reference to the table anywhere outside migrations and checks was the Drizzle
 * declaration, and a production read on 2026-09-10 returned ZERO ROWS ALL TIME.
 *
 * `status-callback.ts`'s header went further and stated, in the present tense,
 * "The dispatch row is still written at send time with `outcome = 'sent'`" —
 * false in the shipped code, and the same shape SR-47 names one file over: a
 * comment asserting a capability every reader of the code refuses.
 *
 * ==========================================================================
 * A LEDGER, NOT A STATE MACHINE
 * ==========================================================================
 * A retry writes a SECOND ROW, because two attempts are two facts. Nothing here
 * updates an existing attempt except the status callback, which fills in what
 * the provider said afterwards about one specific handover.
 *
 * ==========================================================================
 * `recordDispatch` NEVER THROWS INTO THE SEND PATH. `recordProviderStatus` DOES
 * ==========================================================================
 * Recording that we sent something must not be able to stop us sending it, so
 * `recordDispatch` swallows its own failure and logs it, IDS ONLY (rule 7) — no
 * recipient, no body, no provider payload.
 *
 * This is the one place in the reminder path where a bare catch is correct, and
 * it is worth saying why, because PORTAL-REHYDRATE 1.3 forbids exactly this
 * shape on a VERDICT path. This is not a verdict path: the verdict is the
 * DispatchOutcome the caller already has, and it is returned whether or not the
 * row lands. A ledger that could veto the thing it observes would be a worse
 * instrument than no ledger. `dispatch.ts:365` points at this paragraph for
 * exactly that rule, and it still says it.
 *
 * NONE OF THAT COVERS `recordProviderStatus`. It has one caller, the status
 * webhook, and that write is the entire reason the webhook exists: there is no
 * send there for a swallow to protect, only a delivery report to lose. It
 * throws, and the route decides, logs and refuses, so a write that did not
 * happen is reported as a failure instead of as a success. The route's header
 * says what that refusal does and does not buy.
 *
 * ==========================================================================
 * NO RECIPIENT COLUMN, NOT EVEN A HASH
 * ==========================================================================
 * 0075's design ruled it out: the recipient is reachable through
 * `appointment_id`, and a hash we do not need is a pseudonymous identifier we
 * would have to defend.
 */

/** Exactly the three the 0075 CHECK admits. */
export type DispatchLedgerOutcome = "sent" | "suppressed" | "provider_error";

export type DispatchLedgerRow = {
  tenantId: string;
  appointmentId: string;
  channel: "sms" | "email";
  templateId: string;
  outcome: DispatchLedgerOutcome;
  /**
   * The DispatchOutcome reason. 0075 ties it to `outcome` as an EQUIVALENCE, in
   * both directions — a reason without a suppression and a suppression without a
   * reason are each refused by the database — so this is passed only for
   * `suppressed` and the caller does not get to be careless about it.
   */
  suppressionReason?: string | null;
  /** SMS only. Email has no segments and is not billed by length. */
  bodyLength?: number | null;
  segments?: number | null;
  /** Twilio SID or Resend id. Absent when nothing was handed over. */
  providerMessageId?: string | null;
  providerErrorCode?: string | null;
};

/**
 * Append one attempt. Returns nothing: no caller may branch on whether the
 * ledger wrote, because that would make the observation part of the behaviour.
 */
export async function recordDispatch(row: DispatchLedgerRow): Promise<void> {
  try {
    await withReminderTenantContext(row.tenantId, async (tx) => {
      await tx.insert(reminderDispatches).values({
        tenantId: row.tenantId,
        appointmentId: row.appointmentId,
        channel: row.channel,
        templateId: row.templateId,
        outcome: row.outcome,
        // The equivalence, enforced HERE as well as by the CHECK, so a caller
        // that passes a reason with outcome 'sent' gets a row that is right
        // rather than a constraint violation that loses the row entirely.
        suppressionReason: row.outcome === "suppressed" ? (row.suppressionReason ?? null) : null,
        bodyLength: row.bodyLength ?? null,
        segments: row.segments ?? null,
        providerMessageId: row.providerMessageId ?? null,
        providerErrorCode: row.providerErrorCode ?? null,
      });
    });
  } catch (e) {
    // IDS ONLY. The whole point of this table is to make a failure legible, so
    // a failure to write it is itself worth a line - and it must not be silent
    // the way the thing it replaces was.
    console.error(
      `[reminders] dispatch ledger write FAILED tenantId=${row.tenantId} ` +
        `appointmentId=${row.appointmentId} channel=${row.channel} ` +
        `templateId=${row.templateId} outcome=${row.outcome}: ` +
        `${e instanceof Error ? e.name : "unknown"}`,
    );
  }
}

/**
 * The one gate suppression that counts as a hand-over. With live send OFF it is
 * the only trace a hand-over leaves, and a second approval of the same request
 * must read as a repeat there too, or the rule could only ever be checked in
 * production. Every other hold (an unconfigured provider, an unapproved
 * template, a missing location contact) is NOT a hand-over.
 */
export const HANDED_OVER_WHILE_LIVE_SEND_OFF = "live_send_disabled";

/** The audit action that records a booking-approved hand-over, with its start. */
export const BOOKING_APPROVED_HANDOVER_ACTION = "appointment.booking_approved_handed_over";

/**
 * BOOK-CONFIRM: "a booking-approved message was handed over for this
 * appointment AT THIS START", as a row that can be read back.
 *
 * ==========================================================================
 * WHY AN AUDIT ROW, AND NOT THE LEDGER ROW ABOVE IT
 * ==========================================================================
 * The rule is one message per appointment AND start (lead's decision,
 * 2026-10-03): a second acceptance at the same start sends nothing, an
 * acceptance at a different start sends one new message. `reminder_dispatches`
 * cannot say which start a row was for. 0075 gave it no such column, a `sent`
 * row may carry no free text (the reason is NULL by CHECK, and the provider id
 * is the provider's), and adding a column is a migration this change may not
 * make. Nothing else records it either: the start has two writers (reception's
 * reschedule and the patient's own in the portal) and they share no trail, so
 * "has it moved since" cannot be derived.
 *
 * So the dispatch writes the fact itself, where a start fits: `audit_log`,
 * action `appointment.booking_approved_handed_over`, the appointment as the
 * entity, and the start as an ISO instant in the metadata. Ids and an instant
 * only, no actor (a background job), exactly as inbound-reply.ts records a
 * patient's SMS reply from this same context. The ledger row is still written
 * and still answers "what was attempted"; this row answers "for which start".
 *
 * IT NEVER THROWS INTO THE SEND PATH. The message has already gone when this is
 * written. If the write fails the next acceptance at this start sends again:
 * a repeat, never a lost message. Logged, ids only.
 */
export async function recordBookingApprovedHandOver(args: {
  tenantId: string;
  appointmentId: string;
  startsAt: Date;
  channel: "sms" | "email";
}): Promise<void> {
  try {
    const metadata = {
      source: "book-confirm",
      startsAt: args.startsAt.toISOString(),
      channel: args.channel,
    };
    // The audit metadata contract, asked of this writer like every other
    // (lib/audit/metadata-contract.ts): a slug, an instant and an enum, and
    // nothing a person could be read from. INSIDE the try, so a refusal is
    // logged below and never thrown into the send path.
    assertPiiFreeAuditMetadata(metadata, "reminders/recordBookingApprovedHandOver");
    await withReminderTenantContext(args.tenantId, async (tx) => {
      await tx.insert(auditLog).values({
        tenantId: args.tenantId,
        actorUserId: null,
        action: BOOKING_APPROVED_HANDOVER_ACTION,
        entityType: "appointment",
        entityId: args.appointmentId,
        metadata,
        ip: null,
      });
    });
  } catch (e) {
    console.error(
      `[reminders] booking-approved hand-over record FAILED tenantId=${args.tenantId} ` +
        `appointmentId=${args.appointmentId}: ${e instanceof Error ? e.name : "unknown"}`,
    );
  }
}

/**
 * Has a booking-approved message already been handed over for this appointment
 * AT THIS START?
 *
 * THE SECOND LINE, NOT THE FIRST. Inngest's idempotency key on
 * send-appointment-confirmation (appointment + start, 24 hours) stops a
 * duplicate EVENT; this stops a second approval the key no longer covers. It is
 * a read followed by a send, not a lock, so two runs racing inside the same
 * instant are the key's to stop.
 *
 * IT NEVER THROWS INTO THE SEND PATH AND IT FAILS OPEN: a read that errors
 * answers "not handed over". The message this guards is the patient's only
 * confirmation, so an unreadable trail must cost at most a repeat, never the
 * message. Logged, ids only.
 */
export async function hasBookingApprovedHandOver(args: {
  tenantId: string;
  appointmentId: string;
  startsAt: Date;
}): Promise<boolean> {
  try {
    return await withReminderTenantContext(args.tenantId, async (tx) => {
      const rows = await tx
        .select({ id: auditLog.id })
        .from(auditLog)
        .where(
          and(
            eq(auditLog.tenantId, args.tenantId),
            eq(auditLog.entityType, "appointment"),
            eq(auditLog.entityId, args.appointmentId),
            eq(auditLog.action, BOOKING_APPROVED_HANDOVER_ACTION),
            // The start this row was written for. Both sides are the same
            // `toISOString()` of the same column, so equality is exact.
            sql`${auditLog.metadata}->>'startsAt' = ${args.startsAt.toISOString()}`,
          ),
        )
        .limit(1);
      return rows.length > 0;
    });
  } catch (e) {
    console.error(
      `[reminders] booking-approved hand-over read FAILED tenantId=${args.tenantId} ` +
        `appointmentId=${args.appointmentId}: ${e instanceof Error ? e.name : "unknown"}`,
    );
    return false;
  }
}

/**
 * Fill in what the provider said afterwards, matched on ITS OWN id.
 *
 * Tenant-matched as well as id-matched, even though the unique partial index on
 * `provider_message_id` already makes the lookup single-valued: the route
 * resolves the tenant through 0075's SECURITY DEFINER function from a value WE
 * wrote, and re-stating it in the WHERE means a wrong resolution updates
 * nothing instead of updating somebody else's row.
 *
 * IT THROWS, unlike `recordDispatch` above it. See the header: its one caller
 * is a webhook whose whole job is this write, so the failure is the caller's to
 * answer for and not this function's to hide.
 */
export async function recordProviderStatus(args: {
  tenantId: string;
  providerMessageId: string;
  providerStatus: string;
  providerErrorCode?: string | null;
}): Promise<void> {
  await withReminderTenantContext(args.tenantId, async (tx) => {
    await tx
      .update(reminderDispatches)
      .set({
        providerStatus: args.providerStatus,
        // Only ever WIDENS what is known: a callback with no code must not
        // erase a code an earlier callback carried.
        ...(args.providerErrorCode ? { providerErrorCode: args.providerErrorCode } : {}),
        statusAt: sql`now()`,
      })
      .where(
        and(
          eq(reminderDispatches.tenantId, args.tenantId),
          eq(reminderDispatches.providerMessageId, args.providerMessageId),
        ),
      );
  });
}
