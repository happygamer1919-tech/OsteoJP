export * from "./src/schema";
export {
  getDbAdmin,
  withTenantContext,
  type DbTx,
  type TenantClaims,
} from "./src/client";

// Canonical-role seeder — consumed by the tenant-create path (apps/web
// lib/auth/provision.ts). The package `exports` map only exposes ".", so the
// seeder is surfaced here rather than via a deep import.
export {
  seedTenantRoles,
  CANONICAL_ROLES,
  type SeedRoleAction,
  type SeedRoleResult,
} from "./seed/roles";
