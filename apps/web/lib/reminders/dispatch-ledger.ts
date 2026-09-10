import "server-only";
import { reminderDispatches } from "@osteojp/db";
import { and, eq, sql } from "drizzle-orm";

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
 * IT NEVER THROWS INTO THE SEND PATH
 * ==========================================================================
 * Recording that we sent something must not be able to stop us sending it. Both
 * writers swallow their own failure and log it, and the log carries IDS ONLY
 * (rule 7) — no recipient, no body, no provider payload.
 *
 * This is the one place in the reminder path where a bare catch is correct, and
 * it is worth saying why, because PORTAL-REHYDRATE 1.3 forbids exactly this
 * shape on a VERDICT path. This is not a verdict path: the verdict is the
 * DispatchOutcome the caller already has, and it is returned whether or not the
 * row lands. A ledger that could veto the thing it observes would be a worse
 * instrument than no ledger.
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
 * Fill in what the provider said afterwards, matched on ITS OWN id.
 *
 * Tenant-matched as well as id-matched, even though the unique partial index on
 * `provider_message_id` already makes the lookup single-valued: the route
 * resolves the tenant through 0075's SECURITY DEFINER function from a value WE
 * wrote, and re-stating it in the WHERE means a wrong resolution updates
 * nothing instead of updating somebody else's row.
 */
export async function recordProviderStatus(args: {
  tenantId: string;
  providerMessageId: string;
  providerStatus: string;
  providerErrorCode?: string | null;
}): Promise<void> {
  try {
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
  } catch (e) {
    console.error(
      `[reminders] dispatch status update FAILED tenantId=${args.tenantId} ` +
        `status=${args.providerStatus}: ${e instanceof Error ? e.name : "unknown"}`,
    );
  }
}
