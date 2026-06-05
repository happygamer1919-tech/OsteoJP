// packages/db/seed/roles.ts
//
// Idempotent seeder for the canonical role set of a single tenant. A brand-new
// tenant needs its `roles` rows before any user can be linked — the JWT carries
// a `user_role` slug and the custom_access_token_hook resolves it against these
// rows. Without them a fresh tenant is unusable (no role to assign, login proof
// fails). This seeder fills that gap on the tenant-create path.
//
// The slug vocabulary is owned by the permission matrix (packages/auth:
// ROLES). We iterate ROLES directly and key CANONICAL_ROLES on `Role`, so the
// matrix and the seeded set CANNOT drift: add a role to the matrix and this
// file fails to compile until its name/description are supplied here.
//
// Runs with service-role credentials (RLS bypass) because seeding executes
// outside an authenticated request context. One tenant per invocation.
// Idempotent: keyed on (tenant_id, slug) with ON CONFLICT DO NOTHING, so
// re-running never duplicates and never alters an existing row.

import { ROLES, type Role } from "@osteojp/auth";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import { roles } from "../src/schema";

/* ------------------------------------------------------------------ */
/* Canonical role set                                                 */
/* ------------------------------------------------------------------ */

/**
 * Display name + description for every role in the permission matrix.
 *
 * Keyed on `Role` (from packages/auth) so it is exhaustive at compile time —
 * a new matrix role will not type-check here until its labels are added. The
 * values MUST match the role rows in `supabase/seed.sql` (the local/branch
 * demo-tenant seed) so the two paths describe the same roles.
 */
export const CANONICAL_ROLES: Record<Role, { name: string; description: string }> = {
  owner: { name: "Owner", description: "Full access across the tenant." },
  admin: { name: "Admin", description: "Tenant administration; no privilege escalation." },
  therapist: { name: "Therapist", description: "Clinical records for own patients." },
  reception: { name: "Receptionist", description: "Scheduling and invoicing; no clinical access." },
};

export type SeedRoleAction = "inserted" | "unchanged";

export type SeedRoleResult = {
  slug: Role;
  action: SeedRoleAction;
};

/* ------------------------------------------------------------------ */
/* Seeder                                                             */
/* ------------------------------------------------------------------ */

// Minimal Drizzle-pg interface — accepts any pg driver (postgres-js, node-pg,
// neon, …) so the seeder is not coupled to a specific transport. Mirrors the
// form-templates loader.
export type SeedDb = PgDatabase<PgQueryResultHKT, Record<string, never>>;

export type SeedRolesOptions = {
  /** Replace console logging (defaults to `console.log`). */
  log?: (message: string) => void;
};

/**
 * Insert the canonical role set for `tenantId`. Idempotent: existing
 * (tenant_id, slug) rows are left untouched (ON CONFLICT DO NOTHING), so
 * re-running never duplicates roles and never alters an existing tenant's
 * labels. Returns per-slug whether the row was newly inserted or already
 * present.
 *
 * `db` must be a connection that can write the role rows — on the tenant-create
 * path that is the RLS-bypassing admin handle (getDbAdmin), because a tenant
 * being created has no JWT/user context yet.
 */
export async function seedTenantRoles(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  tenantId: string,
  options: SeedRolesOptions = {},
): Promise<SeedRoleResult[]> {
  const log = options.log ?? ((m) => console.log(`[seed:roles] ${m}`));

  const values = ROLES.map((slug) => ({
    tenantId,
    slug,
    name: CANONICAL_ROLES[slug].name,
    description: CANONICAL_ROLES[slug].description,
  }));

  // Single statement: insert all four, skip any that already exist, and report
  // back the slugs that were actually written. Atomic — no read-then-write race.
  const inserted = await (db as SeedDb)
    .insert(roles)
    .values(values)
    .onConflictDoNothing({ target: [roles.tenantId, roles.slug] })
    .returning({ slug: roles.slug });

  const insertedSlugs = new Set(inserted.map((r: { slug: string }) => r.slug));

  const results: SeedRoleResult[] = ROLES.map((slug) => ({
    slug,
    action: insertedSlugs.has(slug) ? "inserted" : "unchanged",
  }));

  const counts = results.reduce(
    (acc, r) => ({ ...acc, [r.action]: acc[r.action] + 1 }),
    { inserted: 0, unchanged: 0 } as Record<SeedRoleAction, number>,
  );
  log(
    `tenant ${tenantId}: inserted=${counts.inserted} unchanged=${counts.unchanged}`,
  );

  return results;
}

/* ------------------------------------------------------------------ */
/* CLI runner — `pnpm --filter @osteojp/db run seed:roles`            */
/* ------------------------------------------------------------------ */

async function main(): Promise<void> {
  const tenantId = process.env.SEED_TENANT_ID;
  const databaseUrl = process.env.DATABASE_URL;

  if (!tenantId) {
    throw new Error(
      "SEED_TENANT_ID is required (uuid of the tenant to seed roles into)",
    );
  }
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is required (Supabase service-role connection string)",
    );
  }

  // Lazy-load the driver so importing this module as a library does not
  // trigger a connection.
  const [{ default: postgres }, { drizzle }] = await Promise.all([
    import("postgres"),
    import("drizzle-orm/postgres-js"),
  ]);

  const client = postgres(databaseUrl, { max: 1, prepare: false });
  const db = drizzle(client);

  try {
    await seedTenantRoles(db, tenantId);
  } finally {
    await client.end({ timeout: 5 });
  }
}

// Run when invoked as a script (tsx seed/roles.ts), skip on import.
const argv1 = process.argv[1] ?? "";
const isDirectInvocation =
  import.meta.url === `file://${argv1}` || argv1.endsWith("seed/roles.ts");
if (isDirectInvocation) {
  main().catch((err: unknown) => {
    console.error(`[seed:roles] failed: ${(err as Error).message ?? err}`);
    process.exit(1);
  });
}
