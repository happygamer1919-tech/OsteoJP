// packages/db/src/client.ts
//
// The ONE way the OsteoJP app talks to the database.
//
// Why this file exists
//   We query through postgres.js + drizzle, not the Supabase JS client, so we
//   are responsible for telling Postgres what tenant + role the request is
//   running as. RLS reads auth.jwt() to enforce isolation; if no claims are
//   set the helpers in 0001_rls.sql return NULL and every policy resolves to
//   FALSE (fail-closed). withTenantContext below is what wires those claims
//   in, transaction-locally, so RLS sees them.

import { sql, type ExtractTablesWithRelations } from "drizzle-orm";
import {
  drizzle,
  type PostgresJsDatabase,
  type PostgresJsTransaction,
} from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Db = PostgresJsDatabase<typeof schema>;

/* ================================================================== */
/* Lazy singleton                                                     */
/* ================================================================== */
//
// No connection is opened until the first query — DATABASE_URL is only
// required at first use, not at import time. Lets tooling (drizzle-kit,
// codegen, tests that don't touch the DB) import this module safely.

let _client: ReturnType<typeof postgres> | undefined;
let _db: Db | undefined;

function getDb(): Db {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "@osteojp/db: DATABASE_URL is not set. The client connects lazily; " +
        "set DATABASE_URL before the first query.",
    );
  }
  // ==================================================================
  // `max: 6`, AND THE NUMBER IS DERIVED RATHER THAN CHOSEN. PERF-05/06.
  // ==================================================================
  // THIS POOL IS PER *INSTANCE*, NOT PER REQUEST, AND THAT IS WHAT CHANGED.
  // `max: 2` was correct for per-invocation serverless, where one invocation
  // owns its instance and two connections are two connections. Under FLUID
  // COMPUTE one instance serves MANY CONCURRENT INVOCATIONS, and every one of
  // them shares this singleton. Two connections then serve the whole instance,
  // so concurrency queues here rather than at the pooler - and the queue is
  // invisible, because it is inside the process.
  //
  // MEASURED, not argued. /patients with the shipped RLS policies transcribed
  // into a disposable shim, one instance, `max: 2`: p75 1.5 s at 1 concurrent
  // render, 9.6 s at 10, 19.8 s at 20, 54.1 s at 60. Linear in concurrency,
  // zero errors. Production reported a p75 of 59 s on this route.
  //
  // THE BOUND, and both halves bind:
  //   N x max <= 15   N is the warm instance count, derived at 1-2 from
  //                   1.9K invocations / 12h at 0.27 mean concurrency and
  //                   0.25% CPU utilisation (docs/audit/PERF-06-RLS.md S2).
  //   max    <= 15    Supavisor's own pool size, per user+db pair.
  // At N = 2, `max: 6` puts 12 clients on 15 slots. At N = 1 it puts 6, which
  // leaves room for a second instance to appear without oversubscribing.
  //
  // WHY NOT HIGHER. At 20 concurrent renders: max 2 -> 19.8 s, max 4 -> 10.0 s,
  // max 8 -> 7.5 s, max 15 -> 7.1 s. The curve flattens above 8 because the
  // DATABASE CPU becomes the limit, which is SR-20's finding one layer down.
  // Six is on the steep part of the curve and inside the bound.
  //
  // SR-20 IS UNTOUCHED. That ruling governs Supavisor's `pool_size`, a console
  // setting. This is the application's own client pool and is a different knob.
  _client = postgres(url, { prepare: false, max: 6, idle_timeout: 20, connect_timeout: 10 });
  _db = drizzle(_client, { schema });
  return _db;
}

/**
 * Lazy accessor for the drizzle handle that BYPASSES per-request claims —
 * no SET ROLE, no JWT claim injection. Connects as the owning role (e.g.
 * supabase_admin / postgres), which has BYPASSRLS, so policies do not apply
 * to queries issued through it.
 *
 * Use ONLY for:
 *   - migrations,
 *   - admin tooling that intentionally crosses tenant boundaries,
 *   - background jobs that scope tenant_id explicitly in their WHERE clauses.
 *
 * NEVER use for tenant-scoped request handling. Request paths go through
 * withTenantContext below.
 *
 * Returned as a function (not a Proxy) because drizzle's database object
 * relies on private (#) fields whose access semantics break under Proxy
 * forwarding — `dbAdmin.select()` would throw at runtime. Call getDbAdmin()
 * at the use site instead.
 */
export function getDbAdmin(): Db {
  return getDb();
}

/* ================================================================== */
/* Per-request tenant context                                         */
/* ================================================================== */

export type TenantClaims = {
  tenant_id: string;
  user_role: string;
  /** Forwarded as the JWT `sub` claim so auth.uid() resolves inside
   * withTenantContext — required by RLS policies that check auth.uid(). */
  sub?: string;
};

/**
 * Drizzle transaction bound to our schema — callers get full inference
 * (tx.select().from(schema.patients), tx.insert(schema.appointments), ...).
 */
export type DbTx = PostgresJsTransaction<
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

/**
 * Default path for ALL tenant-scoped queries.
 *
 * Opens a transaction and, in order:
 *   1. `set local role authenticated` — drops to the role Supabase uses for
 *      authenticated PostgREST requests. The owning role (supabase_admin /
 *      postgres) has BYPASSRLS, so this role-drop is what makes the policies
 *      in 0001_rls.sql actually enforce.
 *   2. `select set_config('request.jwt.claims', $claims, true)` — sets the
 *      claims transaction-locally so auth.jwt() / public.jwt_tenant_id() /
 *      public.jwt_role() resolve correctly for every statement inside fn.
 *      Claims JSON is passed as a BOUND parameter, never string-interpolated.
 *   3. fn(tx) runs with a drizzle tx bound to the same connection.
 *
 * Role and claims reset automatically on commit/rollback because both use
 * SET LOCAL / set_config(..., true).
 *
 * VERIFICATION: enforcement also depends on the `authenticated` role
 * holding the right table GRANTs. Confirm against the live DB with a
 * deliberate cross-tenant query — it MUST return zero rows — before
 * trusting this in any production path.
 */
export async function withTenantContext<T>(
  claims: TenantClaims,
  fn: (tx: DbTx) => Promise<T>,
): Promise<T> {
  const claimsJson = JSON.stringify(claims);
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`set local role authenticated`);
    await tx.execute(
      sql`select set_config('request.jwt.claims', ${claimsJson}, true)`,
    );
    return fn(tx);
  });
}

/* ================================================================== */
/* Per-request PATIENT context (patient-portal self-scope)            */
/* ================================================================== */

export type PatientClaims = {
  tenant_id: string;
  /** The patient's own id — the self-scope key. RLS reads it via
   * public.jwt_patient_id(); policies confine the row set to this patient. */
  patient_id: string;
};

/**
 * Patient-portal counterpart to withTenantContext. The DISTINCT trust boundary:
 *
 *   1. `set local role patient` — drops to the dedicated, login-less `patient`
 *      role (created in 0010). Staff RLS policies target `authenticated`, so a
 *      patient connection NEVER matches them; only the `TO patient` self-scope
 *      policies apply. This is the separation that keeps a patient off the staff
 *      tenant-wide policies entirely — not a predicate bolted onto them.
 *   2. `set_config('request.jwt.claims', …)` — sets tenant_id + patient_id
 *      transaction-locally so public.jwt_patient_id()/jwt_tenant_id() resolve.
 *      Claims JSON is a BOUND parameter, never string-interpolated.
 *
 * Role + claims reset on commit/rollback (SET LOCAL / set_config(..., true)).
 *
 * IMPORTANT: patient_id MUST come from the VERIFIED principal (the JWT claim
 * resolved by the access-token hook), never from request payload — the caller in
 * the patient API derives it from the session, not the body. Passing a
 * caller-supplied patient_id here would defeat the boundary.
 */
export async function withPatientContext<T>(
  claims: PatientClaims,
  fn: (tx: DbTx) => Promise<T>,
): Promise<T> {
  const claimsJson = JSON.stringify(claims);
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`set local role patient`);
    await tx.execute(
      sql`select set_config('request.jwt.claims', ${claimsJson}, true)`,
    );
    return fn(tx);
  });
}
