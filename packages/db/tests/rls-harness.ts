/**
 * rls-harness.ts — shared RLS test harness.
 *
 * Extracted verbatim in behaviour from the inline harness PR #89 introduced in
 * ai-ingestion-rls-isolation.test.ts, so the cross-tenant audit suite reuses the
 * exact same seam rather than re-deriving it. #89's own file is left untouched.
 *
 * The model (unchanged from #89):
 *   - One privileged (owner) connection. The owner BYPASSES RLS by ownership, so
 *     it is used ONLY for seeding/cleanup, NEVER for an isolation assertion.
 *   - `asRole` runs the assertion inside a transaction that first does
 *     `SET LOCAL ROLE authenticated` (or service_role) and sets
 *     request.jwt.claims — the same GUC the app's withTenantContext sets and that
 *     public.jwt_tenant_id() / jwt_role() read. The transaction ALWAYS rolls back,
 *     so nothing an assertion writes ever persists.
 *
 * RLS on these tables is ENABLE, not FORCE: it applies to the `authenticated`
 * role but not to the owner or a BYPASSRLS role (service_role). Running an
 * assertion on the owner connection would pass for the WRONG reason. Every
 * isolation assertion therefore goes through `asRole("authenticated", …)`.
 */
import postgres, { type Sql, type TransactionSql } from "postgres";

export const url = process.env.DATABASE_URL;
export const live = Boolean(url);

export type AppRole = "owner" | "admin" | "therapist" | "reception";

/** The request.jwt.claims blob jwt_tenant_id()/jwt_role() read. */
export const claimsFor = (tenantId: string, userRole: AppRole = "admin"): string =>
  JSON.stringify({ tenant_id: tenantId, user_role: userRole });

/**
 * Sentinel thrown to force a ROLLBACK after a successful assertion: postgres.js
 * rolls a transaction back when its callback throws. We catch the sentinel and
 * return the value the callback produced.
 */
export class Rollback<T> {
  constructor(readonly value: T) {}
}

/** A single privileged connection (prepare:false, max:1) — matches #89. */
export function connect(): Sql {
  return postgres(url!, { prepare: false, max: 1 });
}

/**
 * Run `fn` inside a transaction under `role`, with `claims` set as
 * request.jwt.claims (pass null to set no claims — simulates a missing JWT),
 * then ALWAYS roll back. Returns fn's value.
 *
 * Under `authenticated` the RLS policy applies; under `service_role` it is
 * bypassed (BYPASSRLS) — that distinction is the whole point of the harness.
 */
export async function asRole<T>(
  sql: Sql,
  role: "authenticated" | "service_role",
  claims: string | null,
  fn: (tx: TransactionSql) => Promise<T>,
): Promise<T> {
  try {
    await sql.begin(async (tx) => {
      // `role` is a closed string-literal union — no injection surface.
      await tx.unsafe(`set local role ${role}`);
      if (claims !== null) {
        await tx`select set_config('request.jwt.claims', ${claims}, true)`;
      }
      const value = await fn(tx);
      throw new Rollback(value);
    });
    throw new Error("unreachable: transaction committed without rollback");
  } catch (err) {
    if (err instanceof Rollback) return err.value as T;
    throw err;
  }
}
