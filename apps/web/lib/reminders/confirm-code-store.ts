import "server-only";
import { sql } from "drizzle-orm";
import { withReminderTenantContext } from "./context";
import {
  generateConfirmCode,
  hashConfirmCode,
  isWellFormedConfirmCode,
} from "./confirm-code";

// ISSUING AND WITHDRAWING A CONFIRM CODE. The database half of confirm-code.ts.
//
// ==========================================================================
// WHO WRITES THIS TABLE: THREE SECURITY DEFINER DOORS, ONE PER VERB
// ==========================================================================
// Migration 0072 REVOKEs `appointment_confirm_codes` from PUBLIC, anon,
// authenticated AND patient (SR-29, "no table grants"), so no application role
// can write it at all. 0072 built the READ door - `resolve_confirm_code` - and
// not the write door, because when it was authored nothing wrote the table.
//
// CONFIRM-02 shipped through the service_role handle as the only non-migration
// path available, and said so at the top of this file rather than reconciling
// it quietly. SR-35 released 0074, and this file now calls the doors 0074
// added: issue, withdraw and consume, each SECURITY DEFINER, each owned by
// postgres, each granted to `authenticated` alone.
//
// THE TENANT IS PROVEN INSIDE THE FUNCTION, not asserted by this file. Every
// door takes the tenant as an argument and matches it in the same statement, so
// a caller that paired the wrong appointment with the wrong tenant writes
// nothing. That is the check RLS would have made if the app role could reach
// the table, and it is why these are narrow functions rather than a GRANT: a
// grant would let any authenticated session write any row.
//
// The service-role seam is gone, and with it the contradiction of
// context.ts's "we never use getDbAdmin".
/**
 * Call one of 0074's SECURITY DEFINER doors and read its boolean back.
 *
 * Runs through `withReminderTenantContext`, the same RLS-enforced seam every
 * other reminder read uses: the function is SECURITY DEFINER, so it does the
 * privileged work, and nothing here bypasses a policy to reach it.
 */
async function callWriter(tenantId: string, statement: ReturnType<typeof sql>): Promise<boolean> {
  const rows = await withReminderTenantContext(tenantId, async (tx) => tx.execute(statement));
  const list = Array.isArray(rows) ? rows : ((rows as { rows?: unknown[] }).rows ?? []);
  const first = list[0] as Record<string, unknown> | undefined;
  return first ? Boolean(Object.values(first)[0]) : false;
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

  const inserted = await callWriter(
    tenantId,
    sql`select public.issue_confirm_code(${codeHash}, ${tenantId}::uuid, ${appointmentId}::uuid)`,
  );

  if (!inserted) return null;
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
  return callWriter(
    args.tenantId,
    sql`select public.withdraw_confirm_code(${args.codeHash}, ${args.tenantId}::uuid)`,
  );
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
  return callWriter(
    args.tenantId,
    sql`select public.consume_confirm_code(${codeHash}, ${args.tenantId}::uuid, ${args.now.toISOString()}::timestamptz)`,
  );
}
