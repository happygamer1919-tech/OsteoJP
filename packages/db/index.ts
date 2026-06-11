export * from "./src/schema";
export {
  getDbAdmin,
  withTenantContext,
  withPatientContext,
  type DbTx,
  type TenantClaims,
  type PatientClaims,
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

// Shared tenant onboarding entry point — used by the staff platform and the
// superadmin app. One implementation so the tenant + roles + audit invariant
// cannot drift between callers.
export { provisionTenant, type ProvisionTenantResult } from "./src/provision";

// Data migration pipeline foundation (Phase 5) — intermediate types, staging
// + idempotency ledger, importer, and the unimplemented Fisiozero adapter seam.
export * from "./src/migration";
