import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { appointmentConfirmCodes } from "@osteojp/db";
import { withReminderTenantContext } from "./context";
import {
  generateConfirmCode,
  hashConfirmCode,
  isWellFormedConfirmCode,
} from "./confirm-code";

// ISSUING AND WITHDRAWING A CONFIRM CODE. The database half of confirm-code.ts.
//
// ==========================================================================
// ONE LIVE CODE PER APPOINTMENT, AND WHAT THAT COSTS ON A RETRY
// ==========================================================================
// 0072's partial unique index — `(appointment_id) WHERE consumed_at IS NULL` —
// means a retried reminder CANNOT mint a second live code. That is the property
// the design wants, and it has a consequence the caller must handle rather than
// discover: we store an HMAC, so when a live code already exists WE CANNOT
// RECOVER ITS PLAINTEXT. There is no way to put the existing code back in an
// SMS.
//
// So `issueConfirmCode` returns null on a collision, and the reminder is sent
// WITHOUT the link line. A reminder that goes out is worth more than a link
// that cannot be minted, and the alternative — deleting a live code somebody may
// already be holding — would break a link already in a patient's hand.
//
// ==========================================================================
// AND WHY THERE IS A WITHDRAW
// ==========================================================================
// The code must exist BEFORE the body that contains it can be rendered, so a
// send that then fails would strand a live code nobody holds — and the partial
// index would let that stranded row block the retry from minting a fresh one.
// `withdrawConfirmCode` deletes the row THIS process just created, by its exact
// hash, so a retry starts clean. It can only ever delete a code it minted; it
// takes the hash rather than the appointment id for exactly that reason.

/**
 * Mint a code for one appointment.
 *
 * Returns the PLAINTEXT code and its hash, or null when a live code already
 * exists for this appointment. The plaintext exists only in the returned value
 * and in the SMS; it is never stored and never logged.
 */
export async function issueConfirmCode(args: {
  tenantId: string;
  appointmentId: string;
  env?: NodeJS.ProcessEnv;
}): Promise<{ code: string; codeHash: string } | null> {
  const { tenantId, appointmentId } = args;
  const code = generateConfirmCode();
  // Throws when the HMAC key is absent — see confirm-code.ts. Callers gate on
  // `confirmLinkEnabled`, which requires the key, so reaching this without one
  // is a programming error and must be loud.
  const codeHash = hashConfirmCode(code, args.env ?? process.env);

  const inserted = await withReminderTenantContext(tenantId, async (tx) =>
    tx
      .insert(appointmentConfirmCodes)
      .values({ codeHash, tenantId, appointmentId })
      // The partial unique index is the arbiter. DO NOTHING rather than a
      // pre-flight SELECT: two reminder runs racing on the same appointment
      // would both pass a check-then-insert, and one would get a unique
      // violation anyway. Let the index decide once.
      .onConflictDoNothing()
      .returning({ codeHash: appointmentConfirmCodes.codeHash }),
  );

  if (inserted.length === 0) return null;
  return { code, codeHash };
}

/**
 * Remove a code this process minted, after a send that did not happen.
 *
 * Deletes by HASH and only while still unconsumed, so it cannot remove a code
 * a patient has already acted on. Returns whether a row went.
 */
export async function withdrawConfirmCode(args: {
  tenantId: string;
  codeHash: string;
}): Promise<boolean> {
  const rows = await withReminderTenantContext(args.tenantId, async (tx) =>
    tx
      .delete(appointmentConfirmCodes)
      .where(
        and(
          eq(appointmentConfirmCodes.codeHash, args.codeHash),
          isNull(appointmentConfirmCodes.consumedAt),
        ),
      )
      .returning({ codeHash: appointmentConfirmCodes.codeHash }),
  );
  return rows.length > 0;
}

/**
 * What a code resolves to, or null.
 *
 * THE SINGLE DOOR IS THE FUNCTION, NOT THIS TABLE. 0072 REVOKEs the table from
 * every role and grants EXECUTE on `public.resolve_confirm_code(text)` to
 * `authenticated` alone. The resolution cannot be tenant-scoped — the public
 * route has no tenant until this answers — which is why the function is
 * SECURITY DEFINER and why it returns exactly three columns rather than the
 * table rowtype: a later column cannot widen what the public path can read.
 *
 * WELL-FORMEDNESS IS CHECKED FIRST AND THE CALLER STILL PAYS THE LOOKUP. A
 * malformed code returns null here without a query, so the SR-30 caller must
 * equalise the work itself rather than assume this function does — which it
 * does, deliberately, in `confirm-redeem.ts`.
 */
export async function resolveConfirmCode(args: {
  code: string;
  env?: NodeJS.ProcessEnv;
}): Promise<{ tenantId: string; appointmentId: string; consumedAt: Date | null } | null> {
  if (!isWellFormedConfirmCode(args.code)) return null;
  const codeHash = hashConfirmCode(args.code, args.env ?? process.env);

  // No tenant context exists yet: this is the lookup that PRODUCES one. The
  // function is SECURITY DEFINER and is the only thing this path may call.
  const rows = await withReminderTenantContext(NIL_TENANT, async (tx) =>
    tx.execute<{
      tenant_id: string;
      appointment_id: string;
      consumed_at: string | null;
    }>(sql`select tenant_id, appointment_id, consumed_at from public.resolve_confirm_code(${codeHash})`),
  );
  const row = Array.isArray(rows) ? rows[0] : (rows as { rows?: unknown[] }).rows?.[0];
  if (!row) return null;
  const r = row as { tenant_id: string; appointment_id: string; consumed_at: string | null };
  return {
    tenantId: r.tenant_id,
    appointmentId: r.appointment_id,
    consumedAt: r.consumed_at ? new Date(r.consumed_at) : null,
  };
}

/**
 * The all-zero uuid, used as the tenant claim for the ONE statement that runs
 * before a tenant is known.
 *
 * IT IS NOT A TENANT AND MUST NEVER SELECT ROWS. `resolve_confirm_code` is
 * SECURITY DEFINER and does not consult the claim; every statement AFTER this
 * one runs under the tenant the function returned. If a future edit puts a
 * table read on this connection, it will correctly see nothing.
 */
const NIL_TENANT = "00000000-0000-0000-0000-000000000000";

/** Consume a code. Only *pedir remarcação* does this; confirm leaves it live. */
export async function consumeConfirmCode(args: {
  tenantId: string;
  code: string;
  now: Date;
  env?: NodeJS.ProcessEnv;
  tx?: Parameters<Parameters<typeof withReminderTenantContext>[1]>[0];
}): Promise<boolean> {
  const codeHash = hashConfirmCode(args.code, args.env ?? process.env);
  const run = async (tx: NonNullable<typeof args.tx>) =>
    tx
      .update(appointmentConfirmCodes)
      .set({ consumedAt: args.now })
      .where(
        and(
          eq(appointmentConfirmCodes.codeHash, codeHash),
          // The predicate is the lock: a second press whose UPDATE matches no
          // row is a refusal, decided by the database rather than by a read
          // this code did earlier and might be racing.
          isNull(appointmentConfirmCodes.consumedAt),
        ),
      )
      .returning({ codeHash: appointmentConfirmCodes.codeHash });

  const rows = args.tx
    ? await run(args.tx)
    : await withReminderTenantContext(args.tenantId, (tx) => run(tx));
  return rows.length > 0;
}
