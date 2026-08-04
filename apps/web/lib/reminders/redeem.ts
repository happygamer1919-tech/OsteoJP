import "server-only";
import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import {
  appointments,
  patientAuditLog,
  actionTokenConsumptions,
  type DbTx,
} from "@osteojp/db";
import { withReminderTenantContext } from "./context";
import { verifyRescheduleToken, type TokenScope } from "./link-token";

// Redemption of a one-action reminder token, to the counsel specification in
// docs/rgpd-token-flow.md (sections 3, 5, 6, 8).
//
// WHY THIS LIVES HERE AND NOT BEHIND AppointmentsStore. The patient appointments
// store in apps/api is shaped around a PatientPrincipal and runs as the `patient`
// role via withPatientContext. A token redemption has NO session and no
// principal: all it holds is a tenant id and an appointment id that WE signed.
// So it uses the same seam reminder dispatch already uses,
// withReminderTenantContext, which is withTenantContext underneath and therefore
// a real transaction (packages/db/src/client.ts:115-127). RLS is enforced, not
// bypassed: no getDbAdmin anywhere on this path.
//
// TWO CLASSES OF REFUSAL, and the difference is deliberate.
//
//   TOKEN-VALIDITY refusals - malformed, forged, expired, unknown appointment,
//   already consumed - all return the SAME opaque value. Counsel section 3 and
//   section 6: a consumed token is refused "the same generic rejection as an
//   invalid one". The caller cannot tell them apart and neither can an attacker.
//
//   A CUTOFF refusal is different, and it is not a leak. It happens on a token
//   that has already proved valid, so telling the holder "it is too late, please
//   telephone" discloses nothing they did not already hold - and section 5
//   requires exactly that copy. Collapsing it into the generic rejection would
//   strand a legitimate patient with no idea what to do.
//
// PII rule: nothing here logs a patient name, contact detail or clinical field.

/** What the holder is trying to do. */
export type RedeemAction = "confirm" | "cancel";

/**
 * Every refusal reason, for the AUDIT TRAIL only. It is never returned to the
 * caller and never rendered: the caller sees `refused` and nothing else.
 */
export type RefusalReason =
  | "invalid_token"
  | "unknown_appointment"
  | "already_consumed"
  | "not_actionable"
  | "outside_scope"
  | "inside_cutoff";

export type RedeemResult =
  /** The action was performed and the token is now spent. */
  | { outcome: "success"; action: RedeemAction }
  /** Valid token, but the clinic's 24h cutoff refuses the action. */
  | { outcome: "cutoff" }
  /** Everything else. Deliberately carries NO detail. */
  | { outcome: "refused" };

/** Statuses a patient may still act on. Mirrors MUTABLE_STATUSES in apps/api. */
const ACTIONABLE = new Set(["scheduled", "confirmed"]);

const MS_PER_HOUR = 60 * 60 * 1000;

/**
 * The clinic's cancel cutoff, 24h (owner ruling 2026-08-03). Duplicated as a
 * value rather than imported from apps/api/lib/appointments/cutoff.ts because
 * these are separate deployables and apps/web does not import from apps/api;
 * the number is asserted against that module's constant in the test, so a drift
 * between them fails CI rather than going unnoticed.
 */
export const CANCEL_CUTOFF_HOURS = 24;

/** sha256 hex of the token. The token itself is NEVER stored (counsel s6). */
export function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Which actions a scope permits, before the clock is consulted. */
export function actionsForScope(scope: TokenScope): readonly RedeemAction[] {
  return scope === "confirm_cancel" ? ["confirm", "cancel"] : ["confirm"];
}

type AuditRow = {
  tenantId: string;
  patientId: string | null;
  appointmentId: string | null;
  action: string;
  outcome: "success" | "refused";
  reason: string | null;
  ip: string | null;
};

/**
 * Redeem a token for one action.
 *
 * `now` is injected rather than read here so the cutoff is testable without
 * faking the system clock, matching apps/api/lib/appointments/cutoff.ts.
 */
export async function redeemActionToken(args: {
  token: string;
  action: RedeemAction;
  now: Date;
  ip: string | null;
}): Promise<RedeemResult> {
  const { token, action, now, ip } = args;

  // 1. Signature, expiry and scope. No DB contact yet: an unverifiable token
  //    must not cost a query, and it cannot be attributed to a tenant at all.
  const claims = verifyRescheduleToken(token, now);
  if (!claims) {
    // NOT audited, and this is a deliberate limitation rather than an oversight.
    // patient_audit_log.tenant_id is NOT NULL, and a token that fails signature
    // verification names no tenant we are willing to believe - writing the row
    // would mean GUESSING which tenant's trail to append a stranger's attempt
    // to. It is logged operationally instead, with no token material.
    console.warn("[reminders] token redemption refused: unverifiable token");
    return { outcome: "refused" };
  }

  if (!actionsForScope(claims.scope).includes(action)) {
    // The 24h SMS asking to cancel lands here. The scope is inside the
    // signature, so this cannot be reached by editing the URL - only by a client
    // that ignores the buttons it was given.
    await writeAudit({
      tenantId: claims.tenantId,
      patientId: null,
      appointmentId: claims.appointmentId,
      action,
      outcome: "refused",
      reason: "outside_scope",
      ip,
    });
    return { outcome: "refused" };
  }

  return withReminderTenantContext(claims.tenantId, async (tx) => {
    // 2. Lock the row for the whole transaction. Two clicks arriving together
    //    serialise here rather than racing the status read against each other.
    const rows = await tx
      .select({
        id: appointments.id,
        patientId: appointments.patientId,
        status: appointments.status,
        startsAt: appointments.startsAt,
      })
      .from(appointments)
      .where(
        and(
          eq(appointments.id, claims.appointmentId),
          eq(appointments.tenantId, claims.tenantId),
        ),
      )
      .for("update");

    const appt = rows[0];
    if (!appt) {
      await auditOn(tx, {
        tenantId: claims.tenantId,
        patientId: null,
        appointmentId: claims.appointmentId,
        action,
        outcome: "refused",
        reason: "unknown_appointment",
        ip,
      });
      return { outcome: "refused" } as const;
    }

    if (!ACTIONABLE.has(appt.status)) {
      await auditOn(tx, {
        tenantId: claims.tenantId,
        patientId: appt.patientId,
        appointmentId: appt.id,
        action,
        outcome: "refused",
        reason: "not_actionable",
        ip,
      });
      return { outcome: "refused" } as const;
    }

    // 3. THE CUTOFF, RE-EVALUATED AT REDEMPTION rather than at issuance
    //    (counsel section 5). A cancel link minted at 48h was legitimately
    //    outside the cutoff when it was created; the patient may click it 30
    //    hours later, inside it. Enforcing only at issuance would leave a window
    //    in which a link that was valid when sent performs an action the clinic
    //    has ruled out.
    //
    //    Confirm is NOT cutoff-bound: confirming an imminent appointment is
    //    exactly what the 24h SMS exists to ask for.
    if (action === "cancel" && isInsideCutoff(appt.startsAt, now)) {
      await auditOn(tx, {
        tenantId: claims.tenantId,
        patientId: appt.patientId,
        appointmentId: appt.id,
        action,
        outcome: "refused",
        reason: "inside_cutoff",
        ip,
      });
      // NOT consumed. Counsel section 6 requires that a token is never "burned
      // with no action taken", and nothing was done here.
      return { outcome: "cutoff" } as const;
    }

    // 4. THE ACTION AND THE CONSUMPTION RECORD, ONE TRANSACTION.
    //    The insert below is what makes the token single-use, and it is the
    //    PRIMARY KEY that enforces it, not a preceding read: two redemptions
    //    arriving together would both read "not consumed" and both proceed. The
    //    second loses on the key, and because it is the same transaction as the
    //    write above, the appointment change rolls back with it.
    if (action === "confirm") {
      // Writes the CONFIRMATION axis (migration 0024), never appointment_status.
      // The two are orthogonal by design - "did the patient confirm the
      // reminder" is a different question from "where is this in its lifecycle"
      // - and this is the first writer of that axis in the codebase; the staff
      // agenda has been rendering it since 0024 with nothing ever setting it.
      await tx
        .update(appointments)
        .set({ confirmationState: "confirmed", confirmationReceivedAt: now })
        .where(eq(appointments.id, appt.id));
    } else {
      await tx
        .update(appointments)
        .set({ status: "cancelled" })
        .where(eq(appointments.id, appt.id));
    }

    await tx.insert(actionTokenConsumptions).values({
      tokenHash: tokenHash(token),
      tenantId: claims.tenantId,
      appointmentId: appt.id,
      action,
    });

    await auditOn(tx, {
      tenantId: claims.tenantId,
      patientId: appt.patientId,
      appointmentId: appt.id,
      action,
      outcome: "success",
      reason: null,
      ip,
    });

    return { outcome: "success", action } as const;
  }).catch(async (err: unknown) => {
    // A duplicate primary key on action_token_consumptions means this token was
    // already spent. The whole transaction - appointment write included - has
    // already rolled back, which is the guarantee, so there is nothing to undo.
    // It is reported as the SAME opaque refusal as a forged token (section 6).
    if (isUniqueViolation(err)) {
      await writeAudit({
        tenantId: claims.tenantId,
        patientId: null,
        appointmentId: claims.appointmentId,
        action,
        outcome: "refused",
        reason: "already_consumed",
        ip,
      });
      return { outcome: "refused" } as const;
    }
    throw err;
  });
}

/** Postgres 23505 unique_violation, however the driver surfaces it. */
export function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const code = (err as { code?: unknown }).code;
  if (code === "23505") return true;
  const cause = (err as { cause?: unknown }).cause;
  return (
    typeof cause === "object" &&
    cause !== null &&
    (cause as { code?: unknown }).code === "23505"
  );
}

function isInsideCutoff(startsAt: Date, now: Date): boolean {
  return startsAt.getTime() - now.getTime() < CANCEL_CUTOFF_HOURS * MS_PER_HOUR;
}

/**
 * Append one audit row on an existing transaction.
 *
 * occurredAt comes from the DATABASE clock, not from the injected `now`. The
 * injected clock exists so the cutoff is testable; an audit trail that a caller
 * could date is not an audit trail.
 */
async function auditOn(tx: DbTx, row: AuditRow): Promise<void> {
  await tx.insert(patientAuditLog).values({
    ...row,
    authMeans: "signed_token",
    occurredAt: sql`now()`,
  });
}

/**
 * Append one audit row in its OWN transaction, for refusals that happen outside
 * (or after the rollback of) the action transaction. A refusal must be recorded
 * even though the thing it refuses did not happen - counsel section 8: "a
 * rejected cancellation attempt inside the cutoff is exactly the kind of event a
 * later dispute turns on".
 */
async function writeAudit(row: AuditRow): Promise<void> {
  await withReminderTenantContext(row.tenantId, async (tx) => {
    await auditOn(tx, row);
  });
}
