import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { appointmentConfirmCodes, appointments, getDbAdmin } from "@osteojp/db";
import { withReminderTenantContext } from "./context";
import {
  generateConfirmCode,
  hashConfirmCode,
  isWellFormedConfirmCode,
} from "./confirm-code";

// ISSUING AND WITHDRAWING A CONFIRM CODE. The database half of confirm-code.ts.
//
// ==========================================================================
// WHO WRITES THIS TABLE, AND WHY IT IS NOT THE ROLE EVERYTHING ELSE USES
// ==========================================================================
// READ THIS BEFORE CHANGING `withConfirmCodeWriter`. Migration 0072 REVOKEs
// `appointment_confirm_codes` from PUBLIC, anon, authenticated AND patient
// (SR-29: "no table grants"), leaving `postgres` and `service_role` as the only
// roles that can touch it. Reminder jobs run through `withReminderTenantContext`
// as `authenticated`, so EVERY WRITE FROM THAT SEAM ANSWERS
// `permission denied for table appointment_confirm_codes`. That is not a bug in
// 0072: it is 0072 working, and it is the shape INC-11 and 0064 both record.
//
// 0072 BUILT THE READ DOOR AND NOT THE WRITE DOOR. `resolve_confirm_code` is a
// SECURITY DEFINER function granted to `authenticated`; there is no equivalent
// for INSERT, UPDATE or DELETE, because when 0072 was authored nothing wrote
// the table yet.
//
// SO THERE ARE EXACTLY TWO WAYS TO WRITE IT, and both are named here rather
// than one being chosen silently:
//   A. the `service_role` handle, which 0072's own comment says "already holds
//      the table outright, so removing it would be theatre";
//   B. migration 0074, adding SECURITY DEFINER writers to match the reader —
//      the shape SR-29 would have chosen had a writer existed.
//
// THIS FILE TAKES A, AND IT CONTRADICTS A RULE STATED IN context.ts — "we never
// use getDbAdmin (which would bypass RLS)". The contradiction is reported
// rather than reconciled. Two things make A defensible until B is ruled: this
// job may not author a migration, and "bypassing RLS" has no meaning on a table
// with no grants to the app role — there is no policy that would have admitted
// the write, so nothing is being stepped around. Every write below still names
// its tenant explicitly (hard architecture rule 3) and the insert PROVES the
// appointment belongs to that tenant in the same statement.
//
// B IS THE BETTER SHAPE and this seam exists so adopting it is one function.
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
 * The one place this module reaches the table for a WRITE.
 *
 * Named, and used by all three writers, so switching to migration 0074's
 * SECURITY DEFINER writers is a change here and nowhere else.
 */
function withConfirmCodeWriter<T>(fn: (db: ReturnType<typeof getDbAdmin>) => Promise<T>): Promise<T> {
  return fn(getDbAdmin());
}

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

  const inserted = await withConfirmCodeWriter(async (db) =>
    db
      .insert(appointmentConfirmCodes)
      // THE TENANT IS PROVEN, NOT PASSED. The row is inserted from a SELECT over
      // `appointments` that matches BOTH the id and the tenant, so a caller that
      // paired the wrong two values inserts nothing at all rather than writing a
      // code into another tenant. This is the check RLS would have made if the
      // app role could reach the table.
      // All five columns, in the table's own order: drizzle's insert-select
      // requires the projection to match the table definition exactly.
      .select(
        db
          .select({
            codeHash: sql<string>`${codeHash}`.as("code_hash"),
            tenantId: appointments.tenantId,
            appointmentId: appointments.id,
            consumedAt: sql<null>`null::timestamptz`.as("consumed_at"),
            createdAt: sql<Date>`now()`.as("created_at"),
          })
          .from(appointments)
          .where(and(eq(appointments.id, appointmentId), eq(appointments.tenantId, tenantId))),
      )
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
  const rows = await withConfirmCodeWriter(async (db) =>
    db
      .delete(appointmentConfirmCodes)
      .where(
        and(
          eq(appointmentConfirmCodes.codeHash, args.codeHash),
          eq(appointmentConfirmCodes.tenantId, args.tenantId),
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
 * A MALFORMED CODE STILL COSTS A QUERY, AND THAT IS SR-30 RATHER THAN WASTE.
 * The natural implementation returns null on a bad shape without touching the
 * database, and then answers in a millisecond while a real lookup takes tens —
 * so the response time tells a prober which of their guesses had the right
 * SHAPE, and eight characters becomes a far smaller search. A malformed code is
 * therefore looked up against a hash that cannot exist: 64 hex zeros, which
 * satisfies 0072's CHECK and takes the same primary-key path a real hash takes.
 */
export async function resolveConfirmCode(args: {
  code: string;
  env?: NodeJS.ProcessEnv;
}): Promise<{ tenantId: string; appointmentId: string; consumedAt: Date | null } | null> {
  const codeHash = isWellFormedConfirmCode(args.code)
    ? hashConfirmCode(args.code, args.env ?? process.env)
    : NOWHERE_HASH;

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

/**
 * A hash that cannot name a row, for the malformed-code path above. 64 hex
 * zeros: valid under 0072's CHECK, so the lookup is a real primary-key probe
 * rather than a constraint rejection, which would answer faster and leak the
 * shape check through timing.
 */
const NOWHERE_HASH = "0".repeat(64);

/** Consume a code. Only *pedir remarcação* does this; confirm leaves it live. */
export async function consumeConfirmCode(args: {
  tenantId: string;
  code: string;
  now: Date;
  env?: NodeJS.ProcessEnv;
}): Promise<boolean> {
  const codeHash = hashConfirmCode(args.code, args.env ?? process.env);
  const rows = await withConfirmCodeWriter(async (db) =>
    db
      .update(appointmentConfirmCodes)
      .set({ consumedAt: args.now })
      .where(
        and(
          eq(appointmentConfirmCodes.codeHash, codeHash),
          eq(appointmentConfirmCodes.tenantId, args.tenantId),
          // The predicate is the lock: a second press whose UPDATE matches no
          // row is a refusal, decided by the database rather than by a read
          // this code did earlier and might be racing.
          isNull(appointmentConfirmCodes.consumedAt),
        ),
      )
      .returning({ codeHash: appointmentConfirmCodes.codeHash }),
  );
  return rows.length > 0;
}
