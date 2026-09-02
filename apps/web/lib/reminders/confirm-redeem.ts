import "server-only";
import { and, eq } from "drizzle-orm";
import { appointments, auditLog } from "@osteojp/db";
import { withReminderTenantContext } from "./context";
import {
  consumeConfirmCode,
  resolveConfirmCode,
} from "./confirm-code-store";

// REDEEMING A CONFIRM CODE. The write half of the /c/<code> page.
//
// ==========================================================================
// SR-30: FOUR OUTCOMES, AND THREE OF THEM ARE ONE
// ==========================================================================
// Unknown, expired and already-consumed return the SAME value — the same object
// shape, the same words on the page, and the same amount of work. A holder
// cannot learn whether the code they have is real, and neither can somebody
// probing eight characters at a time.
//
// `already_confirmed` IS DISTINGUISHABLE AND THAT IS THE RULING, NOT A LEAK.
// It is reachable only from a LIVE, UNCONSUMED code on an appointment that is
// already `confirmed`. Reaching it means holding a real code, so the page tells
// the holder nothing they did not already have. Counsel's rule is that a
// refusal must not distinguish; this is not a refusal.
//
// ==========================================================================
// THE TIMING HALF, WHICH IS THE HALF THAT IS EASY TO GET WRONG
// ==========================================================================
// Indistinguishable OUTPUT is not indistinguishable BEHAVIOUR. The natural
// implementation returns early on a malformed code without touching the
// database, and that path answers in a millisecond while a real lookup takes
// tens — so the response time tells a prober which of their guesses had the
// right SHAPE, and eight characters becomes a much smaller search.
//
// So every refusal path does THE SAME WORK: the code is resolved (a malformed
// one is resolved against a fixed non-existent hash rather than skipped), and
// the appointment is loaded (a missing one is loaded against a fixed
// non-existent id rather than skipped). Two statements, always, whatever the
// answer. `confirm-redeem.db.test.ts` asserts the medians agree.
//
// PII rule 7: nothing here logs a name, a contact detail or a clinical field.

/** What the holder pressed. */
export type ConfirmAction = "confirm" | "pedido";

/**
 * The outcome, as the page renders it.
 *
 * `generic` carries NOTHING — not a reason, not a code, not a discriminator a
 * caller could accidentally render. A field naming which refusal it was would
 * be one `?? reason` away from the page, which is the §1.3 shape.
 */
export type ConfirmOutcome =
  | { outcome: "confirmed" }
  | { outcome: "already_confirmed" }
  | { outcome: "pedido" }
  | { outcome: "generic" };

/** Frozen, so the three refusals cannot become three objects that merely look alike. */
const GENERIC: ConfirmOutcome = Object.freeze({ outcome: "generic" });

/**
 * An id that cannot exist, used to keep the refusal paths doing the same work
 * as the success path. The equivalent for the code lookup lives in
 * `confirm-code-store.ts`, where the hash is computed.
 */
const NOWHERE_ID = "00000000-0000-0000-0000-000000000000";

/** Statuses a confirm link may still act on. */
const ACTIONABLE = new Set(["scheduled", "confirmed"]);

type LoadedAppointment = {
  id: string;
  tenantId: string;
  status: string;
  startsAt: Date;
} | null;

/**
 * Load the appointment a code resolved to, or burn the same work on nothing.
 *
 * Runs inside the tenant the CODE named, never a tenant from the URL: hard
 * architecture rule 3. The tenant came from the row `resolve_confirm_code`
 * returned, which is a value we wrote.
 */
async function loadAppointment(
  tenantId: string | null,
  appointmentId: string | null,
): Promise<LoadedAppointment> {
  const t = tenantId ?? NOWHERE_ID;
  const a = appointmentId ?? NOWHERE_ID;
  const rows = await withReminderTenantContext(t, async (tx) =>
    tx
      .select({
        id: appointments.id,
        tenantId: appointments.tenantId,
        status: appointments.status,
        startsAt: appointments.startsAt,
      })
      .from(appointments)
      .where(eq(appointments.id, a))
      .limit(1),
  );
  return rows[0] ?? null;
}

/**
 * Redeem a code.
 *
 * `now` is injected rather than read here so the expiry boundary is testable at
 * the second, and `ip` is captured by the CALLER from the request headers —
 * SR-06: a server-side capture, never a value the client could name.
 */
export async function redeemConfirmCode(args: {
  code: string;
  action: ConfirmAction;
  now: Date;
  ip: string | null;
  env?: NodeJS.ProcessEnv;
}): Promise<ConfirmOutcome> {
  const { code, action, now, ip } = args;

  // STATEMENT ONE, ALWAYS — including for a malformed code, which is looked up
  // against a hash that cannot exist rather than short-circuited. See
  // `resolveConfirmCode`.
  const resolved = await resolveConfirmCode({ code, env: args.env }).catch(() => null);
  const spentOrMissing = !resolved || resolved.consumedAt !== null;

  // STATEMENT TWO, ALWAYS.
  const appointment = await loadAppointment(
    resolved?.tenantId ?? null,
    resolved?.appointmentId ?? null,
  );

  if (spentOrMissing) return GENERIC;
  if (!appointment) return GENERIC;
  if (!ACTIONABLE.has(appointment.status)) return GENERIC;

  // EXPIRY IS READ FROM THE APPOINTMENT, NOT FROM THE ROW. 0072 deliberately
  // has no `expires_at` (SR-28): a stored copy of the start time would be a
  // second truth that drifts the moment reception moves the appointment. A code
  // for a visit that has already begun is spent by the clock, not by a column.
  if (appointment.startsAt.getTime() <= now.getTime()) return GENERIC;

  if (action === "confirm") {
    // IDEMPOTENT, AND IT DOES NOT CONSUME. Pressing twice is a no-op, so the
    // code stays live and the second press answers `already_confirmed` rather
    // than the generic refusal — which is only reachable while holding a real,
    // unspent code.
    if (appointment.status === "confirmed") return { outcome: "already_confirmed" };

    await withReminderTenantContext(appointment.tenantId, async (tx) => {
      await tx
        .update(appointments)
        .set({ status: "confirmed" })
        .where(and(eq(appointments.id, appointment.id), eq(appointments.status, "scheduled")));
      await writeAudit(tx, {
        tenantId: appointment.tenantId,
        appointmentId: appointment.id,
        action: "appointment.confirm.sms_code",
        ip,
      });
    });
    return { outcome: "confirmed" };
  }

  // PEDIR REMARCAÇÃO. Not idempotent — every press would be another request in
  // reception's queue — so this is the action that consumes, and the consume is
  // the LOCK: the UPDATE's own `consumed_at IS NULL` predicate decides, so two
  // presses racing cannot both win. A second press finds nothing to consume and
  // takes the generic path, which is also what a forged code gets.
  const consumed = await consumeConfirmCode({
    tenantId: resolved.tenantId,
    code,
    now,
    env: args.env,
  });
  if (!consumed) return GENERIC;

  await withReminderTenantContext(appointment.tenantId, async (tx) => {
    await writeAudit(tx, {
      tenantId: appointment.tenantId,
      appointmentId: appointment.id,
      action: "appointment.reschedule_request.sms_code",
      ip,
    });
  });
  return { outcome: "pedido" };
}

/**
 * The audit row, written in the SAME transaction as the state change it
 * records. A separate transaction could commit one without the other, and the
 * half that survives would be the one nobody notices.
 *
 * ==========================================================================
 * IT GOES TO `audit_log` AND NOT TO `patient_audit_log`, AND THAT IS A
 * DEVIATION WORTH READING RATHER THAN A PREFERENCE.
 * ==========================================================================
 * `patient_audit_log` is counsel's table for patient actions and is where this
 * row belongs. Its `auth_means` column carries a CHECK — migration 0054, line
 * 143 — restricted to `('signed_token', 'otp_session')`. A confirm code is
 * NEITHER: it is a stored credential resolved by an HMAC, not a stateless
 * signed token and not a session.
 *
 * Writing `signed_token` anyway would put an inaccurate claim about HOW the
 * holder proved entitlement into the one table that exists to answer that
 * question, in a legal-facing record. Adding a third value is a MIGRATION, and
 * this job is explicitly forbidden one.
 *
 * So the row goes to the general `audit_log`, which takes a free-text action
 * and needs nothing added: the event IS recorded, tenant-scoped, with the
 * server-captured IP, and no false statement is made about the means. 0074
 * should add `confirm_code` to the CHECK and move this write; until then the
 * trail exists in the other table rather than not at all.
 */
async function writeAudit(
  tx: Parameters<Parameters<typeof withReminderTenantContext>[1]>[0],
  row: { tenantId: string; appointmentId: string; action: string; ip: string | null },
): Promise<void> {
  await tx.insert(auditLog).values({
    tenantId: row.tenantId,
    // No actor: the holder of a confirm code has no session and is not a user.
    actorUserId: null,
    action: row.action,
    entityType: "appointment",
    entityId: row.appointmentId,
    // The appointment, never the code: an audit row holding the code would put
    // a live credential in a table staff can read.
    metadata: { via: "confirm_code" },
    ip: row.ip,
  });
}
