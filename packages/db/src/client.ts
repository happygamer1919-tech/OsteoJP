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
  _client = postgres(url);
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
